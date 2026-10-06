/* App-shell service worker. Gemini API calls are never cached. */
const CACHE = 'vts-shell-v1.6.0';
const SHELL = [
  './', './index.html', './styles.css', './manifest.json', './capacitor.js',
  './js/gemini.js', './js/emoji-index.js', './js/scenes.js', './js/library.js', './js/shortgen.js', './js/db.js', './js/speech.js', './js/native.js', './js/render.js', './js/segments.js', './js/audiofx.js', './js/comedy.js', './js/motion.js', './js/three3d.js', './js/captions16.js', './vendor/three.min.js', './js/ideas.js', './js/app.js',
  './sfx/bell.ogg', './sfx/cash.ogg', './sfx/click.ogg', './sfx/ding.ogg', './sfx/laugh.ogg', './sfx/levelup.ogg', './sfx/notif.ogg', './sfx/pluck.ogg', './sfx/pop.ogg', './sfx/punch.ogg', './sfx/tada.ogg', './sfx/tick.ogg', './sfx/wrong.ogg',
  './fonts/Montserrat.ttf',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-192.png', './icons/maskable-512.png', './icons/apple-touch-icon.png',
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
