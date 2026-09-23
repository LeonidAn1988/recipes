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
  Object.keys(VIEWS).forEach(v => {
    el("view-" + v).classList.toggle("hidden", v !== name);
  });
  el("appNav").querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === name);
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

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeAnyModal();
  });

  initRecipesUi();
  initYieldUi();
  initProductsUi();
  initMenuUi();
  initProfilesUi();
  initTincturesUi();
  initCanningUi();

  render();
}

function closeAnyModal() {
  document.querySelectorAll(".modal").forEach(m => m.classList.add("hidden"));
}

document.addEventListener("DOMContentLoaded", init);
