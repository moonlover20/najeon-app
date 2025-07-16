// auction-server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const playerImageMap = {
'봉식': 'https://i.imgur.com/jAOM4DY.png',
 '광천김': 'https://i.imgur.com/WtwHTSl.png',
'도민': 'https://i.imgur.com/j2Xh5Y4.png',
 '나무': 'https://i.imgur.com/UxqRCty.png',
'훈상태': 'https://i.imgur.com/LtkorXo.png',
'미주': 'https://i.imgur.com/25NaMwd.png',
'승우': 'https://i.imgur.com/4C3FJR9.png',
'대파': 'https://i.imgur.com/XVm03so.png',
'타포': 'https://i.imgur.com/F0pD7Eu.png',
'노잭': 'https://i.imgur.com/v1AB76A.png',
'바나나': 'https://i.imgur.com/VlvHwEm.png',
'현진': 'https://i.imgur.com/C34RNMz.png',
'박제인간': 'https://i.imgur.com/e0vpsmw.png',
'키죠': 'https://i.imgur.com/oU6CMxm.png',
'러라': 'https://i.imgur.com/97CZj3Y.png',
'까치': 'https://i.imgur.com/bp8R3xi.png',
'재민': 'https://i.imgur.com/9MCbrib.png',
'케케로': 'https://i.imgur.com/2jPJ5iK.png',
'블페러': 'https://i.imgur.com/2uIczlY.png',
'양갱': 'https://i.imgur.com/sOpLidA.png',
'강조이': 'https://i.imgur.com/jGz4gfX.png',
'르블이': 'https://i.imgur.com/IeUn4BK.png',
'말대모': 'https://i.imgur.com/fYlj1vU.png',
'장수풍뎅이': 'https://i.imgur.com/pOQBcBM.png',
'케터': 'https://i.imgur.com/qFWJkmr.png',
'러부엉': 'https://i.imgur.com/L3z4Xm4.png',
'대림': 'https://i.imgur.com/EDgw7qa.png',
'각반': 'https://i.imgur.com/zdK62dW.png',
'라포': 'https://i.imgur.com/V6D2A5F.png',
'견습생': 'https://i.imgur.com/EV5W8Aj.png',
};
// 더미 데이터: 실제로는 DB나 시트에서 불러오면 됨
const teamNames = ['엄소지', '견습생', '자잘자', '러부엉', ];
let auctionInterval = null;
let teamPoints = { 엄소지: 1000, 견습생: 1000, 자잘자: 1000, 러부엉: 1000 };
let pickedPlayers = [];
let failedPlayers = [];
let playerList = [
  { name: '김대파' },
  { name: '봉식' },
  { name: '바나나' },
  { name: '미주' },
  { name: '도민' },
  { name: '하루마룬' },
  { name: '박제' },
  { name: '타포' },
  { name: '광천김' },
  { name: '현진' },
  { name: '양갱' },
  { name: '성당' },
  { name: '재민' },
  { name: '키죠' },
  { name: '번검' },
  { name: '케케로' },


];
let teamRoster = {
  엄소지: [],
  견습생: [],
  자잘자: [],
  러부엉: [],

};

let auctionState = {
  currentPlayer: null,      // 뽑힌 플레이어 닉네임
  currentBid: 0,
  currentTeam: null,
  timer: 30,
  isRunning: false,
  history: [],
  fullHistory: [],          // 전체 입찰 이력 (표용)
};

// 정적 파일 서비스
app.use(express.static('public'));

// 실시간 통신
io.on('connection', (socket) => {
  // 최초 접속시 전체 데이터 전달
  socket.emit('init', {
    teamNames,
    teamPoints,
    playerList,
    auctionState,
    pickedPlayers,
    failedPlayers,
 playerImageMap, 
  });
  socket.on('setPlayerStatus', ({ name, status }) => {
    // 1. 이름이 있으면 picked, failed 모두에서 제거
    pickedPlayers = pickedPlayers.filter(n => n !== name);
    failedPlayers = failedPlayers.filter(n => n !== name);

    // 2. 상태에 따라 배열에 넣기
    if (status === 'picked') pickedPlayers.push(name);
    else if (status === 'failed') failedPlayers.push(name);
    // (status가 'default'면 어디에도 안넣음 = 검은색)

    // 모든 클라이언트에게 최신 상태 전송
    io.emit('updatePlayers', { pickedPlayers, failedPlayers });
  });
  socket.on('clearHistory', () => {
    // 관리자 인증 있으면 여기서 확인 가능
    auctionState.fullHistory = [];
    auctionState.history = [];
    io.emit('updateHistory', auctionState.fullHistory);
  });
  socket.on('chatMessage', ({ team, name, message }) => {
    // 모든 클라이언트에 브로드캐스트 (팀명, 메시지, 타임스탬프 포함)
    io.emit('chatMessage', {
      team,
      name,
      message,
      timestamp: Date.now(),
    });
  });
socket.on('setTeamPoints', ({ team, point }) => {
  if (!teamNames.includes(team)) return;
  if (typeof point !== "number" || point < 0) return;
  teamPoints[team] = point;
  io.emit('updatePoints', teamPoints);
});
  // 새 유저에게 전체 실시간 상태 전송
  socket.on('getState', () => {
    socket.emit('init', {
      teamNames,
      teamPoints,
      playerList,
      auctionState,
      pickedPlayers,
      failedPlayers,
 playerImageMap,
    });
  });

  // 일반 뽑기
  socket.on('normalPick', () => {
    // 뽑히지 않고 실패하지 않은 선수 목록 필터링
    const availablePlayers = playerList.filter(p => 
      !pickedPlayers.includes(p.name) && !failedPlayers.includes(p.name)
    );

    if (availablePlayers.length === 0) {
      // 더 뽑을 선수 없음
      socket.emit('normalPickResult', { name: null, message: '더 이상 뽑을 선수가 없습니다.' });
      return;
    }

    // 랜덤으로 한 명 뽑기
    const picked = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];

    // 뽑힌 선수 이름 클라이언트에 전달
io.emit('normalPickResult', {
  name: picked.name,
  image: playerImageMap[picked.name] || null,
});
});

  // 경매 시작 (관리자만)
// startAuction 이벤트
socket.on('startAuction', (playerName) => {
  if (auctionState.isRunning) return;
  if (!playerName) {
    socket.emit('error', '경매 시작할 선수가 지정되어 있지 않습니다.');
    return;
  }
  auctionState.currentPlayer = playerName;
  auctionState.currentBid = 0;
  auctionState.currentTeam = null;
  auctionState.timer = 20;
  auctionState.isRunning = true;
  auctionState.history = [];
  io.emit('auctionStarted', { ...auctionState });

  if (auctionInterval) clearInterval(auctionInterval);

  auctionInterval = setInterval(() => {
    auctionState.timer--;
    io.emit('timer', auctionState.timer);

if (auctionState.timer <= 0 || !auctionState.isRunning) {
  clearInterval(auctionInterval);
  auctionState.isRunning = false;

  if (auctionState.currentBid > 0 && auctionState.currentTeam) {
    // 자동 낙찰 처리
    teamPoints[auctionState.currentTeam] -= auctionState.currentBid;
    
    // 👇 [추가!] 팀원 목록에 자동 추가 (최대 4명까지)
    if (!teamRoster[auctionState.currentTeam].includes(auctionState.currentPlayer) && teamRoster[auctionState.currentTeam].length < 4) {
      teamRoster[auctionState.currentTeam].push(auctionState.currentPlayer);
    }
    // 👆

    auctionState.fullHistory.push({
      team: auctionState.currentTeam,
      player: auctionState.currentPlayer,
      bid: auctionState.currentBid,
    });

    io.emit('updatePoints', teamPoints);
    io.emit('updateRoster', teamRoster); // 👈 [추가] 표 갱신용
  } else {
    // 자동 유찰 처리
    pickedPlayers = pickedPlayers.filter(n => n !== auctionState.currentPlayer);  // 뽑힘 목록에서 제거
    if (!failedPlayers.includes(auctionState.currentPlayer)) {
      failedPlayers.push(auctionState.currentPlayer);
    }
    io.emit('updatePlayers', { pickedPlayers, failedPlayers });
  }

  io.emit('auctionEnded', { ...auctionState, history: auctionState.fullHistory });
  io.emit('updateHistory', auctionState.fullHistory);
}

  }, 1000);
});

// bid 이벤트
socket.on('bid', ({ team, bid }) => {
  if (!auctionState.isRunning) {
    socket.emit('bidResult', { success: false, message: '경매가 시작되지 않았습니다.' });
    return;
  }
  if (!teamNames.includes(team)) {
    socket.emit('bidResult', { success: false, message: '유효하지 않은 팀입니다.' });
    return;
  }

  // 5포인트 단위로만 입찰 허용!
  if (bid % 5 !== 0) {
    socket.emit('bidResult', { success: false, message: '입찰은 5포인트 단위로만 가능합니다.' });
    return;
  }
  if (bid > auctionState.currentBid && bid <= teamPoints[team]) {
    auctionState.currentBid = bid;
    auctionState.currentTeam = team;
    auctionState.history.push({ team, player: auctionState.currentPlayer, bid });  // ← player 정보도 함께

    // 타이머를 초기화만 함(20초로)
    auctionState.timer = 20;
    io.emit('timer', auctionState.timer);

    // **여기서 setInterval 다시 생성하지 말 것**

    io.emit('newBid', { team, bid, history: auctionState.history });
    socket.emit('bidResult', { success: true, message: '입찰에 성공했습니다!' });
  } else {
    socket.emit('bidResult', { success: false, message: '입찰가가 현재 입찰가보다 낮거나 잔여 포인트가 부족합니다.' });
  }
});
// 팀별 선수 제거 (관리자)
socket.on('removePlayerFromTeam', ({ team, name }) => {
  if (!teamRoster[team]) return;
  teamRoster[team] = teamRoster[team].filter(nick => nick !== name);
  io.emit('updateRoster', teamRoster);
});



  // 낙찰 (관리자만)
socket.on('confirmAuction', () => {
  if (!auctionState.isRunning) return;
  if (auctionState.currentTeam && auctionState.currentBid > 0) {
    // 팀 포인트 차감
    teamPoints[auctionState.currentTeam] -= auctionState.currentBid;
    // [추가!] 닉네임 팀 목록에 추가
    if (!teamRoster[auctionState.currentTeam].includes(auctionState.currentPlayer)) {
      teamRoster[auctionState.currentTeam].push(auctionState.currentPlayer);
    }
    auctionState.fullHistory.push({
      team: auctionState.currentTeam,
      player: auctionState.currentPlayer,
      bid: auctionState.currentBid
    });
  }
  auctionState.isRunning = false;
  io.emit('auctionEnded', { ...auctionState });
  io.emit('updatePoints', teamPoints);
  io.emit('updateHistory', auctionState.fullHistory);
  io.emit('updateRoster', teamRoster); // 추가! 클라이언트에 roster 보내기
});

// 서버가 초기화할 때도 함께 전송
socket.emit('init', {
  teamNames,
  teamPoints,
  playerList,
  auctionState,
  pickedPlayers,
  failedPlayers,
  teamRoster, // 추가!
});



});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버 실행중: http://localhost:${PORT}`);
});
