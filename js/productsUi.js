// Раздел «Продукты»: просмотр базы и редактор своих продуктов.
//
// Встроенная база неизменяема. «Изменить» у встроенного продукта открывает
// форму с его значениями и сохраняет результат как пользовательский продукт
// с тем же именем — он перекроет встроенный во всех рецептах (см. store.js).

let productSearch = "";
let productCategory = "all";
let productOnlyCustom = false;

const RESERVED_UNITS = ["г", "по вкусу"];

function initProductsUi() {
  el("productSearch").addEventListener("input", e => {
    productSearch = e.target.value;
    renderProductsView();
  });

  el("productCategoryFilter").addEventListener("change", e => {
    productCategory = e.target.value;
    renderProductsView();
  });

  el("productOnlyCustom").addEventListener("change", e => {
    productOnlyCustom = e.target.checked;
    renderProductsView();
  });

  el("addProductBtn").addEventListener("click", () => openProductModal(null));
  el("addUnitBtn").addEventListener("click", () => addUnitRow());
  el("cancelProductBtn").addEventListener("click", closeProductModal);
  el("deleteProductBtn").addEventListener("click", handleProductDelete);
  el("productForm").addEventListener("submit", handleProductSubmit);

  el("productNoGi").addEventListener("change", e => {
    const gi = el("productGi");
    gi.disabled = e.target.checked;
    if (e.target.checked) gi.value = "";
  });

  ["productProtein", "productFat", "productCarbs", "productKcal"].forEach(id => {
    el(id).addEventListener("input", syncAtwaterHint);
  });

  el("productModal").addEventListener("click", e => {
    // Клик по фону обрабатывает общий менеджер окон (app.js): форму не теряем.
  });

  fillCategoryFilter();
}

function fillCategoryFilter() {
  const select = el("productCategoryFilter");
  const current = select.value || "all";
  select.innerHTML = "";

  const categories = [...new Set([...PRODUCT_CATEGORIES, ...PRODUCTS.map(p => p.category)])];
  [["all", "Все категории"], ...categories.map(c => [c, c])].forEach(([value, label]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  });
  select.value = [...select.options].some(o => o.value === current) ? current : "all";
}

// --- Таблица ---

function getFilteredProducts() {
  const q = productSearch.trim().toLowerCase();
  return PRODUCTS
    .filter(p => {
      if (productOnlyCustom && !p.custom) return false;
      if (productCategory !== "all" && p.category !== productCategory) return false;
      return !q || p.name.toLowerCase().includes(q);
    })
    .sort((a, b) => a.category.localeCompare(b.category, "ru") || a.name.localeCompare(b.name, "ru"));
}

function renderProductsView() {
  fillCategoryFilter();

  const tbody = el("productsTableBody");
  tbody.innerHTML = "";

  const list = getFilteredProducts();
  el("productsEmpty").classList.toggle("hidden", list.length > 0);

  list.forEach(product => {
    const nameCell = document.createElement("span");
    nameCell.textContent = product.name;
    if (product.custom) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "своё";
      nameCell.append(" ", tag);
    }

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-secondary btn-small btn-inline";
    editBtn.textContent = "Изменить";
    editBtn.addEventListener("click", () => openProductModal(product));

    const ownUnits = Object.entries(product.units || {})
      .map(([u, g]) => `${u} = ${g} г`)
      .join(", ");

    tbody.appendChild(buildRow([
      { node: nameCell },
      { text: product.category, cls: "muted" },
      { text: Math.round(product.kcal), cls: "num" },
      { text: fmt(product.protein), cls: "num" },
      { text: fmt(product.fat), cls: "num" },
      { text: fmt(product.carbs), cls: "num" },
      { text: product.gi ?? "—", cls: "num" },
      { text: ownUnits || "—", cls: "muted wrap" },
      { node: editBtn, cls: "actions" }
    ]));
  });
}

// --- Модалка продукта ---

function openProductModal(product) {
  const form = el("productForm");
  form.reset();
  el("productUnits").innerHTML = "";

  const isEditingCustom = Boolean(product && product.custom);

  el("productModalTitle").textContent = !product
    ? "Новый продукт"
    : product.custom ? "Изменить продукт" : "Своя версия продукта";

  el("productOriginalName").value = isEditingCustom ? product.name : "";
  el("deleteProductBtn").classList.toggle("hidden", !isEditingCustom);

  if (product) {
    el("productName").value = product.name;
    el("productCategory").value = product.category;
    el("productProtein").value = product.protein;
    el("productFat").value = product.fat;
    el("productCarbs").value = product.carbs;
    el("productKcal").value = product.kcal;
    el("productWaste").value = product.waste || "";
    el("productGi").value = product.gi ?? "";
    el("productNoGi").checked = product.gi === null || product.gi === undefined;
    Object.entries(product.units || {}).forEach(([unit, grams]) => addUnitRow(unit, grams));
  } else {
    el("productCategory").value = PRODUCT_CATEGORIES[0];
    el("productNoGi").checked = false;
  }

  el("productGi").disabled = el("productNoGi").checked;
  syncAtwaterHint();
  el("productModal").classList.remove("hidden");
}

function closeProductModal() {
  el("productModal").classList.add("hidden");
}

function addUnitRow(unit = "", grams = "") {
  const tr = document.createElement("tr");

  const unitInput = document.createElement("input");
  unitInput.type = "text";
  unitInput.className = "unit-name";
  unitInput.placeholder = "шт, стакан, банка";
  unitInput.value = unit;

  const gramsInput = document.createElement("input");
  gramsInput.type = "number";
  gramsInput.step = "any";
  gramsInput.min = "0";
  gramsInput.className = "unit-grams";
  gramsInput.placeholder = "г";
  gramsInput.value = grams;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-icon";
  removeBtn.textContent = "✕";
  removeBtn.title = "Удалить единицу";
  removeBtn.addEventListener("click", () => tr.remove());

  [unitInput, gramsInput, removeBtn].forEach(node => {
    const td = document.createElement("td");
    td.appendChild(node);
    tr.appendChild(td);
  });

  el("productUnits").appendChild(tr);
}

// Показывает расчёт по Атуотеру рядом с введённой калорийностью: расхождение
// больше 15% обычно означает опечатку в БЖУ.
function syncAtwaterHint() {
  const p = Number(el("productProtein").value) || 0;
  const f = Number(el("productFat").value) || 0;
  const c = Number(el("productCarbs").value) || 0;
  const kcal = Number(el("productKcal").value) || 0;
  const atwater = p * 4 + f * 9 + c * 4;

  const hint = el("atwaterHint");
  if (atwater === 0) {
    hint.textContent = "По Атуотеру ккал считаются как Б×4 + Ж×9 + У×4.";
    hint.classList.remove("hint-warn");
    return;
  }

  const diff = kcal > 0 ? Math.abs(kcal - atwater) / atwater : 0;
  hint.textContent = `По Атуотеру: ${Math.round(atwater)} ккал.` +
    (kcal > 0 && diff > 0.15 ? " Заметно расходится с введённым значением — проверьте БЖУ." : "");
  hint.classList.toggle("hint-warn", kcal > 0 && diff > 0.15);
}

function collectUnits() {
  const units = {};
  const rows = [...el("productUnits").querySelectorAll("tr")];
  for (const tr of rows) {
    const name = tr.querySelector(".unit-name").value.trim();
    const grams = Number(tr.querySelector(".unit-grams").value);
    if (!name) continue;
    if (RESERVED_UNITS.includes(name)) {
      throw new Error(`Единицу «${name}» задавать не нужно — она есть у каждого продукта.`);
    }
    if (!(grams > 0)) {
      throw new Error(`Укажите вес единицы «${name}» в граммах.`);
    }
    units[name] = grams;
  }
  return units;
}

function handleProductSubmit(e) {
  e.preventDefault();

  let units;
  try {
    units = collectUnits();
  } catch (err) {
    alert(err.message);
    return;
  }

  const originalName = el("productOriginalName").value;
  const name = el("productName").value.trim();

  const product = {
    name,
    category: el("productCategory").value.trim() || PRODUCT_CATEGORIES[0],
    kcal: Number(el("productKcal").value) || 0,
    protein: Number(el("productProtein").value) || 0,
    fat: Number(el("productFat").value) || 0,
    carbs: Number(el("productCarbs").value) || 0,
    gi: el("productNoGi").checked ? null : (el("productGi").value === "" ? null : Number(el("productGi").value)),
    units
  };
  const waste = clampWaste(el("productWaste").value);
  if (waste > 0) product.waste = waste;

  // Переименование ломает связь с рецептами — предлагаем обновить их разом.
  if (originalName && originalName !== name) {
    const used = recipes.filter(r => (r.ingredients || []).some(i => i.product === originalName));
    if (used.length > 0 && confirm(
      `Продукт «${originalName}» используется в рецептах (${used.length}). ` +
      `Заменить название на «${name}» и там?`
    )) {
      used.forEach(r => r.ingredients.forEach(i => {
        if (i.product === originalName) i.product = name;
      }));
      saveRecipes(recipes);
    }
  }

  upsertCustomProduct(product, originalName);
  closeProductModal();
  render();
}

function handleProductDelete() {
  const name = el("productOriginalName").value;
  if (!name) return;

  const overridesBuiltin = BUILTIN_PRODUCTS.some(p => p.name === name);
  const used = recipes.filter(r => (r.ingredients || []).some(i => i.product === name));

  let message = `Удалить продукт «${name}» из своей базы?`;
  if (overridesBuiltin) {
    message += "\n\nВстроенный продукт с таким названием вернётся на место.";
  } else if (used.length > 0) {
    message += `\n\nОн используется в рецептах (${used.length}) — там перестанут считаться БЖУ и ГИ.`;
  }

  if (!confirm(message)) return;

  deleteCustomProduct(name);
  closeProductModal();
  render();
}
