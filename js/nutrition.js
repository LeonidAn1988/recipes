// Расчёт пищевой ценности и гликемических показателей.
//
// Формулы:
// 1. Калорийность — общие коэффициенты Атуотера: белки 4 ккал/г, жиры 9 ккал/г,
//    углеводы 4 ккал/г. (FAO, Chapter 3: Calculation of the energy content of foods)
// 2. Гликемическая нагрузка: ГН = (ГИ × доступные углеводы, г) / 100.
//    (Salmerón et al.; Linus Pauling Institute)
// 3. ГИ смешанного блюда — средневзвешенное значение ГИ ингредиентов по их
//    вкладу в общее количество углеводов:
//    ГИ_блюда = Σ(ГИ_i × углеводы_i) / Σ(углеводы_i)
//    Учитываются только ингредиенты с известным ГИ. Это стандартная
//    аппроксимация; фактический гликемический отклик может отличаться, так как
//    жиры, белки и клетчатка в составе блюда замедляют усвоение углеводов.

const KCAL_PER_G = { protein: 4, fat: 9, carbs: 4 };

function findProduct(name) {
  return PRODUCTS.find(p => p.name === name);
}

function getUnitsForProduct(product) {
  if (!product) return { ...GENERIC_UNITS };
  const own = product.units || {};
  return {
    "г": 1,
    ...own,
    "ст.л.": own["ст.л."] ?? 15,
    "ч.л.": own["ч.л."] ?? 5,
    "щепотка": own["щепотка"] ?? 1,
    "по вкусу": 0
  };
}

// Переводит количество в указанных единицах в граммы.
function toGrams(amount, unit, product) {
  const units = getUnitsForProduct(product);
  const factor = units[unit];
  if (factor === undefined) return 0;
  return amount * factor;
}

// Считает БЖУ/ккал одного ингредиента.
function calcIngredient(ingredient) {
  const product = findProduct(ingredient.product);
  const grams = toGrams(Number(ingredient.amount) || 0, ingredient.unit, product);

  if (!product) {
    return { grams, kcal: 0, protein: 0, fat: 0, carbs: 0, gi: null, known: false };
  }

  const k = grams / 100;
  return {
    grams,
    kcal: product.kcal * k,
    protein: product.protein * k,
    fat: product.fat * k,
    carbs: product.carbs * k,
    gi: product.gi,
    known: true
  };
}

// Считает итог по рецепту: суммы БЖУ, калорийность, ГИ и ГН.
function calcRecipe(recipe) {
  const rows = (recipe.ingredients || []).map(calcIngredient);

  const total = rows.reduce((acc, r) => ({
    grams: acc.grams + r.grams,
    kcal: acc.kcal + r.kcal,
    protein: acc.protein + r.protein,
    fat: acc.fat + r.fat,
    carbs: acc.carbs + r.carbs
  }), { grams: 0, kcal: 0, protein: 0, fat: 0, carbs: 0 });

  // Калорийность по Атуотеру — как перекрёстная проверка табличных значений.
  total.kcalAtwater = total.protein * KCAL_PER_G.protein
    + total.fat * KCAL_PER_G.fat
    + total.carbs * KCAL_PER_G.carbs;

  // Средневзвешенный ГИ по вкладу углеводов.
  let carbsWithGi = 0;
  let giWeightedSum = 0;
  rows.forEach(r => {
    if (r.gi !== null && r.gi !== undefined && r.carbs > 0) {
      carbsWithGi += r.carbs;
      giWeightedSum += r.gi * r.carbs;
    }
  });

  total.gi = carbsWithGi > 0 ? giWeightedSum / carbsWithGi : null;
  // Доля углеводов, для которых ГИ известен — показатель достоверности оценки.
  total.giCoverage = total.carbs > 0 ? carbsWithGi / total.carbs : 0;
  total.gl = total.gi !== null ? (total.gi * total.carbs) / 100 : null;

  const servings = parseServings(recipe.servings);
  total.servings = servings;

  if (servings > 0) {
    total.perServing = {
      grams: total.grams / servings,
      kcal: total.kcal / servings,
      protein: total.protein / servings,
      fat: total.fat / servings,
      carbs: total.carbs / servings,
      gl: total.gl !== null ? total.gl / servings : null
    };
  }

  total.per100g = total.grams > 0 ? {
    kcal: total.kcal / total.grams * 100,
    protein: total.protein / total.grams * 100,
    fat: total.fat / total.grams * 100,
    carbs: total.carbs / total.grams * 100
  } : null;

  return { rows, total };
}

// Извлекает число порций из строки вида "4 порции" или "4".
function parseServings(servings) {
  const match = String(servings || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

// Категории ГИ: низкий ≤55, средний 56–69, высокий ≥70.
function giCategory(gi) {
  if (gi === null || gi === undefined) return { label: "—", level: "none" };
  if (gi <= 55) return { label: "низкий", level: "low" };
  if (gi <= 69) return { label: "средний", level: "medium" };
  return { label: "высокий", level: "high" };
}

// Форматирует количество для списка покупок. Граммы — единица расчёта, но
// покупать удобнее штуками и литрами, поэтому для продуктов со «шт» или «мл»
// показываем привычную меру, а граммы оставляем в скобках как справку.
function formatQuantity(product, grams) {
  if (grams <= 0) return "по вкусу";

  const round = (n, d = 1) => Number(n.toFixed(d)).toString();

  // Мелочь вроде лаврового листа весит доли грамма — округление до целых
  // превратило бы её в «0 г».
  const inGrams = grams >= 1000 ? `${round(grams / 1000, 2)} кг`
    : grams < 10 ? `${round(grams)} г`
    : `${Math.round(grams)} г`;

  const units = product ? product.units || {} : {};

  const piece = units["шт"] || units["зубчик"] || units["пучок"] || units["кусок"];
  if (piece) {
    const count = grams / piece;
    const label = units["шт"] ? "шт" : units["зубчик"] ? "зубч." : units["пучок"] ? "пучок" : "кусок";
    if (count >= 0.5) return `${round(count)} ${label} (${inGrams})`;
  }

  if (units["мл"]) {
    const ml = grams / units["мл"];
    return ml >= 1000 ? `${round(ml / 1000, 2)} л` : `${Math.round(ml)} мл`;
  }

  return inGrams;
}

// Категории ГН на порцию: низкая ≤10, средняя 11–19, высокая ≥20.
function glCategory(gl) {
  if (gl === null || gl === undefined) return { label: "—", level: "none" };
  if (gl <= 10) return { label: "низкая", level: "low" };
  if (gl < 20) return { label: "средняя", level: "medium" };
  return { label: "высокая", level: "high" };
}
