// Голосовое управление режимом готовки: «дальше», «назад», «повтори»,
// «таймер», «сколько муки?», «стоп». Распознавание — Web Speech API браузера
// (Chrome отправляет звук на серверы Google, Safari — Apple), ответы — синтез
// речи. Команды разбирает чистая функция parseVoiceCommand — её проверяют
// тесты (tests/voice.test.js), остальное — работа с микрофоном и динамиком.

// Разбор фразы в команду. ingredients — ингредиенты рецепта,
// для «сколько …» возвращаются номера найденных строк.
function parseVoiceCommand(text, ingredients) {
  const t = String(text || "").toLowerCase().replace(/ё/g, "е").trim();
  if (!t) return null;
  const has = re => re.test(t);
  if (has(/(^|\s)(сколько|скока|какое количество)(\s|$)/)) {
    const rest = t.replace(/.*?(сколько|скока|какое количество)/, "")
      .replace(/картошк\S*/g, "картофеля").replace(/яичек/g, "яиц");
    return { cmd: "howmuch", indices: ingredientsInStep(rest, ingredients) };
  }
  if (has(/(^|\s)(стоп|хватит|перестань|выключи микрофон|не слушай)/)) return { cmd: "stop" };
  if (has(/(таймер|засеки|засечь)/)) {
    const minutes = stepMinutes({ text: t.replace(/(\d+)\s*мин(?![а-я])/, "$1 минут") });
    return { cmd: "timer", minutes: minutes || 0 };
  }
  if (has(/(^|\s)(назад|предыдущ\S*|вернись|верни)(\s|$)/)) return { cmd: "prev" };
  if (has(/(^|\s)(дальше|далее|следующ\S*|вперед|готово|сделал\S*)(\s|$)/)) return { cmd: "next" };
  if (has(/(повтори|прочитай|прочти|еще раз|что делать|какой шаг)/)) return { cmd: "repeat" };
  if (has(/(ингредиент|продукты|список)/)) return { cmd: "ings" };
  if (has(/(^|\s)(шаги|к шагам)(\s|$)/)) return { cmd: "steps" };
  return null;
}

// Количество для чтения вслух: «300 грамм», «2 столовые ложки», «5 штук».
// Формы: для 1, для 2–4, для 5 и больше, для дробного («1,5 столовой ложки»).
const SPOKEN_UNITS = {
  "г": ["грамм", "грамма", "грамм", "грамма"], "кг": ["килограмм", "килограмма", "килограмм", "килограмма"],
  "мл": ["миллилитр", "миллилитра", "миллилитров", "миллилитра"], "л": ["литр", "литра", "литров", "литра"],
  "шт": ["штука", "штуки", "штук", "штуки"], "ст.л.": ["столовая ложка", "столовые ложки", "столовых ложек", "столовой ложки"],
  "ч.л.": ["чайная ложка", "чайные ложки", "чайных ложек", "чайной ложки"], "стакан": ["стакан", "стакана", "стаканов", "стакана"],
  "зубчик": ["зубчик", "зубчика", "зубчиков", "зубчика"], "пучок": ["пучок", "пучка", "пучков", "пучка"],
  "щепотка": ["щепотка", "щепотки", "щепоток", "щепотки"]
};

function unitForm(n, forms) {
  if (!Number.isInteger(n)) return forms[3];
  const d = n % 10, dd = n % 100;
  if (d === 1 && dd !== 11) return forms[0];
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return forms[1];
  return forms[2];
}

function spokenAmount(ing) {
  if (ing.unit === "по вкусу") return "по вкусу";
  const n = Math.round((Number(ing.amount) || 0) * 100) / 100;
  const forms = SPOKEN_UNITS[ing.unit];
  return `${String(n).replace(".", ",")} ${forms ? unitForm(n, forms) : ing.unit}`;
}

function howMuchAnswer(indices, ingredients) {
  if (!indices.length) return "Не нашла такой продукт в рецепте.";
  return indices.map(i => `${ingredients[i].product}: ${spokenAmount(ingredients[i])}`).join(". ") + ".";
}

// --- Микрофон и речь ---

const voice = { on: false, rec: null, listening: false, speaking: false, restartTimer: null };

function voiceSupported() {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ru-RU";
  const ru = speechSynthesis.getVoices().find(v => /^ru/i.test(v.lang));
  if (ru) u.voice = ru;
  // Пока говорим — не слушаем, иначе приложение услышит само себя.
  voice.speaking = true;
  u.onend = u.onerror = () => { voice.speaking = false; };
  speechSynthesis.speak(u);
}

function setVoiceStatus(text) {
  const box = el("cookVoice");
  if (!box) return;
  box.classList.toggle("hidden", !voice.on);
  box.textContent = text;
}

function startVoice() {
  if (!voiceSupported() || voice.on) return;
  voice.on = true;
  updateVoiceButton();
  setVoiceStatus("Слушаю: «дальше», «назад», «повтори», «таймер», «сколько муки?», «стоп»");
  listen();
  speak("Слушаю.");
}

function stopVoice(silent) {
  if (!voice.on) return;
  voice.on = false;
  clearTimeout(voice.restartTimer);
  if (voice.rec) { voice.rec.onend = null; try { voice.rec.abort(); } catch {} }
  voice.rec = null;
  voice.listening = false;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  voice.speaking = false;
  updateVoiceButton();
  setVoiceStatus("");
  if (!silent) announce("Голосовое управление выключено");
}

function listen() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new Rec();
  rec.lang = "ru-RU";
  rec.continuous = true;
  rec.interimResults = false;
  rec.maxAlternatives = 3;
  rec.onresult = e => {
    const res = e.results[e.results.length - 1];
    if (!res.isFinal || voice.speaking) return;
    // Берём первый вариант, который похож на команду.
    const alts = [...res].map(a => a.transcript);
    let command = null;
    const heard = alts.find(a => (command = parseVoiceCommand(a, cook && cook.recipe.ingredients))) || alts[0];
    handleVoice(command, heard);
  };
  rec.onerror = e => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      stopVoice(true);
      alert("Нет доступа к микрофону. Разрешите его для этого сайта в настройках браузера.");
    }
  };
  // Браузер сам обрывает распознавание после паузы — перезапускаем,
  // пока режим готовки открыт и вкладка на экране.
  rec.onend = () => {
    voice.listening = false;
    if (!voice.on) return;
    voice.restartTimer = setTimeout(() => {
      if (voice.on && cook && document.visibilityState === "visible") listen();
    }, 300);
  };
  voice.rec = rec;
  try { rec.start(); voice.listening = true; } catch {}
}

// После возврата в приложение браузер уже оборвал распознавание — слушаем снова.
function resumeVoice() {
  if (voice.on && !voice.listening && cook) listen();
}

function handleVoice(command, heard) {
  if (!cook) return;
  const steps = cook.recipe.steps || [];
  const say = (text, status) => { setVoiceStatus(`«${heard}» — ${status || text}`); speak(text); };
  if (!command) return setVoiceStatus(`«${heard}» — не поняла. Скажите «дальше», «назад», «повтори» или «сколько …?»`);
  switch (command.cmd) {
    case "next":
      if (cook.tab !== "steps") { cook.tab = "steps"; renderCook(); }
      if (onLastStep()) return say("Это последний шаг. Чтобы завершить, нажмите кнопку «Завершить».");
      cookGo(1);
      return say(stepSpeech());
    case "prev":
      if (cook.step === 0) return say("Это первый шаг.");
      cookGo(-1);
      return say(stepSpeech());
    case "repeat":
      return say(stepSpeech());
    case "howmuch":
      return say(howMuchAnswer(command.indices, cook.recipe.ingredients));
    case "timer": {
      const minutes = command.minutes || stepMinutes(steps[cook.step] || {});
      if (!minutes) return say("Скажите, на сколько минут: например, «таймер на пять минут».");
      startTimer(`${cook.recipe.title}, шаг ${cook.step + 1}`, minutes);
      return say(`Таймер на ${String(minutes).replace(".", ",")} минут запущен.`);
    }
    case "ings":
      cook.tab = "ings";
      renderCook();
      return say("Список ингредиентов на экране.");
    case "steps":
      cook.tab = "steps";
      renderCook();
      return say(stepSpeech());
    case "stop":
      stopVoice(true);
      return speak("Микрофон выключен.");
  }
}

function stepSpeech() {
  const steps = cook.recipe.steps || [];
  const step = steps[cook.step];
  return step ? `Шаг ${cook.step + 1}. ${speechText(step.text)}` : "";
}

// Сокращения и диапазоны синтезатор читает плохо — раскрываем.
function speechText(text) {
  return String(text)
    .replace(/(\d+)\s*[–—-]\s*(\d+)/g, "от $1 до $2")
    .replace(/ст\.\s?л\./g, "столовые ложки")
    .replace(/ч\.\s?л\./g, "чайные ложки")
    .replace(/\s?°\s?C/g, " градусов");
}

function updateVoiceButton() {
  const btn = el("cookVoiceBtn");
  if (!btn) return;
  btn.setAttribute("aria-pressed", String(voice.on));
  btn.classList.toggle("active", voice.on);
  btn.setAttribute("aria-label", voice.on ? "Выключить голосовое управление" : "Включить голосовое управление");
}
