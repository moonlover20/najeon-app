const socket = io();

let playerList = [];
let pickedPlayers = [];
let failedPlayers = [];
let teamNames = [];
let teamPoints = {};
let fullHistory = [];

socket.on('init', (data) => {
  playerList = data.playerList;
  pickedPlayers = data.pickedPlayers || [];
  failedPlayers = data.failedPlayers || [];
  teamNames = data.teamNames;
  teamPoints = data.teamPoints;
  renderPlayers();
  renderPoints();
  renderHistory();
});
socket.on('updateHistory', (history) => {
  fullHistory = history;
  renderHistory();
});



function renderHistory() {
  const tbody = document.getElementById('historyTableBody');
  if (fullHistory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3">입찰 이력이 없습니다.</td></tr>`;
    return;
  }
  tbody.innerHTML = fullHistory.map(h =>
    `<tr>
      <td>${h.team}</td>
      <td>${h.player}</td>
      <td>${h.bid}</td>
    </tr>`
  ).join('');
}

// 초기화 버튼 이벤트
document.getElementById('clearHistoryBtn').addEventListener('click', () => {
  if (confirm('입찰 이력을 정말 초기화하시겠습니까?')) {
    socket.emit('clearHistory');
  }
});

socket.emit('getState');

// 상태 버튼 클릭
window.setPlayerStatus = (name, status) => {
  socket.emit('setPlayerStatus', { name, status });
};
socket.on('updatePlayers', (data) => {
  pickedPlayers = data.pickedPlayers;
  failedPlayers = data.failedPlayers;
  renderPlayers();
});

// 포인트 입력 적용
window.saveTeamPoint = (team) => {
  const v = parseInt(document.getElementById(`input-pt-${team}`).value, 10);
  if (isNaN(v) || v < 0) return alert('정상값 입력!');
  socket.emit('setTeamPoints', { team, point: v });
};
socket.on('updatePoints', (pts) => {
  teamPoints = pts;
  renderPoints();
});

// 플레이어 테이블 렌더
function renderPlayers() {
  document.getElementById('playerTableBody').innerHTML = playerList.map(p => {
    let state = '기본';
    if (pickedPlayers.includes(p.name)) state = '뽑힘';
    else if (failedPlayers.includes(p.name)) state = '유찰';

    return `
      <tr>
        <td>${p.name}</td>
        <td>${p.tier}</td>
        <td>${p.pos}</td>
        <td>${state}</td>
        <td><button class="btn black" onclick="setPlayerStatus('${p.name}', 'default')">●</button></td>
        <td><button class="btn yellow" onclick="setPlayerStatus('${p.name}', 'picked')">●</button></td>
        <td><button class="btn blue" onclick="setPlayerStatus('${p.name}', 'failed')">●</button></td>
      </tr>`;
  }).join('');
}

// 팀 포인트 렌더
function renderPoints() {
  document.getElementById('pointTableBody').innerHTML = teamNames.map(t =>
    `<tr>
      <td>${t}</td>
      <td>${teamPoints[t]}</td>
      <td><input id="input-pt-${t}" class="input-pt" type="number" min="0" placeholder="새 포인트"></td>
      <td><button class="btn save-btn" onclick="saveTeamPoint('${t}')">저장</button></td>
    </tr>`
  ).join('');
}
