/* ==========================================================================
   share-card.js — draws the share image (the result card) with the Canvas API.

   WHY THIS FILE EXISTS
   The old share image was made by html2canvas, which copies the page's HTML onto a canvas.
   That runs on the main thread and froze phones. This file draws the same card directly,
   and it runs inside a Web Worker (a separate CPU core), so the page never freezes.

   HOW IT IS USED
   - js/share.js reads the card's content from the page and turns it into plain data (a "model"):
       { title, note, stats, sections, accent, footLeft, footRight }
     then sends the model here. This file draws it and sends back a PNG.
   - Normally this file is started as a Worker (new Worker('js/share-card.js')).
   - If the Worker can't run (old browser), share.js loads this same file as a normal script and
     calls window.renderShareCard(model, opts) on the main thread instead. Same drawing code.

   CHANGING THE LOOK
   - Colours, card width and the main spacing numbers are in the LOOK section just below.
   - The card is drawn top to bottom in draw(): title, note, stats, sections, footer.
     Each part says which CSS it copies (the old styleMap in share.js), so sizes match the Results card.
   - Heights are worked out from the text (lines wrap automatically), so nothing is a fixed height.
   - If you restyle the Results card in style.css, mirror it here (this replaces the old STYLE_MAP).

   KNOWN SMALL DIFFERENCE: the old image used "tabular numbers" (all digits the same width).
   Canvas can't switch that on, so digits here use the font's normal widths.
   ========================================================================== */

(function(){
  'use strict';

  const IS_WORKER = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;

  /* ===================== LOOK ===================== */
  const CARD_W = 400;       // css px; drawn at SCALE x  => 1200px wide image
  const SCALE  = 3;
  const C = { text:'#14171C', dim:'#6B7280', statBg:'#F6F9FA', line:'#E1EAEC',
              bad:'#C6544A', badBg:'#FBF0EF', badBd:'#F3D9D6', page:'#F3FAFB', card:'#FFFFFF' };
  const FONT = { ui:'Inter, sans-serif', head:'Sora, sans-serif' };

  const PAGE_PAD = 16;      // solid page-coloured margin around the rounded card
  const BOX_PAD  = 18;      // padding inside the card
  const BOX_R    = 16;      // card corner radius
  const TINT_BG  = 12;      // % of the accent colour mixed into tinted boxes
  const TINT_BD  = 32;      // % of the accent colour mixed into borders
  /* ================================================= */

  function tint(rgb, pct){
    const k = pct / 100;
    return 'rgb(' + rgb.map(v => Math.round(v * k + 255 * (1 - k))).join(',') + ')';
  }
  function makeCanvas(w, h){
    if(typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function toBlob(cv, type, quality){
    if(cv.convertToBlob) return cv.convertToBlob({ type: type, quality: quality });
    return new Promise(res => cv.toBlob(res, type, quality));
  }
  function roundRect(g, x, y, w, h, r){
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y,     x + w, y + h, r);
    g.arcTo(x + w, y + h, x,     y + h, r);
    g.arcTo(x,     y + h, x,     y,     r);
    g.arcTo(x,     y,     x + w, y,     r);
    g.closePath();
  }

  // ---------- fonts ----------
  let fontsP = null;
  function loadFonts(urls){
    if(IS_WORKER){
      if(!fontsP){
        if(!self.fonts || typeof FontFace === 'undefined') return Promise.reject(new Error('fonts not supported in worker'));
        const one = async (family, url, weight) => {
          const res = await fetch(url);
          if(!res.ok) throw new Error('font ' + family + ' ' + res.status);
          const face = new FontFace(family, await res.arrayBuffer(), { weight: weight, style: 'normal' });
          await face.load();
          self.fonts.add(face);
        };
        fontsP = Promise.all([ one('Inter', urls.ui, '100 900'), one('Sora', urls.head, '100 800') ])
                        .catch(err => { fontsP = null; throw err; });
      }
      return fontsP;
    }
    // main thread: the page's own @font-face rules already define Inter and Sora; just make sure they are loaded
    if(!document.fonts) return Promise.resolve();
    // a font that can't be loaded (e.g. the page was opened straight from a file) must not stop the image:
    // the page itself then shows the fallback font too, so the image just matches it
    return Promise.all(['700 19px Sora', '700 12.5px Sora', '400 12px Inter', '600 12px Inter', '700 12px Inter', '700 25px Inter']
                       .map(f => document.fonts.load(f).catch(() => null))).then(() => document.fonts.ready).catch(() => null);
  }

  // ---------- the drawing ----------
  async function draw(model, opts){
    const rgb    = model.accent;
    const accent = 'rgb(' + rgb.join(',') + ')';
    const tintBg = tint(rgb, TINT_BG), tintBd = tint(rgb, TINT_BD);
    const mctx   = makeCanvas(1, 1).getContext('2d');   // only used to measure text
    const ops    = [];                                  // everything to paint, in order (backgrounds first, text on top)

    // --- text measuring (same sizes the browser used for "line-height: normal") ---
    const fontOf = s => s.w + ' ' + s.s + 'px ' + FONT[s.f];
    const vcache = {};
    function vm(s){   // ascent / descent of a font, rounded like the browser does when it lays out a line
      const key = fontOf(s);
      if(!vcache[key]){
        mctx.font = key;
        const m = mctx.measureText('Hg');
        const a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent;
        vcache[key] = (typeof a === 'number' && typeof d === 'number')
          ? { a: Math.round(a), d: Math.round(d) }
          : { a: Math.round(s.s * (s.f === 'head' ? 0.97 : 0.96875)), d: Math.round(s.s * (s.f === 'head' ? 0.29 : 0.2412)) };
      }
      return vcache[key];
    }
    function tw(s, text){ mctx.font = fontOf(s); return mctx.measureText(text).width; }
    // a piece of text: weight, size, colour, font ('ui' | 'head'), optional left margin
    function S(t, w, size, color, f, ml){ return { t: t, w: w, s: size, c: color, f: f || 'ui', ml: ml || 0 }; }

    // a single line made of one or more pieces (e.g. question + small skill tag)
    function inline(segs){
      let w = 0, a = 0, d = 0;
      segs.forEach(s => { s.W = tw(s, s.t); w += s.ml + s.W; const m = vm(s); if(m.a > a) a = m.a; if(m.d > d) d = m.d; });
      return { segs: segs, w: w, a: a, d: d, h: a + d };
    }
    function put(item, x, baseline){
      let cx = x;
      item.segs.forEach(s => { cx += s.ml; ops.push({ k:'t', x: cx, y: baseline, s: s, t: s.t }); cx += s.W; });
    }
    // item centred vertically inside a band of height bandH starting at top
    function putMid(item, x, top, bandH){ put(item, x, top + (bandH - item.h) / 2 + item.a); }

    // collapse spaces like HTML does (runs = [{t, b}])
    function cleanRuns(runs){
      const out = []; let prevSpace = true;
      runs.forEach(r => {
        let t = String(r.t).replace(/\s+/g, ' ');
        if(prevSpace) t = t.replace(/^ /, '');
        if(!t) return;
        prevSpace = /\s$/.test(t);
        out.push({ t: t, b: r.b });
      });
      if(out.length){ const l = out[out.length - 1]; l.t = l.t.replace(/ $/, ''); if(!l.t) out.pop(); }
      return out;
    }

    // word-wrap one paragraph (list of pieces) to maxW. Returns lines of placed pieces.
    function wrap(segs, maxW){
      const toks = []; let word = null;
      segs.forEach(s => {
        s.t.split(/(\s+)/).forEach(p => {
          if(!p) return;
          if(/^\s+$/.test(p)){ word = null; toks.push({ sp: true, s: s }); }
          else {
            if(!word){ word = { parts: [], w: 0 }; toks.push(word); }
            const w = tw(s, p); word.parts.push({ s: s, t: p, w: w }); word.w += w;
          }
        });
      });
      const lines = []; let line = { pieces: [], w: 0 }; let sp = 0;
      const flush = () => { lines.push(line); line = { pieces: [], w: 0 }; sp = 0; };
      const place = wd => {
        if(line.pieces.length && line.w + sp + wd.w > maxW) flush();
        if(!line.pieces.length) sp = 0;
        let x = line.w + sp;
        wd.parts.forEach(p => { line.pieces.push({ s: p.s, t: p.t, x: x, w: p.w }); x += p.w; });
        line.w = x; sp = 0;
      };
      toks.forEach(tk => {
        if(tk.sp){ sp = tw(tk.s, ' '); return; }
        if(tk.w <= maxW){ place(tk); return; }
        // one word wider than the whole line: break it between letters
        let cur = { parts: [], w: 0 };
        tk.parts.forEach(p => Array.from(p.t).forEach(ch => {
          const cw = tw(p.s, ch);
          if(cur.w + cw > maxW && cur.parts.length){ place(cur); flush(); cur = { parts: [], w: 0 }; }
          cur.parts.push({ s: p.s, t: ch, w: cw }); cur.w += cw;
        }));
        if(cur.parts.length) place(cur);
      });
      if(line.pieces.length || !lines.length) lines.push(line);
      return lines;
    }
    // draw paragraphs (each a list of pieces) with wrapping. lineH = fixed line height, or null for "normal". Returns height used.
    function paragraphs(lists, x, y, maxW, lineH){
      let cy = y;
      lists.forEach(segs => {
        wrap(segs, maxW).forEach(line => {
          let a = 0, d = 0;
          line.pieces.forEach(p => { const m = vm(p.s); if(m.a > a) a = m.a; if(m.d > d) d = m.d; });
          if(!line.pieces.length){ const m = vm(segs[0] || S('x', 400, 12.5, C.dim)); a = m.a; d = m.d; }   // blank line
          const h = lineH || (a + d);
          const base = cy + (h - (a + d)) / 2 + a;
          line.pieces.forEach(p => ops.push({ k:'t', x: x + p.x, y: base, s: p.s, t: p.t }));
          cy += h;
        });
      });
      return cy - y;
    }

    // ---------- rows (each returns its height) ----------
    const ROW_W_PAD = 13, ROW_H_PAD = 10, ROW_R = 9, ROW_SIZE = 13.5;

    // "Slowest right answers": question (+ small skill tag) on the left, time on the right
    function detailRow(r, x, y, w){
      const q = inline([ S(r.q, 700, ROW_SIZE, C.text) ].concat(r.tag ? [ S(r.tag, 400, 11, C.dim, 'ui', 7) ] : []));
      const t = inline([ S(r.time, 700, ROW_SIZE, C.text) ]);
      const ih = Math.max(q.h, t.h), h = ROW_H_PAD * 2 + ih;
      ops.push({ k:'r', x: x, y: y, w: w, h: h, r: ROW_R, f: C.statBg });
      putMid(q, x + ROW_W_PAD, y + ROW_H_PAD, ih);
      putMid(t, x + w - ROW_W_PAD - t.w, y + ROW_H_PAD, ih);
      return h;
    }

    // "By skill" (Mixed rounds): skill name on the left, small stats on the right (drops under the name if too wide)
    function skillRow(r, x, y, w){
      const name  = inline([ S(r.name, 600, ROW_SIZE, C.text) ]);
      const items = (r.nums || []).map(it => inline(cleanRuns(it).map(run => S(run.t, run.b ? 700 : 400, 12, run.b ? C.text : C.dim))));
      const numsW = items.reduce((n, i) => n + i.w, 0) + 12 * Math.max(0, items.length - 1);
      const numsH = items.reduce((n, i) => Math.max(n, i.h), 0);
      const inner = w - ROW_W_PAD * 2;
      const drawNums = (nx, top, band) => { let cx = nx; items.forEach(i => { putMid(i, cx, top, band); cx += i.w + 12; }); };
      let h;
      if(name.w + numsW <= inner){
        const ih = Math.max(name.h, numsH); h = ROW_H_PAD * 2 + ih;
        ops.push({ k:'r', x: x, y: y, w: w, h: h, r: ROW_R, f: C.statBg });
        putMid(name, x + ROW_W_PAD, y + ROW_H_PAD, ih);
        drawNums(x + w - ROW_W_PAD - numsW, y + ROW_H_PAD, ih);
      } else {
        h = ROW_H_PAD * 2 + name.h + 6 + numsH;
        ops.push({ k:'r', x: x, y: y, w: w, h: h, r: ROW_R, f: C.statBg });
        putMid(name, x + ROW_W_PAD, y + ROW_H_PAD, name.h);
        drawNums(x + ROW_W_PAD, y + ROW_H_PAD + name.h + 6, numsH);
      }
      return h;
    }

    // "Missed": question on the left, "you: ..." and "right: ..." on the right (drops under the question if too wide)
    function missRow(r, x, y, w){
      const q     = inline([ S(r.q, 700, ROW_SIZE, C.text) ].concat(r.tag ? [ S(r.tag, 400, 11, C.dim, 'ui', 7) ] : []));
      const you   = inline([ S(r.you,   400, 12, C.bad) ]);
      const right = inline([ S(r.right, 400, 12, C.dim) ]);
      const numsW = you.w + 8 + right.w, numsH = Math.max(you.h, right.h);
      const ix = x + 1 + ROW_W_PAD, iw = w - 2 - ROW_W_PAD * 2, top = y + 1 + ROW_H_PAD;
      const drawNums = (nx, t, band) => { putMid(you, nx, t, band); putMid(right, nx + you.w + 8, t, band); };
      const bd = { k:'r', x: x, y: y, w: w, h: 0, r: ROW_R, f: C.badBd };
      const bg = { k:'r', x: x + 1, y: y + 1, w: w - 2, h: 0, r: ROW_R - 1, f: C.badBg };
      ops.push(bd, bg);
      let ch;
      if(q.w + 10 + numsW <= iw){
        ch = Math.max(q.h, numsH);
        putMid(q, ix, top, ch);
        drawNums(ix + iw - numsW, top, ch);
      } else {
        ch = q.h + 4 + numsH;
        putMid(q, ix, top, q.h);
        drawNums(ix, top + q.h + 4, numsH);
      }
      const h = 2 + ROW_H_PAD * 2 + ch;
      bd.h = h; bg.h = h - 2;
      return h;
    }
    const rowOf = (r, x, y, w) => r.type === 'miss' ? missRow(r, x, y, w) : r.type === 'skill' ? skillRow(r, x, y, w) : detailRow(r, x, y, w);

    // ---------- the card, top to bottom ----------
    const x0 = PAGE_PAD + 1 + BOX_PAD;                     // left edge of the card's content
    const W  = CARD_W - PAGE_PAD * 2 - 2 - BOX_PAD * 2;    // width of the card's content
    let y    = PAGE_PAD + 1 + BOX_PAD;
    const boxBd = { k:'r', x: PAGE_PAD,     y: PAGE_PAD,     w: CARD_W - PAGE_PAD * 2,     h: 0, r: BOX_R,     f: tintBd };
    const boxBg = { k:'r', x: PAGE_PAD + 1, y: PAGE_PAD + 1, w: CARD_W - PAGE_PAD * 2 - 2, h: 0, r: BOX_R - 1, f: C.card };
    ops.push(boxBd, boxBg);

    // title (Sora 19 bold), 8px below
    if(model.title) y += paragraphs([[ S(model.title, 700, 19, C.text, 'head') ]], x0, y, W, null) + 8;

    // note box (tinted, 12.5px, line-height 1.6 = 20px), 20px below
    if(model.note && model.note.length){
      const lists = model.note.map(runs => cleanRuns(runs).map(r => S(r.t, r.b ? 700 : 400, 12.5, r.b ? C.text : C.dim)));
      const bd = { k:'r', x: x0,     y: y,     w: W,     h: 0, r: 9, f: tintBd };
      const bg = { k:'r', x: x0 + 1, y: y + 1, w: W - 2, h: 0, r: 8, f: tintBg };
      ops.push(bd, bg);
      const th = paragraphs(lists, x0 + 1 + 13, y + 1 + 10, W - 2 - 26, 20);
      bd.h = th + 22; bg.h = th + 20;
      y += bd.h + 20;
    }

    // three stat boxes side by side (10px gaps), 24px below
    if(model.stats && model.stats.length){
      const n = model.stats.length, cw = (W - 10 * (n - 1)) / n;
      let sh = 0;
      model.stats.forEach((st, i) => {
        const sx  = x0 + i * (cw + 10);
        const num = inline([ S(st.num, 700, 25, C.text) ]), lbl = inline([ S(st.lbl, 400, 11, C.dim) ]);
        const h   = 15 + num.h + 4 + lbl.h + 15; if(h > sh) sh = h;
        ops.push({ k:'r', x: sx, y: y, w: cw, h: h, r: 11, f: (st.kind === 'acc' || st.kind === 'avg') ? tintBg : C.statBg });
        put(num, sx + (cw - num.w) / 2, y + 15 + num.a);
        put(lbl, sx + (cw - lbl.w) / 2, y + 15 + num.h + 4 + lbl.a);
      });
      y += sh + 24;
    }

    // sections: small grey title, 9px, rows 7px apart, 20px after
    (model.sections || []).forEach(sec => {
      const ts = inline([ S(sec.title, 600, 12, C.dim) ]);
      put(ts, x0, y + ts.a); y += ts.h + 9;
      sec.rows.forEach((r, i) => { y += rowOf(r, x0, y, W) + (i < sec.rows.length - 1 ? 7 : 0); });
      y += 20;
    });

    // footer: thin line, then app name (left, accent colour) and date/time (right)
    const fl = inline([ S(model.footLeft  || '', 700, 12.5, accent, 'head') ]);
    const fr = inline([ S(model.footRight || '', 400, 11, C.dim) ]);
    const fh = Math.max(fl.h, fr.h);
    ops.push({ k:'l', x: x0, y: y, w: W, h: 1, f: C.line });
    putMid(fl, x0, y + 1 + 12, fh);
    putMid(fr, x0 + W - fr.w, y + 1 + 12, fh);
    y += 1 + 12 + fh;

    boxBd.h = (y + BOX_PAD + 1) - PAGE_PAD;
    boxBg.h = boxBd.h - 2;
    const totalH = PAGE_PAD * 2 + boxBd.h;

    // ---------- paint ----------
    const cv = makeCanvas(CARD_W * SCALE, Math.ceil(totalH * SCALE));
    const g  = cv.getContext('2d');
    g.fillStyle = C.page; g.fillRect(0, 0, cv.width, cv.height);   // solid page colour (a transparent one showed black in some apps)
    g.scale(SCALE, SCALE);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    ops.forEach(o => {
      if(o.k === 'r'){ g.fillStyle = o.f; roundRect(g, o.x, o.y, o.w, o.h, o.r); g.fill(); }
      else if(o.k === 'l'){ g.fillStyle = o.f; g.fillRect(o.x, o.y, o.w, o.h); }
      else { g.font = fontOf(o.s); g.fillStyle = o.s.c; g.fillText(o.t, o.x, o.y); }
    });

    const out = { blob: await toBlob(cv, opts.type, opts.quality) };
    if(opts.type !== 'image/png') out.png = await toBlob(cv, 'image/png');   // Copy needs a PNG even if the image itself is a JPG
    return out;
  }

  function render(model, opts){
    return loadFonts(opts.fonts).then(() => draw(model, opts));
  }

  if(IS_WORKER){
    self.onmessage = async function(e){
      const m = e.data;
      try{
        const out = await render(m.model, m.opts);
        self.postMessage({ id: m.id, ok: true, blob: out.blob, png: out.png || null });
      }catch(err){
        self.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) });
      }
    };
  } else {
    window.renderShareCard = render;   // main-thread fallback (see share.js)
  }
})();
