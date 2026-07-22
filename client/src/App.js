import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDUr3_tlA4Dk_0YUwPfa42YtzPVqyTOylc",
  authDomain: "mafia-game-bd7ae.firebaseapp.com",
  projectId: "mafia-game-bd7ae",
  storageBucket: "mafia-game-bd7ae.firebasestorage.app",
  messagingSenderId: "641427360069",
  appId: "1:641427360069:web:d5fb81f8219fac5614962c"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();

const socket = io('https://mafia-game-ttb9.onrender.com');

const EMOJIS = ['🐱','🐶','🦊','🐻','🐼','🐨','🦁','🐯','🐸','🐙','🦄','🐺','🎭','👻','🧛','🕵️','🤠','🥷','🐧','🦋','🐳','🎃','🤖','👾'];
const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63','#00bcd4','#8bc34a','#ff6b6b','#ffd93d'];
const roleColor = { '마피아': '#e74c3c', '경찰': '#3498db', '의사': '#2ecc71', '시민': '#95a5a6' };
const roleEmoji = { '마피아': '🔪', '경찰': '🔍', '의사': '💊', '시민': '👤' };

// 효과음
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function getAudioCtx() { if (!audioCtx) audioCtx = new AudioCtx(); return audioCtx; }
function playSound(type) {
  try {
    const ctx = getAudioCtx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination); gain.gain.value = 0.12;
    if (type === 'vote') { osc.frequency.value = 600; osc.type = 'sine'; }
    else if (type === 'death') { osc.frequency.value = 200; osc.type = 'sawtooth'; }
    else if (type === 'heal') { osc.frequency.value = 800; osc.type = 'sine'; }
    else if (type === 'day') { osc.frequency.value = 523; osc.type = 'triangle'; }
    else if (type === 'night') { osc.frequency.value = 330; osc.type = 'sine'; }
    else if (type === 'click') { osc.frequency.value = 500; osc.type = 'sine'; gain.gain.value = 0.05; }
    else if (type === 'win') { osc.frequency.value = 700; osc.type = 'triangle'; }
    else if (type === 'lose') { osc.frequency.value = 180; osc.type = 'sawtooth'; }
    osc.start(); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4); osc.stop(ctx.currentTime + 0.5);
  } catch (e) {}
}

// 스타일
const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', fontFamily: "'Segoe UI', sans-serif", color: '#333', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  pageDark: { minHeight: '100vh', background: 'linear-gradient(135deg, #0c0c1d 0%, #1a1a3e 50%, #0c0c1d 100%)', fontFamily: "'Segoe UI', sans-serif", color: '#fff', display: 'flex', flexDirection: 'column' },
  container: { maxWidth: '460px', width: '100%', padding: '20px', margin: '0 auto' },
  card: { background: 'rgba(255,255,255,0.95)', borderRadius: '20px', padding: '24px', marginBottom: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', backdropFilter: 'blur(10px)' },
  cardDark: { background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '18px', marginBottom: '12px', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)' },
  title: { textAlign: 'center', fontSize: '36px', fontWeight: 900, color: '#fff', textShadow: '0 4px 20px rgba(0,0,0,0.3)', marginBottom: '8px' },
  subtitle: { textAlign: 'center', fontSize: '14px', color: 'rgba(255,255,255,0.7)', marginBottom: '24px' },
  btn: (bg, shadow) => ({ width: '100%', padding: '16px', border: 'none', borderRadius: '16px', fontSize: '17px', fontWeight: 800, color: '#fff', cursor: 'pointer', background: bg, boxShadow: `0 6px 20px ${shadow}`, transition: 'all 0.2s', marginBottom: '12px' }),
  btnSm: (bg) => ({ padding: '8px 16px', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, color: '#fff', cursor: 'pointer', background: bg, transition: 'all 0.2s' }),
  input: { width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e8e8e8', fontSize: '15px', outline: 'none', boxSizing: 'border-box', transition: 'border 0.3s', background: '#fafafa' },
  label: { fontSize: '13px', fontWeight: 700, color: '#888', marginBottom: '6px', display: 'block', letterSpacing: '1px', textTransform: 'uppercase' },
  avatar: (color, size = 48) => ({ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5, border: '3px solid rgba(255,255,255,0.4)', flexShrink: 0 }),
  header: { fontSize: '13px', fontWeight: 700, color: '#aaa', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '6px' },
  headerDark: { fontSize: '13px', fontWeight: 700, color: '#666', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px' },
};

function SettingRow({ label, value, options, onChange }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={S.label}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
        {options.map((opt) => (
          <button key={opt} onClick={() => { onChange(opt); playSound('click'); }} style={{
            padding: '7px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
            border: value === opt ? '2px solid #667eea' : '2px solid #e8e8e8',
            background: value === opt ? 'rgba(102,126,234,0.1)' : '#f8f8f8',
            color: value === opt ? '#667eea' : '#999'
          }}>{opt}</button>
        ))}
      </div>
    </div>
  );
}

function Timer({ timeLeft, phase, totalTime }) {
  const pct = totalTime > 0 ? (timeLeft / totalTime) * 100 : 0;
  const color = timeLeft <= 10 ? '#e74c3c' : timeLeft <= 30 ? '#f39c12' : '#2ecc71';
  const label = phase === 'day' ? '☀️ 낮 토론' : phase === 'vote' ? '🗳️ 투표' : '🌙 밤';
  return (
    <div style={{ ...S.cardDark, textAlign: 'center', padding: '14px' }}>
      <div style={{ fontSize: '12px', color: '#888', letterSpacing: '1px', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '40px', fontWeight: 900, color, lineHeight: 1, animation: timeLeft <= 10 ? 'pulse 0.5s infinite' : 'none' }}>{timeLeft}초</div>
      <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)', marginTop: '10px', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: '2px', width: `${pct}%`, background: color, transition: 'width 1s linear' }} />
      </div>
    </div>
  );
}

function ChatBox({ chatMessages, chatInput, setChatInput, onSend, phase, myRole }) {
  const chatEndRef = useRef(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);
  const canChat = phase === 'day' || phase === 'vote' || myRole === '마피아';
  return (
    <div style={{ background: 'rgba(0,0,0,0.9)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '10px 16px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}>
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>
        {phase === 'night' && myRole === '마피아' ? '🔴 마피아 채팅' : phase === 'night' ? '🌙 채팅 불가' : '💬 전체 채팅'}
      </div>
      <div style={{ height: '120px', overflowY: 'auto', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '8px' }}>
        {chatMessages.map((msg, i) => (
          <div key={i} style={{ marginBottom: '4px', fontSize: '13px' }}>
            <span style={{ color: msg.type === 'system' ? '#f39c12' : msg.type === 'mafia' ? '#e74c3c' : '#888', fontWeight: 700 }}>{msg.emoji} {msg.nickname}</span>
            <span style={{ color: '#ccc' }}>: {msg.message}</span>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      {canChat && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSend()}
            placeholder="메시지 입력..." style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', outline: 'none' }} />
          <button onClick={onSend} style={S.btnSm('linear-gradient(135deg, #667eea, #764ba2)')}>전송</button>
        </div>
      )}
    </div>
  );
}

function PhaseOverlay({ event, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  let icon = '☀️', text = '', sub = '', bg = 'rgba(243,156,18,0.15)';
  if (event?.event === 'nightKill') { icon = '💀'; text = `${event.killedEmoji} ${event.killedNickname} 사망`; sub = '마피아의 소행...'; bg = 'rgba(231,76,60,0.2)'; }
  else if (event?.event === 'healed') { icon = '💊'; text = `${event.healedEmoji} ${event.healedNickname} 생존!`; sub = '의사의 활약!'; bg = 'rgba(46,204,113,0.2)'; }
  else if (event?.event === 'eliminated') { icon = '⚖️'; text = `${event.eliminatedEmoji} ${event.eliminatedNickname} 처형`; sub = '시민들의 결정'; bg = 'rgba(231,76,60,0.2)'; }
  else if (event?.event === 'voteTie') { icon = '⚖️'; text = '투표 동점!'; sub = '아무도 처형되지 않았습니다'; }
  else if (event?.event === 'voteStart') { icon = '🗳️'; text = '투표 시간!'; sub = '마피아를 지목하세요'; bg = 'rgba(231,76,60,0.15)'; }
  else if (event?.phase === 'night') { icon = '🌙'; text = '밤이 왔습니다...'; sub = '마피아가 활동합니다'; bg = 'rgba(52,73,94,0.3)'; }
  else { icon = '☀️'; text = '날이 밝았습니다'; sub = '토론을 시작하세요'; }
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', zIndex: 100, background: `radial-gradient(circle, ${bg} 0%, rgba(0,0,0,0.85) 70%)`, animation: 'fadeIn 0.4s ease', pointerEvents: 'none' }}>
      <div style={{ fontSize: '64px', marginBottom: '12px' }}>{icon}</div>
      <div style={{ fontSize: '22px', fontWeight: 800, color: '#fff' }}>{text}</div>
      <div style={{ fontSize: '14px', color: '#aaa', marginTop: '6px' }}>{sub}</div>
    </div>
  );
}

// 우클릭 메뉴
function ContextMenu({ x, y, player, isHost, onKick, onInfo, onClose }) {
  useEffect(() => { const h = () => onClose(); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, [onClose]);
  return (
    <div style={{ position: 'fixed', top: y, left: x, zIndex: 200, background: 'rgba(30,30,50,0.95)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', padding: '6px', minWidth: '160px', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}
      onClick={(e) => e.stopPropagation()}>
      <div style={{ padding: '8px 14px', color: '#fff', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '4px' }}>
        {player.emoji} {player.nickname}
      </div>
      <div onClick={() => { onInfo(); onClose(); }} style={{ padding: '10px 14px', color: '#ccc', cursor: 'pointer', borderRadius: '8px', fontSize: '14px' }}
        onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={(e) => e.target.style.background = 'transparent'}>
        🔍 정보 보기
      </div>
      {isHost && (
        <div onClick={() => { onKick(); onClose(); }} style={{ padding: '10px 14px', color: '#e74c3c', cursor: 'pointer', borderRadius: '8px', fontSize: '14px' }}
          onMouseEnter={(e) => e.target.style.background = 'rgba(231,76,60,0.15)'} onMouseLeave={(e) => e.target.style.background = 'transparent'}>
          🚫 추방하기
        </div>
      )}
    </div>
  );
}

// 플레이어 정보 모달
function PlayerInfoModal({ info, onClose }) {
  if (!info) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ background: '#1a1a3e', borderRadius: '20px', padding: '28px', maxWidth: '320px', width: '90%', border: '1px solid rgba(255,255,255,0.1)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...S.avatar(info.color || '#667eea', 64), margin: '0 auto 12px', fontSize: '32px' }}>{info.emoji}</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>{info.nickname}</div>
          <div style={{ fontSize: '13px', color: info.isGuest ? '#f39c12' : '#2ecc71', marginTop: '4px' }}>{info.isGuest ? '👤 게스트' : '✅ 로그인 유저'}</div>
        </div>
        {info.stats ? (
          <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#f39c12' }}>{info.stats.score}</div>
              <div style={{ fontSize: '11px', color: '#888' }}>점수</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#2ecc71' }}>{info.stats.wins}승 <span style={{ color: '#e74c3c' }}>{info.stats.losses}패</span></div>
              <div style={{ fontSize: '11px', color: '#888' }}>{info.stats.games}판</div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: '16px', textAlign: 'center', color: '#888', fontSize: '14px' }}>기록 없음</div>
        )}
        <button onClick={onClose} style={{ ...S.btn('linear-gradient(135deg, #667eea, #764ba2)', 'rgba(102,126,234,0.3)'), marginTop: '16px', marginBottom: 0 }}>닫기</button>
      </div>
    </div>
  );
}

function App() {
  // 인증
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // 프로필
  const [nickname, setNickname] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('🎭');
  const [selectedColor, setSelectedColor] = useState('#667eea');

  // 화면
  const [screen, setScreen] = useState('main');
  const [roomCode, setRoomCode] = useState('');

  // 게임
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
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(90);
  const [roomSettings, setRoomSettings] = useState(null);
  const [muted, setMuted] = useState(false);
  const [overlay, setOverlay] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [playerInfo, setPlayerInfo] = useState(null);
  const [quickStatus, setQuickStatus] = useState(null);
  const [settings, setSettings] = useState({ maxPlayers: 10, mafiaCount: 2, policeCount: 1, doctorCount: 1, dayTime: 90, voteTime: 45, nightTime: 45 });

  const hideOverlay = useCallback(() => setOverlay(null), []);

  // 로그인 상태 체크
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        setNickname(u.displayName || '');
        socket.emit('getProfile', { uid: u.uid });
      }
    });
    return () => unsub();
  }, []);

  // 소켓 이벤트
  useEffect(() => {
    socket.on('profileData', (profile) => {
      if (profile) {
        setNickname(profile.nickname || '');
        setSelectedEmoji(profile.emoji || '🎭');
        setSelectedColor(profile.color || '#667eea');
      }
    });
    socket.on('roomUpdate', (room) => {
      setPlayers(room.players); setIsHost(room.host === socket.id); setRoomSettings(room.settings);
      setScreen((prev) => ['main', 'createRoom', 'joinRoom'].includes(prev) ? 'room' : prev);
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
        if (data.event === 'nightKill' || data.event === 'eliminated') playSound('death');
        else if (data.event === 'healed') playSound('heal');
        else if (data.phase === 'night') playSound('night');
        else playSound('day');
      }
    });
    socket.on('policeResult', ({ nickname, emoji, role }) => setPoliceResult(`🔍 ${emoji} ${nickname} → [${role}]`));
    socket.on('chatMessage', ({ nickname, message, type, emoji }) => setChatMessages((prev) => [...prev, { nickname, message, type, emoji }]));
    socket.on('gameOver', ({ winner, players, rankings }) => { setPlayers(players); setGameOver(winner); setRankings(rankings); setScreen('gameover'); if (!muted) playSound(winner === '시민' ? 'win' : 'lose'); });
    socket.on('rankingsList', (list) => setLobbyRankings(list));
    socket.on('playerInfo', (info) => setPlayerInfo(info));
    socket.on('kicked', ({ message }) => { setError(message); setScreen('main'); });
    socket.on('quickMatchFound', ({ roomCode }) => { setRoomCode(roomCode); setQuickStatus(null); });
    socket.on('quickMatchStatus', (status) => setQuickStatus(status));
    socket.on('error', (msg) => setError(msg));
    return () => {
      ['profileData','roomUpdate','gameState','timerUpdate','voteUpdate','phaseChange','policeResult','chatMessage','gameOver','rankingsList','playerInfo','kicked','quickMatchFound','quickMatchStatus','error'].forEach((e) => socket.off(e));
    };
  }, [muted]);

  // 구글 로그인
  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, provider); } catch (e) { setError('로그인 실패: ' + e.message); }
  };

  const handleLogout = async () => { await signOut(auth); setScreen('main'); };

  const handleSaveProfile = () => {
    if (!nickname.trim()) { setError('닉네임을 입력해 주세요!'); return; }
    socket.emit('saveProfile', { uid: user.uid, nickname, emoji: selectedEmoji, color: selectedColor });
    setScreen('main');
  };

  const handleCreateRoom = () => {
    if (!nickname || !roomCode) { setError('닉네임과 방 코드를 입력해 주세요!'); return; }
    setError(''); socket.emit('createRoom', { roomCode, nickname, emoji: selectedEmoji, color: selectedColor, uid: user?.uid, settings });
  };

  const handleJoinRoom = () => {
    if (!nickname || !roomCode) { setError('닉네임과 방 코드를 입력해 주세요!'); return; }
    setError(''); socket.emit('joinRoom', { roomCode, nickname, emoji: selectedEmoji, color: selectedColor, uid: user?.uid });
  };

  const handleQuickMatch = () => {
    if (!nickname.trim()) { setError('먼저 프로필을 설정해 주세요!'); return; }
    socket.emit('quickMatch', { nickname, emoji: selectedEmoji, color: selectedColor, uid: user?.uid });
  };

  const handleCancelQuick = () => { socket.emit('cancelQuickMatch'); setQuickStatus(null); };
  const handleStartGame = () => socket.emit('startGame', { roomCode });
  const handleVote = (id) => { if (myVote) return; setMyVote(id); socket.emit('vote', { roomCode, targetId: id }); if (!muted) playSound('vote'); };
  const handleNightAction = (id) => { if (myVote) return; setMyVote(id); socket.emit('nightAction', { roomCode, targetId: id }); if (!muted) playSound('click'); };
  const handleSendChat = () => { if (!chatInput.trim()) return; socket.emit('chatMessage', { roomCode, message: chatInput }); setChatInput(''); };

  const handleContextMenu = (e, p) => { e.preventDefault(); setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 180), y: Math.min(e.clientY, window.innerHeight - 120), player: p }); };
  const handleKick = (id) => socket.emit('kickPlayer', { roomCode, targetId: id });
  const handleGetInfo = (id) => socket.emit('getPlayerInfo', { roomCode, targetId: id });

  const getRankBadge = (i, total) => { const pct = (i + 1) / total; if (i === 0) return '👑'; if (pct <= 0.1) return '🥇'; if (pct <= 0.3) return '🥈'; if (pct <= 0.5) return '🥉'; return `#${i + 1}`; };
  const getVotersFor = (targetId) => Object.values(voteDetails).filter((v) => v.targetId === targetId);

  // 음소거 버튼
  const MuteBtn = () => <button onClick={() => setMuted(!muted)} style={{ position: 'fixed', top: 12, right: 12, zIndex: 50, width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{muted ? '🔇' : '🔊'}</button>;

  // 로딩
  if (authLoading) {
    return <div style={{ ...S.page, justifyContent: 'center' }}><div style={{ fontSize: '48px', animation: 'pulse 1s infinite' }}>🎭</div></div>;
  }

  // 로그인 안 된 상태 — 메인
  if (!user && screen === 'main') {
    return (
      <div style={{ ...S.page, justifyContent: 'center' }}>
        <div style={S.container}>
          <div style={{ textAlign: 'center', fontSize: '64px', marginBottom: '16px' }}>🎭</div>
          <h1 style={S.title}>마피아 게임</h1>
          <p style={S.subtitle}>Real-time Mafia Game</p>
          <div style={S.card}>
            <button onClick={handleGoogleLogin} style={S.btn('linear-gradient(135deg, #4285f4, #357ae8)', 'rgba(66,133,244,0.3)')}>
              🔑 구글 로그인
            </button>
            <p style={{ textAlign: 'center', color: '#999', fontSize: '13px', marginTop: '4px' }}>로그인하면 방 만들기, 랭킹 저장 가능!</p>
            <div style={{ borderTop: '1px solid #eee', marginTop: '16px', paddingTop: '16px' }}>
              <p style={{ textAlign: 'center', color: '#aaa', fontSize: '13px', marginBottom: '12px' }}>로그인 없이 참가만 하기</p>
              <div style={{ marginBottom: '12px' }}>
                <div style={S.label}>닉네임</div>
                <input style={S.input} placeholder="닉네임 입력" value={nickname} onChange={(e) => setNickname(e.target.value)} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <div style={S.label}>방 코드</div>
                <input style={S.input} placeholder="방 코드 입력" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} />
              </div>
              {error && <div style={{ color: '#e74c3c', fontSize: '14px', textAlign: 'center', marginBottom: '8px' }}>{error}</div>}
              <button onClick={handleJoinRoom} style={S.btn('linear-gradient(135deg, #a8a8a8, #888)', 'rgba(0,0,0,0.1)')}>방 입장 (게스트)</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 프로필 수정
  if (screen === 'profile') {
    return (
      <div style={{ ...S.page, justifyContent: 'center' }}>
        <div style={S.container}>
          <h1 style={S.title}>프로필 설정</h1>
          <div style={S.card}>
            <div style={{ marginBottom: '14px' }}>
              <div style={S.label}>닉네임</div>
              <input style={S.input} placeholder="닉네임 입력" value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <div style={S.label}>프로필 이모지</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {EMOJIS.map((e) => (
                  <div key={e} onClick={() => setSelectedEmoji(e)} style={{ width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', borderRadius: '10px', cursor: 'pointer', border: `2px solid ${selectedEmoji === e ? '#667eea' : '#eee'}`, background: selectedEmoji === e ? 'rgba(102,126,234,0.1)' : '#fafafa' }}>{e}</div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div style={S.label}>프로필 색상</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                {COLORS.map((c) => (
                  <div key={c} onClick={() => setSelectedColor(c)} style={{ width: 32, height: 32, borderRadius: '50%', background: c, cursor: 'pointer', border: `3px solid ${selectedColor === c ? '#333' : 'transparent'}`, boxShadow: selectedColor === c ? `0 0 12px ${c}` : 'none' }} />
                ))}
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '16px', background: '#f8f8f8', borderRadius: '16px', marginBottom: '16px' }}>
              <div style={{ ...S.avatar(selectedColor, 64), margin: '0 auto 8px', fontSize: '32px' }}>{selectedEmoji}</div>
              <div style={{ fontWeight: 700, color: '#333' }}>{nickname || '닉네임'}</div>
            </div>
            {error && <div style={{ color: '#e74c3c', fontSize: '14px', textAlign: 'center', marginBottom: '8px' }}>{error}</div>}
            <button onClick={handleSaveProfile} style={S.btn('linear-gradient(135deg, #667eea, #764ba2)', 'rgba(102,126,234,0.3)')}>✅ 저장</button>
            <button onClick={() => setScreen('main')} style={S.btn('#ddd', 'rgba(0,0,0,0.05)')}>
              <span style={{ color: '#888' }}>← 돌아가기</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 랭킹 보기
  if (screen === 'rankings') {
    return (
      <div style={{ ...S.page, justifyContent: 'flex-start', paddingTop: '20px' }}>
        <div style={S.container}>
          <h1 style={S.title}>🏆 랭킹</h1>
          <p style={S.subtitle}>Mafia Game Rankings</p>
          <div style={S.card}>
            {lobbyRankings.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#999', padding: '30px' }}>아직 기록이 없어요!</div>
            ) : (
              lobbyRankings.slice(0, 30).map((r, i) => (
                <div key={r.nickname || i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '12px', marginBottom: '6px', background: i === 0 ? 'rgba(255,215,0,0.1)' : i < 3 ? 'rgba(102,126,234,0.05)' : 'transparent' }}>
                  <div style={{ fontSize: '18px', width: '32px', textAlign: 'center', fontWeight: 800 }}>{getRankBadge(i, lobbyRankings.length)}</div>
                  <div style={{ ...S.avatar(r.color || '#667eea', 36), fontSize: '18px' }}>{r.emoji || '🎭'}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>{r.nickname}</div>
                    <div style={{ fontSize: '11px', color: '#aaa' }}>{r.wins}승 {r.losses}패 / {r.games}판</div>
                  </div>
                  <div style={{ fontWeight: 900, color: '#f39c12', fontSize: '18px' }}>{r.score}<span style={{ fontSize: '11px', color: '#ccc' }}>점</span></div>
                </div>
              ))
            )}
          </div>
          <button onClick={() => setScreen('main')} style={S.btn('rgba(255,255,255,0.2)', 'rgba(0,0,0,0.1)')}>← 돌아가기</button>
        </div>
      </div>
    );
  }

  // 방 만들기
  if (screen === 'createRoom') {
    return (
      <div style={{ ...S.page, justifyContent: 'flex-start', paddingTop: '20px' }}>
        <div style={S.container}>
          <h1 style={S.title}>방 만들기</h1>
          <div style={S.card}>
            <div style={{ marginBottom: '14px' }}>
              <div style={S.label}>방 코드</div>
              <input style={S.input} placeholder="방 코드 입력 (예: 1234)" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} />
            </div>
            <div style={{ borderTop: '1px solid #eee', paddingTop: '14px' }}>
              <div style={{ ...S.header, color: '#667eea' }}>⚙️ 방 설정</div>
              <SettingRow label="👥 최대 인원" value={settings.maxPlayers} options={[5,6,7,8,9,10,15,20,25,30]} onChange={(v) => setSettings((s) => ({ ...s, maxPlayers: v }))} />
              <SettingRow label="🔪 마피아 수" value={settings.mafiaCount} options={[1,2,3,4,5,6,7,8,9,10]} onChange={(v) => setSettings((s) => ({ ...s, mafiaCount: v }))} />
              <SettingRow label="🔍 경찰 수" value={settings.policeCount} options={[0,1,2,3,4,5]} onChange={(v) => setSettings((s) => ({ ...s, policeCount: v }))} />
              <SettingRow label="💊 의사 수" value={settings.doctorCount} options={[0,1,2,3,4,5]} onChange={(v) => setSettings((s) => ({ ...s, doctorCount: v }))} />
              <SettingRow label="☀️ 낮 토론" value={settings.dayTime} options={[30,60,90,120,180]} onChange={(v) => setSettings((s) => ({ ...s, dayTime: v }))} />
              <SettingRow label="🗳️ 투표" value={settings.voteTime} options={[20,30,45,60,90]} onChange={(v) => setSettings((s) => ({ ...s, voteTime: v }))} />
              <SettingRow label="🌙 밤" value={settings.nightTime} options={[20,30,45,60,90]} onChange={(v) => setSettings((s) => ({ ...s, nightTime: v }))} />
            </div>
            {error && <div style={{ color: '#e74c3c', fontSize: '14px', textAlign: 'center', marginBottom: '8px' }}>{error}</div>}
            <button onClick={handleCreateRoom} style={S.btn('linear-gradient(135deg, #e74c3c, #c0392b)', 'rgba(231,76,60,0.3)')}>🎮 방 만들기</button>
            <button onClick={() => { setScreen('main'); setError(''); }} style={S.btn('#ddd', 'rgba(0,0,0,0.05)')}>
              <span style={{ color: '#888' }}>← 돌아가기</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 방 입장
  if (screen === 'joinRoom') {
    return (
      <div style={{ ...S.page, justifyContent: 'center' }}>
        <div style={S.container}>
          <h1 style={S.title}>방 입장</h1>
          <div style={S.card}>
            <div style={{ marginBottom: '14px' }}>
              <div style={S.label}>방 코드</div>
              <input style={S.input} placeholder="방 코드 입력" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} />
            </div>
            {error && <div style={{ color: '#e74c3c', fontSize: '14px', textAlign: 'center', marginBottom: '8px' }}>{error}</div>}
            <button onClick={handleJoinRoom} style={S.btn('linear-gradient(135deg, #3498db, #2980b9)', 'rgba(52,152,219,0.3)')}>🚪 입장하기</button>
            <button onClick={() => { setScreen('main'); setError(''); }} style={S.btn('#ddd', 'rgba(0,0,0,0.05)')}>
              <span style={{ color: '#888' }}>← 돌아가기</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 메인 화면 (로그인 완료)
  if (screen === 'main' && user) {
    return (
      <div style={{ ...S.page, justifyContent: 'center' }}>
        <div style={S.container}>
          <div style={{ textAlign: 'center', fontSize: '56px', marginBottom: '12px' }}>🎭</div>
          <h1 style={S.title}>마피아 게임</h1>
          <p style={S.subtitle}>Real-time Mafia Game</p>

          {/* 프로필 미리보기 */}
          <div style={{ ...S.card, display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }} onClick={() => setScreen('profile')}>
            <div style={S.avatar(selectedColor, 50)}>{selectedEmoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '16px' }}>{nickname || user.displayName || '프로필 설정 필요'}</div>
              <div style={{ fontSize: '12px', color: '#aaa' }}>✏️ 프로필 수정하려면 탭하세요</div>
            </div>
          </div>

          {error && <div style={{ ...S.card, background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', color: '#e74c3c', textAlign: 'center', fontWeight: 600 }}>{error}</div>}

          <button onClick={() => { setError(''); setScreen('createRoom'); }} style={S.btn('linear-gradient(135deg, #e74c3c, #c0392b)', 'rgba(231,76,60,0.3)')}>🎮 방 만들기</button>
          <button onClick={() => { setError(''); setScreen('joinRoom'); }} style={S.btn('linear-gradient(135deg, #3498db, #2980b9)', 'rgba(52,152,219,0.3)')}>🚪 방 입장</button>

          {/* 퀵매칭 */}
          {quickStatus?.status === 'waiting' ? (
            <div style={{ ...S.card, textAlign: 'center' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px', animation: 'pulse 1s infinite' }}>🔍</div>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>매칭 중... ({quickStatus.position}/{quickStatus.needed}명)</div>
              <div style={{ fontSize: '13px', color: '#999', marginBottom: '12px' }}>다른 플레이어를 기다리는 중</div>
              <button onClick={handleCancelQuick} style={S.btn('#ddd', 'rgba(0,0,0,0.05)')}><span style={{ color: '#888' }}>❌ 매칭 취소</span></button>
            </div>
          ) : (
            <button onClick={handleQuickMatch} style={S.btn('linear-gradient(135deg, #f39c12, #e67e22)', 'rgba(243,156,18,0.3)')}>⚡ 퀵매칭</button>
          )}

          <button onClick={() => { socket.emit('getRankings'); setScreen('rankings'); }} style={S.btn('linear-gradient(135deg, #9b59b6, #8e44ad)', 'rgba(155,89,182,0.3)')}>🏆 랭킹 보기</button>

          <button onClick={handleLogout} style={{ ...S.btn('rgba(255,255,255,0.15)', 'rgba(0,0,0,0.05)'), fontSize: '14px' }}>
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>로그아웃</span>
          </button>
        </div>
      </div>
    );
  }

  // 게임 오버
  if (screen === 'gameover') {
    return (
      <div style={S.pageDark}>
        <MuteBtn />
        <div style={{ ...S.container, flex: 1, overflowY: 'auto' }}>
          <h1 style={{ textAlign: 'center', fontSize: '24px', fontWeight: 900, color: '#fff', marginBottom: '12px' }}>마피아 게임</h1>
          <div style={{ ...S.cardDark, textAlign: 'center', background: gameOver === '시민' ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)', border: `1px solid ${gameOver === '시민' ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)'}` }}>
            <div style={{ fontSize: '48px' }}>{gameOver === '시민' ? '🎉' : '💀'}</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#fff', marginTop: '8px' }}>{gameOver === '시민' ? '시민 팀 승리!' : '마피아 팀 승리!'}</div>
          </div>
          <div style={S.headerDark}>최종 결과</div>
          {players.map((p) => (
            <div key={p.id} style={{ ...S.cardDark, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={S.avatar(p.color || '#667eea', 40)}>{p.emoji || '🎭'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#fff' }}>{p.nickname}</div>
                <div style={{ color: roleColor[p.role], fontSize: '13px' }}>{roleEmoji[p.role]} {p.role}</div>
              </div>
              <span style={{ fontSize: '20px' }}>{p.alive ? '✅' : '💀'}</span>
            </div>
          ))}
          <div style={{ ...S.headerDark, marginTop: '12px' }}>🏆 랭킹</div>
          {rankings.slice(0, 15).map((r, i) => (
            <div key={r.nickname || i} style={{ ...S.cardDark, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '18px', width: '30px', textAlign: 'center', fontWeight: 800 }}>{getRankBadge(i, rankings.length)}</div>
              <div style={S.avatar(r.color || '#667eea', 32)}>{r.emoji || '🎭'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '14px' }}>{r.nickname}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>{r.wins}승 {r.losses}패</div>
              </div>
              <div style={{ fontWeight: 900, color: '#f39c12', fontSize: '16px' }}>{r.score}</div>
            </div>
          ))}
          <button onClick={() => window.location.reload()} style={{ ...S.btn('linear-gradient(135deg, #667eea, #764ba2)', 'rgba(102,126,234,0.3)'), marginTop: '12px' }}>처음으로</button>
        </div>
        <ChatBox chatMessages={chatMessages} chatInput={chatInput} setChatInput={setChatInput} onSend={handleSendChat} phase={phase} myRole={myRole} />
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
      <div style={{ ...S.pageDark, minHeight: '100vh' }}>
        <MuteBtn />
        {overlay && <PhaseOverlay event={overlay} onDone={hideOverlay} />}
        {contextMenu && <ContextMenu {...contextMenu} isHost={isHost} onKick={() => handleKick(contextMenu.player.id)} onInfo={() => handleGetInfo(contextMenu.player.id)} onClose={() => setContextMenu(null)} />}
        {playerInfo && <PlayerInfoModal info={playerInfo} onClose={() => setPlayerInfo(null)} />}

        <div style={{ flex: 1, overflowY: 'auto', maxWidth: '480px', margin: '0 auto', width: '100%', padding: '16px' }}>
          <Timer timeLeft={timeLeft} phase={phase} totalTime={totalTime} />
          <div style={{ ...S.cardDark, textAlign: 'center', borderColor: `${roleColor[myRole]}44`, background: `${roleColor[myRole]}11` }}>
            <div style={{ fontSize: '28px' }}>{roleEmoji[myRole]}</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: roleColor[myRole] }}>내 역할: {myRole}</div>
          </div>
          <div style={{ ...S.cardDark, textAlign: 'center', background: phase === 'day' ? 'rgba(243,156,18,0.1)' : phase === 'vote' ? 'rgba(231,76,60,0.1)' : 'rgba(52,73,94,0.3)', fontWeight: 700, fontSize: '15px', color: '#fff' }}>
            {phase === 'day' ? '☀️ 낮 — 토론하세요!' : phase === 'vote' ? '🗳️ 투표하세요!' : '🌙 밤 — 역할 수행!'}
          </div>
          {policeResult && <div style={{ ...S.cardDark, background: 'rgba(52,152,219,0.15)', border: '1px solid rgba(52,152,219,0.3)', color: '#3498db', fontWeight: 700, textAlign: 'center' }}>{policeResult}</div>}

          <div style={S.headerDark}>생존자 ({alivePlayers.length})</div>
          {alivePlayers.map((p) => {
            const votersForThis = getVotersFor(p.id);
            return (
              <div key={p.id} onContextMenu={(e) => handleContextMenu(e, p)}
                style={{ ...S.cardDark, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderColor: votes[socket.id] === p.id ? '#f39c12' : 'rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <div style={S.avatar(p.color || '#667eea', 40)}>{p.emoji || '🎭'}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: '14px' }}>{p.nickname} {p.id === socket.id && <span style={{ color: '#666', fontSize: '11px' }}>(나)</span>}</div>
                    {votersForThis.length > 0 && (
                      <div style={{ display: 'flex', gap: '2px', marginTop: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {votersForThis.map((v) => (
                          <span key={v.voterId} title={v.voterNickname} style={{ width: 20, height: 20, borderRadius: '50%', background: v.voterColor || '#333', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', border: '1px solid rgba(255,255,255,0.2)' }}>{v.voterEmoji}</span>
                        ))}
                        <span style={{ color: '#f39c12', fontSize: '12px', fontWeight: 700, marginLeft: '4px' }}>{votersForThis.length}표</span>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {phase === 'vote' && amAlive && p.id !== socket.id && !myVote && <button onClick={() => handleVote(p.id)} style={S.btnSm('#e74c3c')}>투표</button>}
                  {phase === 'night' && amAlive && p.id !== socket.id && !myVote && (
                    <>
                      {myRole === '마피아' && <button onClick={() => handleNightAction(p.id)} style={S.btnSm('#e74c3c')}>🔪</button>}
                      {myRole === '의사' && <button onClick={() => handleNightAction(p.id)} style={S.btnSm('#2ecc71')}>💊</button>}
                      {myRole === '경찰' && <button onClick={() => handleNightAction(p.id)} style={S.btnSm('#3498db')}>🔍</button>}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {myVote && <div style={{ ...S.cardDark, textAlign: 'center', color: '#2ecc71', fontWeight: 700 }}>✅ 대기 중...</div>}
          {!amAlive && <div style={{ ...S.cardDark, textAlign: 'center', color: '#666' }}>💀 사망했습니다</div>}

          {deadPlayers.length > 0 && (
            <>
              <div style={S.headerDark}>사망자 ({deadPlayers.length})</div>
              {deadPlayers.map((p) => (
                <div key={p.id} style={{ ...S.cardDark, display: 'flex', alignItems: 'center', gap: '10px', opacity: 0.4 }}>
                  <div style={{ ...S.avatar(p.color || '#333', 36), filter: 'grayscale(1)' }}>{p.emoji}</div>
                  <div style={{ color: '#555', fontWeight: 700 }}>{p.nickname}</div>
                  <span style={{ marginLeft: 'auto' }}>💀</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div style={{ maxWidth: '480px', margin: '0 auto', width: '100%' }}>
          <ChatBox chatMessages={chatMessages} chatInput={chatInput} setChatInput={setChatInput} onSend={handleSendChat} phase={phase} myRole={myRole} />
        </div>
      </div>
    );
  }

  // 대기실
  if (screen === 'room') {
    return (
      <div style={S.pageDark}>
        <MuteBtn />
        {contextMenu && <ContextMenu {...contextMenu} isHost={isHost} onKick={() => handleKick(contextMenu.player.id)} onInfo={() => handleGetInfo(contextMenu.player.id)} onClose={() => setContextMenu(null)} />}
        {playerInfo && <PlayerInfoModal info={playerInfo} onClose={() => setPlayerInfo(null)} />}

        <div style={S.container}>
          <h1 style={{ textAlign: 'center', fontSize: '28px', fontWeight: 900, color: '#fff', marginBottom: '12px' }}>마피아 게임</h1>
          <div style={{ ...S.cardDark, textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#888', letterSpacing: '1px', marginBottom: '6px' }}>방 코드</div>
            <div style={{ fontSize: '32px', fontWeight: 900, color: '#667eea', letterSpacing: '6px' }}>{roomCode}</div>
          </div>

          {roomSettings && (
            <div style={{ ...S.cardDark, display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '13px', color: '#888' }}>
              <span>👥 {roomSettings.maxPlayers}</span><span>🔪 {roomSettings.mafiaCount}</span>
              <span>🔍 {roomSettings.policeCount}</span><span>💊 {roomSettings.doctorCount}</span>
              <span>☀️ {roomSettings.dayTime}초</span><span>🗳️ {roomSettings.voteTime}초</span><span>🌙 {roomSettings.nightTime}초</span>
            </div>
          )}

          {error && <div style={{ ...S.cardDark, background: 'rgba(231,76,60,0.1)', color: '#e74c3c', textAlign: 'center', fontWeight: 600 }}>{error}</div>}

          <div style={S.headerDark}>참가자 ({players.length}/{roomSettings?.maxPlayers || 10})</div>
          <div style={{ fontSize: '11px', color: '#555', marginBottom: '8px' }}>💡 우클릭으로 정보 보기{isHost ? ' / 추방' : ''}</div>

          {players.map((p) => (
            <div key={p.id} onContextMenu={(e) => handleContextMenu(e, p)}
              style={{ ...S.cardDark, display: 'flex', alignItems: 'center', gap: '12px', cursor: 'context-menu' }}>
              <div style={S.avatar(p.color || '#667eea', 40)}>{p.emoji || '🎭'}</div>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, color: '#fff' }}>{p.nickname}</span>
                {p.id === socket.id && <span style={{ color: '#666', fontSize: '11px', marginLeft: '6px' }}>(나)</span>}
                {rooms && p.id === players[0]?.id && <span style={{ color: '#f39c12', fontSize: '11px', marginLeft: '6px' }}>👑 방장</span>}
              </div>
              {!p.uid && <span style={{ fontSize: '11px', color: '#f39c12', background: 'rgba(243,156,18,0.1)', padding: '2px 8px', borderRadius: '6px' }}>게스트</span>}
            </div>
          ))}

          {isHost ? (
            <button onClick={handleStartGame} style={{ ...S.btn('linear-gradient(135deg, #e74c3c, #c0392b)', 'rgba(231,76,60,0.3)'), marginTop: '12px' }}>🎮 게임 시작 (최소 5명)</button>
          ) : (
            <div style={{ textAlign: 'center', color: '#666', marginTop: '16px', fontSize: '14px' }}>⏳ 방장이 게임을 시작하길 기다리는 중...</div>
          )}
        </div>
      </div>
    );
  }

  // 기본 (로그인 안 됨 + 다른 화면)
  return (
    <div style={{ ...S.page, justifyContent: 'center' }}>
      <div style={S.container}>
        <div style={S.card}>
          <p style={{ textAlign: 'center', color: '#888' }}>로딩 중...</p>
        </div>
      </div>
    </div>
  );
}

export default App;