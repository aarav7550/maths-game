// ============================================================
// HISTORY.JS — History Overview, Skill Detail, Full History, export/import
// All three screens draw their graph with the SAME shared TrendChart module the
// Home dashboard uses (js/trendchart.js) — no History-only chart variant.
// Depends on (loaded earlier): storage.js (sessions, saveSessions), skills.js (showView),
// game.js (difficultyLabels), ui.js (SKILL_ICON, SKILL_CLASS, skillDisplayLabels,
// matchingDifficultyForConfig), trendchart.js (TrendChart).
// ============================================================

const historySkillLabels = Object.assign({}, skillDisplayLabels, { mixed:'Mixed' });
const PARITY_LABEL = { any:'Any', even:'Even only', odd:'Odd only' };
const FULL_PAGE_SIZE = 15;

// ---------- small helpers ----------
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function startOfDayMs(ts){
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
// "Today" / "Yesterday" / "7 Sep, 2026" — used for the day headers above each group of rows
function fmtDayLabel(ts){
  const diff = Math.round((startOfDayMs(Date.now()) - startOfDayMs(ts)) / 86400000);
  if(diff === 0) return 'Today';
  if(diff === 1) return 'Yesterday';
  const d = new Date(ts);
  return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ', ' + d.getFullYear();
}
// "4:12 PM" — shown inside each row
function fmtTimeLabel(ts){
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes(), ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if(h === 0) h = 12;
  return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
}

function sessionLevelInfo(s){
  // Mixed rounds have no single range to show, so they get a plain non-clickable label.
  if(s.skill === 'mixed' || !s.config || !s.config.cfg) return { label: s.skill === 'mixed' ? 'Mixed' : '—', range: null, type: null };
  const cfg = s.config.cfg;
  return {
    label: difficultyLabels[matchingDifficultyForConfig(s.skill, cfg)],
    range: cfg.min + '–' + cfg.max,
    type: (SKILL_META[s.skill] && SKILL_META[s.skill].modeText) ? SKILL_META[s.skill].modeText(cfg) : (PARITY_LABEL[cfg.parity] || 'Any')
  };
}

// Real rounds + practice rounds, oldest -> newest. Used ONLY for the session LISTS below.
// Graphs, stat cards and skill cards keep using `sessions`, so practice never touches any numbers.
function allRounds(){
  const prac = (typeof practiceSessions !== 'undefined' && Array.isArray(practiceSessions) ? practiceSessions : [])
    .map(p => p.practice ? p : Object.assign({}, p, { practice: true }));
  return sessions.concat(prac).sort((a,b) => a.date - b.date);
}

function trendPointsFor(list){
  return list.map(s => ({ ts: s.date, val: s.avgTime, acc: s.accuracy }));
}

// One row, matching the mockups: line 1 = skill + time (Skill Detail: time only, the page is
// already one skill), line 2 = level / questions / avg / accuracy.
function sessionRowHtml(s, withSkill){
  const lv = sessionLevelInfo(s);
  const levelCell = lv.range
    ? '<div class="sr-cell sr-level"><span class="sr-level-txt">' + lv.label + '</span></div>'
    : '<div class="sr-cell sr-level-static">' + lv.label + '</div>';
  const popover = lv.range
    ? '<div class="level-popover">'
      + '<div class="lp-row"><span>Range</span><b>' + lv.range + '</b></div>'
      + '<div class="lp-row"><span>Type</span><b>' + lv.type + '</b></div>'
      + '</div>'
    : '';
  const line1 = '<div class="sr-line1">'
    + (withSkill ? '<div class="sr-cell sr-skill">' + (historySkillLabels[s.skill] || s.skill) + '</div>' : '')
    + '<div class="sr-cell sr-time">' + fmtTimeLabel(s.date) + '</div>'
    + (s.practice ? '<div class="sr-cell sr-prac-cell"><span class="sr-prac">Practice</span></div>' : '')
    + '</div>';
  const line2 = '<div class="sr-line2">'
    + levelCell
    + '<div class="sr-cell sr-qs">' + (s.questions || '—') + ' Qs</div>'
    + '<div class="sr-cell sr-avg">' + s.avgTime.toFixed(1) + 's avg</div>'
    + '<div class="sr-cell sr-acc">' + s.accuracy + '% acc</div>'
    + '</div>';
  // Rounds saved with question details can be tapped to review them (see "SESSION REVIEW" below)
  const d = s.details;
  const hasDetails = !!(d && (Array.isArray(d.all) || (Array.isArray(d.wrong) && Array.isArray(d.slow))));
  return '<div class="session-row' + (s.practice ? ' is-practice' : '') + (hasDetails ? ' has-details' : '') + '"'
    + (hasDetails ? ' data-date="' + s.date + '" data-prac="' + (s.practice ? 1 : 0) + '"' : '') + '>'
    + line1 + line2 + popover + '</div>';
}

// Rows grouped under a day header ("Today", "Yesterday", "7 Sep, 2026"). `list` must already be
// newest-first. If one day spans two pages, its header simply repeats at the top of the next page.
function groupedRowsHtml(list, withSkill){
  let html = '', lastDay = null;
  list.forEach(s => {
    const day = startOfDayMs(s.date);
    if(day !== lastDay){
      html += '<div class="day-header">' + fmtDayLabel(s.date) + '</div>';
      lastDay = day;
    }
    html += sessionRowHtml(s, withSkill);
  });
  return html;
}

// Prev / 1 … 4 5 6 … 9 / Next. Shared by Skill Detail and Full History. Empty when only one page.
function pagerHtml(page, pages){
  if(pages <= 1) return '';
  const nums = [];
  for(let p = 1; p <= pages; p++){
    if(p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
    else if(nums[nums.length - 1] !== '…') nums.push('…');
  }
  const chev = (d) => '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
  let html = '<button class="page-btn page-nav-btn" data-page="' + (page - 1) + '"' + (page === 1 ? ' disabled' : '') + '>' + chev('M15 18l-6-6 6-6') + 'Prev</button>';
  nums.forEach(n => {
    html += n === '…'
      ? '<span class="page-ellipsis">…</span>'
      : '<button class="page-btn' + (n === page ? ' active' : '') + '" data-page="' + n + '">' + n + '</button>';
  });
  html += '<button class="page-btn page-nav-btn" data-page="' + (page + 1) + '"' + (page === pages ? ' disabled' : '') + '>Next' + chev('M9 18l6-6-6-6') + '</button>';
  return html;
}

// ---------- level popover (one-time delegation per stable list container) ----------
let openLevelPop = null;
function closeLevelPop(){ if(openLevelPop){ openLevelPop.classList.remove('show'); openLevelPop = null; } }
function positionLevelPop(cell, pop){
  const row = cell.closest('.session-row');
  const txt = cell.querySelector('.sr-level-txt') || cell;
  const rowRect = row.getBoundingClientRect(), txtRect = txt.getBoundingClientRect();
  const anchorCenter = (txtRect.left - rowRect.left) + txtRect.width / 2;
  const anchorBottom = (txtRect.bottom - rowRect.top) + 10;
  pop.style.left = '0px';
  pop.style.top = anchorBottom + 'px';
  pop.style.setProperty('--lp-arrow-x', '16px');
  pop.classList.add('show');
  const popW = pop.offsetWidth;
  const left = Math.min(Math.max(0, anchorCenter - popW / 2), rowRect.width - popW);
  pop.style.left = left + 'px';
  pop.style.setProperty('--lp-arrow-x', (anchorCenter - left) + 'px');
}
function popFor(cell){ return cell.closest('.session-row').querySelector('.level-popover'); }
function wireLevelPopovers(list){
  list.addEventListener('click', (e) => {
    const cell = e.target.closest('.sr-level');
    if(!cell){ closeLevelPop(); return; }
    const pop = popFor(cell);
    if(!pop) return;
    if(openLevelPop && openLevelPop !== pop) openLevelPop.classList.remove('show');
    const willShow = !pop.classList.contains('show');
    if(willShow) positionLevelPop(cell, pop); else pop.classList.remove('show');
    openLevelPop = willShow ? pop : null;
    e.stopPropagation();
  });
  // desktop only: hover also reveals it (skipped on touch, where the first tap would only fire hover)
  if(window.matchMedia('(hover: hover)').matches){
    list.addEventListener('mouseover', (e) => {
      const cell = e.target.closest('.sr-level');
      if(!cell || cell.contains(e.relatedTarget)) return;
      const pop = popFor(cell);
      if(pop) positionLevelPop(cell, pop);
    });
    list.addEventListener('mouseout', (e) => {
      const cell = e.target.closest('.sr-level');
      if(!cell || cell.contains(e.relatedTarget)) return;
      const pop = popFor(cell);
      if(pop && pop !== openLevelPop) pop.classList.remove('show');
    });
  }
}
document.addEventListener('click', closeLevelPop);

// ============================================================
// SESSION REVIEW — tap a session row to see its wrong / slowest questions
// (data comes from `details`, saved by game.js buildSessionDetails; older sessions have none and aren't tappable)
// ============================================================
const reviewModal = document.getElementById('reviewModal');
const rvTitleEl = document.getElementById('rvTitle');
const rvSubEl = document.getElementById('rvSub');
const rvStatsEl = document.getElementById('rvStats');
const REVIEW_SLOW_SHOW = 5;   // how many of the slowest right answers the review lists
const rvBodyEl = document.getElementById('rvBody');

function escapeHtml(v){
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function findRound(date, isPractice){
  const list = isPractice ? practiceSessions : sessions;
  return list.find(s => s.date === date) || null;
}
// Sessions normally save {wrong, slow}. (One test version saved every question as details.all; those still show, with wrong / slow worked out from it.)
function reviewLists(d){
  if(Array.isArray(d.all)){
    return {
      all: d.all,
      wrong: d.all.filter(r => !r.c),
      slow: d.all.filter(r => r.c).sort((a, b) => b.t - a.t).slice(0, REVIEW_SLOW_SHOW)
    };
  }
  return { all: null, wrong: d.wrong, slow: d.slow };
}
// kind: 'wrong' | 'slow'
function reviewRowHtml(r, kind, isMixed){
  const tag = isMixed && r.k ? '<span class="rv-tag">' + escapeHtml(historySkillLabels[r.k] || r.k) + '</span>' : '';
  let nums;
  if(kind === 'slow'){
    nums = '<span class="rv-t">' + (r.t / 1000).toFixed(1) + 's</span>';
  } else {
    nums = '<span class="rv-you">' + (r.g === null ? 'no answer' : 'you: ' + escapeHtml(r.g)) + '</span>'
         + '<span class="rv-right">right: ' + escapeHtml(r.a) + '</span>'
         + (r.g === null ? '' : '<span class="rv-t">' + (r.t / 1000).toFixed(1) + 's</span>');
  }
  return '<div class="rv-row"><div class="rv-q">' + escapeHtml(r.q) + tag + '</div><div class="rv-nums">' + nums + '</div></div>';
}
function openReview(s){
  const isMixed = s.skill === 'mixed';
  const lv = sessionLevelInfo(s);
  const L = reviewLists(s.details);
  rvTitleEl.textContent = (historySkillLabels[s.skill] || s.skill) + (s.practice ? ' · Practice' : '');
  rvSubEl.textContent = fmtDayLabel(s.date) + ', ' + fmtTimeLabel(s.date) + ' · ' + lv.label;
  // second row: fixed columns, avg + accuracy coloured like the Recent sessions rows
  rvStatsEl.innerHTML = '<span class="rv-st rv-qs">' + (s.questions || '—') + ' Qs</span>'
    + '<span class="rv-st rv-avg">' + Number(s.avgTime).toFixed(1) + 's avg</span>'
    + '<span class="rv-st rv-acc">' + s.accuracy + '% acc</span>';

  let html = '<div class="rv-section-title">Wrong or missed' + (L.wrong.length ? ' (' + L.wrong.length + ')' : '') + '</div>';
  html += L.wrong.length
    ? L.wrong.map(r => reviewRowHtml(r, 'wrong', isMixed)).join('')
    : '<div class="rv-empty">No mistakes in this round.</div>';
  if(L.slow.length){
    html += '<div class="rv-section-title">Slowest right answers</div>' + L.slow.map(r => reviewRowHtml(r, 'slow', isMixed)).join('');
  }
  rvBodyEl.innerHTML = html;
  rvBodyEl.scrollTop = 0;
  reviewModal.classList.add('show');
}
function closeReview(){ reviewModal.classList.remove('show'); }
function reviewIsOpen(){ return reviewModal.classList.contains('show'); }

// One delegated listener per session list (the lists re-render, so nothing is bound per row).
function wireRowReview(list){
  list.addEventListener('click', (e) => {
    if(e.target.closest('.sr-level') || e.target.closest('.level-popover')) return;   // those open the level popover instead
    const row = e.target.closest('.session-row.has-details');
    if(!row) return;
    const s = findRound(Number(row.dataset.date), row.dataset.prac === '1');
    if(s && s.details) openReview(s);
  });
}
document.getElementById('btnReviewClose').addEventListener('click', closeReview);
reviewModal.addEventListener('click', (e) => { if(e.target === reviewModal) closeReview(); });
// Esc closes the review first (and stops there, so it can't also act as "go back a screen")
window.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && reviewIsOpen()){
    closeReview();
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}, true);

// ---------- icon-button tooltips (touch: long-press shows it; mouse: hover) ----------
function wireTooltipBtn(btnId, tipId){
  const btn = document.getElementById(btnId), tip = document.getElementById(tipId);
  if(!btn || !tip) return;
  let timer = null;
  btn.addEventListener('touchstart', () => { timer = setTimeout(() => tip.classList.add('show'), 350); }, {passive:true});
  btn.addEventListener('touchend', () => { clearTimeout(timer); setTimeout(() => tip.classList.remove('show'), 1200); });
  btn.addEventListener('mouseenter', () => tip.classList.add('show'));
  btn.addEventListener('mouseleave', () => tip.classList.remove('show'));
}

// ---------- shared trend card (Overview + Skill Detail) ----------
// els: { mount, title, curAvg, curAcc, growth, growthLbl }
function renderTrendCard(els, points){
  const result = TrendChart.mount(els.mount, points);
  const pts = result ? result.pts : [];

  els.title.textContent = points.length === 0 ? 'Getting started' : 'Your progress';

  if(pts.length === 0){
    els.curAvg.textContent = '—';
    els.curAcc.textContent = '—';
    els.growth.textContent = '—';
    els.growth.className = 'num';
    els.growthLbl.textContent = '';
    return;
  }

  const first = pts[0], last = pts[pts.length - 1];
  els.curAvg.textContent = last.val.toFixed(1) + 's';
  els.curAcc.textContent = Math.round(last.acc) + '%';

  if(pts.length < 2 || first.val <= 0){
    els.growth.textContent = '—';
    els.growth.className = 'num';
    els.growthLbl.textContent = 'play on another day to see growth';
    return;
  }
  const pct = Math.round(((first.val - last.val) / first.val) * 100);
  els.growth.textContent = (pct >= 0 ? '+' : '') + pct + '%';
  els.growth.className = 'num ' + (pct >= 0 ? 'pos' : 'neg');
  els.growthLbl.textContent = (pct >= 0 ? 'faster' : 'slower') + ' vs ' + first.label;
  els.title.textContent = pct >= 3 ? 'Getting faster' : (pct <= -3 ? 'Slowing down' : 'Holding steady');
}

// ============================================================
// OVERVIEW
// ============================================================
const histEls = {
  mount: document.getElementById('histTrend'),
  title: document.getElementById('histTrendTitle'),
  curAvg: document.getElementById('histCurrentAvg'),
  curAcc: document.getElementById('histCurrentAcc'),
  growth: document.getElementById('histGrowth'),
  growthLbl: document.getElementById('histGrowthLbl')
};
const sessionsListEl = document.getElementById('sessionsList');
const histSkillGridEl = document.getElementById('histSkillGrid');
const CHEVRON_SVG = '<svg class="sk-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

function renderHistSkillGrid(){
  histSkillGridEl.innerHTML = '';
  SKILL_ORDER.forEach(key => {
    const card = document.createElement('button');
    card.className = 'skill-card ' + SKILL_CLASS[key];
    card.dataset.skill = key;
    card.innerHTML =
      '<div class="sk-top"><div class="sk-top-left"><div class="sk-icon">' + SKILL_ICON[key] + '</div>'
      + '<div class="sk-name">' + skillDisplayLabels[key] + '</div></div>' + CHEVRON_SVG + '</div>';
    histSkillGridEl.appendChild(card);
  });
}

function renderRecentSessions(){
  const seeAll = document.getElementById('btnSeeFullHistory');
  const rounds = allRounds();
  if(rounds.length === 0){
    sessionsListEl.innerHTML = '<div class="empty-list-note">No rounds played yet — finish a round to see it here.</div>';
    seeAll.style.display = 'none';
    return;
  }
  seeAll.style.display = 'block';
  sessionsListEl.innerHTML = groupedRowsHtml(rounds.slice(-10).reverse(), true);
}

function renderHistory(){
  closeLevelPop();
  renderTrendCard(histEls, trendPointsFor(sessions));
  renderHistSkillGrid();
  renderRecentSessions();
}

wireLevelPopovers(sessionsListEl);
wireRowReview(sessionsListEl);
histSkillGridEl.addEventListener('click', (e) => {
  const card = e.target.closest('.skill-card');
  if(card) openSkillDetail(card.dataset.skill);
});
document.getElementById('btnSeeFullHistory').addEventListener('click', () => openFullHistory());
wireTooltipBtn('btnExportHistory', 'tipExportHistory');
wireTooltipBtn('btnImportHistory', 'tipImportHistory');

// ============================================================
// SKILL DETAIL
// ============================================================
const skdEls = {
  mount: document.getElementById('skdTrend'),
  title: document.getElementById('skdTrendTitle'),
  curAvg: document.getElementById('skdCurrentAvg'),
  curAcc: document.getElementById('skdCurrentAcc'),
  growth: document.getElementById('skdGrowth'),
  growthLbl: document.getElementById('skdGrowthLbl')
};
const skdListEl = document.getElementById('skdSessionsList');
const skdEmptyNote = document.getElementById('skdEmptyNote');
const skdPaginationEl = document.getElementById('skdPagination');
let skdCurrentKey = null;
let skdPage = 1;

function renderSkillDetail(){
  const key = skdCurrentKey;
  if(!key) return;
  closeLevelPop();
  const label = skillDisplayLabels[key];
  const list = sessions.filter(s => s.skill === key);

  const icon = document.getElementById('skdPageTitleIcon');
  icon.textContent = SKILL_ICON[key];
  icon.style.background = 'var(--sk-' + key + '-soft)';
  icon.style.color = 'var(--sk-' + key + ')';
  document.getElementById('skdPageTitleText').textContent = label;
  document.getElementById('skdTrendDesc').textContent = 'Average answer time per session — ' + label + ' only';
  document.getElementById('skdSectionLabel').textContent = 'All sessions — ' + label;

  renderTrendCard(skdEls, trendPointsFor(list));

  const rows = allRounds().filter(s => s.skill === key);
  if(rows.length === 0){
    skdListEl.innerHTML = '';
    skdPaginationEl.innerHTML = '';
    skdEmptyNote.style.display = 'block';
    skdEmptyNote.textContent = 'No ' + label + ' rounds yet — play one to see it here.';
    return;
  }
  skdEmptyNote.style.display = 'none';
  const pages = Math.max(1, Math.ceil(rows.length / FULL_PAGE_SIZE));
  skdPage = Math.min(Math.max(1, skdPage), pages);
  const slice = rows.slice().reverse().slice((skdPage - 1) * FULL_PAGE_SIZE, skdPage * FULL_PAGE_SIZE);
  skdListEl.innerHTML = groupedRowsHtml(slice, false);
  skdPaginationEl.innerHTML = pagerHtml(skdPage, pages);
}

function openSkillDetail(key){
  skdCurrentKey = key;
  skdPage = 1;
  renderSkillDetail();
  showView('historySkill');
}

wireLevelPopovers(skdListEl);
wireRowReview(skdListEl);
skdPaginationEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.page-btn');
  if(!btn || btn.disabled || btn.classList.contains('active')) return;
  skdPage = parseInt(btn.dataset.page, 10);
  renderSkillDetail();
  skdListEl.closest('.sessions-section').scrollIntoView({ behavior:'smooth', block:'start' });
});
wireTooltipBtn('btnSkdExport', 'tipSkdExport');
wireTooltipBtn('btnSkdImport', 'tipSkdImport');

// ============================================================
// FULL HISTORY (15 per page)
// ============================================================
const fullListEl = document.getElementById('fullSessionsList');
const fullPaginationEl = document.getElementById('fullPagination');
const fullCountNoteEl = document.getElementById('fullCountNote');
const fullEmptyEl = document.getElementById('fullEmptyState');
let fullPage = 1;

function renderFullHistory(){
  closeLevelPop();
  const rounds = allRounds();
  const total = rounds.length;
  if(total === 0){
    fullListEl.innerHTML = '';
    fullPaginationEl.innerHTML = '';
    fullCountNoteEl.textContent = '';
    fullEmptyEl.style.display = 'block';
    return;
  }
  fullEmptyEl.style.display = 'none';
  const pages = Math.max(1, Math.ceil(total / FULL_PAGE_SIZE));
  fullPage = Math.min(Math.max(1, fullPage), pages);
  const slice = rounds.slice().reverse().slice((fullPage - 1) * FULL_PAGE_SIZE, fullPage * FULL_PAGE_SIZE);
  fullCountNoteEl.textContent = total + (total === 1 ? ' session total' : ' sessions total');
  fullListEl.innerHTML = groupedRowsHtml(slice, true);
  fullPaginationEl.innerHTML = pagerHtml(fullPage, pages);
}

function openFullHistory(){
  fullPage = 1;
  renderFullHistory();
  showView('historyFull');
}

wireLevelPopovers(fullListEl);
wireRowReview(fullListEl);
fullPaginationEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.page-btn');
  if(!btn || btn.disabled || btn.classList.contains('active')) return;
  fullPage = parseInt(btn.dataset.page, 10);
  renderFullHistory();
  fullListEl.scrollIntoView({ behavior:'smooth', block:'start' });
});

// ============================================================
// EXPORT / IMPORT (always ALL sessions, shared by Overview and Skill Detail buttons)
// ============================================================
function exportHistory(){
  const blob = new Blob([JSON.stringify(sessions, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'numbers-history-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
document.getElementById('btnExportHistory').addEventListener('click', exportHistory);
document.getElementById('btnSkdExport').addEventListener('click', exportHistory);

const importFileInput = document.getElementById('importFileInput');
document.getElementById('btnImportHistory').addEventListener('click', () => importFileInput.click());
document.getElementById('btnSkdImport').addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const imported = JSON.parse(reader.result);
      if(!Array.isArray(imported)) throw new Error('bad format');
      const existingDates = new Set(sessions.map(s => s.date));
      const merged = sessions.concat(imported.filter(s => s && typeof s.date === 'number' && !existingDates.has(s.date)));
      merged.sort((a, b) => a.date - b.date);
      sessions = merged;
      saveSessions(sessions);
      renderHistory();
      if(document.getElementById('view-history-skill').classList.contains('active')) renderSkillDetail();
      if(document.getElementById('view-history-full').classList.contains('active')) renderFullHistory();
      if(typeof renderHomeDashboard === 'function') renderHomeDashboard();
    }catch(err){
      alert('Could not read that file — make sure it\'s a history export from this app.');
    }
  };
  reader.readAsText(file);
  importFileInput.value = '';
});
