// Встроенная база продуктов: пищевая ценность на 100 г и гликемический индекс (ГИ).
// Источники: макронутриенты — по типу таблиц Скурихина / USDA (усреднённые
// справочные значения); ГИ — по International Tables of Glycemic Index and
// Glycemic Load (Foster-Powell et al.), где для круп/макарон/риса указан ГИ
// приготовленного (варёного) продукта. Значения ориентировочные и могут
// отличаться от конкретной марки/партии продукта.
//
// gi: null — гликемический индекс не определяется (нет значимого количества углеводов).
// units — свои единицы измерения продукта в граммах; «г», «ст.л.», «ч.л.»,
//         «щепотка» и «по вкусу» добавляются автоматически (см. nutrition.js).
//
// Вес ложек — без горки (мерной ложкой вровень с краем), как в современных
// рецептах: ст.л. = 15 мл, ч.л. = 5 мл; для сыпучих и густых продуктов —
// по их плотности (масло 14 г, сахар 12 г, мука 10 г, соль 18 г, мёд 21 г).
// В старых советских таблицах сыпучие мерили «с горкой» — заметно больше.
//
// Этот список неизменяемый. Свои продукты пользователь добавляет через раздел
// «Продукты», они хранятся отдельно и перекрывают встроенные по совпадению
// имени (см. store.js).

const GENERIC_UNITS = {
  "г": 1,
  "мл": 1,
  "шт": 30,
  "ст.л.": 15,
  "ч.л.": 5,
  "стакан": 200,
  "щепотка": 1,
  "по вкусу": 0
};

const PRODUCT_CATEGORIES = [
  "Молочные и яйца",
  "Мясо, птица, рыба",
  "Крупы и мучное",
  "Бобовые",
  "Овощи и грибы",
  "Фрукты и ягоды",
  "Орехи и семена",
  "Сахар и сладости",
  "Масла, соусы и специи",
  "Напитки"
];

const BUILTIN_PRODUCTS = [
  // Молочные продукты и яйца
  { name: "Молоко 2.5%", category: "Молочные и яйца", kcal: 52, protein: 2.8, fat: 2.5, carbs: 4.7, gi: 30, units: { "мл": 1, "стакан": 250 } },
  { name: "Кефир 1%", category: "Молочные и яйца", kcal: 40, protein: 3, fat: 1, carbs: 4, gi: 25, units: { "мл": 1, "стакан": 250 } },
  { name: "Йогурт натуральный", category: "Молочные и яйца", kcal: 60, protein: 5, fat: 3.2, carbs: 3.5, gi: 35, units: { "мл": 1, "стакан": 250 } },
  { name: "Творог 5%", category: "Молочные и яйца", kcal: 121, protein: 17.2, fat: 5, carbs: 1.8, gi: 30, units: {} },
  { name: "Творог обезжиренный", category: "Молочные и яйца", kcal: 71, protein: 16.5, fat: 0.6, carbs: 1.3, gi: 30, units: {} },
  { name: "Сметана 20%", category: "Молочные и яйца", kcal: 206, protein: 2.8, fat: 20, carbs: 3.2, gi: null, units: { "ст.л.": 18 } },
  { name: "Сливки 20%", category: "Молочные и яйца", kcal: 205, protein: 2.8, fat: 20, carbs: 3.7, gi: null, units: { "мл": 1 } },
  { name: "Сыр твёрдый", category: "Молочные и яйца", kcal: 363, protein: 24, fat: 29, carbs: 0.3, gi: null, units: {} },
  { name: "Сыр моцарелла", category: "Молочные и яйца", kcal: 280, protein: 22, fat: 22, carbs: 2.2, gi: null, units: {} },
  { name: "Сыр творожный", category: "Молочные и яйца", kcal: 253, protein: 5.5, fat: 25, carbs: 3, gi: null, units: { "ст.л.": 20 } },
  { name: "Масло сливочное", category: "Молочные и яйца", kcal: 748, protein: 0.5, fat: 82.5, carbs: 0.8, gi: null, units: { "ст.л.": 14, "ч.л.": 5 } },
  { name: "Яйцо куриное", category: "Молочные и яйца", kcal: 157, protein: 12.7, fat: 11.5, carbs: 0.7, gi: null, units: { "шт": 50 } },
  { name: "Пахта", category: "Молочные и яйца", kcal: 40, protein: 3.3, fat: 1, carbs: 4.8, gi: 30, units: { "мл": 1, "стакан": 250 } },
  { name: "Сливки 33%", category: "Молочные и яйца", kcal: 337, protein: 2.2, fat: 33, carbs: 3.2, gi: null, units: { "мл": 1 } },
  { name: "Рикотта", category: "Молочные и яйца", kcal: 174, protein: 11.3, fat: 13, carbs: 3, gi: null, units: {} },
  { name: "Сыр пармезан", category: "Молочные и яйца", kcal: 392, protein: 35.8, fat: 29.7, carbs: 3.2, gi: null, units: { "ст.л.": 5 } },
  { name: "Сыр проволоне", category: "Молочные и яйца", kcal: 351, protein: 25.6, fat: 26.6, carbs: 2.1, gi: null, units: {} },
  { name: "Заварной крем ванильный", category: "Молочные и яйца", kcal: 120, protein: 3, fat: 4, carbs: 18, gi: 40, units: { "мл": 1 } },

  // Мясо, птица, рыба
  { name: "Говядина", category: "Мясо, птица, рыба", kcal: 187, protein: 18.9, fat: 12.4, carbs: 0, gi: null, units: {} },
  { name: "Свинина нежирная", category: "Мясо, птица, рыба", kcal: 142, protein: 19.4, fat: 7.1, carbs: 0, gi: null, units: {} },
  { name: "Курица (грудка)", category: "Мясо, птица, рыба", kcal: 113, protein: 23.6, fat: 1.9, carbs: 0.4, gi: null, units: {} },
  { name: "Курица (бедро)", category: "Мясо, птица, рыба", kcal: 185, protein: 16.8, fat: 12.4, carbs: 0, gi: null, units: {} },
  { name: "Индейка (грудка)", category: "Мясо, птица, рыба", kcal: 84, protein: 19.2, fat: 0.7, carbs: 0, gi: null, units: {} },
  { name: "Фарш говяжий", category: "Мясо, птица, рыба", kcal: 254, protein: 17.2, fat: 20, carbs: 0, gi: null, units: {} },
  { name: "Фарш куриный", category: "Мясо, птица, рыба", kcal: 143, protein: 17.4, fat: 8.1, carbs: 0, gi: null, units: {} },
  { name: "Лосось", category: "Мясо, птица, рыба", kcal: 142, protein: 19.8, fat: 6.3, carbs: 0, gi: null, units: {} },
  { name: "Тунец", category: "Мясо, птица, рыба", kcal: 96, protein: 22.5, fat: 0.7, carbs: 0, gi: null, units: {} },
  { name: "Тунец консервированный", category: "Мясо, птица, рыба", kcal: 96, protein: 21, fat: 1, carbs: 0, gi: null, units: { "банка": 185 } },
  { name: "Треска", category: "Мясо, птица, рыба", kcal: 78, protein: 17.7, fat: 0.7, carbs: 0, gi: null, units: {} },
  { name: "Камбала", category: "Мясо, птица, рыба", kcal: 90, protein: 15.7, fat: 3, carbs: 0, gi: null, units: {} },
  { name: "Снежная рыба", category: "Мясо, птица, рыба", kcal: 75, protein: 16.5, fat: 1.2, carbs: 0, gi: null, units: {} },
  { name: "Креветки", category: "Мясо, птица, рыба", kcal: 87, protein: 18.9, fat: 1.2, carbs: 0, gi: null, units: {} },
  { name: "Колбаса варёная", category: "Мясо, птица, рыба", kcal: 257, protein: 12, fat: 22.8, carbs: 0, gi: null, units: {} },
  { name: "Бекон", category: "Мясо, птица, рыба", kcal: 417, protein: 12.6, fat: 39.7, carbs: 1.3, gi: null, units: {} },
  { name: "Прошутто", category: "Мясо, птица, рыба", kcal: 195, protein: 25, fat: 10, carbs: 0, gi: null, units: {} },

  // Крупы, мука, хлеб, макароны
  { name: "Мука пшеничная в/с", category: "Крупы и мучное", kcal: 334, protein: 10.3, fat: 1.1, carbs: 69, gi: 70, units: { "ст.л.": 10, "ч.л.": 3, "стакан": 130 } },
  { name: "Рис белый (сырой)", category: "Крупы и мучное", kcal: 344, protein: 6.7, fat: 0.7, carbs: 78.9, gi: 70, units: { "стакан": 185 } },
  { name: "Рис бурый (сырой)", category: "Крупы и мучное", kcal: 337, protein: 7.4, fat: 2.7, carbs: 72.9, gi: 50, units: { "стакан": 185 } },
  { name: "Гречка (сырая)", category: "Крупы и мучное", kcal: 313, protein: 12.6, fat: 3.3, carbs: 62, gi: 50, units: { "стакан": 200 } },
  { name: "Овсяные хлопья", category: "Крупы и мучное", kcal: 352, protein: 12.3, fat: 6.1, carbs: 61.8, gi: 55, units: { "стакан": 90, "ст.л.": 6 } },
  { name: "Манная крупа", category: "Крупы и мучное", kcal: 333, protein: 10.3, fat: 1, carbs: 70.6, gi: 65, units: { "ст.л.": 10, "ч.л.": 3.5 } },
  { name: "Перловая крупа", category: "Крупы и мучное", kcal: 320, protein: 9.3, fat: 1.1, carbs: 66.9, gi: 25, units: {} },
  { name: "Кускус", category: "Крупы и мучное", kcal: 376, protein: 12.8, fat: 0.6, carbs: 77.4, gi: 65, units: {} },
  { name: "Булгур", category: "Крупы и мучное", kcal: 342, protein: 12.3, fat: 1.3, carbs: 63.4, gi: 48, units: {} },
  { name: "Макароны (сухие)", category: "Крупы и мучное", kcal: 337, protein: 10.4, fat: 1.1, carbs: 70.5, gi: 50, units: {} },
  { name: "Хлеб пшеничный", category: "Крупы и мучное", kcal: 265, protein: 8.1, fat: 3.2, carbs: 48.8, gi: 70, units: { "кусок": 25 } },
  { name: "Хлеб ржаной", category: "Крупы и мучное", kcal: 214, protein: 6.6, fat: 1.2, carbs: 40.7, gi: 50, units: { "кусок": 25 } },
  { name: "Лаваш", category: "Крупы и мучное", kcal: 236, protein: 7.9, fat: 1, carbs: 47.6, gi: 70, units: { "шт": 90 } },
  { name: "Панировочные сухари", category: "Крупы и мучное", kcal: 347, protein: 11, fat: 1.4, carbs: 71.3, gi: 70, units: { "ст.л.": 10 } },
  { name: "Крахмал картофельный", category: "Крупы и мучное", kcal: 300, protein: 0.1, fat: 0, carbs: 79.6, gi: 95, units: { "ст.л.": 10, "ч.л.": 3 } },
  { name: "Мука самоподнимающаяся", category: "Крупы и мучное", kcal: 330, protein: 9.8, fat: 1.1, carbs: 71, gi: 70, units: { "стакан": 130 } },
  { name: "Кукурузная мука", category: "Крупы и мучное", kcal: 362, protein: 8.1, fat: 3.6, carbs: 76.9, gi: 68, units: { "стакан": 160 } },
  { name: "Ванильный пудинг (порошок)", category: "Крупы и мучное", kcal: 355, protein: 0.3, fat: 0.5, carbs: 88, gi: 65, units: { "ст.л.": 10 } },

  // Бобовые
  { name: "Чечевица (сухая)", category: "Бобовые", kcal: 295, protein: 24.6, fat: 1.1, carbs: 46.3, gi: 32, units: { "стакан": 190 } },
  { name: "Фасоль красная (сухая)", category: "Бобовые", kcal: 298, protein: 21, fat: 2, carbs: 47, gi: 35, units: { "стакан": 180 } },
  { name: "Нут (сухой)", category: "Бобовые", kcal: 364, protein: 19, fat: 6, carbs: 61, gi: 30, units: { "стакан": 190 } },
  { name: "Горох (сухой)", category: "Бобовые", kcal: 298, protein: 20.5, fat: 2, carbs: 49.5, gi: 35, units: { "стакан": 190 } },
  { name: "Горошек зелёный консервированный", category: "Бобовые", kcal: 55, protein: 3.6, fat: 0.2, carbs: 9.8, gi: 45, units: { "ст.л.": 20, "банка": 400 } },

  // Овощи и грибы
  { name: "Картофель", category: "Овощи и грибы", kcal: 77, protein: 2, fat: 0.4, carbs: 16.3, gi: 70, units: { "шт": 100 } },
  { name: "Морковь", category: "Овощи и грибы", kcal: 32, protein: 1.3, fat: 0.1, carbs: 6.9, gi: 35, units: { "шт": 90 } },
  { name: "Свёкла", category: "Овощи и грибы", kcal: 40, protein: 1.5, fat: 0.1, carbs: 8.8, gi: 64, units: { "шт": 120 } },
  { name: "Лук репчатый", category: "Овощи и грибы", kcal: 41, protein: 1.4, fat: 0.2, carbs: 9.3, gi: 15, units: { "шт": 100 } },
  { name: "Лук зелёный", category: "Овощи и грибы", kcal: 32, protein: 1.8, fat: 0.6, carbs: 4.6, gi: 15, units: { "пучок": 30 } },
  { name: "Чеснок", category: "Овощи и грибы", kcal: 149, protein: 6.5, fat: 0.5, carbs: 29.9, gi: 30, units: { "зубчик": 5 } },
  { name: "Капуста белокочанная", category: "Овощи и грибы", kcal: 27, protein: 1.8, fat: 0.1, carbs: 4.7, gi: 15, units: {} },
  { name: "Помидор", category: "Овощи и грибы", kcal: 20, protein: 1.1, fat: 0.2, carbs: 3.7, gi: 30, units: { "шт": 120 } },
  { name: "Помидоры в собственном соку", category: "Овощи и грибы", kcal: 24, protein: 1.1, fat: 0.2, carbs: 4.3, gi: 35, units: { "банка": 400 } },
  { name: "Огурец", category: "Овощи и грибы", kcal: 15, protein: 0.8, fat: 0.1, carbs: 2.8, gi: 15, units: { "шт": 100 } },
  { name: "Огурец солёный", category: "Овощи и грибы", kcal: 11, protein: 0.8, fat: 0.1, carbs: 1.7, gi: 15, units: { "шт": 60 } },
  { name: "Перец болгарский", category: "Овощи и грибы", kcal: 27, protein: 1.3, fat: 0.1, carbs: 5.3, gi: 15, units: { "шт": 120 } },
  { name: "Кабачок", category: "Овощи и грибы", kcal: 24, protein: 0.6, fat: 0.3, carbs: 4.6, gi: 15, units: { "шт": 300 } },
  { name: "Баклажан", category: "Овощи и грибы", kcal: 24, protein: 1.2, fat: 0.1, carbs: 4.5, gi: 20, units: { "шт": 250 } },
  { name: "Тыква", category: "Овощи и грибы", kcal: 22, protein: 1, fat: 0.1, carbs: 4.4, gi: 75, units: {} },
  { name: "Брокколи", category: "Овощи и грибы", kcal: 34, protein: 2.8, fat: 0.4, carbs: 6.6, gi: 15, units: {} },
  { name: "Цветная капуста", category: "Овощи и грибы", kcal: 25, protein: 2.5, fat: 0.3, carbs: 4.2, gi: 15, units: {} },
  { name: "Шпинат", category: "Овощи и грибы", kcal: 23, protein: 2.9, fat: 0.3, carbs: 2, gi: 15, units: {} },
  { name: "Салат листовой", category: "Овощи и грибы", kcal: 15, protein: 1.4, fat: 0.2, carbs: 2.9, gi: 15, units: { "пучок": 100 } },
  { name: "Сельдерей стеблевой", category: "Овощи и грибы", kcal: 13, protein: 0.9, fat: 0.1, carbs: 2.1, gi: 15, units: { "шт": 40 } },
  { name: "Кукуруза (варёная)", category: "Овощи и грибы", kcal: 96, protein: 3.4, fat: 1.5, carbs: 19, gi: 55, units: { "шт": 150 } },
  { name: "Кукуруза консервированная", category: "Овощи и грибы", kcal: 58, protein: 2.2, fat: 0.4, carbs: 11.2, gi: 55, units: { "ст.л.": 20, "банка": 340 } },
  { name: "Шампиньоны", category: "Овощи и грибы", kcal: 27, protein: 4.3, fat: 1, carbs: 0.1, gi: 15, units: { "шт": 20 } },
  { name: "Укроп", category: "Овощи и грибы", kcal: 38, protein: 2.5, fat: 0.5, carbs: 6.3, gi: 15, units: { "пучок": 30 } },
  { name: "Петрушка", category: "Овощи и грибы", kcal: 47, protein: 3.7, fat: 0.4, carbs: 7.6, gi: 15, units: { "пучок": 30 } },
  { name: "Базилик свежий", category: "Овощи и грибы", kcal: 23, protein: 3.2, fat: 0.6, carbs: 2.7, gi: 15, units: { "пучок": 20 } },
  { name: "Лайм", category: "Овощи и грибы", kcal: 30, protein: 0.7, fat: 0.2, carbs: 10.5, gi: 20, units: { "шт": 70 } },
  { name: "Перец чили (халапеньо)", category: "Овощи и грибы", kcal: 29, protein: 0.9, fat: 0.4, carbs: 6.5, gi: null, units: { "шт": 15 } },
  { name: "Кориандр свежий", category: "Овощи и грибы", kcal: 23, protein: 2.1, fat: 0.5, carbs: 3.7, gi: 15, units: { "пучок": 20 } },
  { name: "Ревень", category: "Овощи и грибы", kcal: 21, protein: 0.9, fat: 0.2, carbs: 4.5, gi: null, units: {} },
  { name: "Шнитт-лук", category: "Овощи и грибы", kcal: 30, protein: 3.3, fat: 0.7, carbs: 4.4, gi: 15, units: { "ст.л.": 3 } },

  // Фрукты и ягоды
  { name: "Яблоко", category: "Фрукты и ягоды", kcal: 47, protein: 0.4, fat: 0.4, carbs: 9.8, gi: 35, units: { "шт": 150 } },
  { name: "Банан", category: "Фрукты и ягоды", kcal: 96, protein: 1.5, fat: 0.2, carbs: 21.8, gi: 60, units: { "шт": 120 } },
  { name: "Апельсин", category: "Фрукты и ягоды", kcal: 43, protein: 0.9, fat: 0.2, carbs: 8.1, gi: 35, units: { "шт": 150 } },
  { name: "Груша", category: "Фрукты и ягоды", kcal: 42, protein: 0.4, fat: 0.3, carbs: 10.3, gi: 33, units: { "шт": 130 } },
  { name: "Виноград", category: "Фрукты и ягоды", kcal: 65, protein: 0.6, fat: 0.2, carbs: 16.8, gi: 45, units: {} },
  { name: "Клубника", category: "Фрукты и ягоды", kcal: 33, protein: 0.8, fat: 0.4, carbs: 7.5, gi: 32, units: {} },
  { name: "Малина", category: "Фрукты и ягоды", kcal: 42, protein: 0.8, fat: 0.5, carbs: 8.3, gi: 30, units: {} },
  { name: "Черника", category: "Фрукты и ягоды", kcal: 44, protein: 1.1, fat: 0.4, carbs: 7.6, gi: 25, units: {} },
  { name: "Лимон", category: "Фрукты и ягоды", kcal: 16, protein: 0.9, fat: 0.1, carbs: 3, gi: 20, units: { "шт": 100 } },
  { name: "Изюм", category: "Фрукты и ягоды", kcal: 264, protein: 2.3, fat: 0.5, carbs: 66, gi: 65, units: { "ст.л.": 10 } },
  { name: "Курага", category: "Фрукты и ягоды", kcal: 232, protein: 5.2, fat: 0.3, carbs: 51, gi: 35, units: { "шт": 8 } },
  { name: "Финики", category: "Фрукты и ягоды", kcal: 292, protein: 2.5, fat: 0.5, carbs: 69.2, gi: 55, units: { "шт": 8 } },
  { name: "Авокадо", category: "Фрукты и ягоды", kcal: 160, protein: 2, fat: 14.7, carbs: 1.8, gi: 10, units: { "шт": 150 } },
  { name: "Личи консервированные", category: "Фрукты и ягоды", kcal: 66, protein: 0.5, fat: 0.1, carbs: 16.5, gi: 50, units: { "банка": 560 } },
  { name: "Маракуйя", category: "Фрукты и ягоды", kcal: 97, protein: 2.2, fat: 0.7, carbs: 23.4, gi: 30, units: { "шт": 40, "мл": 0.8 } },

  // Орехи и семена
  { name: "Грецкий орех", category: "Орехи и семена", kcal: 654, protein: 15.2, fat: 65.2, carbs: 13.7, gi: 15, units: {} },
  { name: "Миндаль", category: "Орехи и семена", kcal: 579, protein: 21.2, fat: 49.9, carbs: 21.6, gi: 15, units: {} },
  { name: "Арахис", category: "Орехи и семена", kcal: 567, protein: 26.3, fat: 49.2, carbs: 16.1, gi: 20, units: {} },
  { name: "Семена подсолнечника", category: "Орехи и семена", kcal: 584, protein: 20.7, fat: 52.9, carbs: 10.5, gi: 35, units: {} },
  { name: "Кунжут", category: "Орехи и семена", kcal: 573, protein: 17.7, fat: 49.7, carbs: 23.4, gi: 35, units: { "ст.л.": 9 } },

  // Сахар и сладости
  { name: "Сахар", category: "Сахар и сладости", kcal: 398, protein: 0, fat: 0, carbs: 99.8, gi: 70, units: { "ст.л.": 12, "ч.л.": 4, "стакан": 200 } },
  { name: "Мёд", category: "Сахар и сладости", kcal: 304, protein: 0.3, fat: 0, carbs: 78.4, gi: 60, units: { "ст.л.": 21, "ч.л.": 7 } },
  { name: "Шоколад тёмный 70%", category: "Сахар и сладости", kcal: 546, protein: 7.8, fat: 37.1, carbs: 45.9, gi: 25, units: {} },
  { name: "Шоколад молочный", category: "Сахар и сладости", kcal: 535, protein: 6.9, fat: 29.7, carbs: 54.4, gi: 50, units: {} },
  { name: "Варенье", category: "Сахар и сладости", kcal: 271, protein: 0.3, fat: 0.2, carbs: 68.2, gi: 65, units: { "ст.л.": 20 } },
  { name: "Ванильный сахар", category: "Сахар и сладости", kcal: 379, protein: 0.1, fat: 0, carbs: 99.5, gi: 65, units: { "пакетик": 10 } },
  { name: "Ванильный экстракт", category: "Сахар и сладости", kcal: 288, protein: 0.1, fat: 0.1, carbs: 12.7, gi: null, units: { "ч.л.": 4, "ст.л.": 13 } },
  { name: "Шоколад белый", category: "Сахар и сладости", kcal: 539, protein: 5.9, fat: 32.1, carbs: 59.2, gi: 44, units: {} },
  { name: "Кокосовая стружка", category: "Сахар и сладости", kcal: 660, protein: 6.9, fat: 65, carbs: 6.4, gi: 15, units: {} },
  { name: "Лимонный курд", category: "Сахар и сладости", kcal: 283, protein: 0.6, fat: 7, carbs: 54, gi: 50, units: { "ст.л.": 20 } },
  { name: "Конфеты с арахисовой пастой", category: "Сахар и сладости", kcal: 545, protein: 11, fat: 33, carbs: 52, gi: 45, units: { "шт": 17 } },

  // Масла, соусы и специи
  { name: "Растительное масло", category: "Масла, соусы и специи", kcal: 899, protein: 0, fat: 99.9, carbs: 0, gi: null, units: { "мл": 0.92, "ст.л.": 14, "ч.л.": 4.5 } },
  { name: "Оливковое масло", category: "Масла, соусы и специи", kcal: 898, protein: 0, fat: 99.8, carbs: 0, gi: null, units: { "мл": 0.92, "ст.л.": 14, "ч.л.": 4.5 } },
  { name: "Майонез", category: "Масла, соусы и специи", kcal: 627, protein: 2.4, fat: 67, carbs: 3.9, gi: 60, units: { "ст.л.": 15 } },
  { name: "Томатная паста", category: "Масла, соусы и специи", kcal: 82, protein: 4.3, fat: 0.5, carbs: 19, gi: 35, units: { "ст.л.": 16, "ч.л.": 5 } },
  { name: "Соевый соус", category: "Масла, соусы и специи", kcal: 53, protein: 8.1, fat: 0.6, carbs: 4.1, gi: 20, units: { "мл": 1.1, "ст.л.": 16, "ч.л.": 5 } },
  { name: "Горчица", category: "Масла, соусы и специи", kcal: 143, protein: 9.9, fat: 12.7, carbs: 5.3, gi: 35, units: { "ч.л.": 5, "ст.л.": 15 } },
  { name: "Уксус 9%", category: "Масла, соусы и специи", kcal: 11, protein: 0, fat: 0, carbs: 3, gi: null, units: { "мл": 1, "ст.л.": 15, "ч.л.": 5 } },
  { name: "Соль", category: "Масла, соусы и специи", kcal: 0, protein: 0, fat: 0, carbs: 0, gi: null, units: { "ч.л.": 6, "ст.л.": 18, "щепотка": 0.5 } },
  { name: "Перец чёрный молотый", category: "Масла, соусы и специи", kcal: 251, protein: 10.4, fat: 3.3, carbs: 38.7, gi: null, units: { "ч.л.": 2, "щепотка": 0.3 } },
  { name: "Паприка молотая", category: "Масла, соусы и специи", kcal: 282, protein: 14.1, fat: 13, carbs: 34, gi: null, units: { "ч.л.": 2, "ст.л.": 6, "щепотка": 0.3 } },
  { name: "Зира (кумин)", category: "Масла, соусы и специи", kcal: 375, protein: 17.8, fat: 22.3, carbs: 44.2, gi: null, units: { "ч.л.": 2, "щепотка": 0.3 } },
  { name: "Корица молотая", category: "Масла, соусы и специи", kcal: 247, protein: 4, fat: 1.2, carbs: 27.5, gi: null, units: { "ч.л.": 3, "щепотка": 0.3 } },
  { name: "Лавровый лист", category: "Масла, соусы и специи", kcal: 313, protein: 7.6, fat: 8.4, carbs: 48.7, gi: null, units: { "шт": 0.2 } },
  { name: "Сода пищевая", category: "Масла, соусы и специи", kcal: 0, protein: 0, fat: 0, carbs: 0, gi: null, units: { "ч.л.": 5 } },
  { name: "Разрыхлитель", category: "Масла, соусы и специи", kcal: 79, protein: 0, fat: 0, carbs: 40, gi: null, units: { "ч.л.": 4 } },
  { name: "Дрожжи сухие", category: "Масла, соусы и специи", kcal: 325, protein: 41, fat: 7.6, carbs: 28, gi: null, units: { "ч.л.": 3, "ст.л.": 9, "пакетик": 11 } },
  { name: "Кокосовое масло", category: "Масла, соусы и специи", kcal: 862, protein: 0, fat: 100, carbs: 0, gi: null, units: { "мл": 0.92, "ст.л.": 14, "ч.л.": 4.5 } },
  { name: "Кокосовое молоко консервированное", category: "Масла, соусы и специи", kcal: 230, protein: 2.3, fat: 24, carbs: 3.3, gi: null, units: { "мл": 1, "банка": 400 } },
  { name: "Кленовый сироп", category: "Масла, соусы и специи", kcal: 260, protein: 0, fat: 0.2, carbs: 67, gi: 54, units: { "ст.л.": 20 } },
  { name: "Соус песто", category: "Масла, соусы и специи", kcal: 303, protein: 3.5, fat: 31, carbs: 4, gi: null, units: { "ст.л.": 15 } },
  { name: "Соус хрен", category: "Масла, соусы и специи", kcal: 105, protein: 1, fat: 9, carbs: 5, gi: null, units: { "ст.л.": 15, "ч.л.": 5 } },
  { name: "Перец белый молотый", category: "Масла, соусы и специи", kcal: 296, protein: 10.4, fat: 2.1, carbs: 68.6, gi: null, units: { "ч.л.": 2, "ст.л.": 6, "щепотка": 0.3 } },
  { name: "Тимьян сушёный", category: "Масла, соусы и специи", kcal: 276, protein: 9.1, fat: 7.4, carbs: 45, gi: null, units: { "ч.л.": 1, "щепотка": 0.3 } },
  { name: "Чеснок молотый (порошок)", category: "Масла, соусы и специи", kcal: 331, protein: 16.6, fat: 0.7, carbs: 72.3, gi: null, units: { "ч.л.": 3, "ст.л.": 9 } },
  { name: "Лук молотый (порошок)", category: "Масла, соусы и специи", kcal: 341, protein: 10.1, fat: 1, carbs: 79, gi: null, units: { "ч.л.": 2.5, "ст.л.": 7 } },
  { name: "Кайенский перец", category: "Масла, соусы и специи", kcal: 318, protein: 12, fat: 17, carbs: 57, gi: null, units: { "ч.л.": 1.8, "щепотка": 0.3 } },

  // Напитки
  { name: "Вода", category: "Напитки", kcal: 0, protein: 0, fat: 0, carbs: 0, gi: null, units: { "мл": 1, "стакан": 250, "л": 1000 } },
  { name: "Сок апельсиновый", category: "Напитки", kcal: 45, protein: 0.7, fat: 0.2, carbs: 10.4, gi: 50, units: { "мл": 1, "стакан": 250 } },
  { name: "Кофе чёрный без сахара", category: "Напитки", kcal: 2, protein: 0.1, fat: 0, carbs: 0.3, gi: null, units: { "мл": 1, "стакан": 250 } },
  { name: "Какао-порошок", category: "Напитки", kcal: 289, protein: 24.3, fat: 15, carbs: 35, gi: 25, units: { "ст.л.": 6, "ч.л.": 2 } }
];

// Нормы отходов при холодной обработке, % от веса до очистки (брутто).
// Овощи — по Сборнику рецептур для предприятий общественного питания
// (картофель — норма сентября–октября, морковь и свёкла — до 1 января;
// зимой и весной отходы больше). Камбала — неразделанная, разделка кусками
// тушкой; при разделке на филе отходы у рыбы доходят до 50–60 %.
// Значения ориентировочные: в калькуляторе выхода их можно поправить под
// свой продукт, а в разделе «Продукты» — задать свои.
const WASTE_NORMS = {
  "Картофель": 25,
  "Морковь": 20,
  "Свёкла": 20,
  "Лук репчатый": 16,
  "Капуста белокочанная": 20,
  "Чеснок": 22,
  "Лук зелёный": 20,
  "Помидор": 15,
  "Огурец": 5,
  "Перец болгарский": 25,
  "Кабачок": 33,
  "Баклажан": 15,
  "Тыква": 30,
  "Укроп": 26,
  "Петрушка": 26,
  "Камбала": 35
};

BUILTIN_PRODUCTS.forEach(p => {
  if (WASTE_NORMS[p.name] !== undefined) p.waste = WASTE_NORMS[p.name];
});
