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
const io = new Server(server, {
  cors: { origin: ['http://localhost:3000', 'https://mafia-game-tawny.vercel.app'], methods: ['GET', 'POST'] }
});

const rooms = {};
let rankings = {};
const quickQueue = [];
let quickRoomCounter = 1;

// Firebase 랭킹 로드
async function loadRankings() {
  try {
    const snapshot = await getDocs(collection(db, 'rankings'));
    snapshot.forEach((docSnap) => { rankings[docSnap.id] = docSnap.data(); });
    console.log('랭킹 불러오기 완료:', Object.keys(rankings).length, '명');
  } catch (err) { console.log('랭킹 불러오기 실패:', err.message); }
}
loadRankings();

async function saveRanking(uid, data) {
  try { await setDoc(doc(db, 'rankings', uid), data); }
  catch (err) { console.log('랭킹 저장 실패:', err.message); }
}

async function saveProfile(uid, data) {
  try { await setDoc(doc(db, 'profiles', uid), data); }
  catch (err) { console.log('프로필 저장 실패:', err.message); }
}

async function getProfile(uid) {
  try {
    const docSnap = await getDoc(doc(db, 'profiles', uid));
    return docSnap.exists() ? docSnap.data() : null;
  } catch (err) { return null; }
}

function assignRoles(players, settings) {
  const { mafiaCount, policeCount, doctorCount } = settings;
  let roles = [];
  for (let i = 0; i < mafiaCount; i++) roles.push('마피아');
  for (let i = 0; i < policeCount; i++) roles.push('경찰');
  for (let i = 0; i < doctorCount; i++) roles.push('의사');
  while (roles.length < players.length) roles.push('시민');
  roles.sort(() => Math.random() - 0.5);
  return players.map((player, i) => ({ ...player, role: roles[i], alive: true }));
}

function checkWin(room) {
  const alive = room.players.filter((p) => p.alive);
  const aliveMafia = alive.filter((p) => p.role === '마피아');
  const aliveCitizens = alive.filter((p) => p.role !== '마피아');
  if (aliveMafia.length === 0) return '시민';
  if (aliveMafia.length >= aliveCitizens.length) return '마피아';
  return null;
}

function sendGameState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  room.players.forEach((player) => {
    io.to(player.id).emit('gameState', {
      phase: room.phase,
      timeLeft: room.timeLeft,
      players: room.players.map((p) => ({
        id: p.id, nickname: p.nickname, emoji: p.emoji, color: p.color,
        alive: p.alive, uid: p.uid,
        role: p.id === player.id ? p.role : null
      })),
      myRole: player.role,
      votes: room.votes || {},
      voteDetails: room.voteDetails || {},
      settings: room.settings
    });
  });
}

function startTimer(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  if (room.timer) clearInterval(room.timer);

  const duration = room.phase === 'day' ? room.settings.dayTime :
                   room.phase === 'vote' ? room.settings.voteTime : room.settings.nightTime;
  room.timeLeft = duration;

  io.to(roomCode).emit('timerUpdate', { timeLeft: room.timeLeft, phase: room.phase });

  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(roomCode).emit('timerUpdate', { timeLeft: room.timeLeft, phase: room.phase });

    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      if (room.phase === 'day') {
        room.phase = 'vote';
        room.votes = {};
        room.voteDetails = {};
        io.to(roomCode).emit('phaseChange', { phase: 'vote', event: 'voteStart' });
        io.to(roomCode).emit('chatMessage', { nickname: '시스템', message: '🗳️ 투표 시간입니다! 마피아로 의심되는 사람을 지목하세요!', type: 'system', emoji: '⚖️' });
        sendGameState(roomCode);
        startTimer(roomCode);
      } else if (room.phase === 'vote') {
        processVotes(roomCode);
      } else if (room.phase === 'night') {
        processNight(roomCode);
      }
    }
  }, 1000);
}

function processVotes(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  const tally = {};
  Object.values(room.votes).forEach((id) => { tally[id] = (tally[id] || 0) + 1; });

  let eliminatedPlayer = null;
  let voteResult = 'none';

  if (Object.keys(tally).length > 0) {
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const topVotes = sorted[0][1];
    const tied = sorted.filter((entry) => entry[1] === topVotes);

    if (tied.length === 1 && topVotes >= 2) {
      eliminatedPlayer = room.players.find((p) => p.id === sorted[0][0]);
      if (eliminatedPlayer) { eliminatedPlayer.alive = false; voteResult = 'eliminated'; }
    } else if (tied.length > 1) { voteResult = 'tie'; }
    else { voteResult = 'noMajority'; }
  }

  room.votes = {};
  room.voteDetails = {};

  const winner = checkWin(room);
  if (winner) { endGame(roomCode, winner); return; }

  room.phase = 'night';
  room.nightActions = {};

  if (voteResult === 'eliminated') {
    io.to(roomCode).emit('phaseChange', { phase: 'night', event: 'eliminated', eliminatedNickname: eliminatedPlayer.nickname, eliminatedEmoji: eliminatedPlayer.emoji });
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '⚖️', message: `${eliminatedPlayer.emoji} ${eliminatedPlayer.nickname} 님이 시민들의 투표로 처형되었습니다.` });
  } else if (voteResult === 'tie') {
    io.to(roomCode).emit('phaseChange', { phase: 'night', event: 'voteTie' });
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '⚖️', message: '투표가 동점입니다! 아무도 처형되지 않았습니다.' });
  } else {
    io.to(roomCode).emit('phaseChange', { phase: 'night', event: 'noVote' });
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '⚖️', message: '충분한 표가 모이지 않았습니다.' });
  }

  io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '🌙', message: '밤이 찾아왔습니다... 마피아가 활동을 시작합니다.' });
  sendGameState(roomCode);
  startTimer(roomCode);
}

function processNight(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  if (room.nightActions['경찰']) {
    const target = room.players.find((p) => p.id === room.nightActions['경찰'].targetId);
    const policePlayer = room.players.find((p) => p.id === room.nightActions['경찰'].actorId);
    if (target && policePlayer) {
      io.to(policePlayer.id).emit('policeResult', { nickname: target.nickname, emoji: target.emoji, role: target.role });
    }
  }

  const mafiaTarget = room.nightActions['마피아']?.targetId;
  const doctorTarget = room.nightActions['의사']?.targetId;
  let killedPlayer = null;
  let wasHealed = false;
  let savedPlayer = null;

  if (mafiaTarget) {
    if (mafiaTarget === doctorTarget) {
      wasHealed = true;
      savedPlayer = room.players.find((p) => p.id === mafiaTarget);
    } else {
      killedPlayer = room.players.find((p) => p.id === mafiaTarget);
      if (killedPlayer) killedPlayer.alive = false;
    }
  }

  room.nightActions = {};
  const winner = checkWin(room);
  if (winner) { endGame(roomCode, winner); return; }

  room.phase = 'day';

  if (killedPlayer) {
    io.to(roomCode).emit('phaseChange', { phase: 'day', event: 'nightKill', killedNickname: killedPlayer.nickname, killedEmoji: killedPlayer.emoji });
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '☀️', message: `${killedPlayer.emoji} ${killedPlayer.nickname} 님이 마피아에 의해 사망했습니다.` });
  } else if (wasHealed) {
    io.to(roomCode).emit('phaseChange', { phase: 'day', event: 'healed', healedNickname: savedPlayer?.nickname, healedEmoji: savedPlayer?.emoji });
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '☀️', message: `의사의 활약으로 ${savedPlayer?.emoji} ${savedPlayer?.nickname} 님이 살아남았습니다!` });
  } else {
    io.to(roomCode).emit('phaseChange', { phase: 'day', event: 'peacefulNight' });
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '☀️', message: '평화로운 밤이었습니다. 아무도 사망하지 않았습니다.' });
  }

  io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '💬', message: '자유롭게 토론하세요!' });
  sendGameState(roomCode);
  startTimer(roomCode);
}

async function endGame(roomCode, winner) {
  const room = rooms[roomCode];
  if (!room) return;
  if (room.timer) clearInterval(room.timer);

  for (const p of room.players) {
    if (!p.uid) continue; // 게스트는 랭킹 저장 안 함

    if (!rankings[p.uid]) {
      rankings[p.uid] = { uid: p.uid, nickname: p.nickname, emoji: p.emoji, color: p.color, score: 0, wins: 0, losses: 0, games: 0 };
    }
    rankings[p.uid].games++;
    rankings[p.uid].nickname = p.nickname;
    rankings[p.uid].emoji = p.emoji;
    rankings[p.uid].color = p.color;

    const isMafia = p.role === '마피아';
    const won = (winner === '마피아' && isMafia) || (winner === '시민' && !isMafia);

    if (won) { rankings[p.uid].wins++; rankings[p.uid].score += isMafia ? 15 : 10; }
    else { rankings[p.uid].losses++; rankings[p.uid].score = Math.max(0, rankings[p.uid].score - 5); }

    await saveRanking(p.uid, rankings[p.uid]);
  }

  if (room.policeCorrect) {
    for (const uid of room.policeCorrect) {
      if (rankings[uid]) { rankings[uid].score += 5; await saveRanking(uid, rankings[uid]); }
    }
  }

  const rankingList = Object.values(rankings).sort((a, b) => b.score - a.score);
  io.to(roomCode).emit('gameOver', { winner, players: room.players, rankings: rankingList });
}

// 퀵매칭 처리
function processQuickQueue() {
  if (quickQueue.length >= 5) {
    const players = quickQueue.splice(0, 5);
    const roomCode = `quick_${quickRoomCounter++}`;
    const settings = { maxPlayers: 10, mafiaCount: 1, policeCount: 1, doctorCount: 1, dayTime: 90, voteTime: 45, nightTime: 45 };

    rooms[roomCode] = {
      players: players.map((p) => ({ id: p.id, nickname: p.nickname, emoji: p.emoji, color: p.color, uid: p.uid, score: 0 })),
      host: players[0].id,
      started: false,
      phase: 'day',
      votes: {},
      voteDetails: {},
      nightActions: {},
      policeCorrect: [],
      settings,
      isQuickMatch: true
    };

    players.forEach((p) => {
      const s = io.sockets.sockets.get(p.id);
      if (s) s.join(roomCode);
    });

    io.to(roomCode).emit('quickMatchFound', { roomCode, players: rooms[roomCode].players, settings });
    io.to(roomCode).emit('roomUpdate', rooms[roomCode]);

    // 퀵매칭은 자동 시작 (5초 후)
    setTimeout(() => {
      const room = rooms[roomCode];
      if (room && !room.started && room.players.length >= 5) {
        const roleCount = Math.max(1, Math.floor(room.players.length / 4));
        room.settings.mafiaCount = roleCount;
        room.started = true;
        room.players = assignRoles(room.players, room.settings);
        room.phase = 'day';
        room.votes = {};
        room.voteDetails = {};
        room.nightActions = {};
        room.policeCorrect = [];

        sendGameState(roomCode);
        io.to(roomCode).emit('chatMessage', { nickname: '시스템', emoji: '🎮', type: 'system', message: '퀵매칭 게임이 시작됩니다! 마피아를 찾아내세요!' });
        startTimer(roomCode);
      }
    }, 5000);
  }
}

io.on('connection', (socket) => {
  console.log('유저 접속:', socket.id);

  // 랭킹 요청
  socket.on('getRankings', () => {
    const rankingList = Object.values(rankings).sort((a, b) => b.score - a.score);
    socket.emit('rankingsList', rankingList);
  });

  // 프로필 저장
  socket.on('saveProfile', async ({ uid, nickname, emoji, color }) => {
    await saveProfile(uid, { uid, nickname, emoji, color });
    socket.emit('profileSaved', { success: true });
  });

  // 프로필 불러오기
  socket.on('getProfile', async ({ uid }) => {
    const profile = await getProfile(uid);
    socket.emit('profileData', profile);
  });

  // 방 만들기 (로그인 유저만)
  socket.on('createRoom', ({ roomCode, nickname, emoji, color, uid, settings }) => {
    if (!uid) { socket.emit('error', '로그인이 필요합니다.'); return; }
    if (rooms[roomCode]) { socket.emit('error', '이미 존재하는 방 코드입니다.'); return; }

    rooms[roomCode] = {
      players: [{ id: socket.id, nickname, emoji, color, uid, score: 0 }],
      host: socket.id,
      started: false,
      phase: 'day',
      votes: {},
      voteDetails: {},
      nightActions: {},
      policeCorrect: [],
      settings: settings || { maxPlayers: 10, mafiaCount: 2, policeCount: 1, doctorCount: 1, dayTime: 90, voteTime: 45, nightTime: 45 }
    };
    socket.join(roomCode);
    io.to(roomCode).emit('roomUpdate', rooms[roomCode]);
  });

  // 방 입장 (게스트도 가능)
  socket.on('joinRoom', ({ roomCode, nickname, emoji, color, uid }) => {
    if (!rooms[roomCode]) { socket.emit('error', '존재하지 않는 방입니다.'); return; }
    if (rooms[roomCode].players.length >= rooms[roomCode].settings.maxPlayers) { socket.emit('error', '방이 꽉 찼습니다.'); return; }
    if (rooms[roomCode].started) { socket.emit('error', '이미 시작된 게임입니다.'); return; }

    rooms[roomCode].players.push({ id: socket.id, nickname, emoji, color, uid: uid || null, score: 0 });
    socket.join(roomCode);
    io.to(roomCode).emit('roomUpdate', rooms[roomCode]);
  });

  // 방장 추방
  socket.on('kickPlayer', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.host !== socket.id) { socket.emit('error', '방장만 추방할 수 있습니다.'); return; }
    if (room.started) { socket.emit('error', '게임 중에는 추방할 수 없습니다.'); return; }
    if (targetId === socket.id) { socket.emit('error', '자기 자신은 추방할 수 없습니다.'); return; }

    const kickedPlayer = room.players.find((p) => p.id === targetId);
    if (!kickedPlayer) return;

    room.players = room.players.filter((p) => p.id !== targetId);
    io.to(targetId).emit('kicked', { message: '방장에 의해 추방되었습니다.' });
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) targetSocket.leave(roomCode);

    io.to(roomCode).emit('roomUpdate', room);
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '🚪', message: `${kickedPlayer.emoji} ${kickedPlayer.nickname} 님이 추방되었습니다.` });
  });

  // 플레이어 정보 요청
  socket.on('getPlayerInfo', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const target = room.players.find((p) => p.id === targetId);
    if (!target) return;

    const rankData = target.uid ? rankings[target.uid] : null;
    socket.emit('playerInfo', {
      nickname: target.nickname,
      emoji: target.emoji,
      color: target.color,
      uid: target.uid,
      isGuest: !target.uid,
      stats: rankData ? { score: rankData.score, wins: rankData.wins, losses: rankData.losses, games: rankData.games } : null
    });
  });

  // 게임 시작
  socket.on('startGame', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.host !== socket.id) { socket.emit('error', '방장만 시작할 수 있습니다.'); return; }
    if (room.players.length < 5) { socket.emit('error', '최소 5명이 필요합니다.'); return; }

    const { mafiaCount, policeCount, doctorCount } = room.settings;
    if (mafiaCount + policeCount + doctorCount >= room.players.length) {
      socket.emit('error', '역할 수가 너무 많습니다!'); return;
    }

    room.started = true;
    room.players = assignRoles(room.players, room.settings);
    room.phase = 'day';
    room.votes = {};
    room.voteDetails = {};
    room.nightActions = {};
    room.policeCorrect = [];

    sendGameState(roomCode);
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', emoji: '🎮', type: 'system', message: '게임이 시작되었습니다! 마피아를 찾아내세요!' });
    startTimer(roomCode);
  });

  // 채팅
  socket.on('chatMessage', ({ roomCode, message }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const me = room.players.find((p) => p.id === socket.id);
    if (!me) return;

    if (room.phase === 'night') {
      if (me.role === '마피아') {
        room.players.filter((p) => p.role === '마피아').forEach((p) => {
          io.to(p.id).emit('chatMessage', { nickname: me.nickname, message, type: 'mafia', emoji: me.emoji });
        });
      }
      return;
    }
    if (!me.alive) return;
    io.to(roomCode).emit('chatMessage', { nickname: me.nickname, message, type: 'normal', emoji: me.emoji });
  });

  // 투표
  socket.on('vote', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.phase !== 'vote') return;
    const me = room.players.find((p) => p.id === socket.id);
    if (!me || !me.alive) return;

    room.votes[socket.id] = targetId;
    room.voteDetails[socket.id] = { voterId: socket.id, voterNickname: me.nickname, voterEmoji: me.emoji, voterColor: me.color, targetId };

    const alivePlayers = room.players.filter((p) => p.alive);
    io.to(roomCode).emit('voteUpdate', { votes: room.votes, voteDetails: room.voteDetails, voteCount: Object.keys(room.votes).length, total: alivePlayers.length });
    io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '🗳️', message: `${me.emoji} ${me.nickname} 님이 투표했습니다.` });

    if (Object.keys(room.votes).length >= alivePlayers.length) {
      if (room.timer) clearInterval(room.timer);
      processVotes(roomCode);
    }
  });

  // 밤 행동
  socket.on('nightAction', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.phase !== 'night') return;
    const me = room.players.find((p) => p.id === socket.id);
    if (!me || !me.alive) return;

    room.nightActions[me.role] = { actorId: socket.id, targetId };

    if (me.role === '경찰') {
      const target = room.players.find((p) => p.id === targetId);
      if (target) {
        io.to(socket.id).emit('policeResult', { nickname: target.nickname, emoji: target.emoji, role: target.role });
        if (target.role === '마피아') {
          if (!room.policeCorrect) room.policeCorrect = [];
          room.policeCorrect.push(me.uid || me.nickname);
        }
      }
    }

    const aliveDoctor = room.players.filter((p) => p.alive && p.role === '의사');
    const alivePolice = room.players.filter((p) => p.alive && p.role === '경찰');
    const mafiaActed = room.nightActions['마피아'];
    const doctorActed = aliveDoctor.length === 0 || room.nightActions['의사'];
    const policeActed = alivePolice.length === 0 || room.nightActions['경찰'];

    if (mafiaActed && doctorActed && policeActed) {
      if (room.timer) clearInterval(room.timer);
      processNight(roomCode);
    }
  });

  // 퀵매칭
  socket.on('quickMatch', ({ nickname, emoji, color, uid }) => {
    if (!uid) { socket.emit('error', '로그인이 필요합니다.'); return; }

    // 이미 큐에 있는지 확인
    const already = quickQueue.find((p) => p.id === socket.id);
    if (already) { socket.emit('error', '이미 매칭 중입니다.'); return; }

    quickQueue.push({ id: socket.id, nickname, emoji, color, uid });
    socket.emit('quickMatchStatus', { status: 'waiting', position: quickQueue.length, needed: 5 });

    // 큐에 있는 모든 사람에게 현황 알림
    quickQueue.forEach((p) => {
      io.to(p.id).emit('quickMatchStatus', { status: 'waiting', position: quickQueue.length, needed: 5 });
    });

    processQuickQueue();
  });

  // 퀵매칭 취소
  socket.on('cancelQuickMatch', () => {
    const idx = quickQueue.findIndex((p) => p.id === socket.id);
    if (idx !== -1) {
      quickQueue.splice(idx, 1);
      socket.emit('quickMatchStatus', { status: 'cancelled' });

      quickQueue.forEach((p) => {
        io.to(p.id).emit('quickMatchStatus', { status: 'waiting', position: quickQueue.length, needed: 5 });
      });
    }
  });

  // 연결 끊김
  socket.on('disconnect', () => {
    // 퀵매칭 큐에서 제거
    const qIdx = quickQueue.findIndex((p) => p.id === socket.id);
    if (qIdx !== -1) quickQueue.splice(qIdx, 1);

    for (const roomCode in rooms) {
      if (!rooms[roomCode]) continue;
      const room = rooms[roomCode];
      const wasHost = room.host === socket.id;

      room.players = room.players.filter((p) => p.id !== socket.id);

      // 방이 비면 삭제
      if (room.players.length === 0) {
        if (room.timer) clearInterval(room.timer);
        delete rooms[roomCode];
        continue;
      }

      // 방장이 나가면 다음 사람이 방장
      if (wasHost && room.players.length > 0) {
        room.host = room.players[0].id;
        io.to(roomCode).emit('chatMessage', { nickname: '시스템', type: 'system', emoji: '👑', message: `${room.players[0].emoji} ${room.players[0].nickname} 님이 새 방장이 되었습니다.` });
      }

      io.to(roomCode).emit('roomUpdate', room);
    }
  });
});

app.get('/rankings', (req, res) => {
  const list = Object.values(rankings).sort((a, b) => b.score - a.score);
  res.json(list);
});

server.listen(4000, () => {
  console.log('서버 실행 중: http://localhost:4000');
});