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
