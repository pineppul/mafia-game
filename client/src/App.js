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

const fApp = initializeApp(firebaseConfig);
const auth = getAuth(fApp);
const gProvider = new GoogleAuthProvider();
const socket = io('https://mafia-game-ttb9.onrender.com');

const EMOJIS = ['🐱','🐶','🦊','🐻','🐼','🐨','🦁','🐯','🐸','🐙','🦄','🐺','🎭','👻','🧛','🕵️','🤠','🥷','🐧','🦋','🐳','🎃','🤖','👾'];
const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63','#00bcd4','#8bc34a','#ff6b6b','#ffd93d'];
const RC = { '마피아': '#e74c3c', '경찰': '#3498db', '의사': '#2ecc71', '시민': '#95a5a6' };
const SKINS = [
  { id: 'common_1', name: '기본 링', rarity: 'common', border: '#ccc', glow: 'none' },
  { id: 'common_2', name: '실버 링', rarity: 'common', border: '#b0b0b0', glow: 'none' },
  { id: 'common_3', name: '브론즈 링', rarity: 'common', border: '#cd7f32', glow: 'none' },
  { id: 'uncommon_1', name: '에메랄드 링', rarity: 'uncommon', border: '#2ecc71', glow: '0 0 8px #2ecc71' },
  { id: 'uncommon_2', name: '민트 링', rarity: 'uncommon', border: '#1abc9c', glow: '0 0 8px #1abc9c' },
  { id: 'rare_1', name: '사파이어 링', rarity: 'rare', border: '#3498db', glow: '0 0 12px #3498db' },
  { id: 'rare_2', name: '아이스 링', rarity: 'rare', border: '#00d4ff', glow: '0 0 12px #00d4ff' },
  { id: 'epic_1', name: '아메시스트 링', rarity: 'epic', border: '#9b59b6', glow: '0 0 18px #9b59b6, 0 0 30px #9b59b6' },
  { id: 'epic_2', name: '네온 링', rarity: 'epic', border: '#e91e63', glow: '0 0 18px #e91e63, 0 0 30px #e91e63' },
  { id: 'legendary_1', name: '드래곤 골드', rarity: 'legendary', border: '#ffd700', glow: '0 0 25px #ffd700, 0 0 50px #ffd700, 0 0 70px #ff9500' },
  { id: 'legendary_2', name: '레인보우 오라', rarity: 'legendary', border: 'linear-gradient(45deg,#ff0000,#ff9900,#33cc33,#3399ff,#9933ff)', glow: '0 0 25px #fff, 0 0 50px #ff00ff' }
];
const RARITY_COLOR = { common: '#aaa', uncommon: '#2ecc71', rare: '#3498db', epic: '#9b59b6', legendary: '#ffd700' };
const RARITY_LABEL = { common: 'COMMON', uncommon: 'UNCOMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' };
function getSkin(id) { return SKINS.find(s => s.id === id); }
const RE = { '마피아': '🔪', '경찰': '🔍', '의사': '💊', '시민': '👤' };

/* ── 효과음 ── */
const AC = window.AudioContext || window.webkitAudioContext;
let ac = null;
function snd(t) {
  try {
    if (!ac) ac = new AC();
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination); g.gain.value = 0.1;
    const m = { vote:[600,'sine'], death:[200,'sawtooth'], heal:[800,'sine'], day:[523,'triangle'], night:[330,'sine'], click:[500,'sine'], win:[700,'triangle'], lose:[180,'sawtooth'] };
    if (m[t]) { o.frequency.value = m[t][0]; o.type = m[t][1]; }
    o.start(); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4); o.stop(ac.currentTime + 0.5);
  } catch (e) {}
}

/* ── 공통 스타일 ── */
const bg1 = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
const bg2 = 'linear-gradient(135deg, #0c0c1d 0%, #1a1a3e 50%, #0c0c1d 100%)';

function Page({ children, light = true, center = true }) {
  return (
    <div style={{ minHeight: '100vh', background: light ? bg1 : bg2, fontFamily: "'Segoe UI',sans-serif", color: light ? '#333' : '#fff', display: 'flex', flexDirection: 'column', alignItems: center ? 'center' : 'stretch', justifyContent: center ? 'center' : 'flex-start', padding: '20px 0' }}>
      <div style={{ maxWidth: 460, width: '100%', padding: '0 20px' }}>{children}</div>
    </div>
  );
}

function Card({ children, style, onClick }) {
  return <div onClick={onClick} style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 20, padding: 24, marginBottom: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', ...style }}>{children}</div>;
}

function DCard({ children, style, onContextMenu }) {
  return <div onContextMenu={onContextMenu} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 16, marginBottom: 12, border: '1px solid rgba(255,255,255,0.08)', ...style }}>{children}</div>;
}

function Btn({ children, bg, shadow = 'rgba(0,0,0,0.1)', onClick, style }) {
  return <button onClick={onClick} style={{ width: '100%', padding: 16, border: 'none', borderRadius: 16, fontSize: 17, fontWeight: 800, color: '#fff', cursor: 'pointer', background: bg, boxShadow: `0 6px 20px ${shadow}`, marginBottom: 12, transition: 'transform 0.15s', ...style }} onMouseDown={e => e.target.style.transform = 'scale(0.97)'} onMouseUp={e => e.target.style.transform = 'scale(1)'}>{children}</button>;
}

function BtnSm({ children, bg, onClick }) {
  return <button onClick={onClick} style={{ padding: '8px 16px', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', background: bg }}>{children}</button>;
}

function Avatar({ emoji, color, size = 48, skinId }) {
  const skin = skinId ? getSkin(skinId) : null;
  const borderStyle = skin ? (skin.border.includes('gradient') ? skin.border : skin.border) : 'rgba(255,255,255,0.4)';
  const isGradient = skin && skin.border.includes('gradient');
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {isGradient && <div style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: skin.border, boxShadow: skin.glow !== 'none' ? skin.glow : 'none' }} />}
      <div style={{ position: 'absolute', inset: isGradient ? 3 : 0, width: isGradient ? size - 6 : size, height: isGradient ? size - 6 : size, borderRadius: '50%', background: color || '#667eea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5, border: isGradient ? 'none' : `3px solid ${borderStyle}`, boxShadow: !isGradient && skin && skin.glow !== 'none' ? skin.glow : 'none' }}>
        {emoji || '🎭'}
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: '#999', marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>{children}</div>;
}

function Input({ value, onChange, placeholder }) {
  return <input value={value} onChange={onChange} placeholder={placeholder} style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: '2px solid #e8e8e8', fontSize: 15, outline: 'none', boxSizing: 'border-box', background: '#fafafa' }} />;
}

function Header({ children, dark }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: dark ? '#555' : '#aaa', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>{children}</div>;
}

function SettingRow({ label, value, options, onChange }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Label>{label}</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)} style={{ padding: '7px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: `2px solid ${value === o ? '#667eea' : '#e8e8e8'}`, background: value === o ? 'rgba(102,126,234,0.1)' : '#f8f8f8', color: value === o ? '#667eea' : '#999' }}>{o}</button>
        ))}
      </div>
    </div>
  );
}

/* ── 채팅 ── */
function ChatBox({ msgs, input, setInput, onSend, phase, role }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);
  const can = phase === 'day' || phase === 'vote' || role === '마피아';
  return (
    <div style={{ background: 'rgba(0,0,0,0.9)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '10px 16px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>
        {phase === 'night' && role === '마피아' ? '🔴 마피아 채팅' : phase === 'night' ? '🌙 채팅 불가' : '💬 채팅'}
      </div>
      <div style={{ height: 120, overflowY: 'auto', padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 8 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ marginBottom: 4, fontSize: 13 }}>
            <span style={{ color: m.type === 'system' ? '#f39c12' : m.type === 'mafia' ? '#e74c3c' : '#777', fontWeight: 700 }}>{m.emoji} {m.nickname}</span>
            <span style={{ color: '#ccc' }}>: {m.message}</span>
          </div>
        ))}
        <div ref={ref} />
      </div>
      {can && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSend()} placeholder="메시지..." style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14, outline: 'none' }} />
          <BtnSm bg="linear-gradient(135deg,#667eea,#764ba2)" onClick={onSend}>전송</BtnSm>
        </div>
      )}
    </div>
  );
}

/* ── 오버레이 ── */
function Overlay({ event, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  let icon = '☀️', text = '', sub = '';
  if (event?.event === 'nightKill') { icon = '💀'; text = `${event.killedEmoji} ${event.killedNickname} 사망`; sub = '마피아의 소행...'; }
  else if (event?.event === 'healed') { icon = '💊'; text = `${event.healedEmoji} ${event.healedNickname} 생존!`; sub = '의사의 활약!'; }
  else if (event?.event === 'eliminated') { icon = '⚖️'; text = `${event.eliminatedEmoji} ${event.eliminatedNickname} 처형`; sub = '시민들의 결정'; }
  else if (event?.event === 'voteTie') { icon = '⚖️'; text = '동점!'; sub = '아무도 처형 안 됨'; }
  else if (event?.event === 'voteStart') { icon = '🗳️'; text = '투표!'; sub = '마피아를 지목하세요'; }
  else if (event?.phase === 'night') { icon = '🌙'; text = '밤이 왔습니다'; sub = '마피아 활동 중...'; }
  else { icon = '☀️'; text = '날이 밝았습니다'; sub = '토론 시작!'; }
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', zIndex: 100, background: 'radial-gradient(circle, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.85) 70%)', pointerEvents: 'none' }}>
      <div style={{ fontSize: 64, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{text}</div>
      <div style={{ fontSize: 14, color: '#aaa', marginTop: 6 }}>{sub}</div>
    </div>
  );
}

/* ── 우클릭 메뉴 ── */
function CtxMenu({ x, y, player, isHost, onKick, onInfo, onClose }) {
  useEffect(() => { const h = () => onClose(); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, [onClose]);
  return (
    <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: y, left: x, zIndex: 200, background: 'rgba(20,20,40,0.97)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.15)', padding: 6, minWidth: 170, boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
      <div style={{ padding: '10px 14px', color: '#fff', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 4 }}>{player.emoji} {player.nickname}</div>
      <div onClick={() => { onInfo(); onClose(); }} style={{ padding: '10px 14px', color: '#ccc', cursor: 'pointer', borderRadius: 8, fontSize: 14 }}>🔍 정보 보기</div>
      {isHost && <div onClick={() => { onKick(); onClose(); }} style={{ padding: '10px 14px', color: '#e74c3c', cursor: 'pointer', borderRadius: 8, fontSize: 14 }}>🚫 추방</div>}
    </div>
  );
}

/* ── 상자 뽑기 애니메이션 ── */
function BoxOpenAnim({ result, onClose }) {
  const [stage, setStage] = useState(0); // 0: 흔들림, 1: 폭발, 2: 결과 표시

  useEffect(() => {
    if (!result) return;
    const t1 = setTimeout(() => setStage(1), 1800);
    const t2 = setTimeout(() => setStage(2), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [result]);

  const rarity = result?.rarity || 'common';
  const rColor = RARITY_COLOR[rarity];
  const isHighRarity = rarity === 'epic' || rarity === 'legendary';
  const isLegendary = rarity === 'legendary';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 배경 파티클 (고등급일수록 화려하게) */}
      {stage >= 1 && isHighRarity && Array.from({ length: isLegendary ? 40 : 20 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute', left: '50%', top: '50%', width: 4, height: 4, borderRadius: '50%',
          background: rColor, boxShadow: `0 0 8px ${rColor}`,
          animation: `boxParticle${i % 4} ${0.8 + Math.random() * 0.6}s ease-out forwards`,
          animationDelay: `${Math.random() * 0.2}s`
        }} />
      ))}

      <style>{`
        @keyframes boxShake { 0%,100% { transform: translateX(0) rotate(0deg); } 10% { transform: translateX(-8px) rotate(-3deg); } 20% { transform: translateX(8px) rotate(3deg); } 30% { transform: translateX(-8px) rotate(-3deg); } 40% { transform: translateX(8px) rotate(3deg); } 50% { transform: translateX(-6px) rotate(-2deg); } 60% { transform: translateX(6px) rotate(2deg); } 70% { transform: translateX(-4px) rotate(-1deg); } 80% { transform: translateX(4px) rotate(1deg); } 90% { transform: translateX(-2px); } }
        @keyframes boxPulse { 0%,100% { box-shadow: 0 0 20px rgba(255,255,255,0.3); } 50% { box-shadow: 0 0 50px rgba(255,255,255,0.6); } }
        @keyframes boxExplode { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(3); opacity: 0; } }
        @keyframes resultPop { 0% { transform: scale(0) rotate(-180deg); opacity: 0; } 60% { transform: scale(1.2) rotate(10deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        @keyframes ringGlow { 0%,100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.15); } }
        @keyframes rarityBeam { 0% { opacity: 0; transform: scaleY(0); } 30% { opacity: 1; transform: scaleY(1); } 100% { opacity: 0; transform: scaleY(1); } }
        @keyframes boxParticle0 { to { transform: translate(-150px,-150px) scale(0); opacity: 0; } }
        @keyframes boxParticle1 { to { transform: translate(150px,-150px) scale(0); opacity: 0; } }
        @keyframes boxParticle2 { to { transform: translate(-150px,150px) scale(0); opacity: 0; } }
        @keyframes boxParticle3 { to { transform: translate(150px,150px) scale(0); opacity: 0; } }
      `}</style>

      {stage < 2 && (
        <div style={{ position: 'relative' }}>
          {stage === 1 && isHighRarity && (
            <div style={{ position: 'absolute', inset: -60, borderRadius: '50%', background: `radial-gradient(circle, ${rColor}88 0%, transparent 70%)`, animation: 'boxExplode 0.7s ease-out forwards' }} />
          )}
          <div style={{
            fontSize: 100, animation: stage === 0 ? 'boxShake 0.4s infinite, boxPulse 1s infinite' : 'boxExplode 0.5s ease-out forwards',
            filter: `drop-shadow(0 0 20px ${rColor})`
          }}>📦</div>
        </div>
      )}

      {stage === 2 && result && (
        <div style={{ textAlign: 'center', animation: 'resultPop 0.6s cubic-bezier(0.34,1.56,0.64,1)' }}>
          {isHighRarity && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: 4, height: 300, background: `linear-gradient(180deg, transparent, ${rColor}, transparent)`, transform: 'translate(-50%,-50%)', animation: 'rarityBeam 1.5s ease-in-out infinite' }} />
          )}
          <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto 20px' }}>
            <div style={{ position: 'absolute', inset: -20, borderRadius: '50%', border: `3px solid ${rColor}`, animation: 'ringGlow 1.5s ease-in-out infinite' }} />
            <div style={{ width: 140, height: 140, borderRadius: '50%', background: rColor.includes('gradient') ? rColor : `radial-gradient(circle, ${rColor}44, transparent)`, border: `4px solid ${rColor}`, boxShadow: `0 0 40px ${rColor}, 0 0 80px ${rColor}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60 }}>
              🎭
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 3, color: rColor, marginBottom: 6, textShadow: `0 0 10px ${rColor}` }}>{RARITY_LABEL[rarity]}</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', marginBottom: 24 }}>{result.name}</div>
          <Btn bg={`linear-gradient(135deg, ${rColor}, ${rColor}cc)`} shadow={`${rColor}66`} onClick={onClose} style={{ width: 200 }}>확인</Btn>
        </div>
      )}
    </div>
  );
}

/* ── 정보 모달 ── */
function InfoModal({ info, onClose }) {
  if (!info) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#1a1a3e', borderRadius: 20, padding: 28, maxWidth: 320, width: '90%', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ textAlign: 'center' }}>
          <Avatar emoji={info.emoji} color={info.color} size={64} />
          <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginTop: 12 }}>{info.nickname}</div>
          <div style={{ fontSize: 13, color: info.isGuest ? '#f39c12' : '#2ecc71', marginTop: 4 }}>{info.isGuest ? '👤 게스트' : '✅ 회원'}</div>
        </div>
        {info.stats && (
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#f39c12' }}>{info.stats.score}</div>
              <div style={{ fontSize: 11, color: '#888' }}>점수</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}><span style={{ color: '#2ecc71' }}>{info.stats.wins}승</span> <span style={{ color: '#e74c3c' }}>{info.stats.losses}패</span></div>
              <div style={{ fontSize: 11, color: '#888' }}>{info.stats.games}판</div>
            </div>
          </div>
        )}
        <Btn bg="linear-gradient(135deg,#667eea,#764ba2)" shadow="rgba(102,126,234,0.3)" onClick={onClose} style={{ marginTop: 16, marginBottom: 0 }}>닫기</Btn>
      </div>
    </div>
  );
}

/* ══════════════════ APP ══════════════════ */
function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState('main');
  const [nick, setNick] = useState('');
  const [coins, setCoins] = useState(0);
  const [inventory, setInventory] = useState([]);
  const [equipped, setEquipped] = useState(null);
  const [boxOpening, setBoxOpening] = useState(false);
  const [boxResult, setBoxResult] = useState(null);
  const [, setRevealStage] = useState(0);
  const [emoji, setEmoji] = useState('🎭');
  const [color, setColor] = useState('#667eea');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [myRole, setMyRole] = useState('');
  const [phase, setPhase] = useState('day');
  const [votes, setVotes] = useState({});
  const [voteD, setVoteD] = useState({});
  const [myVote, setMyVote] = useState('');
  const [police, setPolice] = useState('');
  const [over, setOver] = useState(null);
  const [ranks, setRanks] = useState([]);
  const [lRanks, setLRanks] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [chatIn, setChatIn] = useState('');
  const [tLeft, setTLeft] = useState(0);
  const [tTotal, setTTotal] = useState(90);
  const [rSet, setRSet] = useState(null);
  const [mute, setMute] = useState(false);
  const [olay, setOlay] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [pInfo, setPInfo] = useState(null);
  const [qStat, setQStat] = useState(null);
  const [sets, setSets] = useState({ maxPlayers: 10, mafiaCount: 2, policeCount: 1, doctorCount: 1, dayTime: 90, voteTime: 45, nightTime: 45 });

  const hideOlay = useCallback(() => setOlay(null), []);

  useEffect(() => { const u = onAuthStateChanged(auth, u => { setUser(u); setLoading(false); if (u) { setNick(u.displayName || ''); socket.emit('getProfile', { uid: u.uid }); socket.emit('getCoins', { uid: u.uid }); socket.emit('getInventory', { uid: u.uid }); } }); return () => u(); }, []);
  
  useEffect(() => {
    socket.on('profileData', p => { if (p) { setNick(p.nickname || ''); setEmoji(p.emoji || '🎭'); setColor(p.color || '#667eea'); } });
    socket.on('coinsData', c => setCoins(c));
    socket.on('inventoryData', d => { setInventory(d.inventory); setEquipped(d.equipped); });
    socket.on('boxResult', d => { 
      setCoins(d.newCoins); 
      setBoxResult(d.skin);
      setInventory(prev => [...prev, d.skin.id]);
      setBoxOpening(true);
    });
    socket.on('equipped', d => setEquipped(d.skinId));
    socket.on('roomUpdate', r => { setPlayers(r.players); setIsHost(r.host === socket.id); setRSet(r.settings); setScreen(s => ['main','createRoom','joinRoom','quickWait'].includes(s) ? 'room' : s); });
    socket.on('gameState', d => { setPhase(d.phase); setPlayers(d.players); setMyRole(d.myRole); setMyVote(''); setScreen('game'); if (d.settings) setTTotal(d.phase === 'day' ? d.settings.dayTime : d.phase === 'vote' ? d.settings.voteTime : d.settings.nightTime); });
    socket.on('timerUpdate', d => { setTLeft(d.timeLeft); setPhase(d.phase); });
    socket.on('voteUpdate', d => { setVotes(d.votes); if (d.voteDetails) setVoteD(d.voteDetails); });
    socket.on('phaseChange', d => { setPhase(d.phase); setMyVote(''); setVotes({}); setVoteD({}); setPolice(''); setOlay(d); if (!mute) { if (d.event === 'nightKill' || d.event === 'eliminated') snd('death'); else if (d.event === 'healed') snd('heal'); else if (d.phase === 'night') snd('night'); else snd('day'); } });
    socket.on('policeResult', d => setPolice(`🔍 ${d.emoji} ${d.nickname} → [${d.role}]`));
    socket.on('chatMessage', d => setMsgs(p => [...p, d]));
    socket.on('gameOver', d => { setPlayers(d.players); setOver(d.winner); setRanks(d.rankings); setScreen('gameover'); if (!mute) snd(d.winner === '시민' ? 'win' : 'lose'); });
    socket.on('rankingsList', l => setLRanks(l));
    socket.on('playerInfo', i => setPInfo(i));
    socket.on('kicked', () => { setErr('추방되었습니다'); setScreen('main'); });
    socket.on('roomClosed', d => { setErr(d.message); setScreen('main'); });
    socket.on('quickMatchFound', d => { setCode(d.roomCode); setQStat(null); });
    socket.on('quickMatchStatus', s => { setQStat(s); if (s.status === 'waiting') setScreen('quickWait'); });
    socket.on('error', m => setErr(m));
    return () => { ['profileData','roomUpdate','gameState','timerUpdate','voteUpdate','phaseChange','policeResult','chatMessage','gameOver','rankingsList','playerInfo','kicked','quickMatchFound','quickMatchStatus','error'].forEach(e => socket.off(e)); };
  }, [mute]);

  const login = async () => { try { await signInWithPopup(auth, gProvider); } catch (e) { setErr('로그인 실패: ' + e.message); } };
  const logout = async () => { await signOut(auth); setScreen('main'); };
  const openBox = () => {
  if (coins < 200) { setErr('코인이 부족합니다! (200 필요)'); return; }
  setBoxOpening(true);
  setRevealStage(0);
  setBoxResult(null);
  socket.emit('openBox', { uid: user.uid });
};

const equipSkin = (skinId) => {
  socket.emit('equipSkin', { uid: user.uid, skinId });
};
  const saveProf = () => { if (!nick.trim()) { setErr('닉네임 입력!'); return; } socket.emit('saveProfile', { uid: user.uid, nickname: nick, emoji, color }); setScreen('main'); setErr(''); };
  const createRoom = () => { if (!nick || !code) { setErr('닉네임과 방 코드 입력!'); return; } setErr(''); socket.emit('createRoom', { roomCode: code, nickname: nick, emoji, color, uid: user?.uid, settings: sets }); };
  const joinRoom = () => { if (!nick || !code) { setErr('닉네임과 방 코드 입력!'); return; } setErr(''); socket.emit('joinRoom', { roomCode: code, nickname: nick, emoji, color, uid: user?.uid }); };
  const quickMatch = () => { if (!nick.trim()) { setErr('프로필 설정 필요!'); return; } socket.emit('quickMatch', { nickname: nick, emoji, color, uid: user?.uid }); };
  const cancelQ = () => { socket.emit('cancelQuickMatch'); setQStat(null); setScreen('main'); };
  const startGame = () => socket.emit('startGame', { roomCode: code });
  const vote = id => { if (myVote) return; setMyVote(id); socket.emit('vote', { roomCode: code, targetId: id }); if (!mute) snd('vote'); };
  const nightAct = id => { if (myVote) return; setMyVote(id); socket.emit('nightAction', { roomCode: code, targetId: id }); if (!mute) snd('click'); };
  const sendChat = () => { if (!chatIn.trim()) return; socket.emit('chatMessage', { roomCode: code, message: chatIn }); setChatIn(''); };
  const kick = id => socket.emit('kickPlayer', { roomCode: code, targetId: id });
  const getInfo = id => socket.emit('getPlayerInfo', { roomCode: code, targetId: id });
  const ctxMenu = (e, p) => { e.preventDefault(); setCtx({ x: Math.min(e.clientX, window.innerWidth - 180), y: Math.min(e.clientY, window.innerHeight - 120), player: p }); };

  const badge = (i, t) => { const p = (i + 1) / t; if (i === 0) return '👑'; if (p <= 0.1) return '🥇'; if (p <= 0.3) return '🥈'; if (p <= 0.5) return '🥉'; return `#${i + 1}`; };
  const votersFor = tid => Object.values(voteD).filter(v => v.targetId === tid);

  const MuteB = () => <button onClick={() => setMute(!mute)} style={{ position: 'fixed', top: 12, right: 12, zIndex: 50, width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{mute ? '🔇' : '🔊'}</button>;

  if (loading) return <Page><div style={{ textAlign: 'center', fontSize: 56 }}>🎭</div></Page>;

  /* ═══ 로그인 화면 ═══ */
  if (!user && screen === 'main') {
    return (
      <Page>
        <div style={{ textAlign: 'center', fontSize: 72, marginBottom: 16 }}>🎭</div>
        <h1 style={{ textAlign: 'center', fontSize: 36, fontWeight: 900, color: '#fff', textShadow: '0 4px 20px rgba(0,0,0,0.3)', marginBottom: 4 }}>마피아 게임</h1>
        <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 28 }}>Real-time Mafia Game</p>
        <Card>
          <Btn bg="linear-gradient(135deg,#4285f4,#357ae8)" shadow="rgba(66,133,244,0.3)" onClick={login}>🔑 구글로 로그인</Btn>
          <p style={{ textAlign: 'center', color: '#bbb', fontSize: 13 }}>로그인하면 방 만들기 · 랭킹 · 퀵매칭 가능!</p>
          <div style={{ borderTop: '1px solid #eee', margin: '20px 0', paddingTop: 20 }}>
            <p style={{ textAlign: 'center', color: '#aaa', fontSize: 13, marginBottom: 14 }}>게스트로 방 입장만 하기</p>
            <div style={{ marginBottom: 10 }}><Label>닉네임</Label><Input value={nick} onChange={e => setNick(e.target.value)} placeholder="닉네임" /></div>
            <div style={{ marginBottom: 14 }}><Label>방 코드</Label><Input value={code} onChange={e => setCode(e.target.value)} placeholder="방 코드" /></div>
            {err && <p style={{ color: '#e74c3c', textAlign: 'center', fontSize: 14, marginBottom: 8 }}>{err}</p>}
            <Btn bg="linear-gradient(135deg,#aaa,#888)" shadow="rgba(0,0,0,0.08)" onClick={joinRoom}>🚪 게스트 입장</Btn>
          </div>
        </Card>
      </Page>
    );
  }

  /* ═══ 메인 (로그인 완료) ═══ */
  if (screen === 'main' && user) {
    return (
      <Page>
        <div style={{ textAlign: 'center', fontSize: 56, marginBottom: 12 }}>🎭</div>
        <h1 style={{ textAlign: 'center', fontSize: 32, fontWeight: 900, color: '#fff', textShadow: '0 4px 20px rgba(0,0,0,0.3)', marginBottom: 4 }}>마피아 게임</h1>
        <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>Real-time Mafia Game</p>

<Card style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }} onClick={() => setScreen('profile')}>
          <Avatar emoji={emoji} color={color} size={52} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{nick || '프로필 설정 필요'}</div>
            <div style={{ fontSize: 12, color: '#aaa' }}>✏️ 탭하여 수정</div>
          </div>
          <div style={{ fontSize: 20, color: '#ccc' }}>›</div>
        </Card>

        <Card style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', background: 'linear-gradient(135deg, #fff9e6, #fff3cd)' }}>
          <span style={{ fontSize: 28 }}>🪙</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 20, color: '#d4a017' }}>{coins.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: '#999' }}>MF코인</div>
          </div>
        </Card>

        {err && <Card style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)' }}><p style={{ color: '#e74c3c', textAlign: 'center', fontWeight: 600, margin: 0 }}>{err}</p></Card>}

        <Btn bg="linear-gradient(135deg,#e74c3c,#c0392b)" shadow="rgba(231,76,60,0.3)" onClick={() => { setErr(''); setScreen('createRoom'); }}>🎮 방 만들기</Btn>
        <Btn bg="linear-gradient(135deg,#3498db,#2980b9)" shadow="rgba(52,152,219,0.3)" onClick={() => { setErr(''); setScreen('joinRoom'); }}>🚪 방 입장</Btn>
        <Btn bg="linear-gradient(135deg,#f39c12,#e67e22)" shadow="rgba(243,156,18,0.3)" onClick={quickMatch}>⚡ 퀵매칭</Btn>
        <Btn bg="linear-gradient(135deg,#9b59b6,#8e44ad)" shadow="rgba(155,89,182,0.3)" onClick={() => { socket.emit('getRankings'); setScreen('rankings'); }}>🏆 랭킹</Btn>
        <Btn bg="linear-gradient(135deg,#ffd700,#ff9500)" shadow="rgba(255,215,0,0.3)" onClick={() => { socket.emit('getInventory', { uid: user.uid }); setScreen('shop'); }}>🎁 상점</Btn>
        <Btn bg="rgba(255,255,255,0.15)" shadow="rgba(0,0,0,0.05)" onClick={logout} style={{ fontSize: 14 }}><span style={{ color: 'rgba(255,255,255,0.5)' }}>로그아웃</span></Btn>
      </Page>
    );
  }

/* ═══ 상점 ═══ */
  if (screen === 'shop') {
    return (
      <Page center={false}>
        {boxOpening && boxResult && <BoxOpenAnim result={getSkin(boxResult.id) ? { ...getSkin(boxResult.id) } : boxResult} onClose={() => { setBoxOpening(false); setBoxResult(null); }} />}
        <h1 style={{ textAlign: 'center', fontSize: 28, fontWeight: 900, color: '#fff', margin: '20px 0 4px' }}>🎁 상점</h1>
        <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>스킨 상자를 열어 프로필을 꾸며보세요!</p>

        <Card style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', background: 'linear-gradient(135deg, #fff9e6, #fff3cd)' }}>
          <span style={{ fontSize: 28 }}>🪙</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 20, color: '#d4a017' }}>{coins.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: '#999' }}>보유 MF코인</div>
          </div>
        </Card>

        <Card style={{ textAlign: 'center', padding: 28 }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>📦</div>
          <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 4 }}>프로필 스킨 상자</div>
          <div style={{ fontSize: 13, color: '#999', marginBottom: 16 }}>랜덤 프로필 테두리 스킨 획득!</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {Object.entries(RARITY_COLOR).map(([r, c]) => (
              <span key={r} style={{ fontSize: 10, fontWeight: 700, color: c, border: `1px solid ${c}`, padding: '3px 8px', borderRadius: 6 }}>{RARITY_LABEL[r]}</span>
            ))}
          </div>
          <Btn bg="linear-gradient(135deg,#ffd700,#ff9500)" shadow="rgba(255,215,0,0.4)" onClick={openBox}>
            🪙 200 코인으로 열기
          </Btn>
        </Card>

        {err && <Card style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)' }}><p style={{ color: '#e74c3c', textAlign: 'center', fontWeight: 600, margin: 0 }}>{err}</p></Card>}

        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10, marginTop: 8 }}>🎒 보유 스킨 ({inventory.length})</div>
        <Card>
          {inventory.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999', padding: 20 }}>아직 보유한 스킨이 없어요!</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 10 }}>
              {[...new Set(inventory)].map(skinId => {
                const skin = getSkin(skinId);
                if (!skin) return null;
                const isEquipped = equipped === skinId;
                const count = inventory.filter(s => s === skinId).length;
                return (
                  <div key={skinId} onClick={() => equipSkin(skinId)} style={{ textAlign: 'center', cursor: 'pointer', padding: 8, borderRadius: 12, background: isEquipped ? `${RARITY_COLOR[skin.rarity]}22` : '#f8f8f8', border: isEquipped ? `2px solid ${RARITY_COLOR[skin.rarity]}` : '2px solid transparent' }}>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <Avatar emoji="🎭" color="#667eea" size={48} skinId={skinId} />
                      {count > 1 && <span style={{ position: 'absolute', bottom: -4, right: -4, background: '#333', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '1px 5px' }}>x{count}</span>}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: RARITY_COLOR[skin.rarity], marginTop: 4 }}>{skin.name}</div>
                    {isEquipped && <div style={{ fontSize: 9, color: RARITY_COLOR[skin.rarity], fontWeight: 900 }}>장착중</div>}
                  </div>
                );
              })}
            </div>
          )}
          {equipped && (
            <Btn bg="#e0e0e0" shadow="rgba(0,0,0,0.05)" onClick={() => equipSkin(null)} style={{ marginTop: 12, marginBottom: 0 }}>
              <span style={{ color: '#888' }}>테두리 해제</span>
            </Btn>
          )}
        </Card>

        <Btn bg="rgba(255,255,255,0.15)" shadow="rgba(0,0,0,0.05)" onClick={() => { setScreen('main'); setErr(''); }} style={{ marginTop: 4 }}>
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>← 돌아가기</span>
        </Btn>
      </Page>
    );
  }
  
  /* ═══ 프로필 ═══ */
  if (screen === 'profile') {
    return (
      <Page>
        <h1 style={{ textAlign: 'center', fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 20 }}>프로필 설정</h1>
        <Card>
          <div style={{ marginBottom: 14 }}><Label>닉네임</Label><Input value={nick} onChange={e => setNick(e.target.value)} placeholder="닉네임" /></div>
          <div style={{ marginBottom: 14 }}>
            <Label>이모지</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {EMOJIS.map(e => <div key={e} onClick={() => setEmoji(e)} style={{ width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, borderRadius: 10, cursor: 'pointer', border: `2px solid ${emoji === e ? '#667eea' : '#eee'}`, background: emoji === e ? 'rgba(102,126,234,0.1)' : '#fafafa' }}>{e}</div>)}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Label>색상</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {COLORS.map(c => <div key={c} onClick={() => setColor(c)} style={{ width: 32, height: 32, borderRadius: '50%', background: c, cursor: 'pointer', border: `3px solid ${color === c ? '#333' : 'transparent'}`, boxShadow: color === c ? `0 0 12px ${c}` : 'none' }} />)}
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: 16, background: '#f5f5f5', borderRadius: 16, marginBottom: 16 }}>
            <Avatar emoji={emoji} color={color} size={64} />
            <div style={{ fontWeight: 700, marginTop: 8 }}>{nick || '닉네임'}</div>
          </div>
          {err && <p style={{ color: '#e74c3c', textAlign: 'center', fontSize: 14, marginBottom: 8 }}>{err}</p>}
          <Btn bg="linear-gradient(135deg,#667eea,#764ba2)" shadow="rgba(102,126,234,0.3)" onClick={saveProf}>✅ 저장</Btn>
          <Btn bg="#e0e0e0" shadow="rgba(0,0,0,0.05)" onClick={() => { setScreen('main'); setErr(''); }}><span style={{ color: '#888' }}>← 돌아가기</span></Btn>
        </Card>
      </Page>
    );
  }

  /* ═══ 방 만들기 ═══ */
  if (screen === 'createRoom') {
    return (
      <Page center={false}>
        <h1 style={{ textAlign: 'center', fontSize: 28, fontWeight: 900, color: '#fff', margin: '20px 0' }}>방 만들기</h1>
        <Card>
          <div style={{ marginBottom: 14 }}><Label>방 코드</Label><Input value={code} onChange={e => setCode(e.target.value)} placeholder="예: 1234" /></div>
          <div style={{ borderTop: '1px solid #eee', paddingTop: 14, marginTop: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#667eea', marginBottom: 12, letterSpacing: 1 }}>⚙️ 방 설정</div>
            <SettingRow label="👥 최대 인원" value={sets.maxPlayers} options={[5,6,7,8,9,10,15,20,25,30]} onChange={v => setSets(s => ({ ...s, maxPlayers: v }))} />
            <SettingRow label="🔪 마피아" value={sets.mafiaCount} options={[1,2,3,4,5,6,7,8,9,10]} onChange={v => setSets(s => ({ ...s, mafiaCount: v }))} />
            <SettingRow label="🔍 경찰" value={sets.policeCount} options={[0,1,2,3,4,5]} onChange={v => setSets(s => ({ ...s, policeCount: v }))} />
            <SettingRow label="💊 의사" value={sets.doctorCount} options={[0,1,2,3,4,5]} onChange={v => setSets(s => ({ ...s, doctorCount: v }))} />
            <SettingRow label="☀️ 낮" value={sets.dayTime} options={[30,60,90,120,180]} onChange={v => setSets(s => ({ ...s, dayTime: v }))} />
            <SettingRow label="🗳️ 투표" value={sets.voteTime} options={[20,30,45,60,90]} onChange={v => setSets(s => ({ ...s, voteTime: v }))} />
            <SettingRow label="🌙 밤" value={sets.nightTime} options={[20,30,45,60,90]} onChange={v => setSets(s => ({ ...s, nightTime: v }))} />
          </div>
          {err && <p style={{ color: '#e74c3c', textAlign: 'center', fontSize: 14, marginBottom: 8 }}>{err}</p>}
          <Btn bg="linear-gradient(135deg,#e74c3c,#c0392b)" shadow="rgba(231,76,60,0.3)" onClick={createRoom}>🎮 방 만들기</Btn>
          <Btn bg="#e0e0e0" shadow="rgba(0,0,0,0.05)" onClick={() => { setScreen('main'); setErr(''); }}><span style={{ color: '#888' }}>← 돌아가기</span></Btn>
        </Card>
      </Page>
    );
  }

  /* ═══ 방 입장 ═══ */
  if (screen === 'joinRoom') {
    return (
      <Page>
        <h1 style={{ textAlign: 'center', fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 20 }}>방 입장</h1>
        <Card>
          <div style={{ marginBottom: 14 }}><Label>방 코드</Label><Input value={code} onChange={e => setCode(e.target.value)} placeholder="방 코드 입력" /></div>
          {err && <p style={{ color: '#e74c3c', textAlign: 'center', fontSize: 14, marginBottom: 8 }}>{err}</p>}
          <Btn bg="linear-gradient(135deg,#3498db,#2980b9)" shadow="rgba(52,152,219,0.3)" onClick={joinRoom}>🚪 입장</Btn>
          <Btn bg="#e0e0e0" shadow="rgba(0,0,0,0.05)" onClick={() => { setScreen('main'); setErr(''); }}><span style={{ color: '#888' }}>← 돌아가기</span></Btn>
        </Card>
      </Page>
    );
  }

  /* ═══ 퀵매칭 대기 ═══ */
  if (screen === 'quickWait') {
    return (
      <Page>
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>매칭 중...</h2>
          <p style={{ color: '#888', fontSize: 15, marginBottom: 4 }}>{qStat?.position || 0} / {qStat?.needed || 5} 명</p>
          <p style={{ color: '#aaa', fontSize: 13, marginBottom: 24 }}>다른 플레이어를 기다리는 중</p>
          <Btn bg="linear-gradient(135deg,#e74c3c,#c0392b)" shadow="rgba(231,76,60,0.3)" onClick={cancelQ}>❌ 매칭 취소</Btn>
        </Card>
      </Page>
    );
  }

  /* ═══ 랭킹 ═══ */
  if (screen === 'rankings') {
    return (
      <Page center={false}>
        <h1 style={{ textAlign: 'center', fontSize: 28, fontWeight: 900, color: '#fff', margin: '20px 0' }}>🏆 랭킹</h1>
        <Card>
          {lRanks.length === 0 ? <p style={{ textAlign: 'center', color: '#999', padding: 30 }}>아직 기록이 없어요!</p> :
            lRanks.slice(0, 30).map((r, i) => (
              <div key={r.nickname || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, marginBottom: 4, background: i === 0 ? 'rgba(255,215,0,0.08)' : i < 3 ? 'rgba(102,126,234,0.04)' : 'transparent' }}>
                <div style={{ fontSize: 18, width: 32, textAlign: 'center', fontWeight: 800 }}>{badge(i, lRanks.length)}</div>
                <Avatar emoji={r.emoji} color={r.color} size={36} />
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{r.nickname}</div><div style={{ fontSize: 11, color: '#aaa' }}>{r.wins}승 {r.losses}패 / {r.games}판</div></div>
                <div style={{ fontWeight: 900, color: '#f39c12', fontSize: 18 }}>{r.score}<span style={{ fontSize: 11, color: '#ccc' }}>점</span></div>
              </div>
            ))}
          <Btn bg="#e0e0e0" shadow="rgba(0,0,0,0.05)" onClick={() => setScreen('main')} style={{ marginTop: 8 }}><span style={{ color: '#888' }}>← 돌아가기</span></Btn>
        </Card>
      </Page>
    );
  }

  /* ═══ 대기실 ═══ */
  if (screen === 'room') {
    return (
      <div style={{ minHeight: '100vh', background: bg2, fontFamily: "'Segoe UI',sans-serif", color: '#fff' }}>
        <MuteB />
        {ctx && <CtxMenu {...ctx} isHost={isHost} onKick={() => kick(ctx.player.id)} onInfo={() => getInfo(ctx.player.id)} onClose={() => setCtx(null)} />}
        {pInfo && <InfoModal info={pInfo} onClose={() => setPInfo(null)} />}
        <div style={{ maxWidth: 700, margin: '0 auto', padding: 20 }}>
          <h1 style={{ textAlign: 'center', fontSize: 24, fontWeight: 900, marginBottom: 12 }}>대기실</h1>
          <DCard style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>방 코드</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#667eea', letterSpacing: 6 }}>{code}</div>
          </DCard>
          {rSet && <DCard style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13, color: '#888' }}>
            <span>👥{rSet.maxPlayers}</span><span>🔪{rSet.mafiaCount}</span><span>🔍{rSet.policeCount}</span><span>💊{rSet.doctorCount}</span>
            <span>☀️{rSet.dayTime}초</span><span>🗳️{rSet.voteTime}초</span><span>🌙{rSet.nightTime}초</span>
          </DCard>}
          {err && <DCard style={{ background: 'rgba(231,76,60,0.1)', color: '#e74c3c', textAlign: 'center', fontWeight: 600 }}>{err}</DCard>}
          <Header dark>참가자 ({players.length}/{rSet?.maxPlayers || 10})</Header>{isHost && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Btn bg="linear-gradient(135deg,#9b59b6,#8e44ad)" shadow="rgba(155,89,182,0.3)" onClick={() => socket.emit('addBot', { roomCode: code })} style={{ flex: 1 }}>🤖 봇 추가</Btn>
            </div>
          )}
          <p style={{ fontSize: 11, color: '#444', marginBottom: 8 }}>💡 우클릭 → 정보/추방</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {players.map((p, i) => (
              <DCard key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'context-menu', marginBottom: 0, padding: 10 }} onContextMenu={e => ctxMenu(e, p)}>
                <Avatar emoji={p.emoji} color={p.color} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.nickname}
                    {p.id === socket.id && <span style={{ color: '#555', fontSize: 10, marginLeft: 4 }}>(나)</span>}
                    {i === 0 && <span style={{ color: '#f39c12', fontSize: 10, marginLeft: 4 }}>👑</span>}
                  </div>
                  {p.isBot && <span style={{ fontSize: 10, color: '#9b59b6', background: 'rgba(155,89,182,0.1)', padding: '1px 6px', borderRadius: 5 }}>🤖 봇</span>}
                  {!p.uid && !p.isBot && <span style={{ fontSize: 10, color: '#f39c12', background: 'rgba(243,156,18,0.1)', padding: '1px 6px', borderRadius: 5 }}>게스트</span>}
                </div>
              </DCard>
            ))}
          </div>
          {isHost ? <Btn bg="linear-gradient(135deg,#e74c3c,#c0392b)" shadow="rgba(231,76,60,0.3)" onClick={startGame} style={{ marginTop: 12 }}>🎮 게임 시작 (최소 5명)</Btn>
            : <p style={{ textAlign: 'center', color: '#555', marginTop: 16, fontSize: 14 }}>⏳ 방장 대기 중...</p>}
        </div>
      </div>
    );
  }

  /* ═══ 게임 ═══ */
  if (screen === 'game') {
    const alive = players.filter(p => p.alive), dead = players.filter(p => !p.alive);
    const me = players.find(p => p.id === socket.id), amA = me?.alive !== false;
    return (
      <div style={{ minHeight: '100vh', background: bg2, fontFamily: "'Segoe UI',sans-serif", color: '#fff', display: 'flex', flexDirection: 'column' }}>
        <MuteB />
        {olay && <Overlay event={olay} onDone={hideOlay} />}
        {ctx && <CtxMenu {...ctx} isHost={isHost} onKick={() => kick(ctx.player.id)} onInfo={() => getInfo(ctx.player.id)} onClose={() => setCtx(null)} />}
        {pInfo && <InfoModal info={pInfo} onClose={() => setPInfo(null)} />}
        <div style={{ flex: 1, overflowY: 'auto', maxWidth: 900, margin: '0 auto', width: '100%', padding: 16 }}>
          <div style={{ textAlign: 'center', padding: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#888', letterSpacing: 1, marginBottom: 4 }}>{phase === 'day' ? '☀️ 낮' : phase === 'vote' ? '🗳️ 투표' : '🌙 밤'}</div>
            <div style={{ fontSize: 40, fontWeight: 900, color: tLeft <= 10 ? '#e74c3c' : tLeft <= 30 ? '#f39c12' : '#2ecc71' }}>{tLeft}초</div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', marginTop: 8, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, width: `${tTotal > 0 ? (tLeft / tTotal) * 100 : 0}%`, background: tLeft <= 10 ? '#e74c3c' : tLeft <= 30 ? '#f39c12' : '#2ecc71', transition: 'width 1s linear' }} />
            </div>
          </div>
          <DCard style={{ textAlign: 'center', borderColor: `${RC[myRole]}44`, background: `${RC[myRole]}11` }}>
            <div style={{ fontSize: 28 }}>{RE[myRole]}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: RC[myRole] }}>내 역할: {myRole}</div>
          </DCard>
          <DCard style={{ textAlign: 'center', fontWeight: 700, fontSize: 15 }}>
            {phase === 'day' ? '☀️ 토론하세요!' : phase === 'vote' ? '🗳️ 투표하세요!' : '🌙 역할 수행!'}
          </DCard>
          {police && <DCard style={{ background: 'rgba(52,152,219,0.15)', border: '1px solid rgba(52,152,219,0.3)', color: '#3498db', fontWeight: 700, textAlign: 'center' }}>{police}</DCard>}
          <Header dark>생존자 ({alive.length})</Header>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {alive.map(p => {
              const vf = votersFor(p.id);
              return (
                <DCard key={p.id} onContextMenu={e => ctxMenu(e, p)} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderColor: votes[socket.id] === p.id ? '#f39c12' : undefined, marginBottom: 0, padding: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Avatar emoji={p.emoji} color={p.color} size={32} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nickname} {p.id === socket.id && <span style={{ color: '#555', fontSize: 10 }}>(나)</span>}</div>
                      {vf.length > 0 && <div style={{ display: 'flex', gap: 2, marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                        {vf.map(v => <span key={v.voterId} title={v.voterNickname} style={{ width: 15, height: 15, borderRadius: '50%', background: v.voterColor || '#333', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, border: '1px solid rgba(255,255,255,0.2)' }}>{v.voterEmoji}</span>)}
                        <span style={{ color: '#f39c12', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>{vf.length}표</span>
                      </div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {phase === 'vote' && amA && p.id !== socket.id && !myVote && <BtnSm bg="#e74c3c" onClick={() => vote(p.id)}>투표</BtnSm>}
                    {phase === 'night' && amA && p.id !== socket.id && !myVote && <>
                      {myRole === '마피아' && <BtnSm bg="#e74c3c" onClick={() => nightAct(p.id)}>🔪</BtnSm>}
                      {myRole === '의사' && <BtnSm bg="#2ecc71" onClick={() => nightAct(p.id)}>💊</BtnSm>}
                      {myRole === '경찰' && <BtnSm bg="#3498db" onClick={() => nightAct(p.id)}>🔍</BtnSm>}
                    </>}
                  </div>
                </DCard>
              );
            })}
          </div>
          {myVote && <DCard style={{ textAlign: 'center', color: '#2ecc71', fontWeight: 700, marginTop: 10 }}>✅ 대기 중...</DCard>}
          {!amA && <DCard style={{ textAlign: 'center', color: '#666', marginTop: 10 }}>💀 사망</DCard>}
          {dead.length > 0 && <>
            <Header dark>사망자 ({dead.length})</Header>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
              {dead.map(p => <DCard key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.4, marginBottom: 0, padding: 8 }}><Avatar emoji={p.emoji} color={p.color} size={28} /><span style={{ color: '#555', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nickname}</span><span style={{ marginLeft: 'auto' }}>💀</span></DCard>)}
            </div>
          </>}
        </div>
        <div style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
          <ChatBox msgs={msgs} input={chatIn} setInput={setChatIn} onSend={sendChat} phase={phase} role={myRole} />
        </div>
      </div>
    );
  }

  /* ═══ 게임 오버 ═══ */
  if (screen === 'gameover') {
    return (
      <div style={{ minHeight: '100vh', background: bg2, fontFamily: "'Segoe UI',sans-serif", color: '#fff', display: 'flex', flexDirection: 'column' }}>
        <MuteB />
        <div style={{ flex: 1, overflowY: 'auto', maxWidth: 460, margin: '0 auto', width: '100%', padding: 20 }}>
          <DCard style={{ textAlign: 'center', background: over === '시민' ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.12)', border: `1px solid ${over === '시민' ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)'}` }}>
            <div style={{ fontSize: 48 }}>{over === '시민' ? '🎉' : '💀'}</div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>{over === '시민' ? '시민 승리!' : '마피아 승리!'}</div>
          </DCard>
          <Header dark>결과</Header>
          {players.map(p => (
            <DCard key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar emoji={p.emoji} color={p.color} size={38} />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{p.nickname}</div><div style={{ color: RC[p.role], fontSize: 13 }}>{RE[p.role]} {p.role}</div></div>
              <span style={{ fontSize: 20 }}>{p.alive ? '✅' : '💀'}</span>
            </DCard>
          ))}
          <Header dark>🏆 랭킹</Header>
          {ranks.slice(0, 15).map((r, i) => (
            <DCard key={r.nickname || i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 18, width: 30, textAlign: 'center', fontWeight: 800 }}>{badge(i, ranks.length)}</div>
              <Avatar emoji={r.emoji} color={r.color} size={32} />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{r.nickname}</div><div style={{ fontSize: 11, color: '#555' }}>{r.wins}승 {r.losses}패</div></div>
              <div style={{ fontWeight: 900, color: '#f39c12', fontSize: 16 }}>{r.score}</div>
            </DCard>
          ))}
          <Btn bg="linear-gradient(135deg,#667eea,#764ba2)" shadow="rgba(102,126,234,0.3)" onClick={() => window.location.reload()} style={{ marginTop: 12 }}>처음으로</Btn>
        </div>
        <div style={{ maxWidth: 460, margin: '0 auto', width: '100%' }}>
          <ChatBox msgs={msgs} input={chatIn} setInput={setChatIn} onSend={sendChat} phase={phase} role={myRole} />
        </div>
      </div>
    );
  }

  return <Page><Card><p style={{ textAlign: 'center' }}>로딩 중...</p></Card></Page>;
}

export default App;