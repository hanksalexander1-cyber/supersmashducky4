// Manages online room creation and joining with PeerJS, including room-code
// connections, player identity and color assignment, message routing, and
// connection cleanup. UI and simulation actions are supplied as callbacks.
import { BATTLE_MODES, MATCH_OPTIONS, PLAYER_COLORS } from '../config.js';

const ALLOWED_INPUTS = ['left', 'right', 'jump', 'up', 'down', 'attack', 'smash', 'special', 'dropItem', 'shield'];

export function createPeerRoom(runtime, ui) {
  const reconnectTimers = new Map();
  let intentionalLeave = false;
  let reconnectSession = null;
  let guestRetryTimer = 0;
  let guestAttempt = 0;
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
    hostPeer.on('disconnected', () => restorePeerSignaling(hostPeer));
    hostPeer.on('error', handleHostPeerError);
  }

  function restorePeerSignaling(peer) {
    if (runtime.peer === peer) peer.reconnect();
  }

  function registerPlayerConnection(connection) {
    connection.on('open', () => {
      const reconnectId = connection.metadata?.reconnectPlayerId;
      const player = runtime.players.find((candidate) => candidate.id === reconnectId);
      const previousConnection = runtime.connections.get(reconnectId);
      const reconnectDeadline = player?.reconnectExpiresAt || Date.now() + MATCH_OPTIONS.reconnectGraceMs;
      const canReconnectPlayer = player?.slot > 1 && (
        (player.online === false && reconnectDeadline > Date.now())
        || (player.online !== false && previousConnection && !previousConnection.open)
      );
      const spectator = runtime.spectators.find((candidate) => candidate.id === connection.metadata?.reconnectSpectatorId
        && candidate.online === false && candidate.reconnectExpiresAt > Date.now());
      let role = 'fighter';
      let roomMember;
      if (canReconnectPlayer) {
        window.clearTimeout(reconnectTimers.get(player.id));
        reconnectTimers.delete(player.id);
        player.online = true;
        delete player.reconnectExpiresAt;
        roomMember = player;
      } else if (spectator) {
        role = 'spectator';
        roomMember = spectator;
        roomMember.online = true;
        delete roomMember.reconnectExpiresAt;
        window.clearTimeout(reconnectTimers.get(roomMember.id));
        reconnectTimers.delete(roomMember.id);
      } else if (!runtime.game.active && !runtime.stageSelectionOpen && runtime.players.length < 4) {
        const slot = [1, 2, 3, 4].find((candidateSlot) => (
          !runtime.players.some((candidate) => candidate.slot === candidateSlot)
        ));
        roomMember = {
          id: `p${slot}`,
          name: (connection.metadata?.name || `Player ${slot}`).slice(0, 16),
          slot,
          color: PLAYER_COLORS[slot - 1],
          duckId: null,
          online: true,
        };
        runtime.players.push(roomMember);
      } else if (runtime.spectators.length < MATCH_OPTIONS.spectatorLimit) {
        role = 'spectator';
        const spectatorNumber = [1, 2, 3, 4].find((candidateNumber) => (
          !runtime.spectators.some((candidate) => candidate.id === `s${candidateNumber}`)
        ));
        roomMember = {
          id: `s${spectatorNumber}`,
          name: (connection.metadata?.name || 'Spectator').slice(0, 16),
          online: true,
        };
        runtime.spectators.push(roomMember);
      } else return rejectConnection(connection, 'full');

      runtime.connections.set(roomMember.id, connection);
      connection.send({
        type: 'welcome',
        roomCode: runtime.roomCode,
        playerId: roomMember.id,
        role,
        players: runtime.players,
        spectators: runtime.spectators,
        ducks: runtime.ducks.map((duck) => ({ id: duck.id, duckId: duck.id })),
        game: runtime.game.active ? ui.snapshotGame() : null,
      });
      ui.broadcastState();
      connection.on('data', (message) => handlePeerMessage(roomMember.id, message));
      connection.on('close', () => handleMemberDisconnect(roomMember.id, role, connection));
      connection.on('error', (error) => ui.notify(`Player connection issue: ${error.type}`));
    });
  }

  function rejectConnection(connection, reason) {
    connection.send({ type: reason });
    connection.close();
  }

  function handleMemberDisconnect(memberId, role, connection) {
    if (runtime.connections.get(memberId) !== connection) return;
    runtime.connections.delete(memberId);
    const member = role === 'spectator'
      ? runtime.spectators.find((candidate) => candidate.id === memberId)
      : runtime.players.find((candidate) => candidate.id === memberId);
    if (!member) return;
    member.online = false;
    if (role === 'fighter') {
      member.ready = false;
      member.reconnectExpiresAt = Date.now() + MATCH_OPTIONS.reconnectGraceMs;
      runtime.game.inputs[memberId] = ui.emptyInput();
      const timer = window.setTimeout(() => expireDisconnectedPlayer(memberId), MATCH_OPTIONS.reconnectGraceMs);
      reconnectTimers.set(memberId, timer);
    } else {
      member.reconnectExpiresAt = Date.now() + MATCH_OPTIONS.reconnectGraceMs;
      const timer = window.setTimeout(() => expireDisconnectedPlayer(memberId), MATCH_OPTIONS.reconnectGraceMs);
      reconnectTimers.set(memberId, timer);
    }
    ui.broadcastState();
  }

  function expireDisconnectedPlayer(playerId) {
    const player = runtime.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      runtime.spectators = runtime.spectators.filter((candidate) => candidate.id !== playerId || candidate.online !== false);
      reconnectTimers.delete(playerId);
      ui.broadcastState();
      return;
    }
    if (player.online !== false) return;
    runtime.players = runtime.players.filter((candidate) => candidate.id !== playerId);
    reconnectTimers.delete(playerId);
    if (runtime.game.active) ui.removeDisconnectedFighter(playerId);
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
    connectToRoom(code, playerName, null);
  }

  function connectToRoom(code, playerName, reconnectRole) {
    intentionalLeave = false;
    if (!reconnectRole) reconnectSession = null;
    guestAttempt += 1;
    const attempt = guestAttempt;
    const guestPeer = new window.Peer();
    let hasWelcome = false;
    guestPeer.on('open', () => {
      runtime.peer = guestPeer;
      const reconnectMetadata = reconnectRole === 'spectator'
        ? { reconnectSpectatorId: runtime.myPlayerId }
        : reconnectRole === 'fighter' ? { reconnectPlayerId: runtime.myPlayerId } : {};
      const connection = guestPeer.connect(toPeerId(code), {
        metadata: { name: playerName.slice(0, 16), ...reconnectMetadata },
        reliable: true,
      });
      runtime.connections.set('host', connection);
      connection.on('open', () => ui.setNotice('Connected. Syncing room…'));
      connection.on('data', (message) => handleGuestMessage(message, connection, () => { hasWelcome = true; }));
      connection.on('close', () => {
        if (attempt === guestAttempt) handleGuestDisconnect(hasWelcome, code, playerName);
      });
      connection.on('error', () => {
        if (attempt === guestAttempt) handleGuestConnectionError(hasWelcome, code, playerName);
      });
    });
    guestPeer.on('error', (error) => {
      if (attempt === guestAttempt) handleGuestPeerError(error, hasWelcome, code, playerName);
    });
    guestPeer.on('disconnected', () => restorePeerSignaling(guestPeer));
  }

  const guestMessageHandlers = {
    full: (_message, connection) => rejectGuestJoin(connection, 'This room has reached its fighter and spectator limit.'),
    'host-closing': () => handleHostClosing(),
    welcome: (message, _connection, markWelcomed) => acceptWelcome(message, markWelcomed),
    state: (message) => acceptRoomState(message),
    'game-start': (message) => acceptGameStart(message),
    'game-state': (message) => ui.applySnapshot(message.game, message.events),
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
    runtime.spectators = message.spectators || [];
    runtime.isSpectator = message.role === 'spectator';
    runtime.practiceMode = false;
    reconnectSession = {
      code: message.roomCode,
      name: ui.querySelector('#guestName').value.trim() || 'Player',
      role: message.role || 'fighter',
      expiresAt: null,
    };
    window.clearTimeout(guestRetryTimer);
    ui.setConnection(true, 'CONNECTED');
    ui.querySelector('#joinRoom').disabled = false;
    ui.setNotice('');
    ui.renderRoomSpectators();
    if (message.game?.active) {
      if (!runtime.game.active) ui.prepareReplayCapture();
      ui.applySnapshot(message.game);
      if (!runtime.gameFrame) runtime.gameFrame = requestAnimationFrame(ui.gameLoop);
    } else if (runtime.isSpectator) {
      ui.setActiveScreen('select');
      ui.setNotice('You joined as a spectator. The current match will appear when it starts.');
    } else ui.enterCharacterSelection();
  }

  function acceptRoomState(message) {
    runtime.players = message.players;
    runtime.spectators = message.spectators || [];
    runtime.modeVotes = message.modeVotes || {};
    runtime.battleOptions = message.battleOptions || runtime.battleOptions;
    runtime.tournamentState = message.tournamentState || null;
    if (runtime.game.finished) ui.updateTournamentResult();
    runtime.isSpectator = runtime.spectators.some((spectator) => spectator.id === runtime.myPlayerId);
    ui.applyStageDefinition(message.stageDefinition);
    runtime.stageSelectionOpen = !!message.stageSelection;
    if (runtime.stageSelectionOpen && runtime.game.active) {
      runtime.game.active = false;
      runtime.game.finished = false;
      runtime.game.cinematic = null;
    }
    runtime.selectedStageId = message.stageId || runtime.selectedStageId;
    ui.setConnection(true, 'CONNECTED');
    ui.renderRoomSpectators();
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
    runtime.spectators = message.spectators || runtime.spectators;
    runtime.tournamentState = message.tournamentState || null;
    runtime.battleOptions = message.battleOptions || runtime.battleOptions;
    ui.prepareReplayCapture();
    ui.applySnapshot(message.game);
    if (!runtime.gameFrame) runtime.gameFrame = requestAnimationFrame(ui.gameLoop);
  }

  function acceptSelectionAgain(message) {
    runtime.players = message.players;
    runtime.spectators = message.spectators || runtime.spectators;
    runtime.battleOptions = message.battleOptions || runtime.battleOptions;
    runtime.tournamentState = message.tournamentState || null;
    runtime.game.active = false;
    runtime.game.finished = false;
    runtime.stageSelectionOpen = false;
    runtime.remoteTargets.clear();
    ui.setActiveScreen('select');
    ui.renderPlayers();
    ui.renderRoster();
  }

  function handleGuestDisconnect(hasWelcome, code, playerName) {
    runtime.connections.delete('host');
    if (intentionalLeave) return;
    if (!hasWelcome) {
      if (reconnectSession?.expiresAt) scheduleGuestRetry(code, playerName);
      return;
    }
    if (!reconnectSession) return handleHostClosing();
    reconnectSession.expiresAt = Date.now() + MATCH_OPTIONS.reconnectGraceMs;
    ui.setConnection(false, 'RECONNECTING');
    ui.notify('Connection lost. Trying to rejoin your room…');
    scheduleGuestRetry(code, playerName);
  }

  function scheduleGuestRetry(code, playerName) {
    window.clearTimeout(guestRetryTimer);
    guestRetryTimer = window.setTimeout(() => retryGuestConnection(code, playerName), 2_000);
  }

  function retryGuestConnection(code, playerName) {
    if (!reconnectSession || Date.now() >= reconnectSession.expiresAt) {
      handleHostClosing();
      return;
    }
    intentionalLeave = true;
    runtime.peer?.destroy();
    runtime.peer = null;
    connectToRoom(code, playerName, reconnectSession.role);
  }

  function handleHostClosing() {
    intentionalLeave = true;
    window.clearTimeout(guestRetryTimer);
    if (runtime.gameFrame) cancelAnimationFrame(runtime.gameFrame);
    runtime.gameFrame = 0;
    runtime.game.active = false;
    runtime.remoteTargets.clear();
    reconnectSession = null;
    runtime.isSpectator = false;
    ui.setConnection(false, 'ROOM DISCONNECTED');
    ui.notify('Host disconnected. The room has closed.');
    ui.setActiveScreen('lobby');
    runtime.peer?.destroy();
    runtime.peer = null;
    ui.querySelector('#joinRoom').disabled = false;
  }

  function handleGuestConnectionError(hasWelcome, code, playerName) {
    if (hasWelcome) return;
    if (reconnectSession?.expiresAt) {
      scheduleGuestRetry(code, playerName);
      return;
    }
    ui.setNotice('Could not join. Check the code and make sure the host is still connected.');
    runtime.peer?.destroy();
    runtime.peer = null;
    ui.querySelector('#joinRoom').disabled = false;
  }

  function handleGuestPeerError(error, hasWelcome, code, playerName) {
    if (hasWelcome) return;
    if (reconnectSession?.expiresAt) {
      scheduleGuestRetry(code, playerName);
      return;
    }
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
    'mode-vote': handleModeVote,
    leave: handleExplicitLeave,
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

  function handleExplicitLeave(playerId) {
    const connection = runtime.connections.get(playerId);
    runtime.connections.delete(playerId);
    window.clearTimeout(reconnectTimers.get(playerId));
    reconnectTimers.delete(playerId);
    const isPlayer = runtime.players.some((player) => player.id === playerId);
    runtime.players = runtime.players.filter((player) => player.id !== playerId);
    runtime.spectators = runtime.spectators.filter((spectator) => spectator.id !== playerId);
    if (isPlayer && runtime.game.active) ui.removeDisconnectedFighter(playerId);
    connection?.close();
    ui.broadcastState();
  }

  function handleInputMessage(playerId, _player, message) {
    if (!runtime.game.active) return;
    runtime.game.inputs[playerId] = Object.fromEntries(
      ALLOWED_INPUTS.map((inputName) => [inputName, !!message.input?.[inputName]]),
    );
  }

  function handleModeVote(playerId, _player, message) {
    if (!runtime.stageSelectionOpen || runtime.game.active) return;
    if (!BATTLE_MODES.some((mode) => mode.id === message.mode)) return;
    runtime.modeVotes = { ...runtime.modeVotes, [playerId]: message.mode };
    ui.broadcastState();
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
    intentionalLeave = true;
    reconnectSession = null;
    window.clearTimeout(guestRetryTimer);
    if (!runtime.isHost) {
      const hostConnection = runtime.connections.get('host');
      if (hostConnection?.open) hostConnection.send({ type: 'leave' });
    }
    if (runtime.peer) {
      if (runtime.isHost) {
        for (const connection of runtime.connections.values()) {
          if (connection.open) connection.send({ type: 'host-closing' });
          connection.close();
        }
      }
      runtime.peer.destroy();
      runtime.peer = null;
    }
    if (runtime.gameFrame) cancelAnimationFrame(runtime.gameFrame);
    for (const timer of reconnectTimers.values()) window.clearTimeout(timer);
    reconnectTimers.clear();
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
    runtime.spectators = [];
    runtime.roomCode = '';
    runtime.myPlayerId = '';
    runtime.isHost = false;
    ui.querySelector('#exitBattle').textContent = 'Leave room';
    runtime.isSpectator = false;
    runtime.practiceMode = false;
    runtime.battleOptions = { startingStocks: 3, itemFrequency: 'normal', tournament: false };
    runtime.tournamentState = null;
    ui.setConnection(false, 'ROOM NOT CONNECTED');
    ui.setActiveScreen('lobby');
    ui.setNotice('You left the room.');
  }

  return { hostRoom, joinExisting, copyRoomCode, leaveRoom };
}
