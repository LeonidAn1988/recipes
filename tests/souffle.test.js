const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const storage = new Map();
const context = vm.createContext({
  console, structuredClone,
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value)
  }
});
vm.runInContext(
  fs.readFileSync(path.join(root, 'js/products.js'), 'utf8') +
    '\nthis.PRODUCTS=BUILTIN_PRODUCTS;\n' +
    ['recipes', 'nutrition', 'store'].map(name =>
      fs.readFileSync(path.join(root, `js/${name}.js`), 'utf8')).join('\n') +
    '\nthis.api={DEFAULT_RECIPES,calcRecipe,loadRecipes,STORAGE_KEYS};', context
);
const { DEFAULT_RECIPES, calcRecipe, loadRecipes, STORAGE_KEYS } = context.api;
const id = 'souffle-turkey-dairy-free-v1';
const recipe = DEFAULT_RECIPES.find(item => item.id === id);
assert.ok(recipe);
assert.equal(recipe.method, 'bake', 'метод не должен сбрасываться на raw в стартовой книге');
assert.equal(recipe.ingredients[0].amount, 250);
assert.equal(recipe.ingredients[1].amount, 250);
assert.equal(recipe.ingredients.find(item => item.product === 'Яйцо куриное').amount, 4);
assert.ok(!recipe.ingredients.some(item => /молок|сливк|^сыр(?:\s|$)|кабач|^вода$/i.test(item.product)));
assert.ok(fs.existsSync(path.join(root, recipe.image)));
assert.match(recipe.notes, /Содержит яйца/);
assert.match(recipe.notes, /Без термометра.*74 °C/);
assert.match(recipe.notes, /50\/50 — семейная адаптация/);
assert.match(recipe.notes, /сгенерировано ИИ/);
assert.ok(recipe.source.some(item => item.url === 'https://menunedeli.ru/recipe/sufle-iz-indejki-v-duxovke/'));
assert.ok(recipe.source.some(item => item.url === 'https://www.foodsafety.gov/food-safety-charts/safe-minimum-internal-temperatures'));
const heatStep = recipe.steps.find(item => item.kind === 'heat');
assert.equal(heatStep.temp, 180);
assert.equal(heatStep.method, 'bake');
assert.match(heatStep.text, /минимум 74 °C/);
assert.match(heatStep.text, /сами по себе не подтверждают безопасность/);
assert.match(recipe.steps[0].text, /автор.*без уточнения режима/);
assert.ok(recipe.steps.some(item => /Практический ориентир.*слой/.test(item.text)));
const total = calcRecipe(recipe).total;
assert.equal(total.complete, true);
assert.equal(total.yieldMeasured, false, 'готовый выход ещё не взвешен');
assert.ok(Math.abs(total.raw.kcal - (250 * 1.14 + 250 * 1.08 + 200 * 1.57 + 140 * 0.41 + 5 * 0.92 * 8.99)) < 1e-8);
assert.ok(total.yieldGrams < total.raw.grams, 'для запекания используется оценочный выход');

// Обновление существующей семейной книги: добавление один раз, без замены записей.
const custom = { id: 'family-custom', title: 'Мой семейный рецепт', notes: 'Сохранить' };
storage.set(STORAGE_KEYS.recipes, JSON.stringify([custom]));
storage.set(STORAGE_KEYS.seeded, JSON.stringify(DEFAULT_RECIPES.filter(item => item.id !== id).map(item => item.id)));
assert.equal(loadRecipes().filter(item => item.id === id).length, 1);
const reloaded = loadRecipes();
assert.equal(reloaded.filter(item => item.id === id).length, 1);
assert.equal(reloaded.find(item => item.id === custom.id).notes, custom.notes);
reloaded.find(item => item.id === id).notes = 'Семейная правка';
storage.set(STORAGE_KEYS.recipes, JSON.stringify(reloaded));
assert.equal(loadRecipes().find(item => item.id === id).notes, 'Семейная правка');
storage.set(STORAGE_KEYS.recipes, JSON.stringify([custom]));
assert.ok(!loadRecipes().some(item => item.id === id), 'удалённая карточка не возвращается');
console.log('OK: суфле — состав, метод, фото, расчёт, добавление в книгу и сохранение семейных правок');

// Овощная адаптация хранится отдельно и не меняет прежний вариант.
const vegetableId = 'souffle-turkey-carrot-zucchini-v1';
const vegetable = DEFAULT_RECIPES.find(item => item.id === vegetableId);
assert.ok(vegetable);
assert.equal(vegetable.method, 'bake');
assert.equal(vegetable.ingredients[0].amount + vegetable.ingredients[1].amount, 500);
assert.equal(vegetable.ingredients.find(item => item.product === 'Морковь').amount, 100);
assert.equal(vegetable.ingredients.find(item => item.product === 'Кабачок').amount, 150);
assert.equal(vegetable.ingredients.find(item => item.product === 'Лук репчатый').amount, 70);
assert.equal(vegetable.ingredients.find(item => item.product === 'Яйцо куриное').amount, 4);
assert.ok(!vegetable.ingredients.some(item => /молок|сливк|^сыр(?:\s|$)|^вода$/i.test(item.product)));
assert.ok(fs.existsSync(path.join(root, vegetable.image)));
assert.match(vegetable.notes, /150 г после отжимания/);
assert.match(vegetable.notes, /не испытанная авторами/);
assert.match(vegetable.notes, /Содержит яйца/);
assert.match(vegetable.notes, /сгенерирована ИИ/);
assert.ok(vegetable.source.some(item => item.url.includes('oshihealth.com/recipe-mini-turkey-meatloaves')));
assert.ok(vegetable.steps.some(item => /Взвесить именно 150 г отжатой мякоти/.test(item.text)));
assert.ok(vegetable.steps.some(item => /Сырую массу не пробовать/.test(item.text)));
const vegetableHeat = vegetable.steps.find(item => item.kind === 'heat' && item.method === 'bake');
assert.equal(vegetableHeat.temp, 180);
assert.match(vegetableHeat.text, /минимум 74 °C/);
assert.match(vegetableHeat.text, /без термометра подтвердить готовность нельзя/);
const vegetableTotal = calcRecipe(vegetable).total;
assert.equal(vegetableTotal.complete, true);
assert.equal(vegetableTotal.yieldMeasured, false);
const expectedRawKcal = 250 * 1.14 + 250 * 1.08 + 200 * 1.57 + 70 * 0.41 + 100 * 0.32 + 150 * 0.24 + 5 * 0.92 * 8.99;
assert.ok(Math.abs(vegetableTotal.raw.kcal - expectedRawKcal) < 1e-8);
storage.clear();
const familySouffle = JSON.parse(JSON.stringify(recipe));
familySouffle.ingredients[0].amount = 300;
familySouffle.ingredients[1].amount = 200;
familySouffle.steps = [{ text: 'Наш семейный шаг', kind: 'prep', minutes: 2 }];
familySouffle.tags = ['наша версия'];
familySouffle.method = 'steam';
familySouffle.image = 'img/family-photo.jpg';
familySouffle.notes = 'Семейные изменения прежнего суфле';
storage.set(STORAGE_KEYS.recipes, JSON.stringify([custom, familySouffle]));
storage.set(STORAGE_KEYS.seeded, JSON.stringify(DEFAULT_RECIPES.filter(item => item.id !== vegetableId).map(item => item.id)));
const withVegetables = loadRecipes();
assert.equal(withVegetables.filter(item => item.id === vegetableId).length, 1);
assert.equal(withVegetables.find(item => item.id === custom.id).notes, custom.notes);
assert.equal(JSON.stringify(withVegetables.find(item => item.id === id)), JSON.stringify(familySouffle));
const withVegetablesAgain = loadRecipes();
assert.equal(withVegetablesAgain.filter(item => item.id === vegetableId).length, 1);
assert.equal(JSON.stringify(withVegetablesAgain.find(item => item.id === id)), JSON.stringify(familySouffle));
withVegetables.find(item => item.id === vegetableId).notes = 'Наша овощная версия';
storage.set(STORAGE_KEYS.recipes, JSON.stringify(withVegetables));
assert.equal(loadRecipes().find(item => item.id === vegetableId).notes, 'Наша овощная версия');
storage.set(STORAGE_KEYS.recipes, JSON.stringify([custom, recipe]));
assert.ok(!loadRecipes().some(item => item.id === vegetableId));
console.log('OK: овощное суфле — граммовки, подготовка, источники, безопасность, расчёт и миграция');
