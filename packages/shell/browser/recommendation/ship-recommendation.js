export const SHIP_RECOMMENDATION_SOURCE = {
  url: 'https://bbs.nga.cn/read.php?tid=29107384',
  updatedAt: '2026-06-09',
}

const profile = (id, family, rating, targetPrefixes, features = []) => ({
  id,
  familyNames: Array.isArray(family) ? family : [family],
  rating,
  targetPrefixes,
  features,
})

// `family` and `targetPrefixes` are the canonical Japanese values from KC3 master data. They are
// deliberately not localized display labels: KC3's localized ship name is returned separately.
export const SHIP_RECOMMENDATION_CATALOG = [
  profile('nagato', '長門', 10, ['長門改二'], ['specialAttack', 'antiInstallation']),
  profile('ise', '伊勢', 10, ['伊勢改二'], ['fiveSlots', 'carrierFighter']),
  profile('mogami', '最上', 10, ['最上改二', '最上改二特'], ['openingTorpedo', 'antiInstallation']),
  profile('yahagi', '矢矧', 10, ['矢矧改二'], ['fourSlots', 'seaplaneFighter', 'openingTorpedo']),

  profile('yamato', '大和', 9, ['大和改二', '大和改二重'], ['fiveSlots', 'specialAttack']),
  profile('kaga', '加賀', 9, ['加賀改二', '加賀改二戊', '加賀改二護'], ['fiveSlots']),
  profile('shoukaku', '翔鶴', 9, ['翔鶴改二甲'], ['armoredCarrier']),
  profile('zuikaku', '瑞鶴', 9, ['瑞鶴改二甲'], ['armoredCarrier']),
  profile(
    'yuubari',
    '夕張',
    9,
    ['夕張改二', '夕張改二特', '夕張改二丁'],
    ['pseudoFiveSlots', 'openingTorpedo'],
  ),
  profile('naganami', '長波', 9, ['長波改二'], ['pseudoFourSlots', 'highModifier']),

  profile('musashi', '武蔵', 8, ['武蔵改二'], ['highFirepower', 'specialAttack']),
  profile('akagi', '赤城', 8, ['赤城改二', '赤城改二戊'], ['fiveSlots']),
  profile(
    'saratoga',
    'Saratoga',
    8,
    ['Saratoga Mk.II'],
    ['nightCarrier', 'armoredCarrier', 'highModifier'],
  ),
  profile('hatsuzuki', '初月', 8, ['初月改二'], ['fourSlots', 'dedicatedAaci']),
  profile('miyuki', '深雪', 8, ['深雪改二'], ['gunSpecialist']),

  profile('hyuga', '日向', 7, ['日向改二'], ['fiveSlots', 'carrierFighter', 'rotaryAsw']),
  profile('ryuuhou', ['龍鳳', '大鯨'], 7, ['龍鳳改二', '龍鳳改二戊'], ['cve', 'nightCarrier']),
  profile('choukai', '鳥海', 7, ['鳥海改二']),
  profile('yura', '由良', 7, ['由良改二'], ['seaplaneFighter', 'openingTorpedo']),
  profile('amatsukaze', '天津風', 7, ['天津風改二'], ['highArmor', 'fastPlus']),
  profile('shigure', '時雨', 7, ['時雨改三'], ['fourSlots', 'highLuck', 'highModifier']),
  profile('fubuki', '吹雪', 7, ['吹雪改三', '吹雪改三護'], ['fourSlots', 'highLuck', 'versatile']),

  profile('mutsu', '陸奥', 6, ['陸奥改二'], ['specialAttack']),
  profile('mikuma', '三隈', 6, ['三隈改二', '三隈改二特'], ['aviationCruiser', 'seaplaneFighter']),
  profile(
    'fletcher',
    'Fletcher',
    6,
    ['Fletcher改 Mod.2', 'Fletcher Mk.II'],
    ['openingAsw', 'dedicatedAaci', 'highModifier'],
  ),
  profile('yukikaze', '雪風', 6, ['雪風改二'], ['highLuck', 'highModifier']),
  profile('akizuki', '秋月', 6, ['秋月改二'], ['fourSlots', 'dedicatedAaci']),
  profile('fujinami', '藤波', 6, ['藤波改二']),

  profile('kongo', '金剛', 5, ['金剛改二丙'], ['specialAttack', 'efficientSupport']),
  profile(
    'haruna',
    '榛名',
    5,
    ['榛名改二乙', '榛名改二丙'],
    ['highLuck', 'specialAttack', 'efficientSupport', 'highModifier'],
  ),
  profile('hiryuu', '飛龍', 5, ['飛龍改三'], ['fiveSlots', 'supportCarrier']),
  profile('noshiro', '能代', 5, ['能代改二'], ['highFirepower']),
  profile('tamanami', '玉波', 5, ['玉波改二']),
  profile(
    'samuel',
    'Samuel B.Roberts',
    5,
    ['Samuel B.Roberts Mk.II'],
    ['openingAsw', 'cve', 'aswSupport'],
  ),

  profile('kirishima', '霧島', 4, ['霧島改二丙'], ['specialAttack', 'efficientSupport']),
  profile('richelieu', 'Richelieu', 4, ['Richelieu Deux'], ['fastYamatoPartner']),
  profile('houshou', '鳳翔', 4, ['鳳翔改二', '鳳翔改二戦']),
  profile('suzuya', '鈴谷', 4, ['鈴谷改二', '鈴谷航改二'], ['highFirepower', 'cvl']),
  profile('abukuma', '阿武隈', 4, ['阿武隈改二'], ['openingTorpedo']),
  profile('tama', '多摩', 4, ['多摩改二'], ['seaplaneFighter']),
  profile('amagiri', '天霧', 4, ['天霧改二', '天霧改二丁'], ['antiPt', 'antiInstallation']),
  profile('kiyoshimo', '清霜', 4, ['清霜改二', '清霜改二丁'], ['antiInstallation']),
  profile('hayami', '早波', 4, ['早波改二']),

  profile('hiei', '比叡', 3, ['比叡改二丙'], ['specialAttack', 'efficientSupport']),
  profile('bismarck', 'Bismarck', 3, ['Bismarck drei'], ['fastYamatoPartner']),
  profile('unryuu', '雲龍', 3, ['雲龍改']),
  profile('gambierBay', 'Gambier Bay', 3, ['Gambier Bay Mk.II'], ['cve']),
  profile('kumano', '熊野', 3, ['熊野改二', '熊野航改二'], ['highFirepower', 'cvl']),
  profile('zara', 'Zara', 3, ['Zara due'], ['seaplaneFighter']),
  profile('hayashimo', '早霜', 3, ['早霜改二']),
  profile('yuugumo', '夕雲', 3, ['夕雲改二']),
  profile('makigumo', '巻雲', 3, ['巻雲改二']),
  profile('hamanami', '浜波', 3, ['浜波改二']),
  profile('yamakaze', '山風', 3, ['山風改二', '山風改二丁'], ['antiInstallation']),
  profile('asashimo', '朝霜', 3, ['朝霜改二', '朝霜改二補'], ['pseudoFourSlots', 'highModifier']),
  profile('arashio', '荒潮', 3, ['荒潮改二'], ['antiInstallation']),
  profile('ooshio', '大潮', 3, ['大潮改二'], ['antiInstallation']),
  profile('kagerou', '陽炎', 3, ['陽炎改二']),
  profile('shiranui', '不知火', 3, ['不知火改二']),
  profile('kuroshio', '黒潮', 3, ['黒潮改二']),
  profile('oyashio', '親潮', 3, ['親潮改二']),

  profile('italia', ['Italia', 'Littorio'], 2, ['Italia']),
  profile('roma', 'Roma', 2, ['Roma改']),
  profile('kuma', '球磨', 2, ['球磨改二', '球磨改二丁']),
  profile('gotland', 'Gotland', 2, ['Gotland andra']),
  profile('hayashio', '早潮', 2, ['早潮改二']),
  profile('takanami', '高波', 2, ['高波改二']),
  profile('kazagumo', '風雲', 2, ['風雲改二']),
  profile('okinami', '沖波', 2, ['沖波改二']),
  profile('arare', '霰', 2, ['霰改二']),
  profile('uranami', '浦波', 2, ['浦波改二']),
  profile('isonami', '磯波', 2, ['磯波改二']),
  profile('suzunami', '涼波', 2, ['涼波改二', '涼波改二補']),
  profile('inagi', '稲木', 2, ['稲木改二']),

  profile('fuso', '扶桑', 1, ['扶桑改二']),
  profile('yamashiro', '山城', 1, ['山城改二']),
  profile('amagi', '天城', 1, ['天城改']),
  profile('katsuragi', '葛城', 1, ['葛城改']),
  profile('taiyou', ['大鷹', '春日丸'], 1, ['大鷹改二']),
  profile('shinyo', '神鷹', 1, ['神鷹改二']),
  profile('unyou', ['雲鷹', '八幡丸'], 1, ['雲鷹改二']),
  profile('tone', '利根', 1, ['利根改二']),
  profile('chikuma', '筑摩', 1, ['筑摩改二']),
  profile('kinu', '鬼怒', 1, ['鬼怒改二']),
  profile('akigumo', '秋雲', 1, ['秋雲改二']),
]

const canonicalNameFor = (ship) => String(ship?.canonicalName || '').trim()

const belongsToFamily = (ship, familyNames) => {
  const canonicalName = canonicalNameFor(ship)
  return familyNames.some((family) => canonicalName === family || canonicalName.startsWith(family))
}

const hasGuideForm = (ship, targetPrefixes) => {
  const canonicalName = canonicalNameFor(ship)
  return targetPrefixes.some((prefix) => canonicalName.startsWith(prefix))
}

const comparableShip = (ship) => ({
  id: Number(ship.id),
  masterId: Number(ship.masterId),
  name: String(ship.name || ship.canonicalName || ''),
  level: Number(ship.level) || 0,
  locked: Boolean(ship.locked),
})

export const rankOwnedShipRecommendations = (ships) =>
  SHIP_RECOMMENDATION_CATALOG.flatMap((profile) => {
    const owned = ships.filter((ship) => belongsToFamily(ship, profile.familyNames))
    if (owned.length === 0) return []
    // A family already at one of the guide's remodel targets no longer needs a training card.
    // This also prevents a duplicate base-form copy from resurfacing after another copy is done.
    if (owned.some((ship) => hasGuideForm(ship, profile.targetPrefixes))) return []
    const orderedOwned = [...owned].sort(
      (left, right) => Number(right.level || 0) - Number(left.level || 0),
    )
    return [
      {
        id: profile.id,
        rating: profile.rating,
        features: profile.features,
        heldCount: owned.length,
        ship: comparableShip(orderedOwned[0]),
      },
    ]
  }).sort(
    (left, right) =>
      right.rating - left.rating ||
      right.ship.level - left.ship.level ||
      left.id.localeCompare(right.id),
  )

export const summarizeShipRecommendations = (recommendations, ships = []) => {
  const guideFormReachedCount = SHIP_RECOMMENDATION_CATALOG.filter((profile) =>
    ships.some(
      (ship) =>
        belongsToFamily(ship, profile.familyNames) && hasGuideForm(ship, profile.targetPrefixes),
    ),
  ).length
  return {
    matchedFamilyCount: recommendations.length + guideFormReachedCount,
    guideFormReachedCount,
    trainingCandidateCount: recommendations.length,
  }
}
