// ============================================================
// CHALLENGE.JS — the Create Challenge screen (pick skills + difficulty + question
// count, then generate a shareable code OR start playing it straight away).
// The same screen also serves as the Mixed drill setup: openChallengeScreen('mixed') (Home's
// "Feeling brave?" strip) switches its texts and turns the bottom button into a plain Start.
//
// Uses from other files (all loaded before this one):
//   ui.js       DIFFICULTY_PRESETS, presetLabel(), presetNote(), CUSTOM_NOTE, DIFF_LABELS, showGeneratedCode()
//   storage.js  skillConfig, DEFAULT_CONFIG, randomSeed(), buildChallengePayload(), encodeChallengeCode()
//   skills.js   SKILL_ORDER        game.js  skillDisplayLabels (defined in ui.js)
//
// Everything is wrapped in one function so its names (config, selected ...) can't clash
// with globals. All of this screen's ids/classes are prefixed cc / cc- because the
// Difficulty popup uses similar names (qcountBar, diff-opt, info-btn ...).
// ============================================================
(function(){
  const view = document.getElementById('view-challenge');
  if(!view) return;

  const SKILL_ORDER_LOCAL = SKILL_ORDER.slice();

  const grid = document.getElementById('ccSkillGrid');
  // Skill tiles are built from the registry, so a new skill shows up here automatically.
  grid.innerHTML = SKILL_ORDER.map(k => `
    <button class="cc-skill-toggle" data-skill="${k}">
      <span class="cc-st-icon">${SKILL_ICON[k]}
        <span class="cc-st-check-badge"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></span>
      </span>
      <span class="cc-st-body">
        <div class="cc-st-name">${skillDisplayLabels[k]}</div>
        <div class="cc-st-desc">${SKILL_DESC[k]}</div>
      </span>
    </button>`).join('');
  const configStack = document.getElementById('ccConfigStack');
  const emptyNote = document.getElementById('ccEmptyNote');
  const btnGenerate = document.getElementById('ccBtnGenerate');
  const btnStart = document.getElementById('ccBtnStart');
  const topbarTitle = document.getElementById('ccTopbarTitle');
  const pageSub = document.getElementById('ccPageSub');
  const slTag = document.getElementById('ccSlTag');
  const qcountLabel = document.getElementById('ccQcountLabel');
  const blockedMsg = document.getElementById('ccBlockedMsg');
  const summaryTitle = document.getElementById('ccSummaryTitle');
  const summaryDesc = document.getElementById('ccSummaryDesc');
  const summaryEst = document.getElementById('ccSummaryEst');
  const qcountBar = document.getElementById('ccQcountBar');
  const qcountCustomBtn = document.getElementById('ccQcountCustomBtn');
  const qcountInline = document.getElementById('ccQcountInlineValue');
  const strip = view.querySelector('.cc-summary-strip');

  // ---------- draft state (never touches the player's own saved settings) ----------
  let selected = new Set();
  let config = {};
  let questionCount = 15;
  let mode = 'challenge';       // 'challenge' = Create a challenge (code + Start)   'mixed' = Mixed drill (Start only)
  let draftSeed = randomSeed(); // one seed per opening of the screen, so a code you generate and the round you Start are the SAME questions

  // Every text that differs between the two modes lives here.
  const MODE_TEXT = {
    challenge: {
      title: 'Create a challenge',
      sub: 'Pick the skills to include, set a difficulty for each, and share the code — whoever plays it gets your exact set of questions.',
      tag: 'Your challenge', qlabel: 'Questions in this challenge',
      none: 'Include at least one skill to generate a challenge.', build: 'Turn on a skill above to build your challenge'
    },
    mixed: {
      title: 'Mixed drill',
      sub: 'Pick the skills to shuffle together and set a difficulty for each. The round starts as soon as you press Start.',
      tag: 'Your drill', qlabel: 'Questions in this drill',
      none: 'Include at least one skill to start the drill.', build: 'Turn on a skill above to build your drill'
    }
  };
  function applyModeTexts(){
    const t = MODE_TEXT[mode];
    view.dataset.mode = mode;   // CSS hides the "Generate code" half of the button in mixed mode
    topbarTitle.textContent = t.title;
    pageSub.textContent = t.sub;
    slTag.textContent = t.tag;
    qcountLabel.textContent = t.qlabel;
  }

  function freshDraft(){
    draftSeed = randomSeed();
    selected = new Set();   // start from scratch: the player picks every skill themselves
    config = {};
    SKILL_ORDER_LOCAL.forEach(k => {
      // the custom editor starts from the player's last-used numbers for that skill (same as the Difficulty popup)
      const saved = skillConfig[k] || DEFAULT_CONFIG[k];
      config[k] = {
        level: 'easy',
        custom: { min: saved.min, max: saved.max, parity: saved.parity || 'any', count: saved.count || 2 }
      };
    });
    questionCount = 15;
  }

  // ---------- per-skill settings cards ----------
  function buildConfigCard(skillId){
    const c = config[skillId];
    const isAdd = SKILL_HAS_COUNT[skillId];   // skills with a "how many numbers" setting (Additions, Subtraction)
    const isCustom = c.level === 'custom';
    const val = (v) => (v === null || v === undefined || Number.isNaN(v)) ? '' : v;

    const pillHtml = (level) => `
      <button class="cc-diff-opt ${c.level === level ? 'active' : ''}" data-level="${level}">
        <div class="cc-do-name">${DIFF_LABELS[level]}</div>
        <div class="cc-do-range">${presetLabel(skillId, level)}</div>
        <span class="cc-info-btn">
          <span class="cc-info-dot">i</span>
          <span class="cc-info-note"><span class="cc-in-arrow"></span>${presetNote(skillId, level)}</span>
        </span>
      </button>`;

    let rows = `
      <div class="cc-config-row">
        <label>Range</label>
        <div class="cc-range-inputs">
          <input type="number" class="cc-range-input" data-field="min" value="${val(c.custom.min)}">
          <span class="dim">–</span>
          <input type="number" class="cc-range-input" data-field="max" value="${val(c.custom.max)}">
        </div>
      </div>`;

    if(!isAdd){
      rows += `
      <div class="cc-config-row">
        <label>Type</label>
        <div class="cc-segmented cc-parity-seg" data-seg="parity">
          <button data-v="any" class="${c.custom.parity === 'any' ? 'active' : ''}">Any</button>
          <button data-v="even" class="${c.custom.parity === 'even' ? 'active' : ''}">Even</button>
          <button data-v="odd" class="${c.custom.parity === 'odd' ? 'active' : ''}">Odd</button>
        </div>
      </div>`;
    } else {
      const countIsCustomVal = ![2, 3, 4].includes(c.custom.count);
      rows += `
      <div class="cc-config-row">
        <label>How many</label>
        <div class="cc-segmented cc-count-seg" data-seg="count">
          <button data-v="2" class="${c.custom.count === 2 ? 'active' : ''}">2</button>
          <button data-v="3" class="${c.custom.count === 3 ? 'active' : ''}">3</button>
          <button data-v="4" class="${c.custom.count === 4 ? 'active' : ''}">4</button>
          <button data-v="custom" class="cc-count-custom-btn ${countIsCustomVal ? 'active editing' : ''}" title="Custom count" aria-label="Custom count">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            <input type="number" class="cc-count-custom-input" min="1" style="display:${countIsCustomVal ? 'block' : 'none'};" value="${countIsCustomVal ? val(c.custom.count) : ''}">
          </button>
        </div>
      </div>`;
    }

    // Only the levels this skill has presets for, plus Custom unless the skill opts out
    // (DIFF_ORDER / NO_CUSTOM live in ui.js). Two buttons per row; an odd one out gets its own row.
    const customPill = `
          <button class="cc-diff-opt ${isCustom ? 'active' : ''}" data-level="custom">
            <div class="cc-do-name">Custom</div>
            <div class="cc-do-range">Set your own</div>
            <span class="cc-info-btn">
              <span class="cc-info-dot">i</span>
              <span class="cc-info-note"><span class="cc-in-arrow"></span>${CUSTOM_NOTE[skillId] || ''}</span>
            </span>
          </button>`;
    const pills = DIFF_ORDER.filter(l => DIFFICULTY_PRESETS[skillId][l]).map(pillHtml);
    if(!NO_CUSTOM[skillId]) pills.push(customPill);
    let rowsHtml = '';
    for(let i = 0; i < pills.length; i += 2){
      const chunk = pills.slice(i, i + 2);
      rowsHtml += `<div class="cc-diff-row ${chunk.length === 2 ? 'pair' : 'single'}">${chunk.join('')}</div>`;
    }

    const card = document.createElement('div');
    card.className = 'cc-config-card';
    card.dataset.skill = skillId;
    card.innerHTML = `
      <div class="cc-config-head">
        <div class="cc-config-title">${skillDisplayLabels[skillId]}</div>
        <button class="cc-config-reset" data-reset="${skillId}">Reset</button>
      </div>
      <div class="cc-diff-rows">
        ${rowsHtml}
      </div>
      <div class="cc-custom-editor ${isCustom ? 'show' : ''}">
        <div class="cc-config-rows">${rows}</div>
      </div>`;
    return card;
  }

  function renderConfigCards(){
    configStack.innerHTML = '';
    emptyNote.style.display = selected.size === 0 ? 'block' : 'none';
    SKILL_ORDER_LOCAL.forEach(id => {
      if(selected.has(id)) configStack.appendChild(buildConfigCard(id));
    });
  }

  // Re-render ONE card in place so the rest of the stack never flickers.
  function refreshOneCard(skillId){
    const old = configStack.querySelector(`.cc-config-card[data-skill="${skillId}"]`);
    if(old) old.replaceWith(buildConfigCard(skillId));
  }

  // ---------- events: bound ONCE on stable parents (delegation), never per card ----------
  configStack.addEventListener('click', (e) => {
    const infoBtn = e.target.closest('.cc-info-btn');
    if(infoBtn){ toggleNote(infoBtn); return; }   // the (i) sits inside the difficulty button, so check it first

    const card = e.target.closest('.cc-config-card');
    if(!card) return;
    const skillId = card.dataset.skill;

    const diffOpt = e.target.closest('.cc-diff-opt');
    if(diffOpt){
      config[skillId].level = diffOpt.dataset.level;
      refreshOneCard(skillId);
      updateFooter();
      return;
    }

    const parityBtn = e.target.closest('[data-seg="parity"] button');
    if(parityBtn){
      card.querySelectorAll('[data-seg="parity"] button').forEach(b => b.classList.remove('active'));
      parityBtn.classList.add('active');
      config[skillId].custom.parity = parityBtn.dataset.v;
      updateFooter();
      return;
    }

    const countBtn = e.target.closest('[data-seg="count"] button');
    if(countBtn){
      if(countBtn.classList.contains('cc-count-custom-btn')){
        const input = countBtn.querySelector('.cc-count-custom-input');
        if(countBtn.classList.contains('editing')){ input.focus(); return; }
        card.querySelectorAll('[data-seg="count"] button').forEach(b => b.classList.remove('active'));
        countBtn.classList.add('active', 'editing');
        input.style.display = 'block';
        input.value = '';
        input.focus();
        input.select();
        hideBarWhileEditing(input);
        return;
      }
      card.querySelectorAll('[data-seg="count"] button').forEach(b => {
        b.classList.remove('active');
        if(b.classList.contains('cc-count-custom-btn')){
          b.classList.remove('editing');
          b.querySelector('.cc-count-custom-input').style.display = 'none';
        }
      });
      countBtn.classList.add('active');
      config[skillId].custom.count = parseInt(countBtn.dataset.v, 10);
      updateFooter();
      return;
    }

    if(e.target.closest('.cc-count-custom-input')){ e.stopPropagation(); return; }

    const resetBtn = e.target.closest('[data-reset]');
    if(resetBtn){
      config[skillId].level = 'easy';
      refreshOneCard(skillId);
      updateFooter();
    }
  });

  configStack.addEventListener('input', (e) => {
    const rangeInput = e.target.closest('.cc-range-input');
    if(rangeInput){
      const skillId = rangeInput.closest('.cc-config-card').dataset.skill;
      const v = parseInt(rangeInput.value, 10);
      // an empty/garbage field is stored as null so "Generate" stays blocked until it is filled in
      config[skillId].custom[rangeInput.dataset.field] = Number.isNaN(v) ? null : v;
      updateFooter();
      return;
    }
    const countInput = e.target.closest('.cc-count-custom-input');
    if(countInput){
      const skillId = countInput.closest('.cc-config-card').dataset.skill;
      const v = parseInt(countInput.value, 10);
      if(v > 0){ config[skillId].custom.count = v; updateFooter(); }
    }
  });

  grid.addEventListener('click', (e) => {
    const tile = e.target.closest('.cc-skill-toggle');
    if(!tile) return;
    const id = tile.dataset.skill;
    if(selected.has(id)){ selected.delete(id); tile.classList.remove('on'); }
    else { selected.add(id); tile.classList.add('on'); }
    renderConfigCards();
    updateFooter();
  });

  // ---------- (i) info popovers: fixed-position, clamped to the screen ----------
  function positionNote(btn){
    const note = btn.querySelector('.cc-info-note');
    const rect = btn.getBoundingClientRect();
    const noteWidth = 200;
    let left = rect.left + rect.width / 2 - noteWidth / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - noteWidth - 10));
    note.style.left = left + 'px';
    note.style.top = (rect.bottom + 10) + 'px';
    const arrow = note.querySelector('.cc-in-arrow');
    arrow.style.left = ((rect.left + rect.width / 2) - left - 5) + 'px';
    arrow.style.marginLeft = '0';
  }
  function toggleNote(btn){
    const note = btn.querySelector('.cc-info-note');
    const wasOpen = note.classList.contains('open');
    view.querySelectorAll('.cc-info-note.open').forEach(n => n.classList.remove('open'));
    if(!wasOpen){ positionNote(btn); note.classList.add('open'); }
  }
  view.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('.cc-info-btn');
    if(btn) positionNote(btn);
  });
  document.addEventListener('click', (e) => {
    if(!e.target.closest('.cc-info-btn')){
      view.querySelectorAll('.cc-info-note.open').forEach(n => n.classList.remove('open'));
    }
  });

  // ---------- question count: 15 / 30 / 50 + pencil that expands into a field ----------
  // The fixed bottom bar would sit on top of the phone keyboard and cover the field, so it is
  // removed while a number field in this screen is being edited, then restored on blur.
  function hideBarWhileEditing(field){
    if(window.innerWidth > 640) return;
    strip.style.display = 'none';
    const restore = () => { strip.style.display = ''; field.removeEventListener('blur', restore); };
    field.addEventListener('blur', restore);
  }

  qcountBar.querySelectorAll('.cc-qcount-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      if(opt === qcountCustomBtn){
        qcountBar.querySelectorAll('.cc-qcount-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active', 'expanded');
        qcountBar.classList.add('custom-active');
        qcountInline.focus();
        hideBarWhileEditing(qcountInline);
        if(qcountInline.value) questionCount = parseInt(qcountInline.value, 10) || questionCount;
        updateFooter();
        return;
      }
      qcountBar.querySelectorAll('.cc-qcount-opt').forEach(o => o.classList.remove('active'));
      qcountCustomBtn.classList.remove('expanded');
      qcountBar.classList.remove('custom-active');
      opt.classList.add('active');
      questionCount = parseInt(opt.dataset.n, 10);
      updateFooter();
    });
  });
  qcountInline.addEventListener('click', (e) => e.stopPropagation());
  qcountInline.addEventListener('input', () => {
    let v = parseInt(qcountInline.value, 10);
    const max = maxQuestionsAllowed();
    if(v > max){ v = max; qcountInline.value = max; }
    if(v > 0){ questionCount = v; updateFooter(); }
  });

  // ---------- bottom bar: summary + Generate ----------
  function formatEstimate(totalSeconds){
    const m = Math.floor(totalSeconds / 60), s = totalSeconds % 60;
    return m === 0 ? `${s}s` : `${m}m ${s}s`;
  }

  function customIsInvalid(){
    return SKILL_ORDER_LOCAL.some(k => {
      if(!selected.has(k) || config[k].level !== 'custom') return false;
      const { min, max } = config[k].custom;
      return !(Number.isFinite(min) && Number.isFinite(max) && min < max);   // same rule as the Difficulty popup
    });
  }

  // The most questions the chosen skills can give without repeating a number (their pools added
  // together, since a mixed set spreads its questions across the skills).
  function maxQuestionsAllowed(){
    if(selected.size === 0) return Infinity;
    let total = 0;
    for(const id of SKILL_ORDER_LOCAL){
      if(!selected.has(id)) continue;
      const cfg = resolveConfig(id);
      if(!Number.isFinite(cfg.min) || !Number.isFinite(cfg.max) || cfg.min >= cfg.max) return Infinity;  // invalid custom: Generate is blocked anyway
      total += questionPoolSize(id, cfg);
    }
    return total;
  }
  // Greys out (and disables) question counts that are too big for the chosen skills.
  function applyQcountLimits(){
    const max = maxQuestionsAllowed();
    const opts = [...qcountBar.querySelectorAll('.cc-qcount-opt')].filter(o => o !== qcountCustomBtn);
    opts.forEach(o => { o.disabled = parseInt(o.dataset.n, 10) > max; });
    qcountInline.max = Number.isFinite(max) ? max : '';
    if(questionCount > max){
      const ok = opts.filter(o => !o.disabled).pop();
      qcountBar.querySelectorAll('.cc-qcount-opt').forEach(o => o.classList.remove('active'));
      if(ok){
        ok.classList.add('active');
        qcountCustomBtn.classList.remove('expanded');
        qcountBar.classList.remove('custom-active');
        questionCount = parseInt(ok.dataset.n, 10);
      } else {
        qcountCustomBtn.classList.add('active', 'expanded');
        qcountBar.classList.add('custom-active');
        qcountInline.value = max;
        questionCount = max;
      }
    }
  }

  function updateFooter(){
    applyQcountLimits();
    const n = selected.size;
    const invalid = n > 0 && customIsInvalid();
    btnGenerate.disabled = (n === 0) || invalid;
    btnStart.disabled = btnGenerate.disabled;

    if(n === 0){
      blockedMsg.textContent = MODE_TEXT[mode].none;
      blockedMsg.classList.add('show');
      summaryTitle.textContent = 'No skills selected yet';
      summaryDesc.textContent = MODE_TEXT[mode].build;
      summaryEst.textContent = '—';
      return;
    }
    if(invalid){
      blockedMsg.textContent = 'Enter a valid min and max for each custom skill (min below max).';
      blockedMsg.classList.add('show');
    } else {
      blockedMsg.classList.remove('show');
    }
    const names = SKILL_ORDER_LOCAL.filter(id => selected.has(id)).map(id => skillDisplayLabels[id]);
    summaryTitle.textContent = `${n} skill${n > 1 ? 's' : ''} · ${questionCount} questions`;
    summaryDesc.textContent = names.join(', ');
    // Dynamic: every level of every skill has its own timer, so add them up from the real presets.
    const cfgBySkill = {};
    SKILL_ORDER_LOCAL.filter(id => selected.has(id)).forEach(id => { cfgBySkill[id] = resolveConfig(id); });
    summaryEst.textContent = formatEstimate(estimateRoundSeconds(Object.keys(cfgBySkill), cfgBySkill, questionCount));
  }

  // Turns the picked level (or custom numbers) for one skill into the plain {min,max,parity,count?}
  // shape the game and the challenge code use. Presets have no parity of their own, so they use 'any'
  // (a shared challenge must not depend on the creator's personal saved settings).
  function resolveConfig(skillId){
    const c = config[skillId];
    const isAdd = SKILL_HAS_COUNT[skillId];
    if(c.level === 'custom'){
      const out = { min: c.custom.min, max: c.custom.max, parity: isAdd ? 'any' : c.custom.parity };
      if(isAdd) out.count = c.custom.count || 2;
      return out;
    }
    const p = DIFFICULTY_PRESETS[skillId][c.level];
    const out = { min: p.min, max: p.max, parity: 'any' };
    if(isAdd) out.count = p.count;
    if(p.mode) out.mode = p.mode;
    return out;
  }

  btnGenerate.addEventListener('click', () => {
    if(btnGenerate.disabled) return;
    const included = SKILL_ORDER_LOCAL.filter(k => selected.has(k));
    if(included.length === 0) return;
    const cfgBySkill = {};
    included.forEach(k => { cfgBySkill[k] = resolveConfig(k); });
    const payload = buildChallengePayload(included, cfgBySkill, questionCount, draftSeed);
    showGeneratedCode(encodeChallengeCode(payload));   // existing "share this code" popup in ui.js
  });

  // Start: play this set right now (no trip through Enter code + Challenge details).
  // - Create a challenge: uses the same seed as the code above, so you play exactly what you share. Saved as a challenge round.
  // - Mixed drill: a fresh seed every time; saved to History as a normal Mixed round (fromChallenge:false).
  // It goes through the same pendingChallenge hand-off an entered code uses, so game.js needs no special case.
  btnStart.addEventListener('click', () => {
    if(btnStart.disabled) return;
    const included = SKILL_ORDER_LOCAL.filter(k => selected.has(k));
    if(included.length === 0) return;
    const cfgBySkill = {};
    included.forEach(k => { cfgBySkill[k] = resolveConfig(k); });
    state.practiceMode = false;   // a leftover Practice tick from an earlier round must not stop this one being saved
    pendingChallenge = {
      included,
      cfg: cfgBySkill,
      n: questionCount,
      seed: mode === 'mixed' ? randomSeed() : draftSeed,
      fromChallenge: mode === 'challenge',
      returnTo: 'challenge'   // leaving the round returns to THIS screen, settings intact (see game.js)
    };
    startRound();
  });

  // ---------- keep a focused field clear of the phone keyboard ----------
  // WHY IT JUMPED: the keyboard takes ~250-300ms to slide up, and while it does the visible height
  // keeps shrinking, which also shrinks #app and this screen (--vh follows visualViewport). The old
  // fixed 200ms timer measured the field mid-slide, so the scroll aimed at a target that was still
  // moving, and the browser's own correction then made the page lurch.
  // NOW: wait until the visible height has stopped changing, measure ONCE, do ONE smooth scroll.
  // Shared with the Enter Code screen (entercode.js calls window.keepFieldClearOfKeyboard).
  let kbToken = 0;
  window.keepFieldClearOfKeyboard = function(scroller, field){
    const token = ++kbToken;                      // a newer focus cancels an older pending scroll
    const vv = window.visualViewport;
    const heightNow = () => vv ? vv.height : window.innerHeight;
    const panNow = () => vv ? vv.offsetTop : 0;   // how far the browser has panned the visible area down to reveal the field
    const MIN_WAIT = 200, QUIET = 120, MAX_WAIT = 800;
    const start = performance.now();
    let lastH = heightNow(), lastPan = panNow(), lastChange = start;
    const timer = setInterval(() => {
      if(token !== kbToken || document.activeElement !== field){ clearInterval(timer); return; }
      const now = performance.now();
      const h = heightNow(), pan = panNow();
      if(Math.abs(h - lastH) > 0.5 || Math.abs(pan - lastPan) > 0.5){ lastH = h; lastPan = pan; lastChange = now; }
      const settled = now - start >= MIN_WAIT && now - lastChange >= QUIET;
      if(!settled && now - start < MAX_WAIT) return;
      clearInterval(timer);
      // WHY IT OVERSHOT on the lowest field: the browser also pans the visible area down (vv.offsetTop) to
      // reveal it, so measuring from the screen's top edge aimed too high. Measure inside what is really visible.
      const sRect = scroller.getBoundingClientRect();
      const areaTop = Math.max(sRect.top, pan);
      const areaBottom = Math.min(sRect.bottom, pan + h);
      const visibleH = areaBottom - areaTop;
      const delta = field.getBoundingClientRect().top - (areaTop + visibleH * 0.4);
      if(Math.abs(delta) > 2) scroller.scrollBy({ top: delta, behavior: 'smooth' });
    }, 40);
  };

  document.addEventListener('focusin', (e) => {
    const field = e.target;
    if(!view.contains(field) || !field.matches('input[type="number"], input[type="text"]')) return;
    keepFieldClearOfKeyboard(view, field);
  });

  // ---------- entry point: Home → "Create" ----------
  function openChallengeScreen(m){
    mode = (m === 'mixed') ? 'mixed' : 'challenge';
    applyModeTexts();
    freshDraft();
    grid.querySelectorAll('.cc-skill-toggle').forEach(t => t.classList.toggle('on', selected.has(t.dataset.skill)));
    qcountBar.querySelectorAll('.cc-qcount-opt').forEach(o => o.classList.remove('active', 'expanded'));
    qcountBar.classList.remove('custom-active');
    qcountBar.querySelector('[data-n="15"]').classList.add('active');
    qcountInline.value = '';
    strip.style.display = '';
    renderConfigCards();
    updateFooter();
    showView('challenge');
  }
  window.openChallengeScreen = openChallengeScreen;

  const homeCreateBtn = document.getElementById('challengeCreateBtn');
  if(homeCreateBtn) homeCreateBtn.addEventListener('click', () => openChallengeScreen('challenge'));

  // Home's "Feeling brave?" strip opens the same screen as the Mixed drill setup. The WHOLE strip is the tap target
  // (the Start button inside it is part of the strip, so its click bubbles up to this one handler).
  const homeMixedStrip = document.getElementById('braveStrip');
  if(homeMixedStrip) homeMixedStrip.addEventListener('click', () => openChallengeScreen('mixed'));
})();
