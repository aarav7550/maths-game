// ============================================================
// NAV.JS — system Back button / swipe-back support (Android + iOS, browser + installed PWA)
//
// Problem this fixes: the app is one page that swaps "views" with showView(), so the
// browser's history never changed and the system Back button left the whole app.
//
// How it works: browser history entries mirror app screens.
//   [sentinel] -> [home] -> [history] -> [skill detail] ...
// - Opening a screen pushes an entry; system Back pops it and we show the previous screen.
// - Back while a popup is open (difficulty picker, exit confirm, name editor, challenge
//   popups, ⋮ menu) closes the popup only.
// - Back during a running round opens the "Leave this round?" confirm instead of quitting.
// - Back on Home (nothing open) steps onto the sentinel entry and exits the app, as expected.
// Loaded LAST (after ui.js / history.js) so it can wrap showView().
// ============================================================
(function(){
  const rawShowView = showView;      // original from skills.js
  let currentView = 'home';
  let depth = 0;                     // screens stacked above Home (Home = 0)
  let exiting = false;

  function stateFor(view, d){ return { app:'numbers', v:view, d:d }; }

  // ---- popups that Back should close first (top-most first) ----
  function closeTopPopup(){
    const dropdown = document.getElementById('moreMenuDropdown');
    if(dropdown && dropdown.classList.contains('open')){ dropdown.classList.remove('open'); return true; }
    const nameOv = document.getElementById('nameOverlay');
    if(nameOv && nameOv.classList.contains('show')){ closeNameEditor(); return true; }
    const exitOv = document.getElementById('exitModal');
    if(exitOv && exitOv.classList.contains('show')){ document.getElementById('btnCancelExit').click(); return true; }
    const hintOv = document.getElementById('decimalHintModal');
    if(hintOv && hintOv.classList.contains('show')){ window.dismissDecimalHint(); return true; }
    const signOv = document.getElementById('signHintModal');
    if(signOv && signOv.classList.contains('show')){ window.dismissSignHint(); return true; }
    const diffOv = document.getElementById('diffModalOverlay');
    if(diffOv && diffOv.classList.contains('show')){ closeDifficultyPicker(); return true; }
    for(const id of ['mixedSoonModal','challengeShowModal','challengeEnterModal','settingsModal']){
      const el = document.getElementById(id);
      if(el && el.classList.contains('show')){ el.classList.remove('show'); return true; }
    }
    // safety net: any other popup that is open (so Esc really closes "all" popups)
    const other = [...document.querySelectorAll('.modal-overlay.show')].pop();
    if(other){ other.classList.remove('show'); return true; }
    return false;
  }

  // ---- screen switching wrapper ----
  function viewEl(name){
    return document.getElementById('view-' + (name === 'historySkill' ? 'history-skill' : name === 'historyFull' ? 'history-full' : name));
  }

  // Page-change animation (stack style, like a native app):
  //   forward: the new screen slides in from the right OVER the old one, which drifts left underneath
  //   back:    the current screen slides out to the right, revealing the old one underneath
  //   Play <-> Results (and re-showing the same screen) swap instantly, no animation
  // Both screens must be visible while it runs, so the leaving one is temporarily re-shown by
  // the .vt-top / .vt-under classes in style.css and cleaned up when the slide finishes.
  const SLIDE_MS = 300;
  const SLIDE_EASE = 'cubic-bezier(.22,.7,.25,1)';
  const UNDER_SHIFT = '-25%';
  let slideToken = 0;

  function cleanupSlide(){
    document.querySelectorAll('.vt-top, .vt-under').forEach(el => {
      el.getAnimations().forEach(a => a.cancel());
      el.classList.remove('vt-top', 'vt-under');
    });
  }

  // hiding a screen resets its scroll position; remember it so the leaving screen doesn't jump to the top mid-slide
  function snapshotScroll(v){
    const out = [];
    if(!v) return out;
    [v, ...v.querySelectorAll('*')].forEach(el => { if(el.scrollTop > 0) out.push([el, el.scrollTop]); });
    return out;
  }

  function slide(pv, nv, dir, scrolls, nvTop){
    cleanupSlide();
    const token = ++slideToken;
    if(!pv || !nv || pv === nv || dir === 'none') return;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const fwd = dir === 'fwd';

    // Desktop (same 641px breakpoint as style.css): the old gentle style. Only the NEW screen moves,
    // a short slide with no fade, and the old screen is simply gone, so nothing can flash.
    if(window.matchMedia('(min-width:641px)').matches){
      nv.animate(
        [{ transform:'translateX(' + (fwd ? 32 : -32) + 'px)' }, { transform:'none' }],
        { duration: SLIDE_MS, easing: SLIDE_EASE }
      );
      return;
    }

    // Mobile: full stack slide (both screens visible while it runs)
    const top = fwd ? nv : pv;
    const under = fwd ? pv : nv;
    pv.classList.add(fwd ? 'vt-under' : 'vt-top');
    nv.classList.add(fwd ? 'vt-top' : 'vt-under');
    scrolls.forEach(([el, y]) => { el.scrollTop = y; });
    if(nvTop) nv.scrollTop = nvTop;   // the screen underneath keeps its restored position during the slide

    const opts = { duration: SLIDE_MS, easing: SLIDE_EASE, fill: 'forwards' };
    const topAnim = top.animate(
      fwd ? [{ transform:'translateX(100%)' }, { transform:'translateX(0)' }]
          : [{ transform:'translateX(0)' }, { transform:'translateX(100%)' }], opts);
    const underAnim = under.animate(
      fwd ? [{ transform:'translateX(0)' }, { transform:'translateX(' + UNDER_SHIFT + ')' }]
          : [{ transform:'translateX(' + UNDER_SHIFT + ')' }, { transform:'translateX(0)' }], opts);

    Promise.all([topAnim.finished, underAnim.finished])
      .then(() => { if(token === slideToken) cleanupSlide(); })
      .catch(() => {});   // cancelled by a newer navigation: it cleans up itself
  }

  // One place that swaps screens: used by showView() and by the system Back button.
  // Where each screen was scrolled to when we last left it. Going BACK reopens the screen at that spot
  // (so returning from "Create a challenge" lands on the bottom of Home, where you tapped it);
  // going forward always opens a screen at the top.
  const savedScroll = {};

  function swap(prevName, name, dir){
    const pv = viewEl(prevName);
    if(pv && prevName !== name) savedScroll[prevName] = pv.scrollTop;   // must be read BEFORE the screen is hidden
    const scrolls = snapshotScroll(pv);
    rawShowView(name);
    currentView = name;
    if(name === 'home' && typeof renderHomeDashboard === 'function') renderHomeDashboard(); // stats refresh after a round / import
    const nv = viewEl(name);
    const nvTop = dir === 'back' ? (savedScroll[name] || 0) : 0;
    if(nv) nv.scrollTop = nvTop;
    slide(pv, nv, dir, scrolls, nvTop);
  }

  window.showView = function(name){
    const prev = currentView;
    const isRoundSwap = (prev === 'play' && name === 'results') || (prev === 'results' && name === 'play');
    swap(prev, name, name === prev || isRoundSwap ? 'none' : name === 'home' ? 'back' : 'fwd');
    if(name === prev) return;

    if(name === 'home'){
      // jump straight back to the Home history entry, however deep we were
      if(depth > 0){ const d = depth; depth = 0; history.go(-d); }
      return;
    }
    // play <-> results swap in place (Back from Results should go Home, not to a finished round)
    if((prev === 'play' && name === 'results') || (prev === 'results' && name === 'play')){
      history.replaceState(stateFor(name, depth), '');
      return;
    }
    depth += 1;
    history.pushState(stateFor(name, depth), '');
  };

  // ---- Back handling ----
  window.addEventListener('popstate', (e) => {
    if(exiting) return;
    const st = e.state;

    // Compensating push keeps the user "on the same screen" when Back was only meant to close something.
    const stay = () => history.pushState(stateFor(currentView, depth), '');

    if(closeTopPopup()){ stay(); return; }

    if(currentView === 'play' && typeof state !== 'undefined' && state.running){
      document.getElementById('btnExitRound').click();   // opens the Leave-round confirm
      stay();
      return;
    }

    if(!st || !st.app){
      // sentinel reached from Home: leave the app
      exiting = true;
      history.back();
      setTimeout(() => { exiting = false; history.pushState(stateFor('home', 0), ''); currentView = 'home'; depth = 0; }, 250);
      return;
    }

    depth = st.d;
    if(st.v !== currentView){
      swap(currentView, st.v, 'back');
      // views rendered on open need fresh data if things changed while away
      if(st.v === 'history' && typeof renderHistory === 'function') renderHistory();
    }
  });

  // ---- in-app back buttons go through the same path as the system button ----
  function appBack(){ if(depth > 0) history.back(); else window.showView('home'); }
  ['btnHistoryBack','btnSkdBack','btnFullBack','btnChallengeBack','btnEnterCodeBack','btnChallengeDetailsBack','btnAboutBack','btnBugBack'].forEach(id => {
    const b = document.getElementById(id);
    if(b) b.addEventListener('click', appBack);
  });

  // ---- Esc key (desktop) ----
  // 1) closes the top-most open popup (the exit popup counts as "Stay")
  // 2) during a round, opens the "Leave this round?" popup (never leaves by itself)
  // 3) otherwise acts as the Back button, like the in-app back arrows
  document.addEventListener('keydown', (e) => {
    if(e.key !== 'Escape' || e.repeat || e.isComposing || e.defaultPrevented) return;
    if(e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if(t && t.id === 'nameInput') return;   // the name editor handles its own Esc
    if(closeTopPopup()){ e.preventDefault(); return; }
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.id !== 'answerInput';
    if(typing){ t.blur(); return; }          // first Esc just leaves the box, so typed text isn't lost
    if(currentView === 'play' && typeof state !== 'undefined' && state.running){
      document.getElementById('btnExitRound').click();
      return;
    }
    if(currentView !== 'home') appBack();
  });

  // ---- initial entries: [sentinel] then [home] ----
  try{
    history.replaceState({ sentinel:true }, '');
    history.pushState(stateFor('home', 0), '');
  }catch(e){}
})();