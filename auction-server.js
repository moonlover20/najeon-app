// auction-server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 더미 데이터: 실제로는 DB나 시트에서 불러오면 됨
const teamNames = ['각반', '대림', '말대모', '러부엉', '양갱', '블페러'];
let teamPoints = { 각반: 850, 대림: 900, 말대모: 900, 러부엉: 950, 양갱: 1000, 블페러: 1000 };
let pickedPlayers = [];
let failedPlayers = [];
let playerList = [
  { name: '견습생', tier: 'M', pos: '정글' },
  { name: '케터', tier: 'M', pos: '미드' },
  { name: '장수풍뎅이', tier: 'M', pos: '정글' },
  { name: '르블이', tier: 'M', pos: '미드' },
  { name: '라포', tier: 'M', pos: '탑' },
  { name: '케케로', tier: 'D', pos: '탑' },
  { name: '강조이', tier: 'D', pos: '미드' },
  { name: '재민', tier: 'D', pos: '탑' },
  { name: '까치', tier: 'E', pos: '정글' },
  { name: '러라', tier: 'E', pos: '서폿' },
  { name: '박제인간', tier: 'E', pos: '정글' },
  { name: '키죠', tier: 'E', pos: '원딜' },
  { name: '현진', tier: 'E', pos: '탑' },
  { name: '바나나', tier: 'P', pos: '탑' },
  { name: '노잭', tier: 'P', pos: '서폿' },
  { name: '봉식', tier: 'P', pos: '서폿' },
  { name: '타포', tier: 'P', pos: '원딜' },
  { name: '대파', tier: 'P', pos: '원딜' },
  { name: '승우', tier: 'P', pos: '원딜' },
  { name: '미주', tier: 'S', pos: '서폿' },
  { name: '훈상태', tier: 'S', pos: '탑' },
  { name: '나무', tier: 'S', pos: '미드' },
  { name: '광천김', tier: 'B', pos: '탑' },
  { name: '도민', tier: 'I', pos: '서폿' },
];

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
    if (!pickedPlayers.includes(picked.name)) {
  pickedPlayers.push(picked.name);
}


    // 뽑힌 선수 이름 클라이언트에 전달
    io.emit('normalPickResult', { name: picked.name });
  });

  // 경매 시작 (관리자만)
socket.on('startAuction', (playerName) => {
  console.log('경매 시작 요청 선수:', playerName);  // 로그 추가
  if (auctionState.isRunning) return;

  if (!playerName) {
    socket.emit('error', '경매 시작할 선수가 지정되어 있지 않습니다.');
    return;
  }
  auctionState.currentPlayer = playerName;
    auctionState.currentBid = 0;
    auctionState.currentTeam = null;
    auctionState.timer = 30;
    auctionState.isRunning = true;
    auctionState.history = [];
    io.emit('auctionStarted', { ...auctionState });

    // 타이머 시작
    let interval = setInterval(() => {
      auctionState.timer--;
      io.emit('timer', auctionState.timer);
      if (auctionState.timer <= 0 || !auctionState.isRunning) {
        clearInterval(interval);
        auctionState.isRunning = false;
        io.emit('auctionEnded', { ...auctionState });
      }
    }, 1000);
  });

  // 입찰 (팀장만)
  socket.on('bid', ({ team, bid }) => {
    if (!auctionState.isRunning) return;
    if (!teamNames.includes(team)) return;
    if (bid > auctionState.currentBid && bid <= teamPoints[team]) {
      auctionState.currentBid = bid;
      auctionState.currentTeam = team;
      auctionState.history.push({ team, bid });
      io.emit('newBid', { team, bid, history: auctionState.history });
    }
  });

  // 낙찰 (관리자만)
  socket.on('confirmAuction', () => {
    if (!auctionState.isRunning) return;
    if (auctionState.currentTeam && auctionState.currentBid > 0) {
      // 팀 포인트 차감
      teamPoints[auctionState.currentTeam] -= auctionState.currentBid;
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
  });

  // 유찰 (관리자만)
socket.on('cancelAuction', ({ failedPlayers: clientFailedPlayers }) => {
  if (auctionState.currentPlayer && !failedPlayers.includes(auctionState.currentPlayer)) {
    failedPlayers.push(auctionState.currentPlayer);
  }

  auctionState.isRunning = false;
  auctionState.timer = 30;
  auctionState.currentPlayer = null;
  auctionState.currentBid = 0;
  auctionState.currentTeam = null;
  auctionState.history = [];
  auctionState.fullHistory = [];

  io.emit('auctionCanceled', auctionState);
  io.emit('updateFailedPlayers', failedPlayers);

  console.log("서버 failedPlayers 배열 상태:", failedPlayers);
});


});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버 실행중: http://localhost:${PORT}`);
});
