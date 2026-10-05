// ============================================================
// REGISTRY.JS — the ONE place that describes each skill.
// Loaded FIRST (before storage.js). Everything that lists skills reads from here:
// Home cards, Difficulty picker, Challenge Create/Details, History, saved defaults, skill colours.
//
// TO ADD A NEW SKILL:
//   1. add an entry to SKILL_META below
//   2. add its question generator to SKILLS in js/skills.js (same key)
//   That's it. Cards, toggles, colours, presets, defaults and history labels all follow.
//
// Entry fields:
//   label, icon, desc   text shown on cards/toggles
//   color               one hex colour; the soft tint is derived from it
//   group               which Home section it sits in (see SKILL_GROUP_DEFS)
//   defaults            starting saved config (min / max / parity, plus count or mode if needed)
//   presets             levels it offers: veryeasy / easy / difficult / verydifficult (leave one out to hide it)
//                       each: {min, max, secs}  (+ count, decimalPct, mode, label, note when needed)
//   customNote          text of the (i) on the Custom button
//   key                 optional: the keyboard-shortcut letter for this skill (default: first letter of label, × counts as x)
//   noCustom            true = no Custom option for this skill
//   pool                optional (lo, hi, parity) => how many different questions the range can give
//   modeLabel/modeText  optional: name + text of a special setting (e.g. Reciprocals' direction) shown on History / Challenge Details
//   hint                optional example for the one-time "no need to type the decimal point" popup
// ============================================================

const SKILL_GROUP_DEFS = [
  { id: 'arith',  label: 'Arithmetic' },
  { id: 'powers', label: 'Powers' },
  { id: 'recall', label: 'Tables & Reciprocals' }
];

const SKILL_META = {
  half: {
    label: 'Halving', icon: '÷2', desc: 'Split a number in two', color: '#3B6FE0', group: 'arith',
    defaults: { min: 2, max: 198, parity: 'any' },
    presets: {
      veryeasy: { min: 1, max: 99, secs: 8 },
      easy: { min: 100, max: 299, secs: 10 },
      difficult: { min: 300, max: 999, secs: 13 },
      verydifficult: { min: 1000, max: 9999, secs: 20 }
    },
    customNote: 'Pick your own min/max and number type before you start.',
    hint: { q: 'Half of 483', a: '241.5', whole: '241', rest: '5' }
  },
  x2: {
    label: '× 2', icon: '×2', desc: 'Double it', color: '#1F9D6C', group: 'arith',
    defaults: { min: 2, max: 99, parity: 'any' },
    presets: {
      veryeasy: { min: 1, max: 100, secs: 8 },
      easy: { min: 100, max: 500, secs: 13 },
      difficult: { min: 500, max: 1000, secs: 15 },
      verydifficult: { min: 1000, max: 10000, secs: 17 }
    },
    customNote: 'Pick your own min/max before you start.'
  },
  x3: {
    label: '× 3', icon: '×3', desc: 'Triple it', color: '#DB8B1E', group: 'arith',
    defaults: { min: 2, max: 33, parity: 'any' },
    presets: {
      veryeasy: { min: 1, max: 30, secs: 10 },
      easy: { min: 30, max: 100, secs: 15 },
      difficult: { min: 100, max: 300, secs: 21 },
      verydifficult: { min: 300, max: 500, secs: 25 }
    },
    customNote: 'Pick your own min/max before you start.'
  },
  add: {
    label: 'Additions', icon: '+', desc: 'Add several numbers together', color: '#A6459B', group: 'arith',
    defaults: { min: 1, max: 99, count: 2, parity: 'any' },
    presets: {
      veryeasy: { min: 1, max: 99, count: 2, secs: 9 },
      easy: { min: 1, max: 999, count: 2, secs: 15, decimalPct: 20 },
      difficult: { min: 1, max: 999, count: 3, secs: 25, decimalPct: 30 },
      verydifficult: { min: 1, max: 9999, count: 4, secs: 30, decimalPct: 40 }
    },
    customNote: 'Pick your own min/max and how many numbers to add.',
    pool: () => Infinity,
    hint: { q: '12.5 + 3.7', a: '16.2', whole: '16', rest: '2' }
  },
  sq: {
    label: 'Square', icon: 'x²', desc: 'Square the number', color: '#C6473A', group: 'powers',
    defaults: { min: 2, max: 30, parity: 'any' },
    presets: {
      veryeasy: { min: 1, max: 15, secs: 5 },
      easy: { min: 16, max: 30, secs: 8 },
      difficult: { min: 31, max: 100, secs: 20 }
    },
    customNote: 'Pick your own min/max and number type before you start.'
  },
  cube: {
    label: 'Cube', icon: 'x³', desc: 'Cube the number', color: '#2E8FA6', group: 'powers',
    defaults: { min: 2, max: 20, parity: 'any' },
    presets: {
      veryeasy: { min: 1, max: 15, secs: 8 },
      easy: { min: 16, max: 30, secs: 10 },
      difficult: { min: 31, max: 100, secs: 30 }
    },
    customNote: 'Pick your own min/max and number type before you start.'
  },
  table: {
    label: 'Tables', icon: '3×7', desc: 'Recall multiplication tables', color: '#6C63C6', group: 'recall',
    defaults: { min: 2, max: 20, parity: 'any' },
    presets: {
      veryeasy: { min: 1, max: 10, secs: 8 },
      easy: { min: 11, max: 20, secs: 10 },
      difficult: { min: 21, max: 30, secs: 15 },
      verydifficult: { min: 31, max: 40, secs: 18 }
    },
    customNote: 'Pick the range for the first number (it is multiplied by 2–9).',
    pool: (lo, hi, parity) => countPoolSize(lo, hi, parity) * 8   // x from the range, n from 2-9
  },
  recip: {
    label: 'Reciprocals', icon: '1/n', desc: '1/n as a percentage', color: '#16BAC5', group: 'recall',
    defaults: { min: 1, max: 30, mode: 'fwd' },   // mode: 'fwd' = 1/7 -> 14.28   'rev' = 14.28% -> 7
    // difficulty = direction, not range, so both levels share 1-30 and differ by `mode`
    presets: {
      easy: { min: 1, max: 30, mode: 'fwd', secs: 10, label: 'Fraction → %', note: 'Numbers from <b>1–30</b>. You get <b>1/7</b>, type the percentage (14.28).' },
      difficult: { min: 1, max: 30, mode: 'rev', secs: 13, label: '% → Fraction', note: 'Numbers from <b>1–30</b>. You get <b>14.28%</b>, type the number under the 1 (7).' }
    },
    noCustom: true,
    modeLabel: 'Direction',   // optional: a config setting worth showing on History / Challenge Details
    modeText: cfg => cfg.mode === 'rev' ? '% → Fraction' : 'Fraction → %',
    pool: (lo, hi) => Math.max(0, Math.min(30, hi) - Math.max(1, lo) + 1),
    hint: { q: '1/8 in %', a: '12.5', whole: '12', rest: '5' }
  }
};

// ---------- everything below is derived from SKILL_META — don't list skills again anywhere ----------
const SKILL_ORDER = Object.keys(SKILL_META);
const DIFF_ORDER = ['veryeasy', 'easy', 'difficult', 'verydifficult'];   // order levels appear in the picker

const skillDisplayLabels = {}, SKILL_ICON = {}, SKILL_DESC = {}, SKILL_COLOR = {}, SKILL_CLASS = {}, SKILL_KEY = {};
const DIFFICULTY_PRESETS = {}, CUSTOM_NOTE = {}, NO_CUSTOM = {};
SKILL_ORDER.forEach(k => {
  const m = SKILL_META[k];
  skillDisplayLabels[k] = m.label;
  SKILL_ICON[k] = m.icon;
  SKILL_DESC[k] = m.desc;
  SKILL_COLOR[k] = m.color;
  SKILL_CLASS[k] = 'c-' + k;
  const firstChar = (m.key || m.label || '').trim().charAt(0).toLowerCase();
  SKILL_KEY[k] = firstChar === '\u00d7' ? 'x' : firstChar;   // both the x2 and x3 labels answer to the x key
  DIFFICULTY_PRESETS[k] = m.presets;
  CUSTOM_NOTE[k] = m.customNote || '';
  if(m.noCustom) NO_CUSTOM[k] = true;
});

// Home sections: [{id, label, skills:[keys]}] in the order of SKILL_GROUP_DEFS
const SKILL_GROUPS = SKILL_GROUP_DEFS
  .map(g => Object.assign({}, g, { skills: SKILL_ORDER.filter(k => SKILL_META[k].group === g.id) }))
  .filter(g => g.skills.length > 0);

// How many different questions a skill + range can give (used to grey out question counts that are too big).
function questionPoolSize(key, cfg){
  const lo = Math.min(cfg.min, cfg.max), hi = Math.max(cfg.min, cfg.max);
  const m = SKILL_META[key];
  return m.pool ? m.pool(lo, hi, cfg.parity || 'any') : countPoolSize(lo, hi, cfg.parity || 'any');
}

// Per-skill colour rules, generated so no skill's colour is ever written into style.css.
(function injectSkillStyles(){
  let css = ':root{\n';
  SKILL_ORDER.forEach(k => {
    css += `  --sk-${k}: ${SKILL_META[k].color};\n  --sk-${k}-soft: color-mix(in srgb, ${SKILL_META[k].color} 14%, #fff);\n`;
  });
  css += '}\n';
  SKILL_ORDER.forEach(k => {
    css += `.c-${k}{ --accent-c:var(--sk-${k}); } .c-${k} .sk-icon{ background:var(--sk-${k}-soft); color:var(--sk-${k}); } .c-${k} .sk-progress-fill{ background:var(--sk-${k}); }\n`;
    css += `#view-challenge .cc-skill-toggle[data-skill="${k}"], #view-challenge .cc-config-card[data-skill="${k}"], #view-challengedetails .cd-chip[data-skill="${k}"], #view-challengedetails .cd-card[data-skill="${k}"]{ --sc:var(--sk-${k}); }\n`;
  });
  const tag = document.createElement('style');
  tag.id = 'skillStyles';
  tag.textContent = css;
  document.head.appendChild(tag);
})();
