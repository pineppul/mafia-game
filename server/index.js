const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, getDoc, getDocs, collection } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDUr3_tlA4Dk_0YUwPfa42YtzPVqyTOylc",
  authDomain: "mafia-game-bd7ae.firebaseapp.com",
  projectId: "mafia-game-bd7ae",
  storageBucket: "mafia-game-bd7ae.firebasestorage.app",
  messagingSenderId: "641427360069",
  appId: "1:641427360069:web:d5fb81f8219fac5614962c"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ['http://localhost:3000', 'https://mafia-game-tawny.vercel.app'], methods: ['GET', 'POST'] } });

const rooms = {};
let rankings = {};
const quickQueue = [];
let quickRoomCounter = 1;
let botCounter = 1;

// 봇 이름 & 이모지
const BOT_NAMES = ['호랑이','여우','토끼','곰돌이','펭귄','늑대','사자','고양이','강아지','올빼미','독수리','판다','해달','코알라','다람쥐','두더지','수달','앵무새','햄스터','고슴도치'];
const BOT_EMOJIS = ['🤖','🐱','🐶','🦊','🐻','🐧','🐺','🦁','🐸','🦉','🦅','🐼','🦦','🐨','🐿️','🐹','🦜','🦔'];
const BOT_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63','#00bcd4','#8bc34a'];

// 봇 채팅 메시지
const BOT_CHAT = {
  시민_day: [
    '음... 누가 마피아인지 모르겠어요 🤔', '아까 투표 결과가 좀 의심스러웠어요',
    '저는 시민이에요! 진짜로!', '누가 제일 의심스러운 것 같아요?',
    '조용한 사람이 제일 의심돼요', '아무 말 안 하는 사람 마피아 아니에요?',
    '저를 의심하지 마세요 ㅠㅠ', '다 같이 잘 생각해 봅시다!',
    'ㅋㅋㅋ 긴장되네', '마피아 누구야 솔직히 말해봐',
    '아 진짜 모르겠다', '느낌적으로 저 사람 좀 수상한데...',
    '투표 신중하게 합시다', '제가 보기엔 아까 반응이 이상했어요',
    '마피아 게임 재밌다 ㅋㅋ', '누가 죽었는지 보고 추리해 봅시다',
    '일단 확실한 건 저는 시민이에요', '다들 의견 말해봐요',
    '혹시 경찰 있으면 힌트 좀...', '시민 여러분 힘냅시다!'
  ],
  마피아_day: [
    '저는 확실히 시민이에요!', '음... 저 사람이 좀 수상하지 않아요?',
    '아 진짜 마피아 누구야 ㅠㅠ', '저도 모르겠어요 어렵네',
    'ㅋㅋ 이거 진짜 어렵다', '다 같이 힘내서 마피아 잡읍시다!',
    '저를 믿어주세요! 시민이에요!', '아까 그 사람 반응이 좀 그랬는데...',
    '투표 잘해야 해요 신중하게', '경찰이 빨리 찾아줬으면...',
    '저는 의사한테 살려달라고 빌고 있어요 ㅋㅋ', '마피아 찾기 어렵네요',
    '분위기 보니까 저 사람인 것 같은데?', '아 긴장돼서 말이 안 나와',
    '시민 팀 이기자!', '다들 너무 조용하면 의심받아요 ㅋㅋ'
  ],
  경찰_day: [
    '제가 좀 조사해 본 결과가 있는데...', '음... 확인해 본 게 있어요',
    '저는 시민 편이에요 믿어주세요', '조사 결과를 바탕으로 투표합시다',
    '제 감이 맞다면 저 사람이에요', '조용히 관찰하고 있었어요',
    '믿어주세요 제가 아는 게 있어요', '마피아 거의 찾은 것 같아요'
  ],
  의사_day: [
    '다들 조심하세요!', '제가 할 수 있는 건 하고 있어요',
    '시민 여러분 힘냅시다', '밤이 무서워요 ㅠㅠ',
    '서로 보호합시다!', '아 누구를 지켜야 할지 고민이네...',
    '마피아 빨리 찾아야 해요', '다들 안전하게!'
  ],
  마피아_night: [
    '이번엔 누구를 처리할까?', '저 사람 위험해 보여',
    '경찰 먼저 없애자', '의사 제거하는 게 좋을 듯',
    '조용한 사람 노리자', 'ㅋㅋ 들키면 안 돼',
    '이번 라운드 중요해', '신중하게 고르자'
  ]
};

function getBotChat(role, phase) {
  if (phase === 'night' && role === '마피아') return BOT_CHAT.마피아_night[Math.floor(Math.random() * BOT_CHAT.마피아_night.length)];
  if (phase === 'day' || phase === 'vote') {
    if (role === '마피아') return BOT_CHAT.마피아_day[Math.floor(Math.random() * BOT_CHAT.마피아_day.length)];
    if (role === '경찰') return BOT_CHAT.경찰_day[Math.floor(Math.random() * BOT_CHAT.경찰_day.length)];
    if (role === '의사') return BOT_CHAT.의사_day[Math.floor(Math.random() * BOT_CHAT.의사_day.length)];
    return BOT_CHAT.시민_day[Math.floor(Math.random() * BOT_CHAT.시민_day.length)];
  }
  return null;
}

function createBot(roomCode) {
  const room = rooms[roomCode];
  const usedNames = room ? room.players.filter(p => p.isBot).map(p => p.nickname) : [];
  
  let nickname, tries = 0;
  do {
    const nameIdx = Math.floor(Math.random() * BOT_NAMES.length);
    const num = Math.floor(Math.random() * 900) + 100;
    nickname = `봇_${BOT_NAMES[nameIdx]}${num}`;
    tries++;
  } while (usedNames.includes(nickname) && tries < 20);

  const id = `bot_${botCounter++}`;
  return {
    id, nickname, isBot: true, uid: null, score: 0,
    emoji: BOT_EMOJIS[Math.floor(Math.random() * BOT_EMOJIS.length)],
    color: BOT_COLORS[Math.floor(Math.random() * BOT_COLORS.length)]
  };
}

// 봇 채팅 타이머
function startBotChat(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  if (room.botChatTimer) clearInterval(room.botChatTimer);

  room.botChatTimer = setInterval(() => {
    if (!rooms[roomCode]) { clearInterval(room.botChatTimer); return; }
    const r = rooms[roomCode];
    const aliveBots = r.players.filter(p => p.isBot && p.alive);
    if (aliveBots.length === 0) return;

    const bot = aliveBots[Math.floor(Math.random() * aliveBots.length)];
    const msg = getBotChat(bot.role, r.phase);
    if (!msg) return;

    if (r.phase === 'night') {
      if (bot.role === '마피아') {
        r.players.filter(p => p.role === '마피아').forEach(p => {
          if (!p.isBot) io.to(p.id).emit('chatMessage', { nickname: bot.nickname, message: msg, type: 'mafia', emoji: bot.emoji });
        });
      }
    } else {
      io.to(roomCode).emit('chatMessage', { nickname: bot.nickname, message: msg, type: 'normal', emoji: bot.emoji });
    }
  }, 5000 + Math.random() * 8000);
}

// 봇 투표
function botVote(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.phase !== 'vote') return;

  const aliveBots = room.players.filter(p => p.isBot && p.alive);
  const aliveHumans = room.players.filter(p => p.alive && !room.votes[p.id]);

  aliveBots.forEach((bot, i) => {
    setTimeout(() => {
      if (!rooms[roomCode] || rooms[roomCode].phase !== 'vote') return;
      const targets = room.players.filter(p => p.alive && p.id !== bot.id);
      if (targets.length === 0) return;

      let target;
      if (bot.role === '마피아') {
        // 마피아 봇은 시민을 투표
        const citizens = targets.filter(p => p.role !== '마피아');
        target = citizens.length > 0 ? citizens[Math.floor(Math.random() * citizens.length)] : targets[Math.floor(Math.random() * targets.length)];
      } else {
        // 시민 봇은 랜덤 투표
        target = targets[Math.floor(Math.random() * targets.length)];
      }

      room.votes[bot.id] = target.id;
      room.voteDetails[bot.id] = { voterId: bot.id, voterNickname: bot.nickname, voterEmoji: bot.emoji, voterColor: bot.color, targetId: target.id };

      const alivePlayers = room.players.filter(p => p.alive);
      io.to(roomCode).emit('voteUpdate', { votes: room.votes, voteDetails: room.voteDetails, voteCount: Object.keys(room.votes).length, total: alivePlayers.length });
      io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '🗳️', message: `${bot.emoji} ${bot.nickname} 님이 투표했습니다.` });

      if (Object.keys(room.votes).length >= alivePlayers.length) {
        if (room.timer) clearInterval(room.timer);
        processVotes(roomCode);
      }
    }, (i + 1) * (2000 + Math.random() * 3000));
  });
}

// 봇 밤 행동
function botNightAction(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.phase !== 'night') return;

  const aliveBots = room.players.filter(p => p.isBot && p.alive);

  aliveBots.forEach((bot, i) => {
    setTimeout(() => {
      if (!rooms[roomCode] || rooms[roomCode].phase !== 'night') return;
      if (bot.role === '시민') return;

      const targets = room.players.filter(p => p.alive && p.id !== bot.id);
      if (targets.length === 0) return;

      let target;
      if (bot.role === '마피아') {
        const nonMafia = targets.filter(p => p.role !== '마피아');
        target = nonMafia.length > 0 ? nonMafia[Math.floor(Math.random() * nonMafia.length)] : targets[0];
      } else if (bot.role === '의사') {
        target = targets[Math.floor(Math.random() * targets.length)];
      } else if (bot.role === '경찰') {
        target = targets[Math.floor(Math.random() * targets.length)];
      }

      if (!target) return;
      room.nightActions[bot.role] = { actorId: bot.id, targetId: target.id };

      if (bot.role === '경찰' && target.role === '마피아') {
        if (!room.policeCorrect) room.policeCorrect = [];
        room.policeCorrect.push(bot.nickname);
      }

      const aliveDoctor = room.players.filter(p => p.alive && p.role === '의사');
      const alivePolice = room.players.filter(p => p.alive && p.role === '경찰');
      const mafiaActed = room.nightActions['마피아'];
      const doctorActed = aliveDoctor.length === 0 || room.nightActions['의사'];
      const policeActed = alivePolice.length === 0 || room.nightActions['경찰'];

      if (mafiaActed && doctorActed && policeActed) {
        if (room.timer) clearInterval(room.timer);
        processNight(roomCode);
      }
    }, (i + 1) * (1500 + Math.random() * 2000));
  });
}

async function loadRankings() {
  try {
    const snapshot = await getDocs(collection(db, 'rankings'));
    snapshot.forEach(d => { rankings[d.id] = d.data(); });
    console.log('랭킹 로드:', Object.keys(rankings).length);
  } catch (e) { console.log('랭킹 로드 실패'); }
}
loadRankings();

async function saveRanking(uid, data) { try { await setDoc(doc(db, 'rankings', uid), data); } catch (e) {} }
async function saveProfile(uid, data) { try { await setDoc(doc(db, 'profiles', uid), data); } catch (e) {} }
async function getCoins(uid) {
  try { const d = await getDoc(doc(db, 'coins', uid)); return d.exists() ? d.data().amount : 0; }
  catch (e) { return 0; }
}
async function saveCoins(uid, amount) {
  // 스킨 목록
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

const RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };

function rollSkin() {
  const rand = Math.random() * 100;
  let cumulative = 0;
  let rarity = 'common';
  for (const [r, w] of Object.entries(RARITY_WEIGHTS)) {
    cumulative += w;
    if (rand <= cumulative) { rarity = r; break; }
  }
  const pool = SKINS.filter(s => s.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

async function getInventory(uid) {
  try { const d = await getDoc(doc(db, 'inventory', uid)); return d.exists() ? d.data().skins || [] : []; }
  catch (e) { return []; }
}
async function saveInventory(uid, skins) {
  try { await setDoc(doc(db, 'inventory', uid), { skins }); } catch (e) {}
}
async function getEquippedSkin(uid) {
  try { const d = await getDoc(doc(db, 'equipped', uid)); return d.exists() ? d.data().skinId : null; }
  catch (e) { return null; }
}
async function saveEquippedSkin(uid, skinId) {
  try { await setDoc(doc(db, 'equipped', uid), { skinId }); } catch (e) {}
}
  try { await setDoc(doc(db, 'coins', uid), { amount }); } catch (e) {}
}
async function getProfile(uid) { try { const d = await getDoc(doc(db, 'profiles', uid)); return d.exists() ? d.data() : null; } catch (e) { return null; } }

function assignRoles(players, settings) {
  const { mafiaCount, policeCount, doctorCount } = settings;
  let roles = [];
  for (let i = 0; i < mafiaCount; i++) roles.push('마피아');
  for (let i = 0; i < policeCount; i++) roles.push('경찰');
  for (let i = 0; i < doctorCount; i++) roles.push('의사');
  while (roles.length < players.length) roles.push('시민');
  roles.sort(() => Math.random() - 0.5);
  return players.map((p, i) => ({ ...p, role: roles[i], alive: true }));
}

function checkWin(room) {
  const alive = room.players.filter(p => p.alive);
  const m = alive.filter(p => p.role === '마피아');
  const c = alive.filter(p => p.role !== '마피아');
  if (m.length === 0) return '시민';
  if (m.length >= c.length) return '마피아';
  return null;
}

function sendGameState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  room.players.filter(p => !p.isBot).forEach(player => {
    io.to(player.id).emit('gameState', {
      phase: room.phase, timeLeft: room.timeLeft,
      players: room.players.map(p => ({ id: p.id, nickname: p.nickname, emoji: p.emoji, color: p.color, alive: p.alive, uid: p.uid, isBot: p.isBot || false, role: p.id === player.id ? p.role : null })),
      myRole: player.role, votes: room.votes || {}, voteDetails: room.voteDetails || {}, settings: room.settings
    });
  });
}

function startTimer(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  if (room.timer) clearInterval(room.timer);

  const duration = room.phase === 'day' ? room.settings.dayTime : room.phase === 'vote' ? room.settings.voteTime : room.settings.nightTime;
  room.timeLeft = duration;
  io.to(roomCode).emit('timerUpdate', { timeLeft: room.timeLeft, phase: room.phase });

  // 봇 행동 시작
  if (room.phase === 'vote') setTimeout(() => botVote(roomCode), 2000);
  if (room.phase === 'night') setTimeout(() => botNightAction(roomCode), 1500);

  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(roomCode).emit('timerUpdate', { timeLeft: room.timeLeft, phase: room.phase });
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      if (room.phase === 'day') {
        room.phase = 'vote'; room.votes = {}; room.voteDetails = {};
        io.to(roomCode).emit('phaseChange', { phase: 'vote', event: 'voteStart' });
        io.to(roomCode).emit('chatMessage', { nickname: '시스템', message: '🗳️ 투표 시간!', type: 'system', emoji: '⚖️' });
        sendGameState(roomCode); startTimer(roomCode);
      } else if (room.phase === 'vote') { processVotes(roomCode); }
      else if (room.phase === 'night') { processNight(roomCode); }
    }
  }, 1000);
}

function processVotes(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  const tally = {};
  Object.values(room.votes).forEach(id => { tally[id] = (tally[id] || 0) + 1; });
  let elim = null, result = 'none';
  if (Object.keys(tally).length > 0) {
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const top = sorted[0][1];
    const tied = sorted.filter(e => e[1] === top);
    if (tied.length === 1 && top >= 2) { elim = room.players.find(p => p.id === sorted[0][0]); if (elim) { elim.alive = false; result = 'eliminated'; } }
    else if (tied.length > 1) result = 'tie';
    else result = 'noMajority';
  }
  room.votes = {}; room.voteDetails = {};
  const winner = checkWin(room);
  if (winner) { endGame(roomCode, winner); return; }
  room.phase = 'night'; room.nightActions = {};
  if (result === 'eliminated') {
    io.to(roomCode).emit('phaseChange', { phase: 'night', event: 'eliminated', eliminatedNickname: elim.nickname, eliminatedEmoji: elim.emoji });
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '⚖️', message: `${elim.emoji} ${elim.nickname} 님이 처형되었습니다.` });
  } else if (result === 'tie') {
    io.to(roomCode).emit('phaseChange', { phase: 'night', event: 'voteTie' });
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '⚖️', message: '동점! 아무도 처형 안 됨.' });
  } else {
    io.to(roomCode).emit('phaseChange', { phase: 'night', event: 'noVote' });
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '⚖️', message: '표 부족. 처형 없음.' });
  }
  io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '🌙', message: '밤이 왔습니다...' });
  sendGameState(roomCode); startTimer(roomCode);
}

function processNight(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  if (room.nightActions['경찰']) {
    const t = room.players.find(p => p.id === room.nightActions['경찰'].targetId);
    const cop = room.players.find(p => p.id === room.nightActions['경찰'].actorId);
    if (t && cop && !cop.isBot) io.to(cop.id).emit('policeResult', { nickname: t.nickname, emoji: t.emoji, role: t.role });
  }
  const mt = room.nightActions['마피아']?.targetId;
  const dt = room.nightActions['의사']?.targetId;
  let killed = null, healed = false, saved = null;
  if (mt) {
    if (mt === dt) { healed = true; saved = room.players.find(p => p.id === mt); }
    else { killed = room.players.find(p => p.id === mt); if (killed) killed.alive = false; }
  }
  room.nightActions = {};
  const winner = checkWin(room);
  if (winner) { endGame(roomCode, winner); return; }
  room.phase = 'day';
  if (killed) {
    io.to(roomCode).emit('phaseChange', { phase: 'day', event: 'nightKill', killedNickname: killed.nickname, killedEmoji: killed.emoji });
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '☀️', message: `${killed.emoji} ${killed.nickname} 사망!` });
  } else if (healed) {
    io.to(roomCode).emit('phaseChange', { phase: 'day', event: 'healed', healedNickname: saved?.nickname, healedEmoji: saved?.emoji });
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '☀️', message: `${saved?.emoji} ${saved?.nickname} 살아남았습니다!` });
  } else {
    io.to(roomCode).emit('phaseChange', { phase: 'day', event: 'peacefulNight' });
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '☀️', message: '평화로운 밤!' });
  }
  io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '💬', message: '토론하세요!' });
  sendGameState(roomCode); startTimer(roomCode);
}

async function endGame(roomCode, winner) {
  const room = rooms[roomCode];
  if (!room) return;
  if (room.timer) clearInterval(room.timer);
  if (room.botChatTimer) clearInterval(room.botChatTimer);

  const coinResults = {};

  for (const p of room.players) {
    if (p.isBot || !p.uid) continue;
    if (!rankings[p.uid]) rankings[p.uid] = { uid: p.uid, nickname: p.nickname, emoji: p.emoji, color: p.color, score: 0, wins: 0, losses: 0, games: 0 };
    rankings[p.uid].games++; rankings[p.uid].nickname = p.nickname; rankings[p.uid].emoji = p.emoji; rankings[p.uid].color = p.color;
    const isMafia = p.role === '마피아';
    const won = (winner === '마피아' && isMafia) || (winner === '시민' && !isMafia);
    if (won) { rankings[p.uid].wins++; rankings[p.uid].score += isMafia ? 15 : 10; }
    else { rankings[p.uid].losses++; rankings[p.uid].score = Math.max(0, rankings[p.uid].score - 5); }
    await saveRanking(p.uid, rankings[p.uid]);

    // MF코인 지급
    const coinsEarned = won ? 100 : 20;
    const currentCoins = await getCoins(p.uid);
    const newCoins = currentCoins + coinsEarned;
    await saveCoins(p.uid, newCoins);
    coinResults[p.uid] = { earned: coinsEarned, total: newCoins, won };
  }

  const rankingList = Object.values(rankings).sort((a, b) => b.score - a.score);
  io.to(roomCode).emit('gameOver', { winner, players: room.players, rankings: rankingList, coinResults });
}

function processQuickQueue() {
  if (quickQueue.length >= 5) {
    const players = quickQueue.splice(0, 5);
    const roomCode = `quick_${quickRoomCounter++}`;
    rooms[roomCode] = {
      players: players.map(p => ({ ...p, score: 0 })), host: players[0].id,
      started: false, phase: 'day', votes: {}, voteDetails: {}, nightActions: {}, policeCorrect: [],
      settings: { maxPlayers: 10, mafiaCount: 1, policeCount: 1, doctorCount: 1, dayTime: 90, voteTime: 45, nightTime: 45 }
    };
    players.forEach(p => { const s = io.sockets.sockets.get(p.id); if (s) s.join(roomCode); });
    io.to(roomCode).emit('quickMatchFound', { roomCode }); io.to(roomCode).emit('roomUpdate', rooms[roomCode]);
    setTimeout(() => {
      const r = rooms[roomCode];
      if (r && !r.started && r.players.length >= 5) {
        r.started = true; r.players = assignRoles(r.players, r.settings); r.phase = 'day';
        sendGameState(roomCode);
        io.to(roomCode).emit('chatMessage', { nickname: '시스템', emoji: '🎮', type: 'system', message: '퀵매칭 시작!' });
        startTimer(roomCode); startBotChat(roomCode);
      }
    }, 5000);
  }
}

io.on('connection', (socket) => {
  console.log('접속:', socket.id);

  socket.on('getRankings', () => { socket.emit('rankingsList', Object.values(rankings).sort((a, b) => b.score - a.score)); });
  socket.on('saveProfile', async ({ uid, nickname, emoji, color }) => { await saveProfile(uid, { uid, nickname, emoji, color }); socket.emit('profileSaved'); });
  socket.on('getProfile', async ({ uid }) => { socket.emit('profileData', await getProfile(uid)); });
  socket.on('getCoins', async ({ uid }) => { socket.emit('coinsData', await getCoins(uid)); });
  socket.on('getInventory', async ({ uid }) => {
      try {
        const invDoc = await getDoc(doc(db, 'inventory', uid));
        const inv = invDoc.exists() ? (invDoc.data().skins || []) : [];
        const eqDoc = await getDoc(doc(db, 'equipped', uid));
        const eq = eqDoc.exists() ? eqDoc.data().skinId : null;
        socket.emit('inventoryData', { inventory: inv, equipped: eq });
      } catch (e) {
        console.log('인벤토리 로드 실패:', e.message);
        socket.emit('inventoryData', { inventory: [], equipped: null });
      }
    });
  socket.on('openBox', async ({ uid }) => {
    const BOX_COST = 200;
    const currentCoins = await getCoins(uid);
    if (currentCoins < BOX_COST) { socket.emit('error', '코인이 부족합니다!'); return; }

    const newCoins = currentCoins - BOX_COST;
    await saveCoins(uid, newCoins);

    const wonSkin = rollSkin();
    const inv = await getInventory(uid);
    inv.push(wonSkin.id);
    await saveInventory(uid, inv);

    socket.emit('boxResult', { skin: wonSkin, newCoins });
  });

  socket.on('equipSkin', async ({ uid, skinId }) => {
    await saveEquippedSkin(uid, skinId);
    socket.emit('equipped', { skinId });
  });

  socket.on('createRoom', ({ roomCode, nickname, emoji, color, uid, settings }) => {
    if (!uid) { socket.emit('error', '로그인이 필요합니다.'); return; }
    if (rooms[roomCode]) { socket.emit('error', '이미 존재하는 방입니다.'); return; }
    rooms[roomCode] = {
      players: [{ id: socket.id, nickname, emoji, color, uid, score: 0, isBot: false }],
      host: socket.id, started: false, phase: 'day', votes: {}, voteDetails: {}, nightActions: {}, policeCorrect: [],
      settings: settings || { maxPlayers: 10, mafiaCount: 2, policeCount: 1, doctorCount: 1, dayTime: 90, voteTime: 45, nightTime: 45 }
    };
    socket.join(roomCode);
    io.to(roomCode).emit('roomUpdate', rooms[roomCode]);
  });

  socket.on('joinRoom', ({ roomCode, nickname, emoji, color, uid }) => {
    if (!rooms[roomCode]) { socket.emit('error', '존재하지 않는 방입니다.'); return; }
    if (rooms[roomCode].players.length >= rooms[roomCode].settings.maxPlayers) { socket.emit('error', '꽉 찼습니다.'); return; }
    if (rooms[roomCode].started) { socket.emit('error', '이미 시작됨.'); return; }
    rooms[roomCode].players.push({ id: socket.id, nickname, emoji, color, uid: uid || null, score: 0, isBot: false });
    socket.join(roomCode); io.to(roomCode).emit('roomUpdate', rooms[roomCode]);
  });

  // 봇 추가
  socket.on('addBot', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.host !== socket.id) { socket.emit('error', '방장만 봇 추가 가능!'); return; }
    if (room.started) { socket.emit('error', '이미 시작됨!'); return; }
    if (room.players.length >= room.settings.maxPlayers) { socket.emit('error', '꽉 찼습니다!'); return; }
    const bot = createBot(roomCode);
    room.players.push(bot);
    io.to(roomCode).emit('roomUpdate', room);
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '🤖', message: `${bot.emoji} ${bot.nickname} 봇이 입장했습니다!` });
  });

  // 봇 제거
  socket.on('removeBot', ({ roomCode, botId }) => {
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id || room.started) return;
    room.players = room.players.filter(p => p.id !== botId);
    io.to(roomCode).emit('roomUpdate', room);
  });

  socket.on('kickPlayer', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id || room.started) return;
    if (targetId === socket.id) return;
    const kicked = room.players.find(p => p.id === targetId);
    if (!kicked) return;
    room.players = room.players.filter(p => p.id !== targetId);
    if (!kicked.isBot) { io.to(targetId).emit('kicked'); const ts = io.sockets.sockets.get(targetId); if (ts) ts.leave(roomCode); }
    io.to(roomCode).emit('roomUpdate', room);
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '🚪', message: `${kicked.emoji} ${kicked.nickname} 퇴장!` });
  });

  socket.on('getPlayerInfo', ({ roomCode, targetId }) => {
    const room = rooms[roomCode]; if (!room) return;
    const t = room.players.find(p => p.id === targetId); if (!t) return;
    const rd = t.uid ? rankings[t.uid] : null;
    socket.emit('playerInfo', { nickname: t.nickname, emoji: t.emoji, color: t.color, uid: t.uid, isBot: t.isBot || false, isGuest: !t.uid && !t.isBot, stats: rd ? { score: rd.score, wins: rd.wins, losses: rd.losses, games: rd.games } : null });
  });

  socket.on('startGame', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id) return;
    if (room.players.length < 5) { socket.emit('error', '최소 5명!'); return; }
    const { mafiaCount, policeCount, doctorCount } = room.settings;
    if (mafiaCount + policeCount + doctorCount >= room.players.length) { socket.emit('error', '역할 수 초과!'); return; }
    room.started = true; room.players = assignRoles(room.players, room.settings);
    room.phase = 'day'; room.votes = {}; room.voteDetails = {}; room.nightActions = {}; room.policeCorrect = [];
    sendGameState(roomCode);
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', emoji: '🎮', type: 'system', message: '게임 시작!' });
    startTimer(roomCode); startBotChat(roomCode);
  });

  socket.on('chatMessage', ({ roomCode, message }) => {
    const room = rooms[roomCode]; if (!room) return;
    const me = room.players.find(p => p.id === socket.id); if (!me) return;
    if (room.phase === 'night') {
      if (me.role === '마피아') room.players.filter(p => p.role === '마피아' && !p.isBot).forEach(p => { io.to(p.id).emit('chatMessage', { nickname: me.nickname, message, type: 'mafia', emoji: me.emoji }); });
      return;
    }
    if (!me.alive) return;
    io.to(roomCode).emit('chatMessage', { nickname: me.nickname, message, type: 'normal', emoji: me.emoji });
  });

  socket.on('vote', ({ roomCode, targetId }) => {
    const room = rooms[roomCode]; if (!room || room.phase !== 'vote') return;
    const me = room.players.find(p => p.id === socket.id); if (!me || !me.alive) return;
    room.votes[socket.id] = targetId;
    room.voteDetails[socket.id] = { voterId: socket.id, voterNickname: me.nickname, voterEmoji: me.emoji, voterColor: me.color, targetId };
    const alive = room.players.filter(p => p.alive);
    io.to(roomCode).emit('voteUpdate', { votes: room.votes, voteDetails: room.voteDetails });
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '🗳️', message: `${me.emoji} ${me.nickname} 투표 완료` });
    if (Object.keys(room.votes).length >= alive.length) { if (room.timer) clearInterval(room.timer); processVotes(roomCode); }
  });

  socket.on('nightAction', ({ roomCode, targetId }) => {
    const room = rooms[roomCode]; if (!room || room.phase !== 'night') return;
    const me = room.players.find(p => p.id === socket.id); if (!me || !me.alive) return;
    room.nightActions[me.role] = { actorId: socket.id, targetId };
    if (me.role === '경찰') {
      const t = room.players.find(p => p.id === targetId);
      if (t) { io.to(socket.id).emit('policeResult', { nickname: t.nickname, emoji: t.emoji, role: t.role }); if (t.role === '마피아') { if (!room.policeCorrect) room.policeCorrect = []; room.policeCorrect.push(me.uid || me.nickname); } }
    }
    const ad = room.players.filter(p => p.alive && p.role === '의사');
    const ap = room.players.filter(p => p.alive && p.role === '경찰');
    if (room.nightActions['마피아'] && (ad.length === 0 || room.nightActions['의사']) && (ap.length === 0 || room.nightActions['경찰'])) {
      if (room.timer) clearInterval(room.timer); processNight(roomCode);
    }
  });

  socket.on('quickMatch', ({ nickname, emoji, color, uid }) => {
    if (!uid) { socket.emit('error', '로그인 필요!'); return; }
    if (quickQueue.find(p => p.id === socket.id)) return;
    quickQueue.push({ id: socket.id, nickname, emoji, color, uid });
    quickQueue.forEach(p => { io.to(p.id).emit('quickMatchStatus', { status: 'waiting', position: quickQueue.length, needed: 5 }); });
    processQuickQueue();
  });

  socket.on('cancelQuickMatch', () => {
    const idx = quickQueue.findIndex(p => p.id === socket.id);
    if (idx !== -1) { quickQueue.splice(idx, 1); socket.emit('quickMatchStatus', { status: 'cancelled' }); }
  });

  socket.on('disconnect', () => {
    const qi = quickQueue.findIndex(p => p.id === socket.id);
    if (qi !== -1) quickQueue.splice(qi, 1);

    for (const rc in rooms) {
      if (!rooms[rc]) continue;
      const r = rooms[rc];
      const wasHost = r.host === socket.id;
      const wasPlayer = r.players.find(p => p.id === socket.id);
      if (!wasPlayer) continue;

      // 방장이 나가면 방 전체 삭제
      if (wasHost) {
        if (r.timer) clearInterval(r.timer);
        if (r.botChatTimer) clearInterval(r.botChatTimer);
        io.to(rc).emit('roomClosed', { message: '방장이 나가서 방이 닫혔습니다.' });
        delete rooms[rc];
        continue;
      }

      r.players = r.players.filter(p => p.id !== socket.id);
      if (r.players.length === 0) {
        if (r.timer) clearInterval(r.timer);
        if (r.botChatTimer) clearInterval(r.botChatTimer);
        delete rooms[rc];
        continue;
      }
      io.to(rc).emit('roomUpdate', r);
    }
  });
});

server.listen(4000, () => console.log('서버 실행 중: http://localhost:4000'));