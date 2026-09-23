// Проверка сути шагов: ингредиенты в тексте шага, время из текста, общее
// время с параллельными шагами, способ приготовления по шагам.
// Запуск: node tests/steps.test.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const ctx = vm.createContext({});
vm.runInContext(["products", "nutrition", "recipes", "stepsMeta"].map(f => fs.readFileSync(path.join(__dirname, "..", "js", f + ".js"), "utf8")).join("\n") +
  ";this.api={ingredientsInStep,stepMinutes,stepsTimeline,cookingMethodFromSteps};", ctx);
const A = ctx.api;
let fails = 0;
const ok = (name, cond, extra = "") => { if (!cond) fails++; console.log((cond ? "OK   " : "FAIL ") + name + (cond ? "" : " " + extra)); };
const ings = ["Кефир 1%", "Яйцо куриное", "Мука пшеничная в/с", "Сахар", "Сода пищевая", "Перец болгарский", "Огурец", "Лук репчатый", "Морковь"].map(product => ({ product }));
const names = t => A.ingredientsInStep(t, ings).map(i => ings[i].product);
ok("кефир, яйца, сахар", JSON.stringify(names("Смешать кефир с яйцами и сахаром.")) === JSON.stringify(["Кефир 1%", "Яйцо куриное", "Сахар"]));
ok("муку и соду", names("Всыпать муку, добавить соду").join() === "Мука пшеничная в/с,Сода пищевая");
ok("«перемешать» ≠ перец", !names("Всё перемешать").includes("Перец болгарский"));
ok("беглая гласная: перца, огурцы", names("Добавить перца и огурцы").join() === "Перец болгарский,Огурец");
ok("лук и морковь", names("Лук и морковь обжарить").join() === "Лук репчатый,Морковь");
ok("время: 5 минут", A.stepMinutes({ text: "варить 5 минут" }) === 5);
ok("время: 35–40 минут → 35", A.stepMinutes({ text: "Выпекать 35–40 минут" }) === 35);
ok("время: 1,5 часа → 90", A.stepMinutes({ text: "тушить 1,5 часа" }) === 90);
ok("время: секунды не таймер", A.stepMinutes({ text: "прогреть 30 секунд" }) === 0);
ok("время: поле важнее текста", A.stepMinutes({ text: "5 минут", minutes: 12 }) === 12);
const steps = [{ minutes: 10 }, { kind: "heat", method: "stew", minutes: 25 }, { minutes: 15, parallel: true }, { kind: "heat", method: "stew", minutes: 50 }];
ok("общее время 10 + max(25,15) + 50 = 85", A.stepsTimeline(steps).total === 85);
ok("способ по шагам — тушение", A.cookingMethodFromSteps(steps) === "stew");
console.log(fails ? `\n${fails} ПРОВАЛЕНО` : "\nВсе проверки прошли");
process.exit(fails ? 1 : 0);
