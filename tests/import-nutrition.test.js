const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const memory = new Map();
const context = vm.createContext({console, structuredClone, localStorage: {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value)
}, alert: message => { throw new Error(message); }});
vm.runInContext(['products','recipes','store','nutrition'].map(name =>
  fs.readFileSync(path.join(__dirname,'..','js',name+'.js'),'utf8')).join('\n') +
  ';this.api={calcRecipe,applyImport,parseImport,BEVERAGE_RECIPES,PRODUCTS};', context);
const { calcRecipe, applyImport, parseImport, BEVERAGE_RECIPES, PRODUCTS } = context.api;
const base = {id:'children-test',title:'Тест',ingredients:[{product:'Банан',amount:100,unit:'г'}]};
assert.equal(calcRecipe(base).total.complete, true);
assert.equal(calcRecipe({...base,ingredients:[{product:'Неизвестный продукт',amount:100,unit:'г'}]}).total.complete,false);
assert.equal(calcRecipe({...base,ingredients:[{product:'Банан',amount:null,unit:'г'}]}).total.complete,false);
assert.equal(calcRecipe({...base,nutritionReview:{status:'needs-review'}}).total.complete,false);
assert.equal(calcRecipe({...base,nutritionReview:{status:'reviewed'}}).total.complete,true);
assert.equal(calcRecipe({...base,ingredients:[{product:'Мёд',amount:0,unit:'по вкусу'}]}).total.complete,false);
assert.equal(calcRecipe({...base,ingredients:[...base.ingredients,{product:'Соль',amount:0,unit:'по вкусу'}]}).total.complete,true);
assert.equal(calcRecipe({...base,ingredients:[...base.ingredients,{product:'Растительное масло',amount:0,unit:'по вкусу'}]}).total.complete,false);
const recipe={...base,source:{book:'Тестовый сборник',page:4}};
const pack=parseImport(JSON.stringify({format:'recipes-book',recipes:[{...recipe,sourceText:'полная OCR-страница'}],customProducts:[]}));
assert.equal('sourceText' in pack.recipes[0],false);
assert.equal('sourceText' in context.buildExport([{...recipe,sourceText:'полная OCR-страница'}]).recipes[0],false);
const own={id:'own',title:'Свой рецепт',ingredients:[]};
const first=applyImport([own],pack,'merge');
assert.equal(first.length,2);
const second=applyImport(first,pack,'merge');
assert.equal(second.length,2);
assert.equal(second[0].title,'Свой рецепт');
assert.equal(BEVERAGE_RECIPES.length,6);
assert.equal(new Set(BEVERAGE_RECIPES.map(r=>r.id)).size,BEVERAGE_RECIPES.length);
for (const beverage of BEVERAGE_RECIPES) {
  assert.ok(beverage.source.length > 0, `${beverage.title}: у напитка есть источники`);
  assert.ok(beverage.source.every(s=>/^https:\/\//.test(s.url)), `${beverage.title}: только HTTPS источники`);
  assert.ok(beverage.ingredients.every(i=>PRODUCTS.some(p=>p.name===i.product)), `${beverage.title}: продукты известны базе`);
  assert.equal(calcRecipe(beverage).total.complete,beverage.id==='drink-diluted-juice-v1',`${beverage.title}: полнота расчёта соответствует данным`);
  if (beverage.id!=='drink-diluted-juice-v1') assert.equal(beverage.nutritionReview.status,'needs-review');
}
memory.set('recipes.data', JSON.stringify([
  {id:'seed-1',title:'Оладьи на кефире',ingredients:[],sourceText:'локальный OCR-текст'},
  {id:'seed-2',title:'Моя правка',image:'family-photo.jpg',ingredients:[]}
]));
memory.set('recipes.seeded', JSON.stringify(['seed-1','seed-2']));
const migrated = context.loadRecipes();
assert.equal(migrated.find(r=>r.id==='seed-1').image,'img/seed-1-oladyi.jpg');
assert.equal('sourceText' in migrated.find(r=>r.id==='seed-1'),false);
assert.equal(migrated.find(r=>r.id==='seed-2').image,'family-photo.jpg');
const childA={id:'children-page-4-1',title:'Каша с тыквой',source:{book:'Сборник',page:4},ingredients:[]};
const childB={id:'children-page-4-2',title:'Каша с тыквой',source:{book:'Сборник',page:4},ingredients:[]};
assert.equal(applyImport([childA],{recipes:[childB],customProducts:[]},'merge').length,1);
const childDifferent={...childB,id:'children-page-4-3',title:'Суп-пюре',source:{book:'Сборник',page:4}};
assert.equal(applyImport([childA],{recipes:[childDifferent],customProducts:[]},'merge').length,2);
console.log('OK: неполные расчёты, сверка OCR, повторный безопасный импорт');
