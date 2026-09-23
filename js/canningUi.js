// Раздел «Автоклав»: подбор проверенного режима, расчёт партии и журнал
// партий. Данные — loadSection("canning") = { batches, settings }; режимы —
// canningData.js / canningCalc.js. Термины: «загрузка» — одна закладка банок
// в автоклав, «партия» — всё, что законсервировано за один день.

const SAFETY_OPEN_KEY = "recipes.canning.safetyOpen";

function initCanningUi() {
  document.body.insertAdjacentHTML("beforeend", `
<div id="batchModal" class="modal hidden">
  <div class="modal-content modal-narrow">
    <h2 id="batchModalTitle">Записать партию</h2>
    <form id="batchLogForm">
      <p class="hint" id="batchModeLine"></p>
      <div class="form-row">
        <label>Дата <input type="date" id="blDate" required></label>
        <label>Банок <input type="text" id="blJars" inputmode="numeric" required></label>
        <label>Осталось <input type="text" id="blLeft" inputmode="numeric"></label>
      </div>
      <label>Заметка <textarea id="blNotes" rows="2" placeholder="Что добавили, откуда сырьё"></textarea></label>
      <div class="modal-actions">
        <span class="spacer"></span>
        <button type="button" class="btn btn-secondary" data-close>Отмена</button>
        <button type="submit" class="btn btn-primary">Сохранить</button>
      </div>
    </form>
  </div>
</div>`);
  el("batchLogForm").addEventListener("submit", saveBatchLog);
  el("batchModal").addEventListener("click", e => {
    if (e.target.hasAttribute("data-close")) closeModal(el("batchModal"), true);
  });
  el("canningPage").addEventListener("change", onCanningChange);
  el("canningPage").addEventListener("input", onCanningInput);
  el("canningPage").addEventListener("click", onCanningClick);
  el("canningPage").addEventListener("submit", e => {
    if (e.target.id !== "makerForm") return;
    e.preventDefault();
    const f = e.target;
    const val = n => f.querySelector(`[name="${n}"]`).value.trim();
    const temp = parseAmount(val("temp"));
    const minutes = Math.round(parseAmount(val("minutes")));
    if (!(temp > 0) || !(minutes > 0)) return;
    const modes = canningSettings().makerModes;
    modes.push({ id: newId("mm"), product: val("product"), jar: val("jar"), temp, minutes, note: val("note") });
    saveCanningSettings({ makerModes: modes });
    f.reset();
    renderMakerModes();
  });
  el("canningPage").addEventListener("toggle", e => {
    if (e.target.classList && e.target.classList.contains("safety")) {
      try { localStorage.setItem(SAFETY_OPEN_KEY, e.target.open ? "1" : "0"); } catch {}
    }
  }, true);
}

function canningSettings() {
  const s = loadSection("canning").settings || {};
  return {
    productId: s.productId || "meat-chunks",
    jarId: CANNING_JARS.some(j => j.id === s.jarId) ? s.jarId : "470",
    gauge: s.gauge || "weighted",
    elevation: s.elevation ?? 150,
    capacity: s.capacity || 7,
    rawKg: s.rawKg ?? "",
    perJar: s.perJar ?? "",
    canner: CANNER_TYPES[s.canner] ? s.canner : "stovetop",
    lids: LID_TYPES[s.lids] ? s.lids : "two-piece",
    model: s.model || "",
    makerModes: Array.isArray(s.makerModes) ? s.makerModes : []
  };
}

function saveCanningSettings(patch) {
  const data = loadSection("canning");
  data.settings = { ...canningSettings(), ...patch };
  saveSection("canning", data);
}

function safetyOpen() {
  try { return localStorage.getItem(SAFETY_OPEN_KEY) !== "0"; } catch { return true; }
}

function renderCanningView() {
  const s = canningSettings();
  const groups = [...new Set(CANNING_PRODUCTS.map(p => p.group))];
  const productOptions = groups.map(g => `<optgroup label="${esc(g)}">${CANNING_PRODUCTS.filter(p => p.group === g)
    .map(p => `<option value="${p.id}"${p.id === s.productId ? " selected" : ""}>${esc(p.label)}</option>`).join("")}</optgroup>`).join("");
  const jarOptions = CANNING_JARS.map(j => `<option value="${j.id}"${j.id === s.jarId ? " selected" : ""}>${esc(j.label)}</option>`).join("");

  el("canningPage").innerHTML = `
    <div class="page-head"><h2>Автоклав</h2></div>

    <details class="safety"${safetyOpen() ? " open" : ""}>
      <summary>Главное о безопасности — прочитайте перед первой загрузкой</summary>
      <ul>
        <li>Мясо, птица, рыба, грибы и овощи — <strong>низкокислотные продукты</strong>. Споры ботулизма переживают кипячение; их убивает только нагрев до 116–121 °C под давлением пара. Кипячение в кастрюле их не обеззараживает, сколько бы часов оно ни длилось.</li>
        <li><strong>Режимы годятся только для паровой скороварки-консерватора с продувкой</strong> (pressure canner): банки стоят на решётке в небольшом слое воды, давление создаёт пар, нагрев — на плите. Для электрических автоклавов с ТЭНом режимы NCHFP не проверялись. Если давление в вашем автоклаве накачивают насосом или компрессором или банки стоят полностью под водой, эти режимы к нему не применимы — манометр там показывает давление воздуха, а температура ниже.</li>
        <li>Режимы проверены на банках Mason с двухсоставной самоуплотняющейся крышкой. Для крышек твист-офф и СКО под закатку проверенных данных нет. Банки из-под покупных продуктов не используйте.</li>
        <li>Время <strong>нельзя сокращать</strong>, давление — понижать. Упало давление ниже нормы — верните его и начните отсчёт заново, с полного времени.</li>
        <li>Стрелочный манометр проверяйте раз в год. Завышает на 1–2 psi — прибавьте эту разницу к давлению из калькулятора; расходится больше чем на 2 psi — замените. Грузовой клапан проверки не требует.</li>
        <li>Испорченные низкокислотные консервы могут выглядеть почти нормально. Вздутая или протекающая банка, крышка без вакуума, пена, плесень, мутность, неестественный цвет, неприятный запах, засохшие потёки от крышки — <strong>не пробовать</strong>, даже чтобы проверить. Закрытую банку выбросите в плотном пакете, открытую или протекшую обезвредьте по <a href="https://nchfp.uga.edu/how/can/general-information/identifying-and-handling-spoiled-canned-food/" target="_blank" rel="noopener">инструкции NCHFP</a> (в перчатках: токсин опасен и при попадании на кожу).</li>
        <li>Отраслевые инструкции ВНИИКИМП написаны для промышленных автоклавов и конкретной тары. Проверенные режимы для домашнего консервирования публикует NCHFP (партнёр министерства сельского хозяйства США).</li>
      </ul>
    </details>

    <section class="tn-section">
      <h3>Мой автоклав</h3>
      <form class="calc-card" id="cannerForm" onsubmit="return false">
        <div class="calc-fields canning-fields">
          <label class="span-2">Тип <select name="canner">${Object.entries(CANNER_TYPES).map(([k, v]) => `<option value="${k}"${k === s.canner ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
          <label>Крышки <select name="lids">${Object.entries(LID_TYPES).map(([k, v]) => `<option value="${k}"${k === s.lids ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
          <label>Модель <input type="text" name="model" value="${esc(s.model)}" placeholder="например, «Малиновка-2»"></label>
        </div>
        <p class="hint">Настройка общая для семьи: от неё зависит, можно ли пользоваться проверенными режимами.</p>
      </form>
    </section>

    <section class="tn-section">
      <h3>Подобрать режим</h3>
      <form class="calc-card canning-form" id="canningForm" onsubmit="return false">
        <div class="calc-fields canning-fields">
          <label class="span-2">Продукт <select name="productId">${productOptions}</select></label>
          <label>Банка <select name="jarId">${jarOptions}</select></label>
          <label>Высота над морем, м <input type="text" inputmode="numeric" name="elevation" value="${esc(s.elevation)}"></label>
          <fieldset class="gauge-choice span-2">
            <legend>Чем контролируете давление</legend>
            <label class="checkbox-label"><input type="radio" name="gauge" value="weighted"${s.gauge === "weighted" ? " checked" : ""}> грузовой клапан (груз качается)</label>
            <label class="checkbox-label"><input type="radio" name="gauge" value="dial"${s.gauge === "dial" ? " checked" : ""}> стрелочный манометр</label>
          </fieldset>
        </div>
        <div id="canningResult" aria-live="polite"></div>
      </form>
    </section>

    <section class="tn-section" id="makerSection">
      <h3>Режимы из инструкции автоклава${s.model ? ` «${esc(s.model)}»` : ""}</h3>
      <p class="hint">Перепишите режимы из инструкции к вашему автоклаву — они будут под рукой у всей семьи. Это данные производителя: независимо их никто не проверял. Если в инструкции нет режима для продукта или банки — такой продукт в этом автоклаве не консервируйте.</p>
      <div id="makerModes"></div>
      <form class="calc-card maker-form" id="makerForm">
        <div class="calc-fields">
          <label class="span-2">Продукт <input type="text" name="product" required placeholder="например, тушёнка из говядины"></label>
          <label>Банка <input type="text" name="jar" required placeholder="0,5 л"></label>
          <label>Температура, °C <input type="text" inputmode="decimal" name="temp" required placeholder="120"></label>
          <label>Время выдержки, мин <input type="text" inputmode="numeric" name="minutes" required placeholder="60"></label>
          <label class="span-2">Заметка <input type="text" name="note" placeholder="страница инструкции, особые условия"></label>
        </div>
        <button type="submit" class="btn btn-secondary btn-small">Добавить режим</button>
      </form>
    </section>

    <section class="tn-section">
      <h3>Расчёт партии</h3>
      <form class="calc-card" id="batchForm" onsubmit="return false">
        <div class="calc-fields">
          <label>Сырья, кг <input type="text" inputmode="decimal" name="rawKg" value="${esc(s.rawKg)}" placeholder="например, 5"></label>
          <label>Входит в банку, г <input type="text" inputmode="decimal" name="perJar" value="${esc(s.perJar)}"></label>
          <label>Банок за загрузку <input type="text" inputmode="numeric" name="capacity" value="${esc(s.capacity)}"></label>
        </div>
        <p class="calc-result" id="batchResult" aria-live="polite"></p>
        <p class="hint">«Входит в банку» — оценка по объёму, уточните по первой банке. Сколько банок входит за раз и можно ли ставить их в два слоя — в инструкции к автоклаву.</p>
      </form>
    </section>

    <section class="tn-section">
      <h3>Журнал партий</h3>
      <p class="hint">Храните банки в тёмном прохладном месте, лучше при 10–21 °C; выше 35 °C нельзя. Лучшее качество — в течение года.</p>
      <div id="batchJournal"></div>
    </section>`;

  updateCanningResult();
  renderMakerModes();
  renderBatchJournal();
}

function renderMakerModes() {
  const box = el("makerModes");
  if (!box) return;
  const modes = canningSettings().makerModes;
  box.innerHTML = modes.length ? `<ul class="bottle-list maker-list">${modes.map(m => `<li class="bottle">
      <div class="bottle-main">
        <span class="bottle-title">${esc(m.product)}</span>
        <span class="stage">по данным производителя</span>
        <div class="bottle-facts">${esc(m.jar)} · <strong>${esc(formatAmount(m.temp))} °C</strong> · <strong>${esc(m.minutes)} мин</strong> выдержки${m.note ? " · " + esc(m.note) : ""}</div>
      </div>
      <div class="bottle-actions">
        <button type="button" class="btn btn-secondary btn-small" data-act="log-maker" data-id="${m.id}">Записать партию</button>
        <button type="button" class="btn-icon" data-act="del-maker" data-id="${m.id}" aria-label="Удалить режим" title="Удалить режим">✕</button>
      </div>
    </li>`).join("")}</ul>` : `<p class="hint">Пока режимов нет.</p>`;
}

function currentCanningMode() {
  const s = canningSettings();
  return canningMode(s.productId, s.jarId, s.gauge, parseAmount(String(s.elevation)));
}

// Режим NCHFP — только если связка «автоклав + крышки» проверена, иначе null.
function validatedMode() {
  const s = canningSettings();
  if (!cannerValidation(s.canner, s.lids).ok) return null;
  const mode = currentCanningMode();
  return mode.ok ? mode : null;
}

function updateCanningResult() {
  const box = el("canningResult");
  if (!box) return;
  const settings = canningSettings();
  const check = cannerValidation(settings.canner, settings.lids);
  if (!check.ok) {
    box.innerHTML = `<div class="verdict verdict-stop">
      <strong>Для вашего автоклава проверенного режима нет.</strong>
      <ul>${check.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
      <p>Пользуйтесь режимами из инструкции к автоклаву — внесите их ниже. Держите по термометру температуру не ниже указанной всё время выдержки; упала — верните её и начните отсчёт заново. Выключив нагрев, дайте автоклаву остыть самому.</p>
      <p class="hint">Источник: <a href="https://nchfp.uga.edu/newsflash/canning-in-electric-multi-cookers" target="_blank" rel="noopener">NCHFP о консервировании в электрических приборах</a>, <a href="https://nchfp.uga.edu/how/can/general-information/recommended-canners/" target="_blank" rel="noopener">NCHFP — рекомендуемые автоклавы</a>.</p>
    </div>`;
    updateBatchResult(null);
    return;
  }
  const mode = currentCanningMode();
  if (!mode.ok) {
    box.innerHTML = `<div class="verdict verdict-stop"><strong>Проверенного режима нет.</strong> ${esc(mode.reason)}</div>`;
    updateBatchResult(null);
    return;
  }
  const p = mode.product;
  const gauge = canningSettings().gauge;
  const salt = saltPerJar(p, mode.jar);
  const reached = gauge === "dial" ? `стрелка манометра дошла до ${mode.psi} psi` : "груз начал качаться";
  box.innerHTML = `
    <div class="verdict">
      <div class="verdict-main"><span class="verdict-time">${mode.minutes} мин</span> при <span class="verdict-psi">${mode.psi} psi</span> <span class="muted">(${mode.bar.toFixed(2).replace(".", ",")} бар по манометру)</span></div>
      ${mode.jarNote ? `<p class="hint">${esc(mode.jarNote)}</p>` : ""}
      ${p.note ? `<p class="hint">${esc(p.note)}</p>` : ""}
    </div>
    <ol class="canning-steps">
      <li>Укладка — ${esc(p.pack.replace(/ укладка$/, ""))}, отступ от края банки — ${String(p.headspace).replace(".", ",")} см${salt ? `; соль по желанию — ${formatAmount(salt)} ч.л. на банку` : ""}.${p.prep ? ` <strong>${esc(p.prep)}</strong>` : ""}</li>
      <li>Налейте в автоклав 5–7 см горячей воды: около 60 °C для сырой укладки, около 82 °C для горячей. Поставьте банки на решётку и закройте крышку.</li>
      <li>Груз снят, клапан открыт: нагрейте на сильном огне до ровной струи пара и <strong>продувайте 10 минут</strong> — оставшийся воздух занижает температуру.</li>
      <li>Наденьте груз (закройте клапан). Отсчёт <strong>${mode.minutes} минут</strong> начинайте, когда ${reached}. Держите давление ровно, не ниже нормы.</li>
      <li>Выключите нагрев и дайте автоклаву <strong>остыть самому</strong> до нуля — не охлаждайте водой и не спускайте пар.</li>
      <li>После нуля снимите груз, подождите 10 минут и откройте крышку от себя. Банки остывают 12–24 часа, затем проверьте вакуум.</li>
    </ol>
    <p class="hint">Источники: <a href="${mode.source}" target="_blank" rel="noopener">NCHFP — режим для продукта</a>, <a href="https://nchfp.uga.edu/how/can/general-information/recommended-canners/" target="_blank" rel="noopener">NCHFP — как работать с автоклавом</a>. При 10–15 psi на уровне моря в автоклаве 116–121 °C; ориентир — давление по манометру и время.</p>
    <button type="button" class="btn btn-primary btn-small" data-act="log-batch">Записать партию в журнал</button>`;
  updateBatchResult(mode);
}

function updateBatchResult(mode) {
  const out = el("batchResult");
  if (!out) return;
  const s = canningSettings();
  const jar = CANNING_JARS.find(j => j.id === s.jarId);
  el("batchForm").querySelector('[name="perJar"]').placeholder = `≈ ${defaultPerJar(jar)}`;
  if (!s.rawKg) {
    out.textContent = "Укажите вес сырья — появится расчёт банок и загрузок.";
    return;
  }
  const r = currentBatch(mode);
  if (r && r.error) {
    out.textContent = r.error;
    return;
  }
  out.innerHTML = `Получится <strong>${r.jars} ${plural(r.jars, "банка", "банки", "банок")}</strong> по ${esc(jar.label)} — ` +
    `${r.loads} ${plural(r.loads, "загрузка", "загрузки", "загрузок")}` +
    (r.loads > 1 && r.lastLoad !== Math.floor(Number(s.capacity)) ? ` (в последней ${r.lastLoad})` : "") +
    (mode ? `. Каждая загрузка — 10 мин продувки, выход на давление, ${mode.minutes} мин стерилизации и естественное остывание.` : ".") +
    (r.saltTsp ? ` Соли по желанию — ${formatAmount(r.saltTsp * r.jars)} ч.л. на партию.` : "");
}

function currentBatch(mode) {
  const s = canningSettings();
  const jar = CANNING_JARS.find(j => j.id === s.jarId);
  const product = mode ? mode.product : CANNING_PRODUCTS.find(p => p.id === s.productId);
  return canningBatch(parseAmount(String(s.rawKg)), parseAmount(String(s.perJar)) || defaultPerJar(jar), parseAmount(String(s.capacity)), product, jar);
}

// --- Журнал партий ---

function renderBatchJournal() {
  const box = el("batchJournal");
  const batches = [...loadSection("canning").batches].sort((a, b) => b.date.localeCompare(a.date));
  if (!batches.length) {
    box.innerHTML = `<p class="hint">Записывайте каждую партию: что, когда, сколько банок и по какому режиму. Так видно, что съесть в первую очередь.</p>`;
    return;
  }
  const today = todayIso();
  box.innerHTML = `<ul class="bottle-list">${batches.map(b => {
    const best = addMonths(b.date, 12);
    const stale = today > best && b.left > 0;
    return `<li class="bottle${b.left === 0 ? " bottle-finished" : ""}">
      <div class="bottle-main">
        <span class="bottle-title">${esc(b.label)}</span>
        ${stale ? `<span class="stage stage-strain-due">съесть в первую очередь</span>` : ""}
        ${b.left === 0 ? `<span class="stage">съедено</span>` : ""}
        <div class="bottle-facts">${esc(ruDate(b.date))} · ${esc(b.jarLabel)} · ${esc(b.mode)} · лучше съесть до ${esc(ruDate(best))}</div>
        ${b.notes ? `<div class="bottle-notes">${esc(b.notes)}</div>` : ""}
      </div>
      <div class="bottle-actions">
        <span class="jar-counter">
          <button type="button" class="btn-icon" data-act="jar-minus" data-id="${b.id}" aria-label="Взяли банку: минус одна"${b.left <= 0 ? " disabled" : ""}>−</button>
          <span>${b.left} из ${b.jars}</span>
          <button type="button" class="btn-icon" data-act="jar-plus" data-id="${b.id}" aria-label="Вернуть банку: плюс одна"${b.left >= b.jars ? " disabled" : ""}>+</button>
        </span>
        <button type="button" class="btn btn-secondary btn-small" data-act="edit-batch" data-id="${b.id}">Изменить</button>
        <button type="button" class="btn-icon" data-act="del-batch" data-id="${b.id}" aria-label="Удалить запись" title="Удалить запись">✕</button>
      </div>
    </li>`;
  }).join("")}</ul>`;
}

function openBatchLog(batch, maker) {
  const form = el("batchLogForm");
  form.reset();
  form.dataset.id = batch ? batch.id : "";
  form.dataset.maker = maker ? maker.id : "";
  el("batchModalTitle").textContent = batch ? "Изменить запись" : "Записать партию";
  if (batch) {
    el("batchModeLine").textContent = `${batch.label} · ${batch.jarLabel} · ${batch.mode}`;
    el("blDate").value = batch.date;
    el("blJars").value = batch.jars;
    el("blLeft").value = batch.left;
    el("blNotes").value = batch.notes || "";
  } else if (maker) {
    el("batchModeLine").textContent = `${maker.product} · ${maker.jar} · ${formatAmount(maker.temp)} °C, ${maker.minutes} мин (по данным производителя)`;
    el("blDate").value = todayIso();
  } else {
    const mode = currentCanningMode();
    if (!mode.ok) return;
    const jar = CANNING_JARS.find(j => j.id === canningSettings().jarId);
    el("batchModeLine").textContent = `${mode.product.label} · ${jar.label} · ${mode.minutes} мин при ${mode.psi} psi`;
    el("blDate").value = todayIso();
    const batchCalc = canningSettings().rawKg ? currentBatch(mode) : null;
    el("blJars").value = batchCalc && !batchCalc.error ? batchCalc.jars : "";
    el("blLeft").value = "";
  }
  openModal(el("batchModal"));
}

function saveBatchLog(e) {
  e.preventDefault();
  const form = el("batchLogForm");
  const jars = Math.round(parseAmount(el("blJars").value));
  if (!(jars > 0)) return;
  const leftRaw = el("blLeft").value.trim();
  const left = leftRaw === "" ? jars : Math.min(jars, Math.max(0, Math.round(parseAmount(leftRaw) || 0)));
  const data = loadSection("canning");
  const existing = data.batches.find(b => b.id === form.dataset.id);
  const maker = canningSettings().makerModes.find(m => m.id === form.dataset.maker);
  if (existing) {
    Object.assign(existing, { date: el("blDate").value, jars, left, notes: el("blNotes").value.trim(), updatedAt: new Date().toISOString() });
  } else if (maker) {
    data.batches.push({
      id: newId("cb"),
      date: el("blDate").value,
      productId: null,
      label: maker.product,
      jarLabel: maker.jar,
      mode: `${formatAmount(maker.temp)} °C, ${maker.minutes} мин (производитель)`,
      jars,
      left,
      notes: el("blNotes").value.trim(),
      updatedAt: new Date().toISOString()
    });
  } else {
    const mode = currentCanningMode();
    if (!mode.ok) return;
    const jar = CANNING_JARS.find(j => j.id === canningSettings().jarId);
    data.batches.push({
      id: newId("cb"),
      date: el("blDate").value,
      productId: mode.product.id,
      label: mode.product.label,
      jarLabel: jar.label,
      mode: `${mode.minutes} мин при ${mode.psi} psi`,
      jars,
      left,
      notes: el("blNotes").value.trim(),
      updatedAt: new Date().toISOString()
    });
  }
  saveSection("canning", data);
  closeModal(el("batchModal"), true);
  renderBatchJournal();
}

// --- События ---

function onCanningChange(e) {
  if (e.target.closest("#cannerForm") && (e.target.name === "canner" || e.target.name === "lids")) {
    saveCanningSettings({ [e.target.name]: e.target.value });
    updateCanningResult();
    return;
  }
  if (!e.target.closest("#canningForm")) return;
  const name = e.target.name;
  if (!["productId", "jarId", "gauge"].includes(name)) return;
  const patch = { [name]: e.target.value };
  if (name === "jarId") {
    patch.perJar = "";
    el("batchForm").querySelector('[name="perJar"]').value = "";
  }
  saveCanningSettings(patch);
  updateCanningResult();
}

function onCanningInput(e) {
  const name = e.target.name;
  if (e.target.closest("#cannerForm") && name === "model") {
    saveCanningSettings({ model: e.target.value.trim() });
    const h = el("makerSection").querySelector("h3");
    h.textContent = "Режимы из инструкции автоклава" + (e.target.value.trim() ? ` «${e.target.value.trim()}»` : "");
    return;
  }
  if (e.target.closest("#makerForm")) return;
  if (!["elevation", "rawKg", "perJar", "capacity"].includes(name)) return;
  saveCanningSettings({ [name]: e.target.value });
  if (name === "elevation") updateCanningResult();
  else updateBatchResult(validatedMode());
}

function onCanningClick(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const data = loadSection("canning");
  const b = data.batches.find(x => x.id === btn.dataset.id);

  if (btn.dataset.act === "del-maker") {
    const modes = canningSettings().makerModes;
    const m = modes.find(x => x.id === btn.dataset.id);
    if (!m || !confirm(`Удалить режим «${m.product}, ${m.jar}»?`)) return;
    saveCanningSettings({ makerModes: modes.filter(x => x.id !== m.id) });
    return renderMakerModes();
  }
  if (btn.dataset.act === "log-maker") {
    const m = canningSettings().makerModes.find(x => x.id === btn.dataset.id);
    return m && openBatchLog(null, m);
  }

  switch (btn.dataset.act) {
    case "log-batch": return openBatchLog();
    case "edit-batch": return b && openBatchLog(b);
    case "jar-minus":
    case "jar-plus":
      if (!b) return;
      b.left = Math.min(b.jars, Math.max(0, b.left + (btn.dataset.act === "jar-plus" ? 1 : -1)));
      b.updatedAt = new Date().toISOString();
      break;
    case "del-batch":
      if (!b || !confirm(`Удалить запись о партии «${b.label}» от ${ruDate(b.date)}?`)) return;
      data.batches = data.batches.filter(x => x.id !== b.id);
      break;
    default: return;
  }
  saveSection("canning", data);
  renderBatchJournal();
  // После перерисовки возвращаем фокус на ту же кнопку.
  const again = el("batchJournal").querySelector(`[data-act="${btn.dataset.act}"][data-id="${btn.dataset.id}"]`);
  if (again && !again.disabled) again.focus();
}
