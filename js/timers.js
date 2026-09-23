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
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Таймеры");
  bar.addEventListener("click", onTimerBarClick);
  document.body.appendChild(bar);
  // Звук в браузере разрешён только после действия пользователя — готовим
  // аудио при первом касании, чтобы сигнал сработал, даже если экран не трогали.
  document.addEventListener("pointerdown", unlockAudio, { once: true });
  renderTimers();
  if (timers.length) startTicking();
  // В фоновой вкладке интервалы замедляются — при возврате сразу проверяем.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tickTimers();
  });
  // Таймеры, запущенные в другой вкладке, подхватываем.
  window.addEventListener("storage", e => {
    if (e.key === TIMERS_KEY) { loadTimers(); renderTimers(); if (timers.length) startTicking(); }
  });
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
  timerTick = setInterval(tickTimers, 1000);
}

// Раз в секунду: обновляем цифры, а сработавшие таймеры звенят каждые
// 8 секунд, пока их не выключат — одиночный сигнал на кухне легко пропустить.
function tickTimers() {
  let structural = false;
  const now = Date.now();
  timers.forEach(t => {
    if (!t.done && t.pausedLeft === null && now >= t.endsAt) {
      t.done = true;
      t.lastRing = 0;
      structural = true;
      announce(`Готово: ${t.label}`);
    }
    if (t.done && now - (t.lastRing || 0) >= 8000) {
      t.lastRing = now;
      ring();
    }
  });
  if (structural) {
    saveTimers();
    renderTimers();
  } else {
    updateTimerClocks();
  }
  if (!timers.length) {
    clearInterval(timerTick);
    timerTick = null;
  }
}

function ring() {
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

// Перестраиваем плашку только при добавлении, удалении или смене состояния
// таймера: так не слетает фокус с кнопок и не теряются нажатия.
function renderTimers() {
  const bar = el("timerBar");
  if (!bar) return;
  bar.classList.toggle("hidden", timers.length === 0);
  bar.classList.toggle("timer-ringing", timers.some(t => t.done));
  const focused = document.activeElement && bar.contains(document.activeElement)
    ? { id: document.activeElement.dataset.id, act: document.activeElement.dataset.timer } : null;
  bar.innerHTML = timers.map(t => `
    <div class="timer${t.done ? " timer-done" : ""}" data-timer-id="${t.id}">
      <span class="timer-clock">${t.done ? "Готово!" : clock(timerLeft(t))}</span>
      <span class="timer-label">${esc(t.label)}</span>
      ${t.done ? "" : `<button type="button" class="btn-icon timer-btn" data-timer="${t.pausedLeft !== null ? "resume" : "pause"}" data-id="${t.id}" aria-label="${t.pausedLeft !== null ? "Продолжить" : "Пауза"}: ${esc(t.label)}">${t.pausedLeft !== null ? "▶" : "⏸"}</button>
      <button type="button" class="btn-icon timer-btn" data-timer="plus" data-id="${t.id}" aria-label="Добавить минуту: ${esc(t.label)}">+1</button>`}
      <button type="button" class="btn-icon timer-btn" data-timer="close" data-id="${t.id}" aria-label="${t.done ? "Выключить" : "Отменить"}: ${esc(t.label)}">✕</button>
    </div>`).join("");
  if (focused) {
    const again = bar.querySelector(`[data-id="${focused.id}"][data-timer="${focused.act}"]`) || bar.querySelector(`[data-id="${focused.id}"]`);
    if (again) again.focus();
  }
  // Высота плашки — чтобы низ страницы и режима готовки не прятался под ней.
  document.body.style.setProperty("--timers-h", timers.length ? bar.offsetHeight + 16 + "px" : "0px");
}

function updateTimerClocks() {
  const bar = el("timerBar");
  if (!bar) return;
  timers.forEach(t => {
    const clockEl = bar.querySelector(`[data-timer-id="${t.id}"] .timer-clock`);
    if (clockEl && !t.done) clockEl.textContent = clock(timerLeft(t));
  });
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
