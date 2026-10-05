// ============================================================
// INFO.JS — About us + Report a bug pages, and the Keyboard shortcuts popup
//
// Wires the 3-dot menu entries to their screens, builds the Keyboard shortcuts page's
// skill-letter list from the registry, shows the one-time "there are shortcuts" popup, and sends
// the Report a bug form to Web3Forms (a third-party service that emails each report to the app owner).
// Loaded after challengedetails.js, before popups.js / nav.js.
// ============================================================
(function(){
  document.getElementById('btnAboutUs').addEventListener('click', () => showView('about'));

  // ---------- Keyboard shortcuts popup ----------
  const scOverlay = document.getElementById('shortcutsModal');
  const hintOverlay = document.getElementById('shortcutHintModal');

  function openShortcuts(){
    markShortcutHintSeen();                    // they found the shortcuts themselves, so the one-time hint has done its job
    hintOverlay.classList.remove('show');
    scOverlay.classList.add('show');
  }
  function closeShortcuts(){ scOverlay.classList.remove('show'); }
  // keys.js uses these for Ctrl + .
  window.openShortcuts = openShortcuts;
  window.closeShortcuts = closeShortcuts;

  document.getElementById('btnShortcuts').addEventListener('click', openShortcuts);
  document.getElementById('btnShortcutsClose').addEventListener('click', closeShortcuts);
  scOverlay.addEventListener('click', (e) => { if(e.target === scOverlay) closeShortcuts(); });

  // "Skill letters" list: one line per letter, built from SKILL_KEY (js/registry.js) so new skills show up on their own.
  // Skills that share a letter are listed in the order the key cycles through them.
  (function buildShortcutLetters(){
    const host = document.getElementById('scLetters');
    const byKey = new Map();
    SKILL_ORDER.forEach(k => {
      const letter = SKILL_KEY[k];
      if(!byKey.has(letter)) byKey.set(letter, []);
      byKey.get(letter).push(skillDisplayLabels[k]);
    });
    byKey.forEach((names, letter) => {
      const item = document.createElement('div');
      item.className = 'sc-letter';
      const cap = document.createElement('span');
      cap.className = 'kbd';
      cap.textContent = letter.toUpperCase();
      const text = document.createElement('span');
      text.textContent = names.join(' \u2192 ');
      item.append(cap, text);
      host.appendChild(item);
    });
  })();

  // ---------- one-time popup: "there are keyboard shortcuts" ----------
  // Desktop-style devices only (wide screen + a mouse), once per device, on Home, and never on top of another popup.
  function closeShortcutHint(){ hintOverlay.classList.remove('show'); }
  document.getElementById('btnShortcutHintOk').addEventListener('click', closeShortcutHint);
  document.getElementById('btnShortcutHintSee').addEventListener('click', openShortcuts);
  hintOverlay.addEventListener('click', (e) => { if(e.target === hintOverlay) closeShortcutHint(); });

  setTimeout(() => {
    if(shortcutHintSeen()) return;
    if(!window.matchMedia('(min-width:641px) and (hover:hover) and (pointer:fine)').matches) return;
    if(typeof views === 'undefined' || !views.home.classList.contains('active')) return;
    if(document.querySelector('.modal-overlay.show, .name-overlay.show')) return;
    markShortcutHintSeen();   // marked when SHOWN, so it appears once whatever they do next
    hintOverlay.classList.add('show');
  }, 1500);

  // ---------- Report a bug form ----------
  // The access key is meant to be public: it can only deliver mail to the address it was created for.
  const WEB3FORMS_KEY = '0b3ec341-90d7-44e4-86e6-a3b541093fd3';
  const WEB3FORMS_URL = 'https://api.web3forms.com/submit';

  const bugView  = document.getElementById('view-bug');
  const form     = document.getElementById('bugForm');
  const sendBtn  = document.getElementById('bugSend');
  const statusEl = document.getElementById('bugStatus');

  function setStatus(kind, text){
    statusEl.className = 'bug-status' + (kind ? ' ' + kind : '');
    statusEl.textContent = text || '';
  }

  // the message box grows as the text gets long (CSS min-height is its starting size)
  const msgBox = document.getElementById('bugMessage');
  function growMessageBox(){
    msgBox.style.height = 'auto';
    msgBox.style.height = (msgBox.scrollHeight + msgBox.offsetHeight - msgBox.clientHeight) + 'px';   // + border
  }
  msgBox.addEventListener('input', growMessageBox);

  // opening the page always starts clean (old "Sent" / error message gone)
  document.getElementById('btnReportBug').addEventListener('click', () => {
    setStatus('', '');
    showView('bug');
  });
  // typing again clears the previous result
  form.addEventListener('input', () => { if(statusEl.textContent) setStatus('', ''); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(sendBtn.disabled) return;

    const payload = Object.fromEntries(new FormData(form).entries());   // name, email, message, botcheck (only if a bot ticked it)
    payload.access_key = WEB3FORMS_KEY;
    payload.subject = 'Numbers app: bug report';
    payload.from_name = 'Numbers app';

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';
    setStatus('', '');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try{
      const res = await fetch(WEB3FORMS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      const data = await res.json().catch(() => ({}));
      if(res.ok && data.success){
        form.reset();
        growMessageBox();   // reset() doesn't fire an input event, so shrink the box back by hand
        setStatus('ok', 'Sent! Thanks for the report.');
      } else {
        setStatus('err', "Couldn't send your report. Please try again in a moment.");
      }
    }catch(err){
      setStatus('err', navigator.onLine
        ? "Couldn't reach the server. Your text is still here, so try again in a moment."
        : "You seem to be offline. Your text is still here, so try again once you're connected.");
    }finally{
      clearTimeout(timer);
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send report';
    }
  });

  // ---------- phone keyboard: lift the tapped field BEFORE the keyboard opens ----------
  // WHY THE FLICKER: the keyboard used to open first and hide the field, so the browser scrolled/panned to
  // reveal it, then our own scroll corrected that, then the app resized (up, down, up). Now the field is
  // already lifted into the upper part of the screen when the keyboard arrives, so the browser has
  // nothing to correct and only this one smooth scroll happens.
  const bugPage = bugView.querySelector('.bug-page');
  let scrollRaf = 0, lastLift = 0, padTimer = 0;

  function tweenScroll(el, to, ms){
    cancelAnimationFrame(scrollRaf);
    const from = el.scrollTop, t0 = performance.now();
    (function step(){
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.scrollTop = from + (to - from) * (1 - Math.pow(1 - k, 3));   // ease-out
      if(k < 1) scrollRaf = requestAnimationFrame(step);
    })();
  }

  function liftField(field){
    if(window.innerWidth > 640) return;                               // phones only
    lastLift = performance.now();
    clearTimeout(padTimer);
    const vv = window.visualViewport;
    const visible = vv ? vv.height : window.innerHeight;
    const expected = Math.min(visible, window.innerHeight * 0.55);    // the part of the screen that will be left above the keyboard
    const top = bugView.getBoundingClientRect().top;
    const delta = field.getBoundingClientRect().top - (top + expected * 0.4);
    if(Math.abs(delta) < 4) return;
    let to = Math.max(0, bugView.scrollTop + delta);
    const room = bugView.scrollHeight - bugView.clientHeight;
    if(to > room){                                                    // page is still full height, so add temporary room to scroll into
      const pad = parseFloat(getComputedStyle(bugPage).paddingBottom) || 0;
      bugPage.style.paddingBottom = (pad + (to - room) + 2) + 'px';
    }
    tweenScroll(bugView, to, 180);
  }

  // a tap fires mousedown just before the field takes focus, i.e. before the keyboard starts opening
  bugView.addEventListener('mousedown', (e) => {
    const f = e.target.closest('input, textarea');
    if(f) liftField(f);
  });
  // other ways of reaching a field (keyboard "next" key, etc.)
  bugView.addEventListener('focusin', (e) => {
    if(!e.target.matches('input, textarea')) return;
    if(performance.now() - lastLift < 500) return;
    liftField(e.target);
  });
  // when the keyboard is gone again, remove the temporary extra room
  bugView.addEventListener('focusout', () => {
    padTimer = setTimeout(() => {
      if(!bugView.contains(document.activeElement)) bugPage.style.paddingBottom = '';
    }, 400);
  });
})();
