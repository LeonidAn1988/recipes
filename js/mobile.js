// Мобильный каркас (экраны ≤ 760 px): нижняя панель вкладок, рецепт как
// отдельный экран с «Назад», лист фильтров, меню «⋯» у рецепта.
// На компьютере всё это скрыто стилями и не мешает.

const MOBILE_QUERY = window.matchMedia("screen and (max-width: 760px)");
let listScrollY = 0;

// --- История переходов ---
// Каждое окно, лист, режим готовки и экран рецепта — отдельный шаг в истории
// браузера. Кнопка «Назад» телефона закрывает верхний из них, а не уводит
// со страницы. Закрытие кнопкой в интерфейсе убирает свой шаг из истории.
// Окна открываются и закрываются вперемешку («Ещё» → «Настройки»), а
// history.back() асинхронный. Поэтому не двигаем историю сразу: считаем
// открытые слои и свои шаги в истории и сверяем их одним отложенным вызовом.
let ignorePops = 0;
let closingFromPop = false;
let overlayDepth = 0;   // открыто слоёв (окна, лист фильтров, режим готовки)
let historyDepth = 0;   // наших шагов { overlay } в истории
let reconcileTimer = null;

function overlayOpened() {
  overlayDepth++;
  scheduleHistorySync();
}

function overlayClosed() {
  overlayDepth = Math.max(0, overlayDepth - 1);
  if (!closingFromPop) scheduleHistorySync();
}

function scheduleHistorySync() {
  if (reconcileTimer) return;
  reconcileTimer = setTimeout(syncOverlayHistory, 0);
}

function syncOverlayHistory() {
  reconcileTimer = null;
  while (historyDepth < overlayDepth) {
    history.pushState({ overlay: true }, "");
    historyDepth++;
  }
  if (historyDepth > overlayDepth) {
    const extra = historyDepth - overlayDepth;
    historyDepth = overlayDepth;
    ignorePops++;
    history.go(-extra);
  }
}

function onPopState() {
  if (ignorePops > 0) { ignorePops--; return; }
  // Браузер уже ушёл на шаг назад: если это был шаг слоя — закрываем верхний слой.
  if (historyDepth > 0) {
    historyDepth--;
    closingFromPop = true;
    try {
      const modals = visibleModals();
      if (modals.length) {
        closeModal(modals[modals.length - 1]);
      } else if (document.body.classList.contains("filters-open")) {
        setFiltersOpen(false);
      } else if (typeof cook !== "undefined" && cook) {
        closeCookMode();
      }
    } finally {
      closingFromPop = false;
    }
    // Окно отказалось закрываться (несохранённые правки) — вернём шаг.
    // Закрытие окна фиксируется наблюдателем асинхронно, поэтому сверяем позже.
    setTimeout(scheduleHistorySync, 30);
    return;
  }
  if (document.body.classList.contains("mobile-detail")) closeMobileDetail();
}

// Уход с экрана рецепта не через «Назад» (например, другая вкладка) —
// убираем его шаг из истории, чтобы «Назад» не упирался в пустой шаг.
function leaveMobileDetail() {
  if (!document.body.classList.contains("mobile-detail")) return;
  document.body.classList.remove("mobile-detail");
  if (history.state && history.state.recipeDetail) {
    ignorePops++;
    history.back();
  }
}

function isMobile() {
  return MOBILE_QUERY.matches;
}

function initMobile() {
  // После перезагрузки шаги истории от прошлой страницы уже не наши.
  if (history.state && (history.state.recipeDetail || history.state.overlay)) history.replaceState(null, "");
  historyDepth = 0;
  overlayDepth = 0;
  window.addEventListener("popstate", onPopState);

  // Открыта экранная клавиатура — прячем фиксированные панели.
  document.addEventListener("focusin", e => {
    if (isMobile() && /^(input|textarea|select)$/i.test(e.target.tagName) && !/checkbox|radio|file/.test(e.target.type)) {
      document.body.classList.add("kb-open");
    }
  });
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (!a || !/^(input|textarea|select)$/i.test(a.tagName)) document.body.classList.remove("kb-open");
    }, 50);
  });

  // Калькулятор выхода: на компьютере раскрыт, как раньше; на телефоне свёрнут.
  el("yieldDetails").open = !isMobile();

  // Нижняя панель вкладок.
  el("tabBar").addEventListener("click", e => {
    const btn = e.target.closest("[data-tab-view]");
    if (!btn) return;
    if (btn.dataset.tabView === "more") {
      updateMoreSyncLabel();
      openModal(el("moreModal"));
      return;
    }
    if (btn.dataset.tabView === "recipes" && activeView === "recipes" && document.body.classList.contains("mobile-detail")) {
      if (history.state && history.state.recipeDetail) history.back();
      else closeMobileDetail();
      return;
    }
    setView(btn.dataset.tabView);
    window.scrollTo(0, 0);
  });

  el("moreModal").addEventListener("click", e => {
    const item = e.target.closest("[data-more]");
    if (e.target.hasAttribute("data-close-more")) return closeModal(el("moreModal"), true);
    if (!item) return;
    closeModal(el("moreModal"), true);
    if (item.dataset.more === "products") { setView("products"); window.scrollTo(0, 0); }
    else if (item.dataset.more === "settings") openSettings();
    else if (item.dataset.more === "sync") handleSyncClick();
  });

  // Рецепт — отдельный экран: «Назад» телефона/браузера возвращает к списку.
  el("backToListBtn").addEventListener("click", () => {
    if (history.state && history.state.recipeDetail) history.back();
    else closeMobileDetail();
  });

  // Лист фильтров.
  el("filtersBtn").addEventListener("click", () => setFiltersOpen(true));
  el("filtersDoneBtn").addEventListener("click", () => setFiltersOpen(false));
  el("filtersBackdrop").addEventListener("click", () => setFiltersOpen(false));
  el("filtersResetBtn").addEventListener("click", () => {
    resetRecipeFilters();
    setFiltersOpen(false);
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (document.body.classList.contains("filters-open")) setFiltersOpen(false);
    const actionsBar = document.querySelector("#recipeDetail .detail-actions");
    if (actionsBar.classList.contains("more-open")) {
      actionsBar.classList.remove("more-open");
      el("moreActionsBtn").setAttribute("aria-expanded", "false");
      el("moreActionsBtn").focus();
    }
  });

  // Меню «⋯» у рецепта: редкие действия (в меню, печать, изменить, удалить).
  const actions = document.querySelector("#recipeDetail .detail-actions");
  el("moreActionsBtn").addEventListener("click", e => {
    e.stopPropagation();
    const open = !actions.classList.contains("more-open");
    actions.classList.toggle("more-open", open);
    el("moreActionsBtn").setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", e => {
    if (actions.classList.contains("more-open") && !e.target.closest(".detail-actions")) {
      actions.classList.remove("more-open");
      el("moreActionsBtn").setAttribute("aria-expanded", "false");
    }
  });
  actions.addEventListener("click", e => {
    if (e.target.closest("button") && e.target.closest("button") !== el("moreActionsBtn")) {
      actions.classList.remove("more-open");
      el("moreActionsBtn").setAttribute("aria-expanded", "false");
    }
  });

  // Полная таблица КБЖУ по продуктам — по кнопке (на телефоне — список).
  el("ingFullBtn").addEventListener("click", () => {
    const section = el("ingredientsSection");
    const full = !section.classList.contains("full");
    section.classList.toggle("full", full);
    el("ingFullBtn").setAttribute("aria-pressed", String(full));
    el("ingFullBtn").textContent = full ? "Коротко" : "КБЖУ по продуктам";
  });

  MOBILE_QUERY.addEventListener("change", () => {
    if (document.body.classList.contains("filters-open")) setFiltersOpen(false);
    if (!isMobile()) leaveMobileDetail();
    el("yieldDetails").open = !isMobile();
  });
}

function openMobileDetail() {
  if (!isMobile() || !selectedId) return;
  if (!document.body.classList.contains("mobile-detail")) {
    listScrollY = window.scrollY;
    history.pushState({ recipeDetail: selectedId }, "");
  }
  document.body.classList.add("mobile-detail");
  window.scrollTo(0, 0);
  // Фокус — на название рецепта: диктор узнаёт о смене экрана.
  const title = el("detailTitle");
  title.tabIndex = -1;
  setTimeout(() => title.focus({ preventScroll: true }), 0);
}

function closeMobileDetail() {
  if (!document.body.classList.contains("mobile-detail")) return;
  document.body.classList.remove("mobile-detail");
  const y = listScrollY;
  requestAnimationFrame(() => {
    window.scrollTo(0, y);
    const item = document.querySelector(`.recipe-item[data-recipe-id="${selectedId}"]`);
    if (item) item.focus({ preventScroll: true });
  });
}

function setFiltersOpen(open) {
  const was = document.body.classList.contains("filters-open");
  document.body.classList.toggle("filters-open", open);
  if (open && !was) overlayOpened();
  if (!open && was) overlayClosed();
  const panel = el("filtersPanel");
  if (open) {
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
  } else {
    panel.removeAttribute("role");
    panel.removeAttribute("aria-modal");
  }
  // Пока лист открыт, остальное недоступно для Tab и диктора.
  [document.querySelector(".app-header"), el("tabBar"), el("recipeList"), document.querySelector(".list-toolbar"), el("activeFilters"), el("addRecipeBtn"), el("timerBar")]
    .forEach(n => { if (n) n.inert = open; });
  el("filtersBtn").setAttribute("aria-expanded", String(open));
  if (open) setTimeout(() => el("filtersDoneBtn").focus(), 0);
  else if (isMobile()) el("filtersBtn").focus();
}

function updateMoreSyncLabel() {
  const labels = { off: "Облако: включить сохранение", ok: "Облако: сохранено", pending: "Облако: сохраняю…", error: "Облако: ошибка — повторить" };
  el("moreSyncLabel").textContent = labels[syncState] || "Облако";
}

// Таблицы на телефоне превращаются в карточки: подписи колонок из шапки
// таблицы попадают в data-label ячеек (CSS показывает их перед значением).
function labelTableCells(table) {
  if (!table) return;
  const heads = [...table.querySelectorAll("thead th")].map(th => th.textContent.trim());
  table.querySelectorAll("tbody tr").forEach(tr => {
    [...tr.children].forEach((td, i) => {
      if (heads[i] !== undefined) td.dataset.label = heads[i];
    });
  });
}
