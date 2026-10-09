// ============================================================
// STORAGE.JS — persistence, theme, RNG, challenge codes, config
// ============================================================

// ---------- viewport height fix (mobile keyboard) ----------
function setRealVH(){
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  document.documentElement.style.setProperty('--vh', (h/100) + 'px');
}
setRealVH();
window.addEventListener('resize', setRealVH);
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', setRealVH);
  window.visualViewport.addEventListener('scroll', setRealVH);
}

// ---------- persistence ----------
const STORAGE_KEY = 'numbers_game_sessions_v1';
function loadSessions(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}
function saveSessions(list){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }catch(e){}
}
let sessions = loadSessions();

// Practice rounds (no timer) are stored separately so they never affect main
// speed/accuracy stats or the history trend chart.
const PRACTICE_STORAGE_KEY = 'numbers_game_practice_sessions_v1';
function loadPracticeSessions(){
  try{
    const raw = localStorage.getItem(PRACTICE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}
function savePracticeSessions(list){
  try{ localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(list)); }catch(e){}
}
let practiceSessions = loadPracticeSessions();

// ---------- seeded RNG (for challenge codes) ----------
// mulberry32: small, fast, deterministic PRNG. Same seed -> same sequence of numbers,
// which is what lets a challenge code reproduce an identical set of questions.
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomSeed(){
  return Math.floor(Math.random() * 0xFFFFFFFF);
}
// rng() is what all question generation calls instead of Math.random().
// It's reassigned to a seeded generator when a round starts from a challenge code.
let rng = Math.random;

// ---------- challenge codes ----------
// A challenge code packs {skill, questionCount, seed, config, included} into a short
// base36-ish string. Anyone who enters the same code gets the exact same question
// sequence, because the seed drives a deterministic RNG (mulberry32) instead of
// Math.random(). Scores are NOT tracked or synced anywhere — comparing results is
// manual (tell each other, screenshot, etc). This keeps the whole app static/serverless.
let pendingChallenge = null; // set when a round is about to start from an entered code

function buildChallengePayload(included, cfgBySkill, questionCount, seed){
  // included: array of skill keys to include. cfgBySkill: {skillKey: config} for just those skills.
  const cfg = {};
  included.forEach(k => cfg[k] = cfgBySkill[k]);
  return {
    v: 2,
    included: included,
    n: questionCount,
    seed: seed,
    cfg: cfg
  };
}

function encodeChallengeCode(payload){
  const json = JSON.stringify(payload);
  // btoa -> URL-safe base64 (no padding, +/ swapped) so it's easy to paste/share
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return b64;
}

function decodeChallengeCode(code){
  try{
    const b64 = code.trim().replace(/-/g,'+').replace(/_/g,'/');
    const json = decodeURIComponent(escape(atob(b64)));
    const payload = JSON.parse(json);
    if(!payload || typeof payload !== 'object' || typeof payload.seed !== 'number') return null;
    // v2 format: {included, cfg, n, seed}. Accept v1 too ({skill, cfg, inc, n, seed}) for old codes already shared.
    if(payload.v === 2){
      if(!Array.isArray(payload.included) || payload.included.length === 0) return null;
      return payload;
    }
    if(payload.skill){
      const included = payload.skill === 'mixed' ? Object.keys(payload.inc || {}).filter(k => payload.inc[k]) : [payload.skill];
      if(included.length === 0) return null;
      return { v:2, included: included, n: payload.n, seed: payload.seed, cfg: payload.cfg || {} };
    }
    return null;
  }catch(e){
    return null;
  }
}

// ---------- skill config (persisted) ----------
// Starting config per skill comes from SKILL_META in js/registry.js
const DEFAULT_CONFIG = {};
SKILL_ORDER.forEach(k => DEFAULT_CONFIG[k] = Object.assign({}, SKILL_META[k].defaults));
const CONFIG_KEY = 'numbers_game_config_v1';
function loadConfig(){
  try{
    const raw = localStorage.getItem(CONFIG_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    // migrate old two-range add2 config (aMin/aMax/bMin/bMax) into the new
    // single-range + count shape, so existing saved settings aren't lost
    if(parsed.add2 && !parsed.add){
      const old = parsed.add2;
      if(old.aMin !== undefined){
        parsed.add = {
          min: Math.min(old.aMin, old.bMin !== undefined ? old.bMin : old.aMin),
          max: Math.max(old.aMax, old.bMax !== undefined ? old.bMax : old.aMax),
          count: 2,
          parity: old.parity || 'any'
        };
      }
    }
    const merged = {};
    Object.keys(DEFAULT_CONFIG).forEach(k => merged[k] = Object.assign({}, DEFAULT_CONFIG[k], parsed[k] || {}));
    return merged;
  }catch(e){
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}
function saveConfig(){ try{ localStorage.setItem(CONFIG_KEY, JSON.stringify(skillConfig)); }catch(e){} }
let skillConfig = loadConfig();

// When playing a round started from a challenge code, activeChallengeCfg holds that
// code's config so it can be used WITHOUT ever touching/overwriting the user's own
// saved skillConfig. Cleared as soon as the round ends.
let activeChallengeCfg = null;
function activeConfig(skillKey){
  if(activeChallengeCfg && activeChallengeCfg[skillKey]) return activeChallengeCfg[skillKey];
  return skillConfig[skillKey];
}
let activeChallengeIncluded = null; // array of skill keys, set only while playing a challenge round
function activeIncludedList(){
  if(activeChallengeIncluded) return activeChallengeIncluded;
  return includedSkillList();
}

// ---------- which skills are included when "Mixed" is played ----------
const INCLUDED_KEY = 'numbers_game_mixed_included_v1';
const DEFAULT_INCLUDED = {};
SKILL_ORDER.forEach(k => DEFAULT_INCLUDED[k] = true);
function loadMixedIncluded(){
  try{
    const raw = localStorage.getItem(INCLUDED_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if(parsed.add2 !== undefined && parsed.add === undefined) parsed.add = parsed.add2;
    return Object.assign({}, DEFAULT_INCLUDED, parsed);
  }catch(e){
    return Object.assign({}, DEFAULT_INCLUDED);
  }
}
function saveMixedIncluded(){ try{ localStorage.setItem(INCLUDED_KEY, JSON.stringify(mixedIncluded)); }catch(e){} }
let mixedIncluded = loadMixedIncluded();
function includedSkillList(){
  return Object.keys(mixedIncluded).filter(k => mixedIncluded[k]);
}

function randInt(min,max){
  if(min > max){ const t=min; min=max; max=t; }
  return Math.floor(rng()*(max-min+1))+min;
}
function randWithParity(min, max, parity){
  // try a bunch of times, fall back to adjusting
  for(let i=0;i<50;i++){
    const n = randInt(min,max);
    if(parity === 'even' && n % 2 === 0) return n;
    if(parity === 'odd' && n % 2 !== 0) return n;
    if(parity === 'any') return n;
  }
  // fallback: force parity within range
  let n = randInt(min,max);
  if(parity === 'even' && n % 2 !== 0) n = (n+1 <= max) ? n+1 : n-1;
  if(parity === 'odd' && n % 2 === 0) n = (n+1 <= max) ? n+1 : n-1;
  return n;
}

// ---------- no-repeat tracking ----------
// Guarantees no repeated number within a round, as long as the configured range/parity
// has enough distinct values to support it. Tracks every value used so far this round
// per skill; once the pool of values matching the current config is exhausted, it resets
// that skill's tracking and starts a fresh no-repeat cycle (so small ranges cycle cleanly
// instead of getting stuck retrying forever or being allowed to hard-repeat indefinitely).
const usedThisRound = {};
SKILL_ORDER.forEach(k => usedThisRound[k] = new Set());
function resetUsedTracking(){
  Object.keys(usedThisRound).forEach(k => usedThisRound[k].clear());
}
function countPoolSize(min, max, parity){
  if(parity === 'any') return Math.max(0, max - min + 1);
  let count = 0;
  for(let i = min; i <= max; i++){
    if(parity === 'even' && i % 2 === 0) count++;
    if(parity === 'odd' && i % 2 !== 0) count++;
  }
  return count;
}
// Draws a value in [min,max] (respecting parity) that hasn't been used yet this round
// for the given skill. Resets that skill's used-set first if the pool is already exhausted.
function drawUnique(skillKey, min, max, parity){
  const pool = countPoolSize(min, max, parity);
  const used = usedThisRound[skillKey];
  if(pool > 0 && used.size >= pool) used.clear();
  let n, attempts = 0;
  do{
    n = randWithParity(min, max, parity);
    attempts++;
  } while(used.has(n) && attempts < 50);
  used.add(n);
  return n;
}
// addition sets: pool size is (count of valid values in range) ^ count — usually large,
// so this rarely resets, but stays correct if the range is tiny too.
function drawUniqueSet(skillKey, min, max, parity, count){
  const poolSize = countPoolSize(min, max, parity);
  const pool = Math.pow(poolSize, count);
  const used = usedThisRound[skillKey];
  if(pool > 0 && used.size >= pool) used.clear();
  let nums, key, attempts = 0;
  do{
    nums = [];
    for(let i = 0; i < count; i++) nums.push(randWithParity(min, max, parity));
    key = nums.join('_');
    attempts++;
  } while(used.has(key) && attempts < 50);
  used.add(key);
  return nums;
}

// ---------- display name (Home page greeting) ----------
const DISPLAY_NAME_KEY = 'numbers_display_name';
function getDisplayName(){
  try{ return localStorage.getItem(DISPLAY_NAME_KEY) || ''; }catch(e){ return ''; }
}
function setDisplayName(name){
  const trimmed = (name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  try{
    if(trimmed) localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
    else localStorage.removeItem(DISPLAY_NAME_KEY);
  }catch(e){}
  return trimmed;
}

// ---------- Home dashboard stat helpers ----------
// All read only the real `sessions` array (practice sessions excluded on purpose —
// they're stored separately and never count toward stats/streak).

// Consecutive calendar days (local time) with at least one real session, walking
// backward from today. No grace period: a missed day breaks the streak. Returns 0
// if there's no session today.
function getCurrentStreak(){
  if(sessions.length === 0) return 0;
  const dayKey = (ts) => {
    const d = new Date(ts);
    return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
  };
  const daysWithSessions = new Set(sessions.map(s => dayKey(s.date)));
  const today = new Date();
  if(!daysWithSessions.has(dayKey(today.getTime()))) return 0;
  let streak = 0;
  let cursor = new Date(today);
  while(daysWithSessions.has(dayKey(cursor.getTime()))){
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Total questions answered today (local calendar day), across all real sessions.
function getTodayQuestionCount(){
  const now = new Date();
  const isToday = (ts) => {
    const d = new Date(ts);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };
  return sessions
    .filter(s => isToday(s.date))
    .reduce((sum, s) => sum + (s.questions || 0), 0);
}

// Plain average accuracy across real sessions from the last 7 days. Returns null
// (not 0) when there are no sessions in that window, so the UI can show "—" instead
// of a misleading 0%.
function getSevenDayAccuracy(){
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = sessions.filter(s => s.date >= cutoff);
  if(recent.length === 0) return null;
  return Math.round(recent.reduce((a, s) => a + s.accuracy, 0) / recent.length);
}

// The most recently played real session, or null if none yet.
function getLastSession(){
  if(sessions.length === 0) return null;
  return sessions[sessions.length - 1];
}

// ---------- one-time hints ----------
// The keyboard-shortcuts popup is shown once per device. If storage is blocked we say "seen",
// so the popup can never nag on every visit.
const SHORTCUT_HINT_KEY = 'numbers_shortcutHintSeen';
function shortcutHintSeen(){
  try{ return localStorage.getItem(SHORTCUT_HINT_KEY) === '1'; }catch(e){ return true; }
}
function markShortcutHintSeen(){
  try{ localStorage.setItem(SHORTCUT_HINT_KEY, '1'); }catch(e){}
}

// ---------- last played difficulty (per skill) ----------
// Remembers which level you last STARTED a round with, per skill, so the
// difficulty picker can open with it already selected.
const LAST_LEVEL_KEY = 'numbers_game_last_level_v1';
function loadLastLevels(){
  try{
    const raw = localStorage.getItem(LAST_LEVEL_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}
let lastLevels = loadLastLevels();
function getLastLevel(skillKey){
  return lastLevels[skillKey] || null;
}
function setLastLevel(skillKey, level){
  lastLevels[skillKey] = level;
  try{ localStorage.setItem(LAST_LEVEL_KEY, JSON.stringify(lastLevels)); }catch(e){}
}

// ---------- last played question count (per skill) ----------
const LAST_COUNT_KEY = 'numbers_game_last_count_v1';
function loadLastCounts(){
  try{
    const raw = localStorage.getItem(LAST_COUNT_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}
let lastCounts = loadLastCounts();
function getLastCount(skillKey){
  const n = lastCounts[skillKey];
  return (Number.isInteger(n) && n > 0) ? n : null;
}
function setLastCount(skillKey, n){
  lastCounts[skillKey] = n;
  try{ localStorage.setItem(LAST_COUNT_KEY, JSON.stringify(lastCounts)); }catch(e){}
}