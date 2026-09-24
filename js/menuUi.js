// Раздел «Меню»: набор блюд с нужным числом порций, сводные БЖУ за день
// и список покупок.
//
// Рецепт пересчитывается пропорционально: коэффициент = сколько порций нужно
// делить на то, сколько порций указано в рецепте. Ингредиенты суммируются
// в граммах по названию продукта, а показываются в привычной мере —
// штуках, литрах, килограммах (см. formatQuantity в nutrition.js).

let menuItems = loadMenu();

function initMenuUi() {
  el("menuAddBtn").addEventListener("click", () => {
    const id = el("menuRecipeSelect").value;
    if (id) addRecipeToMenu(id);
  });

  el("printMenuBtn").addEventListener("click", () => window.print());

  el("clearMenuBtn").addEventListener("click", () => {
    if (menuItems.length === 0) return;
    if (!confirm("Очистить меню? Отметки «куплено» тоже снимутся.")) return;
    menuItems.forEach(i => addTombstone("menu:" + i.recipeId));
    menuItems = [];
    saveMenu(menuItems);
    const planner = loadSection("planner");
    planner.checked = {};
    saveSection("planner", planner);
    render();
  });

  el("resetShoppingBtn").addEventListener("click", () => {
    const planner = loadSection("planner");
    if (!Object.keys(planner.checked).length) return;
    if (!confirm("Снять все отметки «куплено»?")) return;
    planner.checked = {};
    saveSection("planner", planner);
    renderMenuView();
  });

  el("templateForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = el("templateName").value.trim();
    if (!name) return el("templateName").focus();
    if (!menuItems.length) {
      alert("Меню пустое — сначала добавьте блюда.");
      return;
    }
    const planner = loadSection("planner");
    planner.templates.push({ id: newId("tpl"), name, items: menuItems.map(i => ({ ...i })) });
    saveSection("planner", planner);
    el("templateName").value = "";
    renderTemplates();
  });
  el("templateList").addEventListener("click", onTemplateAction);
}

function addRecipeToMenu(recipeId) {
  const recipe = recipes.find(r => r.id === recipeId);
  if (!recipe) return;

  const defaultServings = parseServings(recipe.servings) || 1;
  const existing = menuItems.find(i => i.recipeId === recipeId);

  clearTombstone("menu:" + recipeId);
  if (existing) existing.servings += defaultServings;
  else menuItems.push({ recipeId, servings: defaultServings });

  saveMenu(menuItems);
  updateMenuBadge();
  if (activeView === "menu") renderMenuView();
}

function removeRecipeFromMenu(recipeId) {
  addTombstone("menu:" + recipeId);
  menuItems = menuItems.filter(i => i.recipeId !== recipeId);
  saveMenu(menuItems);
}

function updateMenuBadge() {
  const btn = el("appNav").querySelector('[data-view="menu"]');
  const count = menuItems.filter(i => recipes.some(r => r.id === i.recipeId)).length;
  btn.textContent = "Меню";
  if (count > 0) {
    const badge = document.createElement("span");
    badge.className = "nav-badge";
    badge.textContent = count;
    btn.append(" ", badge);
  }
}

// Собирает расчёт по всему меню: строки блюд, итоги дня и список покупок.
function calcMenu() {
  const items = [];
  const day = { kcal: 0, protein: 0, fat: 0, carbs: 0, gl: 0 };
  let carbsWithGi = 0;
  let giWeightedSum = 0;
  const shopping = new Map();

  menuItems.forEach(item => {
    const recipe = recipes.find(r => r.id === item.recipeId);
    if (!recipe) return;

    const { rows, total } = calcRecipe(recipe);
    const base = parseServings(recipe.servings) || 1;
    const factor = item.servings / base;

    const scaled = {
      kcal: total.kcal * factor,
      protein: total.protein * factor,
      fat: total.fat * factor,
      carbs: total.carbs * factor,
      gl: total.gl === null ? null : total.gl * factor,
      gi: total.gi
    };

    day.kcal += scaled.kcal;
    day.protein += scaled.protein;
    day.fat += scaled.fat;
    day.carbs += scaled.carbs;
    if (scaled.gl !== null) day.gl += scaled.gl;

    const recipeCarbsWithGi = total.carbs * total.giCoverage * factor;
    if (total.gi !== null && recipeCarbsWithGi > 0) {
      carbsWithGi += recipeCarbsWithGi;
      giWeightedSum += total.gi * recipeCarbsWithGi;
    }

    (recipe.ingredients || []).forEach((ing, i) => {
      const key = ing.product;
      const product = findProduct(key);
      const entry = shopping.get(key) || {
        name: key,
        product,
        grams: 0,
        netGrams: 0,
        byTaste: false
      };
      // Покупать нужно с запасом на очистку: в рецепте чистый вес.
      const grams = rows[i].grams * factor;
      if (grams > 0) {
        entry.netGrams += grams;
        entry.grams += grossFromNet(grams, ingredientWaste(ing, product));
      } else {
        entry.byTaste = true;
      }
      shopping.set(key, entry);
    });

    items.push({ item, recipe, scaled });
  });

  day.gi = carbsWithGi > 0 ? giWeightedSum / carbsWithGi : null;

  return { items, day, shopping: [...shopping.values()] };
}

function renderMenuView() {
  updateMenuBadge();
  fillMenuRecipeSelect();

  const { items, day, shopping } = calcMenu();

  el("menuEmpty").classList.toggle("hidden", items.length > 0);
  el("menuBody").classList.toggle("hidden", items.length === 0);
  renderTemplates();
  if (items.length === 0) return;

  renderMenuItems(items, day);
  renderMenuSummary(day);
  renderShoppingList(shopping);
}

function fillMenuRecipeSelect() {
  const select = el("menuRecipeSelect");
  const current = select.value;
  select.innerHTML = "";

  [...recipes]
    .sort((a, b) => a.category.localeCompare(b.category, "ru") || a.title.localeCompare(b.title, "ru"))
    .forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = `${r.title} · ${r.category}`;
      select.appendChild(opt);
    });

  if ([...select.options].some(o => o.value === current)) select.value = current;
}

function renderMenuItems(items, day) {
  const tbody = el("menuItemsBody");
  const tfoot = el("menuItemsFoot");
  tbody.innerHTML = "";
  tfoot.innerHTML = "";

  items.forEach(({ item, recipe, scaled }) => {
    const titleBtn = document.createElement("button");
    titleBtn.type = "button";
    titleBtn.className = "link-btn";
    titleBtn.textContent = recipe.title;
    titleBtn.title = "Открыть рецепт";
    titleBtn.addEventListener("click", () => {
      selectedId = recipe.id;
      setView("recipes");
    });

    const servingsInput = document.createElement("input");
    servingsInput.type = "number";
    servingsInput.min = "0.5";
    servingsInput.step = "0.5";
    servingsInput.value = item.servings;
    servingsInput.className = "servings-input";
    servingsInput.addEventListener("change", () => {
      const value = Number(servingsInput.value);
      item.servings = value > 0 ? value : 1;
      saveMenu(menuItems);
      renderMenuView();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-icon";
    removeBtn.textContent = "✕";
    removeBtn.title = "Убрать из меню";
    removeBtn.addEventListener("click", () => {
      menuItems = menuItems.filter(i => i !== item);
      addTombstone("menu:" + item.recipeId);
      saveMenu(menuItems);
      renderMenuView();
    });

    tbody.appendChild(buildRow([
      { node: titleBtn },
      { node: servingsInput, cls: "num" },
      { text: Math.round(scaled.kcal), cls: "num" },
      { text: fmt(scaled.protein), cls: "num" },
      { text: fmt(scaled.fat), cls: "num" },
      { text: fmt(scaled.carbs), cls: "num" },
      { text: scaled.gl === null ? "—" : fmt(scaled.gl), cls: "num" },
      { node: removeBtn, cls: "actions" }
    ]));
  });

  tfoot.appendChild(buildRow([
    { text: "Итого" },
    { text: "" },
    { text: Math.round(day.kcal), cls: "num" },
    { text: fmt(day.protein), cls: "num" },
    { text: fmt(day.fat), cls: "num" },
    { text: fmt(day.carbs), cls: "num" },
    { text: fmt(day.gl), cls: "num" },
    { text: "" }
  ]));
}

function renderMenuSummary(day) {
  const wrap = el("menuSummary");
  wrap.innerHTML = "";
  wrap.appendChild(nutritionCard("Всего за день", day));

  const dayGi = day.gi === null ? null : Math.round(day.gi);
  const giCat = giCategory(dayGi);
  const giCard = document.createElement("div");
  giCard.className = "nutrition-card";
  giCard.innerHTML = `
    <div class="nutrition-card-title">Средний ГИ рациона</div>
    <div class="glycemic-value level-${giCat.level}"></div>
    <div class="glycemic-note"></div>
  `;
  giCard.querySelector(".glycemic-value").textContent = dayGi === null ? "—" : dayGi;
  giCard.querySelector(".glycemic-note").textContent = giCat.label;
  wrap.appendChild(giCard);

  const glCard = document.createElement("div");
  glCard.className = "nutrition-card";
  glCard.innerHTML = `
    <div class="nutrition-card-title">Гликемическая нагрузка за день</div>
    <div class="glycemic-value"></div>
    <div class="glycemic-note">суточная норма ориентировочно до 100</div>
  `;
  glCard.querySelector(".glycemic-value").textContent = fmt(day.gl);
  wrap.appendChild(glCard);
}

// Отделы магазина в порядке обхода: категории продуктов сводятся к отделам.
const STORE_DEPARTMENTS = [
  { name: "Овощи и фрукты", categories: ["Овощи и грибы", "Фрукты и ягоды"] },
  { name: "Мясо, птица, рыба", categories: ["Мясо, птица, рыба"] },
  { name: "Молочное и яйца", categories: ["Молочные и яйца"] },
  { name: "Хлеб и бакалея", categories: ["Крупы и мучное", "Бобовые", "Орехи и семена"] },
  { name: "Сладкое", categories: ["Сахар и сладости"] },
  { name: "Масла, соусы, специи", categories: ["Масла, соусы и специи"] },
  { name: "Напитки", categories: ["Напитки"] }
];
const OTHER_DEPARTMENT = "Прочее (нет в базе продуктов)";

function departmentOf(product) {
  if (!product) return OTHER_DEPARTMENT;
  const dep = STORE_DEPARTMENTS.find(d => d.categories.includes(product.category));
  return dep ? dep.name : OTHER_DEPARTMENT;
}

function renderShoppingList(shopping) {
  const wrap = el("shoppingList");
  wrap.innerHTML = "";
  const planner = loadSection("planner");
  const pantry = new Set(planner.pantry || []);
  // Воду покупать не нужно — в список её не выводим.
  const toBuy = shopping.filter(e => !pantry.has(e.name) && !/^вода$/i.test(e.name));

  const groups = new Map();
  toBuy.forEach(entry => {
    const dep = departmentOf(entry.product);
    if (!groups.has(dep)) groups.set(dep, []);
    groups.get(dep).push(entry);
  });
  const order = [...STORE_DEPARTMENTS.map(d => d.name), OTHER_DEPARTMENT];

  [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).forEach(([dep, entries]) => {
    const group = document.createElement("div");
    group.className = "shopping-group";
    const heading = document.createElement("h4");
    heading.textContent = dep;
    group.appendChild(heading);

    const ul = document.createElement("ul");
    // Купленное — вниз группы, чтобы перед глазами было то, что осталось.
    entries.sort((a, b) => (Boolean(planner.checked[a.name]) - Boolean(planner.checked[b.name])) || a.name.localeCompare(b.name, "ru"))
      .forEach(entry => {
        const li = document.createElement("li");
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(planner.checked[entry.name]);
        checkbox.addEventListener("change", () => {
          // На месте, без перерисовки: строка не уезжает из-под пальца.
          li.classList.toggle("bought", checkbox.checked);
          setShoppingChecked(entry.name, checkbox.checked);
        });

        const name = document.createElement("span");
        name.className = "shopping-name";
        name.textContent = entry.name;

        const amount = document.createElement("span");
        amount.className = "shopping-amount";
        amount.textContent = entry.grams > 0 ? formatQuantity(entry.product, entry.grams) : "по вкусу";
        if (entry.grams - entry.netGrams > 0.5) {
          amount.title = `С запасом на очистку. Чистого веса нужно ${formatQuantity(entry.product, entry.netGrams)}.`;
          amount.textContent += " *";
        }
        label.append(checkbox, name, amount);

        const home = document.createElement("button");
        home.type = "button";
        home.className = "btn-icon pantry-btn";
        home.textContent = "🏠";
        home.title = "Есть дома — убрать из списка";
        home.setAttribute("aria-label", `${entry.name}: есть дома, не покупать`);
        home.addEventListener("click", () => togglePantry(entry.name, true));

        li.append(label, home);
        if (checkbox.checked) li.classList.add("bought");
        ul.appendChild(li);
      });
    group.appendChild(ul);
    wrap.appendChild(group);
  });

  renderPantry(shopping, pantry);

  const unknown = toBuy.filter(e => !e.product).length;
  el("shoppingHint").textContent = unknown > 0
    ? `${unknown} ${plural(unknown, "позиции нет", "позиций нет", "позиций нет")} в базе продуктов — ` +
      "их количество посчитано по общим нормам единиц, а БЖУ в итогах не учтены."
    : "Количества суммированы по всем блюдам меню и пересчитаны под указанное число порций.";
  if (toBuy.some(e => e.grams - e.netGrams > 0.5)) {
    el("shoppingHint").textContent += " * — вес до очистки: с запасом на отходы (картофель, морковь, рыба и т. п.).";
  }
}

function renderPantry(shopping, pantry) {
  const block = el("pantryBlock");
  const list = el("pantryList");
  list.innerHTML = "";
  const inMenu = shopping.filter(e => pantry.has(e.name)).map(e => e.name);
  const other = [...pantry].filter(n => !inMenu.includes(n));
  el("pantrySummary").textContent = `Есть дома (${pantry.size})` + (inMenu.length ? ` — в этом меню не покупать: ${inMenu.length}` : "");
  block.classList.toggle("hidden", pantry.size === 0);
  [...inMenu, ...other].forEach(name => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (inMenu.includes(name) ? " active" : "");
    chip.textContent = name + " ✕";
    chip.title = "Закончилось — вернуть в список покупок";
    chip.setAttribute("aria-label", `${name}: закончилось, вернуть в список`);
    chip.addEventListener("click", () => togglePantry(name, false));
    list.appendChild(chip);
  });
}

function setShoppingChecked(name, checked) {
  const planner = loadSection("planner");
  if (checked) planner.checked[name] = true;
  else delete planner.checked[name];
  saveSection("planner", planner);
}

function togglePantry(name, add) {
  const planner = loadSection("planner");
  const set = new Set(planner.pantry || []);
  if (add) set.add(name);
  else set.delete(name);
  planner.pantry = [...set].sort((a, b) => a.localeCompare(b, "ru"));
  delete planner.checked[name];
  saveSection("planner", planner);
  renderMenuView();
}

// --- Шаблоны меню ---

function renderTemplates() {
  const list = el("templateList");
  const { templates } = loadSection("planner");
  list.innerHTML = templates.length ? templates.map(t => {
    const names = t.items.map(i => (recipes.find(r => r.id === i.recipeId) || {}).title).filter(Boolean);
    return `<li class="bottle">
      <div class="bottle-main">
        <span class="bottle-title">${esc(t.name)}</span>
        <div class="bottle-facts">${esc(names.join(", ") || "рецепты удалены")}</div>
      </div>
      <div class="bottle-actions">
        <button type="button" class="btn btn-secondary btn-small" data-tpl="load" data-id="${t.id}">Заменить меню</button>
        <button type="button" class="btn btn-secondary btn-small" data-tpl="add" data-id="${t.id}">Добавить к меню</button>
        <button type="button" class="btn-icon" data-tpl="del" data-id="${t.id}" aria-label="Удалить шаблон «${esc(t.name)}»">✕</button>
      </div>
    </li>`;
  }).join("") : `<li class="hint">Шаблонов пока нет.</li>`;
}

function onTemplateAction(e) {
  const btn = e.target.closest("[data-tpl]");
  if (!btn) return;
  const planner = loadSection("planner");
  const t = planner.templates.find(x => x.id === btn.dataset.id);
  if (!t) return;
  const valid = t.items.filter(i => recipes.some(r => r.id === i.recipeId));
  if (btn.dataset.tpl === "del") {
    if (!confirm(`Удалить шаблон «${t.name}»?`)) return;
    planner.templates = planner.templates.filter(x => x.id !== t.id);
    addTombstone(t.id);
    saveSection("planner", planner);
  } else if (!valid.length) {
    alert(`Все рецепты шаблона «${t.name}» удалены из книги — загружать нечего.`);
    return;
  } else if (btn.dataset.tpl === "load") {
    if (menuItems.length && !confirm(`Заменить текущее меню шаблоном «${t.name}»?`)) return;
    menuItems.filter(m => !valid.some(i => i.recipeId === m.recipeId)).forEach(m => addTombstone("menu:" + m.recipeId));
    valid.forEach(i => clearTombstone("menu:" + i.recipeId));
    menuItems = valid.map(i => ({ ...i }));
    saveMenu(menuItems);
    planner.checked = {};
    saveSection("planner", planner);
    if (valid.length < t.items.length) alert(`Пропущено удалённых рецептов: ${t.items.length - valid.length}.`);
  } else {
    valid.forEach(i => {
      clearTombstone("menu:" + i.recipeId);
      const existing = menuItems.find(m => m.recipeId === i.recipeId);
      if (existing) existing.servings += i.servings;
      else menuItems.push({ ...i });
    });
    saveMenu(menuItems);
  }
  renderMenuView();
}
