// Члены семьи и личное избранное, плюс окно «Настройки».
//
// Книга общая (один токен облака на всю семью). Список имён и избранное
// каждого хранятся в самой книге и синхронизируются; «кто я» выбирается на
// каждом устройстве и хранится только в нём (PROFILE_KEY).

const PROFILE_KEY = "recipes.profile";
// Рецепт, который хотели отметить до выбора профиля, — отметим сразу после.
let pendingFavorite = null;

function loadProfiles() {
  return loadSection("profiles");
}

function currentMember() {
  const id = localStorage.getItem(PROFILE_KEY);
  return loadProfiles().members.find(m => m.id === id) || null;
}

function setCurrentMember(id) {
  if (id) localStorage.setItem(PROFILE_KEY, id);
  else localStorage.removeItem(PROFILE_KEY);
  updateProfileChip();
  // У каждого члена семьи своё оформление — применяем его при выборе.
  const member = id ? loadProfiles().members.find(m => m.id === id) : null;
  if (member && member.theme && typeof applyTheme === "function") applyTheme(member.theme);
  if (id && pendingFavorite) {
    const recipeId = pendingFavorite;
    pendingFavorite = null;
    if (!isFavorite(recipeId)) toggleFavorite(recipeId);
  }
}

function addMember(name) {
  const clean = name.trim().slice(0, 30);
  if (!clean) return null;
  const data = loadProfiles();
  const existing = data.members.find(m => m.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  const member = { id: newId("m"), name: clean };
  data.members.push(member);
  saveSection("profiles", data);
  return member;
}

function removeMember(id) {
  const data = loadProfiles();
  data.members = data.members.filter(m => m.id !== id);
  delete data.favorites[id];
  saveSection("profiles", data);
  if (localStorage.getItem(PROFILE_KEY) === id) setCurrentMember(null);
}

function favoriteIds() {
  const me = currentMember();
  return me ? new Set(loadProfiles().favorites[me.id] || []) : new Set();
}

function isFavorite(recipeId) {
  return favoriteIds().has(recipeId);
}

// Запоминает тему за текущим членом семьи (синхронизируется вместе с книгой).
function saveMemberTheme(themeId) {
  const me = currentMember();
  if (!me) return;
  const data = loadProfiles();
  const member = data.members.find(m => m.id === me.id);
  if (!member || member.theme === themeId) return;
  member.theme = themeId;
  saveSection("profiles", data);
}

// Автор записи — id текущего члена семьи (или null, если «кто я» не выбран).
function currentMemberId() {
  const me = currentMember();
  return me ? me.id : null;
}

function authorName(id) {
  const m = id ? loadProfiles().members.find(x => x.id === id) : null;
  return m ? m.name : "";
}

// Чип-переключатель «Мои» для разделов: без выбранного профиля предлагает
// выбрать, кто вы. onToggle вызывается с новым значением.
function mineChip(active, onToggle) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip chip-mine" + (active ? " active" : "");
  chip.setAttribute("aria-pressed", String(active));
  const me = currentMember();
  chip.textContent = "👤 Мои";
  chip.title = me ? `Только добавленные: ${me.name}` : "Выберите в настройках, кто вы";
  chip.addEventListener("click", () => {
    if (!currentMember()) {
      openSettings("Чтобы видеть свои рецепты, выберите, кто вы, или добавьте своё имя.");
      return;
    }
    onToggle(!active);
  });
  return chip;
}

// Без выбранного профиля отмечать нечего — сначала спрашиваем, кто это.
function toggleFavorite(recipeId) {
  const me = currentMember();
  if (!me) {
    pendingFavorite = recipeId;
    openSettings("Чтобы отмечать избранное, выберите, кто вы, или добавьте своё имя.");
    return false;
  }
  const data = loadProfiles();
  const list = new Set(data.favorites[me.id] || []);
  if (list.has(recipeId)) list.delete(recipeId);
  else list.add(recipeId);
  data.favorites[me.id] = [...list];
  saveSection("profiles", data);
  return true;
}

// Удалённый рецепт убираем из избранного у всех.
function forgetRecipeInFavorites(recipeId) {
  const data = loadProfiles();
  let changed = false;
  Object.keys(data.favorites).forEach(member => {
    const before = data.favorites[member].length;
    data.favorites[member] = data.favorites[member].filter(id => id !== recipeId);
    if (data.favorites[member].length !== before) changed = true;
  });
  if (changed) saveSection("profiles", data);
}

// --- Окно «Настройки» ---

function initProfilesUi() {
  el("settingsBtn").addEventListener("click", () => openSettings());
  el("profileChip").addEventListener("click", () => openSettings());
  el("closeSettingsBtn").addEventListener("click", closeSettings);
  el("settingsModal").addEventListener("click", e => {
    if (e.target === el("settingsModal")) closeSettings();
  });
  el("addMemberForm").addEventListener("submit", e => {
    e.preventDefault();
    const member = addMember(el("newMemberName").value);
    if (!member) return;
    el("newMemberName").value = "";
    setCurrentMember(member.id);
    renderMemberList();
    render();
  });
  if (typeof initThemes === "function") initThemes();
  updateProfileChip();
}

function openSettings(message) {
  renderMemberList();
  if (typeof renderThemeList === "function") renderThemeList();
  const note = el("settingsModal").querySelector(".settings-message");
  if (note) note.remove();
  if (message) {
    const p = document.createElement("p");
    p.className = "settings-message";
    p.textContent = message;
    el("settingsModal").querySelector("h2").after(p);
  }
  el("settingsModal").classList.remove("hidden");
}

function closeSettings() {
  el("settingsModal").classList.add("hidden");
}

function renderMemberList() {
  const wrap = el("memberList");
  wrap.innerHTML = "";
  const { members, favorites } = loadProfiles();
  const me = currentMember();

  if (members.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Пока никого нет — добавьте своё имя.";
    wrap.appendChild(empty);
    return;
  }

  members.forEach(m => {
    const item = document.createElement("span");
    item.className = "member-item";

    const chip = document.createElement("button");
    chip.type = "button";
    const isMe = Boolean(me && me.id === m.id);
    chip.className = "chip" + (isMe ? " active" : "");
    chip.setAttribute("aria-pressed", String(isMe));
    const count = (favorites[m.id] || []).length;
    chip.textContent = m.name + (count ? ` · ★ ${count}` : "");
    chip.title = isMe ? "Это вы на этом устройстве" : "Это я";
    chip.addEventListener("click", () => {
      if (isMe) return;
      setCurrentMember(m.id);
      renderMemberList();
      render();
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn-icon";
    del.textContent = "✕";
    del.title = `Удалить «${m.name}» вместе с избранным`;
    del.setAttribute("aria-label", del.title);
    del.addEventListener("click", () => {
      if (!confirm(`Удалить «${m.name}» вместе с избранным? Оно удалится на всех устройствах.`)) return;
      removeMember(m.id);
      renderMemberList();
      render();
    });

    item.append(chip, del);
    wrap.appendChild(item);
  });
}

function updateProfileChip() {
  const me = currentMember();
  const chip = el("profileChip");
  chip.textContent = me ? "👤 " + me.name : "Кто я?";
  chip.classList.toggle("profile-chip-empty", !me);
}
