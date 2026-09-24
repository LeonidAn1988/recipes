// Облачное сохранение книги в секретный GitHub Gist.
//
// Каждое устройство держит свою копию в localStorage, а Gist служит общей
// точкой: после любой правки книга целиком уходит в облако, при запуске и при
// возврате в приложение подтягивается более свежая версия. Конфликты решаются
// по времени последней правки — для одного владельца этого достаточно.
//
// Токен (classic, только право gist) вводит сам пользователь один раз на
// каждом устройстве; хранится он в localStorage этого устройства.

const SYNC_KEYS = {
  token: "recipes.sync.token",
  gistId: "recipes.sync.gistId",
  updatedAt: "recipes.updatedAt",
  dirty: "recipes.sync.dirty",
  // Версия облака (её updatedAt), с которой это устройство синхронизировалось
  // последний раз. Если в облаке уже другая — сначала сливаем, потом пишем.
  baseAt: "recipes.sync.baseAt"
};

// Ключи, которые составляют книгу и уезжают в облако.
// Профиль устройства («кто я») и тема оформления — личные, в облако не идут.
const SYNCED_KEYS = [
  STORAGE_KEYS.recipes, STORAGE_KEYS.products, STORAGE_KEYS.menu, STORAGE_KEYS.seeded,
  STORAGE_KEYS.tinctures, STORAGE_KEYS.canning, STORAGE_KEYS.profiles, STORAGE_KEYS.planner,
  STORAGE_KEYS.tombstones
];

const GIST_FILE = "recipes-book.json";
const GIST_DESCRIPTION = "Книга рецептов — облачное сохранение";

let pushTimer = null;
let syncState = "off"; // off | ok | pending | error

function syncConfigured() {
  return Boolean(localStorage.getItem(SYNC_KEYS.token) && localStorage.getItem(SYNC_KEYS.gistId));
}

// Вызывается из writeJson после каждой успешной записи. Записи, сделанные
// ещё во время загрузки страницы (стартовое наполнение книги), не считаются
// правкой — иначе новое устройство затёрло бы облако стартовыми рецептами.
function noteLocalChange(key) {
  if (!SYNCED_KEYS.includes(key) || document.readyState === "loading") return;
  localStorage.setItem(SYNC_KEYS.updatedAt, new Date().toISOString());
  localStorage.setItem(SYNC_KEYS.dirty, "1");
  if (!syncConfigured()) return;
  setSyncState("pending");
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushToCloud, 1500);
}

// --- GitHub API ---

async function gh(path, options = {}) {
  const res = await fetch("https://api.github.com" + path, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + localStorage.getItem(SYNC_KEYS.token),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    cache: "no-store"
  });
  if (res.status === 401) throw new Error("GitHub отклонил токен — возможно, он отозван или истёк.");
  if (!res.ok) throw new Error("GitHub ответил ошибкой " + res.status + ".");
  return res.json();
}

function snapshot() {
  const data = {};
  SYNCED_KEYS.forEach(k => { data[k] = JSON.parse(localStorage.getItem(k) || "null"); });
  return {
    format: EXPORT_FORMAT + "-sync",
    updatedAt: localStorage.getItem(SYNC_KEYS.updatedAt) || new Date().toISOString(),
    data
  };
}

async function readGistBook(gist) {
  const file = gist.files && gist.files[GIST_FILE];
  if (!file) return null;
  const text = file.truncated ? await (await fetch(file.raw_url, { cache: "no-store" })).text() : file.content;
  try {
    const book = JSON.parse(text);
    return book && book.data ? book : null;
  } catch {
    return null;
  }
}

async function findExistingGist() {
  for (let page = 1; page <= 10; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`);
    const hit = list.find(g => g.files && g.files[GIST_FILE]);
    if (hit) return hit.id;
    if (list.length < 100) return null;
  }
  return null;
}

// --- Отправка и получение ---

// Пока человек вводит текст или готовит по шагам, фоновые проверки облака
// не трогают страницу (кроме первой загрузки и явных отправок).
function syncBusy() {
  const a = document.activeElement;
  const typing = a && (/^(input|textarea|select)$/i.test(a.tagName)) && a.type !== "checkbox";
  const cooking = typeof cook !== "undefined" && cook;
  return Boolean(typing || cooking);
}

function writeBookData(data, updatedAt) {
  SYNCED_KEYS.forEach(k => {
    const v = data[k];
    if (v === null || v === undefined) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  });
  localStorage.setItem(SYNC_KEYS.updatedAt, updatedAt);
}

let syncRunning = null;

// Одна операция синхронизации за раз.
function runSync(options) {
  if (!syncRunning) syncRunning = syncWithCloud(options).finally(() => { syncRunning = null; });
  return syncRunning;
}

function pushToCloud() {
  clearTimeout(pushTimer);
  return runSync({ force: true });
}

function pullFromCloud(options = {}) {
  return runSync(options);
}

// Сверка с облаком:
// • облако не менялось с нашей последней синхронизации — отправляем свои правки;
// • облако менялось, своих правок нет — забираем облачную книгу;
// • менялось и то и другое — сливаем по записям (merge.js) и отправляем итог.
async function syncWithCloud({ force = false } = {}) {
  if (!syncConfigured()) return;
  if (!force && syncBusy()) return;
  const dirty = Boolean(localStorage.getItem(SYNC_KEYS.dirty));
  if (dirty) setSyncState("pending");
  try {
    const book = await readGistBook(await gh("/gists/" + localStorage.getItem(SYNC_KEYS.gistId)));
    const base = localStorage.getItem(SYNC_KEYS.baseAt);

    if (book && book.updatedAt !== base) {
      if (dirty) {
        const merged = mergeBooks(snapshot().data, book.data);
        writeBookData(merged, new Date().toISOString());
        localStorage.setItem(SYNC_KEYS.baseAt, book.updatedAt);
        refreshAfterSync();
        await writeToCloud();
      } else {
        applyCloudBook(book);
        refreshAfterSync();
        setSyncState("ok");
      }
      return;
    }
    if (dirty || !book) await writeToCloud();
    else setSyncState("ok");
  } catch (e) {
    console.warn("Облачное сохранение:", e);
    setSyncState("error", e.message);
  }
}

async function writeToCloud() {
  const snap = snapshot();
  await gh("/gists/" + localStorage.getItem(SYNC_KEYS.gistId), {
    method: "PATCH",
    body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(snap) } } })
  });
  localStorage.setItem(SYNC_KEYS.baseAt, snap.updatedAt);
  localStorage.removeItem(SYNC_KEYS.dirty);
  setSyncState("ok");
}

// Данные в памяти страницы обновляем всегда (иначе следующее сохранение
// формы записало бы устаревший список поверх слитого), а перерисовку —
// только когда человек не вводит текст.
function refreshAfterSync() {
  if (typeof reloadAppState === "function") reloadAppState({ render: !syncBusy() });
  else location.reload();
}

function applyCloudBook(book) {
  SYNCED_KEYS.forEach(k => {
    const v = book.data[k];
    if (v === null || v === undefined) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  });
  localStorage.setItem(SYNC_KEYS.updatedAt, book.updatedAt);
  localStorage.setItem(SYNC_KEYS.baseAt, book.updatedAt);
  localStorage.removeItem(SYNC_KEYS.dirty);
}

// --- Подключение ---

// Окно подключения: ссылка на создание токена — обычная ссылка, по которой
// нажимает сам пользователь, иначе Safari блокирует открытие как всплывающее окно.
function openSyncModal() {
  document.getElementById("syncToken").value = "";
  document.getElementById("syncModal").classList.remove("hidden");
}

function closeSyncModal() {
  document.getElementById("syncModal").classList.add("hidden");
}

async function connectCloud(token) {
  localStorage.setItem(SYNC_KEYS.token, token);
  setSyncState("pending");
  try {
    const existing = await findExistingGist();
    if (existing) {
      localStorage.setItem(SYNC_KEYS.gistId, existing);
      localStorage.removeItem(SYNC_KEYS.baseAt);
      closeSyncModal();
      // Первое скачивание — всегда, даже если фокус остался в поле токена.
      await pullFromCloud({ force: true });
      return;
    }
    if (!localStorage.getItem(SYNC_KEYS.updatedAt)) {
      localStorage.setItem(SYNC_KEYS.updatedAt, new Date().toISOString());
    }
    const gist = await gh("/gists", {
      method: "POST",
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        public: false,
        files: { [GIST_FILE]: { content: JSON.stringify(snapshot()) } }
      })
    });
    localStorage.setItem(SYNC_KEYS.gistId, gist.id);
    localStorage.setItem(SYNC_KEYS.baseAt, JSON.parse(gist.files[GIST_FILE].content).updatedAt);
    localStorage.removeItem(SYNC_KEYS.dirty);
    setSyncState("ok");
    closeSyncModal();
    alert("Готово: книга сохранена в облаке. На другом устройстве нажмите «Облако» и вставьте тот же токен.");
  } catch (e) {
    localStorage.removeItem(SYNC_KEYS.token);
    localStorage.removeItem(SYNC_KEYS.gistId);
    setSyncState("off");
    alert("Не удалось подключить облако.\n\n" + e.message);
  }
}

async function handleSyncSubmit(e) {
  e.preventDefault();
  const token = document.getElementById("syncToken").value.trim();
  if (!token) return;
  const btn = document.getElementById("submitSyncBtn");
  btn.disabled = true;
  btn.textContent = "Подключаю…";
  await connectCloud(token);
  btn.disabled = false;
  btn.textContent = "Подключить";
}

function handleSyncClick() {
  if (!syncConfigured()) {
    openSyncModal();
    return;
  }
  if (syncState === "error" && confirm("Последнее сохранение в облако не удалось. Повторить сейчас?")) {
    pushToCloud();
    return;
  }
  if (confirm("Облачное сохранение включено. Отключить его на этом устройстве?\n\nКнига в облаке и на устройстве останется.")) {
    localStorage.removeItem(SYNC_KEYS.token);
    localStorage.removeItem(SYNC_KEYS.gistId);
    setSyncState("off");
  }
}

function setSyncState(state, message) {
  syncState = state;
  const btn = document.getElementById("syncBtn");
  if (!btn) return;
  const labels = { off: "Облако: выкл", ok: "☁ Сохранено", pending: "☁ Сохраняю…", error: "☁ Ошибка" };
  btn.textContent = labels[state];
  btn.title = message || (state === "off" ? "Включить сохранение книги в облако" : "Книга синхронизируется с облаком");
  btn.classList.toggle("sync-error", state === "error");
}

function initSync() {
  document.getElementById("syncBtn").addEventListener("click", handleSyncClick);
  document.getElementById("syncForm").addEventListener("submit", handleSyncSubmit);
  document.getElementById("cancelSyncBtn").addEventListener("click", closeSyncModal);
  document.getElementById("syncModal").addEventListener("click", e => {
    // Клик по фону — общий менеджер окон (app.js).
  });
  setSyncState(syncConfigured() ? "pending" : "off");

  // Браузер может стереть данные сайта; просим оставить их.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // Первое скачивание при запуске — всегда.
  pullFromCloud({ force: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullFromCloud();
    else if (localStorage.getItem(SYNC_KEYS.dirty)) pushToCloud();
  });
  // Пока открыт список покупок, раз в 45 секунд сверяемся с облаком: отметки
  // «куплено» других членов семьи появляются почти сразу.
  setInterval(() => {
    if (syncConfigured() && document.visibilityState === "visible" && typeof activeView !== "undefined" &&
        activeView === "menu" && !localStorage.getItem(SYNC_KEYS.dirty)) pullFromCloud();
  }, 45000);
  window.addEventListener("online", () => {
    if (localStorage.getItem(SYNC_KEYS.dirty)) pushToCloud();
  });
}

document.addEventListener("DOMContentLoaded", initSync);
