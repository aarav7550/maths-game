(function () {
  var COLORS = ['#e84b5e', '#f9db05', '#009bff', '#48ff24'];
  var GRAVITY = 3;
  var MAX_TICKS = 600;        // safety limit, so the canvas always gets removed

  // Each piece vanishes when it falls below its own height on the screen
  // (0 = top, 1 = bottom). Different heights make them disappear gradually.
  var VANISH_MIN = 0.75;
  var VANISH_MAX = 0.93;
  var FADE_PX = 95;           // how far a piece fades out after reaching its height

  // Desktop only (screens wider than 640px)
  var DESKTOP_DENSITY = 2;    // 2 = twice as many pieces
  var PHONE_DENSITY = 2;    // 1.5 = half again as many pieces
  var DESKTOP_SPEED = 1.6;    // 1.6 = travels further

  function fireConfetti() {
    var W = window.innerWidth;
    var H = window.innerHeight;
    var isPhone = window.matchMedia('(max-width:640px)').matches;
    var density = isPhone ? PHONE_DENSITY : DESKTOP_DENSITY;
    var speed = isPhone ? 1 : DESKTOP_SPEED;

    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    document.body.appendChild(canvas);

    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var pieces = [];

    function fire(count, o) {
      count = Math.round(count * density);
      var originX = (o.x === undefined ? 0.5 : o.x) * W;
      var originY = (o.y === undefined ? 0.7 : o.y) * H;
      var angle = (o.angle === undefined ? 90 : o.angle) * Math.PI / 180;
      var spread = (o.spread === undefined ? 45 : o.spread) * Math.PI / 180;
      var startVelocity = (o.startVelocity === undefined ? 45 : o.startVelocity) * speed;
      var decay = o.decay === undefined ? 0.9 : o.decay;
      var scalar = o.scalar === undefined ? 1 : o.scalar;

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
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    }

    requestAnimationFrame(frame);
  }

  window.fireConfetti = fireConfetti;
})();

// TEST ONLY: remove the two slashes at the start of the next line to make every tap fire confetti.
// document.addEventListener('click', function () { fireConfetti(); });