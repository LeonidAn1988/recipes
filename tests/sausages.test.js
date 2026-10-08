const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ structuredClone, console });
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'products.js'), 'utf8') +
    '\nthis.PRODUCTS=BUILTIN_PRODUCTS;\n' +
    ['recipes', 'nutrition']
      .map(name => fs.readFileSync(path.join(__dirname, '..', 'js', `${name}.js`), 'utf8'))
      .join('\n') + '\nthis.api={DEFAULT_RECIPES,PRODUCTS,calcRecipe};',
  context
);
const { DEFAULT_RECIPES, PRODUCTS, calcRecipe } = context.api;
const sausages = DEFAULT_RECIPES.filter(recipe => recipe.id.startsWith('sausage-turkey-'));

assert.equal(sausages.length, 3, 'есть кабачковый, морковный и базовый варианты');
assert.equal(new Set(sausages.map(recipe => recipe.id)).size, 3, 'идентификаторы уникальны');
for (const recipe of sausages) {
  const nutrition = calcRecipe(recipe).total;
  assert.equal(nutrition.complete, true, `${recipe.title}: состав полностью рассчитывается`);
  assert.equal(recipe.nutritionBasis, 'raw-mix', `${recipe.title}: расчёт явно относится к сырой заготовке`);
  assert.ok(recipe.image && fs.existsSync(path.join(__dirname, '..', recipe.image)), `${recipe.title}: фото существует`);
  assert.ok(recipe.source.length >= 4, `${recipe.title}: приложены источники по безопасности и ингредиентам`);
  assert.ok(recipe.source.every(item => /^https:\/\//.test(item.url)), `${recipe.title}: ссылки только HTTPS`);
  assert.ok(recipe.ingredients.every(ingredient => PRODUCTS.some(product => product.name === ingredient.product)), `${recipe.title}: ингредиенты есть в базе`);
  assert.ok(nutrition.raw.kcal > 900, `${recipe.title}: калорийность положительная и рассчитана по составу`);
}
assert.equal(calcRecipe(sausages.find(recipe => recipe.id.endsWith('zucchini-v1'))).total.raw.kcal, 1134);
assert.equal(calcRecipe(sausages.find(recipe => recipe.id.endsWith('carrot-v1'))).total.raw.kcal, 1142);
assert.equal(calcRecipe(sausages.find(recipe => recipe.id.endsWith('basic-v1'))).total.raw.kcal, 1110);
assert.ok(PRODUCTS.some(product => product.name === 'Индейка (бедро без кожи сырое)' && product.kcal === 108));
assert.ok(PRODUCTS.some(product => product.name === 'Индейка (грудка без кожи сырая)' && product.kcal === 114));
console.log('OK: три рецепта сосисок, источники, фото и расчёт сырого состава');
