// Проверка режимов автоклава: соответствие таблицам NCHFP, отказы для
// непроверенных сочетаний, давление по высоте, расчёт партии.
// Запуск: node tests/canning.test.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const ctx = vm.createContext({});
vm.runInContext(["canningData", "canningCalc"].map(f => fs.readFileSync(path.join(__dirname, "..", "js", f + ".js"), "utf8")).join("\n") +
  ";this.api={canningMode,canningBatch,CANNING_PRODUCTS,CANNING_JARS};", ctx);
const A = ctx.api;
let fails = 0;
const ok = (name, cond, extra = "") => { if (!cond) fails++; console.log((cond ? "OK   " : "FAIL ") + name + (cond ? "" : " " + extra)); };

// Таблицы NCHFP (минуты: пинта / кварта), сняты с сайта 2026-09-24.
const NCHFP = {
  "meat-chunks": [75, 90], "meat-ground": [75, 90], "chicken-boneless": [75, 90], "chicken-bone": [65, 75],
  fish: [100, null], "meat-stock": [20, 25], "poultry-stock": [20, 25], carrots: [25, 30], beets: [30, 35],
  potatoes: [35, 40], "green-beans": [20, 25], corn: [55, 85], peas: [40, 40], "dry-beans": [75, 90],
  "mixed-veg": [75, 90], pumpkin: [55, 90], mushrooms: [45, null], peppers: [35, null]
};
for (const [id, [pint, quart]] of Object.entries(NCHFP)) {
  const p = A.CANNING_PRODUCTS.find(x => x.id === id);
  ok(`${id}: пинта ${pint}, кварта ${quart}`, p && p.pint === pint && p.quart === quart, JSON.stringify(p && [p.pint, p.quart]));
}
ok("все продукты покрыты тестом", A.CANNING_PRODUCTS.every(p => NCHFP[p.id]));

// Давление по высоте.
const psi = (g, m) => A.canningMode("meat-chunks", "470", g, m).psi;
ok("грузовой, 150 м → 10 psi", psi("weighted", 150) === 10);
ok("грузовой, 400 м → 15 psi", psi("weighted", 400) === 15);
ok("стрелочный, 150 м → 11 psi", psi("dial", 150) === 11);
ok("стрелочный, 700 м → 12 psi", psi("dial", 700) === 12);
ok("стрелочный, 1500 м → 13 psi", psi("dial", 1500) === 13);
ok("стрелочный, 2000 м → 14 psi", psi("dial", 2000) === 14);
ok("стрелочный, 2600 м → отказ", A.canningMode("meat-chunks", "470", "dial", 2600).ok === false);

// Банки.
ok("мясо 0,47 л → 75 мин", A.canningMode("meat-chunks", "470", "weighted", 100).minutes === 75);
ok("мясо 0,5–0,7 л → время кварты 90 мин (правило 1½ пинты)", A.canningMode("meat-chunks", "500", "weighted", 100).minutes === 90);
ok("мясо 0,95 л → 90 мин", A.canningMode("meat-chunks", "950", "weighted", 100).minutes === 90);
ok("мясо 1 л → отказ", A.canningMode("meat-chunks", "1000", "weighted", 100).ok === false);
ok("рыба 0,47 л → 100 мин", A.canningMode("fish", "470", "weighted", 100).minutes === 100);
ok("рыба 0,5 л → отказ", A.canningMode("fish", "500", "weighted", 100).ok === false);
ok("рыба 0,95 л → отказ", A.canningMode("fish", "950", "weighted", 100).ok === false);
ok("грибы 0,25 л → 45 мин", A.canningMode("mushrooms", "250", "dial", 100).minutes === 45);

// Партия.
const prod = A.CANNING_PRODUCTS.find(p => p.id === "meat-chunks");
const jar = A.CANNING_JARS.find(j => j.id === "950");
const b = A.canningBatch(10, 700, 7, prod, jar);
ok("10 кг по 700 г → 15 банок, 3 загрузки, в последней 1", b.jars === 15 && b.loads === 3 && b.lastLoad === 1, JSON.stringify(b));
ok("соль для кварты = 2 × норма пинты", b.saltTsp === 1);
const ground = A.CANNING_PRODUCTS.find(p => p.id === "meat-ground");
ok("соль фарша в 0,5–0,7 л ≈ 1½ ч.л. (по объёму)", A.canningBatch(1, 500, 7, ground, A.CANNING_JARS.find(j => j.id === "500")).saltTsp === 1.5);
ok("курица: отступ 3,2 см (1¼ дюйма)", A.CANNING_PRODUCTS.find(p => p.id === "chicken-bone").headspace === 3.2);

console.log(fails ? `\n${fails} ПРОВАЛЕНО` : "\nВсе проверки прошли");
process.exit(fails ? 1 : 0);
