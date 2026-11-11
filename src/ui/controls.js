// Builds the control-remapping interface and translates keyboard or touch
// input into game actions using each player's current bindings. It tracks key
// state and sends the resulting inputs through the supplied callbacks.
import { CONTROL_LABELS, DEFAULT_CONTROLS } from '../config.js';

export function createControlSettings({ runtime, querySelector, querySelectorAll, emptyInput, sendInput, setInputState, escapeHtml }) {
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
    querySelector('#controlFeedback').textContent = 'Controls are ready.';

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
    querySelector('#controlFeedback').textContent = `Press a key or mouse button for ${CONTROL_LABELS[action]}. Press Escape to cancel.`;
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
        setInputState(action, true);
      };
      const release = (event) => {
        event.preventDefault();
        button.classList.remove('pressed');
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
