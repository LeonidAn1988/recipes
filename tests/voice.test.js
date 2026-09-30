// Проверка разбора голосовых команд режима готовки.
// Запуск: node tests/voice.test.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const ctx = vm.createContext({});
vm.runInContext(["products", "nutrition", "recipes", "stepsMeta", "voice"].map(f => fs.readFileSync(path.join(__dirname, "..", "js", f + ".js"), "utf8")).join("\n") +
  ";this.api={parseVoiceCommand,howMuchAnswer,speechText};", ctx);
const A = ctx.api;
let fails = 0;
const ok = (name, cond, extra = "") => { if (!cond) fails++; console.log((cond ? "OK   " : "FAIL ") + name + (cond ? "" : " " + extra)); };
const ings = [
  { product: "Мука пшеничная в/с", amount: 300, unit: "г" },
  { product: "Яйцо куриное", amount: 2, unit: "шт" },
  { product: "Масло сливочное", amount: 50, unit: "г" },
  { product: "Сахар", amount: 2, unit: "ст.л." },
  { product: "Сахар", amount: 65, unit: "г" },
  { product: "Соль", amount: 1, unit: "по вкусу" },
  { product: "Молоко 2.5%", amount: 0.5, unit: "стакан" }
];
const cmd = t => (A.parseVoiceCommand(t, ings) || {}).cmd;
const much = t => A.howMuchAnswer(A.parseVoiceCommand(t, ings).indices, ings);
ok("дальше", cmd("Дальше") === "next");
ok("следующий шаг", cmd("следующий шаг") === "next");
ok("назад", cmd("назад") === "prev");
ok("предыдущий", cmd("предыдущий шаг") === "prev");
ok("повтори", cmd("повтори пожалуйста") === "repeat");
ok("ещё раз (ё)", cmd("ещё раз") === "repeat");
ok("стоп", cmd("стоп") === "stop");
ok("посторонняя речь — не команда", A.parseVoiceCommand("мама а где соль лежит", ings) === null);
ok("«перемешать» — не команда", A.parseVoiceCommand("надо перемешать", ings) === null);
ok("сколько муки", much("сколько муки") === "Мука пшеничная в/с: 300 грамм.", much("сколько муки"));
ok("сколько яиц", much("Сколько яиц?") === "Яйцо куриное: 2 штуки.", much("Сколько яиц?"));
ok("сколько масла", much("а сколько масла") === "Масло сливочное: 50 грамм.");
ok("сахар в двух строках", much("сколько сахара") === "Сахар: 2 столовые ложки. Сахар: 65 грамм.", much("сколько сахара"));
ok("по вкусу", much("сколько соли") === "Соль: по вкусу.");
ok("дробное количество", much("сколько молока") === "Молоко 2.5%: 0,5 стакана.", much("сколько молока"));
ok("5 штук", A.howMuchAnswer([0], [{ product: "Яйцо", amount: 5, unit: "шт" }]) === "Яйцо: 5 штук.");
ok("1 столовая ложка", A.howMuchAnswer([0], [{ product: "Мёд", amount: 1, unit: "ст.л." }]) === "Мёд: 1 столовая ложка.");
ok("1,5 столовой ложки", A.howMuchAnswer([0], [{ product: "Мёд", amount: 1.5, unit: "ст.л." }]) === "Мёд: 1,5 столовой ложки.");
ok("картошки → картофель", A.howMuchAnswer(A.parseVoiceCommand("сколько картошки", [{ product: "Картофель", amount: 800, unit: "г" }]).indices, [{ product: "Картофель", amount: 800, unit: "г" }]) === "Картофель: 800 грамм.");
ok("чтение шага", A.speechText("Вмешать 1–2 ст.л. манки, запекать при 180 °C 15–20 минут") === "Вмешать от 1 до 2 столовые ложки манки, запекать при 180 градусов от 15 до 20 минут");
ok("нет продукта", much("сколько кефира") === "Не нашла такой продукт в рецепте.");
ok("«сколько» раньше «дальше»", cmd("сколько муки дальше") === "howmuch");
ok("таймер без минут", JSON.stringify(A.parseVoiceCommand("таймер", ings)) === '{"cmd":"timer","minutes":0}');
ok("таймер на 5 минут", A.parseVoiceCommand("поставь таймер на 5 минут", ings).minutes === 5);
ok("засеки 10 мин", A.parseVoiceCommand("засеки 10 мин", ings).minutes === 10);
ok("ингредиенты", cmd("покажи ингредиенты") === "ings");
console.log(fails ? `\n${fails} ПРОВАЛЕНО` : "\nВсе проверки прошли");
process.exit(fails ? 1 : 0);
