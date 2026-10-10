/* ==========================================================================
   appname.js — the app's name lives in ONE place: manifest.json.

   - window.getAppName()  -> Promise of the name (short_name, then name). share.js uses it.
   - Any element with a  data-app-name  attribute gets its text replaced by the name
     (Home top bar, About page title, ...). To show the name somewhere new, just add
     the attribute:  <div data-app-name>fallback text</div>
   - The browser tab title keeps whatever comes after the " — " in <title> and only the
     name part is swapped:  "<name> — Mental Math Drills".
   - The iOS home-screen title tag (apple-mobile-web-app-title) is updated too.

   The text written in index.html (e.g. "Numbers") is now only a fallback shown if
   manifest.json can't be loaded. Load this file BEFORE share.js.
   ========================================================================== */
(function(){
  const SEP = ' \u2014 ';
  let promise = null;

  function fromTitle(){ return document.title.split(SEP)[0]; }

  function getAppName(){
    if(!promise){
      const link = document.querySelector('link[rel="manifest"]');
      promise = fetch(link ? link.href : 'manifest.json')
        .then(r => r.json())
        .then(m => m.short_name || m.name || fromTitle())
        .catch(() => fromTitle());
    }
    return promise;
  }
  window.getAppName = getAppName;

  getAppName().then(function(name){
    document.querySelectorAll('[data-app-name]').forEach(el => { el.textContent = name; });

    const parts = document.title.split(SEP);
    document.title = parts.length > 1 ? name + SEP + parts.slice(1).join(SEP) : name;

    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if(meta) meta.setAttribute('content', name);
  });
})();
