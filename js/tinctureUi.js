// Раздел «Настойки»: журнал бутылок, рецепты настоек и калькуляторы.
// Данные — loadSection("tinctures") = { recipes, bottles }; расчёты —
// tinctureCalc.js. Раздел отрисовывается целиком при каждом показе.

const TINCTURE_UNITS = ["г", "мл", "шт", "ст.л.", "ч.л.", "по вкусу"];
const STAGE_LABELS = {
  infusing: "настаивается",
  "strain-due": "пора процедить",
  resting: "отдыхает",
  ready: "готова",
  finished: "выпита"
};

let openTinctureId = null;
let tnOnlyMine = false;
// Значения калькуляторов живут, пока открыта страница: раздел перерисовывается
// целиком, и без этого ввод сбрасывался бы после каждого действия.
const tnCalcValues = {
  diluteCalc: { volume: "1000", from: "96", to: "40" },
  mixCalc: { spiritVolume: "500", spiritAbv: "40", syrupSugar: "0", syrupWater: "0", juice: "0", berries: "0", berryJuicePercent: "50" }
};

function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function ruDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function initTincturesUi() {
  document.body.insertAdjacentHTML("beforeend", `
<div id="tinctureModal" class="modal hidden">
  <div class="modal-content">
    <h2 id="tinctureModalTitle">Рецепт настойки</h2>
    <form id="tinctureForm">
      <label>Название <input type="text" id="tnTitle" required placeholder="например, Хреновуха"></label>
      <div class="form-row">
        <label>Основа <input type="text" id="tnBase" list="tinctureBases" placeholder="водка, спирт, самогон"></label>
        <label>Крепость основы, % <input type="text" id="tnBaseAbv" inputmode="decimal" placeholder="40"></label>
        <label>Объём основы, мл <input type="text" id="tnBaseVolume" inputmode="decimal" placeholder="500"></label>
      </div>
      <fieldset class="form-block">
        <legend>Что закладываем</legend>
        <table class="form-table"><tbody id="tnIngredients"></tbody></table>
        <button type="button" id="tnAddIngredient" class="btn btn-secondary btn-small">+ Ингредиент</button>
      </fieldset>
      <div class="form-row">
        <label>Сахар, г <input type="text" id="tnSugar" inputmode="decimal" placeholder="0"></label>
        <label>Настаивать, дней <input type="text" id="tnInfuse" inputmode="numeric" placeholder="14"></label>
        <label>Отдых после процеживания, дней <input type="text" id="tnRest" inputmode="numeric" placeholder="7"></label>
      </div>
      <label>Как готовить <textarea id="tnSteps" rows="4" placeholder="По шагам: что нарезать, где настаивать, как процедить"></textarea></label>
      <label>Заметки <textarea id="tnNotes" rows="2" placeholder="Вкус, что поменять в следующий раз"></textarea></label>
      <label>Видео <input type="text" id="tnVideo" autocomplete="off" placeholder="Ссылка на YouTube, Rutube, VK Видео или .mp4"></label>
      <div class="modal-actions">
        <span class="spacer"></span>
        <button type="button" class="btn btn-secondary" data-close>Отмена</button>
        <button type="submit" class="btn btn-primary">Сохранить</button>
      </div>
    </form>
  </div>
</div>
<div id="bottleModal" class="modal hidden">
  <div class="modal-content modal-narrow">
    <h2 id="bottleModalTitle">Заложить бутылку</h2>
    <form id="bottleForm">
      <label>Что за настойка <input type="text" id="btTitle" required></label>
      <div class="form-row">
        <label>Дата закладки <input type="date" id="btStart" required></label>
        <label>Объём, мл <input type="text" id="btVolume" inputmode="decimal"></label>
        <label>Крепость, % <input type="text" id="btAbv" inputmode="decimal"></label>
      </div>
      <div class="form-row">
        <label>Настаивать, дней <input type="text" id="btInfuse" inputmode="numeric" required></label>
        <label>Отдых, дней <input type="text" id="btRest" inputmode="numeric"></label>
      </div>
      <p class="hint" id="btDates"></p>
      <label>Заметки <textarea id="btNotes" rows="2"></textarea></label>
      <div class="modal-actions">
        <span class="spacer"></span>
        <button type="button" class="btn btn-secondary" data-close>Отмена</button>
        <button type="submit" class="btn btn-primary" id="bottleSubmit">Заложить</button>
      </div>
    </form>
  </div>
</div>
<datalist id="tinctureBases"><option value="Водка"><option value="Спирт"><option value="Самогон"><option value="Коньяк"><option value="Ром"></datalist>`);

  ["tinctureModal", "bottleModal"].forEach(id => {
    const modal = el(id);
    modal.addEventListener("click", e => {
      if (e.target.hasAttribute("data-close")) closeModal(modal, true);
    });
  });
  el("tnAddIngredient").addEventListener("click", () => addTinctureIngredientRow());
  el("tinctureForm").addEventListener("submit", saveTinctureRecipe);
  el("bottleForm").addEventListener("submit", saveBottle);
  ["btStart", "btInfuse", "btRest"].forEach(id => el(id).addEventListener("input", updateBottleDates));

  // Кнопки внутри раздела — делегированием: раздел перерисовывается целиком.
  el("tincturesPage").addEventListener("click", onTincturePageClick);
  el("tincturesPage").addEventListener("input", onTincturePageInput);
}

// --- Отрисовка раздела ---

function renderTincturesView() {
  const data = loadSection("tinctures");
  const today = todayIso();
  const bottles = [...data.bottles].sort((a, b) => (a.finished - b.finished) || b.startDate.localeCompare(a.startDate));
  const due = bottles.filter(b => bottleStage(b, today) === "strain-due");
  if (!currentMember()) tnOnlyMine = false;
  const mine = currentMemberId();
  const shownRecipes = tnOnlyMine ? data.recipes.filter(r => r.createdBy === mine) : data.recipes;

  el("tincturesPage").innerHTML = `
    <div class="page-head">
      <h2>Настойки</h2>
      <div class="detail-actions">
        <button type="button" class="btn btn-secondary" data-act="new-bottle">Заложить бутылку</button>
        <button type="button" class="btn btn-primary" data-act="new-recipe">+ Рецепт настойки</button>
      </div>
    </div>
    ${due.length ? `<p class="notice notice-warn">Пора процедить: ${due.map(b => `<strong>${esc(b.title)}</strong>`).join(", ")}.</p>` : ""}

    <section class="tn-section">
      <h3>Журнал бутылок</h3>
      ${bottles.length ? `<ul class="bottle-list">${bottles.map(b => bottleItem(b, today)).join("")}</ul>`
        : `<p class="hint">Здесь будет всё, что настаивается: когда заложено, когда процедить и когда будет готово. Нажмите «Заложить бутылку» или заложите по рецепту.</p>`}
    </section>

    <section class="tn-section">
      <h3>Рецепты настоек</h3>
      <div class="chip-row section-filters" id="tnFilters"></div>
      ${shownRecipes.length ? `<ul class="tn-recipes">${shownRecipes.map(tinctureRecipeItem).join("")}</ul>`
        : `<p class="hint">${tnOnlyMine ? "Вы пока не добавили своих рецептов настоек." : "Своих рецептов пока нет. Добавьте первый — с основой, закладкой, сроками и шагами."}</p>`}
    </section>

    <section class="tn-section">
      <h3>Калькуляторы</h3>
      <div class="calc-grid">
        <form class="calc-card" id="diluteCalc" onsubmit="return false">
          <h4>Разведение спирта водой</h4>
          <div class="calc-fields">
            <label>Спирт, мл <input type="text" inputmode="decimal" name="volume" value="${esc(tnCalcValues.diluteCalc.volume)}"></label>
            <label>Его крепость, % <input type="text" inputmode="decimal" name="from" value="${esc(tnCalcValues.diluteCalc.from)}"></label>
            <label>Нужно, % <input type="text" inputmode="decimal" name="to" value="${esc(tnCalcValues.diluteCalc.to)}"></label>
          </div>
          <p class="calc-result" id="diluteResult" aria-live="polite"></p>
          <p class="hint">С учётом сжатия смеси, при 20 °C; сверено с таблицей Фертмана. Вливайте спирт в воду.</p>
        </form>
        <form class="calc-card" id="mixCalc" onsubmit="return false">
          <h4>Крепость после сиропа, сока, ягод</h4>
          <div class="calc-fields">
            <label>Основа, мл <input type="text" inputmode="decimal" name="spiritVolume" value="${esc(tnCalcValues.mixCalc.spiritVolume)}"></label>
            <label>Крепость основы, % <input type="text" inputmode="decimal" name="spiritAbv" value="${esc(tnCalcValues.mixCalc.spiritAbv)}"></label>
            <label>Сахар в сиропе, г <input type="text" inputmode="decimal" name="syrupSugar" value="${esc(tnCalcValues.mixCalc.syrupSugar)}"></label>
            <label>Вода в сиропе, мл <input type="text" inputmode="decimal" name="syrupWater" value="${esc(tnCalcValues.mixCalc.syrupWater)}"></label>
            <label>Сок или вода, мл <input type="text" inputmode="decimal" name="juice" value="${esc(tnCalcValues.mixCalc.juice)}"></label>
            <label>Ягоды, г <input type="text" inputmode="decimal" name="berries" value="${esc(tnCalcValues.mixCalc.berries)}"></label>
            <label>Ягоды отдадут сока, % <input type="text" inputmode="decimal" name="berryJuicePercent" value="${esc(tnCalcValues.mixCalc.berryJuicePercent)}"></label>
          </div>
          <p class="calc-result" id="mixResult" aria-live="polite"></p>
          <p class="hint">Оценка: сахар из сока и ягод не учитывается. Спиртомер показывает верно только в чистой водно-спиртовой смеси при 20 °C — в настойке на ягодах и в сладкой он занижает крепость.</p>
        </form>
      </div>
    </section>`;

  el("tnFilters").appendChild(mineChip(tnOnlyMine, value => {
    tnOnlyMine = value;
    renderTincturesView();
  }));
  updateDiluteCalc();
  updateMixCalc();
  mountVideos(el("tincturesPage"), id => data.recipes.find(r => r.id === id));
}

// Подставляет плееры в заготовки data-video-for после отрисовки раздела.
function mountVideos(root, findItem) {
  root.querySelectorAll("[data-video-for]").forEach(slot => {
    const item = findItem(slot.dataset.videoFor);
    const block = item && buildVideoBlock(item.video, item.title || item.product);
    if (block) slot.appendChild(block);
    else slot.remove();
  });
}

function bottleItem(b, today) {
  const stage = bottleStage(b, today);
  const { strain } = tinctureSchedule(b.startDate, b.infuseDays, b.restDays);
  const ready = bottleReadyDate(b);
  const facts = [
    b.volume ? `${formatAmount(b.volume)} мл` : "",
    b.abv ? `${formatAmount(b.abv)} %` : "",
    `заложена ${ruDate(b.startDate)}`,
    stage === "infusing" || stage === "strain-due" ? `процедить ${ruDate(strain)}` : "",
    stage !== "finished" && stage !== "ready" ? `готова ${ruDate(ready)}` : ""
  ].filter(Boolean).join(" · ");
  const actions = [
    stage === "strain-due" || stage === "infusing" ? `<button type="button" class="btn btn-secondary btn-small" data-act="strained" data-id="${b.id}">Процежена</button>` : "",
    stage !== "finished" ? `<button type="button" class="btn btn-secondary btn-small" data-act="finished" data-id="${b.id}">Выпита</button>` : "",
    `<button type="button" class="btn btn-secondary btn-small" data-act="edit-bottle" data-id="${b.id}">Изменить</button>`,
    `<button type="button" class="btn-icon" data-act="del-bottle" data-id="${b.id}" aria-label="Удалить запись" title="Удалить запись">✕</button>`
  ].join("");
  return `<li class="bottle bottle-${stage}">
    <div class="bottle-main">
      <span class="bottle-title">${esc(b.title)}</span>
      <span class="stage stage-${stage}">${STAGE_LABELS[stage]}</span>
      <div class="bottle-facts">${esc(facts)}</div>
      ${b.notes ? `<div class="bottle-notes">${esc(b.notes)}</div>` : ""}
    </div>
    <div class="bottle-actions">${actions}</div>
  </li>`;
}

function tinctureRecipeItem(r) {
  const open = openTinctureId === r.id;
  const base = [r.base, r.baseAbv ? `${formatAmount(r.baseAbv)} %` : "", r.baseVolume ? `${formatAmount(r.baseVolume)} мл` : ""].filter(Boolean).join(", ");
  const terms = [r.infuseDays ? `настаивать ${r.infuseDays} дн.` : "", r.restDays ? `отдых ${r.restDays} дн.` : ""].filter(Boolean).join(", ");
  const details = open ? `
    <div class="tn-details">
      ${(r.ingredients || []).length ? `<ul class="tn-ings">${r.ingredients.map(i =>
        `<li>${esc(i.name)} — ${i.unit === "по вкусу" ? "по вкусу" : esc(formatAmount(i.amount)) + " " + esc(i.unit)}</li>`).join("")}</ul>` : ""}
      ${r.sugar ? `<p>Сахар: ${esc(formatAmount(r.sugar))} г</p>` : ""}
      ${r.steps ? `<p class="tn-steps">${esc(r.steps)}</p>` : ""}
      ${r.notes ? `<p class="hint">${esc(r.notes)}</p>` : ""}
      ${r.video ? `<div class="tn-video" data-video-for="${r.id}"></div>` : ""}
      <div class="chip-row">
        <button type="button" class="btn btn-primary btn-small" data-act="bottle-from" data-id="${r.id}">Заложить по рецепту</button>
        <button type="button" class="btn btn-secondary btn-small" data-act="edit-recipe" data-id="${r.id}">Изменить</button>
        <button type="button" class="btn btn-danger btn-small" data-act="del-recipe" data-id="${r.id}">Удалить</button>
      </div>
    </div>` : "";
  return `<li class="tn-recipe${open ? " open" : ""}">
    <button type="button" class="tn-recipe-head" data-act="toggle-recipe" data-id="${r.id}" aria-expanded="${open}">
      <span class="tn-recipe-title">${esc(r.title)}</span>
      <span class="tn-recipe-meta">${esc([base, terms, authorName(r.createdBy) ? "добавил(а): " + authorName(r.createdBy) : ""].filter(Boolean).join(" · "))}</span>
    </button>
    ${details}
  </li>`;
}

// --- Калькуляторы ---

function formValues(form) {
  return Object.fromEntries([...form.querySelectorAll("input")].map(i => [i.name, parseAmount(i.value) || 0]));
}

function updateDiluteCalc() {
  const form = el("diluteCalc");
  if (!form) return;
  const v = formValues(form);
  const r = diluteSpirit(v.volume, v.from, v.to);
  el("diluteResult").innerHTML = r.error ? esc(r.error)
    : `Долейте <strong>${Math.round(r.water)} мл воды</strong> — получится ${Math.round(r.finalVolume)} мл крепостью ${formatAmount(v.to)} %.`;
}

function updateMixCalc() {
  const form = el("mixCalc");
  if (!form) return;
  const r = mixTincture(formValues(form));
  el("mixResult").innerHTML = r.error ? esc(r.error)
    : `Около <strong>${r.abv.toFixed(1).replace(".", ",")} %</strong>, объём ≈ ${Math.round(r.volume)} мл` +
      (r.sugarPerLiter > 0.5 ? `, сахар ≈ ${Math.round(r.sugarPerLiter)} г/л` : "") + ".";
}

function onTincturePageInput(e) {
  const form = e.target.closest("#diluteCalc, #mixCalc");
  if (!form || !e.target.name) return;
  tnCalcValues[form.id][e.target.name] = e.target.value;
  if (form.id === "diluteCalc") updateDiluteCalc();
  else updateMixCalc();
}

// --- Действия ---

function onTincturePageClick(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = btn.dataset.id;
  const data = loadSection("tinctures");

  switch (btn.dataset.act) {
    case "new-recipe": return openTinctureForm();
    case "new-bottle": return openBottleForm();
    case "toggle-recipe":
      openTinctureId = openTinctureId === id ? null : id;
      return renderTincturesView();
    case "edit-recipe": return openTinctureForm(data.recipes.find(r => r.id === id));
    case "bottle-from": return openBottleForm(data.recipes.find(r => r.id === id));
    case "del-recipe": {
      const r = data.recipes.find(x => x.id === id);
      if (!r || !confirm(`Удалить рецепт «${r.title}»? Записи в журнале бутылок останутся.`)) return;
      data.recipes = data.recipes.filter(x => x.id !== id);
      break;
    }
    case "edit-bottle": return openBottleForm(null, data.bottles.find(x => x.id === id));
    case "strained":
    case "finished": {
      const b = data.bottles.find(x => x.id === id);
      if (!b) return;
      const question = btn.dataset.act === "strained" ? `Отметить «${b.title}» процеженной сегодня?` : `Отметить «${b.title}» выпитой?`;
      if (!confirm(question)) return;
      b[btn.dataset.act] = true;
      if (btn.dataset.act === "strained") b.strainedOn = todayIso();
      b.updatedAt = new Date().toISOString();
      break;
    }
    case "del-bottle": {
      const b = data.bottles.find(x => x.id === id);
      if (!b || !confirm(`Удалить запись «${b.title}» из журнала?`)) return;
      data.bottles = data.bottles.filter(x => x.id !== id);
      break;
    }
    default: return;
  }
  saveSection("tinctures", data);
  renderTincturesView();
}

// --- Форма рецепта настойки ---

function addTinctureIngredientRow(ing = { name: "", amount: "", unit: "г" }) {
  const tr = document.createElement("tr");
  const name = document.createElement("input");
  name.type = "text";
  name.className = "tn-ing-name";
  name.placeholder = "Хрен, мёд, лимонная цедра…";
  name.value = ing.name;
  name.setAttribute("aria-label", "Ингредиент");
  const amount = document.createElement("input");
  amount.type = "text";
  amount.className = "tn-ing-amount";
  amount.placeholder = "1/2";
  amount.value = ing.amount === "" ? "" : formatAmount(Number(ing.amount) || 0, false);
  amount.setAttribute("aria-label", "Количество");
  const unit = document.createElement("select");
  unit.className = "tn-ing-unit";
  TINCTURE_UNITS.forEach(u => unit.appendChild(new Option(u, u)));
  unit.value = ing.unit || "г";
  unit.setAttribute("aria-label", "Единица");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn-icon";
  remove.textContent = "✕";
  remove.setAttribute("aria-label", "Удалить ингредиент");
  remove.addEventListener("click", () => tr.remove());
  [dragHandle(tr, "ингредиент"), name, amount, unit, remove].forEach(node => {
    const td = document.createElement("td");
    td.appendChild(node);
    tr.appendChild(td);
  });
  tr.firstChild.className = "drag-cell";
  el("tnIngredients").appendChild(tr);
}

function openTinctureForm(recipe) {
  const form = el("tinctureForm");
  form.reset();
  form.dataset.id = recipe ? recipe.id : "";
  el("tinctureModalTitle").textContent = recipe ? "Изменить рецепт настойки" : "Новый рецепт настойки";
  el("tnIngredients").innerHTML = "";
  const r = recipe || {};
  el("tnTitle").value = r.title || "";
  el("tnBase").value = r.base || "";
  el("tnBaseAbv").value = r.baseAbv ? formatAmount(r.baseAbv, false) : "";
  el("tnBaseVolume").value = r.baseVolume ? formatAmount(r.baseVolume, false) : "";
  el("tnSugar").value = r.sugar ? formatAmount(r.sugar, false) : "";
  el("tnInfuse").value = r.infuseDays ?? "";
  el("tnRest").value = r.restDays ?? "";
  el("tnSteps").value = r.steps || "";
  el("tnNotes").value = r.notes || "";
  el("tnVideo").value = r.video || "";
  (r.ingredients && r.ingredients.length ? r.ingredients : [undefined]).forEach(i => addTinctureIngredientRow(i));
  openModal(el("tinctureModal"));
}

function saveTinctureRecipe(e) {
  e.preventDefault();
  const form = el("tinctureForm");
  const num = id => parseAmount(el(id).value) || 0;
  const recipe = {
    id: form.dataset.id || newId("tn"),
    // Автор ставится только новой записи; у старых без автора он так и остаётся пустым.
    createdBy: form.dataset.id
      ? (loadSection("tinctures").recipes.find(r => r.id === form.dataset.id) || {}).createdBy || null
      : currentMemberId(),
    title: el("tnTitle").value.trim(),
    base: el("tnBase").value.trim(),
    baseAbv: num("tnBaseAbv"),
    baseVolume: num("tnBaseVolume"),
    ingredients: [...el("tnIngredients").querySelectorAll("tr")].map(tr => ({
      name: tr.querySelector(".tn-ing-name").value.trim(),
      amount: parseAmount(tr.querySelector(".tn-ing-amount").value) || 0,
      unit: tr.querySelector(".tn-ing-unit").value
    })).filter(i => i.name),
    sugar: num("tnSugar"),
    infuseDays: Math.round(num("tnInfuse")),
    restDays: Math.round(num("tnRest")),
    steps: el("tnSteps").value.trim(),
    notes: el("tnNotes").value.trim(),
    video: el("tnVideo").value.trim(),
    updatedAt: new Date().toISOString()
  };
  const data = loadSection("tinctures");
  const idx = data.recipes.findIndex(r => r.id === recipe.id);
  if (idx >= 0) data.recipes[idx] = recipe;
  else data.recipes.push(recipe);
  saveSection("tinctures", data);
  openTinctureId = recipe.id;
  closeModal(el("tinctureModal"), true);
  renderTincturesView();
}

// --- Форма бутылки ---

function openBottleForm(recipe, bottle) {
  const form = el("bottleForm");
  form.reset();
  form.dataset.recipeId = recipe ? recipe.id : (bottle && bottle.recipeId) || "";
  form.dataset.id = bottle ? bottle.id : "";
  el("bottleModalTitle").textContent = bottle ? "Изменить запись" : "Заложить бутылку";
  el("bottleSubmit").textContent = bottle ? "Сохранить" : "Заложить";
  const src = bottle || {};
  el("btTitle").value = bottle ? src.title : recipe ? recipe.title : "";
  el("btStart").value = bottle ? src.startDate : todayIso();
  const vol = bottle ? src.volume : recipe && recipe.baseVolume;
  const abv = bottle ? src.abv : recipe && recipe.baseAbv;
  el("btVolume").value = vol ? formatAmount(vol, false) : "";
  el("btAbv").value = abv ? formatAmount(abv, false) : "";
  el("btInfuse").value = bottle ? src.infuseDays : recipe ? recipe.infuseDays || "" : "";
  el("btRest").value = bottle ? src.restDays : recipe ? recipe.restDays || "" : "";
  el("btNotes").value = bottle ? src.notes || "" : "";
  updateBottleDates();
  openModal(el("bottleModal"));
}

function updateBottleDates() {
  const start = el("btStart").value;
  if (!start) {
    el("btDates").textContent = "";
    return;
  }
  const { strain, ready } = tinctureSchedule(start, parseAmount(el("btInfuse").value) || 0, parseAmount(el("btRest").value) || 0);
  el("btDates").textContent = `Процедить ${ruDate(strain)}, готова ${ruDate(ready)}.`;
}

function saveBottle(e) {
  e.preventDefault();
  const num = id => parseAmount(el(id).value) || 0;
  const form = el("bottleForm");
  const data = loadSection("tinctures");
  const fields = {
    title: el("btTitle").value.trim(),
    startDate: el("btStart").value,
    volume: num("btVolume"),
    abv: num("btAbv"),
    infuseDays: Math.round(num("btInfuse")),
    restDays: Math.round(num("btRest")),
    notes: el("btNotes").value.trim(),
    updatedAt: new Date().toISOString()
  };
  const existing = data.bottles.find(b => b.id === form.dataset.id);
  if (existing) Object.assign(existing, fields);
  else data.bottles.push({ id: newId("bt"), recipeId: form.dataset.recipeId || null, strained: false, finished: false, ...fields });
  saveSection("tinctures", data);
  closeModal(el("bottleModal"), true);
  renderTincturesView();
}
