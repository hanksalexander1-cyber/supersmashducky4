// Loads the static SVG background for each stage and draws stage-specific
// animated lighting on the canvas. The renderer calls these helpers so
// backdrop artwork can be reused instead of rebuilt every frame.
import { ARENA } from '../config.js';

export function loadStageBackgrounds(stages) {
  const backgrounds = new Map();
  for (const stage of stages) {
    if (!stage.background) continue;
    const image = new Image();
    image.onerror = () => console.error('Unable to load stage background:', stage.background);
    image.src = stage.background;
    backgrounds.set(stage.id, image);
    backgrounds.set(stage.background, image);
  }
  return backgrounds;
}

export function drawStageBackground(context, stage, backgroundImages, time = 0) {
  const image = backgroundImages.get(stage.id) || backgroundImages.get(stage.background);
  if (image?.complete && image.naturalWidth > 0) {
    if (stage.backgroundMode === 'cover') drawPhotoBackground(context, image, stage.width);
    else drawScenicBackground(context, image, stage.width);
  } else {
    context.fillStyle = stage.sky[1];
    context.fillRect(0, 0, stage.width, ARENA.height);
    const glow = context.createRadialGradient(stage.width / 2, 170, 20, stage.width / 2, 170, stage.width * 0.55);
    glow.addColorStop(0, `${stage.top}55`);
    glow.addColorStop(1, `${stage.sky[1]}00`);
    context.fillStyle = glow;
    context.fillRect(0, 0, stage.width, ARENA.height);
    drawBackdropLandforms(context, stage, time);
  }
  drawDynamicAtmosphere(context, stage, time);
}

function drawPhotoBackground(context, image, width) {
  const targetRatio = ARENA.width / ARENA.height;
  const imageRatio = image.naturalWidth / image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  if (imageRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, ARENA.height);
}

function drawScenicBackground(context, image, width) {
  const sourceHeight = image.naturalWidth * ARENA.height / ARENA.width;
  const sourceY = Math.max(0, (image.naturalHeight - sourceHeight) * 0.52);
  for (let tileX = 0; tileX < width; tileX += ARENA.width) {
    const tileWidth = Math.min(ARENA.width, width - tileX);
    context.save();
    if (Math.floor(tileX / ARENA.width) % 2 === 1) {
      context.translate(tileX + tileWidth, 0);
      context.scale(-1, 1);
      context.drawImage(image, 0, sourceY, image.naturalWidth, sourceHeight, 0, 0, tileWidth, ARENA.height);
    } else {
      context.drawImage(image, 0, sourceY, image.naturalWidth, sourceHeight, tileX, 0, tileWidth, ARENA.height);
    }
    context.restore();
  }
}

function drawBackdropLandforms(context, stage, time) {
  context.save();
  context.globalAlpha = 0.24;
  context.fillStyle = stage.sky[2];
  context.beginPath();
  context.moveTo(0, 370);
  for (let backdropX = 0; backdropX <= stage.width; backdropX += 80) {
    const peak = (stage.id.includes('canyon') ? 235 : 285)
      + Math.sin(backdropX * 0.013 + stage.name.length) * 42;
    context.lineTo(backdropX, peak);
    context.lineTo(backdropX + 80, 380);
  }
  context.lineTo(stage.width, 430);
  context.lineTo(0, 430);
  context.closePath();
  context.fill();
  context.globalAlpha = 0.48;
  context.fillStyle = stage.top;
  context.beginPath();
  context.arc(stage.width * 0.76, 125, 42, 0, Math.PI * 2);
  context.fill();
  if (stage.id.includes('fortress')) drawFortressSilhouette(context, stage.width);
  if (stage.id.includes('sunny')) drawSunsetClouds(context, stage.width, time);
  if (stage.id.includes('archipelago')) drawFloatingIslands(context, stage.width, time);
  if (stage.id.includes('pond')) drawPondWaves(context, stage.width, time, stage.top);
  if (stage.id.includes('starlight')) drawConstellation(context, stage.width, time, stage.top);
  context.globalAlpha = 0.6;
  context.fillStyle = '#ffffff';
  for (let starIndex = 0; starIndex < 34; starIndex++) {
    const starX = (starIndex * 173 + stage.name.length * 29) % stage.width;
    const starY = 35 + (starIndex * 67) % 205;
    context.fillRect(starX, starY, starIndex % 5 === 0 ? 2 : 1, starIndex % 5 === 0 ? 2 : 1);
  }
  context.restore();
}

function drawFortressSilhouette(context, width) {
  context.fillStyle = '#121d36cc';
  for (let towerIndex = 0; towerIndex < 7; towerIndex++) {
    const towerX = towerIndex * (width / 6) - 45;
    const towerHeight = 75 + (towerIndex % 3) * 30;
    context.fillRect(towerX, 380 - towerHeight, 88, towerHeight);
    context.fillRect(towerX + 12, 365 - towerHeight, 14, 19);
    context.fillRect(towerX + 38, 365 - towerHeight, 14, 19);
  }
}

function drawSunsetClouds(context, width, time) {
  context.fillStyle = '#ffd18844';
  for (let cloudIndex = 0; cloudIndex < 6; cloudIndex++) {
    const cloudX = (cloudIndex * width / 5 + time * (0.4 + cloudIndex * 0.05)) % (width + 150) - 75;
    const cloudY = 110 + cloudIndex % 3 * 34;
    context.beginPath();
    context.ellipse(cloudX, cloudY, 62, 12, 0, 0, Math.PI * 2);
    context.ellipse(cloudX - 18, cloudY - 7, 24, 15, 0, 0, Math.PI * 2);
    context.ellipse(cloudX + 16, cloudY - 9, 28, 18, 0, 0, Math.PI * 2);
    context.fill();
  }
}

function drawDynamicAtmosphere(context, stage, time) {
  const width = stage.width;
  const pulse = (Math.sin(time * 0.035) + 1) / 2;
  const cycle = Math.floor(time / 900) % 3;
  const tint = [stage.sky[0], stage.sky[2], stage.top][cycle];
  const gradient = context.createLinearGradient(width * ((time * 0.006) % 1), 0, width, ARENA.height);
  gradient.addColorStop(0, `${tint}00`);
  gradient.addColorStop(0.55, `${tint}${Math.round(32 + pulse * 26).toString(16).padStart(2, '0')}`);
  gradient.addColorStop(1, `${stage.sky[(cycle + 1) % stage.sky.length]}00`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, ARENA.height);

  context.save();
  context.globalAlpha = 0.1 + pulse * 0.13;
  context.strokeStyle = stage.top;
  context.shadowColor = stage.top;
  context.shadowBlur = 24;
  context.lineWidth = 18;
  for (let ribbonIndex = 0; ribbonIndex < 3; ribbonIndex++) {
    const ribbonY = 85 + ribbonIndex * 38;
    context.beginPath();
    context.moveTo(-40, ribbonY + Math.sin(time * 0.025 + ribbonIndex) * 24);
    context.bezierCurveTo(width * 0.28, ribbonY - 45, width * 0.62, ribbonY + 48, width + 40, ribbonY - 10);
    context.stroke();
  }
  context.restore();
}

function drawFloatingIslands(context, width, time) {
  context.fillStyle = '#081b36aa';
  for (let islandIndex = 0; islandIndex < 5; islandIndex++) {
    const islandX = width * (0.12 + islandIndex * 0.19) + Math.sin(time * 0.018 + islandIndex) * 10;
    const islandY = 190 + (islandIndex % 2) * 42;
    context.beginPath();
    context.moveTo(islandX - 56, islandY);
    context.lineTo(islandX - 42, islandY + 14);
    context.lineTo(islandX - 12, islandY + 49);
    context.lineTo(islandX + 10, islandY + 18);
    context.lineTo(islandX + 55, islandY);
    context.closePath();
    context.fill();
  }
}

function drawPondWaves(context, width, time, color) {
  context.strokeStyle = `${color}55`;
  context.lineWidth = 3;
  for (let waveIndex = 0; waveIndex < 8; waveIndex++) {
    const waveY = 340 + waveIndex * 11;
    const offset = (time * (0.4 + waveIndex * 0.05)) % 100;
    context.beginPath();
    context.moveTo(-100 + offset, waveY);
    context.lineTo(width, waveY - 6);
    context.stroke();
  }
}

function drawConstellation(context, width, time, color) {
  context.strokeStyle = `${color}77`;
  context.lineWidth = 2;
  for (let starIndex = 0; starIndex < 7; starIndex++) {
    const starX = width * (0.08 + starIndex * 0.14);
    const starY = 90 + Math.sin(time * 0.02 + starIndex) * 45;
    context.beginPath();
    context.arc(starX, starY, 3 + (starIndex % 3), 0, Math.PI * 2);
    context.stroke();
    if (starIndex === 0) continue;
    context.beginPath();
    context.moveTo(starX - width * 0.14, 90 + Math.sin(time * 0.02 + starIndex - 1) * 45);
    context.lineTo(starX, starY);
    context.stroke();
  }
}

export function drawSpotlights(context, time, width = ARENA.width) {
  for (let lightIndex = 0; lightIndex < 3; lightIndex++) {
    const x = width * (0.19 + lightIndex * 0.31) + Math.sin(time * 0.07 + lightIndex) * 25;
    const beam = context.createLinearGradient(x, 80, x + 70, 420);
    beam.addColorStop(0, '#d5f7ff15');
    beam.addColorStop(1, '#d5f7ff00');
    context.fillStyle = beam;
    context.beginPath();
    context.moveTo(x - 15, 65);
    context.lineTo(x + 22, 65);
    context.lineTo(x + 110, 420);
    context.lineTo(x - 170, 420);
    context.fill();
  }
}
