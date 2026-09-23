// Подбор режима автоклава и расчёт партии. Данные — canningData.js.

// Режим для продукта, банки, типа манометра и высоты (м).
// Возвращает { ok: true, minutes, psi, bar, ... } или { ok: false, reason }.
function canningMode(productId, jarId, gauge, elevationM) {
  const product = CANNING_PRODUCTS.find(p => p.id === productId);
  const jar = CANNING_JARS.find(j => j.id === jarId);
  if (!product || !jar) return { ok: false, reason: "Выберите продукт и банку." };

  if (!jar.uses) {
    return { ok: false, reason: `${jar.why} Проверенного режима нет — используйте банки до 0,95 л.` };
  }
  const minutes = product[jar.uses];
  if (!minutes) {
    return {
      ok: false,
      reason: `${product.note || "Для такой банки проверенного режима нет."} ` +
        "Возьмите банки до 0,47 л."
    };
  }

  const elevation = Number(elevationM);
  if (!(elevation >= 0)) return { ok: false, reason: "Укажите высоту над уровнем моря (для большинства городов России — до 300 м)." };
  const feet = elevation * FT_PER_M;
  const band = (CANNER_PRESSURE[gauge] || []).find(b => feet <= b.maxFt);
  if (!band) {
    return { ok: false, reason: "Для стрелочного манометра выше 2440 м проверенного давления нет." };
  }

  return {
    ok: true,
    product,
    jar,
    minutes,
    psi: band.psi,
    bar: band.psi * PSI_TO_BAR,
    jarNote: jar.why && jar.uses ? jar.why : "",
    source: NCHFP_BASE + product.path
  };
}

// Партия: сколько банок и загрузок. rawKg — сырьё, perJarG — сколько
// помещается в банку (проверяется на первой банке), capacity — банок за загрузку.
function canningBatch(rawKg, perJarG, capacity, product, jar) {
  const grams = Number(rawKg) * 1000;
  const per = Number(perJarG);
  const cap = Math.floor(Number(capacity));
  if (!(grams > 0) || !(per > 0) || !(cap > 0)) return { error: "Укажите вес сырья, сколько помещается в банку и сколько банок входит в автоклав." };
  const jars = Math.ceil(grams / per);
  const loads = Math.ceil(jars / cap);
  const saltTsp = saltPerJar(product, jar);
  return { jars, loads, lastLoad: jars - (loads - 1) * cap, saltTsp, saltGrams: saltTsp * 6 };
}

// Соль по желанию — по объёму банки от нормы на пинту (473 мл), с округлением
// до ¼ ч.л.: у NCHFP соль задана на пинту или кварту, а не на режим.
function saltPerJar(product, jar) {
  if (!product || !product.saltPerPint || !jar || !Number.isFinite(jar.maxMl)) return 0;
  return Math.round(product.saltPerPint * jar.maxMl / 473 * 4) / 4;
}

// Средняя загрузка банки сырьём по умолчанию — грубая оценка, её нужно
// уточнить на первой банке: 0,75 г на мл объёма с учётом отступа и заливки.
function defaultPerJar(jar) {
  const ml = jar && Number.isFinite(jar.maxMl) ? jar.maxMl : 500;
  return Math.round(ml * 0.75 / 10) * 10;
}

function addMonths(isoDate, months) {
  const d = new Date(isoDate + "T12:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
