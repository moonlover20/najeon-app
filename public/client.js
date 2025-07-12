const allowedTeams = ['각반', '대림', '장수풍뎅이', '러부엉', '양갱', '블페러', '관전자',];
const teamPasswords = {
  '각반': '1112',
  '대림': '2223',
  '장수풍뎅이': '3334',
  '러부엉': '4445',
  '양갱': '5556',
  '블페러': '6667',
  '관전자': '7778',
};

function getTeamFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get('team');
  return t ? t : null;
}

const myTeam = getTeamFromUrl();

if (!allowedTeams.includes(myTeam)) {
  document.body.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;min-height:100vh;font-size:2rem;color:#f4511e;font-family:'GmarketSansBold',sans-serif;">
      🚫 잘못된 팀명으로 접근하셨습니다.<br><br>
      URL을 확인해주세요.
    </div>
  `;
  throw new Error("Invalid team name");
} else {
  // 모든 팀에 대해 비번 입력받음 (관전자, admin도)
  const userPw = prompt(`${myTeam} 비밀번호를 입력하세요`);
  if (userPw !== teamPasswords[myTeam]) {
    // 차단 메시지 (body 최상단에 blocker div를 넣어둔 경우)
    document.getElementById('blocker').innerHTML =
      `<div style="color:red;font-size:2rem;">❌ 비밀번호 미입력으로 기능이 작동하지 않습니다.
                                                            새로 고침을 통해 비밀번호를 입력해주세요. </div>`;
    throw new Error("비밀번호 오류");
  }
}



// 권한별 버튼 표시
window.onload = function() {
  // 관전자가 아니면 관리자 버튼 숨김
  if (myTeam !== '관전자') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
  // 관전자(관리자)는 팀장 입찰칸 숨김!
  if (myTeam === '관전자') {
    document.querySelectorAll('.team-only').forEach(el => el.style.display = 'none');

    // ★ 뽑기 버튼 바인딩도 여기서!
    const normalPickBtn = document.getElementById('normalPickBtn');
    if (normalPickBtn) {
      normalPickBtn.onclick = function() {
        socket.emit('normalPick');
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

// 최초 데이터 받기
socket.on('init', (data) => {
  teamNames = data.teamNames;
  teamPoints = data.teamPoints;
  playerList = data.playerList;
  auctionState = data.auctionState;
  pickedPlayers = data.pickedPlayers || []; 
  renderRosterTable();
  teamRoster = data.teamRoster || {};
 failedPlayers = data.failedPlayers || []; // 서버에서 받아서 저장
  renderAll();
});
socket.on('updateRoster', (roster) => {
  teamRoster = roster;
  renderRosterTable();
});
// 클라이언트 쪽 pickedPlayers 배열은 서버와 동기화용, 초기값 빈 배열

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

socket.on('normalPickResult', ({ name, message }) => {
  if (message) {
    alert(message);
    return;
  }
  if (!name) return;
  console.log('Picked player:', name); 
  pickedPlayers.push(name);
  auctionState.currentPlayer = name;   // ★ 여기 추가
  startRouletteAnimation(name);
  renderLeft();
  renderCenter();  // 상태 갱신 위해 호출
});


// 새 유저 동기화
socket.emit('getState');

// 경매 시작
socket.on('auctionStarted', (state) => {
  console.log('auctionStarted 수신:', state.currentPlayer);  // 로그 추가
  auctionState = state;
  renderCenter();
  renderHistory();
});

// 기존 타이머 코드
socket.on('timer', (timer) => {
  document.getElementById('auctionTimer').textContent = timer;
});

socket.on('newBid', ({team, bid, history}) => {
  auctionState.currentBid = bid;
  auctionState.currentTeam = team;
  auctionState.history = history;
  renderCenter();
  renderHistory();
});

socket.on('auctionEnded', (state) => {
  auctionState = state;
  renderCenter();
  renderHistory();
});
socket.on('auctionCanceled', (state) => {
  auctionState = state;
  renderCenter();
  renderHistory();
  if (myTeam === '관전자') {  // 관리자(관전자)에게만 알림 띄우기
    alert('유찰되었습니다!');
  }
});

socket.on('updatePoints', (points) => {
  teamPoints = points;
  renderRight();
});
socket.on('updateHistory', (fullHistory) => {
  auctionState.fullHistory = fullHistory;
  renderRight();
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

function startRouletteAnimation(finalPlayerName) {
  const rouletteDiv = document.getElementById('rouletteDisplay');
  if (!rouletteDiv) {
    alert(`룰렛 애니메이션: ${finalPlayerName} 뽑힘!`);
    return;
  }

  const candidates = playerList.filter(p => !pickedPlayers.includes(p.name)).map(p => p.name);
  if (candidates.length === 0) {
    rouletteDiv.textContent = "더 이상 뽑을 선수가 없습니다.";
    return;
  }

  let index = 0;
  const spinDuration = 3000; // 3초 동안 룰렛 돌림
  const intervalTime = 100; // 0.1초마다 변경

  rouletteDiv.textContent = candidates[index];
  
  rouletteInterval = setInterval(() => {
    index = (index + 1) % candidates.length;
    rouletteDiv.textContent = candidates[index];
  }, intervalTime);

  setTimeout(() => {
    clearInterval(rouletteInterval);
    rouletteDiv.textContent = finalPlayerName;
    // 뽑힌 선수 주황색 표시를 위해 renderLeft 다시 호출
    renderLeft();
  }, spinDuration);
}

function showBidAlert(message, success = true) {
  const alertDiv = document.getElementById('bidAlert');
  const alertText = document.getElementById('bidAlertText');

  alertText.textContent = message;
  alertDiv.style.background = success ? '#4caf50' : '#f44336'; // 초록 or 빨강
  alertDiv.style.display = 'block';

  setTimeout(() => {
    alertDiv.style.display = 'none';
  }, 2500); // 2.5초 후 자동 사라짐
}

function renderRight() {
  // 사용 안 함
}



function renderCenter() {
  // 입찰가
  document.getElementById('currentBid').textContent = (auctionState.currentBid || 0) + " P";
  // 입찰팀
  document.getElementById('currentBidTeam').textContent = auctionState.currentTeam || '-';
  // 현재 뽑힌 플레이어

// 페이지 로드 시(또는 renderCenter에서) 팀명을 표시
document.getElementById('topTeamName').textContent = myTeam;

  let msg = '';
  if (!auctionState.isRunning && auctionState.currentPlayer) msg = '⚠️ 입찰 종료!';
  document.getElementById('auctionStatusMsg').textContent = msg;
}



// 클라이언트 renderHistory 함수 예시
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



// 경매 시작 (관리자만)
// 클라이언트 - 뽑힌 선수 이름은 rouletteAnimation 후, 예를 들어 pickedPlayers 배열의 마지막 선수로 가정
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

  bidBtn.disabled = true;
  socket.emit('bid', { team, bid });
  document.getElementById('bidInput').value = '';
};





// 낙찰
window.confirmAuction = () => {
  if (myTeam !== '관전자') return;
  socket.emit('confirmAuction');
};


// 서버에서 유찰 처리 시 전체 클라이언트에 알림 및 실패 플레이어 리스트 업데이트
socket.on('updateFailedPlayers', (failedList) => {
  failedPlayers = failedList;
  renderLeft();
});

// 서버에서 플레이어 상태가 바뀌었을 때 실시간 반영
socket.on('updatePlayers', ({ pickedPlayers: picked, failedPlayers: failed }) => {
  pickedPlayers = picked;
  failedPlayers = failed;
  renderLeft();  // ← 플레이어 색상 실시간 갱신!
});
socket.on('bidResult', ({ success, message }) => {
  showBidAlert(message, success);
  document.getElementById('bidBtn').disabled = false; // 응답 올 때 확실하게 복구!
});


document.addEventListener('DOMContentLoaded', () => {
  // 경매확정 버튼 엘리먼트
  const confirmButton = document.getElementById('confirmAuctionBtn'); // 버튼 id 맞춰주세요
  if (confirmButton) {
    // 버튼 활성화 조건 업데이트 (타이머 0 이거나 isRunning일 때 활성화)
    function updateConfirmButton() {
      const canConfirm = auctionState.isRunning || (!auctionState.isRunning && auctionState.timer === 0);
      confirmButton.disabled = !canConfirm;
    }

    // 상태 변경 시마다 호출해야 함
    socket.on('auctionStarted', (state) => {
      auctionState = state;
      updateConfirmButton();
    });
    socket.on('auctionEnded', (state) => {
      auctionState = state;
      updateConfirmButton();
    });
    socket.on('timer', (timer) => {
      auctionState.timer = timer;
      updateConfirmButton();
    });
  }
socket.on('auctionEnded', (state) => {
  auctionState = state;
  renderCenter();
  renderHistory();
  if (!auctionState.currentTeam) { // 입찰팀 없으면 유찰임
    alert('유찰되었습니다!');
  }
});
  // 기존 입찰 입력 엔터 이벤트도 유지
  const bidInput = document.getElementById('bidInput');
  if (bidInput) {
    bidInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        window.bid();
      }
    });
  }
});


