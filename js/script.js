/* =========================================================
   script.js   –   Snake Draft (전 버전: 고정 Current Pick 섹션 없음)
   ---------------------------------------------------------
   · TEAMS, PLAYERS → data.js에서 import
   · style.css  →  카드/뱃지 색 · 깜박임 애니메이션 정의
   · index.html →  남은 선수·결과 패널, 모달, 상태바, 깜박임 토글
   ========================================================= */
    import { TEAMS } from './data_team.js';
    import { PLAYERS } from './data_player.js';
/* ---------- 1. 상수 ---------- */
const TEAM_COUNT  = TEAMS.length;
const ROSTER_SIZE = 3;

/* ---------- 2. 스네이크 드래프트 엔진 ---------- */
class DraftEngine {
  constructor(nTeams, rSize) {
    this.order = [];
    for (let r = 0; r < rSize; r++) {
      const round = Array.from({ length: nTeams },
        (_, i) => (r % 2 ? nTeams - 1 - i : i));
      this.order.push(...round);
    }
  }
  total()          { return this.order.length; }
  teamAt(pickIdx)  { return this.order[pickIdx]; }
  roundOf(pickIdx) { return Math.floor(pickIdx / TEAM_COUNT) + 1; }
}
const engine = new DraftEngine(TEAM_COUNT, ROSTER_SIZE);

/* ---------- 3. 상태 직렬화 (URL 압축) ---------- */
const KEY = 'state';
const emptyState = () => ({
  pick   : 0,
  roster : Array.from({ length: TEAM_COUNT }, () => []),
  times  : Array(TEAM_COUNT).fill(0),
  start  : Date.now()
});
function loadState() {
  const raw = new URLSearchParams(location.search).get(KEY);
  if (!raw) return emptyState();
  try { return JSON.parse(LZString.decompressFromEncodedURIComponent(raw)); }
  catch { return emptyState(); }
}
function saveState(st) {
  const qs = new URLSearchParams(location.search);
  qs.set(KEY, LZString.compressToEncodedURIComponent(JSON.stringify(st)));
  history.replaceState(null, '', '?' + qs);
}
let state = loadState();

/* ---------- 4. DOM 캐시 ---------- */
const $ = (id) => document.getElementById(id);
const $avail       = $('available');
const $draft       = $('drafted');
const $statusText  = $('statusText');
const $posTabs     = $('posTabs');
const $nameFilter  = $('nameFilter');
const $blinkToggle = $('blinkToggle');
const $modal       = $('modal');
const $msg         = $('modal-msg');
const $ok          = $('ok');
const $cancel      = $('cancel');

/* ---------- 5. 헬퍼 ---------- */
const fmt        = (s) => new Date(s * 1000).toISOString().substr(14, 5);
const roundColor = (r) => `hsl(${(r * 37) % 360} 70% 45%)`;
const subList    = (pl) => ['PG','SG','SF','PF','C'].filter(p=>pl[p.toLowerCase()]);
const posClass   = (p) => `pos-${p}`;
const subBadge   = (p) => `<span class="subpos-badge subpos-${p}">${p}</span>`;

/* ---------- 6. 렌더 ---------- */
let posFilter = 'ALL';
let blink     = true;

function tooltipHTML(pl) {
  const subs = subList(pl).map(subBadge).join('');
  return `ATK ${pl.atk}<br>DEF ${pl.def}${subs ? `<div class="subpos">${subs}</div>` : ''}`;
}
function cardHTML(pl) {
  const badge = `<span class="badge" style="background:${roundColor(pl.round)}">
                   R${pl.round}-P${pl.pick}
                 </span>`;
  const time = pl.time ? ` <span class="time">(${fmt(pl.time)})</span>` : '';
  return `${badge} <strong>${pl.name}</strong> (${pl.pos})${time}
          <div class="tooltip">${tooltipHTML(pl)}</div>`;
}

/* ── 6-1. 지명 결과 패널 ───────────────────────── */
function renderTeams() {
  $draft.innerHTML = '';
  const currIdx = state.pick < engine.total()
    ? engine.teamAt(state.pick) : -1;

  state.roster.forEach((team, idx) => {
    const meta = TEAMS[idx] ?? { name: `Team ${idx + 1}`, owner: '' };
    const line = `${meta.name}${meta.owner ? ` (${meta.owner})` : ''}`;

    const wrap = document.createElement('div');
    wrap.className =
      `team${idx === currIdx ? ' current' : ''}` +
      (idx === currIdx && blink ? ' blink' : '');
    wrap.innerHTML =
      `<h3><span>${line}</span><span>${fmt(state.times[idx])}</span></h3>`;

    team.forEach(pl => {
      wrap.insertAdjacentHTML(
        'beforeend',
        `<div class="card picked ${posClass(pl.pos)}">${cardHTML(pl)}</div>`
      );
    });
    $draft.appendChild(wrap);
  });
}

/* ── 6-2. 남은 선수 패널 ───────────────────────── */
function renderAvailable() {
  const drafted = new Set(state.roster.flat().map(p => p.id));
  const kw = $nameFilter.value.trim().toLowerCase();
  $avail.innerHTML = '';

  PLAYERS.forEach(pl => {
    if (drafted.has(pl.id)) return;
    if (posFilter !== 'ALL' && pl.pos !== posFilter) return;
    if (kw && !pl.name.toLowerCase().includes(kw)) return;

    const div = document.createElement('div');
    div.className = `card available ${posClass(pl.pos)}`;
    div.innerHTML =
      `<strong>${pl.name}</strong> (${pl.pos})
       <div class="tooltip">${tooltipHTML(pl)}</div>`;
    div.onclick = () => openModal(pl);
    $avail.appendChild(div);
  });
}

/* ── 6-3. 상태바 ───────────────────────── */
function renderStatus() {
  if (state.pick >= engine.total()) {
    $statusText.textContent = '드래프트 완료!';
    return;
  }
  const elapsed = Math.floor((Date.now() - state.start) / 1000);
  const r  = engine.roundOf(state.pick);
  const pk = state.pick + 1;
  const tmIdx  = engine.teamAt(state.pick);
  const tmName = TEAMS[tmIdx]?.name ?? `Team ${tmIdx + 1}`;

  $statusText.textContent =
    `Round ${r} – Pick ${pk}/${engine.total()} • ${tmName} ⏱ ${fmt(elapsed)}`;
}

/* ── 6-4. 전체 렌더 ───────────────────────── */
function renderAll() {
  renderTeams();
  renderAvailable();
  renderStatus();
}

/* ---------- 7. 모달 ---------- */
let pending = null;
function openModal(pl) {
  pending = pl;
  $msg.textContent = `${pl.name} (${pl.pos}) 지명?`;
  $modal.style.display = 'flex';
}
function closeModal() {
  $modal.style.display = 'none';
  pending = null;
}

/* ---------- 8. 자동 백업 ---------- */
function backup() {
  const payload = {
    exportedAt: new Date().toISOString(),
    url: location.href,
    TEAMS,
    state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)],
                        { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const r  = engine.roundOf(Math.max(state.pick - 1, 0));
  const pk = Math.max(state.pick, 1);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const a = Object.assign(document.createElement('a'), {
    href,
    download: `round${r}_pick${pk}_${ts}.json`
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(href), 3000);
}

/* ---------- 9. 지명 확정 ---------- */
function draft(pl) {
  const tIdx = engine.teamAt(state.pick);
  const delta = Math.floor((Date.now() - state.start) / 1000);

  state.times[tIdx] += delta;
  state.roster[tIdx].push({
    ...pl,
    round: engine.roundOf(state.pick),
    pick : state.pick + 1,
    time : delta
  });
  state.pick++;
  state.start = Date.now();

  saveState(state);
  renderAll();
  backup();
  if (state.pick >= engine.total()) stopTicker();
}

/* ---------- 10. 이벤트 ---------- */
$nameFilter.addEventListener('input', renderAvailable);

$posTabs.addEventListener('click', e => {
  if (e.target.tagName !== 'BUTTON') return;
  [...$posTabs.children].forEach(btn =>
    btn.classList.toggle('active', btn === e.target)
  );
  posFilter = e.target.dataset.pos;
  renderAvailable();
});

$blinkToggle.addEventListener('change', () => {
  blink = $blinkToggle.checked;
  document.body.classList.toggle('blink-active', blink);
  renderTeams();
});

$ok.onclick     = () => { draft(pending); closeModal(); };
$cancel.onclick = closeModal;

/* ---------- 11. 1초 타이머 ---------- */
let ticker = null;
function startTicker() {
  if (ticker) clearInterval(ticker);
  ticker = setInterval(renderStatus, 1000);
}
function stopTicker() {
  if (ticker) clearInterval(ticker);
}

/* ---------- 12. 초기화 ---------- */
renderAll();
startTicker();

console.log('Snake Draft 스크립트 (Current Pick 박스 없는 버전) 로드 완료');
