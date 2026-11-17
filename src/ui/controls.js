// Builds the control-remapping interface and translates keyboard, touch, or controller
// input into game actions using each player's current bindings. It tracks key
// state and sends the resulting inputs through the supplied callbacks.
import { CONTROL_LABELS, DEFAULT_CONTROLS } from '../config.js';

export function createControlSettings({ runtime, querySelector, querySelectorAll, emptyInput, sendInput, setInputState, escapeHtml }) {
  const gamepadActions = emptyInput();
  const previousGamepadButtons = new Map();
  const GAMEPAD_DEADZONE = 0.35;

  function getConnectedGamepads() {
    return Array.from(navigator.getGamepads?.() || []).filter((gamepad) => gamepad?.connected);
  }

  function isGamepadButtonPressed(gamepad, buttonIndex) {
    const button = gamepad.buttons[buttonIndex];
    return !!button?.pressed || (button?.value || 0) > 0.5;
  }

  function findActiveGamepad() {
    const gamepads = getConnectedGamepads();
    return gamepads.find((gamepad) => (
      gamepad.buttons.some((button) => button.pressed || button.value > 0.5)
      || gamepad.axes.some((axis) => Math.abs(axis) > GAMEPAD_DEADZONE)
    )) || gamepads[0];
  }

  function readGamepadInput(gamepad) {
    const horizontalAxis = gamepad.axes[0] || 0;
    const verticalAxis = gamepad.axes[1] || 0;
    const dpadHorizontalAxis = gamepad.axes[6] || 0;
    const dpadVerticalAxis = gamepad.axes[7] || 0;
    const standardInput = {
      left: isGamepadButtonPressed(gamepad, 14) || horizontalAxis < -GAMEPAD_DEADZONE || dpadHorizontalAxis < -GAMEPAD_DEADZONE,
      right: isGamepadButtonPressed(gamepad, 15) || horizontalAxis > GAMEPAD_DEADZONE || dpadHorizontalAxis > GAMEPAD_DEADZONE,
      up: isGamepadButtonPressed(gamepad, 12) || verticalAxis < -GAMEPAD_DEADZONE || dpadVerticalAxis < -GAMEPAD_DEADZONE,
      down: isGamepadButtonPressed(gamepad, 13) || verticalAxis > GAMEPAD_DEADZONE || dpadVerticalAxis > GAMEPAD_DEADZONE,
      jump: isGamepadButtonPressed(gamepad, 0),
      attack: isGamepadButtonPressed(gamepad, 2),
      smash: isGamepadButtonPressed(gamepad, 3),
      special: isGamepadButtonPressed(gamepad, 1),
      dropItem: isGamepadButtonPressed(gamepad, 5),
      shield: isGamepadButtonPressed(gamepad, 4),
    };
    return Object.fromEntries(Object.entries(standardInput).map(([action, isPressed]) => {
      const binding = runtime.controlBindings[action];
      if (!binding.startsWith('GamepadButton')) return [action, isPressed];
      const buttonIndex = Number(binding.slice('GamepadButton'.length));
      return [action, isGamepadButtonPressed(gamepad, buttonIndex)];
    }));
  }

  function captureGamepadRemap(gamepads) {
    for (const gamepad of gamepads) {
      gamepad.buttons.forEach((button, buttonIndex) => {
        const key = `${gamepad.index}:${buttonIndex}`;
        const wasPressed = previousGamepadButtons.get(key) || false;
        const isPressed = !!button.pressed || button.value > 0.5;
        previousGamepadButtons.set(key, isPressed);
        if (!runtime.remappingAction || !isPressed || wasPressed) return;
        assignBinding(`GamepadButton${buttonIndex}`);
      });
    }
  }

  function pollGamepadInput() {
    const gamepads = getConnectedGamepads();
    captureGamepadRemap(gamepads);
    if (runtime.state.screen === 'game' && !runtime.isSpectator && querySelector('#controlsModal').hidden) {
      const gamepad = findActiveGamepad();
      const controllerInput = gamepad ? readGamepadInput(gamepad) : emptyInput();
      const nextInput = Object.fromEntries(Object.keys(controllerInput).map((action) => {
        const binding = runtime.controlBindings[action];
        const otherInputPressed = [...runtime.pressedKeys].some((key) => (
          normalizeKey(key) === binding || key === `Touch-${action}`
        ));
        return [action, controllerInput[action] || otherInputPressed];
      }));
      for (const action of Object.keys(gamepadActions)) {
        if (gamepadActions[action] === nextInput[action]) continue;
        gamepadActions[action] = nextInput[action];
        setInputState(action, nextInput[action]);
      }
    } else {
      for (const action of Object.keys(gamepadActions)) {
        if (!gamepadActions[action]) continue;
        gamepadActions[action] = false;
        setInputState(action, false);
      }
    }
    requestAnimationFrame(pollGamepadInput);
  }

  function normalizeKey(key) {
    if (key === ' ') return 'Space';
    return key.length === 1 ? key.toLowerCase() : key;
  }

  function formatKeyLabel(key) {
    const labels = {
      Space: 'SPACE',
      ArrowLeft: '←',
      ArrowRight: '→',
      ArrowUp: '↑',
      ArrowDown: '↓',
      MouseLeft: 'MOUSE LEFT',
      MouseMiddle: 'MOUSE MIDDLE',
      MouseRight: 'MOUSE RIGHT',
      MouseBack: 'MOUSE BACK',
      MouseForward: 'MOUSE FORWARD',
    };
    if (key.startsWith('GamepadButton')) return `PAD ${Number(key.slice(13)) + 1}`;
    return labels[key] || key.toUpperCase();
  }

  function getMouseBinding(button) {
    return ['MouseLeft', 'MouseMiddle', 'MouseRight', 'MouseBack', 'MouseForward'][button] || null;
  }

  function renderControlHints() {
    querySelectorAll('.battle-controls [data-key]').forEach((element) => {
      element.textContent = formatKeyLabel(runtime.controlBindings[element.dataset.key]);
    });
  }

  function renderControlRows() {
    const rows = Object.entries(CONTROL_LABELS).map(([action, label]) => `
      <div class="control-row">
        <span>${label}</span>
        <kbd class="control-key">${escapeHtml(formatKeyLabel(runtime.controlBindings[action]))}</kbd>
        <button class="icon-btn" type="button" data-remap-action="${action}">
          ${runtime.remappingAction === action ? 'Press a key…' : 'Remap'}
        </button>
      </div>
    `).join('');
    querySelector('#controlRows').innerHTML = rows;
    renderControlHints();
  }

  function setControlsOpen(isOpen) {
    const modal = querySelector('#controlsModal');
    modal.hidden = !isOpen;
    runtime.remappingAction = null;
    let feedback = 'Controls are ready.';
    if (isOpen) {
      feedback = getConnectedGamepads().length
        ? 'Controller detected. Use Remap to assign its buttons.'
        : 'No controller detected by the browser. Connect it, press a button, then try Remap.';
    }
    querySelector('#controlFeedback').textContent = feedback;

    if (isOpen) {
      runtime.localInput = emptyInput();
      runtime.pressedKeys.clear();
      sendInput();
      renderControlRows();
      modal.querySelector('[data-remap-action]')?.focus();
      return;
    }
    querySelector('#controlsButton').focus();
  }

  function beginRemap(action) {
    runtime.remappingAction = action;
    querySelector('#controlFeedback').textContent = `Press a key, mouse button, or controller button for ${CONTROL_LABELS[action]}. Press Escape to cancel.`;
    renderControlRows();
    querySelector(`#controlRows [data-remap-action="${action}"]`).focus();
  }

  function handleRemapKey(event) {
    if (querySelector('#controlsModal').hidden) return;
    if (event.key === 'Tab' && !runtime.remappingAction) return;
    if (!runtime.remappingAction && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      setControlsOpen(false);
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    if (!runtime.remappingAction) return;
    if (event.key === 'Escape') {
      runtime.remappingAction = null;
      querySelector('#controlFeedback').textContent = 'Remapping cancelled.';
      renderControlRows();
      return;
    }
    if (['Control', 'Alt', 'Shift', 'Meta', 'Tab'].includes(event.key)) return;

    const key = normalizeKey(event.key);
    assignBinding(key);
  }

  function handleRemapMouse(event) {
    if (querySelector('#controlsModal').hidden || !runtime.remappingAction) return;
    const key = getMouseBinding(event.button);
    if (!key) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    assignBinding(key);
  }

  function assignBinding(key) {
    const collision = Object.entries(runtime.controlBindings)
      .find(([action, boundKey]) => action !== runtime.remappingAction && boundKey === key);
    if (collision) {
      querySelector('#controlFeedback').textContent = `${formatKeyLabel(key)} is already assigned to ${CONTROL_LABELS[collision[0]]}.`;
      return;
    }

    runtime.controlBindings[runtime.remappingAction] = key;
    runtime.remappingAction = null;
    querySelector('#controlFeedback').textContent = 'Control updated.';
    renderControlRows();
  }

  function handleMouseInput(event, isPressed) {
    if (runtime.state.screen !== 'game' || runtime.isSpectator || !querySelector('#controlsModal').hidden) return;
    const key = getMouseBinding(event.button);
    if (!key || !Object.values(runtime.controlBindings).includes(key)) return;
    event.preventDefault();
    if (isPressed) {
      if (runtime.pressedKeys.has(key)) return;
      runtime.pressedKeys.add(key);
    } else runtime.pressedKeys.delete(key);
    const action = Object.entries(runtime.controlBindings).find(([, binding]) => binding === key)?.[0];
    if (action) setInputState(action, isPressed);
  }

  function bindControlSettings() {
    querySelector('#controlsButton').addEventListener('click', () => setControlsOpen(true));
    querySelector('#closeControls').addEventListener('click', () => setControlsOpen(false));
    querySelector('#resetControls').addEventListener('click', () => {
      runtime.controlBindings = { ...DEFAULT_CONTROLS };
      runtime.remappingAction = null;
      querySelector('#controlFeedback').textContent = 'Default controls restored.';
      renderControlRows();
    });
    querySelector('#controlRows').addEventListener('click', (event) => {
      const button = event.target.closest('[data-remap-action]');
      if (button) beginRemap(button.dataset.remapAction);
    });
    querySelector('#controlsModal').addEventListener('click', (event) => {
      if (event.target === querySelector('#controlsModal')) setControlsOpen(false);
    });
    window.addEventListener('keydown', handleRemapKey, true);
    window.addEventListener('mousedown', handleRemapMouse, true);
  }

  function bindBattleInputs() {
    requestAnimationFrame(pollGamepadInput);
    window.addEventListener('blur', () => {
      runtime.localInput = emptyInput();
      runtime.pressedKeys.clear();
      sendInput();
    });
    window.addEventListener('keydown', (event) => {
      if (runtime.state.screen !== 'game' || runtime.isSpectator || !querySelector('#controlsModal').hidden) return;
      const action = Object.entries(runtime.controlBindings)
        .find(([, key]) => key === normalizeKey(event.key))?.[0];
      if (!action) return;
      event.preventDefault();
      if (runtime.pressedKeys.has(event.key)) return;
      runtime.pressedKeys.add(event.key);
      setInputState(action, true);
    });
    window.addEventListener('keyup', (event) => {
      const action = Object.entries(runtime.controlBindings)
        .find(([, key]) => key === normalizeKey(event.key))?.[0];
      if (!action) return;
      runtime.pressedKeys.delete(event.key);
      setInputState(action, false);
    });
    window.addEventListener('mousedown', (event) => handleMouseInput(event, true));
    window.addEventListener('mouseup', (event) => handleMouseInput(event, false));
    window.addEventListener('blur', () => {
      for (const key of [...runtime.pressedKeys]) {
        const action = Object.entries(runtime.controlBindings).find(([, binding]) => binding === key)?.[0];
        if (action && key.startsWith('Mouse')) setInputState(action, false);
      }
    });
    querySelector('#touchControls').querySelectorAll('button[data-control]').forEach((button) => {
      const action = button.dataset.control;
      const press = (event) => {
        if (runtime.isSpectator) return;
        event.preventDefault();
        button.classList.add('pressed');
        runtime.pressedKeys.add(`Touch-${action}`);
        setInputState(action, true);
      };
      const release = (event) => {
        event.preventDefault();
        button.classList.remove('pressed');
        runtime.pressedKeys.delete(`Touch-${action}`);
        setInputState(action, false);
      };
      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
    });
  }

  return { bindControlSettings, bindBattleInputs };
}
