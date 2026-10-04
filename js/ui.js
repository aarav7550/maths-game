// ============================================================
// UI.JS — home dashboard, difficulty picker, challenge code popup + enter-code (Create screen lives in challenge.js)
// ============================================================

// ---------- difficulty presets ----------
// Each preset fills range (+ count for additions); parity is left alone.
// decimalPct (additions only) = % of questions that contain decimal numbers. Missing = never.
const DIFFICULTY_PRESETS = {
  half: {
    veryeasy: { min: 1, max: 99, secs: 8 },
    easy: { min: 100, max: 299, secs: 10 },
    difficult: { min: 300, max: 999, secs: 13 },
    verydifficult: { min: 1000, max: 9999, secs: 20 }
  },
  x2: {
    veryeasy: { min: 1, max: 100, secs: 8 },
    easy: { min: 100, max: 500, secs: 13 },
    difficult: { min: 500, max: 1000, secs: 15 },
    verydifficult: { min: 1000, max: 10000, secs: 17 }
  },
  x3: {
    veryeasy: { min: 1, max: 30, secs: 10 },
    easy: { min: 30, max: 100, secs: 15 },
    difficult: { min: 100, max: 300, secs: 21 },
    verydifficult: { min: 300, max: 500, secs: 25 }
  },
  add: {
    veryeasy: { min: 1, max: 99, count: 2, secs: 9 },
    easy: { min: 1, max: 999, count: 2, secs: 15, decimalPct: 20 },
    difficult: { min: 1, max: 999, count: 3, secs: 25, decimalPct: 30 },
    verydifficult: { min: 1, max: 9999, count: 4, secs: 30, decimalPct: 40 }
  },
  // Square / Cube have no Very Difficult yet - a skill only shows the levels listed here.
  sq: {
    veryeasy: { min: 1, max: 15, secs: 5 },
    easy: { min: 16, max: 30, secs: 8 },
    difficult: { min: 31, max: 100, secs: 20 }
  },
  cube: {
    veryeasy: { min: 1, max: 15, secs: 8 },
    easy: { min: 16, max: 30, secs: 10 },
    difficult: { min: 31, max: 100, secs: 30 }
  },
  // Tables: asks x × n, x from the range, n from 2-9.
  table: {
    veryeasy: { min: 1, max: 10, secs: 8 },
    easy: { min: 11, max: 20, secs: 10 },
    difficult: { min: 21, max: 30, secs: 15 },
    verydifficult: { min: 31, max: 40, secs: 18 }
  },
  // Reciprocals: difficulty = direction, not range, so both levels share 1-30 and differ by `mode`.
  // `label` / `note` override the auto-built range text on the picker pills.
  recip: {
    easy: { min: 1, max: 30, mode: 'fwd', secs: 10, label: 'Fraction → %', note: 'Numbers from <b>1–30</b>. You get <b>1/7</b>, type the percentage (14.28).' },
    difficult: { min: 1, max: 30, mode: 'rev', secs: 13, label: '% → Fraction', note: 'Numbers from <b>1–30</b>. You get <b>14.28%</b>, type the number under the 1 (7).' }
  }
};
// Order the levels appear in the picker. A skill only shows the ones it has presets for.
const DIFF_ORDER = ['veryeasy','easy','difficult','verydifficult'];
// Skills with no Custom option (Reciprocals has no range worth customising).
const NO_CUSTOM = { recip: true };
// Custom ranges have no preset of their own, so they borrow the Difficult level's timer.
const CUSTOM_TIMER_LEVEL = 'difficult';
const skillDisplayLabels = { half:'Halving', x2:'× 2', x3:'× 3', add:'Additions', sq:'Square', cube:'Cube', table:'Tables', recip:'Reciprocals' };

// ---------- more-options menu (About us / Report a bug) ----------
const btnMoreMenu = document.getElementById('btnMoreMenu');
const moreMenuDropdown = document.getElementById('moreMenuDropdown');
btnMoreMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  moreMenuDropdown.classList.toggle('open');
});
document.addEventListener('click', () => moreMenuDropdown.classList.remove('open'));
// btnAboutUs / btnReportBug are wired in js/info.js (About us + Report a bug pages).

// ---------- greeting + display name (mobile widget + desktop variant) ----------
// Greeting messages + pickGreeting() live in js/greetings.js
const greetingLine = pickGreeting(); // chosen once per page load

const PENCIL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const greetText = document.getElementById('greetText');
const greetName = document.getElementById('greetName');
const dgreetText = document.getElementById('dgreetText');
const dgreetName = document.getElementById('dgreetName');

function renderGreeting(){
  const name = getDisplayName();
  greetText.textContent = greetingLine;
  dgreetText.textContent = greetingLine;
  [ [greetName], [dgreetName] ].forEach(([el]) => {
    if(name){
      el.className = el === greetName ? 'greet-name' : 'dgreet-name';
      el.textContent = name;
      el.setAttribute('aria-label', 'Change your name, currently ' + name);
    } else {
      el.className = (el === greetName ? 'greet-name' : 'dgreet-name') + ' unset';
      el.innerHTML = 'set a name ' + PENCIL_SVG;
      el.setAttribute('aria-label', 'Set your name');
    }
  });
  if(window.updateGreetingScroll) window.updateGreetingScroll();
}
renderGreeting();

// Scroll effect (mobile + desktop): as the Home screen scrolls, the name shrinks until it is the
// same size as the greeting line. It finishes shrinking well before the name reaches the top of
// the screen. It is computed from the scroll position, so scrolling back up reverses it.
(function(){
  const view = document.getElementById('view-home');
  const SHRINK_FRACTION = 0.6;  // shrink finishes after scrolling this fraction of the name's distance from the top
  const pairs = [ [greetText, greetName], [dgreetText, dgreetName] ];
  let ticking = false;

  function apply(){
    ticking = false;
    const viewTop = view.getBoundingClientRect().top;
    pairs.forEach(([msg, name]) => {
      if(!name.offsetParent) return;                       // hidden variant (mobile vs desktop)
      name.style.opacity = '';
      if(name.classList.contains('unset')){                // "set a name" pill: leave it alone
        name.style.transform = ''; return;
      }
      // where the name sits (from the top of the scroll area) when not scrolled; scaling from the top edge doesn't move it
      const restTop = name.getBoundingClientRect().top - viewTop + view.scrollTop;
      const distance = Math.max(1, restTop * SHRINK_FRACTION);
      const progress = Math.max(0, Math.min(view.scrollTop / distance, 1));
      const target = parseFloat(getComputedStyle(msg).fontSize) / parseFloat(getComputedStyle(name).fontSize);
      const scale = 1 - progress * (1 - target);
      name.style.transform = 'scale(' + scale.toFixed(3) + ')';
    });
  }
  function schedule(){ if(!ticking){ requestAnimationFrame(apply); ticking = true; } }

  view.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule);
  window.updateGreetingScroll = apply;   // renderGreeting() calls this after the name changes
  apply();
})();

const nameOverlay = document.getElementById('nameOverlay');
const nameInput = document.getElementById('nameInput');
function openNameEditor(){
  nameInput.value = getDisplayName();
  nameOverlay.classList.add('show');
  setTimeout(() => { nameInput.focus(); nameInput.select(); }, 60);
}
function closeNameEditor(){ nameOverlay.classList.remove('show'); nameInput.blur(); }
function commitName(){
  setDisplayName(nameInput.value);
  renderGreeting();
  closeNameEditor();
}
greetName.addEventListener('click', openNameEditor);
dgreetName.addEventListener('click', openNameEditor);
document.getElementById('nameSave').addEventListener('click', commitName);
document.getElementById('nameCancel').addEventListener('click', closeNameEditor);
nameOverlay.addEventListener('click', (e) => { if(e.target === nameOverlay) closeNameEditor(); });
nameInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); commitName(); }
  else if(e.key === 'Escape'){ closeNameEditor(); }
});

// ---------- shared trend chart ----------
// Extracted to js/trendchart.js (Step 4) — TrendChart is a global defined there,
// loaded before this file. Both Home's history card and History's trend card call
// TrendChart.mount() against it.

// ---------- dashboard rendering (real data — sessions + skillConfig) ----------
const SKILL_ICON = { half:'÷2', x2:'×2', x3:'×3', add:'+', sq:'x²', cube:'x³', table:'6×7', recip:'1/n' };
const SKILL_CLASS = { half:'c-half', x2:'c-x2', x3:'c-x3', add:'c-add', sq:'c-sq', cube:'c-cube', table:'c-table', recip:'c-recip' };
const SKILL_DESC = { half:'Split a number in two', x2:'Double it', x3:'Triple it', add:'Add several numbers together',
  sq:'Square the number', cube:'Cube the number', table:'Recall multiplication tables', recip:'1/n as a percentage' };
const SKILL_COLOR = { half:'#3B6FE0', x2:'#1F9D6C', x3:'#DB8B1E', add:'#A6459B', sq:'#C6473A', cube:'#2E8FA6', table:'#6C63C6', recip:'#7E9A22' };   // keep in sync with --sk-* in style.css
// Which home-screen grid (element id in index.html) each skill's card goes into.
const SKILL_GROUPS = {
  skillGrid: ['half','x2','x3','add'],
  skillGridPowers: ['sq','cube'],
  skillGridRecall: ['table','recip']
};

function renderDashboardStats(){
  const streak = computeHomeStreak();
  document.getElementById('streakNum').textContent = streak > 0 ? (streak + ' 🔥') : String(streak);

  document.getElementById('statToday').textContent = String(getTodayQuestionCount());

  const sevenDayAcc = getSevenDayAccuracy();
  document.getElementById('stat7dAcc').textContent = sevenDayAcc === null ? '—' : sevenDayAcc + '%';
  document.getElementById('stat7dSub').textContent = sevenDayAcc === null ? 'no rounds yet' : 'last 7 days';

  const last = getLastSession();
  document.getElementById('statLastAvg').textContent = last ? last.avgTime.toFixed(1) + 's' : '—';
  document.getElementById('statLastAcc').textContent = last ? last.accuracy + '% accuracy' : 'no rounds yet';

  // History card — same numbers as the History Overview card (see renderTrendCard in history.js):
  // left = latest day's avg time + accuracy, right = change since the first day on the graph.
  // (Kept local on purpose: history.js loads AFTER this file, and this runs once at load.)
  const hcTitle = document.getElementById('hcTitle');
  const curAvgEl = document.getElementById('hcCurAvg');
  const curAccEl = document.getElementById('hcCurAcc');
  const growthEl = document.getElementById('hcGrowth');
  const growthLblEl = document.getElementById('hcGrowthLbl');
  const trendPoints = sessions.map(s => ({ ts: s.date, val: s.avgTime, acc: s.accuracy }));
  const homeChart = TrendChart.mount(document.getElementById('homeTrend'), trendPoints);
  const hpts = homeChart ? homeChart.pts : [];

  hcTitle.textContent = trendPoints.length === 0 ? 'Getting started' : 'Your progress';
  growthEl.className = 'num';
  growthLblEl.textContent = '';
  if(hpts.length === 0){
    curAvgEl.textContent = '—';
    curAccEl.textContent = '—';
    growthEl.textContent = '—';
  } else {
    const p0 = hpts[0], p1 = hpts[hpts.length - 1];
    curAvgEl.textContent = p1.val.toFixed(1) + 's';
    curAccEl.textContent = Math.round(p1.acc) + '%';
    if(hpts.length < 2 || p0.val <= 0){
      growthEl.textContent = '—';
      growthLblEl.textContent = 'play on another day to see growth';
    } else {
      const pct = Math.round(((p0.val - p1.val) / p0.val) * 100);
      growthEl.textContent = (pct >= 0 ? '+' : '') + pct + '%';
      growthEl.className = 'num ' + (pct >= 0 ? 'pos' : 'neg');
      growthLblEl.textContent = (pct >= 0 ? 'faster' : 'slower') + ' vs ' + p0.label;
      hcTitle.textContent = pct >= 3 ? 'Getting faster' : (pct <= -3 ? 'Slowing down' : 'Holding steady');
    }
  }

  // Feeling brave strip stats — best avg + overall accuracy across mixed-mode rounds only
  const mixedSessions = sessions.filter(s => s.skill === 'mixed');
  const bsAvg = document.getElementById('bsAvg');
  const bsAcc = document.getElementById('bsAcc');
  if(mixedSessions.length === 0){
    bsAvg.textContent = '—';
    bsAcc.textContent = '—';
  } else {
    bsAvg.textContent = Math.min(...mixedSessions.map(s => s.avgTime)).toFixed(1) + 's';
    bsAcc.textContent = Math.round(mixedSessions.reduce((a,s) => a+s.accuracy, 0) / mixedSessions.length) + '%';
  }
}

function renderSkillCards(){
  Object.keys(SKILL_GROUPS).forEach(id => renderSkillGrid(id, SKILL_GROUPS[id]));
}
function renderSkillGrid(gridId, keys){
  const grid = document.getElementById(gridId);
  grid.innerHTML = '';
  keys.forEach(key => {
    const skillSessions = sessions.filter(s => s.skill === key);
    const hasData = skillSessions.length > 0;
    const avg = hasData ? skillSessions.reduce((a,s) => a+s.avgTime, 0) / skillSessions.length : null;
    const acc = hasData ? Math.round(skillSessions.reduce((a,s) => a+s.accuracy, 0) / skillSessions.length) : null;
    // progress bar: how close recent accuracy is to 100%, just a simple visual — not a claim of mastery
    const progressPct = hasData ? Math.max(4, Math.min(100, acc)) : 0;

    const card = document.createElement('button');
    card.className = 'skill-card ' + SKILL_CLASS[key];
    card.dataset.skill = key;
    card.style.setProperty('--sc', SKILL_COLOR[key]);
    card.innerHTML = `
      <div class="sk-top">
        <div class="sk-icon">${SKILL_ICON[key]}</div>
        <div>
          <div class="sk-name">${skillDisplayLabels[key]}</div>
          <div class="sk-desc">${SKILL_DESC[key]}</div>
        </div>
      </div>
      <div class="sk-progress-track"><div class="sk-progress-fill" style="width:${progressPct}%"></div></div>
      <div class="sk-nums">
        <div class="sk-stat"><div class="num">${hasData ? avg.toFixed(1)+'s' : '—'}</div><div class="lbl">Avg</div></div>
        <div class="sk-stat"><div class="num">${hasData ? acc+'%' : '—'}</div><div class="lbl">Accuracy</div></div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Streak = consecutive days with at least one real (non-practice) round. If you haven't played
// TODAY yet the streak is still alive as long as you played yesterday — it only resets to 0 once
// a whole day has been missed. Counted here from `sessions` so it doesn't depend on storage.js.
function computeHomeStreak(){
  const dayKey = (ts) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const played = new Set(sessions.map(s => dayKey(s.date)));
  const now = new Date();
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if(!played.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 1); // not played today yet -> start from yesterday
  let streak = 0;
  while(played.has(cursor.getTime())){
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderHomeDashboard(){
  renderDashboardStats();
  renderSkillCards();
}
renderHomeDashboard();

Object.keys(SKILL_GROUPS).forEach(id => {
  document.getElementById(id).addEventListener('click', (e) => {
    const card = e.target.closest('.skill-card');
    if(!card || card.classList.contains('soon')) return;
    openDifficultyPicker(card.dataset.skill);
  });
});

document.getElementById('historyCard').addEventListener('click', () => {
  renderHistory();
  showView('history');
});

// Mixed drill strip: shows a "coming soon" popup for now — Mixed needs an Include tab +
// per-skill config the Difficulty Picker doesn't have yet. (Challenge codes that contain
// several skills still start a mixed round; only this Home entry point is blocked.)
const mixedSoonModal = document.getElementById('mixedSoonModal');
function closeMixedSoon(){ mixedSoonModal.classList.remove('show'); }
document.getElementById('btnMixedStart').addEventListener('click', () => mixedSoonModal.classList.add('show'));
document.getElementById('btnSoonClose').addEventListener('click', closeMixedSoon);
document.getElementById('btnSoonOk').addEventListener('click', closeMixedSoon);
mixedSoonModal.addEventListener('click', (e) => { if(e.target === mixedSoonModal) closeMixedSoon(); });

// ---------- Difficulty Picker ----------
const DIFF_LABELS = { veryeasy:'Very Easy', easy:'Easy', difficult:'Difficult', verydifficult:'Very Difficult', custom:'Custom' };
const CUSTOM_NOTE = {
  half: 'Pick your own min/max and number type before you start.',
  x2: 'Pick your own min/max before you start.',
  x3: 'Pick your own min/max before you start.',
  add: 'Pick your own min/max and how many numbers to add.',
  sq: 'Pick your own min/max and number type before you start.',
  cube: 'Pick your own min/max and number type before you start.',
  table: 'Pick the range for the first number (it is multiplied by 2–9).'
};
const LEVEL_READY_MESSAGE = {
  veryeasy: 'Easing in, nice and steady.',
  easy: "You've got this.",
  difficult: 'Feeling brave?',
  verydifficult: "Don't say we didn't warn you.",
  custom: 'Going off script?'
};

let CURRENT_SKILL = null;
let pickerLevel = null; // 'veryeasy'|'easy'|'difficult'|'verydifficult'|'custom'|null — reset each open
let pickerCustom = null; // deep copy of this skill's config, edited live if level === 'custom'
let selectedQuestionCount = 15;

const diffModalOverlay = document.getElementById('diffModalOverlay');
const diffModal = document.getElementById('diffModal');
const dmIcon = document.getElementById('dmIcon');
const dmSkillname = document.getElementById('dmSkillname');
const diffCardMount = document.getElementById('diffCardMount');
const dssSub = document.getElementById('dssSub');
const btnStartRound = document.getElementById('btnStartRound');
const qcountBar = document.getElementById('qcountBar');
const qcountCustomBtn = document.getElementById('qcountCustomBtn');
const qcountInlineValue = document.getElementById('qcountInlineValue');

// Range label shown on each preset pill, built from the real DIFFICULTY_PRESETS.
function presetLabel(skillKey, level){
  const p = DIFFICULTY_PRESETS[skillKey][level];
  if(p.label) return p.label;
  if(skillKey === 'add') return `${p.min}–${p.max}, ${p.count} numbers`;
  return `${p.min}–${p.max}`;
}
// Real presets carry no explanatory note text (that was mockup-only flavor) — build a
// plain factual one from the actual numbers instead of inventing copy that might mislead.
function presetNote(skillKey, level){
  const p = DIFFICULTY_PRESETS[skillKey][level];
  if(p.note) return p.note;
  if(skillKey === 'add') return `Add <b>${p.count} numbers</b> from ${p.min}–${p.max}.`;
  return `Numbers from <b>${p.min}–${p.max}</b>.`;
}

function buildConfigCard(skillKey){
  const isAdd = skillKey === 'add';
  const isCustom = pickerLevel === 'custom';

  const pillHtml = (level) => `
    <button class="diff-opt ${pickerLevel===level?'active':''}" data-level="${level}">
      <div class="do-name">${DIFF_LABELS[level]}</div>
      <div class="do-range">${presetLabel(skillKey, level)}</div>
      <span class="info-btn" onclick="event.stopPropagation(); toggleNote(this)">
        <span class="info-dot">i</span>
        <span class="info-note"><span class="in-arrow"></span>${presetNote(skillKey, level)}</span>
      </span>
    </button>`;

  let customRowsHtml = `
    <div class="config-row">
      <label>Range</label>
      <div class="range-inputs">
        <input type="number" class="range-input" data-field="min" value="${pickerCustom.min}">
        <span class="dim">–</span>
        <input type="number" class="range-input" data-field="max" value="${pickerCustom.max}">
      </div>
    </div>`;

  if(!isAdd){
    customRowsHtml += `
    <div class="config-row">
      <label>Type</label>
      <div class="segmented" data-seg="parity">
        <button data-v="any" class="${pickerCustom.parity==='any'?'active':''}">Any</button>
        <button data-v="even" class="${pickerCustom.parity==='even'?'active':''}">Even</button>
        <button data-v="odd" class="${pickerCustom.parity==='odd'?'active':''}">Odd</button>
      </div>
    </div>`;
  }

  if(isAdd){
    const count = pickerCustom.count || 2;
    const countIsCustomVal = ![2,3,4].includes(count);
    customRowsHtml += `
    <div class="config-row">
      <label>How many</label>
      <div class="segmented count-seg" data-seg="count">
        <button data-v="2" class="${count===2?'active':''}">2</button>
        <button data-v="3" class="${count===3?'active':''}">3</button>
        <button data-v="4" class="${count===4?'active':''}">4</button>
        <button data-v="custom" class="count-custom-btn ${countIsCustomVal?'active editing':''}" title="Custom count" aria-label="Custom count">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          <input type="number" class="count-custom-input" min="1" style="display:${countIsCustomVal?'block':'none'};" value="${countIsCustomVal ? count : ''}">
        </button>
      </div>
    </div>`;
  }

  // Only the levels this skill has presets for, plus Custom unless the skill opts out.
  // Buttons are laid out two per row; an odd one out gets a row to itself.
  const customPill = `
        <button class="diff-opt ${isCustom?'active':''}" data-level="custom">
          <div class="do-name">Custom</div>
          <div class="do-range">Set your own</div>
          <span class="info-btn" onclick="event.stopPropagation(); toggleNote(this)">
            <span class="info-dot">i</span>
            <span class="info-note"><span class="in-arrow"></span>${CUSTOM_NOTE[skillKey] || ''}</span>
          </span>
        </button>`;
  const pills = DIFF_ORDER.filter(l => DIFFICULTY_PRESETS[skillKey][l]).map(pillHtml);
  if(!NO_CUSTOM[skillKey]) pills.push(customPill);
  let rowsHtml = '';
  for(let i = 0; i < pills.length; i += 2){
    const chunk = pills.slice(i, i + 2);
    rowsHtml += `<div class="diff-row ${chunk.length === 2 ? 'pair' : 'single'}">${chunk.join('')}</div>`;
  }

  const card = document.createElement('div');
  card.className = 'diff-card';
  card.dataset.skill = skillKey;
  card.innerHTML = `
    <div class="diff-rows">
      ${rowsHtml}
    </div>
    <div class="custom-editor ${isCustom?'show':''}">
      <div class="config-rows">${customRowsHtml}</div>
      <div class="ce-error" id="ceError">Enter a valid min and max (min below max).</div>
    </div>
  `;
  return card;
}

function refreshCard(){
  diffCardMount.innerHTML = '';
  diffCardMount.appendChild(buildConfigCard(CURRENT_SKILL));
}

function isSelectionReady(){
  if(!pickerLevel) return false;
  if(pickerLevel === 'custom'){
    const min = parseInt(pickerCustom.min, 10);
    const max = parseInt(pickerCustom.max, 10);
    return Number.isFinite(min) && Number.isFinite(max) && min < max;
  }
  return true;
}

// How many questions a skill + range can give without repeating a number. Greyed-out question
// counts above this keep the no-repeat promise (and the 1–30 reciprocals from running dry).
function questionPoolSize(key, cfg){
  const lo = Math.min(cfg.min, cfg.max), hi = Math.max(cfg.min, cfg.max);
  const parity = cfg.parity || 'any';
  if(key === 'add') return Infinity;
  if(key === 'recip') return Math.max(0, Math.min(30, hi) - Math.max(1, lo) + 1);
  if(key === 'table') return countPoolSize(lo, hi, parity) * 8;   // x from the range, n from 2-9
  return countPoolSize(lo, hi, parity);
}
function pickerMaxQuestions(){
  if(!pickerLevel) return Infinity;
  let cfg;
  if(pickerLevel === 'custom') cfg = pickerCustom;
  else {
    const p = DIFFICULTY_PRESETS[CURRENT_SKILL][pickerLevel];
    cfg = { min: p.min, max: p.max, parity: skillConfig[CURRENT_SKILL].parity || 'any' };
  }
  if(!Number.isFinite(cfg.min) || !Number.isFinite(cfg.max) || cfg.min >= cfg.max) return Infinity;  // invalid custom: Start is blocked anyway
  return questionPoolSize(CURRENT_SKILL, cfg);
}
// Greys out (and disables) question counts that are too big for the chosen level/range.
function applyQcountLimits(){
  const max = pickerMaxQuestions();
  const opts = [...qcountBar.querySelectorAll('.qcount-opt')].filter(o => o !== qcountCustomBtn);
  opts.forEach(o => { o.disabled = parseInt(o.dataset.n, 10) > max; });
  qcountInlineValue.max = Number.isFinite(max) ? max : '';
  if(selectedQuestionCount > max){
    const ok = opts.filter(o => !o.disabled).pop();   // largest preset that still fits
    qcountBar.querySelectorAll('.qcount-opt').forEach(o => o.classList.remove('active'));
    if(ok){
      ok.classList.add('active');
      qcountCustomBtn.classList.remove('expanded');
      qcountBar.classList.remove('custom-active');
      selectedQuestionCount = parseInt(ok.dataset.n, 10);
    } else {                                           // even 15 is too many: fall back to the custom box
      qcountCustomBtn.classList.add('active', 'expanded');
      qcountBar.classList.add('custom-active');
      qcountInlineValue.value = max;
      selectedQuestionCount = max;
    }
  }
}

function updateStartStrip(){
  const ready = isSelectionReady();
  btnStartRound.disabled = !ready;
  if(!pickerLevel){
    dssSub.textContent = 'Pick a difficulty above to begin';
  } else if(pickerLevel === 'custom'){
    dssSub.textContent = ready ? LEVEL_READY_MESSAGE.custom : 'Enter a valid min and max above';
  } else {
    dssSub.textContent = LEVEL_READY_MESSAGE[pickerLevel];
  }
  applyQcountLimits();
}

function openDifficultyPicker(skillKey){
  CURRENT_SKILL = skillKey;
  pickerLevel = null; // deliberate: opening never pre-selects a level
  pickerCustom = Object.assign({}, skillConfig[skillKey]); // start custom editor from saved config
  selectedQuestionCount = 15;
  practiceCheckbox.checked = false; // opening never pre-ticks it, so a normal round is the default

  diffModal.style.setProperty('--sc', SKILL_COLOR[skillKey]);
  dmIcon.textContent = SKILL_ICON[skillKey];
  dmIcon.style.background = `color-mix(in srgb, ${SKILL_COLOR[skillKey]} 14%, #fff)`;
  dmIcon.style.color = SKILL_COLOR[skillKey];
  dmSkillname.textContent = skillDisplayLabels[skillKey];

  refreshCard();
  updateStartStrip();

  [...qcountBar.querySelectorAll('.qcount-opt')].forEach(o => o.classList.remove('active','expanded'));
  qcountBar.classList.remove('custom-active');
  qcountBar.querySelector('[data-n="15"]').classList.add('active');

  // The skill card you clicked still has keyboard focus under the popup; let go of it so
  // Enter means "start" and not "click that card again".
  if(document.activeElement && document.activeElement.blur) document.activeElement.blur();

  diffModalOverlay.classList.add('show');
}

function closeDifficultyPicker(){
  diffModalOverlay.classList.remove('show');
}
document.getElementById('btnDiffClose').addEventListener('click', closeDifficultyPicker);

// Desktop keyboard shortcuts for the difficulty picker: 1-5 pick a level (in the order shown,
// 5 = Custom), Enter starts the round. Ignored while typing in a box (digits) or when a button
// has focus (Enter already presses that button, so we must not also start the round).
document.addEventListener('keydown', (e) => {
  if(!diffModalOverlay.classList.contains('show')) return;
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if(e.key >= '1' && e.key <= '5'){
    if(tag === 'INPUT' || tag === 'TEXTAREA') return;
    const opt = diffCardMount.querySelectorAll('.diff-opt')[parseInt(e.key, 10) - 1];
    if(opt){ e.preventDefault(); opt.click(); }
  } else if(e.key === 'Enter'){
    if(e.repeat) return;
    // A button INSIDE the popup keeps its own Enter (e.g. Tab to a level, press Enter to pick it).
    // A button outside it is just stale focus left over from opening the popup, so ignore that.
    if(tag === 'BUTTON' && diffModalOverlay.contains(e.target)) return;
    if(!btnStartRound.disabled){ e.preventDefault(); btnStartRound.click(); }
  }
});
diffModalOverlay.addEventListener('click', (e) => { if(e.target === diffModalOverlay) closeDifficultyPicker(); });

diffCardMount.addEventListener('click', (e) => {
  const diffOpt = e.target.closest('.diff-opt');
  if(diffOpt){
    const level = diffOpt.dataset.level;
    if(level === 'custom'){
      pickerLevel = (pickerLevel === 'custom') ? null : 'custom';
      refreshCard();
      updateStartStrip();
      return;
    }
    pickerLevel = level;
    refreshCard();
    updateStartStrip();
    return;
  }

  const parityBtn = e.target.closest('[data-seg="parity"] button');
  if(parityBtn){
    const seg = parityBtn.closest('[data-seg="parity"]');
    seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    parityBtn.classList.add('active');
    pickerCustom.parity = parityBtn.dataset.v;
    applyQcountLimits();
    return;
  }

  const countBtn = e.target.closest('[data-seg="count"] button');
  if(countBtn){
    const seg = countBtn.closest('[data-seg="count"]');
    if(countBtn.classList.contains('count-custom-btn')){
      const input = countBtn.querySelector('.count-custom-input');
      if(countBtn.classList.contains('editing')){
        input.focus();
        return;
      }
      seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      countBtn.classList.add('active', 'editing');
      input.style.display = 'block';
      input.value = '';
      input.focus();
      input.select();
      return;
    }
    seg.querySelectorAll('button').forEach(b => {
      b.classList.remove('active');
      if(b.classList.contains('count-custom-btn')){
        b.classList.remove('editing');
        b.querySelector('.count-custom-input').style.display = 'none';
      }
    });
    countBtn.classList.add('active');
    pickerCustom.count = parseInt(countBtn.dataset.v, 10);
    return;
  }

  const countInput = e.target.closest('.count-custom-input');
  if(countInput){ e.stopPropagation(); return; }
});

diffCardMount.addEventListener('input', (e) => {
  const rangeInput = e.target.closest('.range-input');
  if(rangeInput){
    const field = rangeInput.dataset.field;
    const val = parseInt(rangeInput.value, 10);
    if(!Number.isNaN(val)) pickerCustom[field] = val;
    updateStartStrip();
    return;
  }
  const countInput = e.target.closest('.count-custom-input');
  if(countInput){
    const v = parseInt(countInput.value, 10);
    if(v > 0) pickerCustom.count = v;
    return;
  }
});

// ---------- question count bar ----------
qcountBar.querySelectorAll('.qcount-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    if(opt === qcountCustomBtn){
      qcountBar.querySelectorAll('.qcount-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active', 'expanded');
      qcountBar.classList.add('custom-active');
      qcountInlineValue.focus();
      if(qcountInlineValue.value){
        selectedQuestionCount = parseInt(qcountInlineValue.value, 10) || selectedQuestionCount;
      }
      return;
    }
    qcountBar.querySelectorAll('.qcount-opt').forEach(o => o.classList.remove('active'));
    qcountCustomBtn.classList.remove('expanded');
    qcountBar.classList.remove('custom-active');
    opt.classList.add('active');
    selectedQuestionCount = parseInt(opt.dataset.n, 10);
  });
});
qcountInlineValue.addEventListener('click', (e) => e.stopPropagation());
qcountInlineValue.addEventListener('input', () => {
  let v = parseInt(qcountInlineValue.value, 10);
  const max = pickerMaxQuestions();
  if(v > max){ v = max; qcountInlineValue.value = max; }
  if(v > 0) selectedQuestionCount = v;
});

// ---------- info-note popovers (clamped to modal bounds) ----------
const MODAL_MARGIN = 10;
function positionNote(btn){
  const note = btn.querySelector('.info-note');
  const arrow = note.querySelector('.in-arrow');
  const btnRect = btn.getBoundingClientRect();
  const modalRect = diffModal.getBoundingClientRect();
  const noteWidth = note.offsetWidth || 210;
  let left = btnRect.left + (btnRect.width / 2) - (noteWidth / 2);
  const top = btnRect.bottom + 8;
  const minLeft = modalRect.left + MODAL_MARGIN;
  const maxLeft = modalRect.right - MODAL_MARGIN - noteWidth;
  left = Math.max(minLeft, Math.min(left, maxLeft));
  note.style.left = left + 'px';
  note.style.top = top + 'px';
  const arrowLeft = (btnRect.left + btnRect.width / 2) - left;
  arrow.style.left = arrowLeft + 'px';
  arrow.style.marginLeft = '-5px';
}
function toggleNote(btn){
  const note = btn.querySelector('.info-note');
  const wasOpen = note.classList.contains('open');
  document.querySelectorAll('.info-note.open').forEach(n => n.classList.remove('open'));
  if(!wasOpen){
    positionNote(btn);
    note.classList.add('open');
  }
}
window.toggleNote = toggleNote;
document.addEventListener('mouseover', (e) => {
  const btn = e.target.closest('.info-btn');
  if(btn) positionNote(btn);
});
window.addEventListener('resize', () => {
  document.querySelectorAll('.info-note.open').forEach(n => positionNote(n.closest('.info-btn')));
});
document.addEventListener('click', (e) => {
  if(!e.target.closest('.info-btn')){
    document.querySelectorAll('.info-note.open').forEach(n => n.classList.remove('open'));
  }
});

// Bring focused number fields into view above the mobile keyboard — modal itself scrolls
// (it has overflow-y:auto), not the window.
document.addEventListener('focusin', (e) => {
  const field = e.target;
  if(!field.matches('input[type="number"], input[type="text"]')) return;
  setTimeout(() => {
    const modalRect = diffModal.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();
    const targetY = modalRect.top + (modalRect.height * 0.4);
    const delta = fieldRect.top - targetY;
    diffModal.scrollBy({ top: delta, behavior: 'smooth' });
  }, 200);
});

// ---------- Start round: commits picker's choice into real skillConfig, then plays ----------
btnStartRound.addEventListener('click', () => {
  if(!isSelectionReady()) return;
  const key = CURRENT_SKILL;

  if(pickerLevel === 'custom'){
    skillConfig[key] = Object.assign({}, skillConfig[key], pickerCustom);
  } else {
    const preset = DIFFICULTY_PRESETS[key][pickerLevel];
    skillConfig[key].min = preset.min;
    skillConfig[key].max = preset.max;
    if(key === 'add' && preset.count) skillConfig[key].count = preset.count;
    if(preset.mode) skillConfig[key].mode = preset.mode;
  }
  saveConfig();

  state.skill = key;
  state.totalQuestions = selectedQuestionCount;
  state.practiceMode = practiceCheckbox.checked;

  closeDifficultyPicker();
  startRound();
});

// ---------- session labeling helper (used by history.js/game.js) ----------

// Used by history.js/game.js to label past sessions against the real presets above.
function matchingDifficultyForConfig(key, cfg){
  const presets = DIFFICULTY_PRESETS[key];
  if(!presets || !cfg) return 'custom';
  const matches = (preset) => {
    if(cfg.min !== preset.min || cfg.max !== preset.max) return false;
    if(key === 'add' && (cfg.count || 2) !== (preset.count || 2)) return false;
    if(preset.mode && (cfg.mode || 'fwd') !== preset.mode) return false;
    return true;
  };
  for(const diffKey of Object.keys(presets)){
    if(matches(presets[diffKey])) return diffKey;
  }
  return 'custom';
}
// Seconds allowed per question for this skill + config (used by game.js for the timer bar).
function timerSecondsForConfig(key, cfg){
  const level = matchingDifficultyForConfig(key, cfg);
  const presets = DIFFICULTY_PRESETS[key];
  const preset = presets[level] || presets[CUSTOM_TIMER_LEVEL];
  return preset.secs;
}
// Estimated length of a round, in seconds, based on the same per-question timers the game uses.
// Players rarely use a question's whole timer, so the estimate counts only a fraction of it
// (ESTIMATE_TIMER_FRACTION; 0.5 = half the timer). Change that one number to make estimates longer/shorter.
// Mixed rounds pick each question's skill evenly from the included ones (see pickSkillKey in game.js),
// so the expected timer per question is the average of those skills' timers.
// included: array of skill keys   cfgBySkill: {skillKey: {min,max,count?}}   questionCount: number
const ESTIMATE_TIMER_FRACTION = 0.5;
function estimateRoundSeconds(included, cfgBySkill, questionCount){
  if(!included.length) return 0;
  const sumOfTimers = included.reduce((sum, k) => sum + timerSecondsForConfig(k, cfgBySkill[k]), 0);
  const avgTimer = sumOfTimers / included.length;
  return Math.round(questionCount * avgTimer * ESTIMATE_TIMER_FRACTION);
}
function matchingDifficulty(key){
  return matchingDifficultyForConfig(key, skillConfig[key]);
}

document.getElementById('btnHome').addEventListener('click', () => showView('home'));
document.getElementById('btnResultsBack').addEventListener('click', () => showView('home'));

// Go again: replay the same skill/config/question count with fresh questions.
// state.skill / totalQuestions / practiceMode still hold the round just finished.
document.getElementById('btnAgain').addEventListener('click', () => {
  if(state.fromChallenge && activeChallengeIncluded){
    // Challenge round: re-run its skills + settings, but with a new random seed
    pendingChallenge = {
      included: activeChallengeIncluded,
      cfg: activeChallengeCfg,
      n: state.totalQuestions,
      seed: randomSeed()
    };
  }
  startRound();
});
document.getElementById('btnShareSet').addEventListener('click', () => {
  // Reuses the exact seed from the round just played, so a "hard set" reproduces
  // literally — not just the same config with a fresh set of numbers.
  // Must reflect the skill(s) actually played in THIS round, not the live Mixed-mode
  // toggle state — activeIncludedList() falls back to includedSkillList() (the saved
  // mixed toggles) whenever this round wasn't itself started from a challenge code,
  // which is exactly the case for a normal single-skill round like halving.
  const included = activeChallengeIncluded
    ? activeChallengeIncluded
    : (state.skill === 'mixed' ? includedSkillList() : [state.skill]);
  if(included.length === 0) return;
  const cfgBySkill = {};
  included.forEach(k => cfgBySkill[k] = activeConfig(k));
  const payload = buildChallengePayload(included, cfgBySkill, state.totalQuestions, state.seed);
  showGeneratedCode(encodeChallengeCode(payload));
});
// History's own back button (btnHistoryBack) is now wired in history.js,
// alongside the rest of the History screen's DOM.

// Practice mode checkbox lives in the Difficulty Picker (above the Start strip).
// Ticked = no timer and the round is saved separately, not into history/stats.
const practiceCheckbox = document.getElementById('practiceToggle');

// ---------- challenge codes: show a generated code (used by challenge.js and the Results "share" button) ----------
const challengeShowModal = document.getElementById('challengeShowModal');
const challengeCodeText = document.getElementById('challengeCodeText');
function showGeneratedCode(code){
  challengeCodeText.textContent = code;
  challengeShowModal.classList.add('show');
}

document.getElementById('btnChallengeShowClose').addEventListener('click', () => {
  challengeShowModal.classList.remove('show');
});
document.getElementById('btnChallengeCopy').addEventListener('click', () => {
  const text = challengeCodeText.textContent;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).catch(()=>{});
  }
  const btn = document.getElementById('btnChallengeCopy');
  const original = btn.textContent;
  btn.textContent = 'Copied';
  setTimeout(() => { btn.textContent = original; }, 1200);
});
challengeShowModal.addEventListener('click', (e) => {
  if(e.target === challengeShowModal) challengeShowModal.classList.remove('show');
});

// History button: toggles into/out of the History view. Disabled entirely during a running round.
btnHistory.addEventListener('click', () => {
  if(state.running) return; // guarded, but also visually disabled during play
  if(views.history.classList.contains('active')){
    showView('home');
  } else {
    renderHistory();
    showView('history');
  }
});
