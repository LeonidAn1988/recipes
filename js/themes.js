// Темы оформления. Тема — личная настройка устройства (в облако не идёт).
// Применяется ещё в <head> (см. inline-скрипт в index.html), чтобы страница
// не мигала чужими цветами; здесь — список тем и выбор в «Настройках».

const THEME_KEY = "recipes.theme";

const THEMES = [
  { id: "modern", label: "Современная кухня", desc: "Чисто и спокойно; тёмная, если она включена на устройстве", swatch: ["#faf7f2", "#b4541f", "#2e2620"] },
  { id: "notebook", label: "Бабушкина тетрадь", desc: "Клетка, чернила, рукописные заголовки", swatch: ["#f8fafd", "#2c52a0", "#1d2842"], font: "Neucha" },
  { id: "oldbook", label: "Старая поваренная книга", desc: "Антиква, красная печать, линейки", swatch: ["#efe7d7", "#7a1919", "#2a1c12"], font: "PT+Serif:ital,wght@0,400;0,700;1,400" },
  { id: "scandi", label: "Скандинавский минимализм", desc: "Воздух, берёза, хвойный акцент", swatch: ["#fafaf8", "#3f6b55", "#20262b"], font: "Manrope:wght@400;600;800" }
];

function currentThemeId() {
  let id = null;
  try { id = localStorage.getItem(THEME_KEY); } catch {}
  return THEMES.some(t => t.id === id) ? id : "modern";
}

// Шрифт темы грузим только когда тема выбрана — остальным он не нужен.
function loadThemeFont(theme) {
  if (!theme.font || document.getElementById("font-" + theme.id)) return;
  const link = document.createElement("link");
  link.id = "font-" + theme.id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${theme.font}&display=swap`;
  document.head.appendChild(link);
}

function applyTheme(id) {
  const theme = THEMES.find(t => t.id === id) || THEMES[0];
  if (theme.id === "modern") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme.id;
  loadThemeFont(theme);
  try { localStorage.setItem(THEME_KEY, theme.id); } catch {}
}

function initThemes() {
  el("themeBlock").classList.remove("hidden");
  const theme = THEMES.find(t => t.id === currentThemeId());
  loadThemeFont(theme);
}

function renderThemeList() {
  const wrap = el("themeList");
  wrap.innerHTML = "";
  const active = currentThemeId();
  THEMES.forEach(t => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-option";
    btn.setAttribute("aria-pressed", String(t.id === active));

    const swatch = document.createElement("span");
    swatch.className = "theme-swatch";
    const [bg, accent, ink] = t.swatch;
    swatch.style.background = `linear-gradient(90deg, ${accent} 0 22%, ${bg} 22% 78%, ${ink} 78%)`;

    const name = document.createElement("span");
    name.className = "theme-name";
    name.textContent = t.label;

    const desc = document.createElement("span");
    desc.className = "theme-desc";
    desc.textContent = t.desc;

    btn.append(swatch, name, desc);
    btn.addEventListener("click", () => {
      applyTheme(t.id);
      renderThemeList();
    });
    wrap.appendChild(btn);
  });
}
