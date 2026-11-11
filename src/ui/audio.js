const SETTINGS_KEY = 'smd-settings';

export function createAudioFeedback({ querySelector, notify }) {
  const settings = loadSettings();
  let audioContext = null;
  let musicTimer = null;
  let musicStep = 0;
  let effectsVolume = settings.effectsVolume ?? 0.65;
  let musicVolume = settings.musicVolume ?? 0.2;
  let audioUnavailableNotified = false;

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
      return {
        effectsVolume: clamp(saved.effectsVolume, 0, 1, 0.65),
        musicVolume: clamp(saved.musicVolume, 0, 1, 0.2),
        touchSize: clamp(saved.touchSize, 0.75, 1.5, 1),
        touchOpacity: clamp(saved.touchOpacity, 0.45, 1, 0.85),
        touchOffset: clamp(saved.touchOffset, 0, 80, 0),
      };
    } catch (error) {
      notify(`Could not load saved settings: ${error.message}`);
      return {};
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        effectsVolume,
        musicVolume,
        touchSize: Number(querySelector('#touchSize').value),
        touchOpacity: Number(querySelector('#touchOpacity').value),
        touchOffset: Number(querySelector('#touchOffset').value),
      }));
    } catch (error) {
      notify(`Could not save settings: ${error.message}`);
    }
  }

  function getAudioContext() {
    if (!audioContext) {
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) {
        if (!audioUnavailableNotified) {
          notify('Audio is unavailable in this browser.');
          audioUnavailableNotified = true;
        }
        return null;
      }
      audioContext = new AudioContextConstructor();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch((error) => notify(`Could not start audio: ${error.message}`));
    }
    return audioContext;
  }

  function playTone(frequency, duration, volume, type = 'sine', slide = 0) {
    const context = getAudioContext();
    if (!context || volume <= 0) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function play(eventName) {
    const sounds = {
      attack: [230, 0.06, -90],
      hit: [150, 0.12, -95],
      ko: [540, 0.35, -420],
      smash: [410, 0.5, 720],
      menu: [480, 0.08, 120],
      start: [330, 0.4, 390],
    };
    const sound = sounds[eventName];
    if (sound) playTone(sound[0], sound[1], effectsVolume * 0.22, eventName === 'hit' ? 'triangle' : 'sine', sound[2]);
  }

  function updateMusic() {
    if (musicVolume <= 0) {
      window.clearInterval(musicTimer);
      musicTimer = null;
      return;
    }
    if (musicTimer) return;
    musicTimer = window.setInterval(() => {
      const notes = [196, 246.94, 293.66, 246.94, 220, 261.63, 329.63, 261.63];
      playTone(notes[musicStep % notes.length], 0.28, musicVolume * 0.07, 'triangle');
      musicStep += 1;
    }, 420);
  }

  function renderSettings() {
    querySelector('#effectsVolume').value = String(effectsVolume);
    querySelector('#musicVolume').value = String(musicVolume);
    querySelector('#touchSize').value = String(settings.touchSize ?? 1);
    querySelector('#touchOpacity').value = String(settings.touchOpacity ?? 0.85);
    querySelector('#touchOffset').value = String(settings.touchOffset ?? 0);
    applyTouchSettings();
  }

  function applyTouchSettings() {
    const controls = querySelector('#touchControls');
    controls.style.setProperty('--touch-scale', querySelector('#touchSize').value);
    controls.style.setProperty('--touch-opacity', querySelector('#touchOpacity').value);
    controls.style.setProperty('--touch-offset', `${querySelector('#touchOffset').value}px`);
  }

  function openSettings(isOpen) {
    querySelector('#settingsModal').hidden = !isOpen;
    if (isOpen) querySelector('#closeSettings').focus();
    else querySelector('#settingsButton').focus();
  }

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(minimum, Math.min(maximum, number));
  }

  function bindSettings() {
    renderSettings();
    querySelector('#settingsButton').addEventListener('click', () => openSettings(true));
    querySelector('#closeSettings').addEventListener('click', () => openSettings(false));
    querySelector('#settingsModal').addEventListener('click', (event) => {
      if (event.target === querySelector('#settingsModal')) openSettings(false);
    });
    querySelector('#settingsModal').addEventListener('input', () => {
      effectsVolume = Number(querySelector('#effectsVolume').value);
      musicVolume = Number(querySelector('#musicVolume').value);
      if (musicVolume > 0) updateMusic();
      applyTouchSettings();
      saveSettings();
    });
    window.addEventListener('pointerdown', () => {
      getAudioContext();
      updateMusic();
    }, { once: true });
  }

  return { bindSettings, play };
}
