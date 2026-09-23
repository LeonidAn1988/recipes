// Раздел «Рецепты»: список с поиском и фильтрами, детальный просмотр
// с расчётом БЖУ/ГИ и форма добавления-редактирования.

let activeCategory = "all";
let activeTags = new Set();
let searchQuery = "";
let kcalMin = null;
let kcalMax = null;

// Быстрые диапазоны калорийности порции — чтобы на телефоне не набирать числа.
const KCAL_PRESETS = [
  { label: "до 300", min: null, max: 300 },
  { label: "300–500", min: 300, max: 500 },
  { label: "500+", min: 500, max: null }
];

function initRecipesUi() {
  el("searchInput").addEventListener("input", e => {
    searchQuery = e.target.value;
    renderRecipesView();
  });

  ["kcalMin", "kcalMax"].forEach(id => el(id).addEventListener("input", () => {
    kcalMin = readKcal("kcalMin");
    kcalMax = readKcal("kcalMax");
    renderRecipesView();
  }));

  el("addRecipeBtn").addEventListener("click", () => openRecipeModal());
  el("addIngredientBtn").addEventListener("click", () => addIngredientRow());
  el("addStepBtn").addEventListener("click", () => addStepRow());
  el("cancelModalBtn").addEventListener("click", closeRecipeModal);
  el("formImage").addEventListener("input", syncImagePreview);
  el("formTags").addEventListener("input", renderTagSuggest);
  el("printRecipeBtn").addEventListener("click", () => window.print());
  el("addToMenuBtn").addEventListener("click", () => {
    if (selectedId) addRecipeToMenu(selectedId);
  });

  el("formImageFile").addEventListener("change", e => {
    readFileAsDataUrl(e.target.files[0], dataUrl => {
      el("formImage").value = dataUrl;
      syncImagePreview();
    });
  });

  el("editRecipeBtn").addEventListener("click", () => {
    const recipe = recipes.find(r => r.id === selectedId);
    if (recipe) openRecipeModal(recipe);
  });

  el("deleteRecipeBtn").addEventListener("click", () => {
    const recipe = recipes.find(r => r.id === selectedId);
    if (!recipe) return;
    if (!confirm(`Удалить рецепт «${recipe.title}»?`)) return;
    recipes = recipes.filter(r => r.id !== selectedId);
    removeRecipeFromMenu(selectedId);
    selectedId = null;
    saveRecipes(recipes);
    render();
  });

  el("recipeForm").addEventListener("submit", handleRecipeSubmit);

  el("recipeModal").addEventListener("click", e => {
    if (e.target === el("recipeModal")) closeRecipeModal();
  });
}

// --- Список ---

function getCategories() {
  return [...new Set(recipes.map(r => r.category))].sort((a, b) => a.localeCompare(b, "ru"));
}

// Все теги книги с числом рецептов, самые частые — первыми.
function getAllTags() {
  const counts = new Map();
  recipes.forEach(r => (r.tags || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
    .map(([tag, count]) => ({ tag, count }));
}

// Разбирает строку «быстро, На пару,,сладкое» в чистый список без повторов.
function parseTags(text) {
  const seen = new Set();
  return text.split(",")
    .map(t => t.trim().toLowerCase().replace(/^#/, ""))
    .filter(t => t && !seen.has(t) && seen.add(t));
}

// Ищет по названию, составу и тегам: «что приготовить из кабачков» — частый вопрос.
// Выбранные теги сужают список: рецепт должен иметь их все.
function getFilteredRecipes() {
  const q = searchQuery.trim().toLowerCase().replace(/^#/, "");
  const byKcal = kcalMin !== null || kcalMax !== null;
  return recipes.filter(r => {
    if (activeCategory !== "all" && r.category !== activeCategory) return false;
    if (byKcal && !kcalInRange(r)) return false;
    const tags = r.tags || [];
    if ([...activeTags].some(t => !tags.includes(t))) return false;
    if (!q) return true;
    if (r.title.toLowerCase().includes(q)) return true;
    if (tags.some(t => t.includes(q))) return true;
    return (r.ingredients || []).some(i => i.product.toLowerCase().includes(q));
  });
}

function readKcal(id) {
  const v = el(id).value.trim();
  return v === "" || isNaN(Number(v)) ? null : Number(v);
}

// Сравниваем с тем же округлённым числом, что видно в списке.
// Рецепт без числа порций калорийности на порцию не имеет — при включённом
// фильтре он не показывается.
function kcalInRange(recipe) {
  const perServing = calcRecipe(recipe).total.perServing;
  if (!perServing) return false;
  const kcal = Math.round(perServing.kcal);
  if (kcalMin !== null && kcal < kcalMin) return false;
  if (kcalMax !== null && kcal > kcalMax) return false;
  return true;
}

function setKcalRange(min, max) {
  kcalMin = min;
  kcalMax = max;
  el("kcalMin").value = min ?? "";
  el("kcalMax").value = max ?? "";
  renderRecipesView();
}

function renderKcalPresets() {
  const wrap = el("kcalPresets");
  wrap.innerHTML = "";
  KCAL_PRESETS.forEach(p => {
    const active = kcalMin === p.min && kcalMax === p.max;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip chip-tag" + (active ? " active" : "");
    chip.textContent = p.label;
    chip.addEventListener("click", () => active ? setKcalRange(null, null) : setKcalRange(p.min, p.max));
    wrap.appendChild(chip);
  });
  if (kcalMin !== null || kcalMax !== null) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "chip chip-reset";
    reset.textContent = "Любая";
    reset.addEventListener("click", () => setKcalRange(null, null));
    wrap.appendChild(reset);
  }
}

function toggleTagFilter(tag) {
  if (activeTags.has(tag)) activeTags.delete(tag);
  else activeTags.add(tag);
  renderRecipesView();
}

function renderTagFilters() {
  const wrap = el("tagFilters");
  wrap.innerHTML = "";
  const all = getAllTags();
  // Тег, который сняли со всех рецептов, не должен оставаться в фильтре.
  activeTags.forEach(t => { if (!all.some(x => x.tag === t)) activeTags.delete(t); });
  wrap.classList.toggle("hidden", all.length === 0);

  all.forEach(({ tag, count }) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip chip-tag" + (activeTags.has(tag) ? " active" : "");
    chip.textContent = "#" + tag;
    chip.title = `${recipeWord(count)} с тегом «${tag}»`;
    chip.addEventListener("click", () => toggleTagFilter(tag));
    wrap.appendChild(chip);
  });

  if (activeTags.size > 0) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "chip chip-reset";
    reset.textContent = "Сбросить теги";
    reset.addEventListener("click", () => {
      activeTags.clear();
      renderRecipesView();
    });
    wrap.appendChild(reset);
  }
}

function renderCategoryFilters() {
  const wrap = el("categoryFilters");
  wrap.innerHTML = "";
  ["all", ...getCategories()].forEach(cat => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (activeCategory === cat ? " active" : "");
    chip.textContent = cat === "all" ? "Все" : cat;
    chip.addEventListener("click", () => {
      activeCategory = cat;
      renderRecipesView();
    });
    wrap.appendChild(chip);
  });
}

function renderRecipeList() {
  const listEl = el("recipeList");
  listEl.innerHTML = "";

  const filtered = getFilteredRecipes();
  el("recipeListEmpty").classList.toggle("hidden", filtered.length > 0);

  filtered.forEach(recipe => {
    const { total } = calcRecipe(recipe);
    const perServing = total.perServing;

    const li = document.createElement("li");
    li.className = "recipe-item" + (recipe.id === selectedId ? " selected" : "");

    const title = document.createElement("div");
    title.className = "recipe-item-title";
    title.textContent = recipe.title;

    const meta = document.createElement("div");
    meta.className = "recipe-item-category";
    meta.textContent = perServing
      ? `${recipe.category} · ${Math.round(perServing.kcal)} ккал/порция`
      : recipe.category;

    li.append(title, meta);
    li.addEventListener("click", () => {
      selectedId = recipe.id;
      renderRecipesView();
    });
    listEl.appendChild(li);
  });
}

// --- Детальный просмотр ---

function renderNutrition(total) {
  const summaryEl = el("nutritionSummary");
  summaryEl.innerHTML = "";

  const columns = [
    { key: "perServing", label: total.servings > 0 ? `На порцию (${total.servings} шт.)` : "На порцию" },
    { key: "per100g", label: "На 100 г" },
    { key: "total", label: `Всего (${Math.round(total.grams)} г)` }
  ];

  columns.forEach(col => {
    const data = col.key === "total" ? total : total[col.key];
    if (!data) return;
    summaryEl.appendChild(nutritionCard(col.label, data));
  });

  // Категорию считаем по тому же числу, которое видит пользователь: иначе
  // на границе шкалы получается «10 — средняя» из-за скрытых десятых.
  const gi = total.gi === null ? null : Math.round(total.gi);
  const giCat = giCategory(gi);
  const giValueEl = el("giValue");
  giValueEl.textContent = gi === null ? "—" : gi;
  giValueEl.className = "glycemic-value level-" + giCat.level;

  const giNoteEl = el("giNote");
  if (gi === null) {
    giNoteEl.textContent = "нет продуктов с известным ГИ";
  } else {
    const coverage = Math.round(total.giCoverage * 100);
    giNoteEl.textContent = coverage >= 95
      ? giCat.label
      : `${giCat.label} · рассчитан по ${coverage}% углеводов`;
  }

  const rawGl = total.perServing ? total.perServing.gl : null;
  const glPerServing = rawGl === null ? null : Math.round(rawGl * 10) / 10;
  const glCat = glCategory(glPerServing);
  const glValueEl = el("glValue");
  glValueEl.textContent = glPerServing === null ? "—" : fmt(glPerServing);
  glValueEl.className = "glycemic-value level-" + glCat.level;
  el("glNote").textContent = glPerServing === null
    ? (total.servings > 0 ? "нет данных по ГИ" : "укажите число порций")
    : glCat.label;
}

// Карточка «ккал + БЖУ» — используется и в рецепте, и в итогах меню.
function nutritionCard(label, data) {
  const card = document.createElement("div");
  card.className = "nutrition-card";
  card.innerHTML = `
    <div class="nutrition-card-title"></div>
    <div class="nutrition-kcal"></div>
    <div class="macro-row">
      <span class="macro macro-p">Б <b></b></span>
      <span class="macro macro-f">Ж <b></b></span>
      <span class="macro macro-c">У <b></b></span>
    </div>
  `;
  card.querySelector(".nutrition-card-title").textContent = label;
  card.querySelector(".nutrition-kcal").textContent = `${Math.round(data.kcal)} ккал`;
  const macros = card.querySelectorAll(".macro b");
  macros[0].textContent = `${fmt(data.protein)} г`;
  macros[1].textContent = `${fmt(data.fat)} г`;
  macros[2].textContent = `${fmt(data.carbs)} г`;
  return card;
}

function renderIngredientsTable(recipe, rows, total) {
  const tbody = el("detailIngredients");
  const tfoot = el("detailIngredientsFoot");
  tbody.innerHTML = "";
  tfoot.innerHTML = "";

  recipe.ingredients.forEach((ing, i) => {
    const r = rows[i];
    const tr = buildRow([
      { text: ing.product },
      { text: ing.unit === "по вкусу" ? "" : formatAmount(Number(ing.amount) || 0), cls: "num" },
      { text: ing.unit },
      { text: r.grams ? Math.round(r.grams) : "—", cls: "num" },
      { text: r.known ? Math.round(r.kcal) : "—", cls: "num" },
      { text: r.known ? fmt(r.protein) : "—", cls: "num" },
      { text: r.known ? fmt(r.fat) : "—", cls: "num" },
      { text: r.known ? fmt(r.carbs) : "—", cls: "num" },
      { text: r.gi ?? "—", cls: "num" }
    ]);
    if (!r.known) {
      tr.className = "row-unknown";
      tr.title = "Продукта нет в базе — БЖУ и ГИ не учитываются. Добавьте его в разделе «Продукты».";
    }
    tbody.appendChild(tr);
  });

  tfoot.appendChild(buildRow([
    { text: "Итого" },
    { text: "" },
    { text: "" },
    { text: Math.round(total.grams), cls: "num" },
    { text: Math.round(total.kcal), cls: "num" },
    { text: fmt(total.protein), cls: "num" },
    { text: fmt(total.fat), cls: "num" },
    { text: fmt(total.carbs), cls: "num" },
    { text: total.gi === null ? "—" : Math.round(total.gi), cls: "num" }
  ]));
}

function renderSteps(recipe) {
  const stepsEl = el("detailSteps");
  stepsEl.innerHTML = "";

  (recipe.steps || []).forEach(step => {
    const li = document.createElement("li");
    li.className = "step-item";

    const text = document.createElement("div");
    text.textContent = step.text;
    li.appendChild(text);

    if (step.image) {
      const img = document.createElement("img");
      img.className = "step-image";
      img.src = step.image;
      img.alt = "";
      img.loading = "lazy";
      li.appendChild(img);
    }
    stepsEl.appendChild(li);
  });
}

// Превращает ссылку YouTube в embed-URL. Для остальных ссылок возвращает null,
// такие видео отдаём тегу <video>.
function youtubeEmbedUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch" && u.searchParams.get("v")) {
        return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
      }
      if (u.pathname.startsWith("/embed/") || u.pathname.startsWith("/shorts/")) {
        return `https://www.youtube.com/embed/${u.pathname.split("/")[2]}`;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function renderVideo(recipe) {
  const section = el("videoSection");
  const wrap = el("videoWrap");
  wrap.innerHTML = "";

  if (!recipe.video) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");

  const embed = youtubeEmbedUrl(recipe.video);
  if (embed) {
    const iframe = document.createElement("iframe");
    iframe.src = embed;
    iframe.allow = "accelerometer; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.loading = "lazy";
    wrap.appendChild(iframe);
  } else {
    const video = document.createElement("video");
    video.src = recipe.video;
    video.controls = true;
    wrap.appendChild(video);
  }
}

function renderDetail() {
  const recipe = recipes.find(r => r.id === selectedId);

  if (!recipe) {
    el("emptyState").classList.remove("hidden");
    el("recipeDetail").classList.add("hidden");
    return;
  }

  el("emptyState").classList.add("hidden");
  el("recipeDetail").classList.remove("hidden");

  el("detailTitle").textContent = recipe.title;
  el("detailCategory").textContent = recipe.category;

  const timeEl = el("detailTime");
  timeEl.textContent = recipe.time || "";
  timeEl.classList.toggle("hidden", !recipe.time);

  renderDetailTags(recipe);

  const servingsEl = el("detailServings");
  servingsEl.textContent = recipe.servings || "";
  servingsEl.classList.toggle("hidden", !recipe.servings);

  const imgEl = el("detailImage");
  if (recipe.image) {
    imgEl.src = recipe.image;
    imgEl.classList.remove("hidden");
  } else {
    imgEl.classList.add("hidden");
  }

  const { rows, total } = calcRecipe(recipe);
  renderNutrition(total);
  renderIngredientsTable(recipe, rows, total);
  renderSteps(recipe);
  renderVideo(recipe);
  renderYield(recipe);
}

// Теги в карточке кликабельны: нажатие показывает все рецепты с этим тегом.
function renderDetailTags(recipe) {
  const wrap = el("detailTags");
  wrap.innerHTML = "";
  const tags = recipe.tags || [];
  wrap.classList.toggle("hidden", tags.length === 0);
  tags.forEach(tag => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip chip-tag" + (activeTags.has(tag) ? " active" : "");
    chip.textContent = "#" + tag;
    chip.title = "Показать все рецепты с этим тегом";
    chip.addEventListener("click", () => toggleTagFilter(tag));
    wrap.appendChild(chip);
  });
}

function renderRecipesView() {
  renderKcalPresets();
  renderCategoryFilters();
  renderTagFilters();
  renderRecipeList();
  renderDetail();
}

// --- Форма: порядок строк ---

// Ручка перетаскивания для строки формы. Работает на Pointer Events, поэтому
// одинаково мышью и пальцем; у ручки touch-action: none — пока её тянут,
// страница не прокручивается. Порядок берётся прямо из DOM при сохранении,
// так что достаточно переставить узел. У края окна список прокручивается сам.
function dragHandle(row, what, onDrop) {
  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.textContent = "⠿";
  handle.title = `Потяните, чтобы переместить ${what}`;
  handle.setAttribute("aria-hidden", "true");

  let scroller = null;
  let lastY = 0;
  let scrollTimer = null;

  function reorder(y) {
    const siblings = [...row.parentNode.children].filter(n => n !== row);
    const next = siblings.find(n => {
      const r = n.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    if (next) {
      if (row.nextElementSibling !== next) row.parentNode.insertBefore(row, next);
    } else if (row.parentNode.lastElementChild !== row) {
      row.parentNode.appendChild(row);
    }
  }

  function autoScroll() {
    if (!scroller) return;
    const r = scroller.getBoundingClientRect();
    const edge = 60;
    let dy = 0;
    if (lastY < r.top + edge) dy = -Math.ceil((r.top + edge - lastY) / 4);
    else if (lastY > r.bottom - edge) dy = Math.ceil((lastY - (r.bottom - edge)) / 4);
    if (dy !== 0) {
      scroller.scrollTop += dy;
      reorder(lastY);
    }
    scrollTimer = requestAnimationFrame(autoScroll);
  }

  // Слушаем документ, а не саму ручку: при переносе строки в DOM браузер
  // снимает захват указателя, и события ручке перестают приходить.
  function onMove(e) {
    lastY = e.clientY;
    reorder(lastY);
    e.preventDefault();
  }

  function finish() {
    row.classList.remove("dragging");
    document.body.classList.remove("is-dragging");
    cancelAnimationFrame(scrollTimer);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", finish);
    if (onDrop) onDrop();
  }

  handle.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    e.preventDefault();
    scroller = row.closest(".modal-content");
    lastY = e.clientY;
    row.classList.add("dragging");
    document.body.classList.add("is-dragging");
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
    scrollTimer = requestAnimationFrame(autoScroll);
  });

  return handle;
}

// --- Форма: ингредиенты ---

function addIngredientRow(ing = { product: "", amount: "", unit: "г" }) {
  const tr = document.createElement("tr");
  // Процент отходов, поправленный в калькуляторе выхода, в форме не виден,
  // но должен пережить сохранение рецепта.
  if (ing.waste !== undefined && ing.waste !== null) tr.dataset.waste = ing.waste;

  const productInput = document.createElement("input");
  productInput.type = "text";
  productInput.setAttribute("list", "productsList");
  productInput.className = "ing-product";
  productInput.value = ing.product;
  productInput.placeholder = "Начните вводить продукт";
  productInput.required = true;

  const amountInput = document.createElement("input");
  // Текстовое поле, а не числовое: иначе не ввести «1/2» или «½».
  amountInput.type = "text";
  amountInput.autocomplete = "off";
  amountInput.className = "ing-amount";
  amountInput.placeholder = "1/2, 1,5…";
  amountInput.value = ing.amount === "" || ing.amount === undefined ? "" : formatAmount(Number(ing.amount) || 0, false);
  amountInput.required = true;
  amountInput.addEventListener("input", () => {
    const bad = amountInput.value.trim() !== "" && isNaN(parseAmount(amountInput.value));
    amountInput.setCustomValidity(bad ? "Число или дробь: 2, 1,5, 1/2, 1 1/2" : "");
    amountInput.classList.toggle("unknown-product", bad);
  });

  const unitSelect = document.createElement("select");
  unitSelect.className = "ing-unit";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-icon";
  removeBtn.textContent = "✕";
  removeBtn.title = "Удалить ингредиент";
  removeBtn.addEventListener("click", () => tr.remove());

  // Список единиц зависит от продукта: у яйца есть «шт», у молока — «стакан».
  function refreshUnits(preferred) {
    const product = findProduct(productInput.value);
    const units = product ? getUnitsForProduct(product) : GENERIC_UNITS;
    const current = preferred || unitSelect.value;
    unitSelect.innerHTML = "";
    Object.keys(units).forEach(u => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      unitSelect.appendChild(opt);
    });
    unitSelect.value = Object.keys(units).includes(current) ? current : "г";
    productInput.classList.toggle("unknown-product", productInput.value !== "" && !product);
    productInput.title = productInput.classList.contains("unknown-product")
      ? "Продукта нет в базе — БЖУ и ГИ не посчитаются"
      : "";
  }

  productInput.addEventListener("input", () => refreshUnits());
  refreshUnits(ing.unit);

  [dragHandle(tr, "ингредиент"), productInput, amountInput, unitSelect, removeBtn].forEach(node => {
    const td = document.createElement("td");
    td.appendChild(node);
    tr.appendChild(td);
  });
  tr.firstChild.className = "drag-cell";

  el("formIngredients").appendChild(tr);
}

function collectIngredients() {
  return [...el("formIngredients").querySelectorAll("tr")].map(tr => {
    const ing = {
      product: tr.querySelector(".ing-product").value.trim(),
      amount: parseAmount(tr.querySelector(".ing-amount").value) || 0,
      unit: tr.querySelector(".ing-unit").value
    };
    if (tr.dataset.waste !== undefined) ing.waste = Number(tr.dataset.waste);
    return ing;
  }).filter(i => i.product);
}

// --- Форма: шаги ---

function addStepRow(step = { text: "", image: "" }) {
  const row = document.createElement("div");
  row.className = "step-row";

  const header = document.createElement("div");
  header.className = "step-row-header";

  const num = document.createElement("span");
  num.className = "step-number";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-icon";
  removeBtn.textContent = "✕";
  removeBtn.title = "Удалить шаг";
  removeBtn.addEventListener("click", () => {
    row.remove();
    renumberSteps();
  });

  const title = document.createElement("span");
  title.className = "step-title";
  title.append(dragHandle(row, "шаг", renumberSteps), num);

  header.append(title, removeBtn);

  const textarea = document.createElement("textarea");
  textarea.className = "step-text";
  textarea.rows = 2;
  textarea.placeholder = "Что сделать на этом шаге";
  textarea.value = step.text;
  textarea.required = true;

  const media = document.createElement("div");
  media.className = "media-input";

  const imageInput = document.createElement("input");
  imageInput.type = "url";
  imageInput.className = "step-image-url";
  imageInput.placeholder = "Фото шага: ссылка или файл";
  imageInput.value = step.image || "";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.className = "file-input";

  const preview = document.createElement("img");
  preview.className = "media-preview";
  preview.alt = "";

  function syncPreview() {
    if (imageInput.value) {
      preview.src = imageInput.value;
      preview.classList.remove("hidden");
    } else {
      preview.classList.add("hidden");
    }
  }

  fileInput.addEventListener("change", () => {
    readFileAsDataUrl(fileInput.files[0], dataUrl => {
      imageInput.value = dataUrl;
      syncPreview();
    });
  });
  imageInput.addEventListener("input", syncPreview);
  syncPreview();

  media.append(imageInput, fileInput);
  row.append(header, textarea, media, preview);
  el("formSteps").appendChild(row);
  renumberSteps();
}

function renumberSteps() {
  el("formSteps").querySelectorAll(".step-number").forEach((node, i) => {
    node.textContent = `Шаг ${i + 1}`;
  });
}

function collectSteps() {
  return [...el("formSteps").querySelectorAll(".step-row")].map(row => ({
    text: row.querySelector(".step-text").value.trim(),
    image: row.querySelector(".step-image-url").value.trim()
  })).filter(s => s.text);
}

// --- Модалка рецепта ---

function openRecipeModal(recipe) {
  const form = el("recipeForm");
  form.reset();
  el("formIngredients").innerHTML = "";
  el("formSteps").innerHTML = "";

  if (recipe) {
    el("modalTitle").textContent = "Изменить рецепт";
    el("recipeId").value = recipe.id;
    el("formTitle").value = recipe.title;
    el("formCategory").value = recipe.category;
    el("formTags").value = (recipe.tags || []).join(", ");
    el("formTime").value = recipe.time || "";
    el("formServings").value = recipe.servings || "";
    el("formImage").value = recipe.image || "";
    el("formVideo").value = recipe.video || "";

    (recipe.ingredients || []).forEach(i => addIngredientRow(i));
    (recipe.steps || []).forEach(s => addStepRow(s));
  } else {
    el("modalTitle").textContent = "Новый рецепт";
    el("recipeId").value = "";
    addIngredientRow();
    addStepRow();
  }

  syncImagePreview();
  renderTagSuggest();
  el("recipeModal").classList.remove("hidden");
}

function syncImagePreview() {
  const url = el("formImage").value;
  const preview = el("formImagePreview");
  if (url) {
    preview.src = url;
    preview.classList.remove("hidden");
  } else {
    preview.classList.add("hidden");
  }
}

// Под полем тегов — уже используемые теги: нажатие добавляет или убирает тег,
// чтобы не плодить «на пару» и «напару».
function renderTagSuggest() {
  const wrap = el("formTagSuggest");
  wrap.innerHTML = "";
  const current = parseTags(el("formTags").value);
  getAllTags().forEach(({ tag }) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip chip-tag" + (current.includes(tag) ? " active" : "");
    chip.textContent = "#" + tag;
    chip.addEventListener("click", () => {
      const list = parseTags(el("formTags").value);
      const next = list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag];
      el("formTags").value = next.join(", ");
      renderTagSuggest();
    });
    wrap.appendChild(chip);
  });
}

function closeRecipeModal() {
  el("recipeModal").classList.add("hidden");
}

function handleRecipeSubmit(e) {
  e.preventDefault();

  const id = el("recipeId").value;
  const data = {
    title: el("formTitle").value.trim(),
    category: el("formCategory").value.trim(),
    tags: parseTags(el("formTags").value),
    time: el("formTime").value.trim(),
    servings: el("formServings").value.trim(),
    image: el("formImage").value.trim(),
    video: el("formVideo").value.trim(),
    ingredients: collectIngredients(),
    steps: collectSteps()
  };

  const idx = id ? recipes.findIndex(r => r.id === id) : -1;
  if (idx !== -1) {
    recipes[idx] = { ...recipes[idx], ...data };
    selectedId = id;
  } else {
    const newRecipe = { id: "r-" + Date.now(), ...data };
    recipes.push(newRecipe);
    selectedId = newRecipe.id;
  }

  saveRecipes(recipes);
  closeRecipeModal();
  render();
}
