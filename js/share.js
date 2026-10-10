/* ==========================================================================
   share.js — "Share" button on the Results screen.

   What happens when you tap Share:
   1. A copy of the real results box (#card) is made, WITHOUT the buttons, and the
      app name + date/time are added at the bottom. It's built off-screen so the
      image looks the same on every device.
   2. html2canvas turns that copy into an image (PNG, see IMAGE_TYPE below).
   3. A popup shows the image with buttons:
        phone   -> [Share] [Save to device] [copy icon]
        desktop -> [Copy]  [Download]

   NOTES
   - html2canvas can't read the page's CSS variables / color-mix(), and the page's
     results styles only apply inside #view-results. So the off-screen copy gets the
     same styles written inline by STYLE_MAP below. If you restyle the Results card
     in style.css, mirror the change in STYLE_MAP.
   - The app name comes from manifest.json via window.getAppName() (js/appname.js).
   - The image is capped so it never gets huge: MAX_SLOWEST slow questions and MAX_MISSED wrong answers
     (anything beyond that is left out and the section title says "first 10 of 50").
   - The popup is the static #shareModal in index.html (a normal .modal-overlay), so js/popups.js
     animates it like every other popup. This file only fills it and toggles .show.
   - Copy needs a PNG (browsers can't copy JPGs to the clipboard). While IMAGE_TYPE is PNG the same
     file is used; if you switch to JPG, Copy quietly makes a PNG for itself.
   ========================================================================== */

(function(){
  const CARD_W = 400;      // css px; captured at SCALE x => 1200px wide image
  const SCALE  = 3;
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

  const C = { text:'#14171C', dim:'#6B7280', statBg:'#F6F9FA', line:'#E1EAEC',
              bad:'#C6544A', badBg:'#FBF0EF', badBd:'#F3D9D6', page:'#F3FAFB' };

  // ---------- small helpers ----------
  function hexToRgb(hex){
    let h = String(hex || '').trim().replace('#','');
    if(h.length === 3) h = h.split('').map(c => c + c).join('');
    if(!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  // mix colour with white; pct = how much of the colour to keep (0–100)
  function tint(rgb, pct){
    const k = pct / 100;
    return 'rgb(' + rgb.map(v => Math.round(v * k + 255 * (1 - k))).join(',') + ')';
  }
  function slug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'result'; }
  function isPhone(){ return window.matchMedia && window.matchMedia('(pointer:coarse)').matches; }

  // ---------- app name (from manifest.json, see js/appname.js) ----------
  function getAppName(){
    return window.getAppName ? window.getAppName() : Promise.resolve(document.title.split(' \u2014 ')[0]);
  }

  // ---------- the image: a styled copy of the real results box ----------
  function styleMap(tintBg, tintBd){
    return [
      ['.title',               'font-family:Sora,sans-serif;font-size:19px;font-weight:700;margin-bottom:8px;color:' + C.text],
      ['.config-note',         'font-size:12.5px;color:' + C.dim + ';line-height:1.6;background:' + tintBg + ';border:1px solid ' + tintBd + ';border-radius:9px;padding:10px 13px;margin-bottom:20px'],
      ['.config-note b',       'color:' + C.text],
      ['.stats-grid',          'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:24px'],
      ['.stat-box',            'background:' + C.statBg + ';border-radius:11px;padding:15px 8px;text-align:center'],
      ['.stat-box.s-acc, .stat-box.s-avg', 'background:' + tintBg],
      ['.stat-box .num',       'font-family:Inter,sans-serif;font-size:25px;font-weight:700;font-variant-numeric:tabular-nums;color:' + C.text],
      ['.stat-box .lbl',       'font-size:11px;color:' + C.dim + ';margin-top:4px'],
      ['.section',             'margin-bottom:20px'],
      ['.section-title',       'font-size:12px;font-weight:600;color:' + C.dim + ';margin-bottom:9px'],
      ['.detail-list',         'display:flex;flex-direction:column;gap:7px'],
      ['.detail-row',          'display:flex;justify-content:space-between;align-items:center;gap:10px;background:' + C.statBg + ';border-radius:9px;padding:10px 13px;font-size:13.5px'],
      ['.dr-problem',          'font-weight:700;font-variant-numeric:tabular-nums;color:' + C.text + ';white-space:nowrap'],
      ['.dr-skilltag',         'font-size:11px;font-weight:400;color:' + C.dim + ';margin-left:7px'],
      ['.dr-time',             'font-weight:700;font-variant-numeric:tabular-nums;color:' + C.text],
      ['.skill-row',           'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px 0;background:' + C.statBg + ';border-radius:9px;padding:10px 13px;font-size:13.5px'],
      ['.skill-row .name',     'font-weight:600;color:' + C.text],
      ['.skill-row .nums',     'display:flex;gap:12px;font-size:12px;color:' + C.dim + ';font-variant-numeric:tabular-nums'],
      ['.skill-row .nums b',   'color:' + C.text],
      ['.miss-row',            'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px 10px;background:' + C.badBg + ';border:1px solid ' + C.badBd + ';border-radius:9px;padding:10px 13px;font-size:13.5px'],
      ['.miss-nums',           'display:flex;gap:8px'],
      ['.miss-row .you',       'color:' + C.bad + ';font-size:12px;font-variant-numeric:tabular-nums'],
      ['.miss-row .correct',   'color:' + C.dim + ';font-size:12px;font-variant-numeric:tabular-nums']
    ];
  }

  function buildCard(appName){
    const view   = document.getElementById('view-results');
    const cs     = getComputedStyle(view);
    const accHex = cs.getPropertyValue('--r-accent').trim();
    const rgb    = hexToRgb(accHex) || [0,126,167];
    const accent = 'rgb(' + rgb.join(',') + ')';
    const tintBg = tint(rgb, 12);
    const tintBd = tint(rgb, 32);

    // copy of the live results box, minus the buttons and minus ids (so nothing clashes with the real page)
    const box = document.getElementById('card').cloneNode(true);
    box.querySelectorAll('.actions').forEach(n => n.remove());
    box.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    box.removeAttribute('id');

    // keep the image a sensible length: cap the lists (rows are in the same order as on screen)
    box.querySelectorAll('.detail-row').forEach((row, i) => { if(i >= MAX_SLOWEST) row.remove(); });
    const missRows = box.querySelectorAll('.miss-row');
    if(missRows.length > MAX_MISSED){
      const title = missRows[0].closest('.section').querySelector('.section-title');
      if(title) title.textContent = 'Missed (first ' + MAX_MISSED + ' of ' + missRows.length + ')';
      missRows.forEach((row, i) => { if(i >= MAX_MISSED) row.remove(); });
    }
    box.style.cssText = 'background:#FFFFFF;border:1px solid ' + tintBd + ';border-radius:16px;padding:18px;';
    styleMap(tintBg, tintBd).forEach(([sel, css]) => {
      box.querySelectorAll(sel).forEach(n => { n.style.cssText += ';' + css; });
    });

    // footer: app name (left) + date/time (right)
    const now  = new Date();
    const when = now.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' }) +
                 ' · ' + now.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
    const foot = document.createElement('div');
    foot.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid ' + C.line + ';padding-top:12px;';
    const left = document.createElement('span');
    left.textContent = appName;
    left.style.cssText = 'font-family:Sora,sans-serif;font-weight:700;font-size:12.5px;color:' + accent;
    const right = document.createElement('span');
    right.textContent = when;
    right.style.cssText = 'font-size:11px;color:' + C.dim;
    foot.appendChild(left); foot.appendChild(right);
    box.appendChild(foot);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + CARD_W + 'px;box-sizing:border-box;' +
                         'padding:16px;background:' + C.page + ';font-family:Inter,sans-serif;color:' + C.text + ';';
    wrap.appendChild(box);
    return { wrap: wrap, accent: accent, accentText: (cs.getPropertyValue('--r-accent-text').trim() || '#FFFFFF') };
  }

  // ---------- the popup (static #shareModal in index.html; js/popups.js animates .show on/off) ----------
  let closeActive = null;

  function openPreview(o){
    if(closeActive) closeActive();

    const modal   = document.getElementById('shareModal');
    const img     = document.getElementById('shareModalImg');
    const actions = document.getElementById('shareModalActions');
    const xBtn    = document.getElementById('shareModalClose');
    const url     = URL.createObjectURL(o.blob);
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
      // clipboard only accepts PNG: reuse the image if it already is one, otherwise make a PNG from the canvas
      const png = o.blob.type === 'image/png' ? Promise.resolve(o.blob)
                                              : new Promise(res => o.canvas.toBlob(res, 'image/png'));
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
      setTimeout(() => URL.revokeObjectURL(url), 600);          // keep the image alive until the exit animation is done
      closeActive = null;
    }
    closeActive = close;
    xBtn.addEventListener('click', close);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey, true);

    modal.classList.add('show');                                // popups.js plays the open animation
    if(firstBtn) firstBtn.focus();
  }

  // ---------- main ----------
  async function makeAndPreview(btn){
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparing…';
    let built = null;

    try{
      if(typeof html2canvas !== 'function') throw new Error('html2canvas not loaded');
      const appName = await getAppName();
      built = buildCard(appName);
      document.body.appendChild(built.wrap);
      if(document.fonts && document.fonts.ready) await document.fonts.ready;   // so Sora/Inter are used, not fallbacks

      const canvas = await html2canvas(built.wrap, { scale: SCALE, backgroundColor: C.page, useCORS: true, logging: false });
      const blob = await new Promise(res => canvas.toBlob(res, IMAGE_TYPE, JPG_QUALITY));
      if(!blob) throw new Error('could not create image');

      const fileName = slug(appName) + '-result.' + IMAGE_EXT;
      const file = new File([blob], fileName, { type: IMAGE_TYPE });
      openPreview({ canvas: canvas, blob: blob, file: file, fileName: fileName,
                    appName: appName, accent: built.accent, accentText: built.accentText });
      btn.textContent = original;
    }catch(err){
      console.error('Share failed:', err);
      btn.textContent = 'Couldn\u2019t share';
      setTimeout(() => { btn.textContent = original; }, 2000);
    }finally{
      if(built) built.wrap.remove();
      btn.disabled = false;
    }
  }

  document.addEventListener('click', function(e){
    const btn = e.target.closest('#btnShareImage');
    if(btn && !btn.disabled) makeAndPreview(btn);
  });
})();
