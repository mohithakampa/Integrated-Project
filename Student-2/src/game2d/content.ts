import type { EnemyKind, EnemySpawn, ItemId, LevelDefinition, LevelId, Obstacle, WorldPickup, WorldProp } from './types'

const enemy = (id: string, kind: EnemyKind, x: number, dropsCore = false): EnemySpawn => ({ id, kind, x, dropsCore })
const pickup = (id: string, kind: WorldPickup['kind'], x: number, amount = 1): WorldPickup => ({ id, kind, x, y: 0, amount })
const prop = (id: string, kind: WorldProp['kind'], x: number, width: number, height: number, variant = 0): WorldProp => ({ id, kind, x, width, height, variant })
const obstacle = (id: string, kind: Obstacle['kind'], x: number, width: number, height: number): Obstacle => ({ id, kind, x, width, height })
const supplies = (level: LevelId, entries: Array<[ItemId, number, number?]>): WorldPickup[] => entries.map(([kind, x, amount], index) => pickup(`${level}-supply-${index + 1}`, kind, x, amount ?? 1))

function bloodZone(): LevelDefinition {
  const enemySpawns: EnemySpawn[] = Array.from({ length: 20 }, (_, i) => enemy(`l1-zombie-${String(i + 1).padStart(2, '0')}`, 'normal', 520 + i * 205))
  const props: WorldProp[] = []
  const obstacles: Obstacle[] = []
  for (let i = 0; i < 14; i += 1) {
    const x = 150 + i * 365
    props.push(prop(`l1-building-${i}`, 'building', x, 240 + (i % 3) * 42, 190 + (i % 4) * 28, i % 5))
    props.push(prop(`l1-light-${i}`, 'streetlight', x + 300, 26, 152, i % 2))
    if (i % 2 === 0) obstacles.push(obstacle(`l1-rubble-${i}`, 'rubble', x + 112, 68, 28 + (i % 3) * 9))
    if (i % 4 === 1) obstacles.push(obstacle(`l1-car-${i}`, 'car', x + 210, 138, 72))
    if (i % 3 === 0) props.push(prop(`l1-fire-${i}`, 'fire', x + 46, 28, 54, i % 3))
  }
  return {
    id: 1, name: 'BLOOD ZONE', subtitle: 'RUINED CITY STREET', mission: 'SURVIVE THE OUTBREAK', worldWidth: 5050,
    palette: { skyTop: '#111722', skyBottom: '#34202a', far: '#202732', mid: '#292b34', floor: '#25262b', floorLine: '#7a4546', accent: '#62e7f2', warning: '#ee5962', light: '#9bbfca', haze: '#7d474a' },
    enemySpawns, pickups: supplies(1, [['medkit', 275], ['pistol-ammo', 915, 12], ['food', 1280], ['water', 1785], ['scrap', 2370], ['medkit', 3100], ['pistol-ammo', 3650, 12], ['water', 4290]]),
    obstacles, props,
  }
}

function mall(): LevelDefinition {
  const kinds: EnemyKind[] = ['runner', 'normal', 'armored', 'brute', 'toxic', 'elite', 'runner', 'armored', 'toxic', 'elite', 'brute', 'elite']
  const enemySpawns = kinds.map((kind, i) => enemy(`l2-infected-${String(i + 1).padStart(2, '0')}`, kind, 500 + i * 340, [5, 7, 9, 11].includes(i)))
  const props: WorldProp[] = []
  const obstacles: Obstacle[] = []
  for (let i = 0; i < 13; i += 1) {
    const x = 120 + i * 390
    props.push(prop(`l2-store-${i}`, 'storefront', x, 300, 210, i % 4))
    props.push(prop(`l2-sign-${i}`, 'sign', x + 82, 108, 36, i % 5))
    if (i % 3 === 0) props.push(prop(`l2-escalator-${i}`, 'escalator', x + 205, 166, 122, i % 2))
    if (i % 2 === 1) obstacles.push(obstacle(`l2-shelf-${i}`, 'shelf', x + 138, 92, 58))
    if (i % 4 === 0) obstacles.push(obstacle(`l2-cart-${i}`, 'cart', x + 315, 64, 34))
  }
  return {
    id: 2, name: 'INFECTED SHOPPING MALL', subtitle: 'NORTHSTAR MALL — LOWER LEVEL', mission: 'MISSION: OPERATION CURE', worldWidth: 4940,
    palette: { skyTop: '#0b1720', skyBottom: '#152329', far: '#10222a', mid: '#172830', floor: '#263037', floorLine: '#6d8588', accent: '#73e8ee', warning: '#ffad59', light: '#b0eaf0', haze: '#476c70' },
    enemySpawns, pickups: supplies(2, [['medkit', 250], ['shotgun-ammo', 790, 8], ['food', 1180], ['water', 1570], ['scrap', 2030, 2], ['pistol-ammo', 2580, 12], ['medkit', 3140], ['shotgun-ammo', 3690, 8], ['lab-materials', 4200, 2]]),
    obstacles, props, stationX: 4550,
  }
}

function hospital(): LevelDefinition {
  const kinds: EnemyKind[] = ['runner', 'armored', 'toxic', 'brute', 'elite', 'runner', 'toxic', 'armored', 'brute', 'elite']
  const enemySpawns = kinds.map((kind, i) => enemy(`l3-infected-${String(i + 1).padStart(2, '0')}`, kind, 570 + i * 390, [2, 4, 7, 9].includes(i)))
  const props: WorldProp[] = []
  const obstacles: Obstacle[] = []
  for (let i = 0; i < 12; i += 1) {
    const x = 100 + i * 420
    props.push(prop(`l3-door-${i}`, 'door', x, 108, 196, i % 3))
    props.push(prop(`l3-monitor-${i}`, 'monitor', x + 150, 46, 74, i % 4))
    if (i % 2 === 0) {
      props.push(prop(`l3-bed-${i}`, 'bed', x + 230, 154, 64, i % 2))
      obstacles.push(obstacle(`l3-bed-collision-${i}`, 'bed', x + 255, 112, 48))
    }
    if (i % 4 === 0) obstacles.push(obstacle(`l3-quarantine-${i}`, 'barrier', x + 350, 58, 92))
  }
  const pickups = supplies(3, [
    ['medical-supplies', 330, 1], ['bandages', 705, 2], ['research-record', 1040], ['medkit', 1370],
    ['medical-supplies', 1690], ['research-record', 2070], ['lab-materials', 2420, 2], ['research-record', 2810],
    ['medical-supplies', 3210], ['pistol-ammo', 3610, 12], ['research-record', 3950], ['bandages', 4310, 2],
  ])
  return {
    id: 3, name: 'INFECTED HOSPITAL', subtitle: 'ST. AGNES MEDICAL COMPLEX', mission: 'THE SOURCE OF THE FEVER', worldWidth: 5050,
    palette: { skyTop: '#091c22', skyBottom: '#163039', far: '#10262d', mid: '#1b333a', floor: '#263238', floorLine: '#6c9a9d', accent: '#79e8e4', warning: '#fa5865', light: '#b0e2e4', haze: '#456b70' },
    enemySpawns, pickups, obstacles, props, terminalXs: [4480],
  }
}

function lastDawn(): LevelDefinition {
  const kinds: EnemyKind[] = ['evolved', 'armored', 'toxic', 'brute', 'elite', 'runner', 'evolved', 'elite']
  const enemySpawns = kinds.map((kind, i) => enemy(`l4-evolved-${String(i + 1).padStart(2, '0')}`, kind, 500 + i * 350, [0, 2, 4, 6, 7].includes(i)))
  const props: WorldProp[] = []
  const obstacles: Obstacle[] = []
  for (let i = 0; i < 12; i += 1) {
    const x = 80 + i * 275
    props.push(prop(`l4-pod-${i}`, 'pod', x, 116, 208, i % 4))
    props.push(prop(`l4-pipe-${i}`, 'pipe', x + 138, 110, 32, i % 3))
    if (i % 3 === 1) {
      props.push(prop(`l4-generator-${i}`, 'generator', x + 198, 115, 112, i % 4))
      obstacles.push(obstacle(`l4-machine-${i}`, 'machine', x + 218, 76, 88))
    }
    if (i % 4 === 3) obstacles.push(obstacle(`l4-crate-${i}`, 'crate', x + 120, 56, 44))
  }
  return {
    id: 4, name: 'THE LAST DAWN', subtitle: 'ORIGIN SITE — SUBLEVEL ZERO', mission: 'NEUTRALIZE THE INFECTION', worldWidth: 3620,
    palette: { skyTop: '#100f19', skyBottom: '#201722', far: '#191922', mid: '#24252d', floor: '#292a32', floorLine: '#8b4452', accent: '#78eaf4', warning: '#fa3d53', light: '#adf4f8', haze: '#573944' },
    enemySpawns, pickups: supplies(4, [['medkit', 270], ['rifle-ammo', 820, 24], ['energy-components', 1220, 2], ['medical-supplies', 1640], ['pistol-ammo', 2110, 12], ['rifle-ammo', 2600, 24], ['antitoxin', 2910]]),
    obstacles, props, terminalXs: [900, 1540], bossX: 2550, neutralizerX: 3300,
  }
}

export const LEVELS: Record<LevelId, LevelDefinition> = {
  1: bloodZone(),
  2: mall(),
  3: hospital(),
  4: lastDawn(),
}

export const ITEM_LABELS: Record<ItemId, string> = {
  medkit: 'Medkit', 'pistol-ammo': 'Pistol Ammunition', 'shotgun-ammo': 'Shotgun Shells', 'rifle-ammo': 'Rifle Ammunition',
  food: 'Food Rations', water: 'Water', scrap: 'Crafting Materials', 'medical-supplies': 'Medical Supplies',
  bandages: 'Bandages', 'research-record': 'Research Record', 'lab-materials': 'Laboratory Materials',
  'energy-components': 'Energy Components', keycard: 'Security Keycard', 'cure-sample': 'Cure Sample', antitoxin: 'Antitoxin',
}

export const ITEM_DESCRIPTIONS: Record<ItemId, string> = {
  medkit: 'Restores 35 HP. Cannot exceed maximum health.',
  'pistol-ammo': 'Optional surplus. Firearms have unlimited ammunition; this supply is not needed to fire.',
  'shotgun-ammo': 'Optional surplus. Firearms have unlimited ammunition; this supply is not needed to fire.',
  'rifle-ammo': 'Optional surplus. Firearms have unlimited ammunition; this supply is not needed to fire.',
  food: 'A sealed ration. Use to restore 8 HP.', water: 'Clean water. Use to restore 8 HP.',
  scrap: 'Useful components held for future field upgrades.', 'medical-supplies': 'Sterile medical pack for hospital research.',
  bandages: 'A pressure dressing. Use to restore 12 HP.', 'research-record': 'Recovered evidence about the infection.',
  'lab-materials': 'Research material for laboratory analysis.', 'energy-components': 'Power components from the origin-site grid.',
  keycard: 'A recovered access key for secure doors.', 'cure-sample': 'The first stable cure sample from the mall lab.',
  antitoxin: 'A measured dose that prevents the next toxic hit.',
}

export const ITEM_STACK_LIMIT: Record<ItemId, number> = {
  medkit: 5, 'pistol-ammo': 96, 'shotgun-ammo': 48, 'rifle-ammo': 180, food: 5, water: 5,
  scrap: 10, 'medical-supplies': 5, bandages: 5, 'research-record': 5, 'lab-materials': 10,
  'energy-components': 10, keycard: 5, 'cure-sample': 1, antitoxin: 3,
}
