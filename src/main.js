// Application composition root. This module loads ducks and stage art, owns
// the shared runtime and browser event/frame lifecycle, and wires the UI,
// PeerJS room, simulation, controls, and canvas renderer together.
import { loadStageBackgrounds } from './game/stage-art.js';
import { createDuckAssets } from './ducks/assets.js';
import { createGameSimulation } from './game/simulation.js';
import { createBattleRenderer } from './game/renderer.js';
import { createPeerRoom } from './network/peer-room.js';
import { createControlSettings } from './ui/controls.js';
import { createPlatformEditor } from './ui/platform-editor.js';
import { createRosterUI } from './ui/roster.js';
import { createAudioFeedback } from './ui/audio.js';
import {
  API_URL, ARENA, BATTLE_MODES, COLORS, CONTROL_LABELS, DEFAULT_CONTROLS, MAP_EDITOR_ACCESS_SEQUENCE, MATCH_OPTIONS, SHEETS, SPRITE_SHEET, STAGES, TEST_DUCK_ACCESS_SEQUENCE, TIMING, getStageLayout, setStageGround, setStagePlatforms,
} from './config.js';


  
// Shared game and room state
let selectedStageId = 'cloud-steps';
let stageSelectionOpen = false;
const querySelector = (selector) => document.querySelector(selector);
const querySelectorAll = (selector) => Array.from(document.querySelectorAll(selector));

let ducks = [];
let players = [];
let spectators = [];
let peer = null;
let connections = new Map();
let roomCode = '';
let isHost = false;
let myPlayerId = '';
let modeVotes = {};
let isSpectator = false;
let practiceMode = false;
let battleOptions = { startingStocks: 3, itemFrequency: 'normal', tournament: false };
let replayFrames = [];
let replayEvents = [];
let lastReplayFrame = -MATCH_OPTIONS.replayFrameInterval;
let latestReplay = null;
let replayStartedAt = '';
let tournamentState = null;
let hoverDuck = null;
let toastTimer;

// Control bindings can be changed independently of game input handling.
const state = { screen: 'lobby', query: '', apiStatus: 'loading' };
let controlBindings = { ...DEFAULT_CONTROLS };
let remappingAction = null;

let game = {
  active: false,
  entities: [],
  inputs: {},
  winnerId: null,
  finished: false,
  particles: [],
  shake: 0,
};
let pendingGameEvents = [];
let pendingNetworkEvents = [];
let matchResultRendered = false;
let gameFrame = 0;
let lastInputSend = 0;
let lastSnapshotSend = 0;
let lastHudRender = 0;
let showPlatforms = false;
let mapEditorAccessUnlocked = false;
let mapEditorAccessProgress = 0;
let testDuckAccessUnlocked = false;
let testDuckAccessProgress = 0;
let pressedKeys = new Set();
let remoteTargets = new Map();
const runtime = {
  get ducks() { return ducks; },
  set ducks(value) { ducks = value; },
  get players() { return players; },
  set players(value) { players = value; },
  get spectators() { return spectators; },
  set spectators(value) { spectators = value || []; },
  get peer() { return peer; },
  set peer(value) { peer = value; },
  get connections() { return connections; },
  get roomCode() { return roomCode; },
  set roomCode(value) { roomCode = value; },
  get myPlayerId() { return myPlayerId; },
  set myPlayerId(value) { myPlayerId = value; },
  get modeVotes() { return modeVotes; },
  set modeVotes(value) { modeVotes = value || {}; },
  get isHost() { return isHost; },
  set isHost(value) { isHost = value; },
  get isSpectator() { return isSpectator; },
  set isSpectator(value) { isSpectator = value; },
  get practiceMode() { return practiceMode; },
  set practiceMode(value) { practiceMode = value; },
  get battleOptions() { return battleOptions; },
  set battleOptions(value) { battleOptions = value; },
  get tournamentState() { return tournamentState; },
  set tournamentState(value) { tournamentState = value; },
  get stageSelectionOpen() { return stageSelectionOpen; },
  set stageSelectionOpen(value) { stageSelectionOpen = value; },
  get selectedStageId() { return selectedStageId; },
  set selectedStageId(value) { selectedStageId = value; },
  get hoverDuck() { return hoverDuck; },
  set hoverDuck(value) { hoverDuck = value; },
  get state() { return state; },
  get controlBindings() { return controlBindings; },
  set controlBindings(value) { controlBindings = value; },
  get remappingAction() { return remappingAction; },
  set remappingAction(value) { remappingAction = value; },
  get gameFrame() { return gameFrame; },
  set gameFrame(value) { gameFrame = value; },
  get remoteTargets() { return remoteTargets; },
  get localInput() { return localInput; },
  set localInput(value) { localInput = value; },
  get pressedKeys() { return pressedKeys; },
  get game() { return game; },
  set game(value) { game = value; },
  get showPlatforms() { return showPlatforms; },
  set showPlatforms(value) { showPlatforms = value; },
  get testDuckAccessUnlocked() { return testDuckAccessUnlocked; },
  get pendingGameEvents() { return pendingGameEvents; },
  set matchResultRendered(value) { matchResultRendered = value; },
};
// Shared helpers
function toSafeString(value) {
  return value == null ? '' : String(value);
}


function escapeHtml(value) {
  const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return toSafeString(value).replace(/[&<>"']/g, (character) => replacements[character]);
}


const duckAssets = createDuckAssets({
  sheets: SHEETS,
  spriteSheet: SPRITE_SHEET,
  colors: COLORS,
  escapeHtml,
});
querySelector('#changeTrainingDuckButton').addEventListener('click', restartSelection);
const { spriteLoadPromise, spriteCache, normalizeDuck, getDuckGraphic } = duckAssets;

function notify(message) {
  const toast = querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
}

const audioFeedback = createAudioFeedback({ querySelector, notify });

function setNotice(message = '') {
  querySelector('#lobbyNotice').textContent = message;
}

function setConnection(isOnline, label) {
  querySelector('#connectionDot').classList.toggle('live', isOnline);
  querySelector('#connectionText').textContent = label;
}

// Duck API and sprite composition
async function loadDucks() {
  setApiStatus('loading', 'Connecting to duck database...');
  try {
    const [response] = await Promise.all([
      fetch(API_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' }),
      spriteLoadPromise,
    ]);
    if (!response.ok) throw new Error('API returned ' + response.status);
    const responseData = await response.json();
    const duckRows = Array.isArray(responseData)
      ? responseData
      : responseData.ducks || responseData.data || responseData.results || [];
    if (!Array.isArray(duckRows)) throw new Error('Unexpected roster response');
    ducks = duckRows.map(normalizeDuck);
    const message = duckAssets.spriteSheetsReady
      ? ducks.length + ' ducks loaded ? unready ducks are locked'
      : 'Sprite sheets could not load ? ducks are locked';
    setApiStatus('ready', message);
    renderRoster();
  } catch (error) {
    ducks = [];
    setApiStatus('error', 'Could not load the duck roster. Check the API connection and reload.');
    querySelector('#rosterScroll').innerHTML = '<div class="loading" style="display:block;text-align:center;padding:45px 20px;line-height:1.6">The duck API could not be reached.<br><small>' + escapeHtml(error.message) + '</small><br><button class="btn btn-dark" style="margin-top:14px" onclick="location.reload()">Try again</button></div>';
    querySelector('#rosterCount').textContent = 'Unavailable';
  }
}


function setApiStatus(status, message) {
  state.apiStatus = status;
  const statusElement = querySelector('#dataState');
  statusElement.classList.toggle('ready', status === 'ready');
  statusElement.classList.toggle('error', status === 'error');
  querySelector('#dataMessage').textContent = message;
}
  
function getCurrentPlayer() {
  return players.find((player) => player.id === myPlayerId);
}


function selectDuckForPlayer(duck) {
  if (!duck?.selectable || (duck.testOnly && !testDuckAccessUnlocked) || game.active) return;
  const player = getCurrentPlayer();
  if (!player) return;
  player.ready = false;
  if (isHost) {
    player.duckId = duck.id;
    broadcastState();
  } else {
    const hostConnection = connections.get('host');
    if (!hostConnection?.open) {
      notify('Room connection was lost.');
      return;
    }
    hostConnection.send({ type: 'select', duckId: duck.id });
  }
  player.duckId = duck.id;
  renderDuckDetails(duck);
  renderRoster();
  renderPlayers();
}


// Room and player selection
const rosterUI = createRosterUI({
  runtime,
  querySelector,
  querySelectorAll,
  getCurrentPlayer,
  getDuckGraphic,
  escapeHtml,
  selectDuckForPlayer,
});
const { renderRoster, renderDuckDetails, renderPlayers } = rosterUI;

function setActiveScreen(screenName) {
  state.screen = screenName;
  querySelector('#lobbyScreen').classList.toggle('active', screenName === 'lobby');
  querySelector('#selectScreen').classList.toggle('active', screenName === 'select');
  querySelector('#stageScreen').classList.toggle('active', screenName === 'stage');
  querySelector('#gameScreen').classList.toggle('active', screenName === 'game');
}
  
function enterCharacterSelection() {
  setActiveScreen('select');
  querySelector('#roomCodeDisplay').textContent = roomCode;
  renderPlayers();
  loadDucks();
}
  
const emptyInput = () => ({
    left:false,right:false,jump:false,up:false,down:false,attack:false,smash:false,special:false,dropItem:false,shield:false
  });
const simulation = createGameSimulation(runtime, emptyInput);
function startTrainingMatch() {
  const player = getCurrentPlayer();
  if (!practiceMode || !player?.duckId) return;
  const dummy = {
    id: 'training-dummy',
    name: 'Training Dummy',
    slot: 2,
    color: '#b7c8d8',
    duckId: player.duckId,
    trainingDummy: true,
  };
  game = simulation.createMatch([player, dummy], selectedStageId, 'stock', {
    training: true,
    itemFrequency: 'off',
  });
  const practicePlayer = game.entities.find((fighter) => fighter.id === player.id);
  const practiceDummy = game.entities.find((fighter) => fighter.trainingDummy);
  practicePlayer.spawnX = game.stageLayout.width * 0.35;
  practicePlayer.x = practicePlayer.spawnX;
  practicePlayer.y = game.stageLayout.floorY - 38;
  practicePlayer.spawnPlatformTimer = 0;
  practicePlayer.grounded = true;
  practiceDummy.spawnX = game.stageLayout.width * 0.65;
  practiceDummy.x = practiceDummy.spawnX;
  practiceDummy.y = game.stageLayout.floorY - 38;
  practiceDummy.spawnPlatformY = game.stageLayout.floorY;
  practiceDummy.spawnPlatformTimer = 0;
  practiceDummy.grounded = true;
  resetReplayCapture();
  querySelector('#battleRoomCode').textContent = 'PRACTICE';
  querySelector('#exitBattle').textContent = 'Exit practice';
  querySelector('#battleResult').hidden = true;
  querySelector('#spectatorStatus').hidden = true;
  querySelector('#resetTrainingButton').hidden = false;
  querySelector('#changeTrainingDuckButton').hidden = false;
  querySelector('#battleStatus').textContent = 'Practice · hit the dummy to test moves';
  setActiveScreen('game');
  audioFeedback.play('start');
  renderBattleHud();
  if (!gameFrame) gameFrame = requestAnimationFrame(gameLoop);
}

const peerRoom = createPeerRoom(runtime, {
  querySelector,
  setNotice,
  notify,
  setConnection,
  enterCharacterSelection,
  broadcastState,
  emptyInput,
  snapshotGame,
  removeDisconnectedFighter: simulation.removeDisconnectedFighter,
  resetExpiredPlayer: simulation.removeDisconnectedFighter,
  restartSelection,
  setActiveScreen,
  renderRoster,
  renderPlayers,
  renderRoomSpectators,
  renderDuckDetails,
  renderStageMenu,
  updateTournamentResult,
  applyStageDefinition,
  prepareReplayCapture: resetReplayCapture,
  applySnapshot,
  gameLoop,
});
const { hostRoom, joinExisting, copyRoomCode, leaveRoom } = peerRoom;
function toggleReady() {
    const p=getCurrentPlayer();if(!p?.duckId||game.active)return;if(isHost) {
      p.ready=!p.ready;broadcastState()
    }
    else {
      const conn=connections.get('host');if(!conn?.open) {
        notify('Room connection was lost.');return
      }
      p.ready=!p.ready;conn.send( {
        type:'ready',ready:p.ready
      });renderPlayers()
    }
}
  
function maybeStartGame() {
    if(!isHost||game.active)return;const active=players.filter(p=>p.online!==false);if(active.length<2||active.some(p=>!p.duckId||!p.ready))return;if(!stageSelectionOpen) {
      stageSelectionOpen=true;modeVotes={};setActiveScreen('stage');renderStageMenu();querySelector('#stageRoomCode').textContent=roomCode;broadcastState()
    }
}
  
function renderStageMenu() {
  const host = isHost;
  renderRoomSpectators();
  querySelector('#stockCount').value = String(battleOptions.startingStocks);
  querySelector('#stockCount').disabled = !host;
  querySelector('#itemFrequency').value = battleOptions.itemFrequency;
  querySelector('#itemFrequency').disabled = !host;
  querySelector('#tournamentToggle').checked = !!battleOptions.tournament;
  querySelector('#tournamentToggle').disabled = !host || !!tournamentState?.active;
  querySelector('#stageIntro').textContent = tournamentState?.active
    ? `Tournament round ${tournamentState.round} · match ${tournamentState.currentMatch + 1} of ${tournamentState.matches.length}`
    : host ? 'Choose a distinct arena. Stage sizes range from compact to huge.'
    : 'The host is choosing the stage...';
  querySelector('#stageWaitMessage').textContent = host
    ? `Players ready: ${players.filter((player) => player.online !== false && player.ready).length}/${players.filter((player) => player.online !== false).length} · ${spectators.length} spectator${spectators.length === 1 ? '' : 's'}`
    : 'Waiting for the host to start the battle.';
  querySelector('#stageCards').innerHTML = STAGES.map((stage) => {
    const layout = getStageLayout(stage.id);
    const selected = stage.id === selectedStageId;
    const platforms = stage.hidePlatforms ? '' : layout.platforms.map((platform) => (
      `<i style="left:${(platform.x + platform.w / 2) / layout.width * 100}%;top:${Math.max(5, Math.min(78, (platform.y - 155) / 250 * 80))}%;width:${Math.max(8, platform.w / layout.width * 100)}%"></i>`
    )).join('');
    return `<button class="stage-card ${selected ? 'selected' : ''}" type="button" data-stage-id="${stage.id}" ${host ? '' : 'disabled'} style="--sky-a:${stage.sky[0]};--sky-b:${stage.sky[1]};--stage-top:${stage.top}"><span class="stage-selected">${selected ? 'SELECTED' : ''}</span><strong>${stage.name}</strong><small>${stage.tag}</small><div class="stage-preview stage-preview-${stage.id}" style="background-image:linear-gradient(#15243644,#15243688),url('${stage.background}');background-size:cover;background-position:center;background-repeat:no-repeat">${platforms}</div><small>${layout.width} × ${layout.floorY + 120} arena · ${layout.platforms.length} platforms</small></button>`;
  }).join('');
  querySelector('#startBattleButton').hidden = !host;
  querySelector('#stageBackButton').hidden = !host;
  querySelector('#editPlatformsButton').hidden = !host || !mapEditorAccessUnlocked;
  const tournamentMatchPlayers = getTournamentMatchPlayers();
  const canStartTournamentMatch = tournamentState?.active
    && tournamentMatchPlayers.length === 2
    && tournamentMatchPlayers.every((player) => player.online !== false && player.duckId);
  querySelector('#startBattleButton').disabled = !host || (tournamentState?.active
    ? !canStartTournamentMatch
    : players.filter((player) => player.online !== false).length < 2
      || players.some((player) => player.online !== false && !player.ready));
  renderModeVotes();
  }

function renderModeVotes() {
  const selectedMode = modeVotes[myPlayerId];
  const eligibleIds = new Set(players.filter((player) => player.online !== false).map((player) => player.id));
  for (const button of querySelectorAll('[data-rule-mode]')) {
    const mode = button.dataset.ruleMode;
    const votes = Object.entries(modeVotes).filter(([playerId, vote]) => eligibleIds.has(playerId) && vote === mode).length;
    button.classList.toggle('selected', selectedMode === mode);
    button.setAttribute('aria-pressed', String(selectedMode === mode));
    button.querySelector('[data-vote-count]').textContent = `${votes} vote${votes === 1 ? '' : 's'}`;
  }
  const mode = BATTLE_MODES.find((candidate) => candidate.id === selectedMode);
  const voteCount = Object.keys(modeVotes).filter((playerId) => eligibleIds.has(playerId)).length;
  querySelector('#ruleVoteStatus').textContent = mode ? `Your vote: ${mode.name}` : voteCount ? 'Choose your battle rules' : 'No votes yet · defaults to Stock';
}

function resolveBattleMode() {
  const eligibleIds = new Set(players.filter((player) => player.online !== false).map((player) => player.id));
  const votes = Object.entries(modeVotes).filter(([playerId]) => eligibleIds.has(playerId)).map(([, mode]) => mode);
  const counts = BATTLE_MODES.map((mode) => ({ mode, count: votes.filter((vote) => vote === mode.id).length }));
  const highest = Math.max(0, ...counts.map((entry) => entry.count));
  const tied = counts.filter((entry) => entry.count === highest);
  if (highest === 0) return 'stock';
  const hostVote = modeVotes[myPlayerId];
  return (tied.find((entry) => entry.mode.id === hostVote) || tied[0]).mode.id;
}

function createTournamentState(activePlayers) {
  const playersForBracket = activePlayers.map((player) => player.id);
  const bye = playersForBracket.length % 2 ? playersForBracket.pop() : null;
  const matches = [];
  for (let index = 0; index < playersForBracket.length; index += 2) {
    matches.push(playersForBracket.slice(index, index + 2));
  }
  return {
    active: true,
    round: 1,
    matches,
    currentMatch: 0,
    winners: bye ? [bye] : [],
    championId: null,
  };
}

function getTournamentMatchPlayers() {
  const matchIds = tournamentState?.matches[tournamentState.currentMatch];
  if (!matchIds) return [];
  return matchIds.map((playerId) => players.find((player) => player.id === playerId)).filter(Boolean);
}

function advanceTournamentAfterMatch() {
  if (!isHost || !tournamentState?.active || game.training || !game.finished) return;
  const matchIds = tournamentState.matches[tournamentState.currentMatch] || [];
  const rankedFighters = [...game.entities].sort((left, right) => (
    right.stocks - left.stocks || left.damage - right.damage || right.kos - left.kos
  ));
  const winnerId = game.winnerId || rankedFighters[0]?.id;
  if (!winnerId || tournamentState.lastResolvedMatch === tournamentState.currentMatch) return;
  tournamentState.lastResolvedMatch = tournamentState.currentMatch;
  tournamentState.winners.push(winnerId);
  tournamentState.currentMatch += 1;
  if (tournamentState.currentMatch < tournamentState.matches.length) {
    return;
  }
  if (tournamentState.winners.length === 1) {
    tournamentState.championId = tournamentState.winners[0];
    return;
  }
  const nextPlayers = [...tournamentState.winners];
  const bye = nextPlayers.length % 2 ? nextPlayers.pop() : null;
  tournamentState.matches = [];
  for (let index = 0; index < nextPlayers.length; index += 2) {
    tournamentState.matches.push(nextPlayers.slice(index, index + 2));
  }
  tournamentState.currentMatch = 0;
  tournamentState.winners = bye ? [bye] : [];
  tournamentState.round += 1;
  delete tournamentState.lastResolvedMatch;
}
  
// Match setup and network snapshots
function startMatch() {
  if (!isHost || !stageSelectionOpen || game.active) return;
  let activePlayers = players.filter((player) => player.online !== false);
  if (battleOptions.tournament && !tournamentState?.active) {
    if (activePlayers.length < 2 || activePlayers.some((player) => !player.duckId || !player.ready)) return;
    tournamentState = createTournamentState(activePlayers);
  }
  if (tournamentState?.active) {
    activePlayers = getTournamentMatchPlayers();
    if (activePlayers.length !== 2 || activePlayers.some((player) => player.online === false || !player.duckId)) return;
  } else if (activePlayers.length < 2 || activePlayers.some((player) => !player.duckId || !player.ready)) return;

  stageSelectionOpen = false;
  const rulesMode = resolveBattleMode();
  game = simulation.createMatch(activePlayers, selectedStageId, rulesMode, battleOptions);
  resetReplayCapture();
  remoteTargets.clear();
  matchResultRendered = false;
  querySelector('#battleRoomCode').textContent = roomCode;
  querySelector('#exitBattle').textContent = 'Leave room';
  querySelector('#editMapButton').hidden = !isHost || !mapEditorAccessUnlocked;
  querySelector('#battleResult').hidden = true;
  querySelector('#battleResult').innerHTML = '';
  querySelector('#resetTrainingButton').hidden = true;
  querySelector('#changeTrainingDuckButton').hidden = true;
  querySelector('#battleStatus').textContent = 'BRAWL!';
  setActiveScreen('game');
  renderBattleHud();

  const startMessage = { type: 'game-start', players, spectators, tournamentState, battleOptions, game: snapshotGame() };
  for (const connection of connections.values()) {
    if (connection.open) connection.send(startMessage);
  }
  broadcastState();
  if (!gameFrame) gameFrame = requestAnimationFrame(gameLoop);
}
function snapshotGame() {
    return {
      active:game.active,stageId:game.stageId||selectedStageId,stageLayout:game.stageLayout,rulesMode:game.rulesMode,timeRemaining:game.timeRemaining,stageSelection:stageSelectionOpen,finished:game.finished,winnerId:game.winnerId,inputs:game.inputs,entities:game.entities.map(e=>( {
        ...e,stats: {
          ...e.stats
        }
        })),projectiles:game.projectiles||[],items:game.items||[],itemSpawnIn:game.itemSpawnIn,elapsedTime:game.elapsedTime||0,koEffects:game.koEffects||[],smashBall:game.smashBall||null,cinematic:game.cinematic||null,particles:game.particles,shake:game.shake,hazard:game.hazard||null,hazardTimer:game.hazardTimer,training:!!game.training,matchOptions:game.matchOptions||battleOptions
    }
}
  
function renderUltimateCutscene() {
    const panel=querySelector('#ultimateCutscene'),cut=game.cinematic;if(!cut) {
      panel.hidden=true;delete panel.dataset.owner;return
    }
    panel.hidden=false;panel.dataset.phase=cut.phase||'intro';panel.dataset.facing=(cut.facing||1)<0?'left':'right';const fighter=game.entities.find(e=>e.id===cut.ownerId),duck=ducks.find(d=>d.id===fighter?.duckId),facing=cut.facing||1;panel.style.setProperty('--focus-x',facing>0?'88%':'12%');panel.style.setProperty('--focus-y','50%');panel.style.setProperty('--beam-angle',facing>0?'0deg':'180deg');panel.style.setProperty('--beam-length','110%');if(panel.dataset.owner!==cut.ownerId) {
      panel.dataset.owner=cut.ownerId;querySelector('#ultimateSprite').innerHTML=duck?getDuckGraphic(duck):'';querySelector('#ultimateName').textContent=duck?duck.name.toUpperCase()+"'S FINAL SMASH":'FINAL SMASH'
    }
    querySelector('#ultimateCaption').textContent=cut.phase==='intro'?'The arena falls silent. Face your rival.':cut.phase==='reveal'?'FORWARD! Unleash the flock!':cut.phase==='impact'?'FULL POWER. NO ESCAPE.':'A shockwave tears across the arena.'
  }
  
function applySnapshot(s, networkEvents = []) {
  if (!s) return;
  for (const event of networkEvents) {
    replayEvents.push({ frame: game.elapsedTime || 0, ...event });
    if (event.type === 'attack') audioFeedback.play('attack');
    if (event.type === 'hit') audioFeedback.play('hit');
    if (event.type === 'ko') audioFeedback.play('ko');
    if (event.type === 'smash-ball-claimed') audioFeedback.play('smash');
    if (event.type === 'smash-ball-spawned') audioFeedback.play('start');
    if (event.type === 'stage-hazard') {
      querySelector('#battleStatus').textContent = `Stage hazard: ${event.hazard}`;
      audioFeedback.play('menu');
    }
  }
  const wasFinished = game.finished;
  const incoming = s.entities || [];
  if (!isHost && game.entities.length) {
    const previousFighters = new Map(game.entities.map((fighter) => [fighter.id, fighter]));
    game.entities = incoming.map((fighter) => {
      const previous = previousFighters.get(fighter.id);
      if (!previous) return fighter;
      remoteTargets.set(fighter.id, fighter);
      return { ...fighter, x: previous.x, y: previous.y, damage: previous.damage, focus: previous.focus, guard: previous.guard };
    });
  } else game.entities = incoming;
  Object.assign(game, {
    stageId: s.stageId || game.stageId || selectedStageId,
    stageLayout: s.stageLayout || getStageLayout(s.stageId || game.stageId || selectedStageId),
    rulesMode: s.rulesMode || 'stock',
    timeRemaining: s.timeRemaining ?? null,
    inputs: s.inputs || game.inputs,
    projectiles: s.projectiles || [],
    items: s.items || [],
    itemSpawnIn: s.itemSpawnIn || 0,
    elapsedTime: s.elapsedTime || 0,
    koEffects: s.koEffects || [],
    smashBall: s.smashBall || null,
    cinematic: s.cinematic || null,
    particles: s.particles || [],
    shake: s.shake || 0,
    hazard: s.hazard || null,
    hazardTimer: s.hazardTimer,
    training: !!s.training,
    matchOptions: s.matchOptions || battleOptions,
    active: !!s.active,
    finished: !!s.finished,
    winnerId: s.winnerId || null,
  });
  querySelector('#editMapButton').hidden = !isHost || !mapEditorAccessUnlocked || !game.active;
  querySelector('#resetTrainingButton').hidden = !game.training;
  querySelector('#changeTrainingDuckButton').hidden = !game.training;
  querySelector('#spectatorStatus').hidden = !isSpectator;
  querySelector('#touchControls').hidden = isSpectator;
  if (!game.active) return;
  querySelector('#battleRoomCode').textContent = roomCode;
  querySelector('#battleResult').hidden = !game.finished;
  if (game.finished && !wasFinished) {
    matchResultRendered = false;
    renderMatchResult();
  }
  if (!game.finished) {
    if (game.cinematic) querySelector('#battleStatus').textContent = 'FINAL SMASH!';
    else if (game.smashBall) querySelector('#battleStatus').textContent = 'SMASH BALL! Break it before your rival!';
    else if (localFighter()?.ultimateReady) querySelector('#battleStatus').textContent = 'FINAL SMASH READY - FACE YOUR OPPONENT + SPECIAL';
    else querySelector('#battleStatus').textContent = isSpectator ? 'Watching the battle' : 'Fight!';
  }
  setActiveScreen('game');
  renderUltimateCutscene();
  querySelector('#smashWarning').hidden = !game.smashBall;
  renderBattleHud();
}
  
function renderBattleHud() {
  const local = getCurrentPlayer();
  const stamina = game.rulesMode === 'stamina';
  querySelector('#battleHud').innerHTML = game.entities.map((fighter) => {
    const duck = ducks.find((candidate) => candidate.id === fighter.duckId);
    const damage = Math.max(0, fighter.damage || 0);
    const hp = Math.max(0, 100 - damage);
    const bar = stamina ? hp : Math.min(100, damage);
    const itemNames = { blaster: 'Blaster · attack to fire', bomb: 'Bomb · attack to throw', banana: 'Banana · attack to throw', isaac: 'Isaac · attack to summon' };
    const itemInfo = fighter.weapon ? `<div class="item-equipped">${itemNames[fighter.weapon.type] || 'Item · attack to use'} (${fighter.weapon.ammo})</div>` : '';
    const stocks = stamina ? '' : `<div class="stock-dots">${Array.from({ length: fighter.maxStocks || 3 }, (_, index) => `<i class="${index >= fighter.stocks ? 'lost' : ''}"></i>`).join('')}</div>`;
    const meterLabel = stamina ? `${Math.ceil(hp)} HP` : `${Math.round(damage)}%`;
    return `<div class="battle-fighter ${fighter.ultimateReady ? 'ultimate-ready' : ''}" style="--pcolor:${fighter.color};--damage-heat:${bar}%"><img class="battle-avatar" src="${spriteCache.get(fighter.duckId) || ''}" alt=""><div class="battle-meta"><div class="battle-player">P${fighter.slot} · ${escapeHtml(fighter.name)}${fighter.id === local?.id ? ' (YOU)' : ''}</div><div class="battle-duck">${escapeHtml(duck?.name || 'Duck')}</div>${itemInfo}${fighter.ultimateReady ? '<div class="ultimate-badge">FACE + SPECIAL</div>' : ''}${stocks}<div class="focus-track"><i style="width:${Math.max(0, fighter.focus || 0)}%"></i></div><div class="guard-track"><i style="width:${Math.max(0, fighter.guard || 0)}%"></i></div><div class="damage-track"><i></i></div></div><div class="battle-damage">${meterLabel}<small>${stamina ? 'STAMINA' : `FOCUS ${Math.round(fighter.focus)}%`}</small></div></div>`;
  }).join('');
  if (game.rulesMode === 'timed' && game.timeRemaining != null && game.active && !game.finished) {
    const seconds = Math.ceil(game.timeRemaining / 60);
    querySelector('#battleStatus').textContent = `TIME ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · TIMED BATTLE`;
  }
}
  
function sendInput() {
    if (isSpectator) return;
    lastInputSend=performance.now();if(isHost) {
      game.inputs[myPlayerId]= {
        ...localInput
      };return
    }
    const c=connections.get('host');if(c?.open)c.send( {
      type:'input',input:localInput
    })
  }
  
let localInput=emptyInput();
function localFighter() {
    return game.entities.find(e=>e.id===myPlayerId)
  }
  
function isUltimateReady() {
    return !!localFighter()?.ultimateReady
  }
  
function setInputState(key,on) {
    localInput[key]=on;sendInput()
  }

const controlSettings = createControlSettings({
  runtime,
  querySelector,
  querySelectorAll,
  emptyInput,
  sendInput,
  setInputState,
  escapeHtml,
});
const { bindControlSettings, bindBattleInputs } = controlSettings;
  
function broadcastState() {
    renderPlayers();renderRoster();renderRoomSpectators();if(hoverDuck)renderDuckDetails(hoverDuck);const packet= {
      type:'state',players,spectators,stageSelection:stageSelectionOpen,stageId:selectedStageId,modeVotes,battleOptions,tournamentState,stageDefinition:getStageDefinition(selectedStageId)
    };for(const conn of connections.values())if(conn.open)conn.send(packet);maybeStartGame()
  }

function renderRoomSpectators() {
  const content = spectators.length
    ? `Spectators: ${spectators.map((spectator) => `${escapeHtml(spectator.name)}${spectator.online === false ? ' (reconnecting)' : ''}`).join(' · ')}`
    : '';
  querySelector('#roomSpectators').textContent = content;
  querySelector('#stageSpectators').textContent = content;
}

function getStageDefinition(stageId) {
  const stage = STAGES.find((candidate) => candidate.id === stageId);
  if (!stage) return null;
  const layout = getStageLayout(stageId);
  return {
    id: stage.id,
    platforms: stage.platforms.map((platform) => ({ x: platform.x, w: platform.w, y: platform.y, solid: !!platform.solid })),
    floorY: layout.floorY,
    blastY: layout.blastY,
    playableLeft: layout.playableLeft * ARENA.width / layout.width,
    playableRight: layout.playableRight * ARENA.width / layout.width,
  };
}

function applyStageDefinition(definition) {
  if (!definition || !STAGES.some((stage) => stage.id === definition.id)) return;
  if (!Array.isArray(definition.platforms) || definition.platforms.length > MATCH_OPTIONS.maximumSharedPlatforms
      || definition.platforms.some((platform) => !platform || typeof platform !== 'object')) return;
  const numericValues = [
    definition.floorY,
    definition.playableLeft,
    definition.playableRight,
    ...definition.platforms.flatMap((platform) => [platform.x, platform.w, platform.y]),
  ];
  if (definition.blastY != null) numericValues.push(definition.blastY);
  if (!numericValues.every(Number.isFinite)) return;
  if (definition.floorY < 100 || definition.floorY > 700
      || definition.playableLeft < 0 || definition.playableRight > ARENA.width
      || definition.playableLeft >= definition.playableRight) return;
  if (definition.platforms.some((platform) => platform.x < 0 || platform.w < 1
      || platform.x + platform.w > ARENA.width || platform.y < -100 || platform.y > 800)) return;
  setStagePlatforms(definition.id, definition.platforms);
  setStageGround(definition.id, {
    floorY: definition.floorY,
    blastY: definition.blastY,
    playableLeft: definition.playableLeft,
    playableRight: definition.playableRight,
  });
}
  
// Host-authoritative gameplay simulation
function interpolateRemoteFighters() {
    if(isHost)return;for(const e of game.entities) {
      const t=remoteTargets.get(e.id);if(!t)continue;e.x+=(t.x-e.x)*.28;e.y+=(t.y-e.y)*.28;e.damage+=(t.damage-e.damage)*.32;e.focus+=(t.focus-e.focus)*.32;e.guard+=(t.guard-e.guard)*.32;e.facing=t.facing;e.stocks=t.stocks;e.eliminated=t.eliminated;e.respawn=t.respawn;e.invuln=t.invuln;e.attacking=t.attacking;e.guarding=t.guarding
    }
}
  
const stageBackgroundImages = loadStageBackgrounds(STAGES);
const drawBattle = createBattleRenderer({ runtime, querySelector, backgroundImages: stageBackgroundImages, spriteCache });

// Canvas rendering
function renderPendingGameEvents() {
  for (const event of pendingGameEvents) {
    replayEvents.push({ frame: game.elapsedTime || 0, ...event });
    pendingNetworkEvents.push(event);
    if (event.type === 'attack') audioFeedback.play('attack');
    if (event.type === 'hit') audioFeedback.play('hit');
    if (event.type === 'ko') audioFeedback.play('ko');
    if (event.type === 'stage-hazard') {
      querySelector('#battleStatus').textContent = `Stage hazard: ${event.hazard}`;
      audioFeedback.play('menu');
    }
    if (event.type === 'smash-ball-spawned') {
      querySelector('#battleStatus').textContent = 'SMASH BALL! Break it before your rival!';
      audioFeedback.play('start');
    }
    if (event.type === 'smash-ball-claimed') {
      querySelector('#battleStatus').textContent = event.playerName + ' got the Smash Ball! Face your opponent and press Special!';
      notify(event.playerName + ' has a Final Smash!');
      audioFeedback.play('smash');
    }
  }
  pendingGameEvents = [];
}
function renderSmashBallWarning() {
  const warning = querySelector('#smashWarning');
  warning.hidden = !game.smashBall;
  if (game.smashBall) warning.textContent = 'SMASH BALL ? ' + game.smashBall.hp + ' HITS TO BREAK';
}
function renderMatchResult() {
  if (!game.finished || matchResultRendered) return;
  advanceTournamentAfterMatch();
  captureReplayFrame(true);
  const winner = game.entities.find((fighter) => fighter.id === game.winnerId);
  const rankedFighters = [...game.entities].sort((left, right) => (
    right.kos - left.kos || right.damageDealt - left.damageDealt || left.falls - right.falls
  ));
  const resultTitle = game.training ? 'Practice complete' : winner ? `${escapeHtml(winner.name)} wins!` : 'Draw';
  const standings = rankedFighters.map((fighter, index) => `
    <div class="recap-row"><b>${index + 1}. ${escapeHtml(fighter.name)}</b>
      <span>${fighter.kos} KOs · ${fighter.falls} falls · ${Math.round(fighter.damageDealt)} damage dealt</span></div>
  `).join('');
  const highlights = replayEvents
    .filter((event) => event.type === 'ko' || event.type === 'smash-ball-claimed')
    .slice(-5)
    .map((event) => `<div class="recap-highlight">${event.type === 'ko' ? `${escapeHtml(event.playerName)} was KO'd` : `${escapeHtml(event.playerName)} claimed the Smash Ball`}</div>`)
    .join('') || '<div class="recap-highlight">No highlight events recorded.</div>';
  const controls = game.training
    ? '<button class="btn btn-gold" data-training-reset>Reset practice</button><button class="btn btn-dark" data-selection>Choose another duck</button>'
    : tournamentState?.active
      ? `<button class="btn btn-gold" data-rematch>${tournamentState.championId ? 'Finish tournament' : 'Next bracket match'}</button>`
      : '<button class="btn btn-gold" data-rematch>Rematch</button><button class="btn btn-dark" data-selection>Back to character select</button>';
  querySelector('#battleResult').innerHTML = `
    <div class="recap-heading">${resultTitle}</div>
    <span>${game.training ? 'Training dummy stats reset whenever it is knocked out.' : 'Match results · run it back or choose new fighters.'}</span>
    <div class="recap-table">${standings}</div>
    <div class="recap-highlights"><b>Highlights</b>${highlights}</div>
    <div class="recap-actions">${controls}<button class="btn btn-dark" data-download-replay ${replayFrames.length ? '' : 'disabled'}>Download replay</button></div>`;
  querySelector('#battleResult').hidden = false;
  querySelector('#battleStatus').textContent = game.training ? 'Practice paused' : 'Battle complete';
  latestReplay = {
    roomCode,
    stageId: game.stageId,
    rulesMode: game.rulesMode,
    startedAt: replayStartedAt,
    players: game.entities.map(({ id, name, duckId }) => ({ id, name, duckId })),
    frames: replayFrames,
    events: replayEvents,
  };
  matchResultRendered = true;
  if (isHost && tournamentState?.active) broadcastState();
}

function updateTournamentResult() {
  const rematchButton = querySelector('#battleResult [data-rematch]');
  if (!rematchButton || !tournamentState?.active) return;
  rematchButton.textContent = tournamentState.championId ? 'Finish tournament' : 'Next bracket match';
}

function captureReplayFrame(force = false) {
  const frame = game.elapsedTime || 0;
  if (!force && frame - lastReplayFrame < MATCH_OPTIONS.replayFrameInterval) return;
  replayFrames.push({ frame, state: snapshotGame() });
  lastReplayFrame = frame;
}

function resetReplayCapture() {
  replayFrames = [];
  replayEvents = [];
  pendingNetworkEvents = [];
  lastReplayFrame = -MATCH_OPTIONS.replayFrameInterval;
  replayStartedAt = new Date().toISOString();
  latestReplay = null;
}

function downloadReplay() {
  if (!latestReplay) {
    latestReplay = {
      roomCode,
      stageId: game.stageId,
      rulesMode: game.rulesMode,
      players: game.entities.map(({ id, name, duckId }) => ({ id, name, duckId })),
      frames: replayFrames,
      events: replayEvents,
    };
  }
  const file = new Blob([JSON.stringify(latestReplay, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = `super-smash-ducky-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
function sendGameSnapshotIfDue(now) {
  if (!isHost || !game.active) return;
  const interval = game.cinematic ? TIMING.cinematicSnapshotIntervalMs : TIMING.snapshotIntervalMs;
  if (!game.needsFinalSnapshot && now - lastSnapshotSend <= interval) return;
  lastSnapshotSend = now;
  game.needsFinalSnapshot = false;
  const message = { type: 'game-state', game: snapshotGame(), events: pendingNetworkEvents };
  pendingNetworkEvents = [];
  for (const connection of connections.values()) {
    if (connection.open) connection.send(message);
  }
}
// Frame orchestration and controls
function gameLoop() {
  gameFrame = 0;
  const now = performance.now();
  if (!isHost && state.screen === 'game' && now - lastInputSend > TIMING.inputSendIntervalMs) sendInput();
  interpolateRemoteFighters();
  simulation.updateGameSimulation(1);
  if (game.active && !game.finished) captureReplayFrame();
  renderPendingGameEvents();
  renderSmashBallWarning();
  renderUltimateCutscene();
  renderMatchResult();
  if (game.active) drawBattle();
  if (now - lastHudRender > TIMING.hudRefreshIntervalMs) {
    lastHudRender = now;
    renderBattleHud();
  }
  sendGameSnapshotIfDue(now);
  if (game.active) gameFrame = requestAnimationFrame(gameLoop);
}
function restartSelection() {
    if (practiceMode) {
      game.active = false;
      game.finished = false;
      game.entities = [];
      querySelector('#resetTrainingButton').hidden = true;
      querySelector('#changeTrainingDuckButton').hidden = true;
      setActiveScreen('select');
      renderPlayers();
      return;
    }
    if(!isHost) {
      const c=connections.get('host');if(c?.open)c.send( {
        type:'rematch'
      });return
    }
    if (tournamentState?.active && !tournamentState.championId) {
      game.active = false;
      game.finished = false;
      game.entities = [];
      game.projectiles = [];
      game.items = [];
      matchResultRendered = false;
      stageSelectionOpen = true;
      modeVotes = {};
      setActiveScreen('stage');
      renderStageMenu();
      broadcastState();
      return;
    }
    if (tournamentState?.championId) {
      tournamentState = null;
      battleOptions = { ...battleOptions, tournament: false };
    }
    game.active = false;
    game.finished = false;
    stageSelectionOpen = false;
    matchResultRendered = false;
    game.entities = [];
    game.particles = [];
    remoteTargets.clear();
    players.forEach((player) => { player.ready = false; });
    querySelector('#battleResult').hidden = true;
    setActiveScreen('select');
    broadcastState();
    for (const connection of connections.values()) {
      if (connection.open) connection.send({
        type: 'select-again',
        players,
        spectators,
        battleOptions,
        tournamentState,
      });
    }
  }

function returnToMapEditor() {
  if (!isHost || !mapEditorAccessUnlocked || !game.active) return;
  selectedStageId = game.stageId || selectedStageId;
  game.active = false;
  game.finished = false;
  game.cinematic = null;
  stageSelectionOpen = true;
  setActiveScreen('stage');
  renderStageMenu();
  querySelector('#stageRoomCode').textContent = roomCode;
  broadcastState();
}

function handleMapEditorAccessKey(event) {
  const isAccessScreen = state.screen === 'lobby' || state.screen === 'stage';
  const isTextEntry = event.target?.closest?.('input, textarea, select, [contenteditable="true"]');
  if (!isAccessScreen || isTextEntry || event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
    mapEditorAccessProgress = 0;
    return;
  }
  const pressedKey = event.key.toLowerCase();
  const expectedKey = MAP_EDITOR_ACCESS_SEQUENCE[mapEditorAccessProgress];
  if (pressedKey === expectedKey) {
    mapEditorAccessProgress += 1;
  } else {
    mapEditorAccessProgress = pressedKey === MAP_EDITOR_ACCESS_SEQUENCE[0] ? 1 : 0;
  }
  if (mapEditorAccessProgress !== MAP_EDITOR_ACCESS_SEQUENCE.length) return;
  mapEditorAccessProgress = 0;
  if (mapEditorAccessUnlocked) return;
  mapEditorAccessUnlocked = true;
  if (state.screen === 'stage') renderStageMenu();
  querySelector('#editMapButton').hidden = !isHost || !game.active;
  notify('Map editing unlocked for this tab. The room host can access the editor.');
}

function handleTestDuckAccessKey(event) {
  const isAccessScreen = ['lobby', 'select', 'stage'].includes(state.screen);
  const isTextEntry = event.target?.closest?.('input, textarea, select, [contenteditable="true"]');
  if (!isAccessScreen || isTextEntry || event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
    testDuckAccessProgress = 0;
    return;
  }
  const pressedKey = event.key.toLowerCase();
  const expectedKey = TEST_DUCK_ACCESS_SEQUENCE[testDuckAccessProgress];
  testDuckAccessProgress = pressedKey === expectedKey
    ? testDuckAccessProgress + 1
    : pressedKey === TEST_DUCK_ACCESS_SEQUENCE[0] ? 1 : 0;
  if (testDuckAccessProgress !== TEST_DUCK_ACCESS_SEQUENCE.length) return;
  testDuckAccessProgress = 0;
  if (testDuckAccessUnlocked) return;
  testDuckAccessUnlocked = true;
  renderRoster();
  notify('Test ducks unlocked for this tab.');
}
  
// UI event wiring
function bindUiEvents() {
window.addEventListener('keydown', handleMapEditorAccessKey);
window.addEventListener('keydown', handleTestDuckAccessKey);
querySelector('#stageCards').addEventListener('click', (event) => {
  const stageCard = event.target.closest('[data-stage-id]');
  if (!stageCard || !isHost || !stageSelectionOpen) return;
  selectedStageId = stageCard.dataset.stageId;
  renderStageMenu();
  broadcastState();
});
for (const optionId of ['#stockCount', '#itemFrequency', '#tournamentToggle']) {
  querySelector(optionId).addEventListener('change', () => {
    if (!isHost || !stageSelectionOpen) return;
    battleOptions = {
      ...battleOptions,
      startingStocks: Number(querySelector('#stockCount').value),
      itemFrequency: querySelector('#itemFrequency').value,
      tournament: querySelector('#tournamentToggle').checked,
    };
    broadcastState();
  });
}
querySelector('.rules-options').addEventListener('click', (event) => {
  const button = event.target.closest('[data-rule-mode]');
  if (!button || !stageSelectionOpen || game.active) return;
  if (isHost) {
    modeVotes = { ...modeVotes, [myPlayerId]: button.dataset.ruleMode };
    renderModeVotes();
    broadcastState();
  } else {
    const connection = connections.get('host');
    if (connection?.open) connection.send({ type: 'mode-vote', mode: button.dataset.ruleMode });
  }
});
querySelector('#startBattleButton').addEventListener('click', startMatch);
querySelector('#editMapButton').addEventListener('click', returnToMapEditor);
querySelector('#platformVisibilityToggle').addEventListener('click', () => {
  showPlatforms = !showPlatforms;
  const button = querySelector('#platformVisibilityToggle');
  button.textContent = showPlatforms ? 'Hide extra platforms' : 'Show all platforms';
  button.setAttribute('aria-pressed', String(showPlatforms));
});
querySelector('#stageBackButton').addEventListener('click', () => {
  if (!isHost) return;
  stageSelectionOpen = false;
  players.forEach((player) => { player.ready = false; });
  setActiveScreen('select');
  broadcastState();
});
querySelector('#battleResult').addEventListener('click', (event) => {
  if (event.target.closest('[data-rematch]')) restartSelection();
  if (event.target.closest('[data-selection]')) restartSelection();
  if (event.target.closest('[data-training-reset]')) simulation.resetTraining();
  if (event.target.closest('[data-download-replay]')) downloadReplay();
});
querySelector('#startPractice').addEventListener('click', () => {
  practiceMode = true;
  isHost = true;
  isSpectator = false;
  myPlayerId = 'p1';
  roomCode = 'PRACTICE';
  players = [{ id: 'p1', name: 'Player', slot: 1, color: '#ed5143', duckId: null, online: true }];
  enterCharacterSelection();
});
querySelector('#startTrainingButton').addEventListener('click', startTrainingMatch);
querySelector('#resetTrainingButton').addEventListener('click', () => {
  simulation.resetTraining();
  querySelector('#battleResult').hidden = true;
  renderBattleHud();
});
querySelector('#readyButton').addEventListener('click', toggleReady);
querySelector('#exitBattle').addEventListener('click', leaveRoom);
bindControlSettings();
bindBattleInputs();
audioFeedback.bindSettings();

createPlatformEditor({
  stages: STAGES,
  getStageLayout,
  setStageGround,
  setStagePlatforms,
  querySelector,
  getSelectedStageId: () => selectedStageId,
  canOpen: () => isHost && mapEditorAccessUnlocked && stageSelectionOpen,
  onChange: () => {
    if (game.active && game.stageId === selectedStageId) game.stageLayout = getStageLayout(selectedStageId);
    renderStageMenu();
    if (isHost) broadcastState();
  },
});

querySelector('#createRoom').addEventListener('click', hostRoom);
querySelector('#joinRoom').addEventListener('click', joinExisting);
querySelector('#leaveRoom').addEventListener('click', leaveRoom);
querySelector('#copyCode').addEventListener('click', copyRoomCode);

querySelector('#roomCode').addEventListener('input', (event) => {
  event.target.value = event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6);
  setNotice('');
});
querySelector('#searchInput').addEventListener('input', (event) => {
  state.query = event.target.value;
  querySelector('#clearSearch').classList.toggle('show', !!state.query);
  renderRoster();
});
querySelector('#clearSearch').addEventListener('click', () => {
  querySelector('#searchInput').value = '';
  state.query = '';
  querySelector('#clearSearch').classList.remove('show');
  renderRoster();
  querySelector('#searchInput').focus();
});
querySelector('#searchInput').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') querySelector('#clearSearch').click();
});
}

bindUiEvents();
