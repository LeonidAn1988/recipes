const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const memory = new Map();
const context = vm.createContext({
  console, structuredClone,
  localStorage: {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value)
  },
  alert: message => { throw new Error(message); }
});
vm.runInContext(['products', 'recipes', 'store', 'nutrition'].map(name =>
  fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8')
).join('\n') + '\nthis.api={DEFAULT_RECIPES,STARTER_RECIPE_PREVIOUS,loadRecipes,calcRecipe,productGroup,PRODUCTS};', context);

const { DEFAULT_RECIPES, STARTER_RECIPE_PREVIOUS, loadRecipes, calcRecipe, productGroup, PRODUCTS } = context.api;
const copy = value => JSON.parse(JSON.stringify(value));
const liverId = 'liver-pancakes-carrot-karavaev-inspired-v1';
const bulgurId = 'bulgur-carrot-onion-quinoa-v1';
const liver = DEFAULT_RECIPES.find(recipe => recipe.id === liverId);
const bulgur = DEFAULT_RECIPES.find(recipe => recipe.id === bulgurId);
const oldLiver = { id: liverId, title: liver.title, ...copy(STARTER_RECIPE_PREVIOUS[liverId]) };
for (const key of ['notes', 'source', 'nutritionReview']) delete oldLiver[key];
const familyRecipe = { id: 'family-only', title: 'Семейный рецепт', notes: 'Сохранить' };

function seed(recipes) {
  memory.clear();
  memory.set('recipes.data', JSON.stringify(recipes));
  memory.set('recipes.seeded', JSON.stringify(DEFAULT_RECIPES.filter(recipe => recipe.id !== bulgurId).map(recipe => recipe.id)));
}

// Существующая книга получает исправления и новую карточку через обычную загрузку.
seed([familyRecipe, oldLiver]);
const first = loadRecipes();
const corrected = first.find(recipe => recipe.id === liverId);
assert.equal(corrected.ingredients.find(item => item.product === 'Сахар').amount, 2);
assert.equal(corrected.servings, '4 порции (около 16–18 оладий)');
assert.deepEqual(copy(corrected.steps), copy(liver.steps));
assert.ok(corrected.updatedAt);
assert.deepEqual(copy(first.find(recipe => recipe.id === familyRecipe.id)), familyRecipe);
assert.equal(first.filter(recipe => recipe.id === bulgurId).length, 1);
assert.deepEqual(copy(loadRecipes()), copy(first), 'повторная загрузка ничего не дублирует и не меняет');

// Правка состава сохраняет всю семейную рецептуру согласованной.
const changedIngredients = copy(oldLiver);
changedIngredients.ingredients[0].amount = 600;
seed([changedIngredients]);
const unchangedCooking = loadRecipes().find(recipe => recipe.id === liverId);
assert.deepEqual(copy(unchangedCooking.ingredients), changedIngredients.ingredients);
assert.deepEqual(copy(unchangedCooking.steps), changedIngredients.steps);
assert.equal(unchangedCooking.servings, changedIngredients.servings);

// Свои заметки и фотографии сохраняются при обновлении исходной рецептуры.
const ownNotes = { ...copy(oldLiver), notes: 'Семейная заметка', image: 'family-photo.jpg' };
seed([ownNotes]);
const updatedWithNotes = loadRecipes().find(recipe => recipe.id === liverId);
assert.equal(updatedWithNotes.notes, ownNotes.notes);
assert.equal(updatedWithNotes.image, ownNotes.image);
assert.equal(updatedWithNotes.ingredients.find(item => item.product === 'Сахар').amount, 2);

// Все поля полностью переработанной семьёй карточки сохраняются.
const customized = copy(oldLiver);
customized.title = 'Наши оладьи';
customized.ingredients[0].amount = 600;
customized.steps = [{ text: 'Наш способ приготовления' }];
customized.servings = '6 порций';
customized.notes = 'Семейная заметка';
customized.image = 'family-photo.jpg';
seed([customized]);
const preserved = loadRecipes().find(recipe => recipe.id === liverId);
for (const key of ['title', 'ingredients', 'steps', 'servings', 'notes', 'image']) {
  assert.deepEqual(copy(preserved[key]), customized[key], key + ' сохраняется');
}

// После удаления ранее добавленные карточки не возвращаются.
memory.set('recipes.data', JSON.stringify([familyRecipe]));
const afterDeletion = loadRecipes();
assert.ok(!afterDeletion.some(recipe => recipe.id === liverId || recipe.id === bulgurId));

// Все продукты двух карточек известны расчёту, порции и вода учитываются корректно.
for (const recipe of [liver, bulgur]) {
  const { total } = calcRecipe(recipe);
  assert.equal(total.complete, true, recipe.title);
  assert.equal(total.servings, 4);
  assert.equal(total.yieldMeasured, false);
  assert.ok(Number.isFinite(total.perServing.kcal) && total.perServing.kcal > 0);
}
assert.equal(bulgur.ingredients.find(item => item.product === 'Вода').amount, 500);
assert.equal(bulgur.ingredients.find(item => item.product === 'Булгур').amount, 200);
assert.equal(bulgur.ingredients.find(item => item.product === 'Киноа (сырая)').amount, 50);
assert.equal(productGroup(PRODUCTS.find(product => product.name === 'Киноа (сырая)')), 'grain');
assert.equal(bulgur.method, 'stew');
assert.match(liver.steps.map(step => step.text).join(' '), /минимум 74 °C/);
console.log('OK: обновление оладий, сохранение семейных правок, добавление булгура и расчёт');
