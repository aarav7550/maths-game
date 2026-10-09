// ============================================================
// POPUPS.JS — popup open/close animations
//
// Popups grow out of the thing you tapped (skill card, Mixed "Start" button, your name)
// and shrink back into it on close. Popups with no tap origin (the "Leave this round?"
// confirm, anything opened by the system Back button) simply pop in from the centre.
//
// It changes NO logic: it watches each popup overlay for the `.show` class being added or
// removed by ui.js / game.js / nav.js and animates around that. On close, `.closing` keeps
// the overlay on screen just long enough to play the exit animation.
// Loaded AFTER ui.js (any position after it is fine).
// ============================================================
(function(){
  // Phone timings stay as they were; desktop (same 641px breakpoint as style.css) is quicker.
  const DESKTOP = window.matchMedia('(min-width:641px)');
  const T = () => DESKTOP.matches
    ? { open:180, close:120, fade:120, pop:140, popClose:100 }
    : { open:220, close:150, fade:140, pop:170, popClose:120 };
  const EASE_OUT = 'cubic-bezier(.22,.7,.25,1)';
  const EASE_IN  = 'cubic-bezier(.4,0,.6,1)';

  const OVERLAY_IDS = ['diffModalOverlay','mixedSoonModal','nameOverlay','exitModal','challengeShowModal','challengeEnterModal','shortcutHintModal','shortcutsModal','reviewModal'];
  // only these popups grow from the tapped element; the rest pop from the centre
  const ORIGIN_OVERLAYS = new Set(['diffModalOverlay','mixedSoonModal','nameOverlay']);
  const ORIGIN_SELECTOR = '.skill-card:not(.soon), #btnMixedStart, #greetName, #dgreetName';

  const overlays = OVERLAY_IDS.map(id => document.getElementById(id)).filter(Boolean);
  const originOf = new Map();   // overlay -> element it grew from
  const wasShown = new Map(overlays.map(o => [o, o.classList.contains('show')]));

  // Remember what was tapped last. Capture phase = runs before the click handler opens the popup.
  let lastOrigin = null, lastOriginAt = 0;
  document.addEventListener('click', (e) => {
    const el = e.target.closest(ORIGIN_SELECTOR);
    if(el){ lastOrigin = el; lastOriginAt = performance.now(); }
  }, true);

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const usable = (r) => r && r.width > 0 && r.height > 0;
  // translate + scale that squeezes the popup box into a given rectangle
  function squeezeInto(target, box){
    const dx = target.left - box.left, dy = target.top - box.top;
    return `translate(${dx}px, ${dy}px) scale(${target.width / box.width}, ${target.height / box.height})`;
  }

  // Desktop only: tell the browser the popup is about to move, so it keeps it on its own GPU layer for the
  // whole animation instead of repainting it every frame (this is what makes the motion smooth, not just fast).
  function layerUp(ov, box){
    if(!DESKTOP.matches) return () => {};
    ov.style.willChange = 'opacity';
    box.style.willChange = 'transform, opacity';
    return () => { ov.style.willChange = ''; box.style.willChange = ''; };
  }

  function animateOpen(ov){
    ov.classList.remove('closing');
    ov.getAnimations({ subtree:true }).forEach(a => a.cancel());   // reopened mid-close
    if(reduced()) return;

    const box = ov.firstElementChild;
    if(!box) return;
    const src = (ORIGIN_OVERLAYS.has(ov.id) && lastOrigin && performance.now() - lastOriginAt < 500) ? lastOrigin : null;
    originOf.set(ov, src);

    const release = layerUp(ov, box);
    const anims = [ov.animate([{ opacity:0 }, { opacity:1 }], { duration:T().fade, easing:'ease-out' })];

    const from = src && src.isConnected ? src.getBoundingClientRect() : null;
    if(usable(from)){
      const to = box.getBoundingClientRect();
      if(DESKTOP.matches){
        // desktop: ONE animation on the box (squeeze + fade-in) instead of one per child, far cheaper to draw
        anims.push(box.animate(
          [{ transformOrigin:'0 0', transform:squeezeInto(from, to), opacity:0 },
           { opacity:1, offset:.55 },
           { transformOrigin:'0 0', transform:'none', opacity:1 }],
          { duration:T().open, easing:EASE_OUT }
        ));
      } else {
        anims.push(box.animate(
          [{ transformOrigin:'0 0', transform:squeezeInto(from, to) }, { transformOrigin:'0 0', transform:'none' }],
          { duration:T().open, easing:EASE_OUT }
        ));
        // contents stay hidden while the box is still small, so they never look stretched
        [...box.children].forEach(c => anims.push(c.animate(
          [{ opacity:0 }, { opacity:0, offset:.3 }, { opacity:1 }],
          { duration:T().open, easing:'linear' }
        )));
      }
    } else {
      anims.push(box.animate(
        [{ opacity:0, transform:'translateY(14px) scale(.94)' }, { opacity:1, transform:'none' }],
        { duration:T().pop, easing:EASE_OUT }
      ));
    }
    Promise.all(anims.map(a => a.finished)).then(release, release);
  }

  function animateClose(ov){
    if(reduced()) return;
    const box = ov.firstElementChild;
    if(!box) return;

    ov.classList.add('closing');           // keeps display:flex so the exit can play
    const src = originOf.get(ov);
    // Home is hidden by the time a round starts, so its rect is empty -> plain fade below
    const target = src && src.isConnected ? src.getBoundingClientRect() : null;
    const anims = [];
    const release = layerUp(ov, box);

    if(usable(target)){
      const from = box.getBoundingClientRect();
      anims.push(ov.animate([{ opacity:1 }, { opacity:0 }], { duration:T().close, easing:'ease-in', fill:'forwards' }));
      if(DESKTOP.matches){
        anims.push(box.animate(
          [{ transformOrigin:'0 0', transform:'none', opacity:1 },
           { opacity:0, offset:.6 },
           { transformOrigin:'0 0', transform:squeezeInto(target, from), opacity:0 }],
          { duration:T().close, easing:EASE_IN, fill:'forwards' }
        ));
      } else {
        anims.push(box.animate(
          [{ transformOrigin:'0 0', transform:'none' }, { transformOrigin:'0 0', transform:squeezeInto(target, from) }],
          { duration:T().close, easing:EASE_IN, fill:'forwards' }
        ));
        [...box.children].forEach(c => anims.push(c.animate(
          [{ opacity:1 }, { opacity:0, offset:.5 }, { opacity:0 }],
          { duration:T().close, easing:'linear', fill:'forwards' }
        )));
      }
    } else {
      anims.push(ov.animate([{ opacity:1 }, { opacity:0 }], { duration:T().popClose, easing:'ease-in', fill:'forwards' }));
      anims.push(box.animate(
        [{ opacity:1, transform:'none' }, { opacity:0, transform:'translateY(10px) scale(.96)' }],
        { duration:T().popClose, easing:'ease-in', fill:'forwards' }
      ));
    }

    Promise.all(anims.map(a => a.finished)).then(() => {
      anims.forEach(a => a.cancel());
      release();
      if(!ov.classList.contains('show')) ov.classList.remove('closing');
    }).catch(() => { release(); });                    // cancelled by a quick reopen: nothing to clean up
  }

  const observer = new MutationObserver((mutations) => {
    for(const m of mutations){
      const ov = m.target;
      const now = ov.classList.contains('show');
      if(now === wasShown.get(ov)) continue;   // only react to `show` flipping, not our own `closing`
      wasShown.set(ov, now);
      if(now) animateOpen(ov); else animateClose(ov);
    }
  });
  overlays.forEach(o => observer.observe(o, { attributes:true, attributeFilter:['class'] }));
})();
