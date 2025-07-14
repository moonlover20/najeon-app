const allowedTeams = ['각반', '대림', '장수풍뎅이', '러부엉', '양갱', '블페러', '관전자',];
const teamPasswords = {
  '각반': '5123',
  '대림': '1623',
  '장수풍뎅이': '7655',
  '러부엉': '3121',
  '양갱': '5432',
  '블페러': '5431',
  '관전자': '1396',
};

function getTeamFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get('team');
  return t ? t : null;
}

const myTeam = getTeamFromUrl();

if (!window.nickname) {
  window.nickname = myTeam + '_' + Math.floor(Math.random() * 100);
}
if (!allowedTeams.includes(myTeam)) {
  document.body.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;min-height:100vh;font-size:2rem;color:#f4511e;font-family:'GmarketSansBold',sans-serif;">
      🚫 잘못된 팀명으로 접근하셨습니다.<br><br>
      URL을 확인해주세요.
    </div>
  `;
  throw new Error("Invalid team name");
} else {
  const userPw = prompt(`${myTeam} 비밀번호를 입력하세요`);
  if (userPw !== teamPasswords[myTeam]) {
    document.getElementById('blocker').innerHTML =
      `<div style="color:red;font-size:2rem;">❌ 비밀번호 미입력으로 기능이 작동하지 않습니다.
                                                            새로 고침을 통해 비밀번호를 입력해주세요. </div>`;
    throw new Error("비밀번호 오류");
  }
}

// 권한별 버튼 표시
window.onload = function() {
  if (myTeam !== '관전자') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
  if (myTeam === '관전자') {
    document.querySelectorAll('.team-only').forEach(el => el.style.display = 'none');
    const normalPickBtn = document.getElementById('normalPickBtn');
    if (normalPickBtn) {
      normalPickBtn.onclick = function() {
        if (isRouletteRunning) return;      // 3초 내 중복 방지
        socket.emit('normalPick');
        isRouletteRunning = true;
        normalPickBtn.disabled = true;       // 버튼도 잠금
      };
    }
  }
};

let pickedPlayers = [];
let failedPlayers = [];
let teamRoster = {};
const socket = io();
let teamNames = [];
let teamPoints = {};
let playerList = [];
let auctionState = {};
let isRouletteRunning = false;

// 버튼 활성화 함수 (전역에서 참조)
let updateConfirmButton = null;

// 최초 데이터 받기
socket.on('init', (data) => {
  teamNames = data.teamNames;
  teamPoints = data.teamPoints;
  playerList = data.playerList;
  auctionState = data.auctionState;
  pickedPlayers = data.pickedPlayers || [];
  teamRoster = data.teamRoster || {};
  failedPlayers = data.failedPlayers || [];
  renderRosterTable();
  renderAll();
});

socket.on('updateRoster', (roster) => {
  teamRoster = roster;
  renderRosterTable();
});

function playBbyong() {
  const audio = document.getElementById('bbyong-sound');
  if (audio) {
    audio.currentTime = 0;
    audio.play();
  }
}
function renderRosterTable() {
  const tbl = document.getElementById('rosterTable');
  if (!tbl) return;
  tbl.innerHTML = teamNames.map(team => {
    const names = (teamRoster[team] || []).map(nick => `<td>${nick}</td>`).join('');
    const remain = `<td class="remain">${teamPoints[team] || 0}p</td>`;
    return `<tr>
      <td class="team-name">${team}</td>
      ${names}
      ${'<td></td>'.repeat(4 - (teamRoster[team]?.length || 0))} 
      ${remain}
    </tr>`;
  }).join('');
}
socket.on('normalPickResult', function(data) {
  // data: { name, image }
  if (!data.name) {
    document.getElementById('rouletteDisplay').innerHTML = '<span style="color:red">더 이상 뽑을 선수가 없습니다.</span>';
    isRouletteRunning = false;
    const normalPickBtn = document.getElementById('normalPickBtn');
    if (normalPickBtn) normalPickBtn.disabled = false;
    return;
  }
  auctionState.currentPlayer = data.name; 
  startRouletteAnimation(data.name, data.image);  // <- 이걸로 통일
});



// 새 유저 동기화
socket.emit('getState');

// 경매 관련 이벤트(모두 한 번만 바인딩)
socket.on('auctionStarted', (state) => {
  auctionState = state;
  renderCenter();
  renderHistory();
  if (updateConfirmButton) updateConfirmButton();
});

socket.on('auctionEnded', (state) => {
  auctionState = state;
  renderCenter();
  renderHistory();
  if (updateConfirmButton) updateConfirmButton();
  if (auctionState.currentTeam) {
    // 낙찰(입찰팀 있음) 시
    playConfirm();
  } else {
    // 유찰(입찰팀 없음) 시
    showBidAlert('유찰되었습니다!', false); // 이 줄로 교체!
  }
});



socket.on('auctionCanceled', (state) => {
  auctionState = state;
  renderCenter();
  renderHistory();
  if (myTeam === '관전자') {
    showBidAlert('유찰되었습니다!', false);
  }
  if (updateConfirmButton) updateConfirmButton();
});


socket.on('timer', (timer) => {
  auctionState.timer = timer;
  document.getElementById('auctionTimer').textContent = timer;
  if (updateConfirmButton) updateConfirmButton();
});

socket.on('newBid', ({team, bid, history}) => {
  auctionState.currentBid = bid;
  auctionState.currentTeam = team;
  auctionState.history = history;
  renderCenter();
  renderHistory();
  playBbyong();
});

socket.on('updatePoints', (points) => {
  teamPoints = points;
  renderRight();
});
socket.on('updateHistory', (fullHistory) => {
  auctionState.fullHistory = fullHistory;
  renderRight();
});
socket.on('updateFailedPlayers', (failedList) => {
  failedPlayers = failedList;
  renderLeft();
});
socket.on('updatePlayers', ({ pickedPlayers: picked, failedPlayers: failed }) => {
  pickedPlayers = picked;
  failedPlayers = failed;
  renderLeft();
});
socket.on('bidResult', ({ success, message }) => {
  showBidAlert(message, success);
  document.getElementById('bidBtn').disabled = false;
});
// 1. 채팅 메시지 받기
socket.on('chatMessage', ({ team, name, message, timestamp }) => {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  const time = new Date(timestamp);
  const hhmm = time.toTimeString().slice(0,5);

  // 팀별 색상 부여(예시)
  const teamColors = {
    '각반': '#5e72e4', '대림': '#fd9644', '장수풍뎅이': '#20bf6b',
    '러부엉': '#8854d0', '양갱': '#f7b731', '블페러': '#2d98da', '관전자':'#8395a7'
  };
  const color = teamColors[team] || '#888';

  const msgHtml = `
<div style="
  margin:6px 0;display:flex;align-items:center;gap:8px;
  ">
  <div style="background:#fff;border-radius:8px;padding:7px 14px 6px 14px;box-shadow:0 1px 5px #ebecef;font-size:15px;max-width:178px;word-break:break-all;">
    <span style="font-weight:bold;color:#232323;">${name || ''}</span>
    <span style="color:#bbb;font-size:12px;margin-left:4px;">${hhmm}</span><br>
    <span style="color:#232323;">${message}</span>
  </div>
</div>

  `;
  chatMessages.innerHTML += msgHtml;
  chatMessages.scrollTop = chatMessages.scrollHeight;
});


// 2. 채팅 전송 함수
function sendChat() {
  const chatInput = document.getElementById('chatInput');
  const message = chatInput.value.trim();
  if (!message) return;
  socket.emit('chatMessage', {
    team: myTeam,
    name: window.nickname || '', // 닉네임 변수(없으면 빈값)
    message,
  });
  chatInput.value = '';
}

// 3. 채팅 전송 버튼/엔터키 이벤트 바인딩
document.addEventListener('DOMContentLoaded', () => {
  const chatSendBtn = document.getElementById('chatSendBtn');
  if (chatSendBtn) chatSendBtn.onclick = sendChat;
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') sendChat();
    });
  }
});

// 렌더링 함수들
function renderAll() {
  renderLeft();
  renderCenter();
  renderRight();
  renderHistory();
}
function renderLeft() {
  const playerListDiv = document.getElementById('playerList');
  playerListDiv.innerHTML = playerList.map(p => {
    let classes = 'player-list-item';
    if (pickedPlayers.includes(p.name)) classes += ' picked-player';
    else if (failedPlayers.includes(p.name)) classes += ' failed-player';
    return `<div class="${classes}">${p.name} / ${p.tier} / ${p.pos}</div>`;
  }).join('');
}
let rouletteInterval = null;

function startRouletteAnimation(finalPlayerName, finalImage) {
  const rouletteDiv = document.getElementById('rouletteDisplay');
  if (!rouletteDiv) return;

  const candidates = playerList.filter(
    p => !pickedPlayers.includes(p.name)
  ).map(p => p.name);

  if (candidates.length === 0) {
    rouletteDiv.textContent = "더 이상 뽑을 선수가 없습니다.";
    isRouletteRunning = false;
    const normalPickBtn = document.getElementById('normalPickBtn');
    if (normalPickBtn) normalPickBtn.disabled = false;
    return;
  }

  // 1명만 남았으면 바로 결과만 보여주고 리턴
  if (candidates.length === 1) {
    let html = `
      <div style="display:flex;align-items:center;justify-content:center;gap:22px;">
        <img src="${finalImage}" alt="${finalPlayerName}" 
          style="width:110px;height:110px;border-radius:50%;border:4px solid #ff7e36;background:#fff;">
        <div style="display:flex;align-items:center;height:110px;">
          <span style="
            font-size:2.3rem;
            font-weight:900;
            color:#ff6700;
            display:flex;
            align-items:center;
            justify-content:center;
            height:110px;
            min-width:80px;
            text-align:center;
          ">${finalPlayerName}</span>
        </div>
      </div>
    `;
    rouletteDiv.innerHTML = html;
    isRouletteRunning = false;
    const normalPickBtn = document.getElementById('normalPickBtn');
    if (normalPickBtn) normalPickBtn.disabled = false;
    return;
  }

  // 2명 이상일 때만 룰렛 돌리기
  let index = 0;
  const spinDuration = 3000;
  const intervalTime = 100;

  rouletteDiv.textContent = candidates[index];
  rouletteInterval = setInterval(() => {
    index = (index + 1) % candidates.length;
    rouletteDiv.textContent = candidates[index];
  }, intervalTime);

  setTimeout(() => {
    clearInterval(rouletteInterval);

    let html = `
      <div style="display:flex;align-items:center;justify-content:center;gap:22px;">
        <img src="${finalImage}" alt="${finalPlayerName}" 
          style="width:110px;height:110px;border-radius:50%;border:4px solid #ff7e36;background:#fff;">
        <div style="display:flex;align-items:center;height:110px;">
          <span style="
            font-size:2.3rem;
            font-weight:900;
            color:#ff6700;
            display:flex;
            align-items:center;
            justify-content:center;
            height:110px;
            min-width:80px;
            text-align:center;
          ">${finalPlayerName}</span>
        </div>
      </div>
    `;
    rouletteDiv.innerHTML = html;

    isRouletteRunning = false;
    const normalPickBtn = document.getElementById('normalPickBtn');
    if (normalPickBtn) normalPickBtn.disabled = false;
  }, spinDuration);
}


function playConfirm() {
  const audio = document.getElementById('confirm-sound');
  if (audio) {
    audio.currentTime = 0;
    audio.play();
  }
}

function showBidAlert(message, success = true) {
  const alertDiv = document.getElementById('bidAlert');
  const alertText = document.getElementById('bidAlertText');
  alertText.textContent = message;
  alertDiv.style.background = success ? '#4caf50' : '#f44336';
  alertDiv.style.display = 'block';
  setTimeout(() => {
    alertDiv.style.display = 'none';
  }, 2500);
}

function renderRight() {
  // 사용 안 함
}

function renderCenter() {
  document.getElementById('currentBid').textContent = (auctionState.currentBid || 0) + " P";
  document.getElementById('currentBidTeam').textContent = auctionState.currentTeam || '-';
  document.getElementById('topTeamName').textContent = myTeam;
  let msg = '';
  if (!auctionState.isRunning && auctionState.currentPlayer) msg = '⚠️ 입찰 종료!';
  document.getElementById('auctionStatusMsg').textContent = msg;
}

function renderHistory() {
  const tbody = document.getElementById('historyTable');
  const history = auctionState.isRunning ? auctionState.history : auctionState.fullHistory;
  if (history && history.length > 0) {
    tbody.innerHTML = history.slice().reverse().map(row =>
      `<tr>
        <td>${row.team}</td>
        <td>${row.player || '-'}</td>
        <td>${row.bid}</td>
      </tr>`
    ).join('');
  } else {
    tbody.innerHTML = '<tr><td colspan="3">-</td></tr>';
  }
}

// 경매 시작
window.startAuction = () => {
  if (myTeam !== '관전자') return;
  if (!auctionState.currentPlayer) {
    alert('경매를 시작할 선수를 먼저 뽑아주세요.');
    return;
  }
  if (confirm('경매를 시작하겠습니까?')) {
    socket.emit('startAuction', auctionState.currentPlayer);
  }
};

// 입찰
window.bid = () => {
  const team = myTeam;
  const bidBtn = document.getElementById('bidBtn');
  const bid = parseInt(document.getElementById('bidInput').value, 10);
  if (!auctionState.isRunning) {
    alert('경매가 시작되지 않았습니다.');
    return;
  }
  if (!team || isNaN(bid) || bid < 1) return;
  if (bid % 5 !== 0) {
    showBidAlert('입찰은 5포인트 단위로만 가능합니다.', false);
    return;
  }
  bidBtn.disabled = true;
  socket.emit('bid', { team, bid });
  document.getElementById('bidInput').value = '';
};


// 낙찰
window.confirmAuction = () => {
  if (myTeam !== '관전자') return;
  socket.emit('confirmAuction');
};

// DOMContentLoaded에서 버튼·입력 등만 바인딩
document.addEventListener('DOMContentLoaded', () => {
  const confirmButton = document.getElementById('confirmAuctionBtn');
  if (confirmButton) {
    updateConfirmButton = function() {
      const canConfirm = auctionState.isRunning || (!auctionState.isRunning && auctionState.timer === 0);
      confirmButton.disabled = !canConfirm;
    };
    updateConfirmButton();
  }
  const bidInput = document.getElementById('bidInput');
  if (bidInput) {
    bidInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        window.bid();
      }
    });
  }
});
