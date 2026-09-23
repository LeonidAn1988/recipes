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

// --- Способ приготовления ---
//
// Тепловая обработка меняет две вещи:
// 1. Часть белков, жиров и углеводов уходит в бульон, сок и вытопленный жир.
//    Коэффициенты потерь — по справочнику «Химический состав пищевых
//    продуктов» (под ред. И. М. Скурихина, М. В. Волгарева, 1987, т. 1,
//    раздел «Тепловая кулинарная обработка»):
//    • мясо и птица: варка и жарка — белки 10 %, жиры 25 %;
//      тушение, запекание — белки 5 %, жиры 5 %;
//    • рыба, варка: тощая — белки 3 %, жиры 9 %; жирная — белки 14 %, жиры 12 %;
//      остальные способы — 5 % / 5 %, как минимальные потери при запекании;
//    • растительные и прочие продукты — 2–5 %, берём верхнюю границу 5 %.
//    На пару для мяса и птицы берём коэффициенты тушения: продукт не
//    контактирует с водой, потери ниже, чем при варке.
//    Калорийность после обработки = табличная калорийность −
//    (4 × потерянные белки + 9 × потерянные жиры + 4 × потерянные углеводы).
// 2. Меняется масса: мясо и рыба теряют влагу, крупы набирают воду.
//    Это влияет только на показатель «на 100 г готового блюда» — порция
//    и итог по блюду от массы не зависят. Коэффициенты массы ориентировочные
//    (нормы ужарки и уварки общепита: мясо — до 40 % при варке и до 35 %
//    при жарке, рыба — 15–22 %, овощи — около 10 % при варке и до 35 % при
//    жарке, яйца — 8–12 %, шампиньоны — 30 % при варке и 50–60 % при жарке).
//    Точнее всего — взвесить готовое блюдо и указать выход в рецепте.

const COOKING_METHODS = [
  { id: "raw", label: "Без термообработки" },
  { id: "boil", label: "Варка" },
  { id: "steam", label: "На пару" },
  { id: "stew", label: "Тушение" },
  { id: "fry", label: "Жарка" },
  { id: "bake", label: "Запекание, выпечка" }
];

// Потери [белки, жиры, углеводы] в долях. Для рыбы при варке — см. fishLoss.
const NUTRIENT_LOSS = {
  raw:   { meat: [0, 0, 0],       poultry: [0, 0, 0],       fish: [0, 0, 0],       other: [0, 0, 0] },
  boil:  { meat: [0.10, 0.25, 0], poultry: [0.10, 0.25, 0], fish: null,            other: [0.05, 0.05, 0.05] },
  fry:   { meat: [0.10, 0.25, 0], poultry: [0.10, 0.25, 0], fish: [0.05, 0.05, 0], other: [0.05, 0.05, 0.05] },
  stew:  { meat: [0.05, 0.05, 0], poultry: [0.05, 0.05, 0], fish: [0.05, 0.05, 0], other: [0.05, 0.05, 0.05] },
  bake:  { meat: [0.05, 0.05, 0], poultry: [0.05, 0.05, 0], fish: [0.05, 0.05, 0], other: [0.05, 0.05, 0.05] },
  steam: { meat: [0.05, 0.05, 0], poultry: [0.05, 0.05, 0], fish: [0.05, 0.05, 0], other: [0.05, 0.05, 0.05] }
};

// Рыба делится по жирности: до 8 % жира — тощая и средней жирности, выше — жирная.
function fishLoss(product) {
  return product.fat > 8 ? [0.14, 0.12, 0] : [0.03, 0.09, 0];
}

// Масса после обработки / масса до неё. grain — сухие крупы, макароны и
// бобовые: при варке без жидкости в рецепте набирают воду сами (привар);
// если вода или молоко есть среди ингредиентов, их масса уже учтена —
// коэффициент крупы 1, а жидкость теряет часть на испарение (ключ water).
const MASS_FACTOR = {
  raw:   {},
  boil:  { meat: 0.60, poultry: 0.75, fish: 0.80, egg: 0.90, veg: 0.90, mushroom: 0.70, grain: 2.4, water: 0.90 },
  steam: { meat: 0.70, poultry: 0.80, fish: 0.86, egg: 0.90, veg: 0.92, mushroom: 0.80, water: 0.90 },
  stew:  { meat: 0.60, poultry: 0.70, fish: 0.80, egg: 0.90, veg: 0.80, mushroom: 0.60, grain: 2.4, water: 0.90 },
  fry:   { meat: 0.65, poultry: 0.70, fish: 0.80, egg: 0.90, veg: 0.70, mushroom: 0.50, flour: 0.90, dairy: 0.90, water: 0.80 },
  bake:  { meat: 0.65, poultry: 0.70, fish: 0.82, egg: 0.90, veg: 0.80, mushroom: 0.60, flour: 0.90, dairy: 0.90, other: 0.90, fat: 0.90, water: 0.80 }
};

const FISH_RE = /лосос|сёмг|семг|форел|тунец|треск|камбал|рыб|кревет|кальмар|минтай|скумбри|сельд|горбуш|кет[аы]|судак|щук|карп|окун|хек|пикш|мидии|краб|икр/i;
const POULTRY_RE = /куриц|цыпл|индейк|утк|гус[ья]|кролик/i;

// Группа продукта для тепловой обработки. Определяется по категории и
// названию, поэтому работает и для своих продуктов пользователя.
function productGroup(product) {
  const name = product.name;
  const cat = product.category || "";
  if (/^вода$/i.test(name) || (cat === "Напитки" && !/порошок/i.test(name))) return "water";
  if (cat === "Мясо, птица, рыба") {
    if (FISH_RE.test(name)) return "fish";
    if (POULTRY_RE.test(name)) return "poultry";
    return "meat";
  }
  if (cat === "Молочные и яйца") {
    if (/яйц/i.test(name)) return "egg";
    if (/масло/i.test(name)) return "fat";
    return "dairy";
  }
  if (cat === "Крупы и мучное") {
    return /сыр(ая|ой)|сух(ая|ой|ие)|хлопья|крупа|кускус|булгур|макарон/i.test(name) ? "grain" : "flour";
  }
  if (cat === "Бобовые") return /сух/i.test(name) ? "grain" : "veg";
  if (cat === "Овощи и грибы") return /шампиньон|гриб|лисич|опят/i.test(name) ? "mushroom" : "veg";
  if (cat === "Фрукты и ягоды") return "veg";
  if (/масло|жир|сало/i.test(name)) return "fat";
  return "other";
}

function methodLabel(id) {
  const m = COOKING_METHODS.find(x => x.id === id);
  return m ? m.label : COOKING_METHODS[0].label;
}

function nutrientLoss(method, product, group) {
  const table = NUTRIENT_LOSS[method] || NUTRIENT_LOSS.raw;
  if (group === "meat" || group === "poultry") return table[group];
  if (group === "fish") return table.fish || fishLoss(product);
  return table.other;
}

// Жидкость — вода, напитки и жидкие молочные (молоко, кефир, сливки):
// крупа набирает именно её, а при варке часть жидкости испаряется.
function isLiquid(product, group) {
  if (group === "water") return true;
  return group === "dairy" && Boolean(product.units && product.units["мл"]);
}

function massFactor(method, group, liquid, recipeHasLiquid) {
  if (group === "grain" && recipeHasLiquid) return 1;
  const table = MASS_FACTOR[method] || {};
  return table[liquid ? "water" : group] ?? 1;
}

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

// --- Дробные количества ---
//
// В поле количества можно писать как привыкли в рецептах: «1/2», «1 1/2»,
// «½», «1½», «0,5», «0.5». Хранится всегда число, а показывается простой
// дробью, если число к ней близко: 0.5 → «½», 1.25 → «1 ¼».

const VULGAR_FRACTIONS = { "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4, "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8 };
// Показываем только привычные кухонные доли; восьмые («4 ⅞ шт») читаются хуже
// десятичной записи. Ввести ⅛ при этом можно — см. VULGAR_FRACTIONS.
const FRACTION_STEPS = [
  [1 / 4, "¼", "1/4"], [1 / 3, "⅓", "1/3"], [1 / 2, "½", "1/2"], [2 / 3, "⅔", "2/3"], [3 / 4, "¾", "3/4"]
];

// Возвращает число или NaN, если строку не удалось разобрать.
function parseAmount(text) {
  let str = String(text ?? "").trim().replace(",", ".");
  if (str === "") return NaN;

  let whole = 0;
  for (const [sym, val] of Object.entries(VULGAR_FRACTIONS)) {
    if (str.endsWith(sym)) {
      const head = str.slice(0, -sym.length).trim();
      if (head !== "" && !/^\d+$/.test(head)) return NaN;
      return (head === "" ? 0 : Number(head)) + val;
    }
  }

  const mixed = str.match(/^(\d+)[\s-]+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    whole = Number(mixed[1]);
    str = `${mixed[2]}/${mixed[3]}`;
  }
  const frac = str.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    return den > 0 ? whole + Number(frac[1]) / den : NaN;
  }
  return /^\d*\.?\d+$/.test(str) ? Number(str) : NaN;
}

// pretty: «1 ½» для показа; иначе «1 1/2» — так удобнее править в поле ввода.
function formatAmount(n, pretty = true) {
  if (!(n > 0)) return n === 0 ? "0" : "";
  const whole = Math.floor(n + 1e-9);
  const rest = n - whole;
  if (rest < 0.01) return String(whole);
  const hit = FRACTION_STEPS.find(([v]) => Math.abs(rest - v) < 0.01);
  if (hit) {
    const f = pretty ? hit[1] : hit[2];
    return whole > 0 ? `${whole} ${f}` : f;
  }
  if (1 - rest < 0.01) return String(whole + 1);
  return Number(n).toLocaleString("ru-RU", { maximumFractionDigits: n < 1 ? 2 : 1 });
}

// --- Отходы и чистый выход ---
//
// Количества в рецепте — чистый вес (нетто), то, что идёт в блюдо.
// Отходы при очистке задаются в процентах от веса до очистки (брутто):
// нетто = брутто × (1 − отходы/100). Процент берётся из самого ингредиента
// рецепта (если его поправили под свою разделку), иначе из продукта.

function clampWaste(value) {
  const n = Number(value);
  return n > 0 ? Math.min(n, 95) : 0;
}

function ingredientWaste(ingredient, product) {
  if (ingredient.waste !== undefined && ingredient.waste !== null) return clampWaste(ingredient.waste);
  return clampWaste(product ? product.waste : 0);
}

function netFromGross(gross, waste) {
  return gross * (1 - clampWaste(waste) / 100);
}

function grossFromNet(net, waste) {
  return net / (1 - clampWaste(waste) / 100);
}

// Считает БЖУ/ккал одного ингредиента.
function calcIngredient(ingredient) {
  const product = findProduct(ingredient.product);
  const grams = toGrams(Number(ingredient.amount) || 0, ingredient.unit, product);

  if (!product) {
    return { grams, kcal: 0, protein: 0, fat: 0, carbs: 0, gi: null, known: false, group: "other", liquid: false };
  }

  const k = grams / 100;
  return {
    grams,
    kcal: product.kcal * k,
    protein: product.protein * k,
    fat: product.fat * k,
    carbs: product.carbs * k,
    gi: product.gi,
    known: true,
    group: productGroup(product),
    liquid: isLiquid(product, productGroup(product))
  };
}

// Считает итог по рецепту: суммы БЖУ, калорийность, ГИ и ГН.
//
// rows — ингредиенты в сыром виде (как в таблице рецепта).
// total.raw — сумма по сырым продуктам; total — после тепловой обработки
// (потери нутриентов по способу приготовления, см. NUTRIENT_LOSS).
// total.grams — чистый вес сырых продуктов; total.yieldGrams — выход
// готового блюда: взвешенный пользователем или оценка по MASS_FACTOR.
function calcRecipe(recipe) {
  const method = recipe.method || "raw";
  const rows = (recipe.ingredients || []).map(calcIngredient);
  // Жидкости должно хватать на варку: минимум в 1,5 раза больше крупы.
  // Иначе это соус (сливки к пасте), а крупа варится в воде вне рецепта.
  const liquidGrams = rows.reduce((sum, r) => sum + (r.liquid ? r.grams : 0), 0);
  const grainGrams = rows.reduce((sum, r) => sum + (r.group === "grain" ? r.grams : 0), 0);
  const hasLiquid = grainGrams > 0 && liquidGrams >= grainGrams * 1.5;

  const raw = { grams: 0, kcal: 0, protein: 0, fat: 0, carbs: 0 };
  const total = { grams: 0, kcal: 0, protein: 0, fat: 0, carbs: 0 };
  let estimatedYield = 0;

  rows.forEach((r, i) => {
    raw.grams += r.grams;
    raw.kcal += r.kcal;
    raw.protein += r.protein;
    raw.fat += r.fat;
    raw.carbs += r.carbs;

    const product = r.known ? findProduct(recipe.ingredients[i].product) : null;
    const [lp, lf, lc] = product ? nutrientLoss(method, product, r.group) : [0, 0, 0];
    const lost = { protein: r.protein * lp, fat: r.fat * lf, carbs: r.carbs * lc };
    r.cooked = {
      protein: r.protein - lost.protein,
      fat: r.fat - lost.fat,
      carbs: r.carbs - lost.carbs,
      kcal: Math.max(0, r.kcal - lost.protein * KCAL_PER_G.protein - lost.fat * KCAL_PER_G.fat - lost.carbs * KCAL_PER_G.carbs)
    };

    total.grams += r.grams;
    total.kcal += r.cooked.kcal;
    total.protein += r.cooked.protein;
    total.fat += r.cooked.fat;
    total.carbs += r.cooked.carbs;
    estimatedYield += r.grams * massFactor(method, r.group, r.liquid, hasLiquid);
  });

  total.raw = raw;
  total.method = method;

  // Калорийность по Атуотеру — как перекрёстная проверка табличных значений.
  total.kcalAtwater = total.protein * KCAL_PER_G.protein
    + total.fat * KCAL_PER_G.fat
    + total.carbs * KCAL_PER_G.carbs;

  // Средневзвешенный ГИ по вкладу углеводов (после обработки).
  let carbsWithGi = 0;
  let giWeightedSum = 0;
  rows.forEach(r => {
    const carbs = r.cooked.carbs;
    if (r.gi !== null && r.gi !== undefined && carbs > 0) {
      carbsWithGi += carbs;
      giWeightedSum += r.gi * carbs;
    }
  });

  total.gi = carbsWithGi > 0 ? giWeightedSum / carbsWithGi : null;
  // Доля углеводов, для которых ГИ известен — показатель достоверности оценки.
  total.giCoverage = total.carbs > 0 ? carbsWithGi / total.carbs : 0;
  // ГН считаем на все доступные углеводы блюда: для продуктов без известного
  // ГИ принимаем средневзвешенный ГИ остальных (доля покрытия — в giCoverage).
  total.gl = total.gi !== null ? (total.gi * total.carbs) / 100 : null;

  const measured = Number(recipe.yieldGrams) > 0 ? Number(recipe.yieldGrams) : 0;
  total.estimatedYield = estimatedYield;
  total.yieldMeasured = measured > 0;
  total.yieldGrams = measured || estimatedYield;

  const servings = parseServings(recipe.servings);
  total.servings = servings;

  if (servings > 0) {
    total.perServing = {
      grams: total.yieldGrams / servings,
      kcal: total.kcal / servings,
      protein: total.protein / servings,
      fat: total.fat / servings,
      carbs: total.carbs / servings,
      gl: total.gl !== null ? total.gl / servings : null
    };
  }

  total.per100g = total.yieldGrams > 0 ? {
    kcal: total.kcal / total.yieldGrams * 100,
    protein: total.protein / total.yieldGrams * 100,
    fat: total.fat / total.yieldGrams * 100,
    carbs: total.carbs / total.yieldGrams * 100
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

  const round = (n, d = 1) => Number(n.toFixed(d)).toLocaleString("ru-RU", { maximumFractionDigits: d });

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
