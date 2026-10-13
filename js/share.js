/* ==========================================================================
   share.js — "Share" button on the Results screen.

   What happens when you tap Share:
   1. The content of the real results box (#card) is read as plain data (title, note, stats, rows),
      WITHOUT the buttons, and the app name + date/time are added for the footer. (From History, the same data
      is built from a saved round instead: window.shareSession(round, button).)
   2. js/share-card.js DRAWS that data as an image (PNG, see IMAGE_TYPE below). It runs in a Web Worker, which is
      a separate CPU core, so the page never freezes while the image is made. (html2canvas is no longer used.)
      If a Worker can't run, the same drawing code runs on the main thread instead (slower, but works).
   3. A popup shows the image with buttons:
        phone   -> [Share] [Save to device] [copy icon]
        desktop -> [Copy]  [Download]

   NOTES
   - The look of the image (colours, sizes, spacing) is in js/share-card.js, not here. If you restyle the
     Results card in style.css, mirror the change there (it replaces the old STYLE_MAP that used to be in this file).
   - This file only READS the card (extractCard / rowModel) and caps the lists. The class names it reads
     (.title, .config-note, .stat-box, .section, .detail-row, .skill-row, .miss-row ...) must stay on the Results card.
   - The app name comes from manifest.json via window.getAppName() (js/appname.js).
   - The image is capped so it never gets huge: MAX_SLOWEST slow questions and MAX_MISSED wrong answers
     (anything beyond that is left out and the section title says "first 10 of 50").
   - The popup is the static #shareModal in index.html (a normal .modal-overlay), so js/popups.js
     animates it like every other popup. This file only fills it and toggles .show.
   - Copy needs a PNG (browsers can't copy JPGs to the clipboard). While IMAGE_TYPE is PNG the same
     file is used; if you switch to JPG, the worker also makes a PNG just for Copy.
   ========================================================================== */

(function(){
  // PNG, not JPG: this image is flat colours + small text, which JPG blurs (and PNG is the smaller file here too).
  // To go back to JPG: IMAGE_TYPE = 'image/jpeg' and IMAGE_EXT = 'jpg'.
  const IMAGE_TYPE  = 'image/png';
  const IMAGE_EXT   = 'png';
  const JPG_QUALITY = 0.95;   // only used when IMAGE_TYPE is 'image/jpeg'
  // icons for the phone copy button (stroke colour is set in style.css)
  const ICON_COPY  = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const ICON_CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const MAX_SLOWEST = 5;   // slowest questions shown in the image
  const MAX_MISSED  = 5;   // wrong answers shown in the image

  // ---------- small helpers ----------
  function hexToRgb(hex){
    let h = String(hex || '').trim().replace('#','');
    if(h.length === 3) h = h.split('').map(c => c + c).join('');
    if(!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  function esc(v){ return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function slug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'result'; }
  function isPhone(){ return window.matchMedia && window.matchMedia('(pointer:coarse)').matches; }

  // ---------- app name (from manifest.json, see js/appname.js) ----------
  let appNameP = null;   // remembered after the first lookup, so later taps don't wait for it
  function getAppName(){
    if(!appNameP) appNameP = (window.getAppName ? Promise.resolve(window.getAppName()) : Promise.resolve(document.title.split(' \u2014 ')[0]))
      .catch(() => document.title.split(' \u2014 ')[0]);
    return appNameP;
  }

  // ---------- reading the card's content as plain data (js/share-card.js draws it) ----------
  const squash = v => String(v || '').replace(/\s+/g, ' ').trim();
  const isBold = n => n.tagName === 'B' || n.tagName === 'STRONG';
  // text pieces of a node as [{t, b}] (b = bold). <br> starts a new paragraph, so the result is a list of paragraphs.
  function runsOf(node, bold, out){
    node.childNodes.forEach(n => {
      if(n.nodeType === 3) out[out.length - 1].push({ t: n.nodeValue, b: bold });
      else if(n.nodeType === 1){
        if(n.tagName === 'BR') out.push([]);
        else runsOf(n, bold || isBold(n), out);
      }
    });
    return out;
  }
  const textIn = (el, sel) => { const n = el.querySelector(sel); return n ? squash(n.textContent) : ''; };

  // one row of a list -> plain data, or null if it isn't a known row type
  function rowModel(el){
    const cl = el.classList;
    let q = '', tag = '';
    const prob = el.querySelector('.dr-problem');
    if(prob){
      tag = textIn(prob, '.dr-skilltag');
      const c = prob.cloneNode(true);
      c.querySelectorAll('.dr-skilltag').forEach(n => n.remove());
      q = squash(c.textContent);
    }
    if(cl.contains('detail-row')) return { type:'detail', q: q, tag: tag, time: textIn(el, '.dr-time') };
    if(cl.contains('miss-row'))   return { type:'miss',   q: q, tag: tag, you: textIn(el, '.you'), right: textIn(el, '.correct') };
    if(cl.contains('skill-row')){
      const nums = [];
      const nEl = el.querySelector('.nums');
      if(nEl) nEl.childNodes.forEach(n => {
        if(n.nodeType === 1) nums.push(runsOf(n, isBold(n), [[]])[0]);
        else if(n.nodeType === 3 && squash(n.nodeValue)) nums.push([{ t: n.nodeValue, b: false }]);
      });
      return { type:'skill', name: textIn(el, '.name'), nums: nums };
    }
    return null;
  }

  function extractCard(box){
    const noteEl = box.querySelector('.config-note');
    const kinds  = ['acc', 'avg', 'best'];   // stat boxes are always accuracy, avg time, best time (used if the s-* classes are missing)
    return {
      title: textIn(box, '.title'),
      note:  noteEl ? runsOf(noteEl, false, [[]]) : [],
      stats: Array.from(box.querySelectorAll('.stat-box')).map((b, i) => ({
        num: textIn(b, '.num'), lbl: textIn(b, '.lbl'),
        kind: b.classList.contains('s-acc') ? 'acc' : b.classList.contains('s-avg') ? 'avg' : b.classList.contains('s-best') ? 'best' : (kinds[i] || '')
      })),
      sections: Array.from(box.querySelectorAll('.section')).map(sec => ({
        title: textIn(sec, '.section-title'),
        rows:  Array.from(sec.querySelectorAll('.detail-row, .skill-row, .miss-row')).map(rowModel).filter(Boolean)
      })).filter(sec => sec.rows.length)
    };
  }

  // Where the card's content comes from:
  //  - the live Results screen (a copy of #card), or
  //  - a saved round from History (built from the saved record, same classes so the same styles apply).
  let resultsStamp = 0;   // when the round on the Results screen finished (set by prepareResultsShare, called from game.js)
  function sourceFromResults(){
    const view = document.getElementById('view-results');
    const cs   = getComputedStyle(view);
    const box  = document.getElementById('card').cloneNode(true);
    box.querySelectorAll('.actions').forEach(n => n.remove());
    // sections hidden on screen (e.g. "Missed" after a perfect round) must not appear in the image
    const liveSecs = document.getElementById('card').querySelectorAll('.section');
    box.querySelectorAll('.section').forEach((sec, i) => { if(liveSecs[i] && getComputedStyle(liveSecs[i]).display === 'none') sec.remove(); });
    return { box: box, accentHex: cs.getPropertyValue('--r-accent').trim(),
             accentText: cs.getPropertyValue('--r-accent-text').trim() || '#FFFFFF', when: resultsStamp ? new Date(resultsStamp) : new Date() };
  }

  function sourceFromSession(rec){
    const labels  = (typeof skillDisplayLabels !== 'undefined') ? skillDisplayLabels : {};
    const isMixed = rec.skill === 'mixed';
    const tag = k => (isMixed && k) ? '<span class="dr-skilltag">' + esc(labels[k] || k) + '</span>' : '';

    // config note (same wording as the Results screen)
    const parts = ['<b>' + esc(rec.questions || '—') + ' questions</b>' + (rec.practice ? ' · practice mode' : '') + (rec.fromChallenge ? ' · from a challenge code' : '')];
    try{
      if(rec.config && rec.config.cfg && typeof describeSkillConfig === 'function'){
        if(isMixed){
          const inc = rec.config.included || Object.keys(rec.config.cfg);
          parts.push('Mix: ' + inc.map(k => labels[k] || k).join(', '));
          inc.forEach(k => { if(rec.config.cfg[k]) parts.push(describeSkillConfig(k, rec.config.cfg[k])); });
        } else {
          parts.push(describeSkillConfig(rec.skill, rec.config.cfg));
        }
      }
    }catch(e){ console.error(e); }

    // saved lists (some old test rounds saved every question as details.all)
    const d = rec.details || {};
    let wrong, slow;
    if(Array.isArray(d.all)){
      wrong = d.all.filter(r => !r.c);
      slow  = d.all.filter(r => r.c).sort((x, y) => y.t - x.t);
    } else { wrong = d.wrong || []; slow = d.slow || []; }

    const num   = v => (typeof v === 'number' && isFinite(v)) ? v.toFixed(1) + 's' : '—';   // best time may be missing -> dash
    const who   = (typeof getDisplayName === 'function') ? getDisplayName() : '';   // current name ('' if not set); rounds don't save a name
    const title = (rec.accuracy === 100 ? 'Flawless round' : (rec.accuracy >= 80 ? 'Solid round' : 'Round complete')) + (who ? ', ' + esc(who) : '');   // same rule as game.js

    let html =
      '<div class="title">' + title + '</div>' +
      '<div class="config-note">' + parts.join('<br>') + '</div>' +
      '<div class="stats-grid">' +
        '<div class="stat-box s-acc"><div class="num">' + esc(rec.accuracy) + '%</div><div class="lbl">accuracy</div></div>' +
        '<div class="stat-box s-avg"><div class="num">' + num(Number(rec.avgTime)) + '</div><div class="lbl">avg time</div></div>' +
        '<div class="stat-box s-best"><div class="num">' + num(rec.bestTime) + '</div><div class="lbl">best time</div></div>' +
      '</div>';
    if(slow.length){
      html += '<div class="section"><div class="section-title">Slowest right answers</div><div class="detail-list">' +
        slow.map(r => '<div class="detail-row"><span class="dr-problem">' + esc(r.q) + tag(r.k) + '</span><span class="dr-time">' + (r.t / 1000).toFixed(1) + 's</span></div>').join('') +
        '</div></div>';
    }
    if(wrong.length){
      html += '<div class="section"><div class="section-title">Missed</div><div class="detail-list">' +
        wrong.map(r => '<div class="miss-row"><span class="dr-problem">' + esc(r.q) + tag(r.k) + '</span><span class="miss-nums"><span class="you">you: ' +
          (r.g === null ? 'no answer' : esc(r.g)) + '</span><span class="correct">right: ' + esc(r.a) + '</span></span></div>').join('') +
        '</div></div>';
    }

    const box = document.createElement('div');
    box.innerHTML = html;
    const accentHex = rec.skill === 'mixed' ? '#007EA7' : ((typeof SKILL_COLOR !== 'undefined' && SKILL_COLOR[rec.skill]) || '#007EA7');
    return { box: box, accentHex: accentHex, accentText: '#FFFFFF', when: new Date(rec.date) };   // footer shows when the round was played
  }

  // everything the worker needs to draw the image, as plain data
  function buildModel(appName, src){
    const model = extractCard(src.box);

    // keep the image a sensible length: cap the lists (rows are in the same order as on screen)
    let shown = 0;
    model.sections.forEach(sec => { sec.rows = sec.rows.filter(r => r.type !== 'detail' || ++shown <= MAX_SLOWEST); });
    let missTotal = 0;
    model.sections.forEach(sec => sec.rows.forEach(r => { if(r.type === 'miss') missTotal++; }));
    if(missTotal > MAX_MISSED){
      let kept = 0, titled = false;
      model.sections.forEach(sec => {
        if(!titled && sec.rows.some(r => r.type === 'miss')){ sec.title = 'Missed (first ' + MAX_MISSED + ' of ' + missTotal + ')'; titled = true; }
        sec.rows = sec.rows.filter(r => r.type !== 'miss' || ++kept <= MAX_MISSED);
      });
    }

    // footer: app name (left) + date/time (right)
    model.accent    = hexToRgb(src.accentHex) || [0, 126, 167];
    model.footLeft  = appName;
    model.footRight = src.when.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' }) +
                      ' \u00b7 ' + src.when.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
    return model;
  }

  // ---------- drawing the image: Web Worker (own CPU core), or the same code on the main thread as a fallback ----------
  const WORKER_URL   = 'js/share-card.js';
  const WORKER_LIMIT = 12000;   // ms; if the worker takes longer than this (or fails) the main-thread fallback is used
  let worker = null, workerBroken = false, jobId = 0;
  const jobs = new Map();

  function renderOpts(){
    const url = p => new URL(p, document.baseURI).href;
    return { type: IMAGE_TYPE, quality: JPG_QUALITY,
             fonts: { ui: url('fonts/inter-latin-wght-normal.woff2'), head: url('fonts/sora-latin-wght-normal.woff2') } };
  }
  function failJobs(err){ jobs.forEach(j => { clearTimeout(j.t); j.rej(err); }); jobs.clear(); }
  function getWorker(){
    if(worker) return worker;
    worker = new Worker(new URL(WORKER_URL, document.baseURI));
    worker.onmessage = e => {
      const j = jobs.get(e.data.id);
      if(!j) return;
      jobs.delete(e.data.id); clearTimeout(j.t);
      if(e.data.ok) j.res(e.data); else j.rej(new Error(e.data.error));
    };
    worker.onerror = e => {
      workerBroken = true;
      try{ worker.terminate(); }catch(x){}
      worker = null;
      failJobs(new Error((e && e.message) || 'worker error'));
    };
    return worker;
  }
  function renderInWorker(model){
    return new Promise((res, rej) => {
      const id = ++jobId;
      const t = setTimeout(() => { jobs.delete(id); workerBroken = true; rej(new Error('worker timed out')); }, WORKER_LIMIT);
      jobs.set(id, { res: res, rej: rej, t: t });
      try{ getWorker().postMessage({ id: id, model: model, opts: renderOpts() }); }
      catch(err){ clearTimeout(t); jobs.delete(id); workerBroken = true; rej(err); }
    });
  }
  let mainRendererP = null;
  function renderOnMain(model){
    if(!mainRendererP) mainRendererP = new Promise((res, rej) => {
      if(window.renderShareCard) return res();
      const sc = document.createElement('script');
      sc.src = WORKER_URL; sc.onload = () => res(); sc.onerror = () => { mainRendererP = null; rej(new Error(WORKER_URL + ' could not be loaded')); };
      document.head.appendChild(sc);
    });
    return mainRendererP.then(() => window.renderShareCard(model, renderOpts()));
  }
  async function renderCard(model){
    let why = 'worker skipped (Worker: ' + typeof Worker + ', OffscreenCanvas: ' + typeof OffscreenCanvas + (workerBroken ? ', marked broken' : '') + ')';
    if(!workerBroken && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'){
      try{ const w = await renderInWorker(model); w.via = 'worker'; return w; }
      catch(err){ why = 'worker: ' + ((err && err.message) || err); console.warn('Share image: worker failed, drawing on the main thread instead.', err); }
    }
    try{ const m = await renderOnMain(model); m.via = 'main thread, because ' + why; return m; }
    catch(err){ throw new Error(why + ' | main: ' + ((err && err.message) || err)); }
  }

  // ---------- the popup (static #shareModal in index.html; js/popups.js animates .show on/off) ----------
  let closeActive = null;

  function openPreview(o){
    if(closeActive) closeActive();

    const modal   = document.getElementById('shareModal');
    const img     = document.getElementById('shareModalImg');
    const actions = document.getElementById('shareModalActions');
    const xBtn    = document.getElementById('shareModalClose');
    const url     = o.url;   // made (and decoded) when the image was built; freed when the image is dropped from the cache
    const phone   = isPhone();

    img.src = url;
    modal.style.setProperty('--share-accent', o.accent);
    modal.style.setProperty('--share-accent-text', o.accentText);
    modal.querySelector('.share-modal-imgwrap').scrollTop = 0;
    actions.textContent = '';

    function addBtn(label, primary, handler){
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'share-modal-btn' + (primary ? ' primary' : '');
      b.textContent = label;
      b.addEventListener('click', () => handler(b));
      actions.appendChild(b);
      return b;
    }
    function flash(b, text){
      const old = b.textContent;
      b.textContent = text;
      setTimeout(() => { b.textContent = old; }, 1600);
    }
    function download(b){
      const a = document.createElement('a');
      a.href = url; a.download = o.fileName;
      document.body.appendChild(a); a.click(); a.remove();
      flash(b, 'Saved');
    }
    // small icon-only button (phones: copy image). The icon briefly turns into a tick/cross as feedback.
    function addIconBtn(svg, label, handler){
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'share-modal-iconbtn';
      b.setAttribute('aria-label', label);
      b.title = label;
      b.innerHTML = svg;
      b.addEventListener('click', () => handler(b));
      actions.appendChild(b);
      return b;
    }
    function flashIcon(b, svg){
      b.innerHTML = svg;
      setTimeout(() => { b.innerHTML = ICON_COPY; }, 1600);
    }
    function canCopy(){ return !!(navigator.clipboard && window.ClipboardItem); }
    async function copyImage(){
      // clipboard only accepts PNG: reuse the image if it already is one, otherwise use the PNG the worker made for this
      const png = o.blob.type === 'image/png' ? o.blob : o.pngBlob;
      await navigator.clipboard.write([ new ClipboardItem({ 'image/png': png }) ]);
    }

    let firstBtn = null;
    if(phone){
      if(navigator.canShare && navigator.canShare({ files: [o.file] })){
        firstBtn = addBtn('Share', true, async (b) => {
          try{
            await navigator.share({ files: [o.file], title: o.appName + ' result' });
          }catch(err){
            if(err && err.name !== 'AbortError'){ console.error(err); flash(b, 'Couldn\u2019t share'); }   // AbortError = you closed the share sheet
          }
        });
      }
      const save = addBtn('Save to device', !firstBtn, download);
      firstBtn = firstBtn || save;
      if(canCopy()){
        addIconBtn(ICON_COPY, 'Copy image', async (b) => {
          try{ await copyImage(); flashIcon(b, ICON_CHECK); }
          catch(err){ console.error(err); flashIcon(b, ICON_CROSS); }
        });
      }
    } else {
      if(canCopy()){
        firstBtn = addBtn('Copy', true, async (b) => {
          try{ await copyImage(); flash(b, 'Copied!'); }
          catch(err){ console.error(err); flash(b, 'Couldn\u2019t copy'); }
        });
      }
      const dl = addBtn('Download', !firstBtn, download);
      firstBtn = firstBtn || dl;
    }

    // capture phase + stopPropagation: Esc closes only this popup, and the app's other key handling (keys.js) never sees it
    function onKey(e){ if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(); } }
    function onBackdrop(e){ if(e.target === modal) close(); }   // tap the dim area to close
    function close(){
      document.removeEventListener('keydown', onKey, true);
      modal.removeEventListener('click', onBackdrop);
      xBtn.removeEventListener('click', close);
      modal.classList.remove('show');                           // popups.js plays the exit animation
      closeActive = null;
    }
    closeActive = close;
    xBtn.addEventListener('click', close);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey, true);

    modal.classList.add('show');                                // popups.js plays the open animation
    if(firstBtn) firstBtn.focus();
  }

  // ---------- image cache ----------
  // The image is built once and remembered, so tapping Share again (or tapping after it was pre-built in the
  // background, see prebuild below) opens the popup straight away. The key is the card's own content, so if
  // anything on the card changes (numbers, name, accent colour, app name) a fresh image is made automatically.
  const CACHE_MAX = 6;           // images kept (oldest dropped first)
  const cache = new Map();       // key -> finished image
  const building = new Map();    // key -> an image being built right now (so two requests never build it twice)

  function cacheKey(appName, src){
    return appName + '|' + src.accentHex + '|' + src.when.getTime() + '|' + src.box.innerHTML;   // read from the card as it is on screen
  }

  async function buildImage(appName, src){
    const model = buildModel(appName, src);
    const t0    = performance.now();
    const out   = await renderCard(model);
    const blob  = out.blob;
    if(!blob) throw new Error('could not create image');
    const fileName = slug(appName) + '-result.' + IMAGE_EXT;
    const file = new File([blob], fileName, { type: IMAGE_TYPE });
    const url = URL.createObjectURL(blob);   // made once per image; freed when the image is dropped from the cache
    return { url: url, pngBlob: out.png || null,   // pngBlob is only set when the image isn't a PNG (Copy needs a PNG)
             blob: blob, file: file, fileName: fileName, appName: appName,
             accent: 'rgb(' + model.accent.join(',') + ')', accentText: src.accentText,
             info: 'drawn via ' + out.via + ' in ' + Math.round(performance.now() - t0) + 'ms' };
  }

  function getImage(appName, src){
    const key = cacheKey(appName, src);
    if(cache.has(key)) return Promise.resolve(cache.get(key));
    if(building.has(key)) return building.get(key);
    const p = buildImage(appName, src).then(img => {
      cache.set(key, img);
      while(cache.size > CACHE_MAX){ const oldest = cache.keys().next().value; URL.revokeObjectURL(cache.get(oldest).url); cache.delete(oldest); }
      return img;
    }).finally(() => building.delete(key));
    building.set(key, p);
    return p;
  }

  // Build the image quietly in the background so it's already waiting when Share is tapped.
  // It starts right after the next screen paint (so the popup / screen shows first), plus an optional extra delay.
  // If nobody taps Share the image just sits in the cache until newer ones push it out (CACHE_MAX).
  function prebuild(src, delay){
    const run = () => { getAppName().then(n => getImage(n, src)).catch(() => {}); };
    requestAnimationFrame(() => setTimeout(run, delay));
  }
  // Results: wait 500ms so the screen slide-in (300ms) isn't interrupted. History: start straight away.
  window.prepareResultsShare = function(){ resultsStamp = Date.now(); prebuild(sourceFromResults(), 500); };   // called by game.js when Results opens
  window.prepareSessionShare = function(rec){ prebuild(sourceFromSession(rec), 0); };                         // called by history.js when the review popup opens

  // TEMPORARY: shows a small timing note at the top of the screen after each Share tap (set to false / delete when done testing)
  const DEBUG_TIMING = false;
  const SHOW_ERRORS  = false;  // true = black on-screen note: how/how fast the image was drawn (worker or main thread) + the real reason if Share fails
  function debugNote(text, ms){
    let d = document.getElementById('shareDebugNote');
    if(!d){
      d = document.createElement('div'); d.id = 'shareDebugNote';
      d.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;z-index:9999;background:#000;color:#0f0;font:12px/1.4 monospace;padding:8px 10px;border-radius:8px;pointer-events:none;';
      document.body.appendChild(d);
    }
    d.textContent = text; d.style.display = 'block';
    clearTimeout(d._t); d._t = setTimeout(() => { d.style.display = 'none'; }, ms || 8000);
  }

  // ---------- main ----------
  // btn: the button that was tapped. src: where the card content comes from (omit = live Results screen).
  // Text buttons (Results "Share") change their label while working; icon buttons get is-busy / is-failed instead.
  async function makeAndPreview(btn, src){
    src = src || sourceFromResults();
    const textBtn  = !btn.querySelector('svg');
    const original = textBtn ? btn.textContent : '';
    btn.disabled = true;
    const t0 = performance.now();
    let wasCached = true;

    try{
      const appName = await getAppName();
      if(!cache.has(cacheKey(appName, src))){
        wasCached = false;
        // not ready yet: show "Preparing" and let the browser paint it BEFORE the heavy work starts
        if(textBtn) btn.textContent = 'Preparing'; else btn.classList.add('is-busy');
        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      }
      const img = await getImage(appName, src);
      const t1 = performance.now();
      if(SHOW_ERRORS) debugNote('Share image ' + img.info + (wasCached ? ' (pre-built)' : ''), 15000);
      openPreview(img);
      if(DEBUG_TIMING) requestAnimationFrame(() => requestAnimationFrame(() => {
        const t2 = performance.now();
        debugNote((textBtn ? 'RESULTS' : 'HISTORY') + ' | image ' + (wasCached ? 'was ready (cache hit)' : 'NOT ready (built on tap)') +
                  ' | tap->image ' + Math.round(t1 - t0) + 'ms | image->popup painted ' + Math.round(t2 - t1) + 'ms');
      }));
      if(textBtn) btn.textContent = original;
    }catch(err){
      console.error('Share failed:', err);
      if(SHOW_ERRORS) debugNote('SHARE ERROR: ' + ((err && err.message) || err), 30000);
      if(textBtn){
        btn.textContent = 'Couldn\u2019t share';
        setTimeout(() => { btn.textContent = original; }, 2000);
      } else {
        btn.classList.add('is-failed');
        setTimeout(() => btn.classList.remove('is-failed'), 2000);
      }
    }finally{
      btn.classList.remove('is-busy');
      btn.disabled = false;
    }
  }

  // lets nav.js (system Back) close this popup properly; returns true if it was open
  window.closeSharePopup = function(){
    const m = document.getElementById('shareModal');
    if(closeActive && m && m.classList.contains('show')){ closeActive(); return true; }
    return false;
  };

  // History: share a saved round (called from the review popup's share icon in history.js)
  window.shareSession = function(rec, btn){ return makeAndPreview(btn, sourceFromSession(rec)); };

  document.addEventListener('click', function(e){
    const btn = e.target.closest('#btnShareImage');
    if(btn && !btn.disabled) makeAndPreview(btn);
  });
})();
