/**
 * World layout: one jungle lobby and 20 obstacle stages, generated deterministically.
 *
 * CANONICAL COPY (the server keeps an identical copy for pad / stage validation).
 * Pure data: the client turns it into meshes + collision, the server only reads
 * spawns, pads, treadmills and stage regions.
 *
 * Coordinates: metres, y up. The course runs from the lobby towards -z. Inside a stage
 * the builders use (x = lateral offset from the course centre, u = forward distance from
 * the stage entrance) and convert to world space.
 */

import { CAPYS, STAGE_COUNT, STAGE_NAMES, TREADMILLS, stageLevel } from './gameData.js'

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

export const C = {
  grass: '#3fcf2c',
  grassDark: '#2fae22',
  dirt: '#a8622e',
  dirtDark: '#8a4f24',
  stone: '#7d8499',
  stoneDark: '#565c72',
  stoneLight: '#a4aabd',
  brick: '#c6c9d6',
  white: '#f3f6ff',
  water: '#2fe2ff',
  lava: '#ff5a14',
  neonYellow: '#fff01a',
  neonGreen: '#2dff8a',
  neonCyan: '#22f2ff',
  neonPink: '#ff3df0',
  wood: '#8a5a33',
  woodLight: '#b07a46',
  cloud: '#f2f7ff',
  gold: '#ffc81a',
  goldDark: '#c99a10',
  purple: '#3a2d63',
  metal: '#5c6478',
  hazard: '#ffd01a',
  hazardBlack: '#24232c',
  basalt: '#2a2328',
  sand: '#e9c27a',
  stem: '#fff3df',
  salmon: '#f2a088',
  salmonDark: '#dc8a72',
  jungleBrick: '#7c78e6',
  jungleBrickDark: '#5c57c4',
  moss: '#2fbf5a',
  mossDark: '#23994a',
  swamp: '#5fbf4a',
  mud: '#7a4a28',
  tileBlue: '#8fd0ff',
  hay: '#f2c94a',
  citrus: '#ff9a1a',
}

/** z of the wall that separates the lobby from the Stage 1 entrance. */
export const COURSE_Z = -30
/** Lobby footprint (x in [-LOBBY_HALF, LOBBY_HALF], z in [COURSE_Z, LOBBY_MAX_Z]). */
export const LOBBY_HALF = 40
export const LOBBY_MAX_Z = 36
/**
 * Every stage is built in a narrower "builder" frame and stretched sideways by this
 * factor, so courses, platforms and bridges are all wider than their numbers say.
 */
export const STAGE_LAT = 1.25

/* ------------------------------------------------------------------ */
/* Seeded RNG                                                          */
/* ------------------------------------------------------------------ */

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------------ */
/* Themes                                                              */
/* ------------------------------------------------------------------ */

/** Jungle cliffs: purple-blue brick rock with mossy tops, like the lobby walls. */
const JUNGLE = { cliff: '#7a74d8', cliffShade: '#5f58b8', cap: '#2fbf5a', canopy: ['#2fbf5a', '#46d14f', '#1f9a4a'], palms: true }

const THEMES = {
  meadow: { ...JUNGLE, sky: 'day' },
  swamp: { ...JUNGLE, sky: 'day', canopy: ['#1f9a4a', '#2f8a3a', '#46b14f'] },
  river: { ...JUNGLE, sky: 'day' },
  alley: { ...JUNGLE, sky: 'day' },
  ramp: { sky: 'high', cliff: '#ffffff', cliffShade: '#dbe9ff', cap: C.cloud, canopy: ['#ffd6f6', '#bfffc7'] },
  canyon: { sky: 'day', cliff: '#a8703f', cliffShade: '#8c5a31', cap: C.grass, canopy: ['#3fb84a', '#5bcf4a', '#2f9e3e'], palms: true },
  spa: { ...JUNGLE, sky: 'sunset', canopy: ['#ff9ad5', '#ffd6f0', '#46d14f'] },
  lava: { sky: 'ember', cliff: '#7c2a1e', cliffShade: '#5e1f17', cap: '#3a2320', canopy: ['#ff7a1a', '#ffb000'] },
  sky: { sky: 'high', cliff: '#ffffff', cliffShade: '#dbe9ff', cap: C.cloud, canopy: ['#ffd6f6', '#bfffc7'] },
  factory: { sky: 'sunset', cliff: '#c85a7a', cliffShade: '#a8476a', cap: '#ffb04a', canopy: ['#ffd84a', '#ff8fe0'] },
  temple: { sky: 'dusk', cliff: '#3b3550', cliffShade: '#2a2540', cap: '#4b4566', canopy: ['#ff3a6a'] },
  lobby: { ...JUNGLE, sky: 'day' },
}

/* ------------------------------------------------------------------ */
/* Stage builder                                                       */
/* ------------------------------------------------------------------ */

function createStage(n, cx, z0, len, opt = {}) {
  // `half` is in builder units; S.half is the real (world) half-width.
  const half = opt.half ?? 8
  const LAT = STAGE_LAT
  const S = {
    n,
    world: 1,
    cx,
    z0,
    len,
    z1: z0 - len,
    half: half * LAT,
    themeId: opt.theme || 'meadow',
    theme: THEMES[opt.theme || 'meadow'],
    boxes: [],
    dyn: [],
    cyls: [],
    signs: [],
    rocks: [],
    trees: [],
    props: [],
    planes: [],
    killY: opt.killY ?? -6,
    wave: null,
    rise: null,
    pad: null,
    spawn: null,
    indoor: !!opt.indoor,
  }
  const X = (x) => cx + x * LAT
  const Z = (u) => z0 - u
  const r = rng(n * 7919 + 13)
  let dynId = 0

  const a = {
    S,
    X,
    Z,
    r,
    /** Builder-frame half width, and the sideways stretch (for world-space sizes). */
    half,
    LAT,
    /** Block by lateral centre x, width w, top y, height h, forward start u, length l. */
    blk(x, w, top, h, u, l, c, m = 'stud', k = 'solid', extra = null) {
      const b = { x: X(x), y: top - h / 2, z: Z(u + l / 2), w: w * LAT, h, d: l, c, m, k }
      if (extra) Object.assign(b, extra)
      S.boxes.push(b)
      return b
    },
    /** Dynamic object. Box-like dynamics use the same (x,w,top,h,u,l) frame. */
    dynBox(t, x, w, top, h, u, l, c, m, props) {
      const d = { t, id: `${n}:${dynId++}`, x: X(x), y: top - h / 2, z: Z(u + l / 2), w: w * LAT, h, d: l, c, m, k: 'solid', ...props }
      // Sideways movers travel proportionally further on the wider course.
      if (t === 'move' && d.ax === 0) d.amp *= LAT
      S.dyn.push(d)
      return d
    },
    dyn(t, props) {
      const d = { t, id: `${n}:${dynId++}`, ...props }
      S.dyn.push(d)
      return d
    },
    cyl(x, u, top, rad, h, c, m = 'stud', k = 'solid', extra = null) {
      const cy = { x: X(x), z: Z(u), top, r: rad, h, c, m, k }
      if (extra) Object.assign(cy, extra)
      S.cyls.push(cy)
      return cy
    },
    sign(text, x, y, u, size = 3, kind = 'label', extra = null) {
      S.signs.push({ text, x: X(x), y, z: Z(u), ry: 0, size, kind, ...extra })
    },
    prop(type, x, y, u, extra = null) {
      S.props.push({ type, x: X(x), y, z: Z(u), ...extra })
    },
    /** A chilling capybara NPC (decoration). `look`: yuzu | sleepy | party | spa | shades. */
    capy(x, u, top, extra = null) {
      S.props.push({ type: 'capy', x: X(x), y: top, z: Z(u), ry: 0, s: 1.25, id: 'classic', ...extra })
    },
  }

  /** Full course width. */
  a.W = half * 2

  /**
   * Stage gate: a tall jungle wall of purple-blue brick with mossy battlements and
   * hanging vines across the course, and one big archway to run through. Above the arch:
   * "Stage N", its name and the level it needs. Stages that need a higher level get a
   * glowing force field in the arch that only lets you through once you are strong enough.
   */
  a.entrance = (top = 0) => {
    const gw = Math.min(half - 1.5, 6.5) // half-width of the opening (builder units)
    // The first gate doubles as the lobby's back wall, so it spans the lobby.
    const ext = n === 1 ? (LOBBY_HALF + 2) / LAT : half + 18
    const H = 15
    const brick = C.jungleBrick
    const trim = C.jungleBrickDark
    const x0 = gw + 1.6
    for (const s of [-1, 1]) {
      const mid = s * (x0 + ext) / 2
      // Wall body (reaches far below the floor so it never floats) and a stone plinth.
      a.blk(mid, ext - x0, top + H, H + 14, 0.4, 2.6, brick, 'brick')
      a.blk(mid, ext - x0 + 0.2, top + 1.3, 1.3, 0.15, 3.1, trim, 'smooth', 'deco')
      // Moss along the top, dripping down both faces.
      a.blk(mid, ext - x0 + 0.3, top + H + 0.9, 0.9, 0.2, 3.0, C.moss, 'stud', 'deco')
      for (let x = x0 + 0.8; x < ext - 0.6; x += 1.3 + r() * 1.6) {
        const dh = 0.6 + r() * 2.6
        const dw = 0.6 + r() * 1.1
        a.blk(s * x, dw, top + H + 0.1, dh, 0.15, 0.12, r() < 0.5 ? C.moss : C.mossDark, 'stud', 'deco')
        if (r() < 0.6) a.blk(s * (x + 0.4), dw, top + H + 0.1, dh * 0.7, 3.0, 0.12, C.moss, 'stud', 'deco')
      }
      // Hanging vines.
      for (let x = x0 + 4; x < ext - 2; x += 6 + r() * 4) {
        const vh = 3 + r() * 5
        a.blk(s * x, 0.22, top + H, vh, 0.08, 0.1, C.mossDark, 'smooth', 'deco')
        a.blk(s * x, 0.7, top + H - vh + 0.3, 0.5, 0.06, 0.12, C.moss, 'stud', 'deco')
      }
      // Gate towers with mossy caps.
      a.blk(s * (gw + 0.9), 3, top + H + 3.5, H + 17.5, 0, 3.4, trim, 'brick')
      a.blk(s * (gw + 0.9), 3.4, top + H + 4.3, 0.8, -0.2, 3.8, C.moss, 'stud', 'deco')
      a.blk(s * (gw + 0.9), 3.4, top + 0.9, 0.9, -0.2, 3.8, C.gold, 'smooth', 'deco')
      // Past the wall's end an invisible wall stops anyone walking round it.
      a.blk(s * (ext + 15), 30, top + 40, 60, 0, 3, '#000000', 'invisible')
    }
    // The arch over the opening, with a gold trim and a glowing underside.
    a.blk(0, gw * 2 + 0.4, top + H, 4, 0.4, 2.6, brick, 'brick')
    a.blk(0, gw * 2 + 0.7, top + H + 0.9, 0.9, 0.2, 3.0, C.moss, 'stud', 'deco')
    a.blk(0, gw * 2 + 0.4, top + H - 4 - 0.2, 0.4, 0.2, 3.0, C.gold, 'smooth', 'deco')
    a.blk(0, gw * 2 - 1, top + H - 4.6, 0.12, 1.2, 0.5, C.neonCyan, 'neon', 'deco')
    for (let i = 0; i < 5; i += 1) {
      const x = -gw + 1 + (i / 4) * (gw * 2 - 2)
      a.blk(x, 0.18, top + H - 4.2, 1 + ((i * 7) % 5) * 0.4, 0.1, 0.1, C.mossDark, 'smooth', 'deco')
    }
    const req = stageLevel(n)
    a.sign(`Stage ${n}`, 0, top + H + 5.4, 0.2, 3.6, 'stage')
    a.sign(STAGE_NAMES[n], 0, top + H + 2.6, 0.2, 1.2, 'stageSub')
    a.sign(`Required Level: ${req}`, 0, top + H - 2, 0.1, 1.15, 'red')
    if (req > 1) {
      a.blk(0, gw * 2, top + H - 4, H - 4, 1.3, 0.3, '#7fe8ff', 'invisible', 'gate', { req })
      S.props.push({ type: 'forcefield', x: X(0), y: top, z: Z(1.45), w: gw * 2 * LAT, h: H - 4, req })
    }
    S.gate = { x: X(0), z: Z(0), w: gw * 2 * LAT, req }
    S.spawn = { x: X(0), y: top + 0.1, z: Z(7.5), yaw: Math.PI }
  }

  /** Invisible side walls that keep players on the course. */
  a.bounds = (top = 40) => {
    for (const s of [-1, 1]) a.blk(s * (half + 0.6), 1.2, top, top + 40, 0, len, '#000000', 'invisible')
  }

  /** Visible side walls (indoor stages). */
  a.walls = (h, c, m = 'stud', top = 0) => {
    for (const s of [-1, 1]) a.blk(s * (half + 0.6), 1.2, top + h, h + 2, 3, len - 3, c, m)
  }

  /** Floor + wins pad; the next stage's entrance sits at u = len. */
  a.endRoom = (floorColor = C.stone, top = 0, l = 16) => {
    a.blk(0, half * 2, top, 1.2, len - l, l, floorColor)
    const pu = len - 9
    const px = -Math.min(half - 3.4, 5.5)
    S.pad = { x: X(px), y: top, z: Z(pu), w: 4.2, d: 4.2 }
    a.blk(px, 4.6, top + 0.12, 0.12, pu - 2.3, 4.6, '#ffc81a', 'neon', 'deco')
  }

  /** Grass island: green top over an earthy body, with grass drips down the sides. */
  a.island = (x, w, u, l, top = 0, depth = 10, drips = true, body = C.dirt) => {
    a.blk(x, w, top, 0.7, u, l, C.grass)
    a.blk(x, w - 0.3, top - 0.7, depth, u + 0.15, l - 0.3, body)
    if (!drips) return
    const count = Math.max(2, Math.floor((w + l) / 5))
    for (let i = 0; i < count; i += 1) {
      const dh = 0.5 + r() * 1.4
      const dw = 0.6 + r() * 1.4
      if (i % 2 === 0) {
        const xx = x - w / 2 + 0.5 + r() * (w - 1)
        const front = r() < 0.5
        a.blk(xx, dw, top - 0.6, dh, front ? u - 0.08 : u + l - 0.08, 0.16, C.grass, 'stud', 'deco')
      } else {
        const uu = u + 0.5 + r() * (l - 1)
        const side = r() < 0.5 ? -1 : 1
        a.blk(x + side * (w / 2 + 0.0), 0.16, top - 0.6, dh, uu, dw, C.grass, 'stud', 'deco')
      }
    }
  }

  a.slab = (x, w, u, l, top = 0, c = C.stone, h = 1) => a.blk(x, w, top, h, u, l, c)

  a.sink = (x, w, u, l, top = 0, c = C.stone, extra = null) =>
    a.dynBox('sink', x, w, top, 1, u, l, c, 'stud', { delay: 0.45, depth: 7, back: 3.2, ...extra })

  /** Oscillating box. ax: 0=x, 1=y, 2=z (z moves along -u). */
  a.mover = (x, w, top, h, u, l, c, ax, amp, per, ph = 0, extra = null) =>
    a.dynBox('move', x, w, top, h, u, l, c, 'stud', { ax, amp, per, ph, ...extra })

  a.blink = (x, w, top, h, u, l, c, per, on0, on1, ph = 0, extra = null) =>
    a.dynBox('blink', x, w, top, h, u, l, c, 'stud', { per, on0, on1, ph, ...extra })

  a.sweeper = (x, u, y, length, spd, ph = 0, c = C.wood, extra = null) =>
    a.dyn('sweep', { x: X(x), z: Z(u), y, len: length, r: 0.45, spd, ph, c, kill: false, ...extra })

  a.pendulum = (x, u, pivotY, length, amp, per, ph = 0, c = C.metal, extra = null) =>
    a.dyn('pend', { x: X(x), z: Z(u), y: pivotY, len: length, r: 1.3, amp, per, ph, c, ...extra })

  /**
   * Flat decorative tiles scattered over a floor (one per grid cell at most, so two never
   * overlap and z-fight). `y` is the floor top.
   */
  a.scatterTiles = (u0, u1, colors, y = 0, chance = 0.5, avoid = () => false) => {
    const cell = 4
    for (let u = u0; u < u1 - cell; u += cell) {
      for (let x = -half + 1; x < half - cell; x += cell) {
        if (r() > chance) continue
        const w = 1.2 + r() * 1.6
        const l = 1.2 + r() * 1.6
        const tx = x + 0.4 + r() * (cell - w - 0.8) + w / 2
        const tu = u + 0.4 + r() * (cell - l - 0.8)
        if (avoid(tx, tu)) continue
        a.blk(tx, w, y + 0.05, 0.06, tu, l, colors[Math.floor(r() * colors.length)], 'stud', 'deco')
      }
    }
  }

  /** Low-poly canyon walls + trees just outside the course. */
  a.cliffs = ({ from = 0, to = len, gap = 4, base = -2, height = 1, trees = true, step = 9 } = {}) => {
    for (const s of [-1, 1]) {
      for (let u = Math.max(from, 34); u < to; u += step * (0.7 + r() * 0.5)) {
        const sc = (7 + r() * 6) * height
        const x = s * (half + gap + sc * 0.55 + r() * 4)
        S.rocks.push({ x: X(x), y: base + sc * 0.3, z: Z(u), s: sc, ry: r() * 6.28, v: Math.floor(r() * 3) })
        if (trees && r() < 0.6) {
          S.trees.push({ x: X(x - s * r() * 2), y: base + sc * 1.22, z: Z(u + (r() - 0.5) * 4), s: 0.9 + r() * 0.9, c: Math.floor(r() * 3) })
        }
      }
    }
  }

  a.waterPlane = (y = -2.2, c = C.water, kind = 'water') => {
    S.planes.push({ kind, y, x: X(0), z: Z(len / 2), w: half * 2 * LAT + 80, d: len + 6, c })
  }

  return a
}

/* ------------------------------------------------------------------ */
/* The 20 stages                                                       */
/* ------------------------------------------------------------------ */

const STAGE_SPECS = {
  1: { len: 150, half: 16, theme: 'river', killY: -1.6, build: stage1 },
  2: { len: 130, half: 16, theme: 'river', killY: -1.0, build: stage2 },
  3: { len: 150, half: 16, theme: 'river', killY: -1.6, build: stage3 },
  4: { len: 150, half: 13, theme: 'alley', killY: -6, build: stage4 },
  5: { len: 160, half: 12, theme: 'ramp', killY: -8, build: stage5 },
  6: { len: 140, half: 15, theme: 'canyon', killY: -16, build: stage6 },
  7: { len: 140, half: 15, theme: 'river', killY: -1.6, build: stage7 },
  8: { len: 150, half: 15, theme: 'spa', killY: -1.6, build: stage8 },
  9: { len: 170, half: 12, theme: 'river', killY: -1.35, build: stage9 },
  10: { len: 160, half: 14, theme: 'canyon', killY: -10, build: stage10 },
  11: { len: 150, half: 13, theme: 'canyon', killY: -10, build: stage11 },
  12: { len: 110, half: 10, theme: 'lava', killY: -2.2, build: stage12 },
  13: { len: 130, half: 14, theme: 'lava', killY: -1.2, build: stage13 },
  14: { len: 150, half: 14, theme: 'sky', killY: -22, build: stage14 },
  15: { len: 140, half: 16, theme: 'river', killY: -1.6, build: stage15 },
  16: { len: 190, half: 16, theme: 'meadow', killY: -10, build: stage16 },
  17: { len: 190, half: 11, theme: 'factory', killY: -14, build: stage17 },
  18: { len: 200, half: 11, theme: 'temple', indoor: true, killY: -10, build: stage18 },
  19: { len: 160, half: 14, theme: 'lava', killY: -1.2, build: stage19 },
  20: { len: 230, half: 16, theme: 'river', killY: -1.6, build: stage20 },
}

/* ---- Stage 1: Capy Bridges - a river canyon crossed by three stone bridges ---- */
function stage1(a) {
  const { S, r } = a
  const path = (u, l) => a.blk(0, 4, 0.06, 0.06, u, l, '#c99a5a', 'stud', 'deco')
  a.island(0, a.W, 0, 14)
  a.entrance()
  a.bounds()
  a.waterPlane()
  a.cliffs({ gap: 3, height: 1.3 })
  path(3, 11)
  a.sign('Cross the 3 bridges!', 0, 4.4, 10, 0.9, 'warn')
  const bridge = (u, l, w, logs = [], gaps = []) => {
    let at = u
    for (const g of [...gaps, u + l]) {
      if (g > at) a.blk(0, w, 0.3, 1.2, at, Math.min(g, u + l) - at, '#9aa0b4')
      at = g + 1.6
    }
    for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) a.blk(x, 0.4, 0.42, 0.12, u, l, '#7c8296', 'stud', 'deco')
    for (let p = u + 4; p < u + l - 2; p += 9) a.blk(0, w * 0.6, -0.9, 6, p, 1.6, '#8a90a4', 'stud', 'deco')
    for (const lu of logs) a.blk(0, w + 0.6, 1.0, 0.7, lu, 0.9, C.wood, 'stud', 'solid')
  }
  // Bridge 1: wide and long, two logs to hop.
  bridge(14, 34, 8, [24, 37])
  a.island(0, 26, 48, 12)
  path(48, 12)
  a.capy(-8, 52, 0, { look: 'sleepy', ry: 0.6, id: 'choco' })
  // Bridge 2: narrower, with a broken gap and logs.
  bridge(60, 36, 7, [68, 88], [78])
  a.island(0, 26, 96, 12)
  path(96, 12)
  a.capy(8, 100, 0, { look: 'shades', ry: -0.6 })
  // Bridge 3: narrowest.
  bridge(108, 28, 6, [116, 127])
  a.island(0, a.W, 136, 14)
  path(136, 6)
  a.endRoom(C.grass, 0, 12)
  for (const [u, side] of [[52, -1], [55, 1], [100, -1], [103, 1], [6, -1], [8, 1]]) {
    S.trees.push({ x: a.X(side * (10 + r() * 4)), y: 0, z: a.Z(u), s: 0.9 + r() * 0.4, c: Math.floor(r() * 3) })
  }
  a.prop('raft', -13, -2.2, 30, { ry: 0.3 })
}

/* ---- Stage 2: Red Leaf Hop - big red leaves floating on a flowing river ---- */
function stage2(a) {
  const { S, r } = a
  a.island(0, a.W, 0, 12)
  a.entrance()
  a.bounds()
  a.waterPlane(-1.1, C.water, 'water')
  a.cliffs({ gap: 3, height: 1.2 })
  a.sign('Hop across the red leaves!', 0, 3.8, 9, 0.9, 'warn')
  const leaf = (x, u, rad) => {
    a.cyl(x, u, 0, rad, 0.6, '#e0302a', 'smooth')
    a.cyl(x, u, 0.03, rad * 0.55, 0.05, '#ff6a4a', 'smooth', 'deco')
    a.cyl(x, u, 0.05, rad * 0.14, 0.05, '#ffd0a0', 'smooth', 'deco')
  }
  let u = 15
  let x = 0
  for (let i = 0; i < 11; i += 1) {
    if (i === 5) {
      a.island(0, 20, u, 8, 0, 6)
      a.capy(5, u + 4, 0, { look: 'sleepy', ry: -0.5, id: 'choco' })
      u += 8 + 2
      continue
    }
    const rad = 2.7 + r() * 0.4
    // Every fourth leaf bobs gently on the current.
    if (i % 4 === 3) a.mover(x, rad * 1.9, 0, 0.7, u, rad * 1.9, '#ff5a3a', 1, 0.45, 3.2, r())
    else leaf(x, u + rad, rad)
    u += rad * 2 + 1.6
    x = Math.max(-7, Math.min(7, x + (r() - 0.5) * 6))
  }
  a.island(0, a.W, u, Math.max(6, S.len - 12 - u), 0, 6)
  a.endRoom(C.grass, 0, 12)
  for (const [rx, ru] of [[-15, 20], [15, 36], [-15, 70], [15, 80], [-14, 104], [14.5, 60]]) a.prop('reeds', rx, -1.1, ru)
  a.prop('raft', -13, -1.3, 52, { ry: 0.4 })
  a.capy(-14, 6, 0, { look: 'sleepy', ry: 0.9, id: 'choco' })
}

/* ---- Stage 3: River Jumps - mossy blocks over a fast river, smaller and further apart ---- */
function stage3(a) {
  const { S, r } = a
  a.island(0, a.W, 0, 12)
  a.entrance()
  a.bounds()
  a.waterPlane()
  a.cliffs({ gap: 3, height: 1.4 })
  a.sign('Jump across the river!', 0, 3.8, 9, 0.9, 'warn')
  const tops = [0, 0.5, 0, 1.0, 0.5, 0, 0.8, 0, 0.4, 1.0, 0, 0.5]
  let u = 14
  let x = 0
  for (let i = 0; i < 12; i += 1) {
    const size = 9 - i * 0.38
    const top = tops[i]
    if (i === 5) a.mover(x, size, top, 1.2, u, size, C.moss, 1, 0.8, 3.4, 0)
    else if (i === 9) a.mover(x, size, top, 1.2, u, size, C.moss, 0, 3, 4.4, 0.25)
    else a.island(x, size, u, size, top, 8, true, C.mossDark)
    u += size + 1.6 + i * 0.07
    x = (i % 2 ? -1 : 1) * (2 + r() * 3.5)
  }
  a.island(0, a.W, u, S.len - 12 - u, 0, 8)
  a.endRoom(C.grass, 0, 12)
  a.prop('raft', -14, -2.2, 40, { ry: 0.3 })
  a.prop('raft', 14, -2.2, 96, { ry: -0.2 })
  a.sign('Capy Taxi - not in service', -12, 1.6, 40, 0.55, 'label')
}

/* ---- Stage 4: Giant Ball Alley - dodge giant bowling balls between striped walls ---- */
function stage4(a) {
  const { S, Z } = a
  const fl = C.salmon
  a.slab(0, a.W, 0, S.len - 14, 0, fl, 4)
  a.entrance()
  a.bounds()
  a.cliffs({ gap: 6, height: 1.3 })
  // Yellow / black hazard-striped side walls.
  for (const s of [-1, 1]) {
    let k = 0
    for (let u = 3; u < S.len - 16; u += 2.5, k += 1) a.blk(s * (a.half + 0.6), 1.2, 5, 5.4, u, 2.5, k % 2 ? C.hazard : C.hazardBlack, 'smooth')
  }
  // Three ball lanes (lighter tiles) with safe strips between them.
  const lanes = [[-8, '#3f7bff', 9], [0, '#ff4f8a', 8], [8, '#ffd21a', 10]]
  for (const [lx] of lanes) a.blk(lx, 4.4, 0.04, 0.06, 16, S.len - 34, C.salmonDark, 'stud', 'deco')
  for (const [lx, c, per] of lanes) {
    for (const k of [0, 0.5]) a.dyn('boulder', { x: a.X(lx), r: 3, zA: Z(S.len - 18), zB: Z(16), per, ph: (k + lx * 0.013 + 0.2) % 1, floor: 0, look: 'ball', c })
  }
  // Barriers in the safe strips: to get past one you must step into a lane - time it!
  const strip = (side) => side * 4
  const edge = (side) => side * 11.7
  for (const [u, x, w] of [
    [30, strip(-1), 3.2], [48, strip(1), 3.2], [62, edge(-1), 2.6], [66, edge(1), 2.6], [84, strip(-1), 3.2],
    [100, strip(1), 3.2], [100, edge(-1), 2.6], [116, strip(-1), 3.2], [116, edge(1), 2.6],
  ]) {
    a.blk(x, w, 2.6, 2.6, u, 1.2, C.hazard)
    a.blk(x, w + 0.05, 1.6, 0.5, u - 0.02, 1.24, C.hazardBlack, 'smooth', 'deco')
  }
  a.sign('DODGE THE GIANT BALLS!', 0, 4.4, 9, 1.0, 'warn')
  a.sign('Capybara bowling night', 0, 3.1, 14, 0.6, 'label')
  a.prop('arch', 0, 0, S.len - 17, { w: a.W * a.LAT, label: 'BOWLING TIME!' })
  a.prop('bigBall', 0, 16.5, S.len - 17, { r: 4.5, c: '#3f7bff' })
  a.endRoom(fl, 0, 14)
}

/* ---- Stage 5: Sky Ramp - a huge white staircase into the clouds, then jump down ---- */
function stage5(a) {
  const { S, Z } = a
  const wh = C.white
  const wh2 = '#dfe8ff'
  a.slab(0, a.W, 0, 10, 0, wh, 3)
  a.entrance()
  a.bounds(60)
  S.planes.push({ kind: 'clouds', y: -14, x: a.X(0), z: a.Z(S.len / 2), w: 160, d: S.len + 60, c: '#ffffff' })
  a.sign('Climb the Sky Ramp!', 0, 3.8, 8, 0.9, 'warn')
  const N = 40
  for (let i = 0; i < N; i += 1) {
    const top = 0.45 * (i + 1)
    a.blk(0, 11, top, top + 6, 10 + i * 2, 2, i % 2 ? wh : wh2, 'smooth')
  }
  // Snowballs roll down the ramp; axes... er, pendulums swing across it.
  for (const [x, per, ph] of [[-3, 5.4, 0], [3, 6.2, 0.45]]) {
    for (const k of [0, 0.5]) a.dyn('boulder', { x: a.X(x), r: 1.4, zA: Z(90), zB: Z(10), per, ph: (ph + k) % 1, floor: 18, floorB: 0.45, look: 'snow' })
  }
  for (const [u, ph] of [[30, 0], [54, 0.4], [76, 0.75]]) {
    const top = 0.45 * Math.floor((u - 10) / 2 + 1)
    a.pendulum(0, u, top + 9, 7.4, 1.0, 2.3, ph)
  }
  a.slab(0, 14, 90, 14, 18, wh, 3)
  a.sign('You made it! Now... JUMP!', 0, 22, 96, 0.9, 'gold')
  a.slab(0, 14, 104, 14, 12, wh2, 3)
  a.slab(0, 14, 118, 14, 6, wh, 3)
  a.slab(0, a.W, 132, S.len - 132 - 14, 0, wh2, 3)
  a.endRoom(wh, 0, 14)
  for (let i = 0; i < 14; i += 1) a.prop('cloud', (a.r() - 0.5) * 70, -6 - a.r() * 10, a.r() * S.len, { s: 3 + a.r() * 5 })
}

/* ---- Stage 6: Yuzu Bounce - giant citrus trampolines over a deep jungle valley ---- */
function stage6(a) {
  const { S } = a
  a.island(0, a.W, 0, 8, 0, 30)
  a.entrance()
  a.bounds()
  a.cliffs({ gap: 6, base: -14, height: 1.6 })
  S.planes.push({ kind: 'ground', y: -30, x: a.X(0), z: a.Z(S.len / 2), w: 120, d: S.len + 6, c: '#1fa83a' })
  a.sign('BOING! Capybaras love yuzu.', 0, 3.8, 6, 0.9, 'gold')
  const yuzu = (x, u, top, rad = 2.6) => {
    a.cyl(x, u, top, rad, 1.2, C.citrus, 'smooth', 'bounce', { power: 20, mushroom: true, citrus: true })
    a.cyl(x, u, top - 1.2, 0.8, 30, C.wood, 'smooth', 'deco')
  }
  yuzu(0, 12.5, 0)
  yuzu(-2, 22, 1.0)
  yuzu(1.5, 31.5, 0.5)
  yuzu(-1.5, 41, 2.0)
  yuzu(2, 50.5, 0.8)
  a.island(0, 14, 54.5, 9, 1.5, 30)
  a.capy(-4, 58, 1.5, { look: 'yuzu', ry: 0.5 })
  yuzu(0, 70, 0.5)
  yuzu(-2, 79.5, 1.8)
  yuzu(1.5, 89, 0.6)
  yuzu(-1, 98.5, 1.4)
  yuzu(1, 108, 0.4)
  a.island(0, a.W, 112.5, 27.5, 0, 30)
  a.endRoom(C.grass, 0, 14)
}

/* ---- Stage 7: Log Spin Lagoon - round islands swept by spinning logs ---- */
function stage7(a) {
  a.island(0, a.W, 0, 8.5)
  a.entrance()
  a.bounds()
  a.waterPlane()
  a.cliffs({ gap: 6 })
  const isl = (u, rad, sweeps) => {
    a.cyl(0, u, 0, rad, 10, C.grass, 'stud', 'solid', { island: true })
    sweeps.forEach(([spd, ph]) => a.sweeper(0, u, 0.65, rad - 0.3, spd, ph, C.wood))
    a.cyl(0, u, 1.0, 0.7, 1.0, C.woodLight)
  }
  const plank = (x, u, l, w = 3.6) => a.blk(x, w, 0, 0.5, u, l, C.woodLight, 'smooth')
  a.sign('Jump the spinning logs!', 0, 3.6, 6, 0.9, 'warn')
  isl(18, 6.5, [[1.3, 0]])
  plank(0, 24, 9.5)
  isl(39.5, 6.5, [[-1.7, 0]])
  plank(0, 45.5, 4.5)
  plank(0, 51.5, 4.5)
  isl(62, 7, [[1.5, 0], [1.5, Math.PI / 2]])
  plank(-2, 68.5, 6)
  plank(2, 73.5, 6)
  isl(85, 6.5, [[2.2, 0]])
  plank(0, 91, 9.5)
  isl(107, 7, [[-1.2, 0], [-1.2, Math.PI / 2]])
  plank(0, 113.5, 11)
  a.island(0, a.W, 124, 16, 0)
  a.endRoom(C.grass, 0, 14)
  a.prop('raft', 14, -2.2, 60, { ry: 0.5 })
}

/* ---- Stage 8: Hot Spring Hop - stones, bobbing tubs and very relaxed capybaras ---- */
function stage8(a) {
  const { S } = a
  a.island(0, a.W, 0, 12)
  a.entrance()
  a.bounds()
  a.waterPlane(-1.3, '#9ff6ff', 'spring')
  a.cliffs({ gap: 4, height: 1.2 })
  a.sign('Shhh... the capybaras are relaxing.', 0, 3.8, 9, 0.85, 'label')
  // Round stepping stones.
  let u = 15.5
  const xs = [-2, 2, -1, 3, -3, 0]
  for (let i = 0; i < 6; i += 1) {
    a.cyl(xs[i], u, 0, 2.0, 6, i % 2 ? C.stoneLight : C.stone)
    u += 4.7
  }
  // A wooden pier, then bobbing wooden tubs.
  a.blk(0, 6, 0.2, 1.4, 42, 10, C.woodLight, 'smooth')
  a.sign('Do NOT splash the capybaras', 0, 3.4, 44, 0.65, 'warn')
  for (let i = 0; i < 5; i += 1) a.mover(i % 2 ? 2 : -2, 4.2, -0.3, 1, 54 + i * 6, 4, C.wood, 1, 0.9, 3.4, i * 0.21)
  a.island(0, 16, 83, 10, 0, 6)
  a.capy(4, 87, 0, { look: 'sleepy', ry: -0.4 })
  // Sinking stones, then a narrow bridge with a lazy spinning towel... log.
  for (let i = 0; i < 6; i += 1) a.sink(i % 2 ? 2 : -2, 3.8, 95.5 + i * 4.2, 3.6, 0, i % 2 ? C.stoneLight : C.stone, { delay: 0.5, depth: 5, back: 3 })
  a.blk(0, 4.4, 0.2, 1.4, 121, 13, C.woodLight, 'smooth')
  a.sweeper(0, 127.5, 0.85, 3.4, 1.5, 0, '#ff9ad5')
  a.island(0, a.W, 134, S.len - 12 - 134, 0, 6)
  a.endRoom(C.grass, 0, 12)
  // The spa itself: hot pools with capybaras soaking, yuzu floating, steam rising.
  a.prop('spa', -13, -1.3, 28, { r: 4.5 })
  a.prop('spa', 13.5, -1.3, 66, { r: 4.2 })
  a.prop('spa', -13, -1.3, 110, { r: 4.4 })
  for (const [lx, ly, lu] of [[-6, 0, 2], [6, 0, 2], [-2.7, 0.2, 44], [2.7, 0.2, 50], [-6, 0, 136], [6, 0, 136]]) a.prop('lantern', lx, ly, lu)
}

/* ---- Stage 9: Wobbly Bridges - planks collapse, pontoons rise and sink ---- */
function stage9(a) {
  a.island(0, a.W, 0, 12, 0, 6)
  a.entrance()
  a.bounds()
  a.waterPlane(-1.45)
  a.cliffs({ gap: 7, base: -3, height: 0.65, step: 13 })

  const collapse = (x, w, u, l, delay, i) => a.sink(x, w, u, l, 0.18, i % 2 ? C.woodLight : '#966039', {
    m: 'smooth', bridgeDeck: true, delay, depth: 4.8, back: 3.5,
  })
  const pilings = (u, w) => {
    for (const side of [-1, 1]) a.cyl(side * (w / 2 + 0.6), u, -0.15, 0.22, 3.5, C.wood, 'smooth', 'deco')
  }

  a.sign('Keep moving! The planks will collapse!', 0, 3.8, 9, 0.9, 'warn')
  for (let i = 0; i < 10; i += 1) {
    collapse(0, 7, 12 + i * 3.4, 3.28, 0.95, i)
    if (i % 3 === 0) pilings(13 + i * 3.4, 7)
  }
  a.island(0, 14, 46, 10, 0, 6)
  a.capy(-4, 50, 0, { look: 'party', ry: 0.3, id: 'lime' })

  a.sign('Wait for the bridge to rise, then jump!', 0, 3.8, 51, 0.9, 'label')
  for (let i = 0; i < 4; i += 1) {
    a.mover(i % 2 ? 0.9 : -0.9, 5.6, 0.1, 0.45, 56 + i * 9, 8.2, C.woodLight, 1, 1.75, 11, -i * 0.12, {
      m: 'smooth', bridgeDeck: true,
    })
  }
  a.island(0, 14, 92, 12, 0, 6)

  a.sign('RUN! This bridge is breaking!', 0, 3.8, 100, 1, 'warn')
  for (let i = 0; i < 8; i += 1) collapse(i < 4 ? -1.6 : 1.6, 6, 104 + i * 3, 2.88, 0.75, i)
  a.island(0, 12, 128, 8, 0, 6)
  for (let i = 0; i < 6; i += 1) collapse(i % 2 ? 0.6 : -0.6, 5.6, 136 + i * 3, 2.88, 0.65, i)
  a.island(0, a.W, 154, 16, 0, 6)
  a.endRoom(C.grass)
}

/* ---- Stage 10: Coconut Canyon - giant coconuts roll down four lanes ---- */
function stage10(a) {
  const { S, Z } = a
  a.blk(0, a.W, 0, 2, 0, S.len - 16, C.grass)
  a.entrance()
  a.bounds()
  a.cliffs({ gap: 3, height: 1.5 })
  for (const x of [-10.5, -3.5, 3.5, 10.5]) a.blk(x, 3.4, 0.03, 0.05, 12, 126, C.sand, 'smooth', 'deco')
  for (const u of [32, 58, 84, 110]) for (const x of [-7, 0, 7]) a.blk(x, 1.4, 2.4, 2.4, u, 3, C.stoneLight)
  const lanes = [[-10.5, 8.5, 0], [-3.5, 7.0, 0.3], [3.5, 9.0, 0.6], [10.5, 7.6, 0.15]]
  for (const [x, per, ph] of lanes) {
    for (const k of [0, 0.5]) a.dyn('boulder', { x: a.X(x), r: 1.7, zA: Z(136), zB: Z(12), per, ph: (ph + k) % 1, floor: 0, look: 'coconut' })
  }
  a.sign('Hide behind the pillars!', 0, 3.6, 8, 0.85, 'warn')
  a.prop('arch', 0, 0, 136, { w: a.W * a.LAT, label: 'COCONUTS!' })
  a.endRoom(C.stone)
}

/* ---- Stage 11: Watermelon Swing - giant watermelons swing across a causeway ---- */
function stage11(a) {
  const { S, r } = a
  a.slab(0, a.W, 0, 10, 0, C.stone, 3)
  a.entrance()
  a.bounds()
  a.cliffs({ gap: 6, base: -12, height: 1.4 })
  S.planes.push({ kind: 'ground', y: -26, x: a.X(0), z: a.Z(S.len / 2), w: 140, d: S.len + 6, c: '#1fa83a' })
  a.slab(0, 9, 10, 40, 0, C.stoneLight, 3)
  a.blk(0, 0.4, 0.03, 0.05, 10, 40, C.neonYellow, 'neon', 'deco')
  a.sign('Time your run between the melons!', 0, 4, 9, 0.9, 'warn')
  const melon = { look: 'melon' }
  ;[18, 27, 36, 45].forEach((u, i) => a.pendulum(0, u, 9, 7.4, 1.0, 2.1 + i * 0.15, r(), C.metal, melon))
  a.slab(0, 12, 50, 6, 0, C.stone, 3)
  for (let i = 0; i < 6; i += 1) a.sink((i % 2 ? 1 : -1) * 2.2, 4.2, 58 + i * 4.2, 3.6, 0, i % 2 ? C.stoneLight : C.stone)
  a.slab(0, 12, 84, 8, 0, C.stone, 3)
  a.capy(3, 88, 0, { look: 'yuzu', ry: -0.6 })
  a.slab(0, 7, 92, 26, 0, C.stoneLight, 3)
  ;[98, 106, 114].forEach((u) => a.pendulum(0, u, 9, 7.4, 1.1, 1.7 + r() * 0.3, r(), C.metal, melon))
  for (let row = 0; row < 4; row += 1) {
    for (const x of [-2.6, 0, 2.6]) a.blink(x, 2.5, 0, 1, 118 + row * 3, 2.8, row % 2 ? '#ffd01a' : '#ff8a1a', 3, 0, 0.62, ((row + Math.round(x / 2.6) + 2) % 2) * 0.5)
  }
  a.slab(0, a.W, 130, 20, 0, C.stone, 3)
  a.endRoom(C.stone)
}

/* ---- Stage 12: Lava Floodway - the causeway disappears beneath a repeating tide ---- */
function stage12(a) {
  a.slab(0, a.W, 0, 14, 0, C.basalt, 4)
  a.entrance()
  a.bounds()
  a.waterPlane(-2.4, C.lava, 'lava')
  a.cliffs({ from: 10, to: 98, gap: 5, base: -3, height: 0.8, trees: false, step: 12 })
  const roadTop = 0.12
  a.blk(0, 6, roadTop, 0.8, 14, 80, C.basalt, 'smooth')
  for (let u = 14; u < 94; u += 3.5) {
    a.blk(0, 5.6, roadTop + 0.025, 0.025, u + 0.12, Math.min(3.2, 94 - u - 0.12), '#564a50', 'smooth', 'deco')
  }
  for (const side of [-1, 1]) a.blk(side * 2.94, 0.12, roadTop + 0.04, 0.05, 14, 80, '#dca45b', 'smooth', 'deco')
  a.sign('Climb to high ground when the lava rises!', 0, 3.7, 10.5, 0.85, 'warn')
  for (const u of [32, 56, 80]) {
    for (let i = 0; i < 4; i += 1) {
      a.blk(0, 7, roadTop + (i + 1) * 0.42, 2.8, u - 6 + i, 1, '#4b4654', 'smooth')
      a.blk(0, 7, roadTop + (3 - i) * 0.42, 2.8, u + 2 + i, 1, '#4b4654', 'smooth')
    }
    a.blk(0, 8.4, 1.8, 3.2, u - 2, 4, '#405967', 'smooth')
    for (const side of [-1, 1]) {
      a.blk(side * 3.82, 0.12, 1.85, 0.05, u - 2, 4, '#74dfd9', 'neon', 'deco')
      a.blk(side * 4.05, 0.18, 2.48, 0.68, u - 2, 4, '#313745', 'metal')
    }
    a.sign('SAFE HIGH GROUND', 0, 4.6, u, 0.7)
  }
  a.dyn('flood', {
    x: a.X(0), z: a.Z(54), w: a.W * a.LAT, d: 80, roadTop,
    lowY: -0.9, highY: 0.92, per: 16, ph: 0,
    riseStart: 7, riseEnd: 9.5, drainStart: 13,
  })
  a.slab(0, a.W, 94, 16, 0, C.basalt, 4)
  a.endRoom(C.basalt)
  for (const [x, u] of [[-13, 24], [13, 54], [-13, 85]]) a.prop('firePillar', x, -2.4, u)
}

/* ---- Stage 13: Lava Leap ---- */
function stage13(a) {
  a.slab(0, a.W, 0, 9, 0, C.basalt, 6)
  a.entrance()
  a.bounds()
  a.waterPlane(-1.6, C.lava, 'lava')
  a.cliffs({ gap: 5, base: -3 })
  a.sign('The floor is lava. Literally.', 0, 3.6, 6, 0.85, 'warn')
  a.slab(-2, 5, 10.5, 4, 0, C.stone, 6)
  a.slab(2.5, 5, 17, 4, 0, C.stone, 6)
  a.slab(-2, 5, 23.5, 4, 0, C.stone, 6)
  a.mover(0, 4, 0, 1, 29.5, 4, C.stoneLight, 0, 4, 4.2, 0)
  a.mover(0, 4, 0, 1, 36, 4, C.stoneLight, 0, 4, 4.2, 0.5)
  a.slab(0, 2.2, 42.5, 11.5, 0, C.stone, 6)
  ;[[-1.5, 56], [1.5, 60], [-1.5, 64], [1.5, 68]].forEach(([x, u]) => a.sink(x, 3.4, u, 3.4, 0, '#5a3b3b'))
  a.slab(0, 14, 72, 10, 0, C.basalt, 6)
  a.sweeper(0, 77, 0.65, 6.5, 2.0, 0, C.lava, { kill: true, fire: true })
  a.mover(-2, 4, 0.6, 1, 85, 4, C.stoneLight, 1, 1.0, 3, 0)
  a.mover(2, 4, 0.6, 1, 92, 4, C.stoneLight, 1, 1.0, 3, 0.5)
  a.slab(-3, 5, 99, 4, 0, C.stone, 6)
  a.slab(3, 5, 105.5, 4, 0, C.stone, 6)
  a.slab(0, a.W, 112, 18, 0, C.basalt, 6)
  a.endRoom(C.basalt)
  for (const [x, u] of [[-7, 40], [7, 60], [-7, 90], [7, 110]]) a.prop('firePillar', x, -1.6, u)
}

/* ---- Stage 14: Cloud Hop ---- */
function stage14(a) {
  const { S } = a
  const cl = C.cloud
  a.slab(0, a.W, 0, 8, 0, cl, 2)
  a.entrance()
  a.bounds()
  S.planes.push({ kind: 'clouds', y: -18, x: a.X(0), z: a.Z(S.len / 2), w: 160, d: S.len + 60, c: '#ffffff' })
  a.sign('Fluffy... but not THAT fluffy. Mind the gaps!', 0, 3.6, 6, 0.8, 'warn')
  a.slab(0, 3.6, 8, 14, 0, cl, 1)
  a.slab(0, 5, 22, 4, 0, cl, 1)
  a.mover(0, 4, 0, 1, 28, 4, '#bfe0ff', 0, 4.5, 5, 0)
  a.mover(0, 4, 0, 1, 34.5, 4, '#bfe0ff', 0, 4.5, 5, 0.5)
  a.slab(0, 5, 41, 5, 0, cl, 1)
  a.mover(0, 4, 0, 1, 50, 4, '#bfe0ff', 2, 3.5, 4, 0)
  a.slab(0, 5, 59, 5, 0, cl, 1)
  for (let row = 0; row < 5; row += 1) {
    for (const x of [-3.2, 0, 3.2]) {
      const setB = (row + Math.round(x / 3.2)) % 2 !== 0
      a.blink(x, 3, 0, 1, 66 + row * 3.5, 3, '#ffffff', 3.2, 0, 0.6, setB ? 0.5 : 0, { cloudTile: true })
    }
  }
  a.slab(-4, 3, 84.5, 11.5, 0, cl, 1)
  a.slab(0, 10, 95, 2, 0, cl, 1)
  a.slab(4, 3, 96, 11, 0, cl, 1)
  a.mover(4, 4, 0, 1, 108, 4, '#bfe0ff', 1, 2, 3.5, 0)
  a.mover(0, 4, 0, 1, 114, 4, '#bfe0ff', 1, 2, 3.5, 0.33)
  a.mover(-4, 4, 0, 1, 120, 4, '#bfe0ff', 1, 2, 3.5, 0.66)
  a.slab(-4, 5, 126, 5, 2, cl, 1)
  a.slab(0, a.W, 134, 16, 0, cl, 2)
  a.endRoom(cl)
  for (let i = 0; i < 14; i += 1) a.prop('cloud', (a.r() - 0.5) * 70, -6 - a.r() * 10, a.r() * S.len, { s: 3 + a.r() * 5 })
}

/* ---- Stage 15: Tsunami Terraces - climb high, then race the wave down the terraces ---- */
function stage15(a) {
  const { S } = a
  a.island(0, a.W, 0, 8)
  a.entrance(0)
  a.bounds(60)
  a.waterPlane()
  a.cliffs({ gap: 3, height: 1.5 })
  for (let i = 0; i < 20; i += 1) {
    const top = 0.5 * (i + 1)
    a.blk(0, a.W - 8, top, 0.5, 8 + i, 1, C.grass)
    a.blk(0, a.W - 8.2, top - 0.5, top + 9.5, 8 + i, 1, C.dirt)
  }
  a.island(0, a.W - 2, 28, 10, 10, 20)
  a.sign('RUN! The tsunami is coming!', 0, 14.5, 36, 1.4, 'warn')
  a.island(0, a.W - 2, 40, 12, 8, 18)
  a.slab(-2, a.W - 10, 54, 8, 6.5, C.stone, 10)
  a.island(0, a.W - 2, 64, 12, 5, 16)
  a.blk(-3, 1.6, 6.2, 1.2, 68, 1.6, C.stoneLight)
  a.blk(4, 1.6, 6.2, 1.2, 72, 1.6, C.stoneLight)
  a.slab(-a.W / 4 - 0.6, a.W / 2 - 2.4, 78, 8, 3.5, C.stone, 10)
  a.slab(a.W / 4 + 0.6, a.W / 2 - 2.4, 78, 8, 3.5, C.stone, 10)
  a.island(0, a.W - 2, 88, 12, 2.2, 13)
  a.slab(0, a.W - 10, 102, 8, 1.0, C.stone, 10)
  a.island(0, a.W - 2, 112, 12, 0.4, 11)
  a.blk(0, a.W, 0, 6, 124, 16, C.stone)
  a.endRoom(C.stone)
  S.wave = { triggerU: 30, startU: 16, delay: 0.5, speed: 6.6, stopU: 122, height: 18, color: '#3fe8ff' }
}

/* ---- Stage 16: Coconut Rain - coconuts fall from the palms; watch the red circles ---- */
function stage16(a) {
  const { S, r, Z } = a
  a.island(0, a.W, 0, S.len - 16, 0, 8)
  a.entrance()
  a.bounds()
  a.cliffs({ gap: 4, height: 1.5 })
  a.scatterTiles(6, S.len - 18, [C.woodLight, C.sand], 0, 0.3)
  a.sign('Watch out for falling coconuts!', 0, 3.8, 8, 0.9, 'warn')
  a.sign('(Red circle = BONK)', 0, 2.8, 8, 0.6, 'label')
  for (let u = 20; u < 172; u += 9.5) {
    const k = 2 + (r() < 0.4 ? 1 : 0)
    for (let j = 0; j < k; j += 1) {
      a.dyn('meteor', { x: a.X((r() - 0.5) * (a.W - 4)), z: Z(u + (r() - 0.5) * 4), r: 2.8, per: 3.4 + r() * 1.8, ph: r(), floor: 0, look: 'coconut', cause: 'bonk' })
    }
  }
  for (const u of [40, 90, 140]) a.capy(r() < 0.5 ? -14 : 14, u, 0, { look: 'shades', ry: r() - 0.5 })
  a.endRoom(C.grass)
}

/* ---- Stage 17: Fruit Factory - conveyor belts in a juice factory ---- */
function stage17(a) {
  const { S } = a
  a.slab(0, 22, 0, 8, 0, C.metal, 4)
  a.entrance()
  a.walls(8, C.metal, 'metal')
  S.planes.push({ kind: 'glow', y: -12, x: a.X(0), z: a.Z(S.len / 2), w: 40, d: S.len, c: '#ff9a1a' })
  a.sign('Fruit Factory: ride the belts!', 0, 3.8, 6, 0.9, 'gold')
  const belt = (x, w, u, l, vx, vz) => a.blk(x, w, 0, 1, u, l, '#2b2f3a', 'belt', 'conv', { cv: [vx, vz] })
  const edge = (x, w, u, l) => {
    a.blk(x - w / 2 - 0.15, 0.3, 0.12, 0.2, u, l, C.hazard, 'stud', 'deco')
    a.blk(x + w / 2 + 0.15, 0.3, 0.12, 0.2, u, l, C.hazard, 'stud', 'deco')
  }
  belt(0, 10, 8, 32, 0, 7)
  edge(0, 10, 8, 32)
  for (const [x, vz] of [[-6, 10], [0, -6], [6, 4]]) {
    belt(x, 5, 44, 26, 0, vz)
    edge(x, 5, 44, 26)
  }
  belt(0, 16, 74, 15, 8, 0)
  belt(0, 16, 89, 15, -8, 0)
  edge(0, 16, 74, 30)
  belt(-5, 3.5, 108, 12, 0, 8)
  belt(-1, 11.5, 120, 3.5, 5, 0)
  belt(5, 3.5, 123.5, 12.5, 0, 8)
  a.slab(0, 22, 140, 4, 0, C.metal, 4)
  belt(0, 12, 144, 30, 0, 8)
  edge(0, 12, 144, 30)
  for (const u of [152, 161, 169]) a.blk(0, 12, 0.9, 0.6, u, 0.8, C.hazard)
  a.slab(0, 22, 174, 16, 0, C.metal, 4)
  a.endRoom(C.metal)
  for (const [x, u] of [[-10.2, 20], [10.2, 60], [-10.2, 100], [10.2, 141], [-10.2, 178]]) a.prop('crate', x, 0, u)
}

/* ---- Stage 18: Laser Temple ---- */
function stage18(a) {
  const { S } = a
  const fl = '#141826'
  a.entrance()
  a.blk(0, 22, 0, 1, 3, S.len - 3, fl)
  a.walls(11, '#161a2c')
  for (let u = 6; u < S.len - 16; u += 4) a.blk(0, 22, 0.03, 0.04, u, 0.1, C.neonCyan, 'neon', 'deco')
  for (let x = -9; x <= 9; x += 4.5) a.blk(x, 0.1, 0.03, 0.04, 3, S.len - 19, C.neonCyan, 'neon', 'deco')
  const L = { m: 'laser', k: 'kill' }
  const pink = C.neonPink
  a.sign('Lasers! Capybaras hate lasers.', 0, 3.8, 6, 0.9, 'warn')
  ;[14, 20, 26].forEach((u, i) => a.blink(0, 21.6, 7, 7, u, 0.3, pink, 2.0, 0, 0.5, i * 0.25, L))
  a.cyl(0, 44, 2.6, 0.9, 2.6, '#161a2c')
  a.sweeper(0, 44, 0.6, 10.4, 2.2, 0, pink, { kill: true, r: 0.22 })
  a.cyl(0, 62, 2.6, 0.9, 2.6, '#161a2c')
  a.sweeper(0, 62, 0.6, 10.4, -2.6, 0, pink, { kill: true, r: 0.22 })
  a.cyl(0, 80, 2.6, 0.9, 2.6, '#161a2c')
  a.sweeper(0, 80, 0.6, 10.4, 1.8, 0, pink, { kill: true, r: 0.22 })
  a.sweeper(0, 80, 0.6, 10.4, 1.8, Math.PI / 2, pink, { kill: true, r: 0.22 })
  ;[96, 102, 108].forEach((u, i) => a.mover(0, 11, 7, 7, u, 0.4, pink, 0, 5.6, 2.4, i * 0.33, L))
  ;[122, 128, 134].forEach((u, i) => a.mover(0, 21.6, 0.6, 0.25, u, 0.25, C.neonCyan, 2, 2.6, 2.0, i * 0.3, L))
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const setB = (row + col) % 2 === 1
      a.blink(-9.3 + col * 3.1, 3.0, 0.09, 0.08, 146 + row * 3.1, 3.0, pink, 2.2, 0, 0.45, setB ? 0.5 : 0, { ...L, floorLaser: true })
    }
  }
  a.endRoom(fl)
}

/* ---- Stage 19: Spinning Lava Wheels - turntables and fire arms over lava ---- */
function stage19(a) {
  const { r } = a
  a.slab(0, a.W, 0, 10, 0, C.basalt, 6)
  a.entrance()
  a.bounds()
  a.waterPlane(-1.6, C.lava, 'lava')
  a.cliffs({ gap: 5, base: -3, height: 0.9, trees: false })
  a.sign('Ride the wheels - mind the fire!', 0, 3.8, 9, 0.9, 'warn')
  let u = 10
  let i = 0
  while (u < 128) {
    const rad = 4.4 + r() * 1.4
    u += rad + 2.2
    const x = (r() - 0.5) * 7
    const spd = (i % 2 ? -1 : 1) * (0.8 + r() * 0.6)
    a.dyn('disk', { x: a.X(x), z: a.Z(u), top: 0, r: rad, h: 1.2, spd, c: i % 2 ? '#ff8a1a' : '#5a4650' })
    if (i % 2 === 1) a.sweeper(x, u, 0.65, rad - 0.4, spd * 2.4, 0, C.lava, { kill: true, fire: true })
    u += rad
    if (i % 3 === 2) {
      a.slab(x * 0.5, 4, u + 0.6, 2.4, 0, C.basalt, 6)
      u += 3
    }
    i += 1
  }
  a.slab(0, a.W, u + 2.2, 160 - u - 2.2, 0, C.basalt, 6)
  a.endRoom(C.basalt)
  for (const [x, uu] of [[-15, 30], [15, 70], [-15, 110]]) a.prop('firePillar', x, -1.6, uu)
}

/* ---- Stage 20: Great Capybara Escape - outrun a huge tsunami to the Golden Temple ---- */
function stage20(a) {
  const { S } = a
  a.island(0, a.W, 0, 14)
  a.entrance()
  a.bounds(60)
  a.waterPlane()
  a.cliffs({ gap: 3, height: 1.6 })
  a.sign('THE FINAL ESCAPE - RUN FOR THE HILLS!', 0, 4, 12, 1.1, 'warn')
  for (let i = 0; i < 12; i += 1) {
    const top = 0.35 * (i + 1)
    a.blk(0, a.W - 6, top, 0.35, 14 + i * 3, 3, C.grass)
    a.blk(0, a.W - 6.2, top - 0.35, top + 9.6, 14 + i * 3, 3, C.dirt)
  }
  a.island(0, a.W - 4, 50, 20, 4.2, 14)
  for (const u of [56, 64]) a.blk(0, a.W - 8, 5.0, 0.8, u, 1, C.wood)
  a.blk(0, 12, 4.2, 1.2, 70, 30, '#9aa0b4')
  a.sweeper(0, 79, 4.95, 7.4, 1.9, 0, C.wood)
  a.sweeper(0, 91, 4.95, 7.4, -2.2, 0.4, C.wood)
  a.island(0, a.W - 4, 100, 14, 4.2, 14)
  for (let i = 0; i < 4; i += 1) a.mover(i % 2 ? 3 : -3, 8, 3.6, 1, 116 + i * 6, 5, i % 2 ? C.stoneLight : C.stone, 1, 1.2, 3.2, i * 0.25)
  a.island(0, a.W - 4, 140, 14, 4.2, 14)
  for (let i = 0; i < 10; i += 1) {
    const top = 4.2 + 0.5 * (i + 1)
    a.blk(0, a.W - 6, top, 0.5, 154 + i * 2, 2, C.grass)
    a.blk(0, a.W - 6.2, top - 0.5, top + 9.5, 154 + i * 2, 2, C.dirt)
  }
  a.island(0, a.W, 174, S.len - 174, 9.2, 20)
  a.endRoom(C.grass, 9.2, 16)
  S.wave = { triggerU: 22, startU: 6, delay: 1.2, speed: 9.2, stopU: 172, height: 24, color: '#3fe8ff' }
  // The Golden Temple: you made it!
  a.prop('temple', 0, 9.2, S.len - 2)
  a.prop('goldenCapy', 5.5, 9.2, S.len - 7, { s: 2.6 })
  a.prop('teleporter', 4, 9.2, S.len - 12, { to: 'lobby' })
  a.sign('YOU ESCAPED! Legendary capybara!', 0, 13.4, S.len - 20, 1.0, 'gold')
}

/* ------------------------------------------------------------------ */
/* Lobby                                                               */
/* ------------------------------------------------------------------ */

function createLobby() {
  const H = LOBBY_HALF
  const MZ = LOBBY_MAX_Z
  const r = rng(104729 + 7)
  const L = {
    world: 1,
    cx: 0,
    boxes: [],
    signs: [],
    props: [],
    rocks: [],
    trees: [],
    flowers: [],
    planes: [],
    pedestals: [],
    treads: [],
    wheel: null,
    boards: [],
    spawn: { x: 0, y: 1.3, z: 16, yaw: Math.PI },
    bounds: { halfWidth: H, minZ: COURSE_Z, maxZ: MZ },
    theme: THEMES.lobby,
    themeId: 'lobby',
  }
  const box = (x, y, z, w, h, d, c, m = 'stud', k = 'solid', extra = null) => {
    const b = { x, y, z, w, h, d, c, m, k }
    if (extra) Object.assign(b, extra)
    L.boxes.push(b)
    return b
  }
  const midZ = (COURSE_Z + MZ) / 2
  const depth = MZ - COURSE_Z
  // Salmon tile floor over a purple brick cliff body (the back edge is Stage 1's gate).
  box(0, -1, midZ, H * 2 + 4, 2, depth, C.salmon)
  box(0, -6.9, midZ, H * 2 + 3.6, 10, depth - 0.4, C.jungleBrickDark, 'brick', 'deco')
  // Grass borders along the walls.
  for (const s of [-1, 1]) box(s * (H - 3.5), 0.05, midZ + 1, 7, 0.1, depth - 2, C.grass, 'stud', 'deco')
  box(0, 0.05, MZ - 3.5, H * 2 - 14, 0.1, 7, C.grass, 'stud', 'deco')

  // ---- Jungle walls: purple-blue brick, mossy tops dripping down -------------
  const WH = 7
  const wall = (x, z, w, d) => {
    box(x, WH / 2 - 1, z, w, WH + 2, d, C.jungleBrick, 'brick')
    box(x, WH + 0.35, z, w + 0.3, 0.7, d + 0.3, C.moss, 'stud', 'deco')
  }
  wall(-H - 1, midZ, 2, depth + 2)
  wall(H + 1, midZ, 2, depth + 2)
  wall(0, MZ + 1, H * 2 + 4, 2)
  // Moss drips on the inner faces.
  for (let z = COURSE_Z + 2; z < MZ - 1; z += 1.4 + r() * 1.8) {
    for (const s of [-1, 1]) {
      const dh = 0.6 + r() * 2.4
      box(s * (H - 0.06), WH - dh / 2 + 0.1, z, 0.12, dh, 0.6 + r() * 1.2, r() < 0.5 ? C.moss : C.mossDark, 'stud', 'deco')
    }
  }
  for (let x = -H + 1; x < H - 1; x += 1.4 + r() * 1.8) {
    const dh = 0.6 + r() * 2.4
    box(x, WH - dh / 2 + 0.1, MZ - 0.06, 0.6 + r() * 1.2, dh, 0.12, r() < 0.5 ? C.moss : C.mossDark, 'stud', 'deco')
  }
  // Nobody jumps out.
  for (const s of [-1, 1]) box(s * (H + 1), 30, midZ, 2, 40, depth + 2, '#000', 'invisible')
  box(0, 30, MZ + 1, H * 2 + 4, 40, 2, '#000', 'invisible')

  // ---- Spawn pyramid: dark slate tiers with a glowing white top ---------------
  box(0, 0.2, 16, 11, 0.4, 11, '#5a5f8f')
  box(0, 0.6, 16, 8.6, 0.4, 8.6, '#767cb4')
  box(0, 1.0, 16, 6.2, 0.4, 6.2, '#9aa0d8')
  box(0, 1.25, 16, 5, 0.1, 5, '#ffffff', 'neon', 'deco')
  // Glowing floor chevrons: spawn -> stage gate (they pulse towards the stages).
  L.props.push({ type: 'arrows', from: [0, 9.6], to: [0, COURSE_Z + 1.5], y: 0.06, w: 3.4, gap: 2.8, color: '#fff4d6' })
  L.props.push({ type: 'arrows', from: [-6, -4], to: [-15, -6.8], y: 0.06, w: 2, gap: 2.6, color: '#ffe14a' })
  L.props.push({ type: 'arrows', from: [6, -4], to: [15, -12], y: 0.06, w: 2, gap: 2.6, color: '#ffe14a' })

  // ---- Welcome gate: a wooden jungle arch over the path (no rainbows here) ----
  L.props.push({ type: 'welcome', x: 0, y: 0, z: -24 })
  for (const s of [-1, 1]) box(s * 5.8, 4.6, -24, 1.3, 9.2, 1.3, '#000', 'invisible')

  // ---- Capybara terraces (left): two tiers of pads, like a little stadium ------
  const CX = -22.6
  box(CX, 0.25, -13, 31, 0.5, 7, C.jungleBrickDark, 'brick')
  box(CX, 0.525, -17, 31, 1.05, 1, C.jungleBrickDark, 'brick')
  box(CX, 0.8, -21.5, 31, 1.6, 8, C.jungleBrickDark, 'brick')
  box(CX, 0.51, -13, 30.4, 0.02, 6.4, C.jungleBrick, 'stud', 'deco')
  box(CX, 1.61, -21.5, 30.4, 0.02, 7.4, C.jungleBrick, 'stud', 'deco')
  // A little stream in front of the terraces.
  L.planes.push({ kind: 'water', y: 0.04, x: CX, z: -8.6, w: 31, d: 1.6, c: C.water })
  const capys = CAPYS.filter((d) => !d.wheel)
  capys.forEach((d, i) => {
    const row = i < 7 ? 0 : 1
    const col = i % 7
    const x = CX - 13 + col * 4.33
    L.pedestals.push({ id: d.id, x, y: row ? 1.6 : 0.5, z: row ? -21.5 : -13, ry: 0 })
  })
  L.signs.push({ text: 'Capybaras', x: CX, y: 9.4, z: COURSE_Z + 1.2, ry: 0, size: 2.6, kind: 'stage' })
  L.signs.push({ text: 'Each one boosts your Speed per Step!', x: CX, y: 7.5, z: COURSE_Z + 1.2, ry: 0, size: 0.9, kind: 'gold' })
  L.props.push({ type: 'board', x: CX, y: 8.4, z: COURSE_Z + 0.9, w: 26, h: 4.6 })

  // ---- Treadmills (right) -------------------------------------------------------
  const TX = 22.5
  TREADMILLS.forEach((t, i) => {
    const x = TX - 13 + i * 5.2
    const z = -18
    L.treads.push({ id: t.id, x, z, w: 3.4, l: 7, top: 0.42 })
    box(x, 0.2, z, 4.4, 0.4, 8, '#2b2f3a', 'smooth')
  })
  L.signs.push({ text: 'Treadmills', x: TX, y: 9.4, z: COURSE_Z + 1.2, ry: 0, size: 2.6, kind: 'stage' })
  L.signs.push({ text: 'Stand on one to earn Steps!', x: TX, y: 7.5, z: COURSE_Z + 1.2, ry: 0, size: 0.9, kind: 'gold' })
  L.props.push({ type: 'board', x: TX, y: 8.4, z: COURSE_Z + 0.9, w: 26, h: 4.6 })
  L.props.push({ type: 'hintArrow', x: TX - 13, y: 4.6, z: -18, tread: 't1' })

  // ---- Lucky wheel + the Lucky Capy on display (left wall) --------------------------
  L.wheel = { x: -H + 3, y: 0, z: 12, ry: Math.PI / 2 }
  box(-H + 3, 0.15, 12, 4, 0.3, 9, C.salmonDark)
  const lucky = CAPYS.find((d) => d.wheel)
  L.pedestals.push({ id: lucky.id, x: -H + 3.5, y: 0.6, z: 23, ry: Math.PI / 2, display: true })
  box(-H + 3.5, 0.3, 23, 3.6, 0.6, 3.6, C.jungleBrickDark, 'brick')
  L.props.push({ type: 'chest', x: -H + 4.5, y: 0, z: 2, ry: Math.PI / 2 })

  // ---- Leaderboards behind the spawn, facing it -----------------------------------
  ;['wins', 'level', 'rebirths'].forEach((kind, i) => {
    L.boards.push({ kind, x: (i - 1) * 11, y: 0, z: MZ - 2.5, ry: Math.PI })
  })

  // ---- Decorations (visual only) --------------------------------------------
  for (const sd of [-1, 1]) {
    for (let z = -2; z > COURSE_Z + 4; z -= 12) L.props.push({ type: 'lamp', x: sd * 5, y: 0, z })
    L.props.push({ type: 'lamp', x: sd * 8, y: 0, z: 27 })
  }
  for (const [x, z] of [[-34, 33], [34, 33], [-35, -1], [35, 6], [35, 20], [-20, 33], [20, 33]]) {
    L.props.push({ type: 'bush', x: x + (r() - 0.5) * 2, y: 0, z: z + (r() - 0.5) * 2, s: 1 + r() * 0.5, c: Math.floor(r() * 3) })
  }
  // Palms inside the lobby corners (solid trunks).
  for (const [x, z] of [[-35.5, 31.5], [35.5, 31.5], [-35.5, -4], [35.5, -3], [30, 31.5], [-30, 31.5]]) {
    L.trees.push({ x, y: 0, z, s: 1 + r() * 0.4, c: Math.floor(r() * 3), solid: true })
  }
  for (let i = 0; i < 70; i += 1) {
    const side = r() < 0.5 ? -1 : 1
    const onBack = r() < 0.3
    const x = onBack ? (r() - 0.5) * (H * 2 - 18) : side * (H - 1 - r() * 5.5)
    const z = onBack ? MZ - 1 - r() * 5.5 : COURSE_Z + 2 + r() * (depth - 6)
    if (!onBack && z < -6 && z > COURSE_Z) continue
    L.flowers.push({ x, z, c: Math.floor(r() * 4) })
  }

  // ---- Jungle outside the walls: brick cliffs with palms on top ---------------
  const ring = []
  for (let x = -H - 4; x <= H + 4; x += 10) ring.push([x, MZ + 10 + r() * 4])
  for (let z = COURSE_Z + 4; z <= MZ + 6; z += 10) {
    ring.push([-H - 10 - r() * 4, z])
    ring.push([H + 10 + r() * 4, z])
  }
  for (let x = -H - 6; x <= H + 6; x += 12) if (Math.abs(x) > 14) ring.push([x, COURSE_Z - 26 - r() * 6])
  for (const [x, z] of ring) {
    const backdrop = z < COURSE_Z - 5
    const s = backdrop ? 5 + r() * 3 : 9 + r() * 5
    L.rocks.push({ x, y: -1 + s * 0.3, z, s, ry: r() * 6.28, v: Math.floor(r() * 3) })
    if (r() < 0.75) L.trees.push({ x: x + (r() - 0.5) * 4, y: -1 + s * 1.22, z: z + (r() - 0.5) * 4, s: backdrop ? 0.7 + r() * 0.3 : 1.3 + r() * 1.0, c: Math.floor(r() * 3) })
  }
  return L
}

/* ------------------------------------------------------------------ */
/* Assemble                                                            */
/* ------------------------------------------------------------------ */

export const LOBBY = createLobby()

export const STAGES = [null]
{
  let z = COURSE_Z
  for (let n = 1; n <= STAGE_COUNT; n += 1) {
    const spec = STAGE_SPECS[n]
    const a = createStage(n, 0, z, spec.len, spec)
    spec.build(a)
    STAGES.push(a.S)
    z -= spec.len
  }
}

/**
 * Where a position is: `{ world, stage }` with stage 0 = lobby (there is one world).
 * A stage owns z in (z1, z0].
 */
export function regionAt(x, z) {
  if (z > COURSE_Z) return { world: 1, stage: 0 }
  for (let n = 1; n <= STAGE_COUNT; n += 1) {
    const s = STAGES[n]
    if (z <= s.z0 && z > s.z1) return { world: 1, stage: n }
  }
  return { world: 1, stage: STAGE_COUNT }
}

export const stageSpawn = (n) => STAGES[n].spawn
export const lobbySpawn = () => LOBBY.spawn

/** True when (x, z) is on the stage's wins pad (with a little slack). */
export function onPad(n, x, z, slack = 0.6) {
  const p = STAGES[n]?.pad
  if (!p) return false
  return Math.abs(x - p.x) <= p.w / 2 + slack && Math.abs(z - p.z) <= p.d / 2 + slack
}

/** The treadmill (if any) under (x, z). */
export function treadAt(x, z) {
  for (const t of LOBBY.treads) {
    if (Math.abs(x - t.x) <= t.w / 2 && Math.abs(z - t.z) <= t.l / 2) return t
  }
  return null
}

/** Rough fastest possible clear time (s) for a stage at velocity v - pad anti-cheat. */
export const minStageTime = (n, v) => (STAGES[n].len * 0.75) / Math.max(4, v)
