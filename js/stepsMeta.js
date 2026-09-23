// Суть шага приготовления: этап, время, посуда, способ, огонь, режим прибора.
//
// Шаг рецепта — это текст плюс необязательные поля:
//   kind     — этап (подготовка, термообработка, …)
//   minutes  — сколько длится шаг
//   parallel — идёт одновременно с предыдущим («в это время почистил рыбу»)
//   device, method, heat, temp, program — для термообработки
// Из этого считается общее время рецепта и можно подсказать способ
// приготовления для расчёта БЖУ.

const STEP_KINDS = [
  { id: "prep", label: "Подготовка" },
  { id: "heat", label: "Термообработка" },
  { id: "assembly", label: "Сборка" },
  { id: "rest", label: "Настаивание, остывание" },
  { id: "serve", label: "Подача" }
];

// Действия подготовки — для иконки и подписи шага.
const PREP_ACTIONS = [
  { id: "cut", label: "Нарезать", icon: "🔪" },
  { id: "grate", label: "Натереть", icon: "🔪" },
  { id: "peel", label: "Очистить", icon: "🔪" },
  { id: "butcher", label: "Разделать", icon: "🔪" },
  { id: "mix", label: "Смешать", icon: "🥣" },
  { id: "marinate", label: "Замариновать", icon: "🧂" }
];

// Иконки: посуда важнее способа — «сковорода» понятнее, чем «жарка».
const DEVICE_ICONS = {
  "Сковорода": "🍳", "Сотейник": "🥘", "Казан": "🥘", "Кастрюля": "🍲", "Мультиварка": "🍲", "Скороварка": "🍲",
  "Пароварка": "♨️", "Духовка": "🔥", "Аэрогриль": "🔥", "Гриль": "🔥", "Вафельница": "🧇", "Микроволновка": "⚡", "Автоклав": "🫙"
};
const METHOD_ICONS = { fry: "🍳", saute: "🍳", stew: "🥘", simmer: "🥘", boil: "🍲", blanch: "🍲", steam: "♨️", bake: "🔥", grill: "🔥" };
const KIND_ICONS = { prep: "🔪", heat: "🔥", assembly: "🥣", rest: "⏳", serve: "🍽️" };

function stepIcon(step) {
  if (step.kind === "prep") return (PREP_ACTIONS.find(a => a.id === step.action) || {}).icon || KIND_ICONS.prep;
  if (step.kind === "heat") return DEVICE_ICONS[step.device] || METHOD_ICONS[step.method] || KIND_ICONS.heat;
  return KIND_ICONS[step.kind] || "";
}

const STEP_DEVICES = ["Сковорода", "Сотейник", "Кастрюля", "Казан", "Духовка", "Мультиварка", "Скороварка",
  "Пароварка", "Аэрогриль", "Гриль", "Вафельница", "Микроволновка", "Автоклав"];

// method → способ приготовления для расчёта потерь (COOKING_METHODS в nutrition.js).
const STEP_METHODS = [
  { id: "fry", label: "Жарка", cooking: "fry" },
  { id: "saute", label: "Пассерование", cooking: "fry" },
  { id: "stew", label: "Тушение", cooking: "stew" },
  { id: "simmer", label: "Томление", cooking: "stew" },
  { id: "boil", label: "Варка", cooking: "boil" },
  { id: "blanch", label: "Бланширование", cooking: "boil" },
  { id: "steam", label: "На пару", cooking: "steam" },
  { id: "bake", label: "Запекание", cooking: "bake" },
  { id: "grill", label: "Гриль", cooking: "fry" }
];

const HEAT_LEVELS = [
  { id: "low", label: "слабый огонь" },
  { id: "medium", label: "средний огонь" },
  { id: "high", label: "сильный огонь" }
];

const labelOf = (list, id) => (list.find(x => x.id === id) || {}).label || "";

// --- Редактор в форме рецепта ---

function metaSelect(className, placeholder, options, value, ariaLabel) {
  const select = document.createElement("select");
  select.className = className;
  select.setAttribute("aria-label", ariaLabel);
  select.appendChild(new Option(placeholder, ""));
  options.forEach(o => select.appendChild(typeof o === "string" ? new Option(o, o) : new Option(o.label, o.id)));
  select.value = value || "";
  return select;
}

function metaInput(className, placeholder, value, ariaLabel, inputmode) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = className;
  input.placeholder = placeholder;
  input.value = value ?? "";
  input.autocomplete = "off";
  input.setAttribute("aria-label", ariaLabel);
  if (inputmode) input.inputMode = inputmode;
  return input;
}

function stepMetaEditor(step = {}) {
  const box = document.createElement("div");
  box.className = "step-meta";

  const main = document.createElement("div");
  main.className = "step-meta-row";
  const kind = metaSelect("sm-kind", "Этап…", STEP_KINDS, step.kind, "Этап шага");
  const minutes = metaInput("sm-minutes", "мин", step.minutes || "", "Время шага, минут", "numeric");
  const parallelLabel = document.createElement("label");
  parallelLabel.className = "checkbox-label sm-parallel";
  const parallel = document.createElement("input");
  parallel.type = "checkbox";
  parallel.className = "sm-parallel-input";
  parallel.checked = Boolean(step.parallel);
  parallelLabel.append(parallel, " одновременно с предыдущим");
  const minutesWrap = document.createElement("span");
  minutesWrap.className = "sm-minutes-wrap";
  minutesWrap.append(minutes, " мин");
  const action = metaSelect("sm-action", "Действие…", PREP_ACTIONS, step.action, "Действие подготовки");
  main.append(kind, action, minutesWrap, parallelLabel);

  const heat = document.createElement("div");
  heat.className = "step-meta-row sm-heat";
  heat.append(
    metaSelect("sm-device", "Посуда, прибор…", STEP_DEVICES, step.device, "Посуда или прибор"),
    metaSelect("sm-method", "Способ…", STEP_METHODS, step.method, "Способ термообработки"),
    metaSelect("sm-heat", "Огонь…", HEAT_LEVELS, step.heat, "Сила огня"),
    metaInput("sm-temp", "°C", step.temp || "", "Температура, °C", "numeric"),
    metaInput("sm-program", "режим прибора, напр. «Тушение рыба»", step.program || "", "Режим прибора")
  );

  const sync = () => {
    heat.classList.toggle("hidden", kind.value !== "heat");
    action.classList.toggle("hidden", kind.value !== "prep");
  };
  kind.addEventListener("change", sync);
  sync();

  box.append(main, heat);
  return box;
}

function readStepMeta(row) {
  const v = cls => (row.querySelector("." + cls) || {}).value || "";
  const meta = {};
  const kind = v("sm-kind");
  if (kind) meta.kind = kind;
  const minutes = Math.round(parseAmount(v("sm-minutes")) || 0);
  if (minutes > 0) meta.minutes = minutes;
  if ((row.querySelector(".sm-parallel-input") || {}).checked) meta.parallel = true;
  if (kind === "prep" && v("sm-action")) meta.action = v("sm-action");
  if (kind === "heat") {
    if (v("sm-device")) meta.device = v("sm-device");
    if (v("sm-method")) meta.method = v("sm-method");
    if (v("sm-heat")) meta.heat = v("sm-heat");
    const temp = parseAmount(v("sm-temp"));
    if (temp > 0) meta.temp = temp;
    if (v("sm-program").trim()) meta.program = v("sm-program").trim();
  }
  return meta;
}

// --- Показ в карточке рецепта ---

// Короткая строка параметров: «Сковорода · тушение · средний огонь · 20 мин».
function stepMetaLine(step) {
  const parts = [];
  if (step.kind === "prep" && step.action) parts.push(labelOf(PREP_ACTIONS, step.action));
  if (step.kind === "heat") {
    if (step.device) parts.push(step.device);
    if (step.method) parts.push(labelOf(STEP_METHODS, step.method).toLowerCase());
    if (step.program) parts.push(`режим «${step.program}»`);
    if (step.heat) parts.push(labelOf(HEAT_LEVELS, step.heat));
    if (step.temp) parts.push(`${formatAmount(step.temp)} °C`);
  }
  return parts.join(" · ");
}

// Общее время: шаги идут друг за другом, а «одновременные» — внутри
// предыдущего блока (блок длится по самому долгому шагу).
function stepsTimeline(steps) {
  const blocks = [];
  let known = 0;
  (steps || []).forEach(s => {
    const m = Number(s.minutes) || 0;
    if (m > 0) known++;
    if (s.parallel && blocks.length) blocks[blocks.length - 1] = Math.max(blocks[blocks.length - 1], m);
    else blocks.push(m);
  });
  const heat = (steps || []).filter(s => s.kind === "heat").reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
  return { total: blocks.reduce((a, b) => a + b, 0), heat, known };
}

// Способ приготовления для БЖУ по шагам: способ самого долгого шага
// термообработки. null — если в шагах способ не указан.
function cookingMethodFromSteps(steps) {
  let best = null;
  let bestMinutes = -1;
  (steps || []).forEach(s => {
    if (s.kind !== "heat" || !s.method) return;
    const m = Number(s.minutes) || 0;
    if (m > bestMinutes) {
      best = s.method;
      bestMinutes = m;
    }
  });
  const found = STEP_METHODS.find(x => x.id === best);
  return found ? found.cooking : null;
}

// --- Ингредиенты, упомянутые в шаге ---
//
// Чтобы не листать к списку, под шагом показываем количество ингредиентов,
// которые в нём упомянуты. Разметка не нужна: название продукта ищем в тексте
// шага по основам слов («Морковь» → «морк»: «натёр морковь», «моркови»).
// Уточняющие слова («куриное», «сухие», «в/с») не участвуют.

const INGREDIENT_STOPWORDS = new Set([
  "сырой", "сырая", "сырое", "сухой", "сухая", "сухие", "свежий", "свежая", "свежие", "молотый", "молотая",
  "консервированный", "консервированная", "консервированные", "пшеничная", "белый", "белая", "бурый", "красная",
  "зеленый", "зеленая", "репчатый", "куриное", "вареная", "вареный", "темный", "молочный",
  "порошок", "натуральный", "обезжиренный", "твердый", "самоподнимающаяся", "стеблевой", "листовой",
  "собственном", "соку", "грудка", "бедро", "ванильный", "пищевая", "сахарная", "соус"
]);

const norm = t => String(t || "").toLowerCase().replace(/ё/g, "е");

// Основы слова названия и предельная длина совпадающего слова в тексте:
// короткие слова — по трём буквам («яйцо» → «яйца», «муку»), длинные — без
// окончания; беглая гласная учтена («перец» → «перца», «огурец» → «огурцы»).
// Предел длины отсекает однокоренные глаголы («перемешать» ≠ «перец»).
function wordStems(name) {
  const out = [];
  norm(name).replace(/\([^)]*\)/g, " ").split(/[^a-zа-я]+/).forEach(w => {
    if (w.length < 3 || INGREDIENT_STOPWORDS.has(w)) return;
    if (w.length <= 4) {
      out.push({ stem: w.slice(0, 3), maxLen: w.length + 3 });
      return;
    }
    out.push({ stem: w.slice(0, Math.max(4, w.length - 2)), maxLen: w.length + 3 });
    if (/[ео][бвгджзклмнпрстфхцчшщ]$/.test(w)) out.push({ stem: w.slice(0, -2) + w.slice(-1), maxLen: w.length + 3 });
  });
  return out;
}

// Возвращает индексы ингредиентов рецепта, упомянутых в тексте шага.
function ingredientsInStep(text, ingredients) {
  const words = norm(text).split(/[^a-zа-я]+/).filter(Boolean);
  const found = [];
  (ingredients || []).forEach((ing, i) => {
    const stems = wordStems(ing.product);
    if (stems.some(({ stem, maxLen }) => words.some(w => w.startsWith(stem) && w.length <= maxLen))) found.push(i);
  });
  return found;
}

// Время шага: указанное в поле или найденное в тексте («варить 5 минут»,
// «35–40 минут», «1 час», «1,5 часа»). Для диапазона берём нижнюю границу —
// таймер лучше пусть позовёт проверить готовность пораньше.
function stepMinutes(step) {
  if (Number(step.minutes) > 0) return Number(step.minutes);
  const t = norm(step.text).replace(/,/g, ".");
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:[–—-]\s*\d+(?:\.\d+)?\s*)?(мин|час|ч(?![а-я]))/);
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2].startsWith("мин") ? Math.round(n) : Math.round(n * 60);
}
