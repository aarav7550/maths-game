/* confetti-worker.js
   Draws the confetti. This file runs in TWO ways:
   1) As a Web Worker (started by confetti.js): the drawing happens on its own
      thread, so the page stays smooth. This is the normal case.
   2) As a normal script on the main page: only used as a fallback when a
      browser can't run the worker (same idea as share-card.js).
   All the confetti settings live in this file (the block just below). */
(function () {
  var IN_WORKER = (typeof WorkerGlobalScope !== 'undefined') && (self instanceof WorkerGlobalScope);

  var COLORS = ['#e84b5e', '#f9db05', '#009bff', '#48ff24'];
  var GRAVITY = 3;
  var MAX_TICKS = 750;        // safety limit, so the canvas always gets removed

  // Each piece vanishes when it falls below its own height on the screen
  // (0 = top, 1 = bottom). Different heights make them disappear gradually.
  var VANISH_MIN = 0.75;
  var VANISH_MAX = 0.93;
  var FADE_PX = 95;           // how far a piece fades out after reaching its height

  var DESKTOP_DENSITY = 2.5;    // 2 = twice as many pieces
  var PHONE_DENSITY = 2.5;      // 1.5 = half again as many pieces
  var DESKTOP_SPEED = 1.6;    // 1.6 = travels further (desktop only)

  var raf = (typeof self.requestAnimationFrame === 'function')
    ? self.requestAnimationFrame.bind(self)
    : function (cb) { return setTimeout(function () { cb(performance.now()); }, 16); };

  // canvas: an OffscreenCanvas (worker) or a normal canvas (fallback)
  // o: { W, H, dpr, isPhone }
  function run(canvas, o, onDone) {
    var W = o.W, H = o.H, dpr = o.dpr, isPhone = o.isPhone;
    var density = isPhone ? PHONE_DENSITY : DESKTOP_DENSITY;
    var speed = isPhone ? 1 : DESKTOP_SPEED;

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var pieces = [];

    function fire(count, p) {
      count = Math.round(count * density);
      var originX = (p.x === undefined ? 0.5 : p.x) * W;
      var originY = (p.y === undefined ? 0.7 : p.y) * H;
      var angle = (p.angle === undefined ? 90 : p.angle) * Math.PI / 180;
      var spread = (p.spread === undefined ? 45 : p.spread) * Math.PI / 180;
      var startVelocity = (p.startVelocity === undefined ? 45 : p.startVelocity) * speed;
      var decay = p.decay === undefined ? 0.9 : p.decay;
      var scalar = p.scalar === undefined ? 1 : p.scalar;

      for (var i = 0; i < count; i++) {
        pieces.push({
          x: originX,
          y: originY,
          angle2D: -angle + (0.5 * spread - Math.random() * spread),
          vel: startVelocity * 0.5 + Math.random() * startVelocity,
          decay: decay,
          w: (9 + Math.random() * 4) * scalar,
          h: (5 + Math.random() * 3) * scalar,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.3,
          wobble: Math.random() * 10,
          vanishY: H * (VANISH_MIN + Math.random() * (VANISH_MAX - VANISH_MIN)),
          tick: 0,
          dead: false,
          falling: false,
          color: COLORS[Math.floor(Math.random() * COLORS.length)]
        });
      }
    }

    var total = 200;

    // Centre bursts (desktop only)
    if (!isPhone) {
      fire(total * 0.25, { spread: 26, startVelocity: 55 });
      fire(total * 0.2,  { spread: 60 });
      fire(total * 0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
      fire(total * 0.1,  { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
      fire(total * 0.1,  { spread: 120, startVelocity: 45 });
    }

    // Side sprays (phone and desktop)
    fire(70, { x: 0, y: 0.7, angle: 60,  spread: 55, startVelocity: 60 });
    fire(70, { x: 1, y: 0.7, angle: 120, spread: 55, startVelocity: 60 });

    var last = performance.now();

    function frame(now) {
      var dt = Math.min((now - last) / 16.667, 3);
      last = now;
      ctx.clearRect(0, 0, W, H);

      var alive = 0;
      for (var i = 0; i < pieces.length; i++) {
        var p = pieces[i];
        if (p.dead) continue;

        p.vel *= Math.pow(p.decay, dt);
        p.x += Math.cos(p.angle2D) * p.vel * dt;
        var vy = Math.sin(p.angle2D) * p.vel + GRAVITY;
        p.y += vy * dt;
        if (vy > 0) p.falling = true;
        p.rot += p.vr * dt;
        p.tick += dt;

        var alpha = 1;
        if (p.falling && p.y > p.vanishY) alpha = 1 - (p.y - p.vanishY) / FADE_PX;
        if (alpha <= 0 || p.tick > MAX_TICKS) { p.dead = true; continue; }
        alive++;

        var flutter = Math.abs(Math.cos(p.wobble + p.tick * 0.2)) * 0.7 + 0.3;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, (-p.h * flutter) / 2, p.w, p.h * flutter);
        ctx.restore();
      }

      if (alive > 0) {
        raf(frame);
      } else {
        onDone();
      }
    }

    raf(frame);
  }

  if (IN_WORKER) {
    // Worker mode: wait for "fire" messages from confetti.js
    self.onmessage = function (e) {
      var m = e.data;
      if (!m || m.type !== 'fire') return;
      try {
        run(m.canvas, m, function () { self.postMessage({ type: 'done', id: m.id }); });
      } catch (err) {
        self.postMessage({ type: 'failed', id: m.id });
      }
    };
  } else {
    // Fallback mode: confetti.js calls this directly on the main page
    window.runConfetti = run;
  }
})();
