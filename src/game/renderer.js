// Canvas presentation layer for the live match. It reads the current runtime
// state and draws stage art, duck sprites and poses, combat effects, items,
// and overlays; game rules and networking are handled by separate modules.
import { ARENA, KO_EFFECT, SPAWN_PLATFORM, getStageLayout } from '../config.js';
import { drawSpotlights, drawStageBackground } from './stage-art.js';

export function createBattleRenderer({ runtime, querySelector, backgroundImages, spriteCache }) {
  const renderImages = new Map();
  let cameraLeft = 0;

  function drawBattle() {
    const canvas = querySelector('#arenaCanvas');
    const context = canvas.getContext('2d');
    const time = runtime.game.elapsedTime || performance.now() / 1000;
    const stage = runtime.game.stageLayout || getStageLayout(runtime.game.stageId);
    cameraLeft = getCameraLeft(stage, runtime.game.entities);

    context.clearRect(0, 0, ARENA.width, ARENA.height);
    context.save();
    context.translate(-cameraLeft, 0);
    applyScreenShake(context, runtime.game.shake);

    // Keep scene layers ordered so the spotlights sit over the stage and under the fighters.
    drawStageBackground(context, stage, backgroundImages, time);
    drawSpotlights(context, time, stage.width);
    drawStagePlatforms(context, stage);
    drawSpawnPlatforms(context, runtime.game.entities);
    drawSmashBall(context, runtime.game.smashBall);
    drawItems(context, runtime.game.items);
    drawProjectiles(context, runtime.game.projectiles);
    drawFighters(context, runtime.game.entities);
    drawParticles(context, runtime.game.particles);

    // The outer save/restore contains the shake transform and any canvas state changes.
    context.restore();
    drawSideKOEffects(context, runtime.game.koEffects);
  }

  function getCameraLeft(stage, fighters) {
    const activeFighters = fighters.filter((fighter) => !fighter.eliminated && fighter.respawn <= 0);
    if (stage.width <= ARENA.width || activeFighters.length === 0) return 0;
    const center = activeFighters.reduce((sum, fighter) => sum + fighter.x, 0) / activeFighters.length;
    const target = Math.max(0, Math.min(stage.width - ARENA.width, center - ARENA.width / 2));
    cameraLeft += (target - cameraLeft) * 0.08;
    return cameraLeft;
  }

  function drawSideKOEffects(context, effects = []) {
    for (const effect of effects) drawSideKOBlast(context, effect);
  }

  function drawSideKOBlast(context, effect) {
    const lifeRatio = effect.life / effect.max;
    const direction = effect.side === 'left' ? 1 : -1;
    const edgeX = effect.side === 'left' ? 0 : ARENA.width;
    const blastRadius = KO_EFFECT.startingRadius + (1 - lifeRatio) * (KO_EFFECT.blastRadius - KO_EFFECT.startingRadius);
    const beamLength = KO_EFFECT.startingBeamLength + (1 - lifeRatio) * KO_EFFECT.growingBeamLength;
    drawKOBeam(context, effect, edgeX, direction, beamLength, lifeRatio);
    drawKORings(context, effect, edgeX, blastRadius, lifeRatio);
  }

  function drawKOBeam(context, effect, edgeX, direction, beamLength, lifeRatio) {
    const beam = context.createLinearGradient(edgeX, effect.y, edgeX + direction * beamLength, effect.y);
    beam.addColorStop(0, `rgba(255,240,230,${lifeRatio})`);
    beam.addColorStop(0.24, `rgba(255,35,20,${lifeRatio})`);
    beam.addColorStop(1, 'rgba(160,0,20,0)');
    context.save();
    context.globalAlpha = lifeRatio;
    context.fillStyle = beam;
    context.shadowColor = '#ff2018';
    context.shadowBlur = KO_EFFECT.beamShadow;
    context.fillRect(Math.min(edgeX, edgeX + direction * beamLength), effect.y - KO_EFFECT.beamHalfHeight, beamLength, KO_EFFECT.beamHalfHeight * 2);
    context.restore();
  }

  function drawKORings(context, effect, edgeX, blastRadius, lifeRatio) {
    const blast = context.createRadialGradient(edgeX, effect.y, 5, edgeX, effect.y, blastRadius);
    blast.addColorStop(0, '#fff7dc');
    blast.addColorStop(0.13, '#ffca61');
    blast.addColorStop(0.43, '#ff321b');
    blast.addColorStop(0.78, '#c50020dd');
    blast.addColorStop(1, '#70001800');
    context.save();
    context.globalAlpha = lifeRatio;
    context.fillStyle = blast;
    context.beginPath();
    context.arc(edgeX, effect.y, blastRadius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#ff3928';
    context.lineWidth = KO_EFFECT.outerRingWidth;
    context.shadowBlur = 30;
    context.beginPath();
    context.arc(edgeX, effect.y, blastRadius * KO_EFFECT.outerRingScale, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = '#ffad61';
    context.lineWidth = KO_EFFECT.innerRingWidth;
    context.beginPath();
    context.arc(edgeX, effect.y, blastRadius * KO_EFFECT.innerRingScale, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  function drawStagePlatforms(context, stage) {
    if (stage.hidePlatforms) return;
    const visiblePlatforms = [...stage.platforms, { x: stage.playableLeft, w: stage.playableRight - stage.playableLeft, y: stage.floorY }];
    for (const platform of visiblePlatforms) {
      context.save();
      context.shadowColor = stage.top;
      context.shadowBlur = 13;
      const fill = context.createLinearGradient(0, platform.y, 0, platform.y + 17);
      fill.addColorStop(0, '#526a79');
      fill.addColorStop(1, '#172633');
      context.fillStyle = fill;
      context.beginPath();
      context.roundRect(platform.x, platform.y, platform.w, 17, 5);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = stage.top;
      context.fillRect(platform.x + 5, platform.y, platform.w - 10, 3);
      context.restore();
    }
  }

  function applyScreenShake(context, shakeAmount) {
    if (shakeAmount <= 0) return;
    context.translate(
      (Math.random() - 0.5) * shakeAmount,
      (Math.random() - 0.5) * shakeAmount,
    );
  }

  function drawSmashBall(context, smashBall) {
    if (!smashBall) return;

    const bob = Math.sin(performance.now() / 110) * 5;
    const centerY = smashBall.y + bob;
    context.save();
    context.shadowColor = '#ffd94d';
    context.shadowBlur = 30;

    const aura = context.createRadialGradient(
      smashBall.x, centerY, 3,
      smashBall.x, centerY, 37,
    );
    aura.addColorStop(0, '#fffde8');
    aura.addColorStop(0.35, '#ffe274');
    aura.addColorStop(0.72, '#ff9e35');
    aura.addColorStop(1, '#ff8a2500');
    context.fillStyle = aura;
    context.beginPath();
    context.arc(smashBall.x, centerY, 38, 0, Math.PI * 2);
    context.fill();

    context.shadowBlur = 0;
    context.strokeStyle = '#fff3a7';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(smashBall.x, centerY, 19, 0, Math.PI * 2);
    context.stroke();
    drawSmashBallStar(context, smashBall.x, centerY);

    context.fillStyle = '#241c31';
    context.font = '900 10px system-ui,sans-serif';
    context.textAlign = 'center';
    context.fillText(String(smashBall.hp), smashBall.x, centerY + 3);
    context.restore();
  }

  function drawSmashBallStar(context, centerX, centerY) {
    context.fillStyle = '#fff9db';
    context.beginPath();
    for (let pointIndex = 0; pointIndex < 10; pointIndex++) {
      const angle = -Math.PI / 2 + pointIndex * Math.PI / 5;
      const radius = pointIndex % 2 ? 7 : 15;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      if (pointIndex === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
  }

  function drawProjectiles(context, projectiles = []) {
    for (const projectile of projectiles) drawProjectile(context, projectile);
  }

  function drawProjectile(context, projectile) {
    if (projectile.kind === 'bomb' || projectile.kind === 'banana') {
      drawThrownItem(context, projectile);
      return;
    }
    const glow = context.createRadialGradient(
      projectile.x - 4, projectile.y - 5, 2,
      projectile.x, projectile.y, projectile.radius + 5,
    );
    glow.addColorStop(0, '#fffde2');
    glow.addColorStop(0.25, projectile.color);
    glow.addColorStop(1, projectile.color + '00');

    context.save();
    context.strokeStyle = projectile.color;
    context.lineWidth = 4;
    context.shadowColor = projectile.color;
    context.shadowBlur = 22;
    context.beginPath();
    context.moveTo(projectile.x - projectile.vx * 3, projectile.y);
    context.lineTo(projectile.x, projectile.y);
    context.stroke();

    context.fillStyle = glow;
    context.beginPath();
    context.arc(projectile.x, projectile.y, projectile.radius + 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#fff9d9';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(projectile.x, projectile.y, projectile.radius * 0.58, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  function drawThrownItem(context, projectile) {
    context.save();
    context.strokeStyle = projectile.color;
    context.lineWidth = 3;
    context.shadowColor = projectile.color;
    context.shadowBlur = 15;
    context.beginPath();
    context.moveTo(projectile.x - projectile.vx * 2, projectile.y - projectile.vy * 2);
    context.lineTo(projectile.x, projectile.y);
    context.stroke();
    drawItemIcon(context, projectile.kind, projectile.x, projectile.y, 0.9);
    context.restore();
  }

  function drawItems(context, items = []) {
    for (const item of items) {
      context.save();
      context.translate(item.x, item.y + Math.sin(performance.now() / 140 + item.x) * 3);
      context.shadowColor = item.type === 'star' ? '#ffe65a' : '#ff8954';
      context.shadowBlur = 18;
      context.fillStyle = '#172431dd';
      context.beginPath();
      context.arc(0, 0, 22, 0, Math.PI * 2);
      context.fill();
      drawItemIcon(context, item.type, 0, 0, 1);
      context.restore();
    }
  }

  function drawItemIcon(context, type, x, y, scale) {
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);
    context.lineWidth = 2.5;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.strokeStyle = '#273342';
    const iconDrawers = {
      blaster: drawBlasterIcon,
      bomb: drawBombIcon,
      banana: drawBananaIcon,
      heart: drawHeartIcon,
      shield: drawShieldIcon,
      isaac: drawIsaacIcon,
    };
    (iconDrawers[type] || drawStarIcon)(context);
    context.restore();
  }

  function drawBlasterIcon(context) {
    context.fillStyle = '#82dfc1';
    context.beginPath();
    context.roundRect(-16, -7, 25, 14, 4);
    context.roundRect(4, -4, 15, 7, 2);
    context.roundRect(-9, 4, 8, 11, 2);
    context.fill();
    context.stroke();
  }

  function drawBombIcon(context) {
    context.fillStyle = '#e84f48';
    context.beginPath();
    context.arc(0, 3, 12, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(2, -9);
    context.lineTo(7, -16);
    context.stroke();
    context.fillStyle = '#ffd95b';
    context.beginPath();
    context.arc(8, -17, 3, 0, Math.PI * 2);
    context.fill();
  }

  function drawBananaIcon(context) {
    context.fillStyle = '#ffd84c';
    context.beginPath();
    context.moveTo(-13, -8);
    context.quadraticCurveTo(1, 4, 13, -10);
    context.quadraticCurveTo(9, 12, -4, 13);
    context.quadraticCurveTo(-13, 5, -13, -8);
    context.fill();
    context.stroke();
  }

  function drawHeartIcon(context) {
    context.fillStyle = '#ff6582';
    context.beginPath();
    context.moveTo(0, 13);
    context.bezierCurveTo(-19, 1, -11, -13, 0, -6);
    context.bezierCurveTo(11, -13, 19, 1, 0, 13);
    context.fill();
    context.stroke();
  }

  function drawShieldIcon(context) {
    context.fillStyle = '#75d9ff';
    context.beginPath();
    context.moveTo(0, -14);
    context.lineTo(12, -9);
    context.lineTo(10, 5);
    context.lineTo(0, 14);
    context.lineTo(-10, 5);
    context.lineTo(-12, -9);
    context.closePath();
    context.fill();
    context.stroke();
  }

  function drawIsaacIcon(context) {
    context.fillStyle = '#f2c18c';
    context.beginPath();
    context.arc(0, 1, 11, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = '#d84935';
    context.beginPath();
    context.moveTo(-12, -3);
    context.lineTo(-8, -14);
    context.lineTo(-2, -10);
    context.lineTo(3, -16);
    context.lineTo(9, -9);
    context.lineTo(13, -3);
    context.lineTo(7, -5);
    context.lineTo(0, -7);
    context.lineTo(-7, -5);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = '#303444';
    context.beginPath();
    context.arc(-4, 1, 1.4, 0, Math.PI * 2);
    context.arc(4, 1, 1.4, 0, Math.PI * 2);
    context.fill();
  }

  function drawStarIcon(context) {
    context.fillStyle = '#ffe65a';
    context.beginPath();
    for (let pointIndex = 0; pointIndex < 10; pointIndex++) {
      const angle = -Math.PI / 2 + pointIndex * Math.PI / 5;
      const radius = pointIndex % 2 ? 6 : 14;
      const pointX = Math.cos(angle) * radius;
      const pointY = Math.sin(angle) * radius;
      if (pointIndex === 0) context.moveTo(pointX, pointY);
      else context.lineTo(pointX, pointY);
    }
    context.closePath();
    context.fill();
    context.stroke();
  }

  function drawFighters(context, fighters) {
    for (const fighter of fighters) drawFighter(context, fighter);
  }

  function drawSpawnPlatforms(context, fighters) {
    for (const fighter of fighters) {
      if (fighter.eliminated || fighter.respawn > 0 || fighter.spawnPlatformTimer <= 0) continue;
      const platformTop = fighter.y + 38;
      context.save();
      context.shadowColor = '#8beaff';
      context.shadowBlur = 18;
      context.fillStyle = '#183c58dd';
      context.fillRect(fighter.x - SPAWN_PLATFORM.width / 2, platformTop, SPAWN_PLATFORM.width, 12);
      context.fillStyle = '#c9f8ff';
      context.fillRect(fighter.x - SPAWN_PLATFORM.width / 2 + 7, platformTop, SPAWN_PLATFORM.width - 14, 3);
      context.restore();
    }
  }

  function drawFighter(context, fighter) {
    if (fighter.eliminated || fighter.respawn > 0) return;

    const duck = runtime.ducks.find((candidate) => candidate.id === fighter.duckId);
    const pose = getFighterPose(fighter);
    drawFighterShadow(context, fighter);
    drawSpawnProtection(context, fighter);
    if (fighter.guarding) drawGuardBubble(context, fighter);
    if (fighter.jumpStyle === 3 && fighter.jumpPose > 0) drawThirdJumpAura(context, fighter);
    if (fighter.flash > 0) drawHitFlash(context, fighter);
    drawFighterArtwork(context, fighter, duck, pose);
    drawDuckFeet(context, fighter, pose);
    drawDirectionalKick(context, fighter);
    drawAttackArc(context, fighter, pose.attackProgress, pose.lunge);
    drawSmashWindup(context, fighter);
    drawFighterLabel(context, fighter);
  }

  function drawDuckFeet(context, fighter, pose) {
    const centerX = fighter.x + pose.lunge * fighter.facing;
    const footY = fighter.y + 32 * pose.scaleY + pose.bob;
    const footSpread = fighter.grounded ? 14 : 11;
    const footDrop = fighter.grounded ? Math.sin(fighter.walkPhase * 2) * 2 : 4;
    context.save();
    context.translate(centerX, footY);
    context.rotate(pose.tilt * 0.35);
    context.strokeStyle = '#8e4f20';
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.fillStyle = '#f2a43b';
    for (const side of [-1, 1]) {
      context.strokeStyle = '#8e4f20';
      context.beginPath();
      context.moveTo(side * footSpread, -7);
      context.lineTo(side * footSpread, footDrop - 2);
      context.stroke();
      context.beginPath();
      context.moveTo(side * footSpread - 8, footDrop - 2);
      context.quadraticCurveTo(side * footSpread + 2, footDrop - 8, side * footSpread + 9, footDrop - 1);
      context.lineTo(side * footSpread + 12, footDrop + 3);
      context.lineTo(side * footSpread - 11, footDrop + 3);
      context.closePath();
      context.fill();
      context.stroke();
      for (let toeIndex = 0; toeIndex < 3; toeIndex++) {
        const toeX = side * footSpread - 7 + toeIndex * 7;
        context.beginPath();
        context.moveTo(toeX, footDrop + 1);
        context.lineTo(toeX + 1, footDrop + 4);
        context.stroke();
      }
    }
    context.restore();
  }

  function drawDirectionalKick(context, fighter) {
    const isAerial = fighter.attackType.startsWith('air-');
    const isDownKick = fighter.attackType.includes('down');
    if ((!isAerial && !isDownKick) || fighter.attackWarmup > 0) return;
    const directionY = isDownKick ? 1 : fighter.attackType === 'air-up' ? -1 : 0.2;
    const directionX = fighter.facing * (fighter.attackType === 'air-neutral' ? 0.65 : isDownKick ? 0.35 : 1);
    context.save();
    context.strokeStyle = '#ffc55b';
    context.shadowColor = '#ff9d35';
    context.shadowBlur = 17;
    context.lineWidth = 11;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(fighter.x + fighter.facing * 7, fighter.y + 17);
    context.lineTo(fighter.x + directionX * 44, fighter.y + 17 + directionY * 32);
    context.stroke();
    context.restore();
  }

  function drawSpawnProtection(context, fighter) {
    if (fighter.invuln <= 0) return;
    context.save();
    context.globalAlpha = 0.45 + Math.sin(performance.now() / 55) * 0.15;
    context.strokeStyle = '#9beaff';
    context.lineWidth = fighter.spawnPlatformTimer > 0 ? 3 : 2;
    context.setLineDash(fighter.spawnPlatformTimer > 0 ? [7, 5] : []);
    context.shadowColor = '#5ddcff';
    context.shadowBlur = 16;
    context.beginPath();
    context.ellipse(fighter.x, fighter.y, 48, 53, 0, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  function getFighterPose(fighter) {
    const attackProgress = fighter.attackDuration
      ? 1 - fighter.attackTimer / fighter.attackDuration
      : 0;
    const isAttacking = !!fighter.attackType;
    const pose = { attackProgress, ...getGroundPose(fighter), lunge: 0 };

    if (isAttacking) {
      Object.assign(pose, getAttackPose(fighter, attackProgress));
    } else if (fighter.jumpPose > 0) {
      Object.assign(pose, getJumpPose(fighter));
    } else if (!fighter.grounded && !fighter.ledgeGrabbed) {
      Object.assign(pose, getAirPose(fighter));
    } else if (fighter.ledgeGrabbed) {
      Object.assign(pose, getLedgePose(fighter));
    }

    if (fighter.hitstun > 0) Object.assign(pose, getHitstunPose());
    return applyLandingSquash(pose, fighter.landSquash);
  }

  function getGroundPose(fighter) {
    if (!fighter.grounded) return { bob: 0, tilt: 0, scaleX: 1, scaleY: 1 };
    const idleTime = performance.now() / 320 + fighter.slot;
    if (Math.abs(fighter.vx) > 0.4) {
      return {
        bob: Math.sin(fighter.walkPhase || 0) * Math.min(3, Math.abs(fighter.vx) * 0.6)
          - Math.abs(Math.sin(fighter.walkPhase * 2)) * 2,
        tilt: Math.sin(fighter.walkPhase * 2) * 0.055,
        scaleX: 1,
        scaleY: 1,
      };
    }
    return { bob: Math.sin(idleTime) * 1.8, tilt: 0, scaleX: 1, scaleY: 1 + Math.sin(idleTime) * 0.014 };
  }

  function getAirPose(fighter) {
    return {
      scaleX: 0.94,
      scaleY: fighter.vy > 0 ? 1.11 : 0.96,
      tilt: Math.max(-0.2, Math.min(0.2, fighter.vx * 0.018)),
    };
  }

  function getLedgePose(fighter) {
    return {
      bob: Math.sin(performance.now() / 110) * 2,
      tilt: fighter.ledgeSide * 0.18,
      scaleX: 0.94,
      scaleY: 1.06,
    };
  }

  function getHitstunPose() {
    return { tilt: -0.25, scaleX: 0.9, scaleY: 1.08 };
  }

  function applyLandingSquash(pose, landSquash) {
    if (landSquash <= 0) return pose;
    const squash = Math.min(0.16, landSquash * 0.018);
    return { ...pose, scaleX: pose.scaleX + squash, scaleY: pose.scaleY - squash };
  }

  function getAttackPose(fighter, progress) {
    if (fighter.attackType.startsWith('jab')) {
      return {
        lunge: Math.sin(Math.min(1, progress * 1.2) * Math.PI) * 11,
        tilt: 0.13 + Math.sin(progress * Math.PI) * 0.12,
        scaleX: 0.9,
        scaleY: 1.08,
      };
    }
    if (fighter.attackType.startsWith('smash')) {
      if (fighter.attackWarmup > 0) {
        return {
          lunge: -fighter.facing * 8,
          tilt: fighter.attackType.includes('down') ? -0.24 : 0.3,
          scaleX: 1.08,
          scaleY: 0.91,
        };
      }
      return {
        lunge: Math.sin(Math.min(1, progress * 1.35) * Math.PI) * 19,
        tilt: fighter.attackType.includes('up') ? -0.42 : fighter.attackType.includes('down') ? 0.5 : 0.2,
        scaleX: 0.82,
        scaleY: 1.17,
      };
    }
    if (fighter.attackType === 'special') {
      return { lunge: Math.sin(progress * Math.PI) * 9, tilt: -0.16, scaleX: 0.92, scaleY: 1.1 };
    }
    return { lunge: 0, tilt: 0, scaleX: 1, scaleY: 1 };
  }

  function getJumpPose(fighter) {
    const jumpDuration = fighter.jumpStyle === 3 ? 28 : 18;
    const progress = 1 - fighter.jumpPose / jumpDuration;
    if (fighter.jumpStyle === 3) {
      return { tilt: progress * Math.PI * 2, scaleX: 0.86, scaleY: 1.14 };
    }
    if (fighter.jumpStyle === 2) {
      return { tilt: Math.sin(progress * Math.PI) * 0.32, scaleX: 0.9, scaleY: 1.12 };
    }
    return { tilt: -0.12, scaleX: 0.84, scaleY: 1.2 };
  }

  function drawFighterShadow(context, fighter) {
    const floorY = runtime.game.stageLayout?.floorY || ARENA.floorY;
    const shadowScale = Math.max(0.35, 1 - Math.max(0, floorY - fighter.y) * 0.002);
    context.fillStyle = '#07111a88';
    context.beginPath();
    context.ellipse(fighter.x, Math.min(floorY, fighter.y + 38), 35 * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2);
    context.fill();
  }

  function drawGuardBubble(context, fighter) {
    context.save();
    context.strokeStyle = '#78ddffdd';
    context.fillStyle = '#7adfff20';
    context.lineWidth = 4;
    context.shadowColor = '#65d8ff';
    context.shadowBlur = 18;
    context.beginPath();
    context.ellipse(fighter.x, fighter.y, 44, 53, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }

  function drawThirdJumpAura(context, fighter) {
    const pulse = performance.now();
    context.save();
    context.strokeStyle = '#ffe37b';
    context.shadowColor = '#ffcf55';
    context.shadowBlur = 18;
    context.lineWidth = 3;
    context.beginPath();
    context.ellipse(
      fighter.x,
      fighter.y,
      43 + Math.sin(pulse / 45) * 5,
      50 + Math.sin(pulse / 50) * 5,
      fighter.jumpPose * 0.05,
      0,
      Math.PI * 2,
    );
    context.stroke();
    context.restore();
  }

  function drawHitFlash(context, fighter) {
    context.save();
    context.globalAlpha = Math.min(0.75, fighter.flash / 14);
    context.fillStyle = '#fff5c7';
    context.beginPath();
    context.ellipse(fighter.x, fighter.y, 43, 48, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawFighterArtwork(context, fighter, duck, pose) {
    const spriteData = duck && spriteCache.get(duck.id);
    if (!spriteData) {
      drawFallbackDuck(context, fighter, pose);
      return;
    }

    // Reuse decoded sprite images; rebuilding an Image from its data URL every frame is costly.
    if (!renderImages.has(duck.id)) {
      const image = new Image();
      image.src = spriteData;
      renderImages.set(duck.id, image);
    }
    const image = renderImages.get(duck.id);
    if (!image.complete) return;

    if (fighter.jumpStyle >= 2 && fighter.jumpPose > 0) {
      drawJumpTrails(context, fighter, pose, image);
    }
    drawDuckSprite(context, fighter, pose, image);
  }

  function drawJumpTrails(context, fighter, pose, image) {
    const trailCount = fighter.jumpStyle === 3 ? 3 : 1;
    for (let trailIndex = trailCount; trailIndex > 0; trailIndex--) {
      context.save();
      context.globalAlpha = 0.11 * trailIndex;
      context.translate(
        fighter.x + pose.lunge * fighter.facing - fighter.facing * fighter.vx * trailIndex * 2,
        fighter.y + pose.bob + trailIndex * 8,
      );
      context.scale(fighter.facing, 1);
      context.rotate(pose.tilt - trailIndex * 0.12);
      context.scale(pose.scaleX, pose.scaleY);
      context.drawImage(image, -46, -47, 92, 86);
      context.restore();
    }
  }

  function drawDuckSprite(context, fighter, pose, image) {
    context.save();
    context.translate(fighter.x + pose.lunge * fighter.facing, fighter.y + pose.bob);
    // Mirroring the sprite also mirrors the swing pose to match the fighter's facing.
    context.scale(fighter.facing, 1);
    context.rotate(pose.tilt);
    context.scale(pose.scaleX, pose.scaleY);
    context.drawImage(image, -46, -47, 92, 86);
    context.restore();
  }

  function drawFallbackDuck(context, fighter, pose) {
    context.fillStyle = fighter.color;
    context.beginPath();
    context.ellipse(
      fighter.x + pose.lunge * fighter.facing,
      fighter.y,
      27 * pose.scaleX,
      30 * pose.scaleY,
      pose.tilt,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  function drawAttackArc(context, fighter, progress, lunge) {
    const hasSwing = fighter.attackType.startsWith('jab')
      || fighter.attackType.startsWith('smash')
      || fighter.attackType === 'special';
    if (!fighter.attackType || fighter.attackWarmup > 0 || progress <= 0.12 || progress >= 0.88 || !hasSwing) return;

    const sweep = (progress - 0.12) / 0.76;
    const arcCenterAngle = fighter.attackType.includes('up')
      ? -Math.PI / 2
      : fighter.attackType.includes('down')
        ? Math.PI / 2
        : 0;
    const isSpecial = fighter.attackType === 'special';
    context.save();
    context.translate(fighter.x + fighter.facing * (24 + lunge), fighter.y - 8);
    context.scale(fighter.facing, 1);
    context.globalAlpha = Math.sin(sweep * Math.PI) * 0.9;
    context.lineCap = 'round';
    context.strokeStyle = isSpecial ? '#ffe47b' : '#effaff';
    context.shadowColor = isSpecial ? '#ffae32' : '#77ddff';
    context.shadowBlur = isSpecial ? 24 : 17;
    context.lineWidth = fighter.attackType.startsWith('smash') ? 11 : 6;

    const arcStart = arcCenterAngle - 0.9 + sweep * 1.8;
    context.beginPath();
    context.arc(0, 0, 57, arcStart, arcStart + 0.9);
    context.stroke();
    context.globalAlpha *= 0.55;
    context.strokeStyle = '#fff';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, 69, arcStart + 0.12, arcStart + 0.8);
    context.stroke();
    context.restore();
  }

  function drawSmashWindup(context, fighter) {
    if (!fighter.attackType.startsWith('smash') || fighter.attackWarmup <= 0) return;
    context.save();
    context.strokeStyle = '#fff0bdaa';
    context.lineWidth = 3;
    context.setLineDash([5, 6]);
    context.beginPath();
    context.arc(fighter.x + fighter.facing * 20, fighter.y - 4, 48, -0.8, 0.8);
    context.stroke();
    context.setLineDash([]);
    context.restore();
  }

  function drawFighterLabel(context, fighter) {
    context.fillStyle = '#f4f6ed';
    context.font = '900 13px system-ui,sans-serif';
    context.lineWidth = 3;
    context.strokeStyle = '#13212c';
    context.strokeText(fighter.name, fighter.x, fighter.y - 57);
    context.fillText(fighter.name, fighter.x, fighter.y - 57);
    context.fillStyle = fighter.color;
    context.beginPath();
    context.arc(fighter.x, fighter.y - 73, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fff';
    context.font = '900 11px system-ui,sans-serif';
    context.fillText(`P${fighter.slot}`, fighter.x, fighter.y - 69);
    if (fighter.weapon?.ammo > 0) drawWeaponIcon(context, fighter);
  }

  function drawWeaponIcon(context, fighter) {
    const iconX = fighter.x + 38;
    const iconY = fighter.y + 55;
    context.fillStyle = '#101a24dd';
    context.beginPath();
    context.arc(iconX, iconY, 14, 0, Math.PI * 2);
    context.fill();
    drawItemIcon(context, fighter.weapon.type, iconX, iconY, 0.58);
    if (fighter.weapon.ammo > 1) {
      context.fillStyle = '#fff';
      context.font = '900 10px system-ui,sans-serif';
      context.textAlign = 'center';
      context.fillText(String(fighter.weapon.ammo), iconX + 12, iconY + 13);
    }
  }

  function drawParticles(context, particles = []) {
    for (const particle of particles) {
      const lifeRatio = particle.life / particle.max;
      context.globalAlpha = Math.max(0, lifeRatio);
      context.fillStyle = particle.color;
      context.shadowColor = particle.color;
      context.shadowBlur = 10;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size * Math.max(0.25, lifeRatio), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.shadowBlur = 0;
  }

  return drawBattle;
}
