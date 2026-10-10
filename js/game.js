// ============================================================
// GAME.JS — round logic, timer, input checking, results
// ============================================================

// ---------- exit-round flow ----------
const btnExitRound = document.getElementById('btnExitRound');
const btnCancelExit = document.getElementById('btnCancelExit');
const btnConfirmExit = document.getElementById('btnConfirmExit');

btnExitRound.addEventListener('click', () => {
  pauseRoundForModal();
  exitModal.classList.add('show');
});
btnCancelExit.addEventListener('click', () => {
  exitModal.classList.remove('show');
  resumeRoundAfterModal();
});
btnConfirmExit.addEventListener('click', () => {
  exitModal.classList.remove('show');
  endRoundAbruptly();
  // Rounds started from the Create / Mixed screen go back to it (one step back in history, so the screen is
  // exactly as it was left: skills, levels, question count). Everything else still goes Home.
  if(state.returnTo === 'challenge') history.back();
  else showView('home');
});

function pauseRoundForModal(){
  if(state.perSkillTimer) clearTimeout(state.perSkillTimer);
  const computed = getComputedStyle(timerFill).transform;
  timerFill.style.transition = 'none';
  timerFill.style.transform = computed;
}
function resumeRoundAfterModal(){
  state.questionStart = performance.now();
  if(!state.practiceMode) runTimerBar();
  answerInput.focus();
}
function endRoundAbruptly(){
  state.running = false;
  if(state.perSkillTimer) clearTimeout(state.perSkillTimer);
  timerTrack.style.visibility = 'hidden';
  // TODO (Step 3b): topStreak pill removed from topbar — streak now belongs
  // in Play screen's own meta-chip row. Rewire when Play is redone.
  btnHistory.disabled = false;
}

// ---------- one-time "no need to type the decimal point" hint ----------
// Shown the first time each applicable skill (Halving, Additions) is played, then never again
// on that device. Add `hasDecimals: true` to a skill in skills.js to include it.
const DECIMAL_HINT_KEY = 'numbers_decimalHintSeen';
// Example for the one-time decimal hint comes from each skill's `hint` in js/registry.js
const DECIMAL_HINT_EXAMPLES = {};
SKILL_ORDER.forEach(k => { if(SKILL_META[k].hint) DECIMAL_HINT_EXAMPLES[k] = SKILL_META[k].hint; });
const decimalHintModal = document.getElementById('decimalHintModal');
const hintShownThisSession = {};   // backup in case localStorage is blocked

function savedDecimalHints(){
  try { return JSON.parse(localStorage.getItem(DECIMAL_HINT_KEY)) || {}; } catch(e){ return {}; }
}
function roundSkillKeys(){
  if(pendingChallenge) return pendingChallenge.included;
  if(state.skill === 'mixed') return includedSkillList();
  return [state.skill];
}
function unseenDecimalSkills(){
  const saved = savedDecimalHints();
  return roundSkillKeys().filter(k => SKILLS[k] && SKILLS[k].hasDecimals && !saved[k] && !hintShownThisSession[k]);
}
function showDecimalHint(skills){
  const ex = DECIMAL_HINT_EXAMPLES[skills[0]] || DECIMAL_HINT_EXAMPLES.half;
  document.getElementById('dhQ').textContent = ex.q;
  document.getElementById('dhA').textContent = ex.a;
  document.getElementById('dhWhole').textContent = ex.whole;
  document.getElementById('dhRest').textContent = ex.rest;
  decimalHintModal.dataset.skills = skills.join(',');
  decimalHintModal.classList.add('show');
}
function closeDecimalHint(thenStart){
  const skills = (decimalHintModal.dataset.skills || '').split(',').filter(Boolean);
  const saved = savedDecimalHints();
  skills.forEach(k => { saved[k] = true; hintShownThisSession[k] = true; });
  try { localStorage.setItem(DECIMAL_HINT_KEY, JSON.stringify(saved)); } catch(e){}
  decimalHintModal.classList.remove('show');
  if(thenStart) startRound();   // the round that was waiting for the hint starts now
}
document.getElementById('btnDecimalHintOk').addEventListener('click', () => closeDecimalHint(true));
// Esc / system Back on the hint (nav.js): counts as seen, but doesn't start a timed round by accident.
window.dismissDecimalHint = () => closeDecimalHint(false);

// ---------- one-time sign hint (iPhone/iPad and desktop; Android has none) ----------
// Shown once per device, the first time a round includes a skill that can have negative answers
// (`canBeNegative: true` in skills.js). IS_IOS / IS_DESKTOP are defined further down, in the input section.
//   iPhone/iPad: the sign is ignored, so there is nothing to type.
//   desktop:     explains that = takes a mistaken minus off the answer.
const SIGN_HINT_TEXT = {
  ios: {
    title: "Don't worry about the sign",
    text: 'Some answers are negative. The iPhone number pad has no minus key, so just type the number without it.',
    eq: '12 &minus; 30 = <b>&minus;18</b>',
    how: 'Just type <b>18</b>.'
  },
  desktop: {
    title: 'Press = or + for a positive answer',
    text: 'Some answers are negative. Type the minus (<span class="kbd">-</span>) whenever you like and it moves to the front. Added one by mistake? Press <span class="kbd">=</span> or <span class="kbd">+</span> to take it off. No Shift needed.',
    eq: '30 &minus; 12 = <b>18</b>',
    how: 'Typed <b>&minus;18</b> by mistake? Press <span class="kbd">=</span> or <span class="kbd">+</span> and it becomes <b>18</b>.'
  }
};
function showSignHint(){
  const t = SIGN_HINT_TEXT[IS_IOS ? 'ios' : 'desktop'];
  document.getElementById('sgTitle').textContent = t.title;
  document.getElementById('sgText').innerHTML = t.text;
  document.getElementById('sgEq').innerHTML = t.eq;
  document.getElementById('sgHow').innerHTML = t.how;
  signHintModal.classList.add('show');
}
const SIGN_HINT_KEY = 'numbers_signHintSeen';
const signHintModal = document.getElementById('signHintModal');
let signHintShownThisSession = false;   // backup in case localStorage is blocked
function signHintNeeded(){
  if(!(IS_IOS || IS_DESKTOP) || signHintShownThisSession) return false;
  try { if(localStorage.getItem(SIGN_HINT_KEY) === '1') return false; } catch(e){}
  return roundSkillKeys().some(k => SKILLS[k] && SKILLS[k].canBeNegative);
}
function closeSignHint(thenStart){
  signHintShownThisSession = true;
  try { localStorage.setItem(SIGN_HINT_KEY, '1'); } catch(e){}
  signHintModal.classList.remove('show');
  if(thenStart) startRound();   // the round that was waiting for the hint starts now
}
document.getElementById('btnSignHintOk').addEventListener('click', () => closeSignHint(true));
window.dismissSignHint = () => closeSignHint(false);

// ---------- round logic ----------
function startRound(){
  // First time on a skill with decimal answers: show the hint first, round starts after "Got it".
  const hintSkills = unseenDecimalSkills();
  if(hintSkills.length){ showDecimalHint(hintSkills); return; }
  // iPhone/iPad and desktop, first time on a skill with negative answers: explain how the sign works there.
  if(signHintNeeded()){ showSignHint(); return; }

  state.currentIndex = 0;
  state.correctCount = 0;
  state.times = [];
  state.records = [];
  state.streak = 0;
  state.running = true;
  state.awaitingAdvance = false;

  if(pendingChallenge){
    // Starting from an entered challenge code: use its included skills, config, question
    // count and seed WITHOUT touching the player's own saved settings (skillConfig,
    // mixedIncluded) at all — those are restored automatically once the round ends.
    const ch = pendingChallenge;
    state.skill = ch.included.length > 1 ? 'mixed' : ch.included[0];
    state.totalQuestions = ch.n;
    activeChallengeCfg = ch.cfg;
    activeChallengeIncluded = ch.included;
    state.seed = ch.seed;
    state.fromChallenge = ch.fromChallenge !== false;   // Mixed drill passes false; entered codes leave it unset (= true)
    state.returnTo = ch.returnTo || 'home';             // where "Leave round" goes; only Create/Mixed set it
    pendingChallenge = null;
  } else {
    activeChallengeCfg = null;
    activeChallengeIncluded = null;
    state.seed = randomSeed();
    state.fromChallenge = false;
    state.returnTo = 'home';
  }
  rng = mulberry32(state.seed);

  resetUsedTracking(); // fresh no-repeat tracking per round

  // TODO (Step 3b): topStreak pill removed from topbar — rewire streak
  // display into Play screen's meta-chip row when Play is redone.
  timerTrack.style.visibility = state.practiceMode ? 'hidden' : 'visible';
  btnHistory.disabled = true;
  showView('play');
  nextQuestion();
}

function pickSkillKey(){
  if(activeChallengeIncluded){
    const pool = activeChallengeIncluded;
    // Single-skill challenges must NOT consume an rng() draw here — the sharer's own
    // original round never calls pickSkillKey() for a single-skill round (it returns
    // state.skill directly, below), so burning a draw for a 1-element pool would
    // desync the seeded sequence from question 1 onward for anyone entering the code.
    if(pool.length === 1) return pool[0];
    return pool[randInt(0, pool.length-1)];
  }
  if(state.skill === 'mixed'){
    const pool = includedSkillList();
    if(pool.length === 0) return SKILL_ORDER[randInt(0, SKILL_ORDER.length-1)]; // safety net, Start is blocked before this can happen
    return pool[randInt(0, pool.length-1)];
  }
  return state.skill;
}

// A problem may accept several answers (e.g. 16.66 or 16.67): problem.answers lists them all.
function matchesAnswer(problem, value){
  const list = problem.answers || [problem.answer];
  // iPhone/iPad: the number pad has no minus key, so a negative answer is also accepted without its sign
  return list.some(a => value === a || (IS_IOS && a < 0 && value === -a));
}

function nextQuestion(){
  if(state.currentIndex >= state.totalQuestions){
    finishRound();
    return;
  }
  state.awaitingAdvance = false;
  const skillKey = pickSkillKey();
  state.currentSkillKey = skillKey;
  state.currentProblem = SKILLS[skillKey].gen();
  problemText.textContent = state.currentProblem.text;
  const skillLabel = SKILLS[skillKey].label;
  skillTag.textContent = state.practiceMode ? skillLabel + ' · Practice' : skillLabel;
  const accentColor = SKILL_COLOR[skillKey] || SKILL_COLOR.half;
  document.body.style.setProperty('--accent-c', accentColor);
  if(difficultyPill){
    difficultyPill.textContent = difficultyLabels[matchingDifficultyForConfig(skillKey, activeConfig(skillKey))];
  }
  answerInput.value = '';
  prevAnswerValue = '';
  dotGuard = false;
  answerInput.classList.remove('flash-good','flash-bad');
  problemText.classList.remove('shake');
  correctReveal.classList.remove('show');
  updateMeta();
  state.timerDurationMs = timerSecondsForConfig(skillKey, activeConfig(skillKey)) * 1000;
  state.questionStart = performance.now();
  if(state.practiceMode){
    if(state.perSkillTimer) clearTimeout(state.perSkillTimer); // practice mode: no timer bar, no auto-fail
  } else {
    runTimerBar();
  }
  setTimeout(() => answerInput.focus(), 10);
}

function runTimerBar(){
  if(state.perSkillTimer) clearTimeout(state.perSkillTimer);
  timerFill.style.transition = 'none';
  timerFill.style.transform = 'scaleX(1)';
  timerFill.style.backgroundColor = '';
  void timerFill.offsetWidth; // force reflow
  timerFill.style.transition = `transform ${state.timerDurationMs}ms linear, background-color .2s ease`;
  timerFill.style.transform = 'scaleX(0)';
  state.perSkillTimer = setTimeout(() => {
    if(!state.running || state.awaitingAdvance) return;
    lockInAnswer(null); // timeout = wrong, no answer given
  }, state.timerDurationMs);
}

// ---------- live-checking input ----------
// iPhone/iPad number pads have no minus key, so there the sign of a negative answer is not checked
// (for -18 the player types 18). Everywhere else the sign is part of the answer.
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Desktop = a real keyboard and mouse (not a phone/tablet). Only there, = works as the plus key (see below).
const IS_DESKTOP = !IS_IOS && !/Android/i.test(navigator.userAgent) && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// True when `raw` is exactly the whole-number part of the answer (with its minus sign, except on iPhone/iPad
// where the sign is never typed). This is the moment the decimal point gets added for the player.
function wholePartMatches(raw, answer){
  if(!/^-?\d+$/.test(raw)) return false;
  const wantsMinus = answer < 0 && !IS_IOS;
  if(raw.startsWith('-') !== wantsMinus) return false;
  return Math.abs(Number(raw)) === Math.abs(Math.trunc(answer));
}

let prevAnswerValue = '';   // what the box held before the latest keystroke
let dotGuard = false;       // true once a backspace on the auto-added point has been swallowed

answerInput.addEventListener('input', (e) => {
  if(!state.running || state.awaitingAdvance) return;
  handleAnswerInput(e);
  prevAnswerValue = answerInput.value;
});

function handleAnswerInput(e){
  let raw = answerInput.value.trim();
  // Only one decimal point allowed: if a second one is typed (e.g. after the auto-added one),
  // drop it and keep the first.
  const firstDot = raw.indexOf('.');
  if(firstDot !== -1 && raw.indexOf('.', firstDot + 1) !== -1){
    raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
    answerInput.value = raw;
  }
  // The minus sign can be typed anywhere (before, in the middle or after the digits): it always ends up at the very
  // front, and only one is kept. Done first, so everything below (matching, auto-decimal) sees the fixed answer.
  if(raw.indexOf('-') !== -1){
    const fixed = '-' + raw.replace(/-/g, '');
    if(fixed !== raw){ raw = fixed; answerInput.value = raw; }
  }
  const deleting = e && e.inputType && e.inputType.indexOf('delete') === 0;
  const answer = state.currentProblem.answer;

  // Backspace on the auto-added point is protected so it can't be wiped out in a hurry:
  //   1st backspace: nothing happens (the point is put straight back)
  //   2nd backspace: the digit before the point goes, and the point goes with it (those digits no longer
  //                  match the answer's whole part); typing the right digits again brings the point back.
  if(deleting && !Number.isInteger(answer) && prevAnswerValue === raw + '.' && wholePartMatches(raw, answer)){
    if(!dotGuard){
      dotGuard = true;
      answerInput.value = raw + '.';
    } else {
      dotGuard = false;
      answerInput.value = raw.slice(0, -1);
    }
    return;
  }
  dotGuard = false;

  if(raw === '' || raw === '-') return;
  const value = Number(raw);
  if(!Number.isNaN(value) && matchesAnswer(state.currentProblem, value)){
    lockInAnswer(value);
    return;
  }
  // Auto-decimal (iPhone numpads have no "."): if the answer has decimals and what's typed so far is exactly
  // the answer's whole-number part, add the point for them.
  // Skipped while deleting, otherwise the player could never backspace over the point.
  if(!deleting && !Number.isInteger(answer) && wholePartMatches(raw, answer)){
    answerInput.value = raw + '.';
  }
}

// Desktop: = is the + key without Shift. Pressing it (or +) takes the minus sign off the answer, so a minus typed
// by mistake is fixed in one key. Pressing it with no minus there does nothing (the = is never typed into the box).
answerInput.addEventListener('keydown', (e) => {
  if(!IS_DESKTOP || (e.key !== '=' && e.key !== '+')) return;
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  if(!state.running || state.awaitingAdvance) return;
  if(answerInput.value.startsWith('-')){
    answerInput.value = answerInput.value.slice(1);
    handleAnswerInput({ inputType: 'insertText' });   // re-check: it may match now, or the point may need adding
    prevAnswerValue = answerInput.value;
  }
});

// Enter still works as an explicit submit, useful to lock in a guess that doesn't match.
answerInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){
    if(state.awaitingAdvance) return;
    const raw = answerInput.value.trim();
    if(raw === '') return;
    lockInAnswer(Number(raw));
  }
});

function lockInAnswer(value){
  if(!state.running || state.awaitingAdvance) return;
  state.awaitingAdvance = true;
  if(state.perSkillTimer) clearTimeout(state.perSkillTimer);

  const elapsed = performance.now() - state.questionStart;
  const correct = value !== null && !Number.isNaN(value) && matchesAnswer(state.currentProblem, Number(value));

  state.times.push(elapsed);
  state.records.push({
    skillKey: state.currentSkillKey,
    text: state.currentProblem.text,
    answer: state.currentProblem.answer,
    answerText: state.currentProblem.answerText || null,
    given: (value === null || Number.isNaN(value)) ? null : value,
    correct: correct,
    timeMs: elapsed
  });
  if(correct){
    state.correctCount++;
    state.streak++;
    answerInput.classList.add('flash-good');
  } else {
    state.streak = 0;
    answerInput.classList.add('flash-bad');
    problemText.classList.add('shake');
    correctRevealNum.textContent = state.currentProblem.answerText || state.currentProblem.answer;
    correctReveal.classList.add('show');
  }
  // TODO (Step 3b): update streak display in Play's meta-chip row here
  state.currentIndex++;

  setTimeout(() => {
    if(!state.running) return; // user may have exited during the pause
    if(state.currentIndex >= state.totalQuestions){
      finishRound();
    } else {
      nextQuestion();
    }
  }, correct ? 260 : 900);
}

function updateMeta(){
  metaProgress.textContent = `${state.currentIndex+1} / ${state.totalQuestions}`;
  const attempted = state.currentIndex;
  const acc = attempted === 0 ? 100 : Math.round((state.correctCount/attempted)*100);
  metaAcc.textContent = `${acc}%`;
  // avg time counts only questions that were actually answered (timed-out ones are left out)
  const answered = answeredTimesMs(state.records);
  const avg = answered.length === 0 ? null : answered.reduce((a,b)=>a+b,0)/answered.length/1000;
  metaAvg.textContent = avg === null ? '—' : `${avg.toFixed(1)}s`;
}

// Times (ms) of the questions the player actually answered; timed-out ones (no answer given) are skipped.
function answeredTimesMs(records){
  return records.filter(r => r.given !== null).map(r => r.timeMs);
}

// What gets saved with each session so it can be reviewed later in History.
// k = skill, q = question text, a = right answer, g = what you typed (null = timed out), t = time in ms.
//   wrong = every wrong or timed-out question, in the order played
//   slow  = the SLOW_KEEP slowest questions you got right (wrong ones are already in `wrong`)
const SLOW_KEEP = 5;
function buildSessionDetails(records){
  const slim = r => ({ k: r.skillKey, q: r.text, a: r.answerText || r.answer, g: r.given, t: Math.round(r.timeMs) });
  return {
    wrong: records.filter(r => !r.correct).map(slim),
    slow: records.filter(r => r.correct).sort((a,b) => b.timeMs - a.timeMs).slice(0, SLOW_KEEP).map(slim)
  };
}

function finishRound(){
  state.running = false;
  timerTrack.style.visibility = 'hidden';
  // TODO (Step 3b): topStreak pill removed from topbar — rewire streak
  // display into Play screen's meta-chip row when Play is redone.
  btnHistory.disabled = false;

  const accuracy = Math.round((state.correctCount/state.totalQuestions)*100);
  // Avg / best time use only the questions that were actually answered. A timed-out question has no
  // answer, and its "time" is just the whole timer running out, so it would unfairly drag the average up.
  // (If every question timed out there is nothing to average, so we fall back to all the times.)
  const answeredTimes = answeredTimesMs(state.records);
  const timesForStats = answeredTimes.length ? answeredTimes : state.times;
  const avgTime = timesForStats.reduce((a,b)=>a+b,0)/timesForStats.length/1000;
  const bestTime = Math.min(...timesForStats)/1000;

  document.getElementById('resAcc').textContent = accuracy + '%';
  document.getElementById('resAvg').textContent = avgTime.toFixed(1) + 's';
  document.getElementById('resBest').textContent = bestTime.toFixed(1) + 's';
  document.getElementById('resultsTitle').textContent =
    accuracy === 100 ? 'Flawless round' : (accuracy >= 80 ? 'Solid round' : 'Round complete');

  // Results page picks up the played skill's accent colour (Mixed uses the neutral primary blue)
  const resAccent = state.skill === 'mixed' ? '#007EA7' : (SKILL_COLOR[state.skill] || '#007EA7');
  document.getElementById('view-results').style.setProperty('--r-accent', resAccent);

  renderResultsBreakdown();
  renderResultsConfigNote();

  const includedNow = activeIncludedList();
  const configSnapshot = state.skill === 'mixed'
    ? { cfg: includedNow.reduce((acc,k) => { acc[k] = JSON.parse(JSON.stringify(activeConfig(k))); return acc; }, {}), included: includedNow }
    : { cfg: JSON.parse(JSON.stringify(activeConfig(state.skill))) };

  const sessionRecord = {
    date: Date.now(),
    skill: state.skill,
    questions: state.totalQuestions,
    accuracy: accuracy,
    avgTime: avgTime,
    bestTime: bestTime,
    config: configSnapshot,
    fromChallenge: state.fromChallenge,
    practice: state.practiceMode,
    details: buildSessionDetails(state.records)   // wrong + slowest questions, shown when you tap the session in History
  };

  if(state.practiceMode){
    practiceSessions.push(sessionRecord);
    savePracticeSessions(practiceSessions);
  } else {
    sessions.push(sessionRecord);
    saveSessions(sessions);
  }

  showView('results');
}

function renderResultsBreakdown(){
  const records = state.records;
  const isMixed = state.skill === 'mixed';
  const tag = r => isMixed ? `<span class="dr-skilltag">${skillDisplayLabels[r.skillKey]}</span>` : '';

  // Slowest questions — top 3 by time
  const slowestList = document.getElementById('slowestList');
  slowestList.innerHTML = '';
  [...records].sort((a,b) => b.timeMs - a.timeMs).slice(0, 3).forEach(r => {
    const row = document.createElement('div');
    row.className = 'detail-row';
    row.innerHTML = `
      <span class="dr-problem">${r.text}${tag(r)}</span>
      <span class="dr-time">${(r.timeMs/1000).toFixed(1)}s</span>
    `;
    slowestList.appendChild(row);
  });

  // By skill (mixed mode only) — avg time + accuracy %
  const perSkillSection = document.getElementById('perSkillSection');
  const perSkillList = document.getElementById('perSkillList');
  perSkillList.innerHTML = '';
  if(isMixed){
    perSkillSection.style.display = 'block';
    SKILL_ORDER.forEach(key => {
      const subset = records.filter(r => r.skillKey === key);
      if(subset.length === 0) return;
      const acc = Math.round(subset.filter(r => r.correct).length / subset.length * 100);
      const answeredSubset = subset.filter(r => r.given !== null);   // timed-out questions don't count toward avg time
      const avgText = answeredSubset.length ? (answeredSubset.reduce((a,r)=>a+r.timeMs,0)/answeredSubset.length/1000).toFixed(1) + 's' : '—';
      const row = document.createElement('div');
      row.className = 'skill-row';
      row.innerHTML = `
        <span class="name">${skillDisplayLabels[key]}</span>
        <span class="nums"><span>avg <b>${avgText}</b></span><span>acc <b>${acc}%</b></span></span>
      `;
      perSkillList.appendChild(row);
    });
  } else {
    perSkillSection.style.display = 'none';
  }

  // Missed — every wrong/timed-out answer, in order played
  const missedSection = document.getElementById('missedSection');
  const missedList = document.getElementById('missedList');
  missedList.innerHTML = '';
  const missed = records.filter(r => !r.correct);
  if(missed.length > 0){
    missedSection.style.display = 'block';
    missed.forEach(r => {
      const row = document.createElement('div');
      row.className = 'miss-row';
      const youStr = r.given === null ? 'no answer' : String(r.given);
      row.innerHTML = `
        <span class="dr-problem">${r.text}${tag(r)}</span>
        <span class="miss-nums"><span class="you">you: ${youStr}</span><span class="correct">right: ${r.answerText || r.answer}</span></span>
      `;
      missedList.appendChild(row);
    });
  } else {
    missedSection.style.display = 'none';
  }
}

const difficultyLabels = { veryeasy:'Very Easy', easy:'Easy', difficult:'Difficult', verydifficult:'Very Difficult', custom:'Custom' };

function describeSkillConfig(key, cfg){
  const diff = difficultyLabels[matchingDifficultyForConfig(key, cfg)];
  if(SKILL_HAS_COUNT[key]){
    return `${skillDisplayLabels[key]}: ${diff} (${cfg.min}–${cfg.max}, ${cfg.count || 2} numbers, ${cfg.parity})`;
  }
  if(SKILL_META[key].modeText){
    return `${skillDisplayLabels[key]}: ${diff} (${SKILL_META[key].modeText(cfg)})`;
  }
  return `${skillDisplayLabels[key]}: ${diff} (${cfg.min}–${cfg.max}, ${cfg.parity})`;
}

function renderResultsConfigNote(){
  const note = document.getElementById('resultsConfigNote');
  const parts = [];
  parts.push(`<b>${state.totalQuestions} questions</b>${state.practiceMode ? ' · practice mode' : ''}${state.fromChallenge ? ' · from a challenge code' : ''}`);
  if(state.skill === 'mixed'){
    const included = activeIncludedList();
    parts.push('Mix: ' + included.map(k => skillDisplayLabels[k]).join(', '));
    included.forEach(k => parts.push(describeSkillConfig(k, activeConfig(k))));
  } else {
    parts.push(describeSkillConfig(state.skill, activeConfig(state.skill)));
  }
  note.innerHTML = parts.join('<br>');
}
