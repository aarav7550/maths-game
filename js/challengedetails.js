// ============================================================
// CHALLENGEDETAILS.JS — the Challenge Details screen (read-only preview of a decoded
// challenge code, with a Start button).
//
// Uses from other files (all loaded before this one):
//   storage.js  skillConfig, pendingChallenge
//   skills.js   SKILL_ORDER, state, showView()
//   game.js     startRound()
//   ui.js       DIFF_LABELS, skillDisplayLabels, matchingDifficultyForConfig(),
//               estimateRoundSeconds(), practiceCheckbox
//
// Reached from the Enter Code screen: entercode.js calls window.openChallengeDetails(payload)
// once a code has been decoded and validated. Starting from here uses the exact same
// hand-off the old popup used (pendingChallenge + startRound), so the round, results and
// history saving are unchanged. Nothing here touches the player's own saved settings.
//
// All of this screen's ids/classes are prefixed cd / cd- (Create uses cc-, Enter Code uses ec-).
// ============================================================
(function(){
  const view = document.getElementById('view-challengedetails');
  if(!view) return;

  const chipRow = document.getElementById('cdChipRow');
  const configStack = document.getElementById('cdConfigStack');
  const qcountValue = document.getElementById('cdQcountValue');
  const summaryTitle = document.getElementById('cdSummaryTitle');
  const summaryDesc = document.getElementById('cdSummaryDesc');
  const summaryEst = document.getElementById('cdSummaryEst');
  const btnStart = document.getElementById('cdBtnStart');

  const SHORT_ICON = SKILL_ICON;   // one shared icon list (ui.js)
  const PARITY_LABEL = { any:'Any', even:'Even only', odd:'Odd only' };

  let current = null;   // the decoded payload being shown

  function formatEstimate(totalSeconds){
    const m = Math.floor(totalSeconds / 60), s = totalSeconds % 60;
    return m === 0 ? `${s}s` : `${m}m ${s}s`;
  }

  // The settings this skill will really be played with. A code that lacks a skill's settings
  // falls back to the player's own saved ones, exactly like game.js's activeConfig() does.
  function settingsFor(payload, skillId){
    return (payload.cfg && payload.cfg[skillId]) || skillConfig[skillId];
  }

  function buildCard(skillId, cfg){
    const level = matchingDifficultyForConfig(skillId, cfg);
    const isAdd = skillId === 'add';

    let rows = `
      <div class="cd-row"><span class="cd-label">Range</span><span class="cd-value">${cfg.min}–${cfg.max}</span></div>`;
    if(SKILL_META[skillId].modeText){
      rows += `
      <div class="cd-row"><span class="cd-label">${SKILL_META[skillId].modeLabel || 'Mode'}</span><span class="cd-value">${SKILL_META[skillId].modeText(cfg)}</span></div>`;
    } else if(!isAdd){
      rows += `
      <div class="cd-row"><span class="cd-label">Number type</span><span class="cd-value">${PARITY_LABEL[cfg.parity] || PARITY_LABEL.any}</span></div>`;
    } else {
      rows += `
      <div class="cd-row"><span class="cd-label">How many numbers</span><span class="cd-value">${cfg.count || 2}</span></div>`;
    }

    const card = document.createElement('div');
    card.className = 'cd-card';
    card.dataset.skill = skillId;
    card.innerHTML = `
      <div class="cd-card-head">
        <div class="cd-card-title">${skillDisplayLabels[skillId]}</div>
        <div class="cd-level-badge">${DIFF_LABELS[level]}</div>
      </div>
      <div class="cd-rows">${rows}</div>`;
    return card;
  }

  function render(payload){
    chipRow.innerHTML = '';
    configStack.innerHTML = '';

    // show skills in the app's usual order, whatever order the code listed them in
    const included = SKILL_ORDER.filter(k => payload.included.includes(k));
    const cfgBySkill = {};

    included.forEach(skillId => {
      const cfg = settingsFor(payload, skillId);
      cfgBySkill[skillId] = cfg;

      const chip = document.createElement('div');
      chip.className = 'cd-chip';
      chip.dataset.skill = skillId;
      chip.innerHTML = `<span class="cd-chip-icon">${SHORT_ICON[skillId]}</span><span class="cd-chip-name">${skillDisplayLabels[skillId]}</span>`;
      chipRow.appendChild(chip);

      configStack.appendChild(buildCard(skillId, cfg));
    });

    const n = included.length;
    qcountValue.innerHTML = `${payload.n} <span class="cd-unit">questions</span>`;
    summaryTitle.textContent = `${n} skill${n > 1 ? 's' : ''} · ${payload.n} questions`;
    summaryDesc.textContent = included.map(k => skillDisplayLabels[k]).join(', ');
    // same estimate the Create screen shows, from the real per-skill timers
    summaryEst.textContent = formatEstimate(estimateRoundSeconds(included, cfgBySkill, payload.n));
  }

  // ---------- entry point: Enter Code → valid code ----------
  function openChallengeDetails(payload){
    current = payload;
    render(payload);
    view.scrollTop = 0;
    showView('challengedetails');
  }
  window.openChallengeDetails = openChallengeDetails;

  // ---------- Start: same hand-off the old Enter popup used ----------
  btnStart.addEventListener('click', () => {
    if(!current || state.running) return;
    pendingChallenge = current;       // startRound() picks this up and plays it with the code's own settings + seed
    state.practiceMode = false;       // challenge rounds are always timed
    practiceCheckbox.checked = false;
    startRound();
  });
})();
