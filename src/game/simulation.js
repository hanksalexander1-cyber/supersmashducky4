// Authoritative game rules and frame-by-frame state updates: fighter movement,
// attacks, damage and knockback, platforms and ledges, Smash Ball effects,
// respawns, and match outcomes. It updates runtime data without drawing UI.
import { COLORS, COMBAT, ITEMS, KO_EFFECT, LEDGE, PHYSICS, PLATFORM_DROP, SPECIAL, SPAWN_PLATFORM, getStageLayout } from '../config.js';

export function createGameSimulation(runtime, emptyInput) {
function createFighter(player, index, playerCount, stageLayout) {
  const duck = runtime.ducks.find((candidate) => candidate.id === player.duckId);
  const spawnSpan = Math.min(stageLayout.width * 0.6, stageLayout.spawnSpacing || SPAWN_PLATFORM.spawnSpacing);
  const spawnX = stageLayout.width / 2 - spawnSpan / 2 + index * spawnSpan / Math.max(1, playerCount - 1);
  return {
    id: player.id,
    slot: player.slot,
    spawnX,
    name: player.name,
    duckId: player.duckId,
    color: player.color,
    x: spawnX,
    y: SPAWN_PLATFORM.startY - 38,
    vx: 0,
    vy: 0,
    damage: 0,
    stocks: 67,
    focus: 0,
    guard: 100,
    facing: index % 2 ? -1 : 1,
    grounded: true,
    groundedPlatformY: null,
    dropThroughPlatformY: null,
    dropThroughTimer: 0,
    downHeld: false,
    attackCooldown: 0,
    specialCooldown: 0,
    respawn: 0,
    spawnPlatformY: SPAWN_PLATFORM.startY,
    spawnPlatformTimer: SPAWN_PLATFORM.duration,
    invuln: SPAWN_PLATFORM.invulnerability,
    eliminated: false,
    ultimateReady: false,
    attackTimer: 0,
    attackDuration: 1,
    attackType: '',
    attackWarmup: 0,
    attackActiveTimer: 0,
    attackHitIds: [],
    attackHitSmashBall: false,
    attackLungeApplied: false,
    weapon: null,
    weaponCooldown: 0,
    ledgeGrabbed: false,
    ledgeSide: 0,
    ledgeRegrabCooldown: 0,
    attackHeld: false,
    smashHeld: false,
    specialHeld: false,
    dropItemHeld: false,
    comboStep: 0,
    comboWindow: 0,
    walkPhase: 0,
    landSquash: 0,
    jumpCount: 0,
    jumpPose: 0,
    jumpStyle: 0,
    hitstun: 0,
    flash: 0,
    stats: {
      strength: Number(duck?.stats.strength) || 0,
      health: Number(duck?.stats.health) || 0,
      focus: Number(duck?.stats.focus) || 0,
    },
  };
}
function createMatch(activePlayers, stageId) {
  const stageLayout = getStageLayout(stageId);
  const inputs = Object.fromEntries(activePlayers.map((player) => [player.id, emptyInput()]));
  return {
    active: true,
    stageId,
    stageLayout,
    entities: activePlayers.map((player, index) => createFighter(player, index, activePlayers.length, stageLayout)),
    inputs,
    projectiles: [],
    items: [],
    itemSpawnIn: ITEMS.spawnDelay,
    elapsedTime: 0,
    koEffects: [],
    smashBall: null,
    smashSpawnIn: 900,
    cinematic: null,
    winnerId: null,
    finished: false,
    particles: [],
    shake: 0,
  };
}

function removeDisconnectedFighter(playerId) {
  const fighter = runtime.game.entities.find((candidate) => candidate.id === playerId);
  if (fighter) {
    fighter.stocks = 0;
    fighter.eliminated = true;
  }
  runtime.game.inputs[playerId] = emptyInput();
}

function spawnParticles(x,y,color,count=9) {
    for(let i=0;i<count;i++) {
      const angle=Math.random()*Math.PI*2,speed=1+Math.random()*5;runtime.game.particles.push( {
        x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-1,life:24+Math.random()*16,max:40,color,size:2+Math.random()*4
      })
    }
}
  
function applyHit(attacker,target,power,special=false,vertical='') {
  const resistance = 1 - Math.min(0.42, target.stats.health * 0.03);
  if (target.guard > 0 && runtime.game.inputs[target.id]?.shield) {
    applyGuardHit(attacker, target, special);
    return;
  }

  const damage = power + attacker.stats.strength * (special ? 0.65 : 0.38);
  target.damage += damage;
  const knockback = Math.min(COMBAT.maxKnockback, COMBAT.baseKnockback
    + damage * COMBAT.attackDamageKnockback
    + target.damage * COMBAT.damagePercentKnockback);

  target.vx = (vertical
    ? attacker.facing * 2
    : attacker.facing * knockback) * resistance;
  target.vy = getHitLaunchVelocity(vertical, knockback) * resistance;
  target.grounded = false;
  target.groundedPlatformY = null;
  target.hitstun = 14 + Math.min(30, target.damage * 0.22);
  target.invuln = 11;
  target.flash = 14;
  attacker.focus = Math.min(100, attacker.focus + SPECIAL.focusGain + attacker.stats.focus * SPECIAL.focusStatGain);
  if (target.ledgeGrabbed) releaseFighterFromLedge(target);
  const impactIntensity = Math.min(1, damage / 20);
  spawnParticles(target.x, target.y, special ? '#ffcf5d' : '#fff3c4', Math.round(16 + impactIntensity * 18));
  runtime.game.shake = Math.max(runtime.game.shake, (special ? 13 : 7) + impactIntensity * 7);
}

function getHitLaunchVelocity(vertical, knockback) {
  if (vertical === 'up') {
    return -10 - Math.min(
      COMBAT.maxUpwardLaunchBonus,
      knockback * COMBAT.upwardLaunchScale,
    );
  }
  if (vertical === 'down') {
    return 5 + Math.min(
      COMBAT.maxDownwardLaunchBonus,
      knockback * COMBAT.downwardLaunchScale,
    );
  }
  return -4 - Math.min(
    COMBAT.maxHorizontalLaunchBonus,
    knockback * COMBAT.horizontalLaunchScale,
  );
}

function applyGuardHit(attacker, target, special) {
  target.guard = Math.max(0, target.guard - (special ? 35 : 24));
  target.vx = attacker.facing * (special ? 2.5 : 1.2);
  target.vy = special ? -2 : 0;
  target.flash = 5;
  spawnParticles(target.x, target.y, '#9be9ff', 8);
  if (target.guard !== 0) return;

  target.hitstun = 48;
  runtime.game.shake = 9;
  if (!target.ledgeGrabbed) return;
  releaseFighterFromLedge(target);
  target.vx = attacker.facing * 3.2;
  target.vy = -2;
}
  
function hitSmashBall(attacker,type,range) {
    const ball=runtime.game.smashBall;if(!ball||attacker.ultimateReady||attacker.attackHitSmashBall)return false;const dx=ball.x-attacker.x,dy=ball.y-attacker.y,vertical=type.includes('up')?'up':type.includes('down')?'down':'';const hit=type==='projectile'?Math.abs(dx)<range+ball.radius&&Math.abs(dy)<range+ball.radius:vertical==='up'?Math.abs(dx)<range&&dy>-145&&dy<50:vertical==='down'?Math.abs(dx)<range&&dy>-35&&dy<115:dx*attacker.facing>0&&Math.abs(dx)<range&&Math.abs(dy)<80;if(!hit)return false;attacker.attackHitSmashBall=true;ball.hp--;spawnParticles(ball.x,ball.y,ball.color,11);runtime.game.shake=Math.max(runtime.game.shake,4);if(ball.hp<=0) {
      runtime.game.smashBall=null;runtime.game.smashSpawnIn=720;attacker.ultimateReady=true;runtime.pendingGameEvents.push({ type: 'smash-ball-claimed', playerName: attacker.name })
    }
    return true
  }
  
function hitWithMove(attacker,type,power,range) {
  const attackRange = range;
  const vertical = type.includes('up') ? 'up' : type.includes('down') ? 'down' : '';
  hitSmashBall(attacker, type, attackRange);

  for (const target of runtime.game.entities) {
    if (target.id === attacker.id || attacker.attackHitIds.includes(target.id)) continue;
    if (target.eliminated || target.respawn > 0 || target.invuln > 0) continue;
    if (!isTargetInsideAttack(attacker, target, vertical, attackRange)) continue;

    attacker.attackHitIds.push(target.id);
    applyHit(attacker, target, power, false, vertical);
  }
}

function isTargetInsideAttack(attacker, target, vertical, range) {
  // Center the collision area on the visible swing instead of the duck's center.
  const attackOriginX = attacker.x + (vertical ? 0 : attacker.facing * COMBAT.attackOriginOffset);
  const attackOriginY = attacker.y + COMBAT.attackOriginYOffset;
  const distanceX = target.x - attackOriginX;
  const distanceY = target.y - attackOriginY;
  if (attacker.attackType === 'air-neutral') {
    return Math.hypot(distanceX, distanceY) < range + COMBAT.targetHalfWidth;
  }
  const withinReach = Math.abs(distanceX) < range + COMBAT.targetHalfWidth;

  if (vertical === 'up') {
    return withinReach
      && distanceY > COMBAT.upHitTop - COMBAT.targetHalfHeight
      && distanceY < COMBAT.upHitBottom + COMBAT.targetHalfHeight;
  }
  if (vertical === 'down') {
    return withinReach
      && distanceY > COMBAT.downHitTop - COMBAT.targetHalfHeight
      && distanceY < COMBAT.downHitBottom + COMBAT.targetHalfHeight;
  }

  const distanceInFront = distanceX * attacker.facing;
  return distanceInFront > -COMBAT.attackOriginOffset - COMBAT.targetHalfWidth
    && distanceInFront < range + COMBAT.targetHalfWidth
    && Math.abs(distanceY) < COMBAT.jabHitHeight + COMBAT.targetHalfHeight;
}
  
function beginFinalSmash(fighter) {
    fighter.ultimateReady=false;fighter.attackType='final-smash';fighter.attackTimer=220;fighter.attackDuration=220;runtime.game.cinematic= {
      ownerId:fighter.id,timer:0,phase:'intro',hitDone:false,impactX:Math.max(20,Math.min(runtime.game.stageLayout.width-20,fighter.x+fighter.facing*900)),impactY:fighter.y-10,facing:fighter.facing
    };runtime.game.shake=5
  }
  
function updateCinematic(deltaTime) {
  const cutscene = runtime.game.cinematic;
  if (!cutscene) return;

  cutscene.timer += deltaTime;
  cutscene.phase = cutscene.timer < 26 ? 'intro' : cutscene.timer < 112 ? 'reveal' : cutscene.timer < 160 ? 'impact' : 'aftermath';
  const owner = runtime.game.entities.find((fighter) => fighter.id === cutscene.ownerId);
  if (cutscene.timer >= 112 && !cutscene.hitDone && owner) {
    cutscene.hitDone = true;
    cutscene.phase = 'impact';
    runtime.game.shake = 28;
    const originX = owner.x;
    const originY = owner.y - 10;
    const directionX = cutscene.facing * runtime.game.stageLayout.width;
    const beamLength = Math.abs(directionX);

    for (const target of runtime.game.entities) {
      if (target.id === owner.id || target.eliminated || target.respawn > 0 || target.invuln > 0) continue;
      const relativeX = target.x - originX;
      const relativeY = target.y - originY;
      const distanceAlongBeam = relativeX * cutscene.facing;
      const distanceFromBeam = Math.abs(relativeY);
      if (distanceAlongBeam < 0 || distanceAlongBeam > beamLength + 35 || distanceFromBeam > 82) continue;

      const resistance = 1 - Math.min(0.35, target.stats.health * 0.02);
      target.damage += 52 + Math.min(24, owner.stats.strength * 0.8);
      target.vx = cutscene.facing * (17 + Math.min(7, owner.stats.strength * 0.25)) * resistance;
      target.vy = -3;
      target.hitstun = 100;
      target.invuln = 8;
      target.guard = 0;
      target.flash = 22;
      spawnParticles(target.x, target.y, '#fff1a3', 34);
    }

    for (let index = 0; index < 12; index++) {
      spawnParticles(originX + directionX * (index / 11), originY, '#fff1a3', 3);
    }
    runtime.game.particles.push({ x: cutscene.impactX, y: cutscene.impactY, vx: 0, vy: 0, life: 30, max: 30, color: '#ffffff', size: 34 });
    spawnParticles(originX, originY, '#fff1a3', 30);
  }

  if (cutscene.timer >= 220) {
    runtime.game.cinematic = null;
    if (owner) {
      owner.invuln = 100;
      owner.attackType = '';
      owner.attackTimer = 0;
    }
  }
  updateParticles(deltaTime);
  runtime.game.shake = Math.max(0, runtime.game.shake - 0.42);
}
function updateParticles(deltaTime) {
  for (const particle of runtime.game.particles) {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.16;
    particle.vx *= 0.97;
    particle.life -= deltaTime;
  }
  runtime.game.particles = runtime.game.particles.filter((particle) => particle.life > 0);
}

function updateKoEffects(deltaTime) {
  for (const effect of runtime.game.koEffects) effect.life -= deltaTime;
  runtime.game.koEffects = runtime.game.koEffects.filter((effect) => effect.life > 0);
}

function updateItems(deltaTime) {
  const game = runtime.game;
  const stage = game.stageLayout;
  game.itemSpawnIn -= deltaTime;
  if (game.itemSpawnIn <= 0 && game.items.length < ITEMS.maxActive) {
    const itemTypes = ['blaster', 'bomb', 'banana', 'star', 'heart', 'shield', 'isaac'];
    const type = itemTypes[Math.floor(Math.random() * itemTypes.length)];
    game.items.push({ type, x: stage.width * (0.12 + Math.random() * 0.76), y: 105, vy: 0, life: ITEMS.lifetime });
    game.itemSpawnIn = ITEMS.spawnDelay;
  }
  for (const item of [...game.items]) {
    item.ownerLock = Math.max(0, (item.ownerLock || 0) - deltaTime);
    item.vy = Math.min(5, item.vy + 0.14 * deltaTime);
    item.y = Math.min(stage.floorY - 26, item.y + item.vy * deltaTime);
    item.life -= deltaTime;
    const collector = game.entities.find((fighter) => !fighter.eliminated && fighter.respawn <= 0
      && (item.ownerLock <= 0 || fighter.id !== item.ownerId)
      && Math.hypot(fighter.x - item.x, fighter.y - item.y) < ITEMS.pickupRadius);
    if (collector) collectItem(collector, item);
  }
  game.items = game.items.filter((item) => item.life > 0);
}

function collectItem(fighter, item) {
  const itemIndex = runtime.game.items.indexOf(item);
  if (item.type === 'blaster') fighter.weapon = { type: 'blaster', ammo: item.ammo || ITEMS.gunAmmo };
  if (item.type === 'star') fighter.invuln = Math.max(fighter.invuln, 240);
  if (item.type === 'bomb' || item.type === 'banana' || item.type === 'isaac') fighter.weapon = { type: item.type, ammo: item.ammo || 1 };
  if (item.type === 'heart') fighter.damage = Math.max(0, fighter.damage - 35);
  if (item.type === 'shield') fighter.guard = Math.min(100, fighter.guard + 45);
  const colors = { star: '#ffe65a', heart: '#ff6b87', shield: '#83dcff', banana: '#ffe45b', isaac: '#ef7946' };
  spawnParticles(item.x, item.y, colors[item.type] || '#ff9a53', 15);
  if (itemIndex >= 0) runtime.game.items.splice(itemIndex, 1);
}

function dropHeldItem(fighter) {
  const weapon = fighter.weapon;
  if (!weapon) return;
  runtime.game.items.push({
    type: weapon.type,
    ammo: weapon.ammo,
    x: fighter.x + fighter.facing * ITEMS.dropForwardOffset,
    y: fighter.y,
    vy: 0,
    life: ITEMS.lifetime,
    ownerId: fighter.id,
    ownerLock: ITEMS.dropOwnerLock,
  });
  fighter.weapon = null;
  spawnParticles(fighter.x + fighter.facing * ITEMS.dropForwardOffset, fighter.y, '#ffe59c', 8);
}

function fireHeldItem(fighter) {
  const weapon = fighter.weapon;
  if (weapon.type === 'isaac') {
    summonIsaac(fighter);
    weapon.ammo -= 1;
    if (weapon.ammo <= 0) fighter.weapon = null;
    fighter.weaponCooldown = ITEMS.isaacCooldown;
    return;
  }
  const isBlaster = weapon.type === 'blaster';
  const isBomb = weapon.type === 'bomb';
  const kind = isBlaster ? 'bullet' : weapon.type;
  const projectile = {
    ownerId: fighter.id,
    kind,
    x: fighter.x + fighter.facing * (isBlaster ? 38 : 30),
    y: fighter.y - 10,
    vx: fighter.facing * (isBlaster ? ITEMS.bulletSpeed : isBomb ? 5 : 8),
    vy: isBomb ? -3 : isBlaster ? 0 : -1.5,
    life: isBlaster ? 58 : 100,
    radius: isBlaster ? 7 : isBomb ? 22 : 13,
    color: isBlaster ? '#ffe16a' : isBomb ? '#ff6948' : '#ffe45b',
    power: isBlaster ? ITEMS.gunDamage : isBomb ? ITEMS.bombDamage : ITEMS.bananaDamage,
  };
  runtime.game.projectiles.push(projectile);
  spawnParticles(projectile.x, projectile.y, projectile.color, isBomb ? 12 : 6);
  weapon.ammo -= 1;
  fighter.weaponCooldown = isBlaster ? ITEMS.gunCooldown : 20;
  if (weapon.ammo <= 0) fighter.weapon = null;
}

function summonIsaac(fighter) {
  const targets = runtime.game.entities.filter((target) => target.id !== fighter.id
    && !target.eliminated && target.respawn <= 0);
  for (const target of targets) {
    runtime.game.projectiles.push({
      ownerId: fighter.id,
      kind: 'isaac',
      x: target.x,
      y: target.y + ITEMS.isaacProjectileOffset,
      vx: 0,
      vy: -ITEMS.isaacProjectileSpeed,
      life: ITEMS.isaacProjectileLife,
      radius: ITEMS.isaacProjectileRadius,
      color: '#ff7045',
      power: ITEMS.isaacDamage,
    });
    spawnParticles(target.x, target.y + ITEMS.isaacProjectileOffset - 10, '#f9b84b', 12);
  }
}

function updateSmashBall(deltaTime) {
  if (runtime.game.smashBall) {
    const ball = runtime.game.smashBall;
    ball.phase += 0.035 * deltaTime;
    ball.life -= deltaTime;
    ball.x = ball.baseX + Math.sin(ball.phase) * 92;
    ball.y = ball.baseY + Math.sin(ball.phase * 1.7) * 26;
    if (ball.life <= 0) {
      runtime.game.smashBall = null;
      runtime.game.smashSpawnIn = 540;
    }
    return;
  }
  runtime.game.smashSpawnIn -= deltaTime;
  if (runtime.game.smashSpawnIn > 0) return;
  const baseX = runtime.game.stageLayout.width * (0.35 + Math.random() * 0.3);
  runtime.game.smashBall = { x: baseX, y: 210, baseX, baseY: 210, phase: 0, life: 600, hp: 6, maxHp: 6, radius: 24, color: '#ffd85b' };
  runtime.pendingGameEvents.push({ type: 'smash-ball-spawned' });
  spawnParticles(baseX, 210, '#ffd85b', 20);
}

function updateGameSimulation(deltaTime) {
  if (!runtime.isHost || !runtime.game.active || runtime.game.finished) return;
  runtime.game.elapsedTime += deltaTime;
  if (runtime.game.cinematic) {
    updateCinematic(deltaTime);
    return;
  }
  updateSmashBall(deltaTime);
  updateItems(deltaTime);
  for (const fighter of runtime.game.entities) updateFighter(fighter, deltaTime);
  updateProjectiles(deltaTime);
  updateParticles(deltaTime);
  updateKoEffects(deltaTime);
  runtime.game.shake = Math.max(0, runtime.game.shake - 0.55);
  checkForMatchWinner();
}
function updateFighter(fighter, deltaTime) {
  if (fighter.eliminated) return;
  if (fighter.respawn > 0) {
    updateFighterRespawn(fighter, deltaTime);
    return;
  }
  updateFighterTimers(fighter, deltaTime);
  const input = runtime.game.inputs[fighter.id] || emptyInput();
  updateFighterGuard(fighter, input, deltaTime);
  const pressed = getPressedAttackInputs(fighter, input);
  if (fighter.spawnPlatformTimer > 0) {
    updateFighterOnSpawnPlatform(fighter, input, deltaTime);
    return;
  }
  if (fighter.ledgeGrabbed) {
    updateFighterOnLedge(fighter, input, pressed);
    return;
  }
  updateFighterMovementInput(fighter, input, deltaTime);
  handleFighterAttacks(fighter, input, pressed, deltaTime);
  useFighterSpecial(fighter, pressed.specialPressed, input);
  advanceFighterPhysics(fighter, deltaTime);
}
function updateFighterOnSpawnPlatform(fighter, input, deltaTime) {
  const jumpPressed = input.jump && !fighter.jumpHeld;
  const downPressed = input.down && !fighter.downHeld;
  fighter.jumpHeld = !!input.jump;
  fighter.downHeld = !!input.down;
  fighter.vx = 0;

  if (jumpPressed) {
    fighter.spawnPlatformTimer = 0;
    fighter.grounded = false;
    fighter.groundedPlatformY = null;
    fighter.jumpCount = 1;
    fighter.jumpStyle = 1;
    fighter.jumpPose = 18;
    fighter.vy = SPAWN_PLATFORM.jumpVelocity;
    return;
  }
  if (downPressed) {
    fighter.spawnPlatformTimer = 0;
    fighter.grounded = false;
    fighter.vy = PLATFORM_DROP.initialSpeed;
    return;
  }

  fighter.spawnPlatformTimer = Math.max(0, fighter.spawnPlatformTimer - deltaTime);
  fighter.spawnPlatformY += SPAWN_PLATFORM.fallSpeed * deltaTime;
  fighter.y = fighter.spawnPlatformY - 38;
  fighter.vy = 0;
  fighter.grounded = fighter.spawnPlatformTimer > 0;
}
function updateFighterRespawn(fighter, deltaTime) {
  fighter.respawn -= deltaTime;
  if (fighter.respawn > 0 || fighter.stocks <= 0) return;
  fighter.x = fighter.spawnX;
  fighter.spawnPlatformY = SPAWN_PLATFORM.startY;
  fighter.y = fighter.spawnPlatformY - 38;
  fighter.vx = 0;
  fighter.vy = 0;
  fighter.grounded = true;
  fighter.spawnPlatformTimer = SPAWN_PLATFORM.duration;
  fighter.groundedPlatformY = null;
  fighter.ledgeGrabbed = false;
  fighter.ledgeSide = 0;
  fighter.damage = 0;
  fighter.jumpCount = 0;
  fighter.attackType = '';
  fighter.attackTimer = 0;
  fighter.attackWarmup = 0;
  fighter.attackActiveTimer = 0;
  fighter.invuln = SPAWN_PLATFORM.invulnerability;
  fighter.guard = 100;
  fighter.landSquash = 8;
  fighter.jumpHeld = !!runtime.game.inputs[fighter.id]?.jump;
  spawnParticles(fighter.x, fighter.y, fighter.color, 18);
}
function updateFighterTimers(fighter, deltaTime) {
  for (const timer of ['invuln', 'attackCooldown', 'specialCooldown', 'hitstun', 'flash', 'comboWindow', 'ledgeRegrabCooldown', 'weaponCooldown', 'dropThroughTimer']) {
    if (fighter[timer] > 0) fighter[timer] -= deltaTime;
  }
}
function updateFighterGuard(fighter, input, deltaTime) {
  fighter.guarding = !!input.shield;
  if (input.shield) fighter.guard = Math.max(0, fighter.guard - 0.17 * deltaTime);
  else fighter.guard = Math.min(100, fighter.guard + 0.1 * deltaTime);
}
function getPressedAttackInputs(fighter, input) {
  const pressed = {
    jabPressed: input.attack && !fighter.attackHeld,
    smashPressed: input.smash && !fighter.smashHeld,
    specialPressed: input.special && !fighter.specialHeld,
    dropItemPressed: input.dropItem && !fighter.dropItemHeld,
  };
  fighter.attackHeld = !!input.attack;
  fighter.smashHeld = !!input.smash;
  fighter.specialHeld = !!input.special;
  fighter.dropItemHeld = !!input.dropItem;
  return pressed;
}
function updateFighterMovementInput(fighter, input, deltaTime) {
  if (fighter.hitstun > 0) {
    fighter.vx *= 0.985;
    return;
  }
  const direction = Number(input.right) - Number(input.left);
  const speed = PHYSICS.baseRunSpeed + Math.min(PHYSICS.focusRunBonus, fighter.stats.focus / 30);
  const acceleration = fighter.grounded ? PHYSICS.groundAcceleration : PHYSICS.airAcceleration;
  if (direction !== 0) {
    fighter.vx += (direction * speed - fighter.vx) * acceleration * deltaTime;
  } else {
    const friction = fighter.grounded ? PHYSICS.groundFriction : PHYSICS.airFriction;
    fighter.vx *= Math.pow(friction, deltaTime);
  }
  if (input.left) fighter.facing = -1;
  if (input.right) fighter.facing = 1;
  const downPressed = input.down && !fighter.downHeld;
  fighter.downHeld = !!input.down;
  if (downPressed && fighter.groundedPlatformY !== null) dropFighterThroughPlatform(fighter);
  const jumpPressed = input.jump && !fighter.jumpHeld;
  fighter.jumpHeld = !!input.jump;
  if (fighter.grounded) fighter.jumpCount = 0;
  if (jumpPressed && (fighter.grounded || fighter.jumpCount < PHYSICS.maxJumps)) performFighterJump(fighter);
  if (input.down && !fighter.grounded) fighter.vy += PHYSICS.fallControl * deltaTime;
}

function dropFighterThroughPlatform(fighter) {
  fighter.dropThroughPlatformY = fighter.groundedPlatformY;
  fighter.dropThroughTimer = PLATFORM_DROP.duration;
  fighter.groundedPlatformY = null;
  fighter.grounded = false;
  fighter.vy = Math.max(fighter.vy, PLATFORM_DROP.initialSpeed);
}
function performFighterJump(fighter) {
  fighter.jumpCount += 1;
  fighter.jumpStyle = fighter.jumpCount;
  fighter.jumpPose = fighter.jumpCount === 3 ? 28 : 18;
  fighter.vy = PHYSICS.jumpVelocities[fighter.jumpCount];
  fighter.grounded = false;
  fighter.groundedPlatformY = null;
  const duck = runtime.ducks.find((candidate) => candidate.id === fighter.duckId);
  const featherColor = COLORS[duck?.colors.head] || fighter.color;
  spawnParticles(fighter.x, fighter.y + 24, featherColor, fighter.jumpCount === 3 ? 22 : 12);
  if (fighter.jumpCount === 3) runtime.game.shake = Math.max(runtime.game.shake, 4);
}
function startAttack(fighter, attackType, duration, warmup, cooldown) {
  fighter.attackType = attackType;
  fighter.attackTimer = duration;
  fighter.attackDuration = duration;
  fighter.attackWarmup = warmup;
  fighter.attackActiveTimer = 0;
  fighter.attackHitIds = [];
  fighter.attackHitSmashBall = false;
  fighter.attackLungeApplied = false;
  fighter.attackCooldown = cooldown;
  const lunge = attackType.startsWith('smash') ? COMBAT.smashLunge : COMBAT.jabLunge;
  fighter.vx += fighter.facing * lunge;
}
function handleFighterAttacks(fighter, input, pressed, deltaTime) {
  if (pressed.dropItemPressed && fighter.weapon) {
    dropHeldItem(fighter);
    return;
  }
  if (fighter.hitstun <= 0 && pressed.jabPressed && fighter.weapon?.ammo > 0 && fighter.weaponCooldown <= 0) {
    fireHeldItem(fighter);
    return;
  }
  if (fighter.hitstun <= 0 && fighter.attackCooldown <= 0 && pressed.smashPressed) {
    startAttack(fighter, input.up ? 'smash-up' : input.down ? 'smash-down' : 'smash-forward', 31, 8, 40);
    fighter.comboWindow = 0;
  } else if (fighter.hitstun <= 0 && fighter.attackCooldown <= 0 && pressed.jabPressed) {
    if (!fighter.grounded) {
      const aerialType = input.down ? 'air-down' : input.up ? 'air-up'
        : input.left || input.right ? 'air-forward' : 'air-neutral';
      fighter.comboWindow = 0;
      startAttack(fighter, aerialType, 22, 3, 24);
    } else {
      fighter.comboStep = fighter.comboWindow > 0 ? fighter.comboStep % 3 + 1 : 1;
      fighter.comboWindow = 42;
      const attackType = input.up ? 'jab-up' : input.down ? 'jab-down' : 'jab-' + fighter.comboStep;
      startAttack(fighter, attackType, 14, 2, [16, 18, 26][fighter.comboStep - 1]);
    }
  }
  if (fighter.attackWarmup > 0) {
    fighter.attackWarmup -= deltaTime;
    if (fighter.attackWarmup <= 0) fighter.attackActiveTimer = COMBAT.activeFrames;
  }
  if (fighter.attackActiveTimer > 0) {
    if (fighter.attackType.startsWith('smash') && !fighter.attackLungeApplied) {
      fighter.vx += fighter.facing * COMBAT.smashActiveLunge;
      fighter.attackLungeApplied = true;
    }
    resolveFighterAttack(fighter);
    fighter.attackActiveTimer = Math.max(0, fighter.attackActiveTimer - deltaTime);
  }
  if (fighter.attackTimer > 0) fighter.attackTimer = Math.max(0, fighter.attackTimer - deltaTime);
  else fighter.attackType = '';
}
function resolveFighterAttack(fighter) {
  if (fighter.attackType.startsWith('smash')) {
    hitWithMove(fighter, fighter.attackType, 10, COMBAT.smashRange);
    runtime.game.shake = Math.max(runtime.game.shake, 8);
    return;
  }
  if (fighter.attackType.startsWith('air-')) {
    hitWithMove(fighter, fighter.attackType, fighter.attackType === 'air-down' ? 8 : 6, COMBAT.jabRange + 10);
    return;
  }
  hitWithMove(fighter, fighter.attackType, [0, 4, 5, 7][fighter.comboStep] || 5, COMBAT.jabRange);
}
function useFighterSpecial(fighter, specialPressed, input) {
  if (!specialPressed || fighter.hitstun > 0) return;
  if (fighter.ultimateReady) {
    beginFinalSmash(fighter);
    return;
  }
  const tier = fighter.focus >= SPECIAL.focusCosts[2] ? 2
    : fighter.focus >= SPECIAL.focusCosts[1] ? 1 : 0;
  const focusCost = SPECIAL.focusCosts[tier];
  if (fighter.specialCooldown > 0 || fighter.focus < focusCost) return;
  fighter.focus -= focusCost;
  fighter.specialCooldown = SPECIAL.cooldown;
  fighter.attackType = 'special';
  fighter.attackTimer = 18;
  fighter.attackDuration = 18;
  const duck = runtime.ducks.find((candidate) => candidate.id === fighter.duckId);
  const color = COLORS[duck?.colors.head] || '#ffd05c';
  fireDirectionalSpecial(fighter, input, tier, color);
}

function fireDirectionalSpecial(fighter, input, tier, color) {
  const power = SPECIAL.projectilePowers[tier];
  const radius = SPECIAL.projectileRadii[tier];
  if (input.down && fighter.grounded) {
    for (const direction of [-1, 1]) {
      runtime.game.projectiles.push({ ownerId: fighter.id, kind: 'focus-wave', x: fighter.x, y: fighter.y + 28, vx: direction * (SPECIAL.groundWaveSpeed + tier), vy: 0, life: SPECIAL.groundWaveLife, radius, color: '#ffd75d', power });
    }
  } else if (input.down) {
    fighter.vy = Math.max(fighter.vy, SPECIAL.downwardProjectileSpeed + tier);
    runtime.game.projectiles.push({ ownerId: fighter.id, kind: 'focus-bolt', x: fighter.x, y: fighter.y + 36, vx: 0, vy: SPECIAL.downwardProjectileSpeed + tier, life: SPECIAL.downwardProjectileLife, radius, color: '#ffd75d', power });
  } else if (input.up) {
    fighter.vy = Math.min(fighter.vy, -SPECIAL.upwardBoost - tier);
    runtime.game.projectiles.push({ ownerId: fighter.id, kind: 'focus-bolt', x: fighter.x, y: fighter.y - 42, vx: fighter.facing * 2, vy: -SPECIAL.upwardProjectileSpeed - tier, life: SPECIAL.upwardProjectileLife, radius, color, power });
  } else {
    runtime.game.projectiles.push({ ownerId: fighter.id, kind: 'focus-bolt', x: fighter.x + fighter.facing * 46, y: fighter.y - 12, vx: fighter.facing * (8.5 + tier), vy: 0, life: 78, radius, color, power });
  }
  spawnParticles(fighter.x + fighter.facing * 44, fighter.y - 12, color, 12 + tier * 5);
}
function advanceFighterPhysics(fighter, deltaTime) {
  const previousX = fighter.x;
  const previousY = fighter.y;
  const wasGrounded = fighter.grounded;
  fighter.vy += PHYSICS.gravity * deltaTime;
  fighter.x += fighter.vx * deltaTime;
  fighter.y += fighter.vy * deltaTime;
  fighter.grounded = false;
  const stage = runtime.game.stageLayout;
  for (const platform of stage.platforms) landOnPlatform(fighter, platform, previousY, wasGrounded);
  landOnMainStage(fighter, previousY, wasGrounded);
  if (!fighter.grounded) tryGrabLedge(fighter, stage, previousX, previousY);
  updateFighterAnimationTimers(fighter, deltaTime);
  handleFighterRingOut(fighter);
  fighter.x = Math.max(stage.blastLeft - 40, Math.min(stage.blastRight + 40, fighter.x));
}
function tryGrabLedge(fighter, stage, previousX, previousY) {
  if (fighter.vy < 0 || fighter.hitstun > 0 || fighter.ledgeRegrabCooldown > 0) return;
  const ledges = stage.platforms.map((platform) => ({
    left: platform.x,
    right: platform.x + platform.w,
    top: platform.y,
  }));
  ledges.push({
    left: stage.playableLeft,
    right: stage.playableRight,
    top: stage.floorY,
  });

  const nearbyLedge = ledges.find((ledge) => {
    const verticalMin = Math.min(previousY, fighter.y);
    const verticalMax = Math.max(previousY, fighter.y);
    const nearVerticalEdge = verticalMax >= ledge.top - LEDGE.catchAboveTop
      && verticalMin <= ledge.top + LEDGE.catchBelowTop;
    const horizontalMin = Math.min(previousX, fighter.x);
    const horizontalMax = Math.max(previousX, fighter.x);
    const nearLeftEdge = horizontalMax >= ledge.left - LEDGE.catchDistance
      && horizontalMin <= ledge.left;
    const nearRightEdge = horizontalMax >= ledge.right
      && horizontalMin <= ledge.right + LEDGE.catchDistance;
    const side = nearLeftEdge ? -1 : 1;
    return nearVerticalEdge
      && (nearLeftEdge || nearRightEdge)
      && !isLedgeOccupied(ledge, side);
  });
  if (!nearbyLedge) return;

  const cameFromLeft = previousX < nearbyLedge.left && fighter.x <= nearbyLedge.right;
  const side = fighter.x < nearbyLedge.left || cameFromLeft ? -1 : 1;
  fighter.ledgeGrabbed = true;
  fighter.groundedPlatformY = null;
  fighter.ledgeSide = side;
  fighter.x = side < 0
    ? nearbyLedge.left - LEDGE.hangOffsetX
    : nearbyLedge.right + LEDGE.hangOffsetX;
  fighter.y = nearbyLedge.top + LEDGE.hangOffsetY;
  fighter.vx = 0;
  fighter.vy = 0;
  fighter.facing = -side;
  fighter.attackType = '';
  fighter.attackWarmup = 0;
  fighter.attackActiveTimer = 0;
  fighter.jumpPose = 0;
  fighter.landSquash = 0;
  spawnParticles(fighter.x, fighter.y - 20, fighter.color, 8);
}
function isLedgeOccupied(ledge, side) {
  const ledgeX = side < 0
    ? ledge.left - LEDGE.hangOffsetX
    : ledge.right + LEDGE.hangOffsetX;
  return runtime.game.entities.some((otherFighter) => {
    if (!otherFighter.ledgeGrabbed || otherFighter.ledgeSide !== side) return false;
    const sameEdge = Math.abs(otherFighter.y - (ledge.top + LEDGE.hangOffsetY)) < 2;
    return sameEdge && Math.abs(otherFighter.x - ledgeX) < LEDGE.hangOffsetX;
  });
}
function updateFighterOnLedge(fighter, input, pressed) {
  const side = fighter.ledgeSide;
  fighter.x = Math.round(fighter.x);
  fighter.vx = 0;
  fighter.vy = 0;
  const jumpPressed = input.jump && !fighter.jumpHeld;
  fighter.jumpHeld = !!input.jump;
  if (jumpPressed) {
    releaseFighterFromLedge(fighter);
    fighter.jumpCount = 1;
    fighter.jumpStyle = 1;
    fighter.jumpPose = 18;
    fighter.vy = LEDGE.recoverySpeed;
    fighter.vx = -side * LEDGE.recoveryInwardSpeed;
    fighter.invuln = Math.max(fighter.invuln, LEDGE.releaseInvulnerability);
    return;
  }
  if (pressed.jabPressed || pressed.smashPressed) {
    releaseFighterFromLedge(fighter);
    startAttack(fighter, pressed.smashPressed ? 'smash-forward' : 'jab-1', 18, 2, 24);
    fighter.vy = -3;
    fighter.vx = -side * LEDGE.recoveryInwardSpeed;
    return;
  }
  const movingAway = side < 0 ? input.left : input.right;
  if (input.down || movingAway) dropFighterFromLedge(fighter);
}
function releaseFighterFromLedge(fighter) {
  fighter.ledgeGrabbed = false;
  fighter.ledgeSide = 0;
  fighter.groundedPlatformY = null;
  fighter.ledgeRegrabCooldown = LEDGE.regrabDelay;
  fighter.grounded = false;
}
function dropFighterFromLedge(fighter) {
  const side = fighter.ledgeSide;
  releaseFighterFromLedge(fighter);
  fighter.vx = side * 2.2;
  fighter.vy = LEDGE.dropSpeed;
}
function landOnPlatform(fighter, platform, previousY, wasGrounded) {
  if (fighter.dropThroughTimer > 0 && fighter.dropThroughPlatformY === platform.y) return;
  const crossesPlatform = fighter.vy >= 0 && previousY + 38 <= platform.y && fighter.y + 38 >= platform.y;
  const overlapsPlatform = fighter.x > platform.x - 20 && fighter.x < platform.x + platform.w + 20;
  if (!crossesPlatform || !overlapsPlatform) return;
  if (!wasGrounded) {
    fighter.landSquash = 7;
    spawnParticles(fighter.x, fighter.y + 34, fighter.color, 7);
  }
  fighter.y = platform.y - 38;
  fighter.vy = 0;
  fighter.grounded = true;
  fighter.groundedPlatformY = platform.y;
}
function landOnMainStage(fighter, previousY, wasGrounded) {
  const stage = runtime.game.stageLayout;
  if (fighter.y + 38 < stage.floorY || fighter.x <= stage.playableLeft || fighter.x >= stage.playableRight) return;
  if (!wasGrounded) {
    fighter.landSquash = 8;
    spawnParticles(fighter.x, fighter.y + 34, fighter.color, 9);
  }
  fighter.y = stage.floorY - 38;
  fighter.vy = 0;
  fighter.grounded = true;
  fighter.groundedPlatformY = null;
}
function updateFighterAnimationTimers(fighter, deltaTime) {
  if (fighter.grounded) fighter.jumpCount = 0;
  fighter.walkPhase = (fighter.walkPhase || 0) + Math.abs(fighter.vx) * 0.075;
  fighter.jumpPose = Math.max(0, (fighter.jumpPose || 0) - deltaTime);
  fighter.landSquash = Math.max(0, (fighter.landSquash || 0) - deltaTime);
}
function handleFighterRingOut(fighter) {
  const stage = runtime.game.stageLayout;
  if (fighter.y <= stage.blastY && fighter.x >= stage.blastLeft && fighter.x <= stage.blastRight) return;
  if (fighter.x < stage.blastLeft || fighter.x > stage.blastRight) {
    runtime.game.koEffects.push({ side: fighter.x < 0 ? 'left' : 'right', y: Math.max(48, Math.min(stage.floorY - 38, fighter.y)), life: KO_EFFECT.lifetime, max: KO_EFFECT.lifetime });
  }
  fighter.stocks -= 1;
  if (fighter.stocks <= 0) fighter.eliminated = true;
  else fighter.respawn = 55;
  fighter.weapon = null;
  fighter.x = Math.max(stage.width * 0.15, Math.min(stage.width * 0.85, fighter.x));
  fighter.y = 260;
  const particleX = Math.max(stage.width * 0.12, Math.min(stage.width * 0.88, fighter.x));
  spawnParticles(particleX, Math.min(stage.floorY + 80, fighter.y), fighter.color, fighter.stocks <= 0 ? 54 : 28);
  runtime.game.shake = Math.max(runtime.game.shake, fighter.stocks <= 0 ? COMBAT.finalRingOutShake : COMBAT.sideRingOutShake);
}
function updateProjectiles(deltaTime) {
  for (const projectile of runtime.game.projectiles) {
    if (projectile.life <= 0) continue;
    projectile.x += projectile.vx;
    if (projectile.kind === 'bomb' || projectile.kind === 'banana') {
      projectile.vy += 0.12 * deltaTime;
    }
    projectile.y += (projectile.vy || 0) * deltaTime;
    projectile.life -= deltaTime;
    const owner = runtime.game.entities.find((fighter) => fighter.id === projectile.ownerId);
    if (!owner) continue;
    if (hitSmashBall(owner, 'projectile', projectile.radius + 5)) {
      projectile.life = 0;
      continue;
    }
    for (const target of runtime.game.entities) {
      if (target.id === owner.id || target.eliminated || target.respawn > 0 || target.invuln > 0) continue;
      const overlapsX = Math.abs(target.x - projectile.x) < projectile.radius + COMBAT.projectileHitWidth;
      const overlapsY = Math.abs(target.y - projectile.y) < projectile.radius + COMBAT.projectileHitHeight;
      if (!overlapsX || !overlapsY) continue;
      applyHit(owner, target, projectile.power, projectile.kind !== 'bullet');
      spawnParticles(projectile.x, projectile.y, projectile.color, 16);
      projectile.life = 0;
      break;
    }
    if (projectile.x < 25 || projectile.x > runtime.game.stageLayout.width - 25) projectile.life = 0;
  }
  runtime.game.projectiles = runtime.game.projectiles.filter((projectile) => projectile.life > 0);
}
function checkForMatchWinner() {
  const remainingFighters = runtime.game.entities.filter((fighter) => !fighter.eliminated);
  if (remainingFighters.length > 1) return;
  runtime.game.smashBall = null;
  runtime.game.projectiles = [];
  runtime.game.finished = true;
  runtime.game.winnerId = remainingFighters[0]?.id || null;
  runtime.game.needsFinalSnapshot = true;
  runtime.matchResultRendered = false;
}

  return { createMatch, removeDisconnectedFighter, updateGameSimulation };
}
