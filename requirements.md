# Super Smash Ducky 4 — Character Selection Requirements

## Goal

Build a browser-based, online duck fighting game inspired by the stock-battle format and character-select presentation of *Super Smash Bros.* The prototype includes room setup, shared character selection, ready-up flow, and a playable stock-battle arena.

## Players and rooms

- Support 2–4 fighters and up to 4 additional spectators on separate devices in one online session.
- Players create or join a session using a room code.
- Show the players in the room and indicate which player is selecting which duck.
- Duck selections are made simultaneously and are shared with the other players in the room.
- Keep room and selection state in memory for the active session only; do not persist selections across page reloads.
- Reserve disconnected fighter seats for 60 seconds and allow the same guest to reconnect by room code. Host disconnection ends the room; host migration is not supported.
- Let spectators join during a match and receive the same authoritative snapshots without sending fighter inputs.

## Duck roster and data

- Load all available ducks from `https://api.ducks.ects-cmp.com/ducks`.
- Use duck sprites from `https://github.com/ectscmp/duck_system_assets/tree/main/images/sprites`.
- Render each duck from its six sprite parts, using the corresponding part colors so the displayed duck matches its data.
- A duck is selectable only when all required information is available:
  - Strength
  - Health
  - Focus
  - All six sprite parts, including the colors needed to render them
- If any required information is missing or unavailable, show the duck as unavailable and prevent selection.
- Include every duck returned by the API in the roster, including unavailable ducks.

## Roster interaction

- Show the full roster in one character-selection menu.
- Provide a search/filter field that filters as the user types.
- Match search terms against each duck's name, description, and creator name.
- Keep a player's selected duck visible even when it does not match the current search term.
- On hover over a duck, show its Strength, Health, and Focus in a side panel.
- Indicate clearly which player has selected each duck.

## Battle prototype

- Start the match when at least two connected players have selected a duck and every connected player is ready.
- Support 2–4 fighters in a shared stock battle, with three stocks per fighter.
- Include a main platform, floating platforms, knockback, ring-outs, respawns, and a last-duck-standing win condition.
- Support keyboard and touch controls for movement, jumping, attacks, special moves, and shielding.
- Include a three-hit jab combo, directional jab and smash attacks, and a duck-colored projectile special that consumes focus.
- Automatically zoom out during battles as active fighters spread apart, keeping the whole group in view.
- Animate duck movement, attacks, knockback, shielding, and landings with visible arms and legs, punch extensions, attack trails, impact bursts, and squash-and-stretch.
- Give every fighter a triple jump with distinct takeoff, midair, and landing animations.
- Spawn a Smash Ball periodically; fighters damage it to claim one Final Smash. Fire immediately in the duck facing direction with the Special key or touch button, show the duck charging and lunging through a dramatic forward strike cutscene, and damage only opponents along its path.
- Let each player remap keyboard controls for the current browser session, with duplicate-key prevention and a reset-to-default option.
- Keep one host authoritative for match simulation and send state to the other players in the room.
- Show fighter names, stocks, damage, focus, and shield strength during the battle.
- Allow players to return to selection for a rematch without recreating the room.
- Show a match recap with placements, KOs, falls, and damage dealt, with rematch and return-to-selection actions.
- Export the latest match's periodic state snapshots and key events as a downloadable JSON replay/highlight file.
- Support an offline training mode with a stationary practice dummy that resets after a ring-out.
- Offer configurable starting stocks and item frequency. Stage hazards are active in every battle.
- Remove Ducky Dome and Aurora Archipelago. Isaac fires a manually aimed projectile instead of targeting every opponent; add Spring (a charged jump) and Gust (+2.2 run speed for 10 seconds). Item frequencies are Low: 15 seconds, Normal: 8 seconds, and High: 4 seconds, with at most two loose items at a time.
- Provide a 2–4 fighter single-elimination tournament that reuses the room and selected fighters between matches.
- Allow players to share the host's edited stage geometry with room members.
- Keep stage editing hidden until the private `DUCKYMAP` keyboard sequence is entered on the lobby or stage screen; only the room host can open the editor. This client-side gate hides the feature but is not a security boundary against someone inspecting or modifying browser code.
- Give each duck one of three balanced, data-derived neutral signature projectile variants without changing controls.
- Provide local sound-effect/music volume and touch-control size, opacity, and vertical-position settings.

- After all players ready up, show a shared stage-selection menu with multiple arena layouts; the host picks the stage before starting.
- Use forgiving attack collision ranges so close swings and projectiles connect consistently.

## Gameplay attributes

The stats should eventually affect gameplay. The current tentative mapping is:

- Strength → attack damage
- Health → resistance to knockback
- Focus → movement speed and special-move charge gained from hits

Intelligence and Kindness are not required for this milestone. These mappings are provisional and should be validated when battle mechanics are defined.

## Visual direction

- Use a bold character-select interface inspired by the real *Super Smash Bros.* UI.
- Display duck names and correctly colored composite sprites in the roster.
- Keep player indicators and the hovered duck's stats easy to distinguish.

## Out of scope for this prototype

- Local multiplayer
- Advanced combat systems such as grabs, multiple attack types, items, and additional stages
- Dedicated matchmaking servers or persistent player accounts
- Saved selections between sessions
- Using Intelligence or Kindness in gameplay

## Remaining design decisions

- Exact API response fields, sprite-part naming/assembly rules, and how API or asset errors are communicated to players.
- Final balance formulas for translating Strength, Health, and Focus into battle attributes.
- Host migration is intentionally unsupported; a host disconnect closes the room.
- The three signature projectile styles are a starting point, not a complete per-duck move set.
- Sound effects and the procedural music bed are placeholders for a future authored soundtrack.

## Enhancement defaults

- Guest reconnect grace is 60 seconds; disconnected fighters remain in the match without input during that interval. A host disconnect closes the room.
- Spectators are limited to four per room in addition to the four fighter slots.
- Tournaments are single-elimination, run by the host, and match fighters in room order; an odd entrant receives a bye.
- Stage hazards are always enabled and periodically apply a light stage-specific wind/updraft/surge effect.
- Replay downloads contain sampled game snapshots and key-event timestamps; they are room-local and not stored on a server.
