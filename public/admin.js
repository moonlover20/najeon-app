// admin.js 맨 위에 추가
const adminPassword = '8889';
const inputPw = prompt('관리자 비밀번호를 입력하세요');
if (inputPw !== adminPassword) {
  document.getElementById('blocker').innerHTML =
    `<div style="color:red;font-size:2rem;">❌ 비밀번호가 틀렸습니다.</div>`;
  throw new Error("비밀번호 오류");
}
const socket = io();

let playerList = [];
let pickedPlayers = [];
let failedPlayers = [];
let teamNames = [];
let teamPoints = {};
let fullHistory = [];
let teamRoster = {};  

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
// 팀별 선수 표 렌더 (admin페이지에 별도 표 or rosterTable에)
function renderTeamRoster() {
  const tbl = document.getElementById('adminRosterTableBody');
  if (!tbl) return;
  tbl.innerHTML = teamNames.map(team => {
    const names = (teamRoster[team] || []).map(nick =>
      `<td>${nick} <button onclick="removeFromTeam('${team}','${nick}')" class="btn black" style="font-size:0.9em;">❌</button></td>`
    ).join('');
    return `<tr>
      <td>${team}</td>
      ${names}
    </tr>`;
  }).join('');
}

// 삭제 버튼 클릭 핸들러
window.removeFromTeam = (team, name) => {
  if (confirm(`${team}팀에서 ${name}을/를 삭제하시겠습니까?`)) {
    socket.emit('removePlayerFromTeam', { team, name });
  }
};

// 소켓에서 팀 데이터 수신시 렌더
socket.on('updateRoster', (roster) => {
  teamRoster = roster;
  renderTeamRoster();
});



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
