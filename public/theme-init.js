// Applies OS dark-mode preference before React mounts (no FOUC).
// External file (not inline) so a strict CSP can omit 'unsafe-inline'.
// When a real theme toggle lands, this script reads from localStorage first.
(function () {
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var apply = function () {
    document.documentElement.classList.toggle('dark', mq.matches);
  };
  apply();
  mq.addEventListener('change', apply);
})();
