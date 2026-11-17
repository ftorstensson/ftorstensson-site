// Umami events for ftorstensson.com. Kept separate so design's index.html stays as delivered.
// Tracks: which screens people reach (hello / home / bot / game), and email or phone taps.
(function () {
  function track(name, data) {
    try { if (window.umami) window.umami.track(name, data); } catch (e) {}
  }

  // Screen reached: fires once per screen per visit, when most of it is in view.
  var seen = {};
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var id = e.target.id;
        if (e.isIntersecting && !seen[id]) { seen[id] = true; track('screen-' + id); }
      });
    }, { threshold: 0.6 });
    ['hello', 'home', 'bot', 'game'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  // Email and phone taps, with the screen they came from.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="mailto:"], a[href^="tel:"]');
    if (!a) return;
    var sec = a.closest('section');
    var from = sec ? sec.id : 'unknown';
    track(a.href.indexOf('mailto:') === 0 ? 'email-click' : 'phone-click', { screen: from });
  });
})();

// Site counter for the Boards hub: one tiny hit per page or screen view to the score service.
// Sends only the path, plus n=1 the first time this browser shows up today. No cookies, nothing personal.
(function () {
  var API = 'https://ftorstensson-scores.fredrik-t-torstensson.workers.dev/hit';
  var last = '';
  function send() {
    var p = location.pathname;
    if (p === last) return;
    last = p;
    var today = new Date().toDateString(), n = 0;
    try { if (localStorage.getItem('ft-seen') !== today) { localStorage.setItem('ft-seen', today); n = 1; } } catch (e) {}
    try {
      fetch(API, { method: 'POST', mode: 'cors', keepalive: true, headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ p: p, n: n }) }).catch(function () {});
    } catch (e) {}
  }
  setTimeout(send, 800);           // after routes.js has set the address
  setInterval(send, 1500);         // screens change the address as people move
})();
