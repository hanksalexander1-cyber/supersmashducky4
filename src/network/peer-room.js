// Manages online room creation and joining with PeerJS, including room-code
// connections, player identity and color assignment, message routing, and
// connection cleanup. UI and simulation actions are supplied as callbacks.
import { PLAYER_COLORS } from '../config.js';

const ALLOWED_INPUTS = ['left', 'right', 'jump', 'up', 'down', 'attack', 'smash', 'special', 'dropItem', 'shield'];

export function createPeerRoom(runtime, ui) {
  function generateRoomCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
  }

  function toPeerId(code) {
    return `smd-${code}`.toLowerCase();
  }

  function hostRoom() {
    if (!window.Peer) {
      ui.setNotice('Online room service did not load. Check your internet connection and try again.');
      return;
    }

    const hostName = ui.querySelector('#hostName').value.trim() || 'Player 1';
    const code = generateRoomCode();
    const hostPeer = new window.Peer(toPeerId(code));
    ui.querySelector('#createRoom').disabled = true;
    ui.setNotice('Creating room…');
    registerHostPeerEvents(hostPeer, code, hostName);
  }

  function registerHostPeerEvents(hostPeer, code, hostName) {
    hostPeer.on('open', () => {
      runtime.peer = hostPeer;
      runtime.roomCode = code;
      runtime.isHost = true;
      runtime.myPlayerId = 'p1';
      runtime.players = [{
        id: 'p1',
        name: hostName.slice(0, 16),
        slot: 1,
        color: PLAYER_COLORS[0],
        duckId: null,
        online: true,
      }];
      ui.setConnection(true, 'ROOM HOSTING');
      ui.querySelector('#createRoom').disabled = false;
      ui.setNotice('');
      ui.enterCharacterSelection();
    });
    hostPeer.on('connection', registerPlayerConnection);
    hostPeer.on('error', handleHostPeerError);
  }

  function registerPlayerConnection(connection) {
    connection.on('open', () => {
      if (runtime.game.active) return rejectConnection(connection, 'game-running');
      if (runtime.players.length >= 4) return rejectConnection(connection, 'full');

      const slot = 1 + Math.max(...runtime.players.map((player) => player.slot));
      const playerId = `p${slot}`;
      const player = {
        id: playerId,
        name: (connection.metadata?.name || `Player ${slot}`).slice(0, 16),
        slot,
        color: PLAYER_COLORS[slot - 1],
        duckId: null,
        online: true,
      };
      runtime.players.push(player);
      runtime.connections.set(playerId, connection);
      connection.send({
        type: 'welcome',
        roomCode: runtime.roomCode,
        playerId,
        players: runtime.players,
        ducks: runtime.ducks.map((duck) => ({ id: duck.id, duckId: duck.id })),
      });
      ui.broadcastState();
      connection.on('data', (message) => handlePeerMessage(playerId, message));
      connection.on('close', () => handlePlayerDisconnect(playerId));
      connection.on('error', () => {});
    });
  }

  function rejectConnection(connection, reason) {
    connection.send({ type: reason });
    connection.close();
  }

  function handlePlayerDisconnect(playerId) {
    const player = runtime.players.find((candidate) => candidate.id === playerId);
    if (!player) return;

    player.online = false;
    player.duckId = null;
    runtime.connections.delete(playerId);
    if (runtime.game.active) {
      ui.removeDisconnectedFighter(playerId);
      for (const connection of runtime.connections.values()) {
        if (connection.open) connection.send({ type: 'game-state', game: ui.snapshotGame() });
      }
    }
    ui.broadcastState();
  }

  function handleHostPeerError(error) {
    if (runtime.peer) {
      ui.notify(`Room connection issue: ${error.type}`);
      return;
    }

    ui.querySelector('#createRoom').disabled = false;
    const message = error.type === 'unavailable-id'
      ? 'That room code was taken. Please create again.'
      : `Could not create room (${error.type}). Try again.`;
    ui.setNotice(message);
  }

  function joinExisting() {
    if (!window.Peer) {
      ui.setNotice('Online room service did not load. Check your internet connection and try again.');
      return;
    }

    const code = ui.querySelector('#roomCode').value.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
      ui.setNotice('Enter a valid 6-character room code.');
      return;
    }

    const playerName = ui.querySelector('#guestName').value.trim() || 'Player';
    ui.querySelector('#joinRoom').disabled = true;
    ui.setNotice('Joining room…');
    const guestPeer = new window.Peer();
    let hasWelcome = false;
    guestPeer.on('open', () => {
      runtime.peer = guestPeer;
      const connection = guestPeer.connect(toPeerId(code), {
        metadata: { name: playerName.slice(0, 16) },
        reliable: true,
      });
      runtime.connections.set('host', connection);
      connection.on('open', () => ui.setNotice('Connected. Syncing room…'));
      connection.on('data', (message) => handleGuestMessage(message, connection, () => { hasWelcome = true; }));
      connection.on('close', () => handleGuestDisconnect(hasWelcome));
      connection.on('error', () => handleGuestConnectionError(hasWelcome));
    });
    guestPeer.on('error', (error) => handleGuestPeerError(error, hasWelcome));
  }

  const guestMessageHandlers = {
    full: (_message, connection) => rejectGuestJoin(connection, 'This room already has 4 players.'),
    'game-running': (_message, connection) => rejectGuestJoin(connection, 'That battle has already started.'),
    welcome: (message, _connection, markWelcomed) => acceptWelcome(message, markWelcomed),
    state: (message) => acceptRoomState(message),
    'game-start': (message) => acceptGameStart(message),
    'game-state': (message) => ui.applySnapshot(message.game),
    'select-again': (message) => acceptSelectionAgain(message),
  };

  function handleGuestMessage(message, connection, markWelcomed) {
    const handleMessage = guestMessageHandlers[message.type];
    if (handleMessage) handleMessage(message, connection, markWelcomed);
  }

  function rejectGuestJoin(connection, message) {
    ui.setNotice(message);
    connection.close();
    runtime.peer?.destroy();
    runtime.peer = null;
    ui.querySelector('#joinRoom').disabled = false;
  }

  function acceptWelcome(message, markWelcomed) {
    markWelcomed();
    runtime.roomCode = message.roomCode;
    runtime.isHost = false;
    runtime.myPlayerId = message.playerId;
    runtime.players = message.players;
    ui.setConnection(true, 'CONNECTED');
    ui.querySelector('#joinRoom').disabled = false;
    ui.setNotice('');
    ui.enterCharacterSelection();
  }

  function acceptRoomState(message) {
    runtime.players = message.players;
    runtime.stageSelectionOpen = !!message.stageSelection;
    runtime.selectedStageId = message.stageId || runtime.selectedStageId;
    ui.setConnection(true, 'CONNECTED');
    ui.renderRoster();
    ui.renderPlayers();
    if (runtime.hoverDuck) ui.renderDuckDetails(runtime.hoverDuck);
    if (runtime.stageSelectionOpen && !runtime.game.active) {
      ui.setActiveScreen('stage');
      ui.querySelector('#stageRoomCode').textContent = runtime.roomCode;
      ui.renderStageMenu();
    } else if (!runtime.stageSelectionOpen && !runtime.game.active && runtime.state.screen === 'stage') {
      ui.setActiveScreen('select');
    }
  }

  function acceptGameStart(message) {
    runtime.players = message.players;
    ui.applySnapshot(message.game);
    if (!runtime.gameFrame) runtime.gameFrame = requestAnimationFrame(ui.gameLoop);
  }

  function acceptSelectionAgain(message) {
    runtime.players = message.players;
    runtime.game.active = false;
    runtime.game.finished = false;
    runtime.stageSelectionOpen = false;
    runtime.remoteTargets.clear();
    ui.setActiveScreen('select');
    ui.renderPlayers();
    ui.renderRoster();
  }

  function handleGuestDisconnect(hasWelcome) {
    if (!hasWelcome) return;
    ui.setConnection(false, 'ROOM DISCONNECTED');
    ui.notify('Host disconnected. The room has closed.');
    if (runtime.gameFrame) cancelAnimationFrame(runtime.gameFrame);
    runtime.gameFrame = 0;
    runtime.game.active = false;
    runtime.remoteTargets.clear();
    ui.setActiveScreen('lobby');
    runtime.peer?.destroy();
    runtime.peer = null;
    ui.querySelector('#joinRoom').disabled = false;
  }

  function handleGuestConnectionError(hasWelcome) {
    if (hasWelcome) return;
    ui.setNotice('Could not join. Check the code and make sure the host is still connected.');
    runtime.peer?.destroy();
    runtime.peer = null;
    ui.querySelector('#joinRoom').disabled = false;
  }

  function handleGuestPeerError(error, hasWelcome) {
    if (hasWelcome) return;
    const message = error.type === 'peer-unavailable'
      ? 'Room not found. Check the code and try again.'
      : `Could not join room (${error.type}).`;
    ui.setNotice(message);
    ui.querySelector('#joinRoom').disabled = false;
    runtime.peer?.destroy();
    runtime.peer = null;
  }

  const hostMessageHandlers = {
    select: handleCharacterSelectionMessage,
    ready: handleReadyMessage,
    rematch: handleRematchMessage,
    input: handleInputMessage,
  };

  function handlePeerMessage(playerId, message) {
    if (!runtime.isHost) return;
    const player = runtime.players.find((candidate) => candidate.id === playerId);
    if (!player) return;
    hostMessageHandlers[message.type]?.(playerId, player, message);
  }

  function handleCharacterSelectionMessage(_playerId, player, message) {
    const duck = runtime.ducks.find((candidate) => candidate.id === message.duckId);
    if (runtime.game.active || !duck?.selectable) return;
    player.duckId = duck.id;
    player.ready = false;
    ui.broadcastState();
  }

  function handleReadyMessage(_playerId, player, message) {
    if (runtime.game.active || !player.duckId) return;
    player.ready = !!message.ready;
    ui.broadcastState();
  }

  function handleRematchMessage() {
    if (runtime.game.active) ui.restartSelection();
  }

  function handleInputMessage(playerId, _player, message) {
    if (!runtime.game.active) return;
    runtime.game.inputs[playerId] = Object.fromEntries(
      ALLOWED_INPUTS.map((inputName) => [inputName, !!message.input?.[inputName]]),
    );
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(runtime.roomCode);
      ui.notify('Room code copied.');
    } catch {
      ui.notify(`Room code: ${runtime.roomCode}`);
    }
  }

  function leaveRoom() {
    if (runtime.peer) {
      if (runtime.isHost) {
        for (const connection of runtime.connections.values()) connection.close();
      }
      runtime.peer.destroy();
      runtime.peer = null;
    }
    if (runtime.gameFrame) cancelAnimationFrame(runtime.gameFrame);
    runtime.gameFrame = 0;
    runtime.game = {
      active: false,
      entities: [],
      inputs: {},
      winnerId: null,
      finished: false,
      particles: [],
      shake: 0,
    };
    runtime.remoteTargets.clear();
    runtime.localInput = ui.emptyInput();
    runtime.pressedKeys.clear();
    runtime.connections.clear();
    runtime.players = [];
    runtime.roomCode = '';
    runtime.myPlayerId = '';
    runtime.isHost = false;
    ui.setConnection(false, 'ROOM NOT CONNECTED');
    ui.setActiveScreen('lobby');
    ui.setNotice('You left the room.');
  }

  return { hostRoom, joinExisting, copyRoomCode, leaveRoom };
}
