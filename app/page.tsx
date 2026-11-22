"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { getSocket } from "@/lib/socket";
import { AudioPreferences, DEFAULT_AUDIO_PREFERENCES, loadAudioPreferences, playSound, saveAudioPreferences, setGameAudioActive, stopAllAudio, unlockAudio } from "@/lib/audio";

type Player = { id: string; name: string; avatar: string; ready: boolean };
type Message = { id: string; playerId: string; name: string; avatar: string; message: string; time: number };
type Room = {
  code: string; hostId: string; status: "lobby" | "playing" | "won" | "lost";
  players: Player[]; messages: Message[]; level: number; lives: number;
  shurikens: number; shurikenVotes: number; shurikenVoters: string[]; shurikenRound: number; actionCount: number; transitioning: boolean;
  transitionType: "level" | "retry" | null; playedCards: number[];
  hands: { playerId: string; cards: number }[];
  lastPlayed: null | { type?: string; value: number | null; playerName: string; missed: number[]; mistake?: boolean; actionId?: string; discarded?: {playerName:string;value:number}[] };
};
const AVATARS = ["🦊", "🐼", "🐸", "🐯", "🐙", "🐻", "🐧", "🦄", "🐵", "🐨", "🐰", "🐱"];

function getSeatPosition(index: number, total: number): CSSProperties {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return { left: `${50 + 41 * Math.cos(angle)}%`, top: `${50 + 39 * Math.sin(angle)}%` };
}

export default function Home() {
  const socket = useMemo(() => getSocket(), []);
  const [name, setName] = useState("Player");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [code, setCode] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [myId, setMyId] = useState("");
  const [hand, setHand] = useState<number[]>([]);
  const [chat, setChat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [playingCard, setPlayingCard] = useState<number | null>(null);
  const [shurikenConfirm, setShurikenConfirm] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioPreferences, setAudioPreferences] = useState<AudioPreferences>({ ...DEFAULT_AUDIO_PREFERENCES });

  useEffect(() => {
    const loadedAudio = loadAudioPreferences();
    setAudioPreferences(loadedAudio);
    saveAudioPreferences(loadedAudio);
    const onUpdate = (next: Room) => {
      setRoom(next);
      setGameAudioActive(next.status === "playing");
    };
    const onHand = (data: { cards: number[] }) => setHand(data.cards);
    const onSound = (event: { id: string; type: string }) => {
      const sounds = ["join", "deal", "play", "level", "mistake", "life", "shuriken", "gameover", "win", "chat"] as const;
      if (sounds.includes(event.type as typeof sounds[number])) playSound(event.type as typeof sounds[number], event.id);
    };
    const onFirstInteraction = () => unlockAudio();
    const onDisconnect = () => setGameAudioActive(false);
    socket.on("room:update", onUpdate);
    socket.on("game:hand", onHand);
    socket.on("game:sound", onSound);
    socket.on("disconnect", onDisconnect);
    window.addEventListener("pointerdown", onFirstInteraction, { once: true });
    window.addEventListener("keydown", onFirstInteraction, { once: true });
    return () => {
      socket.off("room:update", onUpdate); socket.off("game:hand", onHand); socket.off("game:sound", onSound); socket.off("disconnect", onDisconnect);
      window.removeEventListener("pointerdown", onFirstInteraction); window.removeEventListener("keydown", onFirstInteraction);
      stopAllAudio();
    };
  }, [socket]);

  function updateAudio(patch: Partial<AudioPreferences>) {
    const next = { ...audioPreferences, ...patch };
    setAudioPreferences(next);
    saveAudioPreferences(next);
    if (next.enabled) unlockAudio();
  }

  function connect() {
    if (!socket.connected) socket.connect();
  }
  function createRoom() {
    unlockAudio();
    setError(""); setBusy(true); connect();
    socket.once("connect", () => {
      socket.emit("room:create", { name, avatar }, (res: any) => {
        setBusy(false);
        if (!res?.ok) return setError(res?.error || "Gagal membuat room.");
        setRoom(res.room); setMyId(res.playerId);
      });
    });
    if (socket.connected) socket.emit("room:create", { name, avatar }, (res: any) => {
      setBusy(false); if (!res?.ok) return setError(res?.error || "Gagal membuat room.");
      setRoom(res.room); setMyId(res.playerId);
    });
  }
  function joinRoom() {
    unlockAudio();
    setError(""); setBusy(true); connect();
    const join = () => socket.emit("room:join", { code, name, avatar }, (res: any) => {
      setBusy(false);
      if (!res?.ok) return setError(res?.error || "Gagal bergabung.");
      setRoom(res.room); setMyId(res.playerId);
    });
    if (socket.connected) join(); else socket.once("connect", join);
  }
  function startGame() {
    unlockAudio();
    socket.emit("game:start", { code: room?.code }, (res: any) => {
      if (!res?.ok) setError(res?.error || "Tidak bisa memulai game.");
    });
  }
  function sendChat(e: FormEvent) {
    e.preventDefault();
    if (!chat.trim() || !room) return;
    unlockAudio();
    socket.emit("lobby:chat", { code: room.code, message: chat });
    setChat("");
  }
  function playCard(card: number) {
    if (!room || room.status !== "playing" || room.transitioning || busy || playingCard !== null) return;
    unlockAudio();
    setError(""); setPlayingCard(card); setBusy(true);
    const actionId = crypto.randomUUID();
    window.setTimeout(() => socket.emit("game:play", { code: room.code, card, actionId }, (res: any) => {
      setPlayingCard(null); setBusy(false);
      if (!res?.ok) setError(res?.error || "Kartu gagal dimainkan.");
    }), 280);
  }
  function useShuriken() {
    if (!room || room.status !== "playing" || room.transitioning || room.shurikens <= 0 || busy) return;
    unlockAudio();
    setBusy(true); setShurikenConfirm(false);
    socket.emit("game:shuriken", { code: room.code, actionId: crypto.randomUUID(), round: room.shurikenRound }, (res: any) => {
      setBusy(false);
      if (!res?.ok) setError(res?.error || "Shuriken tidak dapat digunakan.");
    });
  }
  function leave() {
    setGameAudioActive(false);
    socket.disconnect();
    setRoom(null); setMyId(""); setHand([]); setError("");
  }

  const isHost = room?.hostId === myId;
  const remaining = room?.players.reduce((sum, p) => sum + (p.id === myId ? hand.length : 0), 0) ?? 0;

  return (
    <main className="shell">
      <div className="topbar">
        <a className="brand" href="#"><span className="brand-mark">✳</span> the mind <span className="brand-online">ONLINE</span></a>
        <div className="top-pill"><span className="pulse" /> FRIENDS • FOCUS • FUN</div>
        <div className="audio-tools">
          <button className="audio-open" aria-expanded={audioOpen} onClick={() => { unlockAudio(); setAudioOpen(!audioOpen); }}>♫ AUDIO</button>
          {audioOpen && <section className="audio-settings" aria-label="Pengaturan audio">
            <div className="audio-settings-head"><strong>Pengaturan audio</strong><button aria-label="Tutup pengaturan" onClick={() => setAudioOpen(false)}>×</button></div>
            <label className="audio-toggle"><span>Sound On/Off</span><button role="switch" aria-checked={audioPreferences.enabled} onClick={() => updateAudio({ enabled: !audioPreferences.enabled })}>{audioPreferences.enabled ? "ON" : "OFF"}</button></label>
            <label className="audio-slider"><span>Background Music <b>{Math.round(audioPreferences.musicVolume * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value={audioPreferences.musicVolume} onChange={e => updateAudio({ musicVolume: Number(e.target.value) })} /></label>
            <label className="audio-slider"><span>Sound Effects <b>{Math.round(audioPreferences.effectsVolume * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value={audioPreferences.effectsVolume} onChange={e => updateAudio({ effectsVolume: Number(e.target.value) })} /></label>
          </section>}
        </div>
      </div>

      {!room ? (
        <section className="home-grid">
          <div className="hero">
            <div className="eyebrow"><span>✦</span> A LITTLE GAME. A LOT OF MIND.</div>
            <h1>Think less.<br/><span>Feel the</span> flow.</h1>
            <p className="hero-copy">Satu tim. Satu urutan. Tanpa perlu berkata apa-apa. Bisakah kalian membaca timing satu sama lain?</p>
            <div className="floating-cards" aria-hidden="true">
              <div className="float-card card-coral">08</div><div className="float-card card-yellow">24</div><div className="float-card card-blue">51</div><div className="float-card card-green">79</div>
            </div>
            <div className="hero-note"><span>✳</span> COOPERATE • CONNECT • COMPLETE</div>
          </div>

          <section className="panel setup-panel">
            <div className="panel-heading"><div><div className="eyebrow dark">LET’S PLAY</div><h2>Masuk ke permainan</h2></div><span className="sparkle">✳</span></div>
            <label className="field-label">NAMA PEMAIN</label>
            <input className="text-input" maxLength={18} value={name} onChange={e => setName(e.target.value)} placeholder="Nama kamu"/>
            <label className="field-label avatar-label">PILIH AVATAR</label>
            <div className="avatar-grid">{AVATARS.map(a => <button key={a} className={`avatar-option ${avatar === a ? "selected" : ""}`} onClick={() => setAvatar(a)}>{a}</button>)}</div>
            <button className="primary-button" disabled={busy || !name.trim()} onClick={createRoom}>{busy ? "MEMBUAT..." : "＋  BUAT ROOM BARU"}</button>
            <div className="or-divider"><span/> ATAU <span/></div>
            <label className="field-label">KODE ROOM</label>
            <div className="join-row"><input className="text-input code-input" maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="CONTOH: A1B2C3"/><button className="join-button" disabled={busy || code.trim().length !== 6 || !name.trim()} onClick={joinRoom}>GABUNG</button></div>
            {error && <p className="error-text">{error}</p>}
            <div className="panel-foot">2–8 PEMAIN <span>•</span> GRATIS UNTUK DIMAINKAN BERSAMA</div>
          </section>
        </section>
      ) : (
        <section className="room-wrap">
          <div className="room-header">
            <div><div className="eyebrow dark">{room.status === "lobby" ? "WAITING ROOM" : "GAME IN PROGRESS"}</div><h1>{room.status === "lobby" ? "The crew is here." : "Find your rhythm."}</h1></div>
            <div className="room-code"><span>ROOM CODE</span><strong>{room.code}</strong><button onClick={() => navigator.clipboard?.writeText(room.code)}>COPY</button></div>
          </div>
          {room.status === "lobby" ? (
            <div className="lobby-grid">
              <div className="panel players-panel"><div className="section-title"><h2>Players <span className="count">{room.players.length}/8</span></h2><span className="live-tag">● LIVE</span></div>
                <div className="player-list">{room.players.map((p, i) => <div className="player-row" key={p.id}><div className="player-avatar">{p.avatar}</div><div className="player-meta"><strong>{p.name} {p.id === myId && <small>(Kamu)</small>}</strong><span>{p.id === room.hostId ? "HOST" : "READY"}</span></div>{p.id === room.hostId && <span className="host-star">✦</span>}</div>)}
                  {Array.from({ length: Math.max(0, 2 - room.players.length) }).map((_, i) => <div className="player-row empty" key={i}><div className="player-avatar">＋</div><div className="player-meta"><strong>Menunggu pemain...</strong><span>SHARE ROOM CODE</span></div></div>)}
                </div>
                <div className="lobby-tip"><span>💡</span> Ajak temanmu bergabung. Permainan dimulai saat minimal 2 pemain siap.</div>
                {isHost ? <button className="primary-button start-button" disabled={room.players.length < 2} onClick={startGame}>MULAI PERMAINAN <span>→</span></button> : <div className="waiting-host">Menunggu host memulai permainan…</div>}
              </div>
              <div className="panel chat-panel"><div className="section-title"><h2>Lobby chat <span className="chat-icon">✉</span></h2><span className="chat-only">LOBBY ONLY</span></div>
                <div className="messages">{room.messages.length === 0 ? <div className="empty-chat"><span>💬</span><strong>Belum ada pesan</strong><small>Sapa teman-temanmu di sini!</small></div> : room.messages.map(m => <div className={`message ${m.playerId === myId ? "mine" : ""}`} key={m.id}><span className="message-avatar">{m.avatar}</span><div><strong>{m.name}</strong><p>{m.message}</p></div></div>)}</div>
                <form className="chat-form" onSubmit={sendChat}><input value={chat} onChange={e => setChat(e.target.value)} placeholder="Tulis pesan..." maxLength={240}/><button disabled={!chat.trim()}>↑</button></form>
              </div>
            </div>
          ) : (
            <div className={`panel game-panel ${room.lastPlayed?.missed.length ? `wrong-move-${room.actionCount % 2}` : ""}`}>
              <div className="game-stats"><div className="level-stat"><span>LEVEL</span><strong>{room.level}</strong></div><div className="lives-stat"><span>NYAWA</span><strong>{"\u2764\uFE0F".repeat(room.lives)}{"\uD83D\uDDA4".repeat(Math.max(0, room.players.length-room.lives))}</strong></div><div className="shuriken-stat"><span>SHURIKEN</span><strong>✦ {room.shurikens}</strong></div><div><span>PEMAIN</span><strong>{room.players.length}</strong></div></div>
              {room.transitioning && <div className={`level-banner ${room.transitionType === "retry" ? "retry-banner" : ""}`}><strong>{room.transitionType === "retry" ? `RETRY LEVEL ${room.level}` : "LEVEL COMPLETED!"}</strong><small>{room.transitionType === "retry" ? "Nyawa berkurang. Coba lagi di level yang sama…" : `Bersiap untuk level ${room.level + 1}…`}</small></div>}
              {room.transitioning && room.transitionType === "level" && <div className="confetti" aria-hidden="true">{Array.from({length:18},(_,i)=><i key={i} style={{"--i":i} as React.CSSProperties}/>)}</div>}
              {room.status === "won" || room.status === "lost" ? <div className="game-result"><div className="result-icon">{room.status === "won" ? "🏆" : "💔"}</div><h2>{room.status === "won" ? "Kalian berhasil!" : "GAME OVER"}</h2><p>{room.status === "won" ? "Kerja sama yang luar biasa." : "Nyawa tim sudah habis. Coba lagi bersama!"}</p><button className="primary-button" onClick={leave}>KEMBALI KE BERANDA</button></div> : <>
                <div className={`game-board seats-${room.players.length}`}>
                  <div className="board-felt">
                    <div className="board-center" aria-live="polite">
                      <span className="center-label">KARTU TERAKHIR</span>
                      <div className="center-pile">{room.playedCards.slice(-7).map((value, index) => <span key={`${room.actionCount}-${index}-${value}`} className={`center-card ${index === Math.min(room.playedCards.length, 7) - 1 ? "latest" : ""}`}>{value}</span>)}{room.lastPlayed?.type === "shuriken" && room.lastPlayed.discarded?.map((card, index) => <span key={`shuriken-${room.lastPlayed?.actionId}-${index}`} className="center-card shuriken-discard" style={{ animationDelay: `${index * 60}ms` }}>{card.value}</span>)}{room.playedCards.length === 0 && <span className="center-empty">Rasakan timing timmu</span>}</div>
                      {room.lastPlayed && <div className={`last-play-status ${room.lastPlayed.mistake ? "mistake-status" : ""}`}><strong>{room.lastPlayed.type === "shuriken" ? "SHURIKEN" : room.lastPlayed.value}</strong><span>{room.lastPlayed.type === "shuriken" ? "Kartu terendah dibuang" : room.lastPlayed.mistake ? `Urutan salah · terlewat ${room.lastPlayed.missed.join(", ")}` : `${room.lastPlayed.playerName} memainkan kartu`}</span>{room.lastPlayed.discarded && <small>{room.lastPlayed.discarded.map(card => `${card.playerName}: ${card.value}`).join(" · ")}</small>}</div>}
                    </div>
                  </div>
                  {room.players.map((player, index) => <div key={player.id} className={`board-seat ${player.id === myId ? "my-seat" : ""}`} style={getSeatPosition(index, room.players.length)}><span className="seat-avatar">{player.avatar}</span><strong>{player.name}{player.id === myId && <small> KAMU</small>}</strong><span className="seat-card-count">{player.id === myId ? hand.length : room.hands.find(item => item.playerId === player.id)?.cards ?? 0} kartu</span></div>)}
                </div>
                <div className="hand-area"><div className="hand-title"><strong>KARTU KAMU</strong><span>{hand.length} kartu tersisa</span></div><div className="hand-cards">{hand.map(n => <button key={n} disabled={busy || room.transitioning || room.status !== "playing"} onClick={() => playCard(n)} className={`number-card ${playingCard === n ? "card-playing" : ""}`}><span>THE MIND</span><strong>{n}</strong><small>PLAY CARD</small></button>)}</div>{hand.length === 0 && <p className="no-cards">Kamu sudah menghabiskan kartu level ini. Tunggu temanmu…</p>}</div>
                <div className="shuriken-controls"><button className="shuriken-button" disabled={room.shurikens <= 0 || room.transitioning || room.status !== "playing" || busy || room.shurikenVoters.includes(myId)} onClick={()=>setShurikenConfirm(true)}>{"\u2726"} Gunakan Shuriken <b>{room.shurikens}</b></button><span>{room.shurikenVoters.includes(myId) ? "Kamu setuju — menunggu pemain lain" : room.shurikenVotes > 0 ? `${room.shurikenVotes}/${room.players.length} pemain setuju` : "Butuh persetujuan semua pemain"}</span></div><p className="silent-note">🤫 Tidak ada chat selama permainan. Rasakan timing satu sama lain.</p>
              </>}
              {error && <p className="error-text">{error}</p>}
            </div>
          )}
          <button className="leave-button" onClick={leave}>← Keluar dari room</button>
        </section>
      )}
      {shurikenConfirm && room?.status === "playing" && <div className="modal-backdrop"><div className="confirm-modal"><span className="shuriken-icon">✦</span><h2>Gunakan Shuriken?</h2><p>Semua pemain harus setuju. Setelah disetujui bersama, setiap pemain membuang satu kartu terendah.</p><div><button onClick={()=>setShurikenConfirm(false)}>BATAL</button><button className="confirm-use" onClick={useShuriken}>SAYA SETUJU</button></div></div></div>}\n      <footer><span>✳ THE MIND ONLINE</span><span>BUILT FOR GOOD CONNECTIONS.</span></footer>
    </main>
  );
}
