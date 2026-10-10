// ============================================================
// KEYS.JS — keyboard control inside popups (desktop)
//
// - When a popup opens, keyboard focus moves onto its main button (the safe one: "Stay" on the
//   exit popup), so Enter works straight away.
// - Arrow keys move between the popup's buttons; Enter presses the focused button.
// - If focus is somewhere else, Enter presses the popup's main button.
// Esc (close popup / back) lives in nav.js. Keys 1-5 + Enter in the difficulty popup live in ui.js.
// Also here (second block at the bottom): the skill-letter shortcuts (Home + difficulty popup), Shift+H (History),
// Shift+M (open the 3-dot menu) with arrow-key navigation inside it, and Ctrl+. (shortcuts popup).
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

// ============================================================
// SKILL-LETTER SHORTCUTS (Home + difficulty picker)
//
// - On Home, or while the difficulty picker is open, press a skill's letter (SKILL_KEY in js/registry.js)
//   to open that skill's picker. Pressing it while the picker is open switches to the other skill.
// - On the History screen the same letters open that skill's history page instead, and keep working on that page to switch skill.
// - Skills that share a letter cycle: the key opens the skill AFTER the one the last letter press opened
//   (x -> x2, x again -> x3, x again -> x2 ...). Only letter presses count, not mouse clicks.
// - A skill can have extra keys on top of its letter (altKeys in js/registry.js): - opens Subtraction, = or + open Additions.
// - Shift + H on Home opens History. Shift + M on Home opens the 3-dot menu with its first option highlighted;
//   Up/Down arrows move through the options, Enter opens one, Esc closes it (Esc lives in nav.js).
// - Ctrl + . opens (or closes) the Keyboard shortcuts popup from any screen except during a round.
// - Letters and Shift shortcuts are ignored while typing in a box, while any other popup is open,
//   and on every screen except Home (and the difficulty picker for letters).
// ============================================================
(function(){
  const picker = document.getElementById('diffModalOverlay');
  const menu = document.getElementById('moreMenuDropdown');
  const scPopup = document.getElementById('shortcutsModal');
  const menuItems = () => [...menu.querySelectorAll('.menu-item')].filter(b => b.offsetParent !== null);
  let lastKeySkill = null;   // the skill the last letter press opened (difficulty picker)
  let lastHistSkill = null;  // same idea for letter presses on the History screen, kept separate so each screen starts at its first skill

  const pickerOpen = () => picker.classList.contains('show');
  const homeActive = () => views.home.classList.contains('active');
  const historyActive = () => views.history.classList.contains('active');   // the History overview (skill cards)
  const skillHistoryEl = document.getElementById('view-history-skill');
  const skillHistoryActive = () => skillHistoryEl.classList.contains('active');   // one skill's history page
  // any popup other than the difficulty picker (name editor, exit confirm, hints, code popups...)
  const otherPopupOpen = () => [...document.querySelectorAll('.modal-overlay.show, .name-overlay.show')].some(o => o !== picker);

  document.addEventListener('keydown', (e) => {
    if(e.defaultPrevented || e.repeat || e.isComposing) return;
    if(e.ctrlKey || e.metaKey || e.altKey) return;
    if(!e.key || e.key.length !== 1 || !/[a-z=+\-]/i.test(e.key)) return;   // letters, plus - = + (the extra keys, see altKeys in registry.js)
    const t = e.target;
    if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if(otherPopupOpen()) return;
    if(!pickerOpen() && !homeActive() && !historyActive() && !skillHistoryActive()) return;

    const letter = e.key.toLowerCase();

    if(e.shiftKey && /[a-z]/.test(letter)){
      if(pickerOpen() || !homeActive()) return;   // Shift shortcuts are Home-only
      if(letter === 'h' && typeof renderHistory === 'function'){          // Shift + H: History
        e.preventDefault();
        menu.classList.remove('open');
        renderHistory();
        showView('history');
      } else if(letter === 'm'){                                          // Shift + M: the 3-dot menu (press again to close)
        e.preventDefault();
        if(menu.classList.contains('open')){
          menu.classList.remove('open', 'kb');
        } else {
          menu.classList.add('open', 'kb');
          const first = menuItems()[0];
          if(first) first.focus({ preventScroll: true });                 // first option highlighted straight away
        }
      }
      return;
    }

    const skills = SKILL_ORDER.filter(k => SKILL_KEYS[k].includes(letter));
    if(!skills.length) return;
    e.preventDefault();

    // History overview: the letter opens that skill's history page. On a skill's own history page it switches to
    // another skill, so there's no need to go back first. Same cycling rule as below; on the skill page the cycle
    // continues from the skill being shown (even if it was opened by a tap).
    if(!pickerOpen() && (historyActive() || skillHistoryActive())){
      const base = skillHistoryActive() ? skdCurrentKey : lastHistSkill;
      const nextHist = skills[(skills.indexOf(base) + 1) % skills.length];
      lastHistSkill = nextHist;
      if(skillHistoryActive() && nextHist === skdCurrentKey) return;   // already showing it
      openSkillDetail(nextHist);
      return;
    }

    // next skill after the one the last letter press opened (not found -> -1 -> the first one)
    const next = skills[(skills.indexOf(lastKeySkill) + 1) % skills.length];
    // a letter with a single skill, pressed while that skill's picker is already open: nothing to do
    if(pickerOpen() && typeof CURRENT_SKILL !== 'undefined' && next === CURRENT_SKILL) return;

    menu.classList.remove('open');
    lastKeySkill = next;
    openDifficultyPicker(next);
  });

  // Up/Down arrows move through the open 3-dot menu (wraps around). If nothing is highlighted yet,
  // Down picks the first option and Up the last. Enter on a highlighted option is the browser's own button press.
  document.addEventListener('keydown', (e) => {
    if(!menu.classList.contains('open')) return;
    if(e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = menuItems();
    if(!items.length) return;
    e.preventDefault();
    menu.classList.add('kb');
    const down = e.key === 'ArrowDown';
    const i = items.indexOf(document.activeElement);
    const next = i === -1 ? (down ? 0 : items.length - 1) : (i + (down ? 1 : -1) + items.length) % items.length;
    items[next].focus({ preventScroll: true });
  });
  // using the mouse again drops the keyboard highlight
  document.addEventListener('mousedown', () => menu.classList.remove('kb'), true);

  // Ctrl + . : open / close the Keyboard shortcuts popup (not during a round, not on top of another popup)
  document.addEventListener('keydown', (e) => {
    if(e.defaultPrevented || e.repeat || e.isComposing) return;
    if(!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if(e.key !== '.' && e.code !== 'Period') return;
    if(typeof state !== 'undefined' && state.running) return;
    if(typeof window.openShortcuts !== 'function') return;
    if(scPopup.classList.contains('show')){ e.preventDefault(); window.closeShortcuts(); return; }
    if(document.querySelector('.modal-overlay.show, .name-overlay.show')) return;
    e.preventDefault();
    menu.classList.remove('open', 'kb');
    window.openShortcuts();
  });
})();
