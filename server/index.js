const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

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

async function loadRankings() {
  try {
    const snapshot = await getDocs(collection(db, 'rankings'));
    snapshot.forEach((docSnap) => { rankings[docSnap.id] = docSnap.data(); });
    console.log('랭킹 불러오기 완료:', Object.keys(rankings).length, '명');
  } catch (err) { console.log('랭킹 불러오기 실패:', err.message); }
}
loadRankings();

async function saveRanking(nickname, data) {
  try { await setDoc(doc(db, 'rankings', nickname), data); }
  catch (err) { console.log('랭킹 저장 실패:', err.message); }
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
      voteDetails: room.voteDetails || {},
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
  const tally = {};
  Object.values(room.votes).forEach((id) => { tally[id] = (tally[id] || 0) + 1; });

  let eliminatedPlayer = null;
  let voteResult = 'none';

  if (Object.keys(tally).length > 0) {
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const topVotes = sorted[0][1];

    // 동점이면 아무도 안 죽음
    const tied = sorted.filter((entry) => entry[1] === topVotes);

    if (tied.length === 1 && topVotes >= 2) {
      // 1명만 최다 득표 + 2표 이상이면 처형
      eliminatedPlayer = room.players.find((p) => p.id === sorted[0][0]);
      if (eliminatedPlayer) {
        eliminatedPlayer.alive = false;
        voteResult = 'eliminated';
      }
    } else if (tied.length > 1) {
      voteResult = 'tie';
    } else {
      voteResult = 'noMajority';
    }
  }

  room.votes = {};
  room.voteDetails = {};

  const winner = checkWin(room);
  if (winner) { endGame(roomCode, winner); return; }

  room.phase = 'night';
  room.nightActions = {};

  if (voteResult === 'eliminated') {
    io.to(roomCode).emit('phaseChange', {
      phase: 'night',
      event: 'eliminated',
      eliminatedNickname: eliminatedPlayer.nickname,
      eliminatedEmoji: eliminatedPlayer.emoji
    });
    io.to(roomCode).emit('chatMessage', {
      nickname: '시스템', type: 'system', emoji: '⚖️',
      message: `${eliminatedPlayer.emoji} ${eliminatedPlayer.nickname} 님이 시민들의 투표로 처형되었습니다... 과연 마피아였을까요?`
    });
  } else if (voteResult === 'tie') {
    io.to(roomCode).emit('phaseChange', {
      phase: 'night',
      event: 'voteTie'
    });
    io.to(roomCode).emit('chatMessage', {
      nickname: '시스템', type: 'system', emoji: '⚖️',
      message: '투표가 동점입니다! 아무도 처형되지 않았습니다.'
    });
  } else {
    io.to(roomCode).emit('phaseChange', {
      phase: 'night',
      event: 'noVote'
    });
    io.to(roomCode).emit('chatMessage', {
      nickname: '시스템', type: 'system', emoji: '⚖️',
      message: '충분한 표가 모이지 않았습니다. 아무도 처형되지 않았습니다.'
    });
  }

  io.to(roomCode).emit('chatMessage', {
    nickname: '시스템', type: 'system', emoji: '🌙',
    message: '밤이 찾아왔습니다... 마피아가 활동을 시작합니다. 모두 조심하세요!'
  });

  sendGameState(roomCode);
  startTimer(roomCode);
}

function processNight(roomCode) {
  const room = rooms[roomCode];

  // 경찰 조사 결과
  if (room.nightActions['경찰']) {
    const target = room.players.find((p) => p.id === room.nightActions['경찰'].targetId);
    const policePlayer = room.players.find((p) => p.id === room.nightActions['경찰'].actorId);
    if (target && policePlayer) {
      io.to(policePlayer.id).emit('policeResult', {
        nickname: target.nickname,
        emoji: target.emoji,
        role: target.role
      });
    }
  }

  const mafiaTarget = room.nightActions['마피아']?.targetId;
  const doctorTarget = room.nightActions['의사']?.targetId;
  let killedPlayer = null;
  let savedPlayer = null;
  let wasHealed = false;

  if (mafiaTarget) {
    if (mafiaTarget === doctorTarget) {
      // 의사가 살림
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
    io.to(roomCode).emit('phaseChange', {
      phase: 'day',
      event: 'nightKill',
      killedNickname: killedPlayer.nickname,
      killedEmoji: killedPlayer.emoji
    });
    io.to(roomCode).emit('chatMessage', {
      nickname: '시스템', type: 'system', emoji: '☀️',
      message: `날이 밝았습니다... 하지만 비극이 일어났습니다. ${killedPlayer.emoji} ${killedPlayer.nickname} 님이 밤 사이 마피아에 의해 사망했습니다.`
    });
  } else if (wasHealed) {
    io.to(roomCode).emit('phaseChange', {
      phase: 'day',
      event: 'healed',
      healedNickname: savedPlayer?.nickname,
      healedEmoji: savedPlayer?.emoji
    });
    io.to(roomCode).emit('chatMessage', {
      nickname: '시스템', type: 'system', emoji: '☀️',
      message: `날이 밝았습니다! 의사의 활약으로 ${savedPlayer?.emoji} ${savedPlayer?.nickname} 님이 마피아의 공격에서 살아남았습니다!`
    });
  } else {
    io.to(roomCode).emit('phaseChange', {
      phase: 'day',
      event: 'peacefulNight'
    });
    io.to(roomCode).emit('chatMessage', {
      nickname: '시스템', type: 'system', emoji: '☀️',
      message: '날이 밝았습니다. 평화로운 밤이었습니다... 아무도 사망하지 않았습니다.'
    });
  }

  io.to(roomCode).emit('chatMessage', {
    nickname: '시스템', type: 'system', emoji: '💬',
    message: '자유롭게 토론하세요! 마피아는 누구일까요?'
  });

  sendGameState(roomCode);
  startTimer(roomCode);
}

async function endGame(roomCode, winner) {
  const room = rooms[roomCode];
  if (room.timer) clearInterval(room.timer);

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

    await saveRanking(p.nickname, rankings[p.nickname]);
  }

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

  // 랭킹 요청
  socket.on('getRankings', () => {
    const rankingList = Object.values(rankings).sort((a, b) => b.score - a.score);
    socket.emit('rankingsList', rankingList);
  });

  socket.on('createRoom', ({ roomCode, nickname, emoji, color, settings }) => {
    rooms[roomCode] = {
      players: [{ id: socket.id, nickname, emoji, color, score: 0 }],
      host: socket.id,
      started: false,
      phase: 'day',
      votes: {},
      voteDetails: {},
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
    io.to(roomCode).emit('chatMessage', {
      nickname: '시스템', emoji: '🎮', type: 'system',
      message: '게임이 시작되었습니다! 마피아가 시민들 사이에 숨어있습니다... 대화를 통해 마피아를 찾아내세요!'
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
    const me = room.players.find((p) => p.id === socket.id);
    if (!me || !me.alive) return;

    room.votes[socket.id] = targetId;
    room.voteDetails[socket.id] = {
      voterId: socket.id,
      voterNickname: me.nickname,
      voterEmoji: me.emoji,
      voterColor: me.color,
      targetId: targetId
    };

    const alivePlayers = room.players.filter((p) => p.alive);
    io.to(roomCode).emit('voteUpdate', {
      votes: room.votes,
      voteDetails: room.voteDetails,
      voteCount: Object.keys(room.votes).length,
      total: alivePlayers.length
    });

    // 투표한 사람 알림
    const target = room.players.find((p) => p.id === targetId);
    io.to(roomCode).emit('chatMessage', {
      nickname: '시스템', type: 'system', emoji: '🗳️',
      message: `${me.emoji} ${me.nickname} 님이 투표했습니다.`
    });

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
        io.to(socket.id).emit('policeResult', { nickname: target.nickname, emoji: target.emoji, role: target.role });
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

app.get('/rankings', (req, res) => {
  const list = Object.values(rankings).sort((a, b) => b.score - a.score);
  res.json(list);
});

server.listen(4000, () => {
  console.log('서버 실행 중: http://localhost:4000');
});