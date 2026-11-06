// Application composition root. This module loads ducks and stage art, owns
// the shared runtime and browser event/frame lifecycle, and wires the UI,
// PeerJS room, simulation, controls, and canvas renderer together.
import { loadStageBackgrounds } from './game/stage-art.js';
import { createDuckAssets } from './ducks/assets.js';
import { createGameSimulation } from './game/simulation.js';
import { createBattleRenderer } from './game/renderer.js';
import { createPeerRoom } from './network/peer-room.js';
import { createControlSettings } from './ui/controls.js';
import { createRosterUI } from './ui/roster.js';
import {
  API_URL, COLORS, CONTROL_LABELS, DEFAULT_CONTROLS, SHEETS, SPRITE_SHEET, STAGES, TIMING, getStageLayout,
} from './config.js';


  
// Shared game and room state
let selectedStageId = 'ducky-dome';
let stageSelectionOpen = false;
const querySelector = (selector) => document.querySelector(selector);
const querySelectorAll = (selector) => Array.from(document.querySelectorAll(selector));

let ducks = [];
let players = [];
let peer = null;
let connections = new Map();
let roomCode = '';
let isHost = false;
let myPlayerId = '';
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
let matchResultRendered = false;
let gameFrame = 0;
let lastInputSend = 0;
let lastSnapshotSend = 0;
let lastHudRender = 0;
let pressedKeys = new Set();
let remoteTargets = new Map();
const runtime = {
  get ducks() { return ducks; },
  set ducks(value) { ducks = value; },
  get players() { return players; },
  set players(value) { players = value; },
  get peer() { return peer; },
  set peer(value) { peer = value; },
  get connections() { return connections; },
  get roomCode() { return roomCode; },
  set roomCode(value) { roomCode = value; },
  get myPlayerId() { return myPlayerId; },
  set myPlayerId(value) { myPlayerId = value; },
  get isHost() { return isHost; },
  set isHost(value) { isHost = value; },
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
const { spriteLoadPromise, spriteCache, normalizeDuck, getDuckGraphic } = duckAssets;

function notify(message) {
  const toast = querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
}

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
  if (!duck?.selectable || game.active) return;
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
    setActiveScreen('select');querySelector('#roomCodeDisplay').textContent=roomCode;renderPlayers();loadDucks()
  }
  
const emptyInput = () => ({
    left:false,right:false,jump:false,up:false,down:false,attack:false,smash:false,special:false,dropItem:false,shield:false
  });
const simulation = createGameSimulation(runtime, emptyInput);
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
  restartSelection,
  setActiveScreen,
  renderRoster,
  renderPlayers,
  renderDuckDetails,
  renderStageMenu,
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
      stageSelectionOpen=true;setActiveScreen('stage');renderStageMenu();querySelector('#stageRoomCode').textContent=roomCode;broadcastState()
    }
}
  
function renderStageMenu() {
  const host = isHost;
  querySelector('#stageIntro').textContent = host
    ? 'Choose a distinct arena. Stage sizes range from compact to huge.'
    : 'The host is choosing the stage...';
  querySelector('#stageWaitMessage').textContent = host
    ? `Players ready: ${players.filter((player) => player.online !== false && player.ready).length}/${players.filter((player) => player.online !== false).length}`
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
  querySelector('#startBattleButton').disabled = !host || players.filter((player) => player.online !== false).length < 2
    || players.some((player) => player.online !== false && !player.ready);
  }
  
// Match setup and network snapshots
function startMatch() {
  if (!isHost || !stageSelectionOpen || game.active) return;
  const activePlayers = players.filter((player) => player.online !== false);
  if (activePlayers.length < 2 || activePlayers.some((player) => !player.duckId || !player.ready)) return;

  stageSelectionOpen = false;
  game = simulation.createMatch(activePlayers, selectedStageId);
  remoteTargets.clear();
  matchResultRendered = false;
  querySelector('#battleRoomCode').textContent = roomCode;
  querySelector('#battleResult').hidden = true;
  querySelector('#battleResult').innerHTML = '';
  querySelector('#battleStatus').textContent = 'BRAWL!';
  setActiveScreen('game');
  renderBattleHud();

  const startMessage = { type: 'game-start', players, game: snapshotGame() };
  for (const connection of connections.values()) {
    if (connection.open) connection.send(startMessage);
  }
  broadcastState();
  if (!gameFrame) gameFrame = requestAnimationFrame(gameLoop);
}
function snapshotGame() {
    return {
      active:game.active,stageId:game.stageId||selectedStageId,stageLayout:game.stageLayout,stageSelection:stageSelectionOpen,finished:game.finished,winnerId:game.winnerId,inputs:game.inputs,entities:game.entities.map(e=>( {
        ...e,stats: {
          ...e.stats
        }
        })),projectiles:game.projectiles||[],items:game.items||[],itemSpawnIn:game.itemSpawnIn,elapsedTime:game.elapsedTime||0,koEffects:game.koEffects||[],smashBall:game.smashBall||null,cinematic:game.cinematic||null,particles:game.particles,shake:game.shake
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
  
function applySnapshot(s) {
    if(!s)return;const incoming=s.entities||[];if(!isHost&&game.entities.length) {
      const prior=new Map(game.entities.map(e=>[e.id,e]));game.entities=incoming.map(next=> {
        const old=prior.get(next.id);if(!old)return next;remoteTargets.set(next.id,next);return {
          ...next,x:old.x,y:old.y,damage:old.damage,focus:old.focus,guard:old.guard
        }
})
    }
    else game.entities=incoming;game.stageId=s.stageId||game.stageId||selectedStageId;game.stageLayout=s.stageLayout||getStageLayout(game.stageId);game.inputs=s.inputs||game.inputs;game.projectiles=s.projectiles||[];game.items=s.items||[];game.itemSpawnIn=s.itemSpawnIn||0;game.elapsedTime=s.elapsedTime||0;game.koEffects=s.koEffects||[];game.smashBall=s.smashBall||null;game.cinematic=s.cinematic||null;game.particles=s.particles||[];game.shake=s.shake||0;game.active=!!s.active;game.finished=!!s.finished;game.winnerId=s.winnerId||null;if(game.active) {
      querySelector('#battleRoomCode').textContent=roomCode;querySelector('#battleResult').hidden=!game.finished;if(game.finished) {
        const winner=game.entities.find(e=>e.id===game.winnerId);querySelector('#battleResult').innerHTML=winner?escapeHtml(winner.name)+' wins!<span>Battle complete - run it back?</span><button class="btn btn-gold" data-rematch>Rematch</button>':'Battle complete';querySelector('#battleStatus').textContent='Battle complete'
      }
      else if(game.cinematic)querySelector('#battleStatus').textContent='FINAL SMASH!';else if(game.smashBall)querySelector('#battleStatus').textContent='SMASH BALL! Break it before your rival!';else if(localFighter()?.ultimateReady)querySelector('#battleStatus').textContent='FINAL SMASH READY - FACE YOUR OPPONENT + SPECIAL';else querySelector('#battleStatus').textContent='Fight!';setActiveScreen('game');renderUltimateCutscene();querySelector('#smashWarning').hidden=!game.smashBall;renderBattleHud()
    }
}
  
function renderBattleHud() {
    const local=getCurrentPlayer();querySelector('#battleHud').innerHTML=game.entities.map(e=> {
      const d=ducks.find(x=>x.id===e.duckId),image=d?getDuckGraphic(d):'',damage=Math.max(0,e.damage||0),heat=Math.min(100,damage),itemNames={blaster:'Blaster · attack to fire',bomb:'Bomb · attack to throw',banana:'Banana · attack to throw',isaac:'Isaac · attack to summon'},itemInfo=e.weapon?`<div class="item-equipped">${itemNames[e.weapon.type]||'Item · attack to use'} (${e.weapon.ammo})</div>`:'';return `<div class="battle-fighter ${e.ultimateReady?'ultimate-ready':''}" style="--pcolor:${e.color};--damage-heat:${heat}%"><img class="battle-avatar" src="${image.startsWith('<img')?(spriteCache.get(e.duckId)||''):''}" alt=""><div class="battle-meta"><div class="battle-player">P${e.slot} · ${escapeHtml(e.name)}${e.id===local?.id?' (YOU)':''}</div><div class="battle-duck">${escapeHtml(d?.name||'Duck')}</div>${itemInfo}${e.ultimateReady?'<div class="ultimate-badge">FACE + SPECIAL</div>':''}<div class="stock-dots">${[0,1,2].map(i=>`<i class="${i>=e.stocks?'lost':''}"></i>`).join('')}</div><div class="focus-track"><i style="width:${Math.max(0,e.focus||0)}%"></i></div><div class="guard-track"><i style="width:${Math.max(0,e.guard||0)}%"></i></div><div class="damage-track"><i></i></div></div><div class="battle-damage">${Math.round(damage)}%<small>FOCUS ${Math.round(e.focus)}%</small></div></div>`
    }).join('')
  }
  
function sendInput() {
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
    renderPlayers();renderRoster();if(hoverDuck)renderDuckDetails(hoverDuck);const packet= {
      type:'state',players,stageSelection:stageSelectionOpen,stageId:selectedStageId
    };for(const conn of connections.values())if(conn.open)conn.send(packet);maybeStartGame()
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
    if (event.type === 'smash-ball-spawned') querySelector('#battleStatus').textContent = 'SMASH BALL! Break it before your rival!';
    if (event.type === 'smash-ball-claimed') {
      querySelector('#battleStatus').textContent = event.playerName + ' got the Smash Ball! Face your opponent and press Special!';
      notify(event.playerName + ' has a Final Smash!');
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
  const winner = game.entities.find((fighter) => fighter.id === game.winnerId);
  querySelector('#battleResult').innerHTML = winner
    ? escapeHtml(winner.name) + ' wins!<span>Battle complete ? run it back?</span><button class="btn btn-gold" data-rematch>Rematch</button>'
    : 'No winner<span>Everyone was knocked out</span>';
  querySelector('#battleResult').hidden = false;
  querySelector('#battleStatus').textContent = 'Battle complete';
  matchResultRendered = true;
}
function sendGameSnapshotIfDue(now) {
  if (!isHost || !game.active) return;
  const interval = game.cinematic ? TIMING.cinematicSnapshotIntervalMs : TIMING.snapshotIntervalMs;
  if (!game.needsFinalSnapshot && now - lastSnapshotSend <= interval) return;
  lastSnapshotSend = now;
  game.needsFinalSnapshot = false;
  const message = { type: 'game-state', game: snapshotGame() };
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
    if(!isHost) {
      const c=connections.get('host');if(c?.open)c.send( {
        type:'rematch'
      });return
    }
    game.active=false;game.finished=false;stageSelectionOpen=false;matchResultRendered=false;game.entities=[];game.particles=[];remoteTargets.clear();players.forEach(p=>p.ready=false);querySelector('#battleResult').hidden=true;setActiveScreen('select');broadcastState();for(const c of connections.values())if(c.open)c.send( {
      type:'select-again',players
    })
  }
  
// UI event wiring
function bindUiEvents() {
querySelector('#stageCards').addEventListener('click', (event) => {
  const stageCard = event.target.closest('[data-stage-id]');
  if (!stageCard || !isHost || !stageSelectionOpen) return;
  selectedStageId = stageCard.dataset.stageId;
  renderStageMenu();
  broadcastState();
});
querySelector('#startBattleButton').addEventListener('click', startMatch);
querySelector('#stageBackButton').addEventListener('click', () => {
  if (!isHost) return;
  stageSelectionOpen = false;
  players.forEach((player) => { player.ready = false; });
  setActiveScreen('select');
  broadcastState();
});
querySelector('#battleResult').addEventListener('click', (event) => {
  if (event.target.closest('[data-rematch]')) restartSelection();
});
querySelector('#readyButton').addEventListener('click', toggleReady);
querySelector('#exitBattle').addEventListener('click', leaveRoom);
bindControlSettings();
bindBattleInputs();

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
