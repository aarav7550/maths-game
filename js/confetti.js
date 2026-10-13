/* confetti.js
   Starts the confetti. The actual drawing is done by js/confetti-worker.js,
   which runs on its own thread so the page doesn't stutter.
   If the browser can't run a worker (or the app is opened straight from a
   file), the same drawing code runs on the main page instead.
   game.js only calls window.fireConfetti(), nothing else. */
(function () {
  var WORKER_URL = 'js/confetti-worker.js';
  var SAFETY_MS = 15000;          // remove the canvas after this long no matter what

  // DEBUG: set to true to see a small black note at the bottom of the screen
  // every time confetti fires. It says "worker" (the new way) or
  // "main thread, because ..." (the older way, with the reason). Keep it false.
  var SHOW_ERRORS = false;

  var worker = null;
  var workerBroken = false;
  var brokenReason = '';
  var nextId = 1;
  var active = {};                // id -> { canvas, timer, opts }
  var fallbackLoading = false;
  var fallbackQueue = [];

  function note(text) {
    if (!SHOW_ERRORS) return;
    var el = document.getElementById('confettiDebugNote');
    if (!el) {
      el = document.createElement('div');
      el.id = 'confettiDebugNote';
      el.style.cssText = 'position:fixed;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));' +
        'z-index:10000;background:#000;color:#fff;font:12px/1.4 monospace;padding:8px 10px;' +
        'border-radius:8px;pointer-events:none;word-break:break-word';
      document.body.appendChild(el);
    }
    el.textContent = 'confetti: ' + text;
    clearTimeout(el._t);
    el._t = setTimeout(function () { if (el.parentNode) el.remove(); }, 6000);
  }

  function breakWorker(reason) {
    workerBroken = true;
    brokenReason = reason;
  }

  // Returns '' if a worker can be used, otherwise the reason it can't
  function workerProblem() {
    if (workerBroken) return brokenReason || 'worker failed earlier';
    if (typeof Worker === 'undefined') return 'this browser has no Worker support';
    if (typeof OffscreenCanvas === 'undefined') return 'this browser has no OffscreenCanvas';
    if (typeof HTMLCanvasElement === 'undefined' || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) {
      return 'this browser can\'t hand a canvas to a worker';
    }
    return '';
  }

  function makeCanvas() {
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    document.body.appendChild(canvas);
    return canvas;
  }

  function finish(id) {
    var item = active[id];
    if (!item) return;
    clearTimeout(item.timer);
    if (item.canvas.parentNode) item.canvas.remove();
    delete active[id];
  }

  // The worker failed for this round: draw it on the main page instead.
  function rescue(id) {
    var item = active[id];
    if (!item) return;
    var opts = item.opts;
    finish(id);
    startOnMain(opts, brokenReason || 'the worker failed');
  }

  function getWorker() {
    if (worker) return worker;
    try {
      worker = new Worker(WORKER_URL);
    } catch (err) {
      breakWorker('the worker could not start (' + (err && err.name ? err.name : 'error') + ')');
      return null;
    }
    worker.onmessage = function (e) {
      var m = e.data || {};
      if (m.type === 'done') finish(m.id);
      else if (m.type === 'failed') { breakWorker('the worker hit an error while drawing'); rescue(m.id); }
    };
    worker.onerror = function () {
      breakWorker('the worker file failed to load or crashed');
      worker = null;
      Object.keys(active).forEach(rescue);
    };
    return worker;
  }

  function startInWorker(opts) {
    var w = getWorker();
    if (!w) return false;
    var canvas = makeCanvas();
    var off;
    try {
      off = canvas.transferControlToOffscreen();
    } catch (err) {
      canvas.remove();
      breakWorker('the canvas could not be handed to the worker');
      return false;
    }
    var id = nextId++;
    active[id] = { canvas: canvas, opts: opts, timer: setTimeout(function () { finish(id); }, SAFETY_MS) };
    try {
      w.postMessage({ type: 'fire', id: id, canvas: off, W: opts.W, H: opts.H, dpr: opts.dpr, isPhone: opts.isPhone }, [off]);
    } catch (err) {
      finish(id);
      breakWorker('sending the canvas to the worker failed');
      return false;
    }
    return true;
  }

  // Fallback: load the same file as a normal script and draw on the main page
  function withFallbackScript(cb) {
    if (typeof window.runConfetti === 'function') { cb(); return; }
    fallbackQueue.push(cb);
    if (fallbackLoading) return;
    fallbackLoading = true;
    var s = document.createElement('script');
    s.src = WORKER_URL;
    s.onload = function () {
      var q = fallbackQueue; fallbackQueue = [];
      q.forEach(function (fn) { fn(); });
    };
    s.onerror = function () {   // confetti is only decoration, so just give up quietly
      fallbackQueue = [];
      fallbackLoading = false;
      note('could not load ' + WORKER_URL + ' (is it in sw.js ASSETS?)');
    };
    document.head.appendChild(s);
  }

  function startOnMain(opts, reason) {
    note('main thread, because ' + reason);
    withFallbackScript(function () {
      var canvas = makeCanvas();
      window.runConfetti(canvas, opts, function () { canvas.remove(); });
    });
  }

  function fireConfetti() {
    var opts = {
      W: window.innerWidth,
      H: window.innerHeight,
      dpr: Math.min(window.devicePixelRatio || 1, 1.5),
      isPhone: window.matchMedia('(max-width:640px)').matches
    };
    var problem = workerProblem();
    if (!problem && startInWorker(opts)) { note('worker'); return; }
    startOnMain(opts, problem || brokenReason || 'the worker could not be used');
  }

  window.fireConfetti = fireConfetti;

  // Start the worker a moment after load, so the first confetti has no start-up delay
  if (!workerProblem()) setTimeout(getWorker, 1500);
})();

// TEST ONLY: remove the two slashes at the start of the next line to make every tap fire confetti.
// document.addEventListener('click', function () { fireConfetti(); });
