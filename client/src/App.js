import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const socket = io('https://mafia-game-ttb9.onrender.com');

const EMOJIS = ['🐱','🐶','🦊','🐻','🐼','🐨','🦁','🐯','🐸','🐙','🦄','🐺','🎭','👻','🧛','🕵️','🤠','🥷'];
const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63','#00bcd4','#8bc34a'];
const roleColor = { '마피아': '#e74c3c', '경찰': '#3498db', '의사': '#2ecc71', '시민': '#95a5a6' };
const roleEmoji = { '마피아': '🔪', '경찰': '🔍', '의사': '💊', '시민': '👤' };
const glowClass = { '마피아': 'card-glow-red', '경찰': 'card-glow-blue', '의사': 'card-glow-green', '시민': '' };

// 효과음
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function getAudioCtx() { if (!audioCtx) audioCtx = new AudioCtx(); return audioCtx; }

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.15;

    if (type === 'vote') { osc.frequency.value = 600; osc.type = 'sine'; gain.gain.value = 0.1; }
    else if (type === 'death') { osc.frequency.value = 200; osc.type = 'sawtooth'; gain.gain.value = 0.12; }
    else if (type === 'heal') { osc.frequency.value = 800; osc.type = 'sine'; gain.gain.value = 0.1; }
    else if (type === 'day') { osc.frequency.value = 523; osc.type = 'triangle'; }
    else if (type === 'night') { osc.frequency.value = 330; osc.type = 'sine'; }
    else if (type === 'votePhase') { osc.frequency.value = 440; osc.type = 'square'; gain.gain.value = 0.08; }
    else if (type === 'timer') { osc.frequency.value = 880; osc.type = 'square'; gain.gain.value = 0.06; }
    else if (type === 'win') { osc.frequency.value = 700; osc.type = 'triangle'; }
    else if (type === 'lose') { osc.frequency.value = 180; osc.type = 'sawtooth'; gain.gain.value = 0.1; }
    else if (type === 'click') { osc.frequency.value = 500; osc.type = 'sine'; gain.gain.value = 0.05; }

    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (type === 'death' ? 1.2 : 0.3));
    osc.stop(ctx.currentTime + (type === 'death' ? 1.5 : 0.4));
  } catch (e) {}
}

// 파티클
function Particles() {
  const particles = Array.from({ length: 15 }, (_, i) => ({
    id: i, left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 10}s`, duration: `${8 + Math.random() * 12}s`,
    size: `${2 + Math.random() * 3}px`,
    color: ['rgba(231,76,60,0.5)', 'rgba(155,89,182,0.5)', 'rgba(52,152,219,0.5)'][Math.floor(Math.random() * 3)]
  }));
  return (
    <div className="bg-particles">
      {particles.map((p) => (
        <div key={p.id} style={{ position: 'absolute', left: p.left, bottom: '-10px', width: p.size, height: p.size, borderRadius: '50%', background: p.color, animation: `starFloat ${p.duration} ${p.delay} linear infinite` }} />
      ))}
    </div>
  );
}

// 설정 행
function SettingRow({ label, value, options, onChange }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div className="input-label">{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
        {options.map((opt) => (
          <button key={opt} className={`setting-option ${value === opt ? 'active' : ''}`} onClick={() => { onChange(opt); playSound('click'); }}>{opt}</button>
        ))}
      </div>
    </div>
  );
}

// 타이머
function Timer({ timeLeft, phase, totalTime, muted }) {
  const pct = totalTime > 0 ? (timeLeft / totalTime) * 100 : 0;
  const color = timeLeft <= 10 ? '#e74c3c' : timeLeft <= 30 ? '#f39c12' : '#2ecc71';
  const label = phase === 'day' ? '☀️ 낮 토론' : phase === 'vote' ? '🗳️ 투표' : '🌙 밤';
  useEffect(() => { if (timeLeft === 10 && !muted) playSound('timer'); }, [timeLeft, muted]);
  return (
    <div className="timer-container">
      <div style={{ fontSize: '12px', color: '#666', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
      <div className={`timer-value ${timeLeft <= 10 ? 'urgent' : ''}`} style={{ color }}>{timeLeft}초</div>
      <div className="timer-bar"><div className="timer-bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

// 채팅
function ChatBox({ chatMessages, chatInput, setChatInput, onSend, phase, myRole }) {
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);
  const canChat = phase === 'day' || phase === 'vote' || myRole === '마피아';
  return (
    <div className="chat-container">
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', letterSpacing: '1px' }}>
        {phase === 'night' && myRole === '마피아' ? '🔴 마피아 전용 채팅' : phase === 'night' ? '🌙 밤에는 채팅 불가' : '💬 전체 채팅'}
      </div>
      <div className="chat-messages">
        {chatMessages.map((msg, i) => (
          <div key={i} className="chat-message">
            <span style={{ color: msg.type === 'system' ? '#f39c12' : msg.type === 'mafia' ? '#e74c3c' : '#888', fontWeight: 700 }}>
              {msg.emoji} {msg.nickname}
            </span>
            <span style={{ color: '#ccc' }}>: {msg.message}</span>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      {canChat && (
        <div className="chat-input-row">
          <input ref={inputRef} className="chat-input" value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            placeholder="메시지 입력..." />
          <button className="btn btn-blue btn-sm" onClick={onSend}>전송</button>
        </div>
      )}
    </div>
  );
}

// 페이즈 오버레이
function PhaseOverlay({ event, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  let icon = '☀️', text = '', sub = '', cls = 'phase-overlay-day';
  if (event?.event === 'nightKill') { icon = '💀'; text = `${event.killedEmoji} ${event.killedNickname} 님이 사망했습니다`; sub = '마피아의 소행입니다...'; cls = 'phase-overlay-night'; }
  else if (event?.event === 'healed') { icon = '💊'; text = `${event.healedEmoji} ${event.healedNickname} 님이 살아남았습니다!`; sub = '의사의 활약!'; cls = 'phase-overlay-day'; }
  else if (event?.event === 'peacefulNight') { icon = '☀️'; text = '평화로운 밤이었습니다'; sub = '아무도 사망하지 않았습니다'; cls = 'phase-overlay-day'; }
  else if (event?.event === 'eliminated') { icon = '⚖️'; text = `${event.eliminatedEmoji} ${event.eliminatedNickname} 님이 처형되었습니다`; sub = '시민들의 투표 결과입니다'; cls = 'phase-overlay-vote'; }
  else if (event?.event === 'voteTie') { icon = '⚖️'; text = '투표 동점!'; sub = '아무도 처형되지 않았습니다'; cls = 'phase-overlay-vote'; }
  else if (event?.event === 'noVote') { icon = '⚖️'; text = '표가 부족합니다'; sub = '아무도 처형되지 않았습니다'; cls = 'phase-overlay-vote'; }
  else if (event?.event === 'voteStart') { icon = '🗳️'; text = '투표 시간!'; sub = '마피아를 지목하세요'; cls = 'phase-overlay-vote'; }
  else if (event?.phase === 'night') { icon = '🌙'; text = '밤이 찾아왔습니다...'; sub = '마피아가 활동합니다'; cls = 'phase-overlay-night'; }
  else { icon = '☀️'; text = '날이 밝았습니다'; sub = '토론을 시작하세요'; cls = 'phase-overlay-day'; }
  return (
    <div className={`phase-overlay ${cls}`}>
      <div className="phase-overlay-icon">{icon}</div>
      <div className="phase-overlay-text">{text}</div>
      <div className="phase-overlay-sub">{sub}</div>
    </div>
  );
}

function App() {
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [screen, setScreen] = useState('lobby');
  const [lobbyTab, setLobbyTab] = useState('create');
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState('');
  const [myRole, setMyRole] = useState('');
  const [phase, setPhase] = useState('day');
  const [isHost, setIsHost] = useState(false);
  const [votes, setVotes] = useState({});
  const [voteDetails, setVoteDetails] = useState({});
  const [myVote, setMyVote] = useState('');
  const [policeResult, setPoliceResult] = useState('');
  const [gameOver, setGameOver] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [lobbyRankings, setLobbyRankings] = useState([]);
  const [showRankings, setShowRankings] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('🎭');
  const [selectedColor, setSelectedColor] = useState('#e74c3c');
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(90);
  const [roomSettings, setRoomSettings] = useState(null);
  const [muted, setMuted] = useState(false);
  const [overlay, setOverlay] = useState(null);
  const [settings, setSettings] = useState({
    maxPlayers: 10, mafiaCount: 2, policeCount: 1, doctorCount: 1,
    dayTime: 90, voteTime: 45, nightTime: 45
  });

  const hideOverlay = useCallback(() => setOverlay(null), []);

  useEffect(() => {
    socket.on('roomUpdate', (room) => {
      setPlayers(room.players);
      setIsHost(room.host === socket.id);
      setRoomSettings(room.settings);
      setScreen((prev) => prev === 'lobby' ? 'room' : prev);
    });
    socket.on('gameState', ({ phase, players, myRole, settings }) => {
      setPhase(phase); setPlayers(players); setMyRole(myRole); setMyVote(''); setScreen('game');
      if (settings) setTotalTime(phase === 'day' ? settings.dayTime : phase === 'vote' ? settings.voteTime : settings.nightTime);
    });
    socket.on('timerUpdate', ({ timeLeft, phase }) => { setTimeLeft(timeLeft); setPhase(phase); });
    socket.on('voteUpdate', ({ votes, voteDetails }) => { setVotes(votes); if (voteDetails) setVoteDetails(voteDetails); });
    socket.on('phaseChange', (data) => {
      setPhase(data.phase); setMyVote(''); setVotes({}); setVoteDetails({}); setPoliceResult('');
      setOverlay(data);
      if (!muted) {
        if (data.event === 'nightKill') playSound('death');
        else if (data.event === 'healed') playSound('heal');
        else if (data.event === 'eliminated') playSound('death');
        else if (data.event === 'voteStart') playSound('votePhase');
        else if (data.phase === 'night') playSound('night');
        else playSound('day');
      }
    });
    socket.on('policeResult', ({ nickname, emoji, role }) => {
      setPoliceResult(`🔍 ${emoji} ${nickname} 님의 정체는 [${role}] 입니다!`);
    });
    socket.on('chatMessage', ({ nickname, message, type, emoji }) => {
      setChatMessages((prev) => [...prev, { nickname, message, type, emoji }]);
    });
    socket.on('gameOver', ({ winner, players, rankings }) => {
      setPlayers(players); setGameOver(winner); setRankings(rankings); setScreen('gameover');
      if (!muted) playSound(winner === '시민' ? 'win' : 'lose');
    });
    socket.on('rankingsList', (list) => { setLobbyRankings(list); });
    socket.on('error', (msg) => setError(msg));
    return () => {
      socket.off('roomUpdate'); socket.off('gameState'); socket.off('timerUpdate');
      socket.off('voteUpdate'); socket.off('phaseChange'); socket.off('policeResult');
      socket.off('chatMessage'); socket.off('gameOver'); socket.off('rankingsList'); socket.off('error');
    };
  }, [muted]);

  const handleCreateRoom = () => {
    if (!nickname || !roomCode) { setError('닉네임과 방 코드를 입력해 주세요!'); return; }
    setError(''); socket.emit('createRoom', { roomCode, nickname, emoji: selectedEmoji, color: selectedColor, settings });
  };
  const handleJoinRoom = () => {
    if (!nickname || !roomCode) { setError('닉네임과 방 코드를 입력해 주세요!'); return; }
    setError(''); socket.emit('joinRoom', { roomCode, nickname, emoji: selectedEmoji, color: selectedColor });
  };
  const handleStartGame = () => socket.emit('startGame', { roomCode });
  const handleVote = (targetId) => { if (myVote) return; setMyVote(targetId); socket.emit('vote', { roomCode, targetId }); if (!muted) playSound('vote'); };
  const handleNightAction = (targetId) => { if (myVote) return; setMyVote(targetId); socket.emit('nightAction', { roomCode, targetId }); if (!muted) playSound('click'); };
  const handleSendChat = () => { if (!chatInput.trim()) return; socket.emit('chatMessage', { roomCode, message: chatInput }); setChatInput(''); };
  const handleShowRankings = () => { socket.emit('getRankings'); setShowRankings(true); };

  const getRankBadge = (i, total) => {
    const pct = (i + 1) / total;
    if (i === 0) return '👑'; if (pct <= 0.1) return '🥇'; if (pct <= 0.3) return '🥈'; if (pct <= 0.5) return '🥉'; return `#${i + 1}`;
  };

  // 투표 현황 (누가 누구에게)
  const getVotersFor = (targetId) => {
    return Object.values(voteDetails).filter((v) => v.targetId === targetId);
  };

  // 게임 오버
  if (screen === 'gameover') {
    return (
      <div className="app-container">
        <Particles />
        <button className="mute-btn" onClick={() => setMuted(!muted)}>{muted ? '🔇' : '🔊'}</button>
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', position: 'relative', zIndex: 1 }}>
          <h1 className="game-title">마피아 게임</h1>
          <div className={`result-banner ${gameOver === '시민' ? 'alert-green' : 'alert-red'}`}>
            <div style={{ fontSize: '48px' }}>{gameOver === '시민' ? '🎉' : '💀'}</div>
            <h2>{gameOver === '시민' ? '시민 팀 승리!' : '마피아 팀 승리!'}</h2>
          </div>
          <div className="section-header">최종 결과</div>
          {players.map((p) => (
            <div key={p.id} className="player-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="avatar avatar-md" style={{ background: p.color || '#333' }}>{p.emoji || '🎭'}</div>
                <div>
                  <div style={{ fontWeight: 700 }}>{p.nickname}</div>
                  <div style={{ color: roleColor[p.role], fontSize: '13px' }}>{roleEmoji[p.role]} {p.role}</div>
                </div>
              </div>
              <span style={{ fontSize: '20px' }}>{p.alive ? '✅' : '💀'}</span>
            </div>
          ))}
          <div className="section-header" style={{ marginTop: '16px' }}>🏆 랭킹</div>
          {rankings.slice(0, 20).map((r, i) => (
            <div key={r.nickname} className={`ranking-card ${i === 0 ? 'top1' : (i + 1) / rankings.length <= 0.1 ? 'top10' : (i + 1) / rankings.length <= 0.3 ? 'top30' : ''}`}>
              <div style={{ fontSize: '20px', width: '32px', textAlign: 'center', fontWeight: 700 }}>{getRankBadge(i, rankings.length)}</div>
              <div className="avatar avatar-sm" style={{ background: r.color || '#333' }}>{r.emoji || '🎭'}</div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{r.nickname}</div><div style={{ fontSize: '11px', color: '#666' }}>{r.wins}승 {r.losses}패 / {r.games}판</div></div>
              <div style={{ fontWeight: 900, color: '#f39c12', fontSize: '18px' }}>{r.score}<span style={{ fontSize: '11px', color: '#888' }}>점</span></div>
            </div>
          ))}
          <button className="btn btn-blue btn-full" style={{ marginTop: '16px' }} onClick={() => window.location.reload()}>처음으로 돌아가기</button>
        </div>
        <div style={{ maxWidth: '480px', margin: '0 auto', width: '100%' }}>
          <ChatBox chatMessages={chatMessages} chatInput={chatInput} setChatInput={setChatInput} onSend={handleSendChat} phase={phase} myRole={myRole} />
        </div>
      </div>
    );
  }

  // 게임 진행
  if (screen === 'game') {
    const alivePlayers = players.filter((p) => p.alive);
    const deadPlayers = players.filter((p) => !p.alive);
    const me = players.find((p) => p.id === socket.id);
    const amAlive = me?.alive !== false;

    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Particles />
        <button className="mute-btn" onClick={() => setMuted(!muted)}>{muted ? '🔇' : '🔊'}</button>
        {overlay && <PhaseOverlay event={overlay} onDone={hideOverlay} />}
        <div style={{ flex: 1, overflowY: 'auto', maxWidth: '480px', margin: '0 auto', width: '100%', padding: '16px', position: 'relative', zIndex: 1 }}>
          <h1 className="game-title" style={{ fontSize: '22px', marginBottom: '10px' }}>마피아 게임</h1>
          <Timer timeLeft={timeLeft} phase={phase} totalTime={totalTime} muted={muted} />
          <div className={`card ${glowClass[myRole]}`} style={{ textAlign: 'center', background: `${roleColor[myRole]}15`, borderColor: `${roleColor[myRole]}44` }}>
            <div style={{ fontSize: '28px', marginBottom: '4px' }}>{roleEmoji[myRole]}</div>
            <div className="role-badge" style={{ color: roleColor[myRole], borderColor: `${roleColor[myRole]}66`, background: `${roleColor[myRole]}15`, margin: '0 auto' }}>내 역할: {myRole}</div>
          </div>
          <div className={`phase-banner ${phase === 'day' ? 'alert-orange' : phase === 'vote' ? 'alert-red' : ''}`} style={phase === 'night' ? { background: 'rgba(52,73,94,0.4)', border: '1px solid rgba(52,73,94,0.6)', color: '#fff' } : {}}>
            {phase === 'day' ? '☀️ 낮 — 대화하며 마피아를 찾으세요!' : phase === 'vote' ? '🗳️ 투표 — 마피아를 처형하세요!' : '🌙 밤 — 역할을 수행하세요!'}
          </div>
          {policeResult && <div className="alert alert-blue">{policeResult}</div>}
          {error && <div className="alert alert-red">{error}</div>}

          <div className="section-header">생존자 ({alivePlayers.length}명)</div>
          {alivePlayers.map((p) => {
            const votersForThis = getVotersFor(p.id);
            return (
              <div key={p.id} className={`player-card ${votes[socket.id] === p.id ? 'voted' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <div className="avatar avatar-md" style={{ background: p.color || '#333' }}>{p.emoji || '🎭'}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{p.nickname} {p.id === socket.id && <span style={{ color: '#666', fontSize: '11px' }}>(나)</span>}</div>
                    {votersForThis.length > 0 && (
                      <div style={{ display: 'flex', gap: '3px', marginTop: '3px', flexWrap: 'wrap' }}>
                        {votersForThis.map((v) => (
                          <span key={v.voterId} title={v.voterNickname} style={{ width: '22px', height: '22px', borderRadius: '50%', background: v.voterColor || '#333', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', border: '1px solid rgba(255,255,255,0.2)' }}>{v.voterEmoji}</span>
                        ))}
                        <span style={{ color: '#f39c12', fontSize: '12px', fontWeight: 700, marginLeft: '4px' }}>{votersForThis.length}표</span>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {phase === 'vote' && amAlive && p.id !== socket.id && !myVote && (
                    <button className="btn btn-red btn-sm" onClick={() => handleVote(p.id)}>투표</button>
                  )}
                  {phase === 'night' && amAlive && p.id !== socket.id && !myVote && (
                    <>
                      {myRole === '마피아' && <button className="btn btn-red btn-sm" onClick={() => handleNightAction(p.id)}>🔪</button>}
                      {myRole === '의사' && <button className="btn btn-green btn-sm" onClick={() => handleNightAction(p.id)}>💊</button>}
                      {myRole === '경찰' && <button className="btn btn-blue btn-sm" onClick={() => handleNightAction(p.id)}>🔍</button>}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {myVote && <div className="alert alert-green">✅ 행동 완료! 다른 플레이어를 기다리는 중...</div>}
          {!amAlive && <div className="alert" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#666' }}>💀 사망했습니다. 게임을 지켜보세요.</div>}

          {deadPlayers.length > 0 && (
            <>
              <div className="section-header" style={{ marginTop: '8px' }}>사망자 ({deadPlayers.length}명)</div>
              {deadPlayers.map((p) => (
                <div key={p.id} className="player-card dead">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="avatar avatar-md" style={{ background: p.color || '#333', filter: 'grayscale(1)' }}>{p.emoji || '🎭'}</div>
                    <div style={{ color: '#555', fontWeight: 700 }}>{p.nickname}</div>
                  </div>
                  <span>💀</span>
                </div>
              ))}
            </>
          )}
        </div>
        <div style={{ maxWidth: '480px', margin: '0 auto', width: '100%', position: 'relative', zIndex: 1 }}>
          <ChatBox chatMessages={chatMessages} chatInput={chatInput} setChatInput={setChatInput} onSend={handleSendChat} phase={phase} myRole={myRole} />
        </div>
      </div>
    );
  }

  // 대기실
  if (screen === 'room') {
    return (
      <div className="app-container">
        <Particles />
        <button className="mute-btn" onClick={() => setMuted(!muted)}>{muted ? '🔇' : '🔊'}</button>
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', position: 'relative', zIndex: 1 }}>
          <h1 className="game-title">마피아 게임</h1>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#666', letterSpacing: '1px', marginBottom: '6px' }}>방 코드</div>
            <div className="room-code">{roomCode}</div>
          </div>
          {roomSettings && (
            <div className="card" style={{ fontSize: '13px', color: '#777' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <span>👥 {roomSettings.maxPlayers}명</span>
                <span>🔪 마피아 {roomSettings.mafiaCount}</span>
                <span>🔍 경찰 {roomSettings.policeCount}</span>
                <span>💊 의사 {roomSettings.doctorCount}</span>
                <span>☀️ {roomSettings.dayTime}초</span>
                <span>🗳️ {roomSettings.voteTime}초</span>
                <span>🌙 {roomSettings.nightTime}초</span>
              </div>
            </div>
          )}
          {error && <div className="alert alert-red">{error}</div>}
          <div className="section-header">참가자 ({players.length}/{roomSettings?.maxPlayers || 10})</div>
          {players.map((p) => (
            <div key={p.id} className="player-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="avatar avatar-md" style={{ background: p.color || '#333' }}>{p.emoji || '🎭'}</div>
                <div style={{ fontWeight: 700 }}>{p.nickname} {p.id === socket.id && <span style={{ color: '#666', fontSize: '11px' }}>(나)</span>}</div>
              </div>
            </div>
          ))}
          {isHost ? (
            <button className="btn btn-red btn-full" style={{ marginTop: '12px' }} onClick={handleStartGame}>🎮 게임 시작 (최소 5명)</button>
          ) : (
            <div style={{ textAlign: 'center', color: '#666', marginTop: '16px', fontSize: '14px' }}>⏳ 방장이 게임을 시작하길 기다리는 중...</div>
          )}
        </div>
      </div>
    );
  }

  // 로비 — 랭킹 보기
  if (showRankings) {
    return (
      <div className="app-container" style={{ minHeight: '100vh' }}>
        <Particles />
        <div style={{ maxWidth: '420px', margin: '0 auto', padding: '24px', position: 'relative', zIndex: 1 }}>
          <h1 className="game-title">🏆 랭킹</h1>
          <p className="game-subtitle">Mafia Game Rankings</p>
          {lobbyRankings.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: '#666', padding: '30px' }}>아직 기록이 없습니다. 게임을 플레이해 보세요!</div>
          ) : (
            lobbyRankings.slice(0, 30).map((r, i) => (
              <div key={r.nickname} className={`ranking-card ${i === 0 ? 'top1' : (i + 1) / lobbyRankings.length <= 0.1 ? 'top10' : (i + 1) / lobbyRankings.length <= 0.3 ? 'top30' : ''}`}>
                <div style={{ fontSize: '20px', width: '32px', textAlign: 'center', fontWeight: 700 }}>{getRankBadge(i, lobbyRankings.length)}</div>
                <div className="avatar avatar-sm" style={{ background: r.color || '#333' }}>{r.emoji || '🎭'}</div>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{r.nickname}</div><div style={{ fontSize: '11px', color: '#666' }}>{r.wins}승 {r.losses}패 / {r.games}판</div></div>
                <div style={{ fontWeight: 900, color: '#f39c12', fontSize: '18px' }}>{r.score}<span style={{ fontSize: '11px', color: '#888' }}>점</span></div>
              </div>
            ))
          )}
          <button className="btn btn-dark btn-full" style={{ marginTop: '16px' }} onClick={() => setShowRankings(false)}>← 돌아가기</button>
        </div>
      </div>
    );
  }

  // 로비
  return (
    <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Particles />
      <div style={{ maxWidth: '420px', width: '100%', padding: '24px', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '8px', fontSize: '48px', animation: 'float 3s ease-in-out infinite' }}>🎭</div>
        <h1 className="game-title">마피아 게임</h1>
        <p className="game-subtitle">Real-time Mafia Game</p>

        {/* 랭킹 보기 버튼 */}
        <button className="btn btn-purple btn-full" style={{ marginBottom: '16px' }} onClick={handleShowRankings}>🏆 랭킹 보기</button>

        {error && <div className="alert alert-red">{error}</div>}

        <div className="card">
          {/* 탭 */}
          <div className="lobby-tabs">
            <button className={`lobby-tab ${lobbyTab === 'create' ? 'active' : ''}`} onClick={() => setLobbyTab('create')}>방 만들기</button>
            <button className={`lobby-tab ${lobbyTab === 'join' ? 'active' : ''}`} onClick={() => setLobbyTab('join')}>방 입장</button>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <div className="input-label">닉네임</div>
            <input className="input-field" style={{ marginTop: '6px' }} placeholder="닉네임 입력" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <div className="input-label">방 코드</div>
            <input className="input-field" style={{ marginTop: '6px' }} placeholder="방 코드 입력" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} />
          </div>

          {/* 이모지 */}
          <div style={{ marginBottom: '14px' }}>
            <div className="input-label">프로필 이모지</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {EMOJIS.map((e) => (
                <div key={e} onClick={() => setSelectedEmoji(e)} style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', borderRadius: '8px', cursor: 'pointer', border: `2px solid ${selectedEmoji === e ? '#3498db' : 'transparent'}`, background: selectedEmoji === e ? 'rgba(52,152,219,0.2)' : 'rgba(255,255,255,0.04)' }}>{e}</div>
              ))}
            </div>
          </div>

          {/* 색상 */}
          <div style={{ marginBottom: '16px' }}>
            <div className="input-label">프로필 색상</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
              {COLORS.map((c) => (
                <div key={c} onClick={() => setSelectedColor(c)} style={{ width: '30px', height: '30px', borderRadius: '50%', background: c, cursor: 'pointer', border: `3px solid ${selectedColor === c ? 'white' : 'transparent'}`, boxShadow: selectedColor === c ? `0 0 12px ${c}` : 'none' }} />
              ))}
            </div>
          </div>

          {/* 미리보기 */}
          <div style={{ textAlign: 'center', marginBottom: '16px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
            <div className="avatar avatar-lg" style={{ background: selectedColor, margin: '0 auto 8px', animation: 'float 3s ease-in-out infinite', boxShadow: `0 0 20px ${selectedColor}66` }}>{selectedEmoji}</div>
            <div style={{ color: '#aaa', fontSize: '14px', fontWeight: 600 }}>{nickname || '닉네임'}</div>
          </div>

          {/* 방 설정 — 방 만들기 탭일 때만 */}
          {lobbyTab === 'create' && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px', marginBottom: '16px' }}>
              <div className="section-header">⚙️ 방 설정</div>
              <SettingRow label="👥 최대 인원" value={settings.maxPlayers} options={[5,6,7,8,9,10,15,20,25,30]} onChange={(v) => setSettings((s) => ({ ...s, maxPlayers: v }))} />
              <SettingRow label="🔪 마피아 수" value={settings.mafiaCount} options={[1,2,3,4,5,6,7,8,9,10]} onChange={(v) => setSettings((s) => ({ ...s, mafiaCount: v }))} />
              <SettingRow label="🔍 경찰 수" value={settings.policeCount} options={[0,1,2,3,4,5]} onChange={(v) => setSettings((s) => ({ ...s, policeCount: v }))} />
              <SettingRow label="💊 의사 수" value={settings.doctorCount} options={[0,1,2,3,4,5]} onChange={(v) => setSettings((s) => ({ ...s, doctorCount: v }))} />
              <SettingRow label="☀️ 낮 토론 시간" value={settings.dayTime} options={[30,60,90,120,180]} onChange={(v) => setSettings((s) => ({ ...s, dayTime: v }))} />
              <SettingRow label="🗳️ 투표 시간" value={settings.voteTime} options={[20,30,45,60,90]} onChange={(v) => setSettings((s) => ({ ...s, voteTime: v }))} />
              <SettingRow label="🌙 밤 행동 시간" value={settings.nightTime} options={[20,30,45,60,90]} onChange={(v) => setSettings((s) => ({ ...s, nightTime: v }))} />
            </div>
          )}

          {lobbyTab === 'create' ? (
            <button className="btn btn-red btn-full" onClick={handleCreateRoom}>방 만들기</button>
          ) : (
            <button className="btn btn-blue btn-full" onClick={handleJoinRoom}>방 입장</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;