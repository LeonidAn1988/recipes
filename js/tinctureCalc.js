// Расчёты для настоек: разведение спирта, крепость после добавок, сроки.
//
// Основа — плотность водно-спиртовых смесей при 20 °C по массовой доле
// спирта (справочные данные CRC, таблица DPVA; 100 % — плотность чистого
// этанола 0,78924 г/мл). Из неё получаем объёмную крепость и считаем
// разведение по сохранению массы спирта, поэтому сжатие смеси (контракция)
// учтено само. Сверено: плотность по объёмной доле совпадает с таблицей
// Р 50.2.041-2004 (ГОСТ 3639) до 0,4 кг/м³, количество воды — с таблицей
// Фертмана до 0,2 % (см. tests/tincture.test.js).

const ETHANOL_DENSITY = 0.78924; // г/мл, 20 °C
const WATER_DENSITY = 0.99820;   // г/мл, 20 °C
const SUGAR_VOLUME = 0.63;       // мл на 1 г растворённого сахара (сахароза)

// [массовая доля спирта, %; плотность смеси, г/мл] при 20 °C.
const ALCOHOL_DENSITY_BY_MASS = [
  [0, 0.99820], [0.5, 0.9973], [1, 0.9963], [2, 0.9945], [3, 0.9927], [4, 0.9910], [5, 0.9893],
  [6, 0.9878], [7, 0.9862], [8, 0.9847], [9, 0.9833], [10, 0.9819], [12, 0.9792], [14, 0.9765],
  [16, 0.9739], [18, 0.9713], [20, 0.9687], [22, 0.9660], [24, 0.9632], [26, 0.9602], [28, 0.9571],
  [30, 0.9539], [32, 0.9504], [34, 0.9468], [36, 0.9431], [38, 0.9392], [40, 0.9352], [42, 0.9311],
  [44, 0.9269], [46, 0.9227], [48, 0.9183], [50, 0.9139], [60, 0.8911], [70, 0.8676], [80, 0.8436],
  [90, 0.8180], [92, 0.8125], [94, 0.8070], [96, 0.8013], [98, 0.7954], [100, ETHANOL_DENSITY]
];

// Та же таблица, пересчитанная на объёмную крепость: [% об., г/мл, % масс.].
const ALCOHOL_TABLE = ALCOHOL_DENSITY_BY_MASS.map(([w, rho]) => [w * rho / ETHANOL_DENSITY, rho, w]);

function interpolate(x, col) {
  const t = ALCOHOL_TABLE;
  if (x <= t[0][0]) return t[0][col];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const k = (x - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
      return t[i - 1][col] + k * (t[i][col] - t[i - 1][col]);
    }
  }
  return t[t.length - 1][col];
}

// Плотность смеси (г/мл) по объёмной крепости.
function alcoholDensity(abv) {
  return interpolate(abv, 1);
}

// Массовая доля спирта (%) по объёмной крепости.
function alcoholMassFraction(abv) {
  return interpolate(abv, 2);
}

// Объёмная крепость по массовой доле (обратная задача — через таблицу).
function abvFromMassFraction(w) {
  const t = ALCOHOL_TABLE;
  if (w <= 0) return 0;
  for (let i = 1; i < t.length; i++) {
    if (w <= t[i][2]) {
      const k = (w - t[i - 1][2]) / (t[i][2] - t[i - 1][2]);
      return t[i - 1][0] + k * (t[i][0] - t[i - 1][0]);
    }
  }
  return 100;
}

// Сколько воды долить к volume мл крепостью fromAbv, чтобы получить toAbv.
// Возвращает { water, finalVolume } в мл или { error }.
function diluteSpirit(volume, fromAbv, toAbv) {
  if (!(volume > 0)) return { error: "Укажите объём спирта." };
  if (!(fromAbv > 0 && fromAbv <= 100)) return { error: "Крепость исходного спирта — от 0 до 100 %." };
  if (!(toAbv > 0)) return { error: "Укажите желаемую крепость." };
  if (toAbv >= fromAbv) return { error: "Желаемая крепость должна быть ниже исходной — водой крепость только понижают." };

  const mass = volume * alcoholDensity(fromAbv);
  const ethanolMass = volume * fromAbv / 100 * ETHANOL_DENSITY;
  const finalMass = ethanolMass / (alcoholMassFraction(toAbv) / 100);
  return {
    water: (finalMass - mass) / WATER_DENSITY,
    finalVolume: finalMass / alcoholDensity(toAbv)
  };
}

// Итог настойки после добавок. Все объёмы — мл, массы — г.
// parts: { spiritVolume, spiritAbv, water, syrupSugar, syrupWater, juice,
//          berries, berryJuicePercent }
// Сок и отданный ягодами сок считаем водой (их сахар не учитываем) —
// поэтому результат — оценка; точнее — замерить спиртомером после
// процеживания.
function mixTincture(parts) {
  const keys = ["spiritVolume", "spiritAbv", "water", "syrupSugar", "syrupWater", "juice", "berries", "berryJuicePercent"];
  const p = Object.fromEntries(keys.map(k => [k, Number(parts[k]) || 0]));
  if (!(p.spiritVolume > 0) || !(p.spiritAbv > 0)) return { error: "Укажите объём и крепость основы." };

  const ethanolMass = p.spiritVolume * p.spiritAbv / 100 * ETHANOL_DENSITY;
  const spiritMass = p.spiritVolume * alcoholDensity(p.spiritAbv);
  const berryJuice = p.berries * Math.min(Math.max(p.berryJuicePercent, 0), 100) / 100;
  const waterMass = (spiritMass - ethanolMass)
    + (p.water + p.syrupWater + p.juice) * WATER_DENSITY
    + berryJuice;

  const w = ethanolMass / (ethanolMass + waterMass) * 100;
  const aqueousVolume = (ethanolMass + waterMass) / alcoholDensity(abvFromMassFraction(w));
  const volume = aqueousVolume + p.syrupSugar * SUGAR_VOLUME;
  const pureAlcoholVolume = ethanolMass / ETHANOL_DENSITY;

  return {
    volume,
    abv: pureAlcoholVolume / volume * 100,
    sugarPerLiter: p.syrupSugar / volume * 1000
  };
}

// Даты: закладка + дни настаивания = процеживание, + дни отдыха = готово.
function addDays(isoDate, days) {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
}

function tinctureSchedule(startDate, infuseDays, restDays) {
  const strain = addDays(startDate, infuseDays);
  return { strain, ready: addDays(strain, restDays) };
}

// Состояние бутылки на дату today (ISO). После процеживания отдых считаем от
// фактической даты процеживания — процедить можно раньше или позже плана.
function bottleStage(bottle, today) {
  if (bottle.finished) return "finished";
  const { strain } = tinctureSchedule(bottle.startDate, bottle.infuseDays, bottle.restDays);
  if (bottle.strained) {
    return today < addDays(bottle.strainedOn || strain, bottle.restDays) ? "resting" : "ready";
  }
  return today < strain ? "infusing" : "strain-due";
}

// Дата готовности с учётом фактического процеживания.
function bottleReadyDate(bottle) {
  const { strain, ready } = tinctureSchedule(bottle.startDate, bottle.infuseDays, bottle.restDays);
  return bottle.strained ? addDays(bottle.strainedOn || strain, bottle.restDays) : ready;
}
