// ============================================================
// SKILLS.JS — skill generators, difficulty draw helpers, state, DOM refs
// ============================================================

// ---------- decimal additions ----------
// Turns a set of whole numbers into a question where one, two, or all of them get a
// decimal part (one place, 1-9 tenths). Sums are done in tenths (whole numbers) and divided
// by 10 once at the end, so answers like 16.8 are exact and match what the player types.
function decimalAdditionQuestion(nums){
  const n = nums.length;
  const options = [...new Set([1, Math.min(2, n), n])];   // how many numbers get decimals
  const howMany = options[randInt(0, options.length - 1)];
  const chosen = new Set();
  while(chosen.size < howMany) chosen.add(randInt(0, n - 1));
  const tenths = nums.map((v, i) => v * 10 + (chosen.has(i) ? randInt(1, 9) : 0));
  const text = tenths.map((t, i) => chosen.has(i) ? (t / 10).toFixed(1) : String(nums[i])).join(' + ');
  return { text, answer: tenths.reduce((a, b) => a + b, 0) / 10 };
}

// ---------- percentage reciprocals data ----------
// 1/n as a percentage. Where two roundings are both accepted (16.66 / 16.67), both are listed;
// the first one is the one shown on screen in the reverse mode and in the "right answer" reveal.
const RECIPROCALS = {
  1:[100], 2:[50], 3:[33.33], 4:[25], 5:[20], 6:[16.66,16.67], 7:[14.28,14.29], 8:[12.5], 9:[11.11],
  10:[10], 11:[9.09], 12:[8.33], 13:[7.69], 14:[7.14], 15:[6.66,6.67], 16:[6.25], 17:[5.88],
  18:[5.56], 19:[5.26], 20:[5], 21:[4.76], 22:[4.55], 23:[4.35], 24:[4.16,4.17], 25:[4],
  26:[3.84,3.85], 27:[3.7], 28:[3.57], 29:[3.45], 30:[3.33]
};

// ---------- skill generators ----------
const SKILLS = {
  half: {
    label: 'Halving',
    hasDecimals: true,   // odd numbers give answers like 241.5 (drives the one-time hint popup)
    gen(){
      const cfg = activeConfig('half');
      let min = Math.max(1, Math.min(cfg.min, cfg.max));
      let max = Math.max(cfg.min, cfg.max);
      const n = drawUnique('half', min, max, cfg.parity);
      return { text: `Half of ${n}`, answer: n/2 };
    }
  },
  x2: {
    label: '× 2',
    gen(){
      const cfg = activeConfig('x2');
      let min = Math.min(cfg.min, cfg.max), max = Math.max(cfg.min, cfg.max);
      const n = drawUnique('x2', min, max, cfg.parity);
      return { text: `${n} × 2`, answer: n*2 };
    }
  },
  x3: {
    label: '× 3',
    gen(){
      const cfg = activeConfig('x3');
      let min = Math.min(cfg.min, cfg.max), max = Math.max(cfg.min, cfg.max);
      const n = drawUnique('x3', min, max, cfg.parity);
      return { text: `${n} × 3`, answer: n*3 };
    }
  },
  add: {
    label: 'Additions',
    hasDecimals: true,   // some questions have decimal numbers (drives the one-time hint popup)
    gen(){
      const cfg = activeConfig('add');
      let min = Math.min(cfg.min,cfg.max), max = Math.max(cfg.min,cfg.max);
      const count = cfg.count || 2;
      const nums = drawUniqueSet('add', min, max, cfg.parity, count);
      // Chance of a decimal question comes from the level's preset (decimalPct in ui.js).
      // Very Easy and Custom have none.
      const level = matchingDifficultyForConfig('add', cfg);
      const pct = ((DIFFICULTY_PRESETS.add || {})[level] || {}).decimalPct || 0;
      if(pct > 0 && randInt(1, 100) <= pct) return decimalAdditionQuestion(nums);
      return { text: nums.join(' + '), answer: nums.reduce((a,b) => a+b, 0) };
    }
  },
  sq: {
    label: 'Square',
    gen(){
      const cfg = activeConfig('sq');
      let min = Math.min(cfg.min, cfg.max), max = Math.max(cfg.min, cfg.max);
      const n = drawUnique('sq', min, max, cfg.parity);
      return { text: `${n}²`, answer: n*n };
    }
  },
  cube: {
    label: 'Cube',
    gen(){
      const cfg = activeConfig('cube');
      let min = Math.min(cfg.min, cfg.max), max = Math.max(cfg.min, cfg.max);
      const n = drawUnique('cube', min, max, cfg.parity);
      return { text: `${n}³`, answer: n*n*n };
    }
  },
  table: {
    label: 'Tables',
    gen(){
      // x comes from the configured range, n is always 2-9. No repeated x×n pair within a round.
      const cfg = activeConfig('table');
      let min = Math.min(cfg.min, cfg.max), max = Math.max(cfg.min, cfg.max);
      const used = usedThisRound.table;
      const pool = countPoolSize(min, max, cfg.parity) * 8;
      if(pool > 0 && used.size >= pool) used.clear();
      let x, n, key, attempts = 0;
      do{
        x = randWithParity(min, max, cfg.parity);
        n = randInt(2, 9);
        key = x + 'x' + n;
        attempts++;
      } while(used.has(key) && attempts < 50);
      used.add(key);
      return { text: `${x} × ${n}`, answer: x*n };
    }
  },
  recip: {
    label: 'Reciprocals',
    hasDecimals: true,   // forward mode has answers like 14.28 (drives the one-time hint popup)
    gen(){
      const cfg = activeConfig('recip');
      let min = Math.max(1, Math.min(cfg.min, cfg.max)), max = Math.min(30, Math.max(cfg.min, cfg.max));
      const n = drawUnique('recip', min, max, 'any');
      const vals = RECIPROCALS[n];
      if(cfg.mode === 'rev'){
        return { text: `${vals[0]}% = 1/?`, answer: n };
      }
      return { text: `1/${n} in %`, answer: vals[0], answers: vals, answerText: vals.join(' or ') };
    }
  }
};
const SKILL_ORDER = ['half','x2','x3','add','sq','cube','table','recip'];


// ---------- state ----------
let state = {
  skill: null,
  totalQuestions: 15,
  currentIndex: 0,
  correctCount: 0,
  times: [],
  records: [],   // per-question detail: {skillKey, text, answer, given, correct, timeMs}
  currentProblem: null,
  currentSkillKey: null,
  questionStart: 0,
  perSkillTimer: null,
  timerDurationMs: 8000,
  streak: 0,
  running: false,       // true only while a round is actively in progress
  awaitingAdvance: false, // true briefly after an answer is locked in, before next question
  practiceMode: false,  // true = no timer, not counted in main stats
  seed: null,            // seed used for this round's question sequence
  fromChallenge: false   // true if this round was started by entering someone else's code
};

// ---------- elements ----------
const views = {
  home: document.getElementById('view-home'),
  play: document.getElementById('view-play'),
  results: document.getElementById('view-results'),
  history: document.getElementById('view-history'),
  historySkill: document.getElementById('view-history-skill'),
  historyFull: document.getElementById('view-history-full'),
  challenge: document.getElementById('view-challenge'),
  entercode: document.getElementById('view-entercode'),
  challengedetails: document.getElementById('view-challengedetails'),
  about: document.getElementById('view-about'),
  bug: document.getElementById('view-bug'),
};
function showView(name){
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[name].classList.add('active');
}

// NOTE: modeGrid/btnStart/durationToggle removed — Home no longer has a
// single Start button flow (Difficulty Picker owns skill+config+question
// count now, see js/ui.js). timerTrack/timerFill/problemText/answerInput/
// skillTag/metaProgress/metaAcc/metaAvg/correctReveal/correctRevealNum
// still point at the OLD Play view markup and will be rewired in Step 3b
// (Play + Results), not this step.
const timerTrack = document.getElementById('timerTrack');
const timerFill = document.getElementById('timerFill');
const problemText = document.getElementById('problemText');
const answerInput = document.getElementById('answerInput');
const skillTag = document.getElementById('skillTag');
const difficultyPill = document.getElementById('difficultyPill');
const metaProgress = document.getElementById('metaProgress');
const metaAcc = document.getElementById('metaAcc');
const metaAvg = document.getElementById('metaAvg');
const btnHistory = document.getElementById('btnHistory');
const btnChallengeCreate = document.getElementById('btnChallengeCreate');
const correctReveal = document.getElementById('correctReveal');
const correctRevealNum = document.getElementById('correctRevealNum');
const exitModal = document.getElementById('exitModal');
