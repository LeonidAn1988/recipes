// Слой хранения: рецепты, пользовательские продукты и меню в localStorage,
// плюс выгрузка/загрузка книги одним JSON-файлом.
//
// Ключи хранения разведены, чтобы правка продуктов не переписывала рецепты
// и наоборот. PRODUCTS собирается из встроенной базы и пользовательской:
// продукт с тем же именем перекрывает встроенный — так можно поправить
// значения под свою марку, не трогая код.

const STORAGE_KEYS = {
  recipes: "recipes.data",
  products: "recipes.products",
  menu: "recipes.menu",
  seeded: "recipes.seeded"
};

const EXPORT_FORMAT = "recipes-book";
const EXPORT_VERSION = 1;

let customProducts = readJson(STORAGE_KEYS.products, []);
let PRODUCTS = buildProducts();

// Собирает рабочий список продуктов: встроенные + пользовательские.
// При совпадении имени побеждает пользовательский.
function buildProducts() {
  const byName = new Map();
  BUILTIN_PRODUCTS.forEach(p => byName.set(p.name, { ...p, custom: false }));
  customProducts.forEach(p => byName.set(p.name, { ...p, custom: true }));
  return [...byName.values()];
}

function readJson(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (typeof noteLocalChange === "function") noteLocalChange(key);
    return true;
  } catch {
    alert(
      "Не удалось сохранить: превышен лимит хранилища браузера.\n\n" +
      "Больше всего места занимают фото, загруженные файлом — они хранятся целиком " +
      "внутри книги. Используйте ссылки на изображения вместо загрузки файлов, " +
      "а книгу выгрузите кнопкой «Экспорт», чтобы не потерять данные."
    );
    return false;
  }
}

// --- Рецепты ---

// При первом запуске отдаёт всю стартовую книгу. Если книга уже сохранена —
// доливает те стартовые рецепты, которые ещё ни разу в ней не появлялись
// (так новые рецепты из обновления доходят до сохранённой книги). Список
// «уже подсыпанных» id хранится отдельно, поэтому удалённый рецепт назад
// не возвращается.
function loadRecipes() {
  const stored = readJson(STORAGE_KEYS.recipes, null);

  if (!Array.isArray(stored)) {
    writeJson(STORAGE_KEYS.seeded, DEFAULT_RECIPES.map(r => r.id));
    return structuredClone(DEFAULT_RECIPES);
  }

  // Теги и способ приготовления появились позже рецептов: стартовым рецептам
  // без них проставляем значения из стартового набора. Пустой массив тегов —
  // осознанно снятые теги, не трогаем.
  let tagsAdded = false;
  stored.forEach(r => {
    if (r.tags === undefined && STARTER_TAGS[r.id]) {
      r.tags = [...STARTER_TAGS[r.id]];
      tagsAdded = true;
    }
    // Способ приготовления появился ещё позже — та же логика.
    if (r.method === undefined) {
      const seed = DEFAULT_RECIPES.find(d => d.id === r.id);
      if (seed) {
        r.method = seed.method;
        tagsAdded = true;
      }
    }
  });

  const seeded = new Set(readJson(STORAGE_KEYS.seeded, []));
  const existing = new Set(stored.map(r => r.id));
  const fresh = DEFAULT_RECIPES.filter(r => !seeded.has(r.id) && !existing.has(r.id));
  if (fresh.length === 0) {
    if (tagsAdded) writeJson(STORAGE_KEYS.recipes, stored);
    return stored;
  }

  const merged = [...stored, ...structuredClone(fresh)];
  writeJson(STORAGE_KEYS.seeded, [...seeded, ...fresh.map(r => r.id)]);
  writeJson(STORAGE_KEYS.recipes, merged);
  return merged;
}

function saveRecipes(list) {
  return writeJson(STORAGE_KEYS.recipes, list);
}

// --- Пользовательские продукты ---

function getCustomProducts() {
  return customProducts;
}

function saveCustomProducts(list) {
  customProducts = list;
  PRODUCTS = buildProducts();
  return writeJson(STORAGE_KEYS.products, customProducts);
}

function upsertCustomProduct(product, originalName) {
  const list = customProducts.filter(p => p.name !== product.name && p.name !== originalName);
  list.push(product);
  list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return saveCustomProducts(list);
}

function deleteCustomProduct(name) {
  return saveCustomProducts(customProducts.filter(p => p.name !== name));
}

// --- Меню ---

function loadMenu() {
  const stored = readJson(STORAGE_KEYS.menu, null);
  return Array.isArray(stored) ? stored : [];
}

function saveMenu(items) {
  return writeJson(STORAGE_KEYS.menu, items);
}

// --- Экспорт / импорт ---

function buildExport(recipesList) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    recipes: recipesList,
    customProducts
  };
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportFilename() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `recipes-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

// Разбирает загруженный файл. Бросает Error с понятным текстом, если файл
// не наш — лучше отказаться, чем молча затереть книгу мусором.
function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Файл не является корректным JSON.");
  }

  // Старый формат — просто массив рецептов.
  if (Array.isArray(data)) {
    return { recipes: data.filter(isValidRecipe), customProducts: [] };
  }

  if (!data || data.format !== EXPORT_FORMAT) {
    throw new Error("Это не файл книги рецептов: в нём нет метки формата «" + EXPORT_FORMAT + "».");
  }
  if (!Array.isArray(data.recipes)) {
    throw new Error("В файле нет списка рецептов.");
  }

  const recipes = data.recipes.filter(isValidRecipe);
  if (recipes.length === 0) {
    throw new Error("В файле не нашлось ни одного рецепта с названием и ингредиентами.");
  }

  return {
    recipes,
    customProducts: (Array.isArray(data.customProducts) ? data.customProducts : []).filter(isValidProduct)
  };
}

function isValidRecipe(r) {
  return r
    && typeof r.title === "string" && r.title.trim() !== ""
    && Array.isArray(r.ingredients);
}

function isValidProduct(p) {
  return p
    && typeof p.name === "string" && p.name.trim() !== ""
    && ["kcal", "protein", "fat", "carbs"].every(k => typeof p[k] === "number");
}

// Сливает импортированные данные с текущими. mode: "merge" | "replace".
// При слиянии рецепт с уже занятым id получает новый, чтобы не затирать свой.
function applyImport(current, imported, mode) {
  if (mode === "replace") {
    saveCustomProducts(imported.customProducts);
    return imported.recipes;
  }

  const usedIds = new Set(current.map(r => r.id));
  const added = imported.recipes.map(r => {
    if (!r.id || usedIds.has(r.id)) {
      const id = "r-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      usedIds.add(id);
      return { ...r, id };
    }
    usedIds.add(r.id);
    return r;
  });

  const productNames = new Set(customProducts.map(p => p.name));
  const newProducts = imported.customProducts.filter(p => !productNames.has(p.name));
  if (newProducts.length > 0) {
    saveCustomProducts([...customProducts, ...newProducts].sort((a, b) => a.name.localeCompare(b.name, "ru")));
  }

  return [...current, ...added];
}
