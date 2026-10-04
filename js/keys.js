// ============================================================
// KEYS.JS — keyboard control inside popups (desktop)
//
// - When a popup opens, keyboard focus moves onto its main button (the safe one: "Stay" on the
//   exit popup), so Enter works straight away.
// - Arrow keys move between the popup's buttons; Enter presses the focused button.
// - If focus is somewhere else, Enter presses the popup's main button.
// Esc (close popup / back) lives in nav.js. Keys 1-5 + Enter in the difficulty popup live in ui.js.
// Loaded LAST, after nav.js.
// ============================================================
(function(){
  // The difficulty popup has its own keys (ui.js), so it is left out here.
  const SKIP = ['diffModalOverlay'];

  function openOverlays(){
    return [...document.querySelectorAll('.modal-overlay.show')].filter(o => !SKIP.includes(o.id));
  }
  function buttonsIn(ov){
    return [...ov.querySelectorAll('button')].filter(b => !b.disabled && b.offsetParent !== null);
  }
  function mainButton(ov){
    return ov.querySelector('[data-default]') || ov.querySelector('.btn-primary') ||
           ov.querySelector('.soon-btn') || buttonsIn(ov)[0] || null;
  }

  // focus the main button whenever a popup opens
  const watched = new WeakSet();
  const observer = new MutationObserver((records) => {
    records.forEach(r => {
      const ov = r.target;
      const wasOpen = (r.oldValue || '').split(/\s+/).includes('show');
      if(ov.classList.contains('show') && !wasOpen && !SKIP.includes(ov.id)){
        requestAnimationFrame(() => {
          const b = mainButton(ov);
          if(b && ov.classList.contains('show')) b.focus({ preventScroll: true });
        });
      }
    });
  });
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    if(watched.has(ov)) return;
    watched.add(ov);
    observer.observe(ov, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  });

  document.addEventListener('keydown', (e) => {
    if(e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const ovs = openOverlays();
    if(!ovs.length) return;
    const ov = ovs[ovs.length - 1];
    const btns = buttonsIn(ov);
    if(!btns.length) return;
    const active = document.activeElement;

    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
      const dir = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1;
      const i = btns.indexOf(active);
      const next = i === -1 ? mainButton(ov) : btns[(i + dir + btns.length) % btns.length];
      if(next){ e.preventDefault(); next.focus(); }
    } else if(e.key === 'Enter'){
      if(e.repeat) return;
      if(active && ov.contains(active) && active.tagName === 'BUTTON') return;   // native Enter on that button
      const b = mainButton(ov);
      if(b){ e.preventDefault(); b.click(); }
    }
  });
})();
