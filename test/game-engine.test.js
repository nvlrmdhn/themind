const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveCardPlay } = require("../lib/game-engine");

function roomWithHands(hands, lives = 3) {
  const players = new Map(hands.map(([id, name, cards]) => [id, { id, name, hand: [...cards] }]));
  return {
    status: "playing",
    transitioning: false,
    level: 1,
    lives,
    attemptFailed: false,
    actionCount: 0,
    playedCards: [],
    players,
  };
}

test("playing 12 before another player's 10 loses one life and retries the same level", () => {
  const room = roomWithHands([["p1", "Player 1", [10]], ["p2", "Player 2", [12]]]);
  const result = resolveCardPlay(room, "p2", 12);

  assert.equal(result.ok, true);
  assert.equal(result.mistake, true);
  assert.equal(result.levelComplete, false);
  assert.equal(result.retryLevel, true);
  assert.equal(room.level, 1);
  assert.equal(room.lives, 2);
  assert.deepEqual(room.lastPlayed.missed, [10]);
  assert.equal(room.status, "playing");
});

test("playing 10 then 12 is valid and completes the level", () => {
  const room = roomWithHands([["p1", "Player 1", [10]], ["p2", "Player 2", [12]]]);
  const first = resolveCardPlay(room, "p1", 10);
  const second = resolveCardPlay(room, "p2", 12);

  assert.equal(first.mistake, false);
  assert.equal(second.mistake, false);
  assert.equal(second.levelComplete, true);
  assert.equal(room.lives, 3);
});

test("wrong order does not delete higher cards and keeps the same level until retry", () => {
  const room = roomWithHands([
    ["p1", "Player 1", [10, 20]],
    ["p2", "Player 2", [12, 25]],
  ]);
  const result = resolveCardPlay(room, "p2", 12);

  assert.equal(result.mistake, true);
  assert.deepEqual(room.players.get("p1").hand, [20]);
  assert.deepEqual(room.players.get("p2").hand, [25]);
  assert.equal(room.lives, 2);
  assert.equal(room.level, 1);
});

test("zero lives ends the game immediately and never signals level completion", () => {
  const room = roomWithHands([["p1", "Player 1", [10]], ["p2", "Player 2", [12]]], 1);
  const result = resolveCardPlay(room, "p2", 12);

  assert.equal(result.gameOver, true);
  assert.equal(result.levelComplete, undefined);
  assert.equal(result.retryLevel, undefined);
  assert.equal(room.status, "lost");
  assert.equal(room.level, 1);
});

test("repeated or foreign card plays are rejected without a second life loss", () => {
  const room = roomWithHands([["p1", "Player 1", [10]], ["p2", "Player 2", [12]]]);
  const first = resolveCardPlay(room, "p2", 12);
  const duplicate = resolveCardPlay(room, "p2", 12);
  const foreign = resolveCardPlay(room, "p2", 10);

  assert.equal(first.mistake, true);
  assert.equal(duplicate.ok, false);
  assert.equal(foreign.ok, false);
  assert.equal(room.lives, 2);
  assert.equal(room.actionCount, 1);
});
