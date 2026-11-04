// One address per screen: / (hello), /f, /fredbot, /game. Kept separate so design's index.html stays as delivered.
// The folders f/, fredbot/ and game/ hold tiny pages that send visitors to /?to=<screen>; this file jumps there
// and keeps the address bar in step as people move between screens. Any other query (?ref=cv) is kept.
(function () {
  var NAMES = ['', 'f', 'fredbot', 'game'];
  var q = new URLSearchParams(location.search);
  var want = (q.get('to') || location.hash.slice(1) || location.pathname.replace(/^\/+|\/+$/g, '')).toLowerCase();
  q.delete('to');
  var rest = q.toString() ? '?' + q.toString() : '';
  var i = NAMES.indexOf(want);
  try {
    if (i > 0 && typeof idx !== 'undefined') { idx = i; scrollTo(0, i * innerHeight); }
    history.replaceState(null, '', '/' + NAMES[i > 0 ? i : 0] + rest);
  } catch (e) {}
  var last = typeof idx !== 'undefined' ? idx : 0;
  setInterval(function () {
    try {
      if (typeof idx === 'undefined' || idx === last) return;
      last = idx;
      history.replaceState(null, '', '/' + (NAMES[idx] || '') + rest);
    } catch (e) {}
  }, 400);
})();
