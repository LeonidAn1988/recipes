// Проверка расчётов настоек: плотность, разведение (сверка с таблицей
// Фертмана и Р 50.2.041-2004), крепость после добавок, сроки.
// Запуск: node tests/tincture.test.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "tinctureCalc.js"), "utf8") +
  ";this.api={alcoholDensity,diluteSpirit,mixTincture,tinctureSchedule,bottleStage};", ctx);
const A = ctx.api;
let fails = 0;
function check(name, got, exp, tol) {
  const ok = Math.abs(got - exp) <= tol;
  if (!ok) fails++;
  console.log((ok ? "OK   " : "FAIL ") + name + ": " + (+got).toFixed(2) + " (ожидалось " + exp + " ± " + tol + ")");
}

// Плотность по объёмной доле, кг/м3 — Р 50.2.041-2004, прил. В.
for (const [abv, rho] of [[0, 998.2], [10, 984.7], [30, 962.2], [40, 948.0], [55, 920.0], [66, 895.2], [80, 859.3], [90, 829.2], [92, 822.4]]) {
  check(`плотность ${abv}% об.`, A.alcoholDensity(abv) * 1000, rho, 0.5);
}
// Вода на 1000 мл — таблица Фертмана.
for (const [from, to, water] of [[95, 40, 1443], [95, 50, 957], [95, 30, 2239], [90, 45, 1052], [80, 40, 1039], [70, 50, 417], [60, 40, 514], [50, 40, 255], [40, 30, 335], [85, 60, 443]]) {
  check(`разведение ${from}→${to}`, A.diluteSpirit(1000, from, to).water, water, water * 0.005 + 1);
}
// Итоговый объём меньше суммы из-за сжатия.
const d = A.diluteSpirit(1000, 96, 40);
check("96→40: объём меньше суммы (сжатие)", 1000 + d.water - d.finalVolume, 70, 25);
if (!A.diluteSpirit(1000, 40, 50).error) { fails++; console.log("FAIL повышение крепости водой должно быть ошибкой"); }
// Добавки: только вода — совпадает с разведением.
const m = A.mixTincture({ spiritVolume: 1000, spiritAbv: 95, water: 1443 });
check("смешивание = разведению Фертмана", m.abv, 40, 0.3);
// Сироп понижает крепость и даёт сахар г/л.
const s = A.mixTincture({ spiritVolume: 500, spiritAbv: 40, syrupSugar: 100, syrupWater: 100 });
check("сироп: крепость ниже 40", s.abv, 31.6, 1.5);
check("сироп: сахар г/л", s.sugarPerLiter, 150, 12);
// Сроки.
const sch = A.tinctureSchedule("2026-09-01", 14, 30);
if (sch.strain !== "2026-09-15" || sch.ready !== "2026-10-15") { fails++; console.log("FAIL сроки", JSON.stringify(sch)); } else console.log("OK   сроки: процедить 2026-09-15, готово 2026-10-15");
const b = { startDate: "2026-09-01", infuseDays: 14, restDays: 30 };
const early = { ...b, strained: true, strainedOn: "2026-09-10" };
const stages = [[b, "2026-09-10", "infusing"], [b, "2026-09-16", "strain-due"], [early, "2026-09-12", "resting"], [early, "2026-10-10", "ready"], [{ ...b, finished: true }, "2026-09-02", "finished"]]
  .map(([bt, t, e]) => A.bottleStage(bt, t) === e);
if (stages.includes(false)) { fails++; console.log("FAIL стадии"); } else console.log("OK   стадии бутылки");
console.log(fails ? `\n${fails} ПРОВАЛЕНО` : "\nВсе проверки прошли");
process.exit(fails ? 1 : 0);
