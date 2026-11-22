function countCards(room) {
  return [...room.players.values()].reduce((count, player) => count + player.hand.length, 0);
}

function resolveCardPlay(room, playerId, card) {
  if (room.status !== "playing" || room.transitioning) {
    return { ok: false, error: "Game tidak aktif atau sedang berpindah level." };
  }

  const player = room.players.get(playerId);
  if (!player) return { ok: false, error: "Pemain tidak terdaftar di room ini." };
  if (!Number.isInteger(card) || !player.hand.includes(card)) {
    return { ok: false, error: "Kartu tidak valid atau sudah tidak dimiliki." };
  }

  // Socket handlers run synchronously on Node's event loop, so this snapshot and
  // every mutation below form one atomic move relative to other socket events.
  const allCards = [...room.players.values()].flatMap(current => current.hand);
  const expected = Math.min(...allCards);
  const mistake = card !== expected;

  player.hand = player.hand.filter(value => value !== card);
  let missed = [];
  if (mistake) {
    missed = [...room.players.values()].flatMap(current => current.hand.filter(value => value < card));
    for (const current of room.players.values()) {
      current.hand = current.hand.filter(value => value >= card);
    }
    room.lives = Math.max(0, room.lives - 1);
    room.attemptFailed = true;
  }

  room.actionCount += 1;
  room.lastPlayed = {
    type: "card",
    value: card,
    playerName: player.name,
    missed,
    mistake,
    actionId: null,
  };
  room.playedCards.push(card);

  const remaining = countCards(room);
  if (room.lives === 0) {
    room.status = "lost";
    return { ok: true, mistake, gameOver: true, remaining };
  }
  if (remaining === 0) {
    return {
      ok: true,
      mistake,
      retryLevel: room.attemptFailed,
      levelComplete: !room.attemptFailed,
      remaining,
    };
  }
  return { ok: true, mistake, remaining };
}

module.exports = { countCards, resolveCardPlay };
