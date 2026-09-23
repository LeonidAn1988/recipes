// Калькулятор чистого выхода в карточке рецепта.
//
// Пользователь говорит, сколько у него есть одного продукта (обычно ещё
// неочищенного — «2 кг камбалы») или сколько нужно порций. Считаем чистый
// вес после очистки, коэффициент к рецепту и пересчитываем остальные
// ингредиенты: сколько нужно чистого веса и сколько взять до очистки.
//
// Количества в рецепте — чистый вес (нетто); отходы — процент от веса до
// очистки (см. ingredientWaste в nutrition.js).

let yieldState = { recipeId: null, base: null, amount: "", unit: "1000", mode: "gross" };

function initYieldUi() {
  el("yieldBase").addEventListener("change", e => {
    yieldState.base = e.target.value;
    syncYieldControls();
    computeYield();
  });
  el("yieldAmount").addEventListener("input", e => {
    yieldState.amount = e.target.value;
    computeYield();
  });
  el("yieldUnit").addEventListener("change", e => {
    yieldState.unit = e.target.value;
    computeYield();
  });
  document.querySelectorAll('input[name="yieldState"]').forEach(radio => {
    radio.addEventListener("change", e => {
      yieldState.mode = e.target.value;
      computeYield();
    });
  });
  el("yieldWaste").addEventListener("change", e => {
    setIngredientWaste(Number(yieldState.base), e.target.value);
  });
  el("yieldToMenuBtn").addEventListener("click", addYieldToMenu);
}

function yieldRecipe() {
  return recipes.find(r => r.id === yieldState.recipeId);
}

// Вызывается из renderDetail. Состояние калькулятора сбрасывается только при
// смене рецепта — иначе любое перерисовывание списка стирало бы ввод.
function renderYield(recipe) {
  if (recipe.id !== yieldState.recipeId) {
    yieldState = { recipeId: recipe.id, base: defaultYieldBase(recipe), amount: "", unit: "1000", mode: "gross" };
  }
  fillYieldBaseOptions(recipe);
  el("yieldAmount").value = yieldState.amount;
  el("yieldUnit").value = yieldState.unit;
  document.querySelectorAll('input[name="yieldState"]').forEach(r => { r.checked = r.value === yieldState.mode; });
  syncYieldControls();
  computeYield();
}

// По умолчанию считаем от продукта с наибольшими отходами — именно его
// обычно покупают «грязным» (рыба, овощи). Если отходов нет — от порций.
function defaultYieldBase(recipe) {
  const { rows } = calcRecipe(recipe);
  let best = null;
  let bestWaste = 0;
  (recipe.ingredients || []).forEach((ing, i) => {
    const waste = ingredientWaste(ing, findProduct(ing.product));
    if (rows[i].grams > 0 && waste > bestWaste) {
      best = String(i);
      bestWaste = waste;
    }
  });
  if (best !== null) return best;
  if (parseServings(recipe.servings) > 0) return "servings";
  const first = rows.findIndex(r => r.grams > 0);
  return first === -1 ? "servings" : String(first);
}

function fillYieldBaseOptions(recipe) {
  const select = el("yieldBase");
  select.innerHTML = "";
  const { rows } = calcRecipe(recipe);
  const servings = parseServings(recipe.servings);

  if (servings > 0) {
    select.appendChild(new Option(`Порций (в рецепте ${servings})`, "servings"));
  }
  (recipe.ingredients || []).forEach((ing, i) => {
    if (rows[i].grams <= 0) return;
    select.appendChild(new Option(`${ing.product} — в рецепте ${formatQuantity(findProduct(ing.product), rows[i].grams)}`, String(i)));
  });

  if (![...select.options].some(o => o.value === yieldState.base)) {
    yieldState.base = select.options.length ? select.options[0].value : null;
  }
  select.value = yieldState.base;
  el("yieldSection").classList.toggle("hidden", select.options.length === 0);
}

function syncYieldControls() {
  const byServings = yieldState.base === "servings";
  el("yieldUnit").classList.toggle("hidden", byServings);
  el("yieldUnitServings").classList.toggle("hidden", !byServings);
  el("yieldAmount").placeholder = byServings ? "например, 10" : "например, 2";
  el("yieldDirtyWrap").classList.toggle("hidden", byServings);
}

function kg(grams) {
  if (grams >= 1000) return `${ruNum(grams / 1000, 2)} кг`;
  return `${ruNum(grams, grams < 10 ? 1 : 0)} г`;
}

function ruNum(n, digits = 1) {
  return Number(n).toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

// Количество в той мере, что и в рецепте: «3 шт (270 г)», «4,5 ст.л.».
function scaledAmountLabel(ing, factor, netGrams, product) {
  if (ing.unit === "по вкусу" || netGrams <= 0) return "по вкусу";
  if (ing.unit === "г" || ing.unit === "мл") return formatQuantity(product, netGrams);
  const amount = (Number(ing.amount) || 0) * factor;
  return `${formatAmount(amount)} ${ing.unit} (${kg(netGrams)})`;
}

function computeYield() {
  const recipe = yieldRecipe();
  const resultEl = el("yieldResult");
  if (!recipe || yieldState.base === null) {
    resultEl.classList.add("hidden");
    return;
  }

  const { rows, total } = calcRecipe(recipe);
  const servings = parseServings(recipe.servings);
  const amount = Number(yieldState.amount);
  const byServings = yieldState.base === "servings";

  let baseIndex = null;
  if (!byServings) {
    baseIndex = Number(yieldState.base);
    const ing = recipe.ingredients[baseIndex];
    el("yieldWaste").value = ingredientWaste(ing, findProduct(ing.product));
  }

  if (!(amount > 0)) {
    resultEl.classList.add("hidden");
    return;
  }

  let factor;
  let summary;
  if (byServings) {
    factor = amount / servings;
    summary = `На ${ruNum(amount)} ${plural(Math.round(amount), "порцию", "порции", "порций")} нужно в ${ruNum(factor, 2)} раза больше, чем в рецепте.`;
  } else {
    const ing = recipe.ingredients[baseIndex];
    const waste = ingredientWaste(ing, findProduct(ing.product));
    const have = amount * Number(yieldState.unit);
    const net = yieldState.mode === "gross" ? netFromGross(have, waste) : have;
    factor = net / rows[baseIndex].grams;

    summary = yieldState.mode === "gross" && waste > 0
      ? `Из ${kg(have)} после очистки (отходы ${ruNum(waste)} %) останется ${kg(net)} чистого веса. `
      : `Чистого веса — ${kg(net)}. `;
    summary += `Это в ${ruNum(factor, 2)} раза больше, чем в рецепте (${kg(rows[baseIndex].grams)}).`;
    if (servings > 0) {
      const out = servings * factor;
      summary += ` Получится около ${ruNum(out)} ${plural(Math.round(out), "порции", "порций", "порций")}.`;
    }
  }
  summary += ` Всего продуктов в блюде — ${kg(total.grams * factor)} чистого веса.`;
  el("yieldSummary").textContent = summary;

  renderYieldTable(recipe, rows, factor, baseIndex);

  const btn = el("yieldToMenuBtn");
  btn.classList.toggle("hidden", !(servings > 0));
  btn.disabled = false;
  if (servings > 0) {
    btn.textContent = `Добавить в меню: ${ruNum(Math.max(0.5, Math.round(servings * factor * 2) / 2))} порц.`;
    btn.dataset.servings = String(Math.max(0.5, Math.round(servings * factor * 2) / 2));
  }
  resultEl.classList.remove("hidden");
}

function renderYieldTable(recipe, rows, factor, baseIndex) {
  const tbody = el("yieldTable");
  tbody.innerHTML = "";

  recipe.ingredients.forEach((ing, i) => {
    const product = findProduct(ing.product);
    const net = rows[i].grams * factor;
    const waste = ingredientWaste(ing, product);

    const nameCell = document.createElement("span");
    nameCell.textContent = ing.product;
    if (i === baseIndex) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "есть";
      nameCell.append(" ", tag);
    }

    let wasteNode;
    if (net > 0) {
      wasteNode = document.createElement("span");
      wasteNode.className = "yield-waste-cell";
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "95";
      input.step = "any";
      input.inputMode = "decimal";
      input.value = waste;
      input.setAttribute("aria-label", `Отходы для «${ing.product}», %`);
      input.addEventListener("change", () => setIngredientWaste(i, input.value));
      wasteNode.append(input, " %");
    } else {
      wasteNode = document.createTextNode("—");
    }

    const grossText = net <= 0 ? "по вкусу"
      : waste > 0 ? formatQuantity(product, grossFromNet(net, waste))
      : scaledAmountLabel(ing, factor, net, product);

    const tr = buildRow([
      { node: nameCell },
      { text: scaledAmountLabel(ing, factor, net, product), cls: "num" },
      { node: wasteNode, cls: "num" },
      { text: grossText, cls: "num" + (waste > 0 ? " yield-gross" : " muted") }
    ]);
    // Подписи для карточного вида на телефоне, где шапки таблицы нет.
    ["", "чистый вес", "отходы", "взять"].forEach((label, k) => { tr.cells[k].dataset.label = label; });
    tbody.appendChild(tr);
  });
}

// Процент отходов, поправленный под свою разделку, запоминается в рецепте.
// Если он совпал с нормой продукта — поправка не нужна, убираем её.
function setIngredientWaste(index, value) {
  const recipe = yieldRecipe();
  if (!recipe) return;
  const ing = recipe.ingredients[index];
  const product = findProduct(ing.product);
  const waste = clampWaste(value);
  if (waste === clampWaste(product ? product.waste : 0)) delete ing.waste;
  else ing.waste = waste;
  saveRecipes(recipes);
  computeYield();
}

function addYieldToMenu() {
  const recipe = yieldRecipe();
  const servings = Number(el("yieldToMenuBtn").dataset.servings);
  if (!recipe || !(servings > 0)) return;

  const existing = menuItems.find(i => i.recipeId === recipe.id);
  if (existing) existing.servings += servings;
  else menuItems.push({ recipeId: recipe.id, servings });
  saveMenu(menuItems);
  updateMenuBadge();

  const btn = el("yieldToMenuBtn");
  btn.textContent = "Добавлено в меню ✓";
  btn.disabled = true;
}
