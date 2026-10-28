/* =====================================================================
   endmessages.js - the title and the short line under it that are shown
   when a round finishes (Results screen, and the shared image).

   HOW TO EDIT (no coding needed):
   - Each block below is one accuracy range. "min" = the lowest accuracy (%)
     that range applies to. The first block that fits wins, so keep the
     blocks ordered from highest min to lowest, and keep the last one at 0.
   - Every entry is a PAIR on one line:
         ["the title", "the line under it"],
     The title is the big heading, the line is the small text under it.
     Write them together so they do not say the same thing.
   - To add a pair: add a new line inside that block's [ ... ] list. Keep the
     two quoted texts, the comma between them, the square brackets, and a
     comma at the end of the line.
   - To remove a pair: delete its line.
   - Write {name} where the player's name should go. Use it at most ONCE per
     pair (in the title OR in the line). On the Results screen, if no name is
     set, a tappable "set a name" button shows right there (same as Home).
     In the shared image the name is simply left out. A pair with no {name}
     never shows the button.
   - Keep at least ONE pair in every block, or that range shows nothing.
   - Confetti is separate (80%+ in game.js).
   ===================================================================== */

const END_MESSAGE_BANDS = [
  { min: 100, messages: [
    ["Flawless round, {name}", "Every answer was right. Hard to do better."],
    ["Flawless round", "Not one miss. Spotless, {name}."],
    ["Perfect score", "A clean sweep. That was sharp."],
    ["Flawless, {name}", "100% accuracy. Well earned."]
  ]},
  { min: 90, messages: [
    ["Solid round, {name}", "Almost perfect. Really sharp."],
    ["Excellent round", "So close to flawless, {name}. Great form."],
    ["Very strong, {name}", "Keep this up. You are nearly there."],
    ["Solid round", "Great form today, {name}."]
  ]},
  { min: 80, messages: [
    ["Solid round, {name}", "Strong accuracy. Keep it up."],
    ["Nicely done", "Right on track, {name}."],
    ["Good round, {name}", "Good form today. Keep going."],
    ["Solid round", "A reliable score. Well played, {name}."]
  ]},
  { min: 60, messages: [
    ["Round complete, {name}", "Decent round. A little more care and you are there."],
    ["Getting somewhere", "Go again, {name}?"],
    ["Not a bad round", "Check what you missed below."],
    ["Round complete", "Steady progress. One more round will help."]
  ]},
  { min: 40, messages: [
    ["Tough round, {name}", "Look at the misses and try again."],
    ["Round complete", "Keep at it, {name}. Practice mode can help here."],
    ["Tricky one", "Some of these are hard. Another go will feel easier."],
    ["Round complete, {name}", "Every round teaches you something. Try again."]
  ]},
  { min: 0, messages: [
    ["Rough round, {name}", "That is fine. Try an easier level to build up."],
    ["Round complete", "Hard day for numbers, {name}. Come back to it."],
    ["Tough one", "Slow and steady wins. Try practice mode, no timer."],
    ["Round complete, {name}", "Everyone starts somewhere. Go again."]
  ]}
];

/* ---------------------------------------------------------------------
   Code below picks and shows the pair. You do not need to change it.
   --------------------------------------------------------------------- */
(function () {
  var current = null;   // the pair of the round on the Results screen: { title, line } (still has {name} in it)

  // Picks a pair for this accuracy. With a seed (the round's date) the pick is always the same for
  // that round, so History shows the same pair the Results screen did. Without a seed it is random.
  function pickPair(accuracy, seed) {
    var acc = Number(accuracy);
    if (isNaN(acc)) acc = 0;
    var list = null;
    for (var i = 0; i < END_MESSAGE_BANDS.length; i++) {
      if (acc >= END_MESSAGE_BANDS[i].min) { list = END_MESSAGE_BANDS[i].messages; break; }
    }
    if (!list || !list.length) return null;
    var s = Number(seed);
    var idx = isNaN(s) ? Math.floor(Math.random() * list.length) : Math.abs(Math.floor(s)) % list.length;
    return { title: list[idx][0] || '', line: list[idx][1] || '' };
  }

  // Text as plain text. No name set: "{name}" is removed together with the comma/space before it.
  function cleanText(template, name) {
    var n = (name || '').trim();
    if (n) return template.replace(/\{name\}/g, n);
    return template.replace(/[,\s]*\{name\}/g, '').replace(/\s+([.!?])/g, '$1');
  }

  function currentName() {
    return (typeof getDisplayName === 'function') ? getDisplayName() : '';
  }

  // Fills one element (the title or the line). data-share-text holds the plain version, which is what the
  // shared image uses (so the "set a name" button never ends up in the image).
  function fill(el, template, name) {
    if (!el) return;
    el.textContent = '';
    if (!template) { el.removeAttribute('data-share-text'); return; }
    el.setAttribute('data-share-text', cleanText(template, name));
    template.split('{name}').forEach(function (part, i) {
      if (i > 0) {
        if (name) {
          el.appendChild(document.createTextNode(name));
        } else {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'res-name-set';
          b.setAttribute('aria-label', 'Set your name');
          b.innerHTML = 'set a name ' + (typeof PENCIL_SVG !== 'undefined' ? PENCIL_SVG : '');
          el.appendChild(b);
        }
      }
      if (part) el.appendChild(document.createTextNode(part));
    });
  }

  function render() {
    if (!current) return;
    var name = currentName().trim();
    fill(document.getElementById('resultsTitle'), current.title, name);
    fill(document.getElementById('resultsEndMsg'), current.line, name);
  }

  // Called by game.js when a round finishes.
  window.showEndMessage = function (accuracy, seed) {
    current = pickPair(accuracy, seed);
    render();
  };

  // Called by ui.js after the name is saved: shows the name instead of the "set a name" button.
  window.refreshEndMessage = function () {
    render();
    var view = document.getElementById('view-results');
    if (view && view.classList.contains('active') && typeof window.prepareResultsShare === 'function') window.prepareResultsShare();
  };

  // Used by the Retry chain (game.js): keep / put back the pair of the Results screen being left / restored.
  // restoreEndMessage does not redraw; game.js puts the screen's own HTML back.
  window.getEndMessage = function () { return current; };
  window.restoreEndMessage = function (c) { current = c; };

  // Plain-text pair for a saved round (History share image): { title, message }.
  window.pickEndMessage = function (accuracy, name, seed) {
    var p = pickPair(accuracy, seed);
    if (!p) return { title: '', message: '' };
    return { title: cleanText(p.title, name), message: cleanText(p.line, name) };
  };

  // The "set a name" button (in the title or in the line) opens the same name popup as Home
  // (one listener on each stable parent).
  ['resultsTitle', 'resultsEndMsg'].forEach(function (id) {
    var host = document.getElementById(id);
    if (host) host.addEventListener('click', function (e) {
      if (e.target.closest('.res-name-set') && typeof openNameEditor === 'function') openNameEditor();
    });
  });
})();
