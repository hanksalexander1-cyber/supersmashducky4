// Shared configuration for the whole game: API and sprite locations, stage
// definitions, colors, controls, and gameplay tuning values. Other modules
// import these constants so settings stay consistent and easy to adjust.
// Configuration
// Keep tuning values and external asset locations together.
export const API_URL = 'https://api.ducks.ects-cmp.com/ducks';
export const SHEETS = {
  back: 'assets/sprites/Duck_Sprites_Back.png',
  front: 'assets/sprites/Duck_Sprites_Front.png',
  normal: 'assets/sprites/Duck_Sprites_Heads_Normal.png',
  derpy: 'assets/sprites/Duck_Sprites_Heads_Derpy.png',
};
export const SPRITE_SHEET = { sourceWidth: 500, cellHeight: 356.25, canvasWidth: 240, canvasHeight: 224, scale: 2 };
export const COLORS = {
  red: '#c81916', green: '#8bee00', yellow: '#f0e88d', purple: '#a000ee',
  blue: '#0845ec', brown: '#683c20', pink: '#f7a4be',
};
export const PLAYER_COLORS = ['#ed5143', '#36b8dc', '#f1b735', '#bd65df'];
export const BATTLE_MODES = [
  { id: 'stock', name: 'Stock', description: '3 lives · respawn after a KO' },
  { id: 'stamina', name: 'Stamina', description: '100 HP · first to 0 is out' },
  { id: 'timed', name: 'Timed', description: '3 minutes · most lives wins' },
];
export const BATTLE_RULES = { startingStocks: 3, staminaHealth: 100, timedDuration: 180 * 60 };
export const MATCH_OPTIONS = {
  stockCounts: [1, 2, 3, 4, 5],
  itemDelays: { off: Number.MAX_SAFE_INTEGER, low: 900, normal: 480, high: 240 },
  hazardCycle: 900,
  hazardDuration: 210,
  hazardPush: 0.075,
  reconnectGraceMs: 60_000,
  spectatorLimit: 4,
  replayFrameInterval: 300,
  maximumSharedPlatforms: 128,
};
export const MAP_EDITOR_ACCESS_SEQUENCE = ['d', 'u', 'c', 'k', 'y', 'm', 'a', 'p'];
export const TEST_DUCK_ACCESS_SEQUENCE = ['t', 'e', 's', 't', 'd', 'u', 'c', 'k', 's'];
export const STAGES = [
  {
    id: 'cloud-steps', name: 'Cloud Steps', tag: 'THREE-TIER', width: 1120, floorY: 425,
    background: 'assets/stages/kenney-backgrounds/backgroundColorGrass.png',
    sky: ['#20344e', '#587f9a', '#172638'], top: '#c7f5ff',
    platforms: [{ x: 155, w: 170, y: 344 }, { x: 395, w: 170, y: 286 }, { x: 635, w: 170, y: 344 }, { x: 110, w: 230, y: 380 }, { x: 365, w: 230, y: 380 }, { x: 620, w: 230, y: 380 }, { x: 245, w: 145, y: 220 }, { x: 570, w: 145, y: 220 }],
  },
  {
    id: 'pond-party', name: 'Pond Party', tag: 'BIG AND BOUNCY', width: 1440, floorY: 410,
    background: 'assets/stages/kenney-backgrounds/backgroundColorForest.png', sky: ['#123e52', '#298b91', '#102d3c'], top: '#b9ffe8',
    platforms: [{ x: 110, w: 300, y: 350 }, { x: 550, w: 300, y: 350 }, { x: 250, w: 260, y: 285 }, { x: 450, w: 260, y: 285 }, { x: 80, w: 170, y: 220 }, { x: 710, w: 170, y: 220 }],
  },
  {
    id: 'ects-arena', name: 'ECTS Arena', tag: 'FLOATING CLASSROOM', width: 1200, floorY: 350,
    background: 'assets/stages/ects-arena.svg', backgroundMode: 'cover', hidePlatforms: true,
    sky: ['#46265b', '#754b96', '#211c3a'], top: '#f3a6ff',
    platforms: [
      { x: 110, w: 180, y: 205 }, { x: 670, w: 180, y: 205 },
      { x: 345, w: 270, y: 245 }, { x: 120, w: 220, y: 330 }, { x: 620, w: 220, y: 330 },
    ],
  },
  {
    id: 'green-hill-loop', name: 'Green Hill Loop', tag: 'ROLLING HEIGHTS', width: 1360, floorY: 397.6774193548387, playableLeft: 145, playableRight: 901.1, spawnSpacing: 500,
    background: 'assets/stages/my-photos/green-hill-loop.png', backgroundMode: 'cover', hidePlatforms: true,
    sky: ['#2872bf', '#85cff5', '#225345'], top: '#c4ff74',
    platforms: [
      { x: 209.7, w: 75.8, y: 285, solid: false },
      { x: 485.6, w: 191.8, y: 270.3, solid: false },
      { x: 373.7, w: 174.9, y: 118.6, solid: false },
      { x: 382.8, w: 111.5, y: 277.4, solid: false },
      { x: 171.9, w: 216.9, y: 265.2, solid: false },
      { x: 697.5, w: 223.4, y: 281.8, solid: false },
    ],
  },
  {
    id: 'skyworld-lift', name: 'Skyworld Lift', tag: 'FLOATING GARDENS', width: 1200, floorY: 381.53681436336683, playableLeft: 196.5, playableRight: 766.2, spawnSpacing: 260,
    background: 'assets/stages/my-photos/skyworld-lift.png', backgroundMode: 'cover', hidePlatforms: true,
    sky: ['#2162a2', '#b3e9ff', '#1b6a76'], top: '#ffe483',
    platforms: [
      { x: 193.4, w: 572.1, y: 421.7, solid: false },
      { x: 269.6, w: 122.6, y: 317.7, solid: false },
      { x: 567.1, w: 119.1, y: 312.7, solid: false },
      { x: 418, w: 130.3, y: 229.3, solid: false },
    ],
  },
  {
    id: 'dream-tree', name: 'Dream Tree', tag: 'TREE TOPS', width: 1440, floorY: 367.3244781783681, playableLeft: 277.5, playableRight: 664.1, spawnSpacing: 300,
    background: 'assets/stages/my-photos/dream-tree.png', backgroundMode: 'cover', hidePlatforms: true,
    sky: ['#1684d2', '#a4e7ff', '#165f88'], top: '#fff08a',
    platforms: [
      { x: 19.1, w: 161.8, y: 453.9, solid: false },
      { x: 756.4, w: 170.9, y: 450.8, solid: false },
      { x: 692.3, w: 74.5, y: 329.1, solid: false },
      { x: 179.5, w: 33.5, y: 302.7, solid: false },
      { x: 213.2, w: 32.6, y: 351.1, solid: false },
      { x: 665.9, w: 32, y: 380.7, solid: false },
      { x: 271.5, w: 141.9, y: 321.4, solid: false },
      { x: 532, w: 143.7, y: 321.4, solid: false },
    ],
  },
  {
    id: 'rainbow-story', name: 'Rainbow Story', tag: 'COLORFUL CROSSING', width: 1000, floorY: 421.00642398286936, playableLeft: 48.5, playableRight: 906.9, spawnSpacing: 200,
    background: 'assets/stages/my-photos/rainbow-story.png', backgroundMode: 'cover', hidePlatforms: true,
    sky: ['#1676cf', '#8ee3ff', '#174f82'], top: '#ffd965',
    platforms: [
      { x: 154.1, w: 227.4, y: 311.5, solid: false },
      { x: 282.5, w: 208.3, y: 215.9, solid: false },
      { x: 593.1, w: 212, y: 276.5, solid: false },
    ],
  },
];

// Keep gameplay tuning values separate from simulation and rendering logic.
export const STAGE_PREVIEW = {
  height: 112,
  topRange: 180,
  topOffset: 250,
  maxTopPercent: 78,
};
export const EDITOR_KILL_FLOOR_MAX = 700;
export const ARENA = {
  width: 960,
  height: 540,
  floorY: 420,
  blastTop: -100,
  blastY: 560,
  blastLeft: -50,
  blastRight: 1010,
  playableLeft: 90,
  playableRight: 870,
};
export const CAMERA = {
  zoomOutMargin: 240,
  minimumZoom: 0.65,
  smoothing: 0.08,
};
const stageLayoutCache = new Map();
export function getStageLayout(stageId) {
  if (stageLayoutCache.has(stageId)) return stageLayoutCache.get(stageId);
  const stage = STAGES.find((candidate) => candidate.id === stageId) || STAGES[0];
  const width = stage.width || ARENA.width;
  const horizontalScale = width / ARENA.width;
  const floorY = stage.floorY || ARENA.floorY;
  const verticalScale = floorY / ARENA.floorY;
  const layout = {
    ...stage,
    width,
    floorY,
    blastTop: ARENA.blastTop * verticalScale,
    blastY: stage.blastY ?? floorY + ARENA.blastY - ARENA.floorY,
    blastLeft: ARENA.blastLeft * horizontalScale,
    blastRight: width + (ARENA.blastRight - ARENA.width) * horizontalScale,
    playableLeft: (stage.playableLeft ?? ARENA.playableLeft) * horizontalScale,
    playableRight: (stage.playableRight ?? ARENA.playableRight) * horizontalScale,
    platforms: stage.platforms.map((platform) => ({
      x: platform.x * horizontalScale,
      w: platform.w * horizontalScale,
      y: platform.y * verticalScale,
      solid: !!platform.solid,
    })),
  };
  stageLayoutCache.set(stageId, layout);
  return layout;
}
export function setStagePlatforms(stageId, platforms) {
  const stage = STAGES.find((candidate) => candidate.id === stageId);
  if (!stage) return;
  stage.platforms = platforms.map(({ x, w, y, solid }) => ({ x, w, y, solid: !!solid }));
  stageLayoutCache.delete(stageId);
}
export function setStageGround(stageId, ground) {
  const stage = STAGES.find((candidate) => candidate.id === stageId);
  if (!stage) return;
  stage.floorY = ground.floorY;
  stage.blastY = ground.blastY ?? ground.floorY + ARENA.blastY - ARENA.floorY;
  stage.playableLeft = ground.playableLeft;
  stage.playableRight = ground.playableRight;
  stageLayoutCache.delete(stageId);
}
export const SPAWN_PLATFORM = {
  width: 112,
  spawnSpacing: 580,
  startY: 92,
  fallSpeed: 1.55,
  duration: 90,
  invulnerability: 108,
  jumpVelocity: -11.7,
};
export const PHYSICS = {
  gravity: 0.48,
  jumpVelocities: [0, -11.7, -11.1, -13.4],
  maxJumps: 3,
  fallControl: 0.18,
  groundAcceleration: 0.34,
  airAcceleration: 0.2,
  groundFriction: 0.82,
  airFriction: 0.96,
  baseRunSpeed: 4.4,
  focusRunBonus: 1.2,
};
export const COMBAT = {
  baseKnockback: 4,
  attackDamageKnockback: 0.5,
  damagePercentKnockback: 0.1,
  maxKnockback: 28,
  maximumDamagePercent: 999,
  horizontalLaunchScale: 0.38,
  maxHorizontalLaunchBonus: 12,
  upwardLaunchScale: 0.22,
  maxUpwardLaunchBonus: 9,
  downwardLaunchScale: 0.32,
  maxDownwardLaunchBonus: 8,
  jabRange: 46,
  smashRange: 66,
  attackOriginOffset: 24,
  attackOriginYOffset: -8,
  projectileHitWidth: 26,
  projectileHitHeight: 28,
  jabHitHeight: 58,
  targetHalfWidth: 30,
  targetHalfHeight: 30,
  upHitTop: -104,
  upHitBottom: 44,
  downHitTop: -32,
  downHitBottom: 86,
  jabLunge: 0.45,
  smashLunge: 1.2,
  smashActiveLunge: 4.5,
  sideRingOutShake: 22,
  finalRingOutShake: 30,
  // Covers the ~90 ms input update interval used by online players.
  activeFrames: 8,
};
export const ITEMS = {
  maxActive: 2,
  spawnDelay: 480,
  lifetime: 900,
  pickupRadius: 38,
  gunAmmo: 10,
  gunCooldown: 1,
  gunDamage: 11,
  bulletSpeed: 12,
  bombDamage: 15,
  bananaDamage: 8,
  isaacDamage: 15,
  isaacSpeed: 9,
  isaacProjectileLife: 54,
  isaacProjectileRadius: 11,
  springJumpVelocity: 13.5,
  springForwardBoost: 2,
  gustSpeedBonus: 1.8,
  gustBoostDuration: 480,
  starInvulnerability: 200,
  heartHealing: 25,
  shieldRestoration: 35,
  dropForwardOffset: 35,
  dropOwnerLock: 24,
  aimedItemCooldown: 24,
};
export const SPECIAL = {
  focusGain: 4,
  focusStatGain: 0.14,
  focusCosts: [45, 70, 95],
  projectilePowers: [8, 12, 17],
  projectileRadii: [14, 19, 25],
  cooldown: 96,
  groundWaveSpeed: 6,
  upwardBoost: 7,
  upwardProjectileSpeed: 8,
  upwardProjectileLife: 48,
  downwardProjectileSpeed: 7,
  downwardProjectileLife: 30,
  groundWaveLife: 54,
};
export const KO_EFFECT = {
  lifetime: 52,
  blastRadius: 218,
  startingRadius: 28,
  startingBeamLength: 240,
  growingBeamLength: 240,
  beamHalfHeight: 34,
  beamShadow: 45,
  outerRingScale: 0.88,
  outerRingWidth: 15,
  innerRingScale: 0.54,
  innerRingWidth: 7,
};
export const LEDGE = {
  catchDistance: 12,
  catchAboveTop: 8,
  catchBelowTop: 12,
  hangOffsetX: 12,
  hangOffsetY: 21,
  regrabDelay: 42,
  dropSpeed: 4,
  recoverySpeed: -10.5,
  recoveryInwardSpeed: 4.1,
  releaseInvulnerability: 16,
};
export const PLATFORM_DROP = {
  duration: 18,
  initialSpeed: 2.5,
};
export const TIMING = {
  inputSendIntervalMs: 90,
  snapshotIntervalMs: 55,
  cinematicSnapshotIntervalMs: 45,
  hudRefreshIntervalMs: 110,
};
export const DEFAULT_CONTROLS = {
  left: 'a', right: 'd', up: 'w', down: 's', jump: 'Space',
  attack: 'j', smash: 'i', special: 'k', dropItem: 'q', shield: 'l',
};
export const CONTROL_LABELS = {
  left: 'Move / side attack left', right: 'Move / side attack right',
  up: 'Up / up attack', down: 'Down / drop through platform / down attack', jump: 'Jump / triple jump',
  attack: 'Jab / aerial / use held item', smash: 'Smash attack', special: 'Focus special / Final Smash',
  dropItem: 'Drop held item without using it', shield: 'Shield',
};
