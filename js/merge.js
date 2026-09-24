// Слияние двух версий книги (локальной и облачной) по записям.
//
// Раньше синхронизация работала по принципу «последний записавший прав»:
// устройство, которое не успело скачать облако, перезаписывало его своей
// почти пустой книгой — так 24.09.2026 пропали профиль и свой рецепт.
// Теперь при расхождении книги сливаются: записи с одинаковым id — берём
// более свежую по updatedAt, записи, которые есть только с одной стороны, —
// сохраняем. Удалённое помнится в «надгробиях» (recipes.tombstones) и при
// слиянии не воскресает.
//
// Чистые функции: вход — объекты data из snapshot() (ключ хранилища → значение).

const MERGE_KEYS = {
  recipes: "recipes.data", products: "recipes.products", menu: "recipes.menu", seeded: "recipes.seeded",
  tinctures: "recipes.tinctures", canning: "recipes.canning", profiles: "recipes.profiles",
  planner: "recipes.planner", tombstones: "recipes.tombstones"
};

const mgNewer = (a, b) => String((a && a.updatedAt) || "") >= String((b && b.updatedAt) || "") ? a : b;

// Список записей по ключу: объединение, при совпадении — более свежая.
// Порядок: сначала как в локальной версии, затем новое из облака.
function mgMergeList(local, remote, keyOf, dead) {
  const l = Array.isArray(local) ? local : [];
  const r = Array.isArray(remote) ? remote : [];
  const byKey = new Map(r.map(x => [keyOf(x), x]));
  const out = [];
  const seen = new Set();
  l.forEach(x => {
    const k = keyOf(x);
    if (dead.has(k) || seen.has(k)) return;
    seen.add(k);
    out.push(byKey.has(k) ? mgNewer(x, byKey.get(k)) : x);
  });
  r.forEach(x => {
    const k = keyOf(x);
    if (dead.has(k) || seen.has(k)) return;
    seen.add(k);
    out.push(x);
  });
  return out;
}

const mgById = x => x && x.id;
const mgUnion = (a, b) => [...new Set([...(a || []), ...(b || [])])];

function mergeBooks(localData, remoteData) {
  const L = localData || {};
  const R = remoteData || {};
  const tomb = { ...(R[MERGE_KEYS.tombstones] || {}), ...(L[MERGE_KEYS.tombstones] || {}) };
  const dead = new Set(Object.keys(tomb));
  const out = { ...R, ...L };

  out[MERGE_KEYS.tombstones] = tomb;

  // Рецепты: если с одной стороны книга ещё не сохранялась (null — только
  // стартовые рецепты), берём другую сторону целиком.
  if (L[MERGE_KEYS.recipes] || R[MERGE_KEYS.recipes]) {
    out[MERGE_KEYS.recipes] = !L[MERGE_KEYS.recipes] ? (R[MERGE_KEYS.recipes] || []).filter(x => !dead.has(x.id))
      : !R[MERGE_KEYS.recipes] ? L[MERGE_KEYS.recipes].filter(x => !dead.has(x.id))
      : mgMergeList(L[MERGE_KEYS.recipes], R[MERGE_KEYS.recipes], mgById, dead);
  }
  out[MERGE_KEYS.products] = mgMergeList(L[MERGE_KEYS.products], R[MERGE_KEYS.products], x => "product:" + x.name, dead);
  out[MERGE_KEYS.seeded] = mgUnion(L[MERGE_KEYS.seeded], R[MERGE_KEYS.seeded]);
  // Меню — общий план; одинаковые блюда не дублируем, локальные порции важнее.
  out[MERGE_KEYS.menu] = mgMergeList(L[MERGE_KEYS.menu], R[MERGE_KEYS.menu], x => "menu:" + x.recipeId, dead)
    .filter(x => !dead.has(x.recipeId));

  const lt = L[MERGE_KEYS.tinctures] || {};
  const rt = R[MERGE_KEYS.tinctures] || {};
  out[MERGE_KEYS.tinctures] = {
    ...rt, ...lt,
    recipes: mgMergeList(lt.recipes, rt.recipes, mgById, dead),
    bottles: mgMergeList(lt.bottles, rt.bottles, mgById, dead)
  };

  const lc = L[MERGE_KEYS.canning] || {};
  const rc = R[MERGE_KEYS.canning] || {};
  const ls = lc.settings || {};
  const rs = rc.settings || {};
  out[MERGE_KEYS.canning] = {
    ...rc, ...lc,
    batches: mgMergeList(lc.batches, rc.batches, mgById, dead),
    settings: { ...rs, ...ls, makerModes: mgMergeList(ls.makerModes, rs.makerModes, mgById, dead) }
  };

  const lp = L[MERGE_KEYS.profiles] || {};
  const rp = R[MERGE_KEYS.profiles] || {};
  const members = mgMergeList(lp.members, rp.members, mgById, dead);
  const favorites = {};
  const notes = {};
  members.forEach(m => {
    favorites[m.id] = mgUnion((rp.favorites || {})[m.id], (lp.favorites || {})[m.id]).filter(id => !dead.has(id));
    notes[m.id] = { ...((rp.notes || {})[m.id] || {}), ...((lp.notes || {})[m.id] || {}) };
  });
  out[MERGE_KEYS.profiles] = { ...rp, ...lp, members, favorites, notes };

  const lpl = L[MERGE_KEYS.planner] || {};
  const rpl = R[MERGE_KEYS.planner] || {};
  out[MERGE_KEYS.planner] = {
    ...rpl, ...lpl,
    checked: { ...(rpl.checked || {}), ...(lpl.checked || {}) },
    pantry: mgUnion(rpl.pantry, lpl.pantry),
    templates: mgMergeList(lpl.templates, rpl.templates, mgById, dead)
  };
  return out;
}
