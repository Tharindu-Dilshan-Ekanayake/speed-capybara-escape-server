/**
 * +1 Speed Capybara Escape - shared game data.
 *
 * CANONICAL COPY. The server keeps a byte-identical copy in
 * speed-capybara-escape-server/src/shared/ (run `npm run sync-shared` there after editing).
 * Pure data + pure functions only: no DOM, no three.js, no Node APIs.
 */

export const GAME_ID = '1-speed-capybara-escape'
export const GAME_NAME = '+1 Speed Capybara Escape'
export const ROOM_NAME = 'lobby'
export const MAX_PLAYERS_PER_LOBBY = 8

/** Temporary stage-jump controls; set false before launch to hide developer tools. */
export const DEV_TOOLS = false

/* ------------------------------------------------------------------ */
/* Levels & speed                                                      */
/* ------------------------------------------------------------------ */

/** Step XP needed to go from `level` to `level + 1`. */
export const xpForLevel = (level) => Math.floor(110 * Math.pow(1.19, level))

/** The "Speed: 24" number on the HUD. Level 1 = 16 (Roblox default walk speed). */
export const speedStat = (level) => 14 + 2 * level

/**
 * World velocity (m/s) for a speed stat. Linear early on so every level is felt, then
 * softened so very high levels stay controllable on the obstacle courses.
 */
export function velocityFor(stat) {
  if (stat <= 40) return stat * 0.3
  if (stat <= 140) return 12 + 0.12 * (stat - 40)
  return Math.min(30, 24 + 4 * Math.log(stat / 140))
}

/** Distance (m) walked on the ground that counts as one step (+N step XP). */
export const STEP_DISTANCE = 1.5
/** Treadmill steps per second at 1X. */
export const TREADMILL_STEPS = 4

/** Level needed for the next rebirth. */
export const rebirthLevel = (rebirths) => 20 + 10 * rebirths
/** Rebirth multipliers: step XP x(1+r), wins x(1 + 0.5r). */
export const stepMultiplier = (rebirths) => 1 + rebirths
export const winMultiplier = (rebirths) => 1 + 0.5 * rebirths

/** Party boost: +10% per other player in the server, up to +70%. */
export const friendBoost = (others) => Math.min(0.7, Math.max(0, others) * 0.1)

/* ------------------------------------------------------------------ */
/* Capybaras                                                           */
/* ------------------------------------------------------------------ */

/**
 * The capybara you ride. Every one is bought with Wins (no premium currency anywhere) and
 * kept forever (rebirth does not take them). `fur` / `belly` / `nose` colour the model,
 * `fx` adds accessories and particles: see Capybara.jsx.
 */
export const CAPYS = [
  { id: 'classic', name: 'Classic Capy', perStep: 1, cost: 0, reb: 0, fur: '#b9773f', belly: '#d9a066', nose: '#4a2a18', fx: {} },
  { id: 'choco', name: 'Choco Capy', perStep: 2, cost: 5, reb: 0, fur: '#6b3f24', belly: '#8f5a36', nose: '#2a160c', fx: {} },
  { id: 'lime', name: 'Lime Capy', perStep: 4, cost: 40, reb: 0, fur: '#5fd13a', belly: '#9ef06a', nose: '#1f5a12', fx: { glow: '#7dff3a' } },
  { id: 'gent', name: 'Gentleman Capy', perStep: 8, cost: 250, reb: 0, fur: '#a8683a', belly: '#c98d58', nose: '#3a2010', fx: { hat: 'top', monocle: true } },
  { id: 'yuzu', name: 'Yuzu Capy', perStep: 15, cost: 1500, reb: 0, fur: '#c88a4a', belly: '#e8b47a', nose: '#4a2a18', fx: { yuzu: true, particles: 'bubbles', pc: '#ffd24a' } },
  { id: 'ghost', name: 'Ghost Capy', perStep: 30, cost: 8000, reb: 0, fur: '#eef7ff', belly: '#ffffff', nose: '#9fb8d8', fx: { glow: '#bfe6ff', ghost: true, particles: 'sparkle', pc: '#ffffff' } },
  { id: 'lava', name: 'Lava Capy', perStep: 60, cost: 40000, reb: 0, fur: '#e8401a', belly: '#ff8a3a', nose: '#3a0a04', fx: { glow: '#ff5a00', cracks: '#ffb000', particles: 'fire', pc: '#ffae00' } },
  { id: 'frost', name: 'Frost Capy', perStep: 110, cost: 120000, reb: 0, fur: '#7fe6ff', belly: '#dffaff', nose: '#2a6a8a', fx: { glow: '#5ef0ff', particles: 'snow', pc: '#e8fdff', shades: true } },
  { id: 'love', name: 'Love Capy', perStep: 200, cost: 300000, reb: 0, fur: '#ff8fd0', belly: '#ffd0ec', nose: '#8a1a5a', fx: { glow: '#ff6fd8', particles: 'hearts', pc: '#ff3fa8', flowers: true } },
  { id: 'storm', name: 'Storm Capy', perStep: 350, cost: 700000, reb: 0, fur: '#2a3050', belly: '#4a5478', nose: '#0e1020', fx: { glow: '#8fb4ff', particles: 'bolts', pc: '#cfe2ff', shades: true } },
  { id: 'lucky', name: 'Lucky Capy', perStep: 600, cost: -1, reb: 0, fur: '#3fd17a', belly: '#b8ffcf', nose: '#0f4a24', fx: { glow: '#5dff9a', particles: 'stars', pc: '#ffe14a', clover: true }, wheel: true },
  { id: 'galaxy', name: 'Galaxy Capy', perStep: 1000, cost: 1800000, reb: 1, fur: '#3b1d8f', belly: '#7a4dff', nose: '#12063a', fx: { glow: '#9a6bff', particles: 'stars', pc: '#e6d8ff', galaxy: true } },
  { id: 'angel', name: 'Angel Capy', perStep: 2000, cost: 4000000, reb: 2, fur: '#fffdf2', belly: '#ffffff', nose: '#c9a46a', fx: { glow: '#fff1a8', halo: '#ffd84a', wings: '#ffffff', particles: 'sparkle', pc: '#fff3b0' } },
  { id: 'dragon', name: 'Dragon Capy', perStep: 4000, cost: 8000000, reb: 3, fur: '#c8102e', belly: '#ff6a3a', nose: '#3a0006', fx: { glow: '#ff3c00', horns: '#ffcf4a', wings: '#7a0a14', particles: 'fire', pc: '#ff7a1a' } },
  { id: 'golden', name: 'Golden King Capy', perStep: 8000, cost: 15000000, reb: 5, fur: '#ffc81a', belly: '#fff0a0', nose: '#8a5a00', fx: { glow: '#ffe066', gold: true, hat: 'crown', particles: 'sparkle', pc: '#fff6b0' } },
]
export const capyById = (id) => CAPYS.find((d) => d.id === id) || CAPYS[0]

/* ------------------------------------------------------------------ */
/* Treadmills                                                          */
/* ------------------------------------------------------------------ */

/** `fx`: how the treadmill shows off (see Lobby.jsx) - plain, leaf, gold, ice, fire, bolt. */
export const TREADMILLS = [
  { id: 't1', mult: 1, cost: 0, reb: 0, color: '#8a93a8', glow: '#ffffff', fx: 'plain' },
  { id: 't2', mult: 2, cost: 60, reb: 0, color: '#2fbf4a', glow: '#7dff6a', fx: 'leaf' },
  { id: 't3', mult: 4, cost: 1500, reb: 0, color: '#ffb81a', glow: '#fff06a', fx: 'gold' },
  { id: 't4', mult: 8, cost: 60000, reb: 1, color: '#e8f4ff', glow: '#9fe8ff', fx: 'ice' },
  { id: 't5', mult: 16, cost: 1000000, reb: 2, color: '#e8202a', glow: '#ff7a1a', fx: 'fire' },
  { id: 't6', mult: 32, cost: 6000000, reb: 4, color: '#1f8bff', glow: '#5ef0ff', fx: 'bolt' },
]
export const treadById = (id) => TREADMILLS.find((t) => t.id === id) || null

/* ------------------------------------------------------------------ */
/* Stages                                                              */
/* ------------------------------------------------------------------ */

/** One jungle world, twenty stages. */
export const STAGE_COUNT = 20

/**
 * Wins for a stage's end pad (before multipliers). Index 0 unused. Claiming a pad ends the
 * run and sends you back to the lobby, so each value is the reward for the whole run up to
 * that stage: cash out early for a little, or push on (harder, needs more Speed) for a lot.
 */
export const STAGE_WINS = [0, 1, 3, 6, 12, 22, 40, 70, 120, 200, 320, 500, 800, 1250, 2000, 3200, 5000, 7500, 11000, 16000, 25000]

/**
 * Level needed to pass each stage's gate (a force field blocks you below it). Rebirth
 * resets your level, so every rebirth means climbing back up - with bigger multipliers.
 */
export const STAGE_LEVEL = [0, 1, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37]
export const stageLevel = (stage) => STAGE_LEVEL[stage] || 1

export const STAGE_NAMES = [
  '',
  'Capy Bridges',
  'Red Leaf Hop',
  'River Jumps',
  'Giant Ball Alley',
  'Sky Ramp',
  'Yuzu Bounce',
  'Log Spin Lagoon',
  'Hot Spring Hop',
  'Wobbly Bridges',
  'Coconut Canyon',
  'Watermelon Swing',
  'Lava Floodway',
  'Lava Leap',
  'Cloud Hop',
  'Tsunami Terraces',
  'Coconut Rain',
  'Fruit Factory',
  'Laser Temple',
  'Spinning Lava Wheels',
  'Great Capybara Escape',
]

/** The best single pad you have unlocked - prices for boosts / packs / gifts scale with it. */
export function runWins(maxStage) {
  return STAGE_WINS[Math.min(STAGE_COUNT, Math.max(1, maxStage))]
}

/** Tutorial steps for brand-new players (profile.tut); TUT_DONE = finished / skipped. */
export const TUT_DONE = 99

/* ------------------------------------------------------------------ */
/* Races                                                               */
/* ------------------------------------------------------------------ */

/** Race cycle (ms): wait, countdown, race. Pads pay x2 for racers; first to finish Stage 1 wins. */
export const RACE_WAIT_MS = 150_000
export const RACE_COUNTDOWN_MS = 10_000
export const RACE_LENGTH_MS = 60_000
export const RACE_CYCLE_MS = RACE_WAIT_MS + RACE_COUNTDOWN_MS + RACE_LENGTH_MS

/* ------------------------------------------------------------------ */
/* Lucky wheel, boosts, packs, gifts                                   */
/* ------------------------------------------------------------------ */

export const SPIN_EVERY_MS = 10 * 60 * 1000

/** Wheel slices, clockwise from the top. `w` = weight (sums to 100). */
export const WHEEL = [
  { id: 'w_small', label: 'Wins', kind: 'wins', f: 0.25, w: 28, color: '#ffd21a' },
  { id: 'x2wins', label: '2x Wins', kind: 'boost', boost: 'wins', min: 5, w: 12, color: '#34d6ff' },
  { id: 'w_mid', label: 'Wins+', kind: 'wins', f: 0.75, w: 20, color: '#7dff3a' },
  { id: 'spins', label: '+3 Spins', kind: 'spins', n: 3, w: 6, color: '#ff8a1a' },
  { id: 'w_big', label: 'BIG Wins', kind: 'wins', f: 2, w: 10, color: '#ff4fd8' },
  { id: 'x2speed', label: '2x Speed', kind: 'boost', boost: 'speed', min: 5, w: 12, color: '#3dffc0' },
  { id: 'levels', label: '+3 Levels', kind: 'levels', n: 3, w: 11, color: '#b46bff' },
  { id: 'lucky', label: '???', kind: 'capy', capy: 'lucky', w: 1, color: '#ff3a3a' },
]

export const BOOST_MINUTES = 10
export const BOOST_MAX_MINUTES = 60
export const boostPrice = (maxStage) => Math.max(10, Math.round(runWins(maxStage) * 0.6))

/** Bottom-row packs, paid with wins. Step-XP packs scale with your level. */
export const PACKS = [
  { id: 'xp1', kind: 'xp', levels: 1, f: 0.15, min: 3 },
  { id: 'spins10', kind: 'spins', n: 10, f: 0.8, min: 15 },
  { id: 'xp5', kind: 'xp', levels: 5, f: 0.5, min: 10 },
  { id: 'xp15', kind: 'xp', levels: 15, f: 1.2, min: 25 },
]
export const packPrice = (pack, maxStage) => Math.max(pack.min, Math.round(runWins(maxStage) * pack.f))

/** XP needed to climb `n` levels from `level` (the pack/wheel reward amount). */
export function xpForLevels(level, n) {
  let s = 0
  for (let i = 0; i < n; i += 1) s += xpForLevel(level + i)
  return s
}

/** "Free!" playtime gifts, by minutes played this session. */
export const GIFTS = [
  { min: 1, kind: 'wins', f: 0.3, label: 'Wins' },
  { min: 3, kind: 'spins', n: 1, label: '+1 Spin' },
  { min: 5, kind: 'levels', n: 2, label: '+2 Levels' },
  { min: 8, kind: 'wins', f: 0.8, label: 'Wins' },
  { min: 12, kind: 'boost', boost: 'speed', minutes: 5, label: '2x Speed' },
  { min: 16, kind: 'spins', n: 2, label: '+2 Spins' },
  { min: 20, kind: 'wins', f: 1.5, label: 'Wins' },
  { min: 25, kind: 'boost', boost: 'wins', minutes: 5, label: '2x Wins' },
  { min: 30, kind: 'wins', f: 3, label: 'MEGA Wins' },
]
export const giftWins = (f, maxStage, rebirths) => Math.max(1, Math.round(runWins(maxStage) * f * winMultiplier(rebirths)))

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc']
export function formatNum(n) {
  n = Number(n) || 0
  const neg = n < 0
  n = Math.abs(n)
  if (n < 1000) return (neg ? '-' : '') + String(Math.floor(n))
  let i = 0
  while (n >= 1000 && i < SUFFIX.length - 1) {
    n /= 1000
    i += 1
  }
  const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)
  return (neg ? '-' : '') + s.replace(/\.0+$|(\.\d*?)0+$/, '$1') + SUFFIX[i]
}

export function formatTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
