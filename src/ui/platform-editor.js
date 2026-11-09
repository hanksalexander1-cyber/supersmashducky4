// Lets stage hosts position hidden collision platforms visually, then saves
// the edited stage data locally so they can iterate between matches.
import { ARENA } from '../config.js';

const PLATFORM_STORAGE_KEY = 'smd-stage-platforms';
const PLATFORM_DEFAULT_WIDTH = 180;
const PLATFORM_MIN_WIDTH = 48;
const PLATFORM_SPAWN_HEIGHT = 48;
const FLOOR_MIN_SPAN = 24;

export function createPlatformEditor({ stages, getStageLayout, setStagePlatforms, setStageGround, querySelector, getSelectedStageId, onChange }) {
  const editor = querySelector('#platformEditor');
  const canvas = querySelector('#platformEditorCanvas');
  const platformList = querySelector('#platformEditorList');
  let selectedStageId = '';
  let platforms = [];
  let selectedPlatform = -1;
  let dragState = null;

  restoreSavedPlatforms();
  querySelector('#editPlatformsButton').addEventListener('click', openEditor);
  querySelector('#closePlatformEditor').addEventListener('click', closeEditor);
  querySelector('#addPlatformButton').addEventListener('click', addPlatform);
  querySelector('#deletePlatformButton').addEventListener('click', deletePlatform);
  querySelector('#clearPlatformsButton').addEventListener('click', clearPlatforms);
  querySelector('#savePlatformsButton').addEventListener('click', savePlatforms);
  querySelector('#copyPlatformsButton').addEventListener('click', copyPlatformCode);
  platformList.addEventListener('click', handlePlatformListClick);
  platformList.addEventListener('change', handlePlatformSolidChange);
  editor.addEventListener('click', (event) => {
    if (event.target === editor) closeEditor();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !editor.hidden) closeEditor();
  });
  canvas.addEventListener('pointerdown', startPlatformDrag);
  canvas.addEventListener('pointermove', movePlatform);
  canvas.addEventListener('pointerup', stopPlatformDrag);
  canvas.addEventListener('pointercancel', stopPlatformDrag);

  function restoreSavedPlatforms() {
    try {
      const savedPlatforms = JSON.parse(localStorage.getItem(PLATFORM_STORAGE_KEY) || '{}');
      for (const stage of stages) {
        const savedLayout = savedPlatforms[stage.id];
        if (Array.isArray(savedLayout)) setStagePlatforms(stage.id, savedLayout);
        else if (savedLayout) {
          if (Array.isArray(savedLayout.platforms)) setStagePlatforms(stage.id, savedLayout.platforms);
          if (savedLayout.ground) setStageGround(stage.id, savedLayout.ground);
        }
      }
    } catch {
      localStorage.removeItem(PLATFORM_STORAGE_KEY);
    }
  }

  function openEditor() {
    selectedStageId = getSelectedStageId();
    platforms = getStageLayout(selectedStageId).platforms.map((platform) => ({ ...platform }));
    selectedPlatform = -1;
    editor.hidden = false;
    renderEditor();
  }

  function closeEditor() {
    editor.hidden = true;
    dragState = null;
  }

  function addPlatform() {
    const stage = getStageLayout(selectedStageId);
    const width = Math.min(PLATFORM_DEFAULT_WIDTH, stage.width);
    platforms.push({ x: (stage.width - width) / 2, w: width, y: Math.max(0, stage.floorY - PLATFORM_SPAWN_HEIGHT) });
    selectedPlatform = platforms.length - 1;
    applyPlatforms();
  }

  function deletePlatform() {
    if (selectedPlatform < 0) return;
    removePlatform(selectedPlatform);
  }

  function handlePlatformListClick(event) {
    const removeButton = event.target.closest('[data-remove-platform]');
    if (removeButton) {
      removePlatform(Number(removeButton.dataset.removePlatform));
      return;
    }
    const selectButton = event.target.closest('[data-select-platform]');
    if (!selectButton) return;
    selectedPlatform = Number(selectButton.dataset.selectPlatform);
    renderEditor();
  }

  function handlePlatformSolidChange(event) {
    const toggle = event.target.closest('[data-solid-platform]');
    if (!toggle) return;
    const platform = platforms[Number(toggle.dataset.solidPlatform)];
    if (!platform) return;
    platform.solid = toggle.checked;
    applyPlatforms();
  }

  function removePlatform(platformIndex) {
    if (platformIndex < 0 || platformIndex >= platforms.length) return;
    platforms.splice(platformIndex, 1);
    selectedPlatform = -1;
    applyPlatforms();
  }

  function clearPlatforms() {
    platforms = [];
    selectedPlatform = -1;
    applyPlatforms();
  }

  function startPlatformDrag(event) {
    const floorHandle = event.target.closest('[data-floor-mode]');
    if (floorHandle) {
      startFloorDrag(event, floorHandle.dataset.floorMode);
      return;
    }
    const platformElement = event.target.closest('[data-platform-index]');
    if (!platformElement) return;
    selectedPlatform = Number(platformElement.dataset.platformIndex);
    dragState = {
      pointerId: event.pointerId,
      mode: event.target.closest('.platform-resize-handle') ? 'resize' : 'move',
      clientX: event.clientX,
      clientY: event.clientY,
      ...platforms[selectedPlatform],
    };
    canvas.setPointerCapture(event.pointerId);
    renderEditor();
    event.preventDefault();
  }

  function startFloorDrag(event, mode) {
    const stage = getStageLayout(selectedStageId);
    dragState = {
      pointerId: event.pointerId,
      mode: `floor-${mode}`,
      clientX: event.clientX,
      clientY: event.clientY,
      floorY: stage.floorY,
      left: stage.playableLeft,
      right: stage.playableRight,
    };
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function movePlatform(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const stage = getStageLayout(selectedStageId);
    const bounds = canvas.getBoundingClientRect();
    const scaleX = stage.width / bounds.width;
    const scaleY = ARENA.height / bounds.height;
    const platform = platforms[selectedPlatform];
    if (dragState.mode.startsWith('floor-')) {
      moveFloor(event, stage, scaleX, scaleY);
      return;
    }
    if (dragState.mode === 'resize') {
      platform.w = clamp(dragState.w + (event.clientX - dragState.clientX) * scaleX, PLATFORM_MIN_WIDTH, stage.width - platform.x);
    } else {
      platform.x = clamp(dragState.x + (event.clientX - dragState.clientX) * scaleX, 0, stage.width - platform.w);
      platform.y = clamp(
        dragState.y + (event.clientY - dragState.clientY) * scaleY,
        0,
        ARENA.height - 1,
      );
    }
    applyPlatforms();
  }

  function moveFloor(event, stage, scaleX, scaleY) {
    const ground = { floorY: dragState.floorY, left: dragState.left, right: dragState.right };
    const deltaX = (event.clientX - dragState.clientX) * scaleX;
    const deltaY = (event.clientY - dragState.clientY) * scaleY;
    if (dragState.mode === 'floor-move') ground.floorY = clamp(dragState.floorY + deltaY, 0, ARENA.height - 1);
    if (dragState.mode === 'floor-left') ground.left = clamp(dragState.left + deltaX, 0, dragState.right - FLOOR_MIN_SPAN);
    if (dragState.mode === 'floor-right') ground.right = clamp(dragState.right + deltaX, dragState.left + FLOOR_MIN_SPAN, stage.width);
    setStageGround(selectedStageId, {
      floorY: ground.floorY,
      playableLeft: ground.left * ARENA.width / stage.width,
      playableRight: ground.right * ARENA.width / stage.width,
    });
    applyPlatforms();
  }

  function stopPlatformDrag(event) {
    if (dragState?.pointerId !== event.pointerId) return;
    dragState = null;
  }

  function applyPlatforms() {
    const stage = getStageLayout(selectedStageId);
    const scaleX = ARENA.width / stage.width;
    const scaleY = ARENA.floorY / stage.floorY;
    setStagePlatforms(selectedStageId, platforms.map((platform) => ({
      x: platform.x * scaleX,
      w: platform.w * scaleX,
      y: platform.y * scaleY,
      solid: !!platform.solid,
    })));
    platforms = getStageLayout(selectedStageId).platforms.map((platform) => ({ ...platform }));
    renderEditor();
    onChange();
  }

  function renderEditor() {
    const stage = getStageLayout(selectedStageId);
    canvas.style.setProperty('--editor-aspect', `${stage.width} / ${ARENA.height}`);
    canvas.style.backgroundImage = `linear-gradient(#0b182344,#0b182333),url('${stage.background}')`;
    canvas.innerHTML = platforms.map((platform, index) => {
      const selected = index === selectedPlatform;
      return `<button class="platform-editor-platform ${selected ? 'selected' : ''}" type="button" data-platform-index="${index}" aria-label="Platform ${index + 1}" style="left:${platform.x / stage.width * 100}%;top:${platform.y / ARENA.height * 100}%;width:${platform.w / stage.width * 100}%"><span>${index + 1}</span><i class="platform-resize-handle"></i></button>`;
    }).join('');
    const floor = document.createElement('i');
    floor.className = 'platform-editor-floor';
    floor.dataset.floorMode = 'move';
    floor.style.left = `${stage.playableLeft / stage.width * 100}%`;
    floor.style.top = `${stage.floorY / ARENA.height * 100}%`;
    floor.style.width = `${(stage.playableRight - stage.playableLeft) / stage.width * 100}%`;
    floor.innerHTML = '<span data-floor-mode="left" aria-label="Adjust floor left edge"></span><span data-floor-mode="right" aria-label="Adjust floor right edge"></span>';
    canvas.append(floor);
    platformList.innerHTML = platforms.map((platform, index) => (
      `<div class="platform-editor-row"><button class="platform-editor-select ${selectedPlatform === index ? 'selected' : ''}" type="button" data-select-platform="${index}">Platform ${index + 1} <small>X ${Math.round(platform.x)} · Y ${Math.round(platform.y)}</small></button><label class="platform-editor-solid"><input type="checkbox" data-solid-platform="${index}" ${platform.solid ? 'checked' : ''}>Solid</label><button class="platform-editor-remove" type="button" data-remove-platform="${index}" aria-label="Delete platform ${index + 1}">Remove</button></div>`
    )).join('') || '<p class="platform-editor-empty">No platforms on this stage.</p>';
    querySelector('#deletePlatformButton').disabled = selectedPlatform < 0;
    querySelector('#clearPlatformsButton').disabled = platforms.length === 0;
    querySelector('#platformEditorName').textContent = stage.name;
    querySelector('#platformEditorStatus').textContent = `${platforms.length} platforms · drag to move · resize at right · Solid blocks drop-through`;
  }

  function savePlatforms() {
    try {
      const savedPlatforms = JSON.parse(localStorage.getItem(PLATFORM_STORAGE_KEY) || '{}');
      savedPlatforms[selectedStageId] = { platforms: toBaseCoordinates(), ground: toBaseGround() };
      localStorage.setItem(PLATFORM_STORAGE_KEY, JSON.stringify(savedPlatforms));
      querySelector('#platformEditorStatus').textContent = 'Saved on this device. Guests receive the layout when the match starts.';
    } catch {
      querySelector('#platformEditorStatus').textContent = 'Could not save in this browser.';
    }
  }

  async function copyPlatformCode() {
    const ground = toBaseGround();
    const code = `floorY: ${ground.floorY}, playableLeft: ${ground.playableLeft}, playableRight: ${ground.playableRight},\nplatforms: ${JSON.stringify(toBaseCoordinates())},`;
    const output = querySelector('#platformCodeOutput');
    try {
      await navigator.clipboard.writeText(code);
      output.hidden = true;
      querySelector('#platformEditorStatus').textContent = 'Platform config copied. Paste it into this stage in src/config.js.';
    } catch {
      output.value = code;
      output.hidden = false;
      output.focus();
      output.select();
      querySelector('#platformEditorStatus').textContent = 'Copy is unavailable here. The config is selected below.';
    }
  }

  function toBaseCoordinates() {
    const stage = getStageLayout(selectedStageId);
    return platforms.map((platform) => ({
      x: round(platform.x * ARENA.width / stage.width),
      w: round(platform.w * ARENA.width / stage.width),
      y: round(platform.y * ARENA.floorY / stage.floorY),
      solid: !!platform.solid,
    }));
  }

  function toBaseGround() {
    const stage = getStageLayout(selectedStageId);
    return {
      floorY: stage.floorY,
      playableLeft: round(stage.playableLeft * ARENA.width / stage.width),
      playableRight: round(stage.playableRight * ARENA.width / stage.width),
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function round(value) {
    return Math.round(value * 10) / 10;
  }
}
