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
    if (!confirm("Очистить меню?")) return;
    menuItems = [];
    saveMenu(menuItems);
    render();
  });
}

function addRecipeToMenu(recipeId) {
  const recipe = recipes.find(r => r.id === recipeId);
  if (!recipe) return;

  const defaultServings = parseServings(recipe.servings) || 1;
  const existing = menuItems.find(i => i.recipeId === recipeId);

  if (existing) existing.servings += defaultServings;
  else menuItems.push({ recipeId, servings: defaultServings });

  saveMenu(menuItems);
  updateMenuBadge();
  if (activeView === "menu") renderMenuView();
}

function removeRecipeFromMenu(recipeId) {
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

function renderShoppingList(shopping) {
  const wrap = el("shoppingList");
  wrap.innerHTML = "";

  const groups = new Map();
  shopping.forEach(entry => {
    const category = entry.product ? entry.product.category : "Нет в базе продуктов";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(entry);
  });

  const order = [...PRODUCT_CATEGORIES, "Нет в базе продуктов"];
  const sortedGroups = [...groups.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));

  sortedGroups.forEach(([category, entries]) => {
    const group = document.createElement("div");
    group.className = "shopping-group";

    const heading = document.createElement("h4");
    heading.textContent = category;
    group.appendChild(heading);

    const ul = document.createElement("ul");
    entries
      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
      .forEach(entry => {
        const li = document.createElement("li");
        const label = document.createElement("label");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";

        const name = document.createElement("span");
        name.className = "shopping-name";
        name.textContent = entry.name;

        const amount = document.createElement("span");
        amount.className = "shopping-amount";
        amount.textContent = entry.grams > 0
          ? formatQuantity(entry.product, entry.grams)
          : "по вкусу";
        if (entry.grams - entry.netGrams > 0.5) {
          amount.title = `С запасом на очистку. Чистого веса нужно ${formatQuantity(entry.product, entry.netGrams)}.`;
          amount.textContent += " *";
        }

        label.append(checkbox, name, amount);
        li.appendChild(label);
        ul.appendChild(li);
      });

    group.appendChild(ul);
    wrap.appendChild(group);
  });

  const unknown = shopping.filter(e => !e.product).length;
  el("shoppingHint").textContent = unknown > 0
    ? `${unknown} ${plural(unknown, "позиции нет", "позиций нет", "позиций нет")} в базе продуктов — ` +
      "их количество посчитано по общим нормам единиц, а БЖУ в итогах не учтены."
    : "Количества суммированы по всем блюдам меню и пересчитаны под указанное число порций.";
  if (shopping.some(e => e.grams - e.netGrams > 0.5)) {
    el("shoppingHint").textContent += " * — вес до очистки: с запасом на отходы (картофель, морковь, рыба и т. п.).";
  }
}
