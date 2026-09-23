// Проверка формул пищевой ценности, потерь при обработке, выхода и единиц.
// Запуск: node tests/formulas.test.js

const fs=require("fs"),vm=require("vm"),path=require("path");
const dir=process.argv[2] || path.join(__dirname, "..");
const ctx=vm.createContext({console});
const src=["products","nutrition","recipes"].map(f=>fs.readFileSync(path.join(dir,"js",f+".js"),"utf8")).join("\n");
vm.runInContext(src+`
var PRODUCTS = BUILTIN_PRODUCTS.map(p=>({...p}));
this.api={calcRecipe,netFromGross,grossFromNet,parseAmount,formatAmount,toGrams,findProduct,DEFAULT_RECIPES,giCategory,glCategory};`,ctx);
const A=ctx.api; let fails=0;
const near=(a,b,eps=0.01)=>Math.abs(a-b)<=eps*Math.max(1,Math.abs(b));
function check(name,got,exp,eps){const ok=near(got,exp,eps); if(!ok)fails++; console.log((ok?"OK  ":"FAIL")+" "+name+": "+(+got).toFixed(3)+" (ожидалось "+exp+")");}
const R=(method,ings,extra={})=>A.calcRecipe({method,servings:"2",ingredients:ings.map(([product,amount,unit="г"])=>({product,amount,unit})),...extra}).total;

let t=R("raw",[["Говядина",1000]]);
check("сырое: ккал = табличная",t.kcal,1870); check("сырое: выход = вес",t.yieldGrams,1000); check("сырое: на 100 г",t.per100g.kcal,187);
t=R("boil",[["Говядина",1000]]);
check("варка говядины: белки −10%",t.protein,170.1); check("варка говядины: жиры −25%",t.fat,93);
check("варка говядины: ккал = 1870 − 4·18,9 − 9·31",t.kcal,1870-4*18.9-9*31);
check("варка говядины: выход 60%",t.yieldGrams,600); check("варка: на 100 г готового",t.per100g.kcal,(1870-4*18.9-9*31)/6);
check("порция = всё блюдо / 2",t.perServing.kcal,(1870-4*18.9-9*31)/2);
t=R("stew",[["Говядина",1000]]); check("тушение говядины: жиры −5%",t.fat,117.8);
t=R("boil",[["Камбала",1000]]); check("варка тощей рыбы: белки −3%",t.protein,152.29); check("варка тощей рыбы: жиры −9%",t.fat,27.3);
t=R("boil",[["Лосось",1000]]); check("варка лосося (6,3% жира — не жирная): белки −3%",t.protein,192.06);
t=R("fry",[["Курица (бедро)",1000]]); check("жарка птицы: жиры −25%",t.fat,93); check("жарка птицы: выход 70%",t.yieldGrams,700);
t=R("boil",[["Гречка (сырая)",100]]); check("гречка без воды: выход ×2,4",t.yieldGrams,240); check("гречка: углеводы −5%",t.carbs,58.9);
t=R("boil",[["Гречка (сырая)",100],["Вода",200,"мл"]]); check("гречка с водой: выход = 100 + 200·0,9",t.yieldGrams,280);
t=R("boil",[["Овсяные хлопья",60],["Молоко 2.5%",250,"мл"]]); check("овсянка на молоке: выход = 60 + 250·0,9",t.yieldGrams,285);
t=R("boil",[["Макароны (сухие)",250],["Сливки 20%",200,"мл"]]); check("паста со сливками: макароны ×2,4, сливки ×0,9",t.yieldGrams,780);
t=R("boil",[["Говядина",500]],{yieldGrams:400}); check("взвешенный выход важнее оценки",t.yieldGrams,400);
t=R("raw",[["Банан",100],["Гречка (сырая)",100]]);
check("ГИ блюда = Σ(ГИ·У)/ΣУ",t.gi,(60*21.8+50*62)/(21.8+62)); check("ГН = ГИ·У/100",t.gl,t.gi*(21.8+62)/100);
check("брутто→нетто→брутто",A.grossFromNet(A.netFromGross(2000,35),35),2000); check("нетто из 2 кг при 35%",A.netFromGross(2000,35),1300);
check("ст.л. масла = 14 г",A.toGrams(1,"ст.л.",A.findProduct("Растительное масло")),14);
check("мл масла = 0,92 г",A.toGrams(100,"мл",A.findProduct("Растительное масло")),92);
check("1/2 → 0,5",A.parseAmount("1/2"),0.5); check("1 1/2 → 1,5",A.parseAmount("1 1/2"),1.5);
console.log(fails?`\n${fails} ПРОВАЛЕНО`:"\nВсе проверки прошли");

console.log("\nСтартовые рецепты: способ | сырое ккал/порц → готовое | выход | ккал на 100 г готового");
for(const r of A.DEFAULT_RECIPES){const x=A.calcRecipe(r).total;
 console.log([r.title.slice(0,34).padEnd(34),r.method.padEnd(5),Math.round(x.raw.kcal/x.servings)+"→"+Math.round(x.perServing.kcal),Math.round(x.raw.grams)+"→"+Math.round(x.yieldGrams)+" г",Math.round(x.per100g.kcal)].join(" | "));}
process.exit(fails?1:0);
