// Каркас приложения: общее состояние, переключение разделов, выгрузка и
// загрузка книги, общие помощники. Сами разделы живут в recipesUi.js,
// productsUi.js и menuUi.js.

let recipes = loadRecipes();
let selectedId = null;
let activeView = "recipes";

function el(id) {
  return document.getElementById(id);
}

// Округляет до знака после запятой и убирает бессмысленный «.0».
function fmt(n, digits = 1) {
  if (n === null || n === undefined) return "—";
  return Number(n).toFixed(digits).replace(/\.0$/, "");
}

// Русские числительные: 1 рецепт, 2 рецепта, 5 рецептов.
function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function recipeWord(n) {
  return `${n} ${plural(n, "рецепт", "рецепта", "рецептов")}`;
}

function readFileAsDataUrl(file, callback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => callback(reader.result);
  reader.readAsDataURL(file);
}

// Строит строку таблицы из списка ячеек { text, cls }.
function buildRow(cells) {
  const tr = document.createElement("tr");
  cells.forEach(c => {
    const td = document.createElement("td");
    if (c.node) td.appendChild(c.node);
    else td.textContent = c.text;
    if (c.cls) td.className = c.cls;
    tr.appendChild(td);
  });
  return tr;
}

// --- Разделы ---

// Разделы и их отрисовка. Разделы настоек и автоклава живут в своих модулях.
const VIEWS = {
  recipes: () => renderRecipesView(),
  products: () => renderProductsView(),
  menu: () => renderMenuView(),
  tinctures: () => renderTincturesView(),
  canning: () => renderCanningView()
};

function setView(name) {
  if (!VIEWS[name]) name = "recipes";
  activeView = name;
  // Раздел и открытый рецепт переживают перезагрузку (например, когда из
  // облака пришла свежая книга) — в пределах вкладки браузера.
  try { sessionStorage.setItem("recipes.view", name); } catch {}
  Object.keys(VIEWS).forEach(v => {
    el("view-" + v).classList.toggle("hidden", v !== name);
  });
  el("appNav").querySelectorAll(".nav-btn").forEach(btn => {
    const active = btn.dataset.view === name;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-current", active ? "page" : "false");
    if (active) btn.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  render();
}

function render() {
  renderDatalists();
  VIEWS[activeView]();
}

function renderDatalists() {
  fillDatalist("productsList", PRODUCTS.map(p => p.name).sort((a, b) => a.localeCompare(b, "ru")));
  fillDatalist("productCategoriesList", PRODUCT_CATEGORIES);
  fillDatalist("recipeCategoriesList", [...new Set(recipes.map(r => r.category))].sort((a, b) => a.localeCompare(b, "ru")));
}

function fillDatalist(id, values) {
  const list = el(id);
  list.innerHTML = "";
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    list.appendChild(opt);
  });
}

// --- Экспорт / импорт ---

function handleExport() {
  downloadJson(buildExport(recipes), exportFilename());
}

function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let imported;
    try {
      imported = parseImport(String(reader.result));
    } catch (e) {
      alert("Не удалось загрузить книгу.\n\n" + e.message);
      return;
    }

    const productCount = imported.customProducts.length;
    const merge = confirm(
      `В файле: ${recipeWord(imported.recipes.length)}, ` +
      `${productCount} ${plural(productCount, "свой продукт", "своих продукта", "своих продуктов")}.\n\n` +
      `«ОК» — добавить к текущей книге (сейчас ${recipeWord(recipes.length)}).\n` +
      `«Отмена» — заменить книгу содержимым файла.`
    );

    if (!merge && !confirm(
      "Заменить книгу целиком?\n\nТекущие рецепты и свои продукты будут удалены без возможности вернуть. " +
      "Если они нужны — сначала нажмите «Экспорт»."
    )) return;

    recipes = applyImport(recipes, imported, merge ? "merge" : "replace");
    saveRecipes(recipes);

    if (!merge) {
      selectedId = null;
      saveMenu([]);
      menuItems = [];
    }

    render();
    alert(merge ? `Добавлено ${recipeWord(imported.recipes.length)}.` : "Книга заменена.");
  };
  reader.readAsText(file);
}

// --- Запуск ---

function init() {
  // Маска «листается дальше» нужна, только пока справа есть скрытые вкладки.
  const nav = el("appNav");
  const syncNavMask = () => nav.classList.toggle("nav-at-end", nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 4);
  nav.addEventListener("scroll", syncNavMask, { passive: true });
  window.addEventListener("resize", syncNavMask);
  requestAnimationFrame(syncNavMask);

  el("appNav").addEventListener("click", e => {
    const btn = e.target.closest(".nav-btn");
    if (btn) setView(btn.dataset.view);
  });

  el("exportBtn").addEventListener("click", handleExport);
  el("importBtn").addEventListener("click", () => el("importFile").click());
  el("importFile").addEventListener("change", e => {
    handleImportFile(e.target.files[0]);
    e.target.value = "";
  });

  document.addEventListener("keydown", onModalKeydown);

  initRecipesUi();
  initYieldUi();
  initProductsUi();
  initMenuUi();
  initProfilesUi();
  initTincturesUi();
  initCanningUi();
  initTimers();
  initCookMode();
  document.querySelectorAll(".modal").forEach(setupModal);

  try {
    const savedRecipe = sessionStorage.getItem("recipes.selected");
    if (savedRecipe && recipes.some(r => r.id === savedRecipe)) selectedId = savedRecipe;
    const savedView = sessionStorage.getItem("recipes.view");
    if (savedView && VIEWS[savedView] && savedView !== "recipes") {
      setView(savedView);
      return;
    }
  } catch {}
  render();
}

// --- Менеджер окон ---
//
// Все .modal — диалоги: role="dialog", фокус внутрь при открытии и обратно к
// кнопке-открывателю при закрытии, Tab не уходит под затемнение. Escape и клик
// по фону закрывают только верхнее окно, а если в форме есть несохранённые
// правки — сначала спрашивают. Кнопки «Отмена» и «Сохранить» закрывают сразу.
// Окна открываются и напрямую через classList (старый код) — это ловит
// MutationObserver.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function visibleModals() {
  return [...document.querySelectorAll(".modal:not(.hidden)")];
}

function setupModal(modal) {
  if (modal.dataset.managed) return;
  modal.dataset.managed = "1";
  const content = modal.querySelector(".modal-content");
  const title = content && content.querySelector("h2");
  if (content) {
    content.tabIndex = -1;
    content.setAttribute("role", "dialog");
    content.setAttribute("aria-modal", "true");
    if (title) {
      if (!title.id) title.id = modal.id + "Heading";
      content.setAttribute("aria-labelledby", title.id);
    }
  }
  modal.addEventListener("input", () => { modal.dataset.dirty = "1"; });
  modal.addEventListener("click", e => {
    if (e.target === modal) closeModal(modal);
  });
  let wasHidden = modal.classList.contains("hidden");
  new MutationObserver(() => {
    const hidden = modal.classList.contains("hidden");
    if (wasHidden && !hidden) {
      modal._opener = document.activeElement;
      modal.dataset.dirty = "";
      // setTimeout, а не requestAnimationFrame: rAF не срабатывает в скрытой вкладке.
      setTimeout(() => {
        const first = content && [...content.querySelectorAll(FOCUSABLE)].find(n => n.offsetParent !== null);
        (first || content).focus({ preventScroll: false });
      }, 0);
    } else if (!wasHidden && hidden && modal._opener && document.contains(modal._opener)) {
      modal._opener.focus();
    }
    wasHidden = hidden;
  }).observe(modal, { attributes: true, attributeFilter: ["class"] });
}

function openModal(modal) {
  setupModal(modal);
  modal.classList.remove("hidden");
}

// force — закрыть без вопроса (сохранили или нажали «Отмена»).
function closeModal(modal, force = false) {
  if (!force && modal.dataset.dirty && modal.querySelector("form") &&
      !confirm("Закрыть без сохранения? Введённое пропадёт.")) return;
  modal.classList.add("hidden");
}

function onModalKeydown(e) {
  const open = visibleModals();
  if (!open.length) return;
  const top = open[open.length - 1];
  if (e.key === "Escape") {
    e.preventDefault();
    closeModal(top);
    return;
  }
  if (e.key !== "Tab") return;
  const items = [...top.querySelectorAll(FOCUSABLE)].filter(n => n.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  } else if (!top.contains(document.activeElement)) {
    e.preventDefault();
    first.focus();
  }
}

function closeAnyModal() {
  visibleModals().forEach(m => closeModal(m, true));
}

document.addEventListener("DOMContentLoaded", init);
