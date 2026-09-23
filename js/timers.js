// Кухонные таймеры: запускаются из шага рецепта, идут параллельно, видны
// плашкой внизу экрана на любой странице и переживают перезагрузку (хранится
// время окончания). По окончании — звук, вибрация и мигающая плашка.

const TIMERS_KEY = "recipes.timers";
let timers = [];
let timerTick = null;
let audioCtx = null;

function loadTimers() {
  try { timers = JSON.parse(localStorage.getItem(TIMERS_KEY) || "[]"); } catch { timers = []; }
}

function saveTimers() {
  try { localStorage.setItem(TIMERS_KEY, JSON.stringify(timers)); } catch {}
}

function initTimers() {
  loadTimers();
  const bar = document.createElement("div");
  bar.id = "timerBar";
  bar.className = "timer-bar hidden";
  bar.setAttribute("aria-live", "polite");
  bar.addEventListener("click", onTimerBarClick);
  document.body.appendChild(bar);
  // Звук в браузере разрешён только после действия пользователя — готовим
  // аудио при первом касании, чтобы сигнал сработал, даже если экран не трогали.
  document.addEventListener("pointerdown", unlockAudio, { once: true });
  renderTimers();
  if (timers.length) startTicking();
}

function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}

// label — что готовится («Шаг 2: тушить»), minutes — длительность.
function startTimer(label, minutes) {
  unlockAudio();
  const ms = Math.round(Number(minutes) * 60000);
  if (!(ms > 0)) return;
  timers.push({ id: newId("tm"), label, total: ms, endsAt: Date.now() + ms, pausedLeft: null, done: false });
  saveTimers();
  renderTimers();
  startTicking();
  announce(`Таймер на ${formatAmount(minutes)} мин запущен`);
}

function startTicking() {
  if (timerTick) return;
  timerTick = setInterval(() => {
    let changed = false;
    timers.forEach(t => {
      if (!t.done && t.pausedLeft === null && Date.now() >= t.endsAt) {
        t.done = true;
        changed = true;
        ring(t);
      }
    });
    if (changed) saveTimers();
    renderTimers();
    if (!timers.length) {
      clearInterval(timerTick);
      timerTick = null;
    }
  }, 1000);
}

function ring(t) {
  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
  try {
    unlockAudio();
    if (audioCtx) {
      // Три коротких сигнала по 0,25 с.
      [0, 0.45, 0.9].forEach(offset => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.4, audioCtx.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + offset + 0.25);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + offset);
        osc.stop(audioCtx.currentTime + offset + 0.3);
      });
    }
  } catch {}
  announce(`Готово: ${t.label}`);
}

function timerLeft(t) {
  if (t.done) return 0;
  return t.pausedLeft !== null ? t.pausedLeft : Math.max(0, t.endsAt - Date.now());
}

function clock(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return (h ? h + ":" : "") + mm + ":" + String(sec).padStart(2, "0");
}

function renderTimers() {
  const bar = el("timerBar");
  if (!bar) return;
  bar.classList.toggle("hidden", timers.length === 0);
  bar.classList.toggle("timer-ringing", timers.some(t => t.done));
  bar.innerHTML = timers.map(t => `
    <div class="timer${t.done ? " timer-done" : ""}">
      <span class="timer-clock">${t.done ? "Готово!" : clock(timerLeft(t))}</span>
      <span class="timer-label">${esc(t.label)}</span>
      ${t.done ? "" : `<button type="button" class="btn-icon" data-timer="${t.pausedLeft !== null ? "resume" : "pause"}" data-id="${t.id}" aria-label="${t.pausedLeft !== null ? "Продолжить" : "Пауза"}">${t.pausedLeft !== null ? "▶" : "⏸"}</button>
      <button type="button" class="btn-icon" data-timer="plus" data-id="${t.id}" aria-label="Добавить минуту">+1</button>`}
      <button type="button" class="btn-icon" data-timer="close" data-id="${t.id}" aria-label="${t.done ? "Выключить таймер" : "Отменить таймер"}">✕</button>
    </div>`).join("");
}

function onTimerBarClick(e) {
  const btn = e.target.closest("[data-timer]");
  if (!btn) return;
  const t = timers.find(x => x.id === btn.dataset.id);
  if (!t) return;
  switch (btn.dataset.timer) {
    case "pause": t.pausedLeft = timerLeft(t); break;
    case "resume": t.endsAt = Date.now() + t.pausedLeft; t.pausedLeft = null; break;
    case "plus":
      if (t.pausedLeft !== null) t.pausedLeft += 60000;
      else t.endsAt += 60000;
      break;
    case "close": timers = timers.filter(x => x.id !== t.id); break;
  }
  saveTimers();
  renderTimers();
}
