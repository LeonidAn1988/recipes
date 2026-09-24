// Проверка слияния книг при синхронизации. Главный сценарий — случай
// 24.09.2026: устройство без скачанной книги добавило человека и затёрло
// облако. Теперь слияние должно сохранить и облачное, и локальное.
// Запуск: node tests/merge.test.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "merge.js"), "utf8") + ";this.mergeBooks=mergeBooks;", ctx);
let fails = 0;
const ok = (name, cond) => { if (!cond) fails++; console.log((cond ? "OK   " : "FAIL ") + name); };

const cloud = {
  "recipes.data": [{ id: "seed-1", title: "Оладьи" }, { id: "r-1", title: "Рыба под маринадом" }],
  "recipes.profiles": { members: [{ id: "m-lenya", name: "Лёня" }], favorites: { "m-lenya": ["seed-1"] }, notes: { "m-lenya": { "r-1": "меньше соли" } } }
};
const freshDevice = {
  "recipes.data": null,
  "recipes.profiles": { members: [{ id: "m-babushka", name: "Бабушка Аня" }], favorites: {} }
};
const m = ctx.mergeBooks(freshDevice, cloud);
ok("свой рецепт сохранился", m["recipes.data"].some(r => r.title === "Рыба под маринадом"));
ok("Лёня сохранился", m["recipes.profiles"].members.some(x => x.name === "Лёня"));
ok("Бабушка добавилась", m["recipes.profiles"].members.some(x => x.name === "Бабушка Аня"));
ok("избранное Лёни сохранилось", m["recipes.profiles"].favorites["m-lenya"].includes("seed-1"));
ok("заметка Лёни сохранилась", m["recipes.profiles"].notes["m-lenya"]["r-1"] === "меньше соли");

// Правка одного рецепта на двух устройствах — побеждает более свежая.
const a = { "recipes.data": [{ id: "r-1", title: "Рыба (правка утром)", updatedAt: "2026-09-24T08:00:00Z" }] };
const b = { "recipes.data": [{ id: "r-1", title: "Рыба (правка вечером)", updatedAt: "2026-09-24T20:00:00Z" }] };
ok("побеждает более свежая правка", ctx.mergeBooks(a, b)["recipes.data"][0].title === "Рыба (правка вечером)");

// Удалённое не воскресает.
const del = { "recipes.data": [{ id: "seed-1", title: "Оладьи" }], "recipes.tombstones": { "r-1": "2026-09-24T21:00:00Z" } };
const md = ctx.mergeBooks(del, cloud);
ok("удалённый рецепт не воскрес", !md["recipes.data"].some(r => r.id === "r-1"));

// Удалённый человек не воскресает, его избранное уходит.
const delMember = { "recipes.profiles": { members: [] }, "recipes.tombstones": { "m-lenya": "2026-09-24T21:00:00Z" } };
ok("удалённый человек не воскрес", ctx.mergeBooks(delMember, cloud)["recipes.profiles"].members.length === 0);

// Отметки «куплено» и кладовая объединяются.
const p1 = { "recipes.planner": { checked: { "Соль": true }, pantry: ["Мука"] } };
const p2 = { "recipes.planner": { checked: { "Лук": true }, pantry: ["Сахар"] } };
const mp = ctx.mergeBooks(p1, p2)["recipes.planner"];
ok("отметки объединились", mp.checked["Соль"] && mp.checked["Лук"]);
ok("кладовая объединилась", mp.pantry.includes("Мука") && mp.pantry.includes("Сахар"));

console.log(fails ? `\n${fails} ПРОВАЛЕНО` : "\nВсе проверки прошли");
process.exit(fails ? 1 : 0);
