const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Firebase 설정
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, getDocs, collection } = require('firebase/firestore');

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

// 서버 시작할 때 Firebase에서 랭킹 불러오기
async function loadRankings() {
  try {
    const snapshot = await getDocs(collection(db, 'rankings'));
    snapshot.forEach((docSnap) => {
      rankings[docSnap.id] = docSnap.data();
    });
    console.log('랭킹 불러오기 완료:', Object.keys(rankings).length, '명');
  } catch (err) {
    console.log('랭킹 불러오기 실패:', err.message);
  }
}
loadRankings();

// Firebase에 랭킹 저장
async function saveRanking(nickname, data) {
  try {
    await setDoc(doc(db, 'rankings', nickname), data);
  } catch (err) {
    console.log('랭킹 저장 실패:', err.message);
  }
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
  room.players.forEach((player) => {
    io.to(player.id).emit('gameState', {
      phase: room.phase,
      timeLeft: room.timeLeft,
      players: room.players.map((p) => ({
        id: p.id, nickname: p.nickname, emoji: p.emoji, color: p.color, alive: p.alive,
        role: p.id === player.id ? p.role : null
      })),
      myRole: player.role,
      votes: room.votes || {},
      settings: room.settings
    });
  });
}

function startTimer(roomCode) {
  const room = rooms[roomCode];
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
        io.to(roomCode).emit('phaseChange', { phase: 'vote' });
        io.to(roomCode).emit('chatMessage', { nickname: '시스템', message: '🗳️ 투표 시간! 마피아를 지목하세요!', type: 'system', emoji: '🎮' });
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
  const tally = {};
  Object.values(room.votes).forEach((id) => { tally[id] = (tally[id] || 0) + 1; });

  let eliminatedPlayer = null;
  if (Object.keys(tally).length > 0) {
    const eliminated = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    eliminatedPlayer = room.players.find((p) => p.id === eliminated);
    if (eliminatedPlayer) eliminatedPlayer.alive = false;
  }

  room.votes = {};
  const winner = checkWin(room);
  if (winner) { endGame(roomCode, winner); return; }

  room.phase = 'night';
  room.nightActions = {};
  io.to(roomCode).emit('phaseChange', { phase: 'night', eliminatedNickname: eliminatedPlayer?.nickname });
  io.to(roomCode).emit('chatMessage', {
    nickname: '시스템', type: 'system', emoji: '🎮',
    message: eliminatedPlayer ? `🌙 밤이 되었습니다. ${eliminatedPlayer.nickname} 님이 처형되었습니다!` : '🌙 밤이 되었습니다. 아무도 처형되지 않았습니다!'
  });
  sendGameState(roomCode);
  startTimer(roomCode);
}

function processNight(roomCode) {
  const room = rooms[roomCode];

  if (room.nightActions['경찰']) {
    const target = room.players.find((p) => p.id === room.nightActions['경찰'].targetId);
    const policePlayer = room.players.find((p) => p.id === room.nightActions['경찰'].actorId);
    if (target && policePlayer) {
      io.to(policePlayer.id).emit('policeResult', { nickname: target.nickname, role: target.role });
    }
  }

  const mafiaTarget = room.nightActions['마피아']?.targetId;
  const doctorTarget = room.nightActions['의사']?.targetId;
  let killedNickname = null;

  if (mafiaTarget && mafiaTarget !== doctorTarget) {
    const killed = room.players.find((p) => p.id === mafiaTarget);
    if (killed) { killed.alive = false; killedNickname = killed.nickname; }
  }

  room.nightActions = {};
  const winner = checkWin(room);
  if (winner) { endGame(roomCode, winner); return; }

  room.phase = 'day';
  io.to(roomCode).emit('phaseChange', { phase: 'day', killedNickname });
  io.to(roomCode).emit('chatMessage', {
    nickname: '시스템', type: 'system', emoji: '🎮',
    message: killedNickname ? `☀️ 낮이 되었습니다. 밤 사이 ${killedNickname} 님이 사망했습니다!` : '☀️ 낮이 되었습니다. 아무도 사망하지 않았습니다!'
  });
  sendGameState(roomCode);
  startTimer(roomCode);
}

async function endGame(roomCode, winner) {
  const room = rooms[roomCode];
  if (room.timer) clearInterval(room.timer);

  // 점수 계산 + Firebase 저장
  for (const p of room.players) {
    if (!rankings[p.nickname]) {
      rankings[p.nickname] = { nickname: p.nickname, emoji: p.emoji, color: p.color, score: 0, wins: 0, losses: 0, games: 0 };
    }
    rankings[p.nickname].games++;
    rankings[p.nickname].emoji = p.emoji;
    rankings[p.nickname].color = p.color;

    const isMafia = p.role === '마피아';
    const won = (winner === '마피아' && isMafia) || (winner === '시민' && !isMafia);

    if (won) {
      rankings[p.nickname].wins++;
      rankings[p.nickname].score += isMafia ? 15 : 10;
    } else {
      rankings[p.nickname].losses++;
      rankings[p.nickname].score = Math.max(0, rankings[p.nickname].score - 5);
    }

    // Firebase에 저장
    await saveRanking(p.nickname, rankings[p.nickname]);
  }

  // 경찰 보너스
  if (room.policeCorrect) {
    for (const nickname of room.policeCorrect) {
      if (rankings[nickname]) {
        rankings[nickname].score += 5;
        await saveRanking(nickname, rankings[nickname]);
      }
    }
  }

  const rankingList = Object.values(rankings).sort((a, b) => b.score - a.score);
  io.to(roomCode).emit('gameOver', { winner, players: room.players, rankings: rankingList });
}

io.on('connection', (socket) => {
  console.log('유저 접속:', socket.id);

  socket.on('createRoom', ({ roomCode, nickname, emoji, color, settings }) => {
    rooms[roomCode] = {
      players: [{ id: socket.id, nickname, emoji, color, score: 0 }],
      host: socket.id,
      started: false,
      phase: 'day',
      votes: {},
      nightActions: {},
      policeCorrect: [],
      settings: settings || {
        maxPlayers: 10, mafiaCount: 2, policeCount: 1, doctorCount: 1,
        dayTime: 90, voteTime: 45, nightTime: 45
      }
    };
    socket.join(roomCode);
    io.to(roomCode).emit('roomUpdate', rooms[roomCode]);
  });

  socket.on('joinRoom', ({ roomCode, nickname, emoji, color }) => {
    if (!rooms[roomCode]) { socket.emit('error', '존재하지 않는 방입니다.'); return; }
    if (rooms[roomCode].players.length >= rooms[roomCode].settings.maxPlayers) { socket.emit('error', '방이 꽉 찼습니다.'); return; }
    if (rooms[roomCode].started) { socket.emit('error', '이미 시작된 게임입니다.'); return; }
    rooms[roomCode].players.push({ id: socket.id, nickname, emoji, color, score: 0 });
    socket.join(roomCode);
    io.to(roomCode).emit('roomUpdate', rooms[roomCode]);
  });

  socket.on('startGame', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.host !== socket.id) { socket.emit('error', '방장만 시작할 수 있습니다.'); return; }
    if (room.players.length < 5) { socket.emit('error', '최소 5명이 필요합니다.'); return; }

    const { mafiaCount, policeCount, doctorCount } = room.settings;
    if (mafiaCount + policeCount + doctorCount >= room.players.length) {
      socket.emit('error', '역할 수가 너무 많습니다. 시민이 최소 1명은 있어야 해요!'); return;
    }

    room.started = true;
    room.players = assignRoles(room.players, room.settings);
    room.phase = 'day';
    room.votes = {};
    room.nightActions = {};
    room.policeCorrect = [];

    sendGameState(roomCode);
    io.to(roomCode).emit('chatMessage', {
      nickname: '시스템', message: '☀️ 게임이 시작되었습니다! 마피아를 찾아내세요!', type: 'system', emoji: '🎮'
    });
    startTimer(roomCode);
  });

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

  socket.on('vote', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.phase !== 'vote') return;
    room.votes[socket.id] = targetId;
    const alivePlayers = room.players.filter((p) => p.alive);
    io.to(roomCode).emit('voteUpdate', { votes: room.votes });

    if (Object.keys(room.votes).length >= alivePlayers.length) {
      if (room.timer) clearInterval(room.timer);
      processVotes(roomCode);
    }
  });

  socket.on('nightAction', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.phase !== 'night') return;
    const me = room.players.find((p) => p.id === socket.id);
    if (!me || !me.alive) return;

    room.nightActions[me.role] = { actorId: socket.id, targetId };

    if (me.role === '경찰') {
      const target = room.players.find((p) => p.id === targetId);
      if (target) {
        io.to(socket.id).emit('policeResult', { nickname: target.nickname, role: target.role });
        if (target.role === '마피아') {
          if (!room.policeCorrect) room.policeCorrect = [];
          room.policeCorrect.push(me.nickname);
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

  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      if (!rooms[roomCode]) continue;
      rooms[roomCode].players = rooms[roomCode].players.filter((p) => p.id !== socket.id);
      io.to(roomCode).emit('roomUpdate', rooms[roomCode]);
    }
  });
});

app.get('/rankings', async (req, res) => {
  const list = Object.values(rankings).sort((a, b) => b.score - a.score);
  res.json(list);
});

server.listen(4000, () => {
  console.log('서버 실행 중: http://localhost:4000');
});