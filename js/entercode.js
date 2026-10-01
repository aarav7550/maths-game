// ============================================================
// ENTERCODE.JS — the Enter a Code screen (paste a challenge code, validate it, hand off).
//
// Uses from other files (all loaded before this one):
//   storage.js    decodeChallengeCode(), pendingChallenge
//   skills.js     SKILLS, state, showView()
//   game.js       startRound()
//   ui.js         practiceCheckbox
//
// Wrapped in one function so its names can't clash with globals. All of this screen's
// ids/classes are prefixed ec / ec- (the old popup used challengeEnter* names).
//
// HAND-OFF: when a code is valid, this calls window.openChallengeDetails(payload) if the
// Challenge Details page exists. Until that page is built it falls back to starting the
// round straight away (same behaviour the old popup had), so nothing is broken in between.
// ============================================================
(function(){
  const view = document.getElementById('view-entercode');
  if(!view) return;

  const input = document.getElementById('ecCodeInput');
  const shell = document.getElementById('ecInputShell');
  const display = document.getElementById('ecCodeDisplay');
  const errorBox = document.getElementById('ecError');
  const btnView = document.getElementById('ecBtnView');
  const homeEnterBtn = document.getElementById('challengeEnterBtn');

  const FOCUS_DELAY_MS = 300;   // wait after opening the page before the field is focused (slide-in is 300ms)
  let focusTimer = 0;
  let busy = false;   // true while the success sweep plays, so a second tap / Enter can't double-submit

  // ---------- validation (real decoder, replaces the mockup's "123" check) ----------
  // Returns the decoded payload, or null if the text isn't a usable challenge code.
  function validate(raw){
    const payload = decodeChallengeCode(raw);
    if(!payload) return null;
    const ok = Array.isArray(payload.included) && payload.included.length > 0
      && payload.included.every(k => SKILLS[k])
      && Number.isInteger(payload.n) && payload.n > 0;
    return ok ? payload : null;
  }

  // ---------- visible character layer (so the success sweep can light each character) ----------
  function renderDisplay(){
    display.innerHTML = '';
    for(const ch of input.value){
      const span = document.createElement('span');
      span.className = 'ch';
      span.textContent = ch === '\n' ? '' : ch;
      if(ch === '\n') span.style.flexBasis = '100%';
      display.appendChild(span);
    }
  }

  // Grows the field to fit the whole code (codes can be 300+ characters).
  function autoGrow(){
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  }

  function clearError(){
    shell.classList.remove('error');
    errorBox.classList.remove('show');
  }
  function clearSuccess(){
    shell.classList.remove('success');
    display.querySelectorAll('.ch.lit').forEach(s => s.classList.remove('lit'));
  }
  function showError(){
    clearSuccess();
    shell.classList.add('error');
    errorBox.classList.add('show');
  }

  input.addEventListener('input', () => {
    renderDisplay();
    autoGrow();
    btnView.disabled = busy || input.value.trim().length === 0;
    if(errorBox.classList.contains('show')) clearError();
    if(shell.classList.contains('success')) clearSuccess();
  });

  // (No keyboard-scroll helper on this screen: the field already sits at the top, nothing needs to scroll.)

  // ---------- success sweep: fixed total time, so a 300-character code isn't slow ----------
  const SWEEP_TOTAL_MS = 140;
  const MIN_STAGGER_MS = 3;

  function playSuccessAnimation(onDone){
    shell.classList.add('success');
    const chars = display.querySelectorAll('.ch');
    const stagger = chars.length > 1 ? Math.max(MIN_STAGGER_MS, SWEEP_TOTAL_MS / chars.length) : 0;
    chars.forEach((span, i) => setTimeout(() => span.classList.add('lit'), i * stagger));
    setTimeout(onDone, chars.length * stagger + 90);
  }

  function handOff(payload){
    if(typeof window.openChallengeDetails === 'function'){
      window.openChallengeDetails(payload);
      return;
    }
    // Fallback until the Challenge Details page exists: start the round directly.
    pendingChallenge = payload;
    state.practiceMode = false;
    practiceCheckbox.checked = false;
    startRound();
  }

  function attemptSubmit(){
    if(busy) return;
    const payload = validate(input.value);
    if(!payload){ showError(); return; }
    clearError();
    busy = true;
    btnView.disabled = true;
    input.blur();   // drops the phone keyboard so the sweep is visible
    playSuccessAnimation(() => {
      busy = false;
      handOff(payload);
      // Once the next screen has slid in, put this one back to normal, so coming back with Back
      // shows the code ready to edit/re-submit instead of a greyed button and green text.
      setTimeout(() => {
        clearSuccess();
        btnView.disabled = input.value.trim().length === 0;
      }, 450);
    });
  }

  btnView.addEventListener('click', attemptSubmit);

  // Enter submits (Shift+Enter still inserts a newline, in case a pasted code ever has one).
  input.addEventListener('keydown', (e) => {
    if(e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    if(input.value.trim().length === 0) return;
    attemptSubmit();
  });

  // ---------- entry point: Home → "Enter code" ----------
  function openEnterCodeScreen(){
    busy = false;
    input.value = '';
    renderDisplay();
    autoGrow();
    clearError();
    clearSuccess();
    btnView.disabled = true;
    showView('entercode');
    // Let the slide-in finish first, then focus the field (this is what raises the keyboard).
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => {
      if(view.classList.contains('active') && !busy) input.focus({ preventScroll:true });
    }, FOCUS_DELAY_MS);
  }
  window.openEnterCodeScreen = openEnterCodeScreen;

  if(homeEnterBtn) homeEnterBtn.addEventListener('click', openEnterCodeScreen);
})();
