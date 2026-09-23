// Режим готовки: рецепт на весь экран, один шаг за раз, крупный текст.
// Экран не гаснет (Screen Wake Lock API), шаги листаются свайпом, кнопками
// и стрелками. Отметки ингредиентов и шагов и текущий шаг запоминаются для
// каждого рецепта на этом устройстве — уйти и вернуться можно без потерь.

const COOK_KEY = "recipes.cook";
let cook = null;        // { recipe, tab, step }
let wakeLock = null;
let cookOpener = null;

function cookStates() {
  try { return JSON.parse(localStorage.getItem(COOK_KEY) || "{}"); } catch { return {}; }
}

// Отметки ингредиентов храним по названию продукта, а не по номеру строки:
// после правки рецепта (перестановки, удаления) они не съезжают.
function cookState(recipeId) {
  const s = cookStates()[recipeId] || {};
  return { ings: (s.ings || []).filter(x => typeof x === "string"), steps: s.steps || [], step: s.step || 0, finished: Boolean(s.finished) };
}

function saveCookState(recipeId, state) {
  const all = cookStates();
  all[recipeId] = { ...state, updated: Date.now() };
  try { localStorage.setItem(COOK_KEY, JSON.stringify(all)); } catch {}
}

function resetCookState(recipeId) {
  const all = cookStates();
  delete all[recipeId];
  try { localStorage.setItem(COOK_KEY, JSON.stringify(all)); } catch {}
}

// Состояния удалённых рецептов не копим.
function pruneCookStates() {
  const all = cookStates();
  let changed = false;
  Object.keys(all).forEach(id => {
    if (!recipes.some(r => r.id === id)) { delete all[id]; changed = true; }
  });
  if (changed) try { localStorage.setItem(COOK_KEY, JSON.stringify(all)); } catch {}
}

function initCookMode() {
  pruneCookStates();
  document.body.insertAdjacentHTML("beforeend", `
<div id="cookMode" class="cook hidden" role="dialog" aria-modal="true" aria-labelledby="cookTitle">
  <header class="cook-head">
    <button type="button" class="btn-icon cook-close" data-cook="close" aria-label="Выйти из режима готовки">✕</button>
    <div class="cook-title-wrap">
      <h2 id="cookTitle"></h2>
      <span class="cook-wake" id="cookWake"></span>
    </div>
    <button type="button" class="btn btn-secondary btn-small" data-cook="reset">Снять отметки</button>
  </header>
  <div class="cook-tabs">
    <button type="button" data-cook="tab" data-tab="steps" aria-controls="cookBody">Шаги</button>
    <button type="button" data-cook="tab" data-tab="ings" aria-controls="cookBody">Ингредиенты</button>
  </div>
  <main class="cook-body" id="cookBody"></main>
  <footer class="cook-nav" id="cookNav">
    <button type="button" class="btn btn-secondary cook-prev" data-cook="prev">← Назад</button>
    <span class="cook-progress" id="cookProgress"></span>
    <button type="button" class="btn btn-primary cook-next" data-cook="next">Далее →</button>
  </footer>
</div>`);
  const root = el("cookMode");
  root.addEventListener("click", onCookClick);
  root.addEventListener("change", onCookChange);
  document.addEventListener("keydown", e => {
    if (!cook) return;
    if (e.key === "Escape") { e.preventDefault(); closeCookMode(); }
    else if (e.key === "ArrowRight" && cook.tab === "steps" && !isTyping(e) && !onLastStep()) cookGo(1);
    else if (e.key === "ArrowLeft" && cook.tab === "steps" && !isTyping(e)) cookGo(-1);
  });
  // Свайп влево/вправо по области шага.
  let startX = null;
  let startY = null;
  el("cookBody").addEventListener("pointerdown", e => { startX = e.clientX; startY = e.clientY; });
  el("cookBody").addEventListener("pointerup", e => {
    if (startX === null || !cook || cook.tab !== "steps") return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    startX = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      // На последнем шаге свайп не завершает готовку — только кнопка.
      if (dx < 0 && onLastStep()) return;
      cookGo(dx < 0 ? 1 : -1);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (cook && document.visibilityState === "visible") requestWakeLock();
  });
}

function onLastStep() {
  return cook && cook.step >= (cook.recipe.steps || []).length - 1;
}

function isTyping(e) {
  return /input|textarea|select/i.test(e.target.tagName);
}

function openCookMode(recipe) {
  let state = cookState(recipe.id);
  if (state.finished) {
    resetCookState(recipe.id);
    state = cookState(recipe.id);
  }
  cook = { recipe, tab: (recipe.steps || []).length ? "steps" : "ings", step: Math.min(state.step, Math.max(0, (recipe.steps || []).length - 1)) };
  cookOpener = document.activeElement;
  el("cookTitle").textContent = recipe.title;
  el("cookMode").classList.remove("hidden");
  document.body.classList.add("cook-open");
  // Страница под режимом недоступна для Tab и диктора (плашка таймеров — да).
  [...document.body.children].forEach(n => {
    if (n.id !== "cookMode" && n.id !== "timerBar" && n.id !== "liveAnnouncer") n.inert = true;
  });
  requestWakeLock();
  renderCook();
  setTimeout(() => el("cookMode").querySelector(".cook-close").focus(), 0);
}

function closeCookMode() {
  if (!cook) return;
  el("cookMode").classList.add("hidden");
  document.body.classList.remove("cook-open");
  [...document.body.children].forEach(n => { n.inert = false; });
  releaseWakeLock();
  cook = null;
  if (typeof renderRecipesView === "function" && activeView === "recipes") renderRecipesView();
  if (cookOpener && document.contains(cookOpener)) cookOpener.focus();
}

async function requestWakeLock() {
  const label = el("cookWake");
  if (!("wakeLock" in navigator)) {
    label.textContent = "Этот браузер не держит экран включённым — он может погаснуть";
    return;
  }
  try {
    const lock = await navigator.wakeLock.request("screen");
    // Режим могли закрыть, пока ждали разрешения, — тогда сразу отпускаем.
    if (!cook) { lock.release().catch(() => {}); return; }
    wakeLock = lock;
    label.textContent = "☀ экран не погаснет";
    wakeLock.addEventListener("release", () => { if (cook) label.textContent = ""; });
  } catch {
    label.textContent = "";
  }
}

function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

function ingredientLabel(ing) {
  if (ing.unit === "по вкусу") return "по вкусу";
  return `${formatAmount(Number(ing.amount) || 0)} ${ing.unit}`;
}

function renderCook() {
  if (!cook) return;
  const { recipe } = cook;
  const state = cookState(recipe.id);
  const steps = recipe.steps || [];
  el("cookMode").querySelectorAll("[data-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === cook.tab);
  });
  const stepsTab = el("cookMode").querySelector('[data-tab="steps"]');
  stepsTab.disabled = !steps.length;
  if (!steps.length) cook.tab = "ings";
  el("cookNav").classList.toggle("hidden", cook.tab !== "steps" || !steps.length);
  el("cookMode").querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === cook.tab)));

  if (cook.tab === "ings") {
    el("cookBody").innerHTML = `<ul class="cook-ings">${(recipe.ingredients || []).map((ing, i) => `
      <li><label class="cook-check${state.ings.includes(ing.product) ? " checked" : ""}">
        <input type="checkbox" data-ing="${esc(ing.product)}"${state.ings.includes(ing.product) ? " checked" : ""}>
        <span class="cook-ing-name">${esc(ing.product)}</span>
        <span class="cook-ing-amount">${esc(ingredientLabel(ing))}</span>
      </label></li>`).join("")}</ul>
      <p class="hint">Отмечайте, что уже взяли или добавили — отметки сохранятся.</p>`;
    return;
  }

  const step = steps[cook.step];
  if (!step) return;
  const done = state.steps.includes(cook.step);
  const mentioned = ingredientsInStep(step.text, recipe.ingredients);
  const icon = stepIcon(step);
  const line = stepMetaLine(step);
  el("cookBody").innerHTML = `
    <article class="cook-step${done ? " cook-step-done" : ""}">
      <div class="cook-step-top">
        ${icon ? `<span class="cook-icon" aria-hidden="true">${icon}</span>` : ""}
        <div>
          <div class="cook-step-num">Шаг ${cook.step + 1} из ${steps.length}${step.parallel && cook.step > 0 ? ` · одновременно с шагом ${cook.step}` : ""}</div>
          ${step.kind ? `<span class="step-kind step-kind-${step.kind}">${esc(labelOf(STEP_KINDS, step.kind))}</span>` : ""}
        </div>
      </div>
      <p class="cook-text">${esc(step.text)}</p>
      ${line ? `<p class="cook-meta">${esc(line)}</p>` : ""}
      ${mentioned.length ? `<div class="cook-needs"><div class="cook-needs-title">Нужно</div><ul class="cook-ings">${mentioned.map(i => {
        const ing = recipe.ingredients[i];
        return `<li><label class="cook-check${state.ings.includes(ing.product) ? " checked" : ""}">
          <input type="checkbox" data-ing="${esc(ing.product)}"${state.ings.includes(ing.product) ? " checked" : ""}>
          <span class="cook-ing-name">${esc(ing.product)}</span>
          <span class="cook-ing-amount">${esc(ingredientLabel(ing))}</span>
        </label></li>`;
      }).join("")}</ul></div>` : ""}
      ${step.image ? `<img class="cook-image" src="${esc(step.image)}" alt="">` : ""}
      <div class="cook-actions">
        ${stepMinutes(step) ? `<button type="button" class="btn btn-secondary cook-timer" data-cook="timer">⏱ Таймер ${stepMinutes(step)} мин</button>` : ""}
        <label class="checkbox-label cook-done"><input type="checkbox" data-stepdone${done ? " checked" : ""}> Шаг выполнен</label>
      </div>
    </article>`;
  el("cookProgress").innerHTML = steps.map((_, i) =>
    `<span class="cook-dot${i === cook.step ? " current" : ""}${state.steps.includes(i) ? " done" : ""}"></span>`).join("");
  el("cookProgress").setAttribute("aria-label", `Шаг ${cook.step + 1} из ${steps.length}`);
  el("cookNav").querySelector(".cook-prev").disabled = cook.step === 0;
  el("cookNav").querySelector(".cook-next").textContent = cook.step === steps.length - 1 ? "Завершить ✓" : "Далее →";
}

// Переход по шагам; «Далее» отмечает текущий шаг выполненным.
function cookGo(dir) {
  const steps = cook.recipe.steps || [];
  const state = cookState(cook.recipe.id);
  if (dir > 0 && !state.steps.includes(cook.step)) state.steps.push(cook.step);
  if (dir > 0 && cook.step === steps.length - 1) {
    saveCookState(cook.recipe.id, { ...state, step: cook.step, finished: true });
    closeCookMode();
    return;
  }
  cook.step = Math.min(steps.length - 1, Math.max(0, cook.step + dir));
  saveCookState(cook.recipe.id, { ...state, step: cook.step });
  renderCook();
  announce(`Шаг ${cook.step + 1} из ${steps.length}`);
}

function onCookClick(e) {
  const btn = e.target.closest("[data-cook]");
  if (!btn || !cook) return;
  switch (btn.dataset.cook) {
    case "close": return closeCookMode();
    case "prev": return cookGo(-1);
    case "next": return cookGo(1);
    case "tab":
      cook.tab = btn.dataset.tab;
      return renderCook();
    case "timer": {
      const step = cook.recipe.steps[cook.step];
      return startTimer(`${cook.recipe.title}, шаг ${cook.step + 1}`, stepMinutes(step));
    }
    case "reset":
      if (!confirm("Снять все отметки ингредиентов и шагов в этом рецепте?")) return;
      resetCookState(cook.recipe.id);
      cook.step = 0;
      return renderCook();
  }
}

// Галочки переключаем на месте, без перерисовки — фокус не теряется.
function onCookChange(e) {
  if (!cook) return;
  const state = cookState(cook.recipe.id);
  if (e.target.dataset.ing !== undefined) {
    const name = e.target.dataset.ing;
    state.ings = e.target.checked ? [...new Set([...state.ings, name])] : state.ings.filter(x => x !== name);
    el("cookMode").querySelectorAll("[data-ing]").forEach(box => {
      if (box.dataset.ing !== name) return;
      box.checked = e.target.checked;
      box.closest(".cook-check").classList.toggle("checked", e.target.checked);
    });
  } else if (e.target.hasAttribute("data-stepdone")) {
    state.steps = e.target.checked ? [...new Set([...state.steps, cook.step])] : state.steps.filter(x => x !== cook.step);
    el("cookBody").querySelector(".cook-step").classList.toggle("cook-step-done", e.target.checked);
    const dot = el("cookProgress").children[cook.step];
    if (dot) dot.classList.toggle("done", e.target.checked);
  } else {
    return;
  }
  saveCookState(cook.recipe.id, { ...state, step: cook.step });
}
