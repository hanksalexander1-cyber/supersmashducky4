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
export const STAGES = [
  {
    id: 'ducky-dome', name: 'Ducky Dome', tag: 'CLASSIC', width: 960, floorY: 420,
    background: 'assets/stages/kenney-backgrounds/backgroundCastles.png',
    sky: ['#17283c', '#34566a', '#121d2a'], top: '#b8f1ec',
    platforms: [{ x: 250, w: 155, y: 320 }, { x: 555, w: 155, y: 320 }, { x: 205, w: 220, y: 370 }, { x: 535, w: 220, y: 370 }, { x: 370, w: 180, y: 255 }, { x: 90, w: 135, y: 270 }, { x: 735, w: 135, y: 270 }],
  },
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
    id: 'aurora-archipelago', name: 'Aurora Archipelago', tag: 'SKY ISLANDS', width: 1520, floorY: 420,
    background: 'assets/stages/kenney-backgrounds/backgroundForest.png', sky: ['#091d42', '#315c8a', '#101b35'], top: '#8effef',
    platforms: [{ x: 70, w: 330, y: 355 }, { x: 560, w: 330, y: 355 }, { x: 270, w: 420, y: 285 }, { x: 110, w: 210, y: 215 }, { x: 640, w: 210, y: 215 }, { x: 385, w: 190, y: 170 }],
  },
  {
    id: 'battlefield-falls', name: 'Battlefield Falls', tag: 'WATERFALL BRAWL', width: 1120, floorY: 378, playableLeft: 165, playableRight: 850, spawnSpacing: 380,
    background: 'assets/stages/my-photos/battlefield-falls.png', backgroundMode: 'cover', hidePlatforms: true,
    sky: ['#173b58', '#8ac6e5', '#14334a'], top: '#c5efda',
    platforms: [{ x: 70, w: 190, y: 320 }, { x: 600, w: 190, y: 320 }, { x: 300, w: 220, y: 175 }],
  },
  {
    id: 'green-hill-loop', name: 'Green Hill Loop', tag: 'ROLLING HEIGHTS', width: 1360, floorY: 368, playableLeft: 145, playableRight: 890, spawnSpacing: 500,
    background: 'assets/stages/my-photos/green-hill-loop.png', backgroundMode: 'cover', hidePlatforms: true,
    sky: ['#2872bf', '#85cff5', '#225345'], top: '#c4ff74',
    platforms: [{ x: 170, w: 125, y: 155 }, { x: 340, w: 205, y: 105 }, { x: 560, w: 150, y: 205 }, { x: 195, w: 205, y: 250 }, { x: 590, w: 150, y: 265 }],
  },
  {
    id: 'skyworld-lift', name: 'Skyworld Lift', tag: 'FLOATING GARDENS', width: 1200, floorY: 350, playableLeft: 350, playableRight: 625, spawnSpacing: 260,
    background: 'assets/stages/my-photos/skyworld-lift.png', backgroundMode: 'cover', hidePlatforms: true,
    sky: ['#2162a2', '#b3e9ff', '#1b6a76'], top: '#ffe483',
    platforms: [{ x: 185, w: 115, y: 280 }, { x: 350, w: 245, y: 175 }, { x: 650, w: 160, y: 260 }],
  },
  {
    id: 'dream-tree', name: 'Dream Tree', tag: 'TREE TOPS', width: 1440, floorY: 335, playableLeft: 300, playableRight: 680, spawnSpacing: 300,
    background: 'assets/stages/my-photos/dream-tree.png', backgroundMode: 'cover', hidePlatforms: true,
    sky: ['#1684d2', '#a4e7ff', '#165f88'], top: '#fff08a',
    platforms: [{ x: 145, w: 155, y: 470 }, { x: 660, w: 155, y: 470 }],
  },
  {
    id: 'rainbow-story', name: 'Rainbow Story', tag: 'COLORFUL CROSSING', width: 1000, floorY: 310, playableLeft: 285, playableRight: 675, spawnSpacing: 200,
    background: 'assets/stages/my-photos/rainbow-story.png', backgroundMode: 'cover', hidePlatforms: true,
    sky: ['#1676cf', '#8ee3ff', '#174f82'], top: '#ffd965',
    platforms: [],
  },
];

// Keep gameplay tuning values separate from simulation and rendering logic.
export const STAGE_PREVIEW = {
  height: 112,
  topRange: 180,
  topOffset: 250,
  maxTopPercent: 78,
};
export const ARENA = {
  width: 960,
  height: 540,
  floorY: 420,
  blastY: 560,
  blastLeft: -50,
  blastRight: 1010,
  playableLeft: 90,
  playableRight: 870,
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
    blastY: floorY + ARENA.blastY - ARENA.floorY,
    blastLeft: ARENA.blastLeft * horizontalScale,
    blastRight: width + (ARENA.blastRight - ARENA.width) * horizontalScale,
    playableLeft: (stage.playableLeft ?? ARENA.playableLeft) * horizontalScale,
    playableRight: (stage.playableRight ?? ARENA.playableRight) * horizontalScale,
    platforms: stage.platforms.map((platform) => ({
      x: platform.x * horizontalScale,
      w: platform.w * horizontalScale,
      y: platform.y * verticalScale,
    })),
  };
  stageLayoutCache.set(stageId, layout);
  return layout;
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
  damagePercentKnockback: 0.065,
  maxKnockback: 28,
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
  maxActive: 3,
  spawnDelay: 10,
  lifetime: 900,
  pickupRadius: 38,
  gunAmmo: 400,
  gunCooldown: 0.1,
  gunDamage: 13,
  bulletSpeed: 13,
  bombDamage: 18,
  bananaDamage: 9,
  isaacDamage: 18,
  dropForwardOffset: 35,
  dropOwnerLock: 24,
  isaacCooldown: 24,
  isaacProjectileOffset: 52,
  isaacProjectileSpeed: 7,
  isaacProjectileLife: 30,
  isaacProjectileRadius: 28,
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
  catchDistance: 40,
  catchAboveTop: 24,
  catchBelowTop: 30,
  hangOffsetX: 12,
  hangOffsetY: 21,
  regrabDelay: 24,
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
