// Проверенные режимы консервирования под давлением для низкокислотных
// продуктов (мясо, птица, рыба, овощи). Источник — National Center for Home
// Food Preservation (NCHFP, партнёр USDA), страницы по продуктам, адаптированные
// из «USDA Complete Guide to Home Canning», 2015. Цифры перенесены из таблиц
// NCHFP без изменений; у каждого продукта — ссылка на исходную страницу.
//
// Ничего сверх таблиц не добавляем: сочетания, которых в таблицах нет
// (например, рыба в литровой банке), калькулятор не считает, а прямо
// говорит, что проверенного режима нет.

const NCHFP_BASE = "https://nchfp.uga.edu/how/can/";

// Давление по высоте над уровнем моря — одинаково для всех продуктов ниже.
// Стрелочный манометр: 11/12/13/14 psi на 0–2000/2001–4000/4001–6000/6001–8000 футов.
// Грузовой клапан: 10 psi до 1000 футов, 15 psi выше.
const CANNER_PRESSURE = {
  dial: [
    { maxFt: 2000, psi: 11 },
    { maxFt: 4000, psi: 12 },
    { maxFt: 6000, psi: 13 },
    { maxFt: 8000, psi: 14 }
  ],
  weighted: [
    { maxFt: 1000, psi: 10 },
    { maxFt: Infinity, psi: 15 }
  ]
};

// pint — банки ½ пинты и пинты (до 473 мл), quart — 1½ пинты и кварта (до 946 мл):
// «Process times for ½-pint and pint jars are the same, as are times for 1-½ pint
// and quart jars» (NCHFP, Selecting the Correct Processing Time).
// Время — минуты стерилизации при давлении из CANNER_PRESSURE.
// headspace — отступ от края банки, см; saltPerPint — соль по желанию, ч.л. на пинту
// (на банку другого объёма — пропорционально); prep — обязательные условия
// подготовки со страницы продукта, от них зависит прогрев.
const CANNING_PRODUCTS = [
  { id: "meat-chunks", group: "Мясо", label: "Мясо кусками (говядина, свинина, баранина, дичь)", pack: "горячая или сырая укладка",
    pint: 75, quart: 90, headspace: 2.5, saltPerPint: 0.5, path: "preparing-and-canning-poultry-red-meats-and-seafoods/meat-strips-cubes-or-chunks/",
    prep: "При сырой укладке жидкость не добавлять; при горячей — залить кипящим бульоном или водой." },
  { id: "meat-ground", group: "Мясо", label: "Фарш, рубленое мясо (предварительно обжаренное)", pack: "горячая укладка",
    pint: 75, quart: 90, headspace: 2.5, saltPerPint: 1, path: "preparing-and-canning-poultry-red-meats-and-seafoods/meat-ground-or-chopped/" },
  { id: "chicken-boneless", group: "Птица", label: "Курица или кролик без костей", pack: "горячая или сырая укладка",
    pint: 75, quart: 90, headspace: 3.2, saltPerPint: 0.5, path: "preparing-and-canning-poultry-red-meats-and-seafoods/chicken-or-rabbit/",
    prep: "При сырой укладке жидкость не добавлять; при горячей — залить кипящим бульоном." },
  { id: "chicken-bone", group: "Птица", label: "Курица или кролик с костями", pack: "горячая или сырая укладка",
    pint: 65, quart: 75, headspace: 3.2, saltPerPint: 0.5, path: "preparing-and-canning-poultry-red-meats-and-seafoods/chicken-or-rabbit/",
    prep: "При сырой укладке жидкость не добавлять; при горячей — залить кипящим бульоном." },
  { id: "fish", group: "Рыба", label: "Жирная рыба (лосось, форель, скумбрия; кроме тунца)", pack: "сырая укладка",
    pint: 100, quart: null, headspace: 2.5, saltPerPint: 1, path: "preparing-and-canning-poultry-red-meats-and-seafoods/fish-pint-jars-usda/",
    note: "Проверено только для банок до пинты (473 мл).",
    prep: "Выпотрошить не позже чем через 2 часа после вылова; куски около 9 см, кожей к стеклу; жидкость не добавлять." },
  { id: "meat-stock", group: "Бульоны", label: "Мясной бульон", pack: "горячая укладка",
    pint: 20, quart: 25, headspace: 2.5, saltPerPint: 0, path: "preparing-and-canning-poultry-red-meats-and-seafoods/meat-stock/" },
  { id: "poultry-stock", group: "Бульоны", label: "Куриный или индюшиный бульон", pack: "горячая укладка",
    pint: 20, quart: 25, headspace: 2.5, saltPerPint: 0, path: "preparing-and-canning-poultry-red-meats-and-seafoods/chicken-or-turkey-stock/" },
  { id: "carrots", group: "Овощи", label: "Морковь кружками или кубиками", pack: "горячая или сырая укладка",
    pint: 25, quart: 30, headspace: 2.5, saltPerPint: 0.5, path: "canning-vegetables-and-vegetable-products/carrots-sliced-or-diced/" },
  { id: "beets", group: "Овощи", label: "Свёкла целая, кубиками или ломтиками", pack: "горячая укладка",
    pint: 30, quart: 35, headspace: 2.5, saltPerPint: 0.5, path: "canning-vegetables-and-vegetable-products/beets-whole-cubed-or-sliced/" },
  { id: "potatoes", group: "Овощи", label: "Картофель кубиками или целый", pack: "горячая укладка",
    pint: 35, quart: 40, headspace: 2.5, saltPerPint: 0.5, path: "canning-vegetables-and-vegetable-products/potatoes-white-cubed-or-whole/",
    prep: "Целиком — только клубни 2,5–5 см; после отваривания залить свежим кипятком, не отваром (в нём много крахмала)." },
  { id: "green-beans", group: "Овощи", label: "Стручковая фасоль кусочками", pack: "горячая или сырая укладка",
    pint: 20, quart: 25, headspace: 2.5, saltPerPint: 0.5, path: "canning-vegetables-and-vegetable-products/beans-snap-and-italian-pieces-green-and-wax/" },
  { id: "corn", group: "Овощи", label: "Кукуруза зёрнами", pack: "горячая или сырая укладка",
    pint: 55, quart: 85, headspace: 2.5, saltPerPint: 0.5, path: "canning-vegetables-and-vegetable-products/corn-whole-kernel/" },
  { id: "peas", group: "Овощи", label: "Зелёный горошек", pack: "горячая или сырая укладка",
    pint: 40, quart: 40, headspace: 2.5, saltPerPint: 0.5, path: "canning-vegetables-and-vegetable-products/peas-green-or-english-shelled/" },
  { id: "dry-beans", group: "Овощи", label: "Сухая фасоль, горох, нут", pack: "горячая укладка",
    pint: 75, quart: 90, headspace: 2.5, saltPerPint: 0.5, path: "canning-vegetables-and-vegetable-products/beans-or-peas-shelled-dried-all-varieties/",
    prep: "Замочить, затем варить 30 минут и уложить горячими вместе с отваром." },
  { id: "mixed-veg", group: "Овощи", label: "Овощное ассорти (без капусты, тыквы и зелени)", pack: "горячая укладка",
    pint: 75, quart: 90, headspace: 2.5, saltPerPint: 0.5, path: "canning-vegetables-and-vegetable-products/mixed-vegetables/",
    note: "Режим проверен для смеси моркови, кукурузы, стручковой фасоли и фасоли лима, томатов и кабачков. Нельзя добавлять листовую зелень, сухую фасоль, тыкву, батат, брокколи, цветную и белокочанную капусту." },
  { id: "pumpkin", group: "Овощи", label: "Тыква кубиками (не пюре)", pack: "горячая укладка",
    pint: 55, quart: 90, headspace: 2.5, saltPerPint: 0, path: "canning-vegetables-and-vegetable-products/pumpkins-and-winter-squash-cubed/",
    note: "Только кубиками: для тыквенного пюре проверенного режима нет." },
  { id: "mushrooms", group: "Овощи", label: "Грибы культивированные (шампиньоны), целые или ломтиками", pack: "горячая укладка",
    pint: 45, quart: null, headspace: 2.5, saltPerPint: 0.5, path: "canning-vegetables-and-vegetable-products/mushrooms-whole-or-sliced/",
    note: "Проверено только для банок до пинты (473 мл). Лесные грибы консервировать нельзя: проверенного режима нет. Только культивированные грибы с закрытой шляпкой." },
  { id: "peppers", group: "Овощи", label: "Перец", pack: "горячая укладка",
    pint: 35, quart: null, headspace: 2.5, saltPerPint: 0.5, path: "canning-vegetables-and-vegetable-products/peppers/",
    note: "Проверено только для банок до пинты (473 мл).",
    prep: "Снять кожицу после бланширования или обжига, уложить неплотно." }
];

// Банки. Время для банок ½ пинты и пинты (до 473 мл) одинаковое, для 1½ пинты
// (710 мл) и кварты (946 мл) — тоже: «Process times for ½-pint and pint jars are
// the same, as are times for 1-½ pint and quart jars» (NCHFP). Поэтому
// 0,5–0,7 л — по времени кварты; больше кварты (1 л и крупнее) — не испытано.
const CANNING_JARS = [
  { id: "250", label: "до 0,25 л", maxMl: 250, uses: "pint" },
  { id: "470", label: "0,3–0,47 л", maxMl: 473, uses: "pint" },
  { id: "500", label: "0,5–0,7 л", maxMl: 710, uses: "quart", why: "Банки больше пинты (473 мл) и до 1½ пинты (710 мл) по правилу NCHFP обрабатывают по времени кварты." },
  { id: "950", label: "0,75–0,95 л", maxMl: 946, uses: "quart" },
  { id: "1000", label: "1 л и больше", maxMl: Infinity, uses: null, why: "Банки больше кварты (946 мл), в том числе литровые, в проверенных таблицах не испытаны." }
];

const PSI_TO_BAR = 0.0689476;
const FT_PER_M = 1 / 0.3048;
