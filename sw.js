/* 得闲茶吧 · 离线缓存（保证稳定打开） */
const CACHE = 'dexian-v2';
const SHELL = [
  './', './index.html', './styles.css', './app.js',
  './manifest.json', './apple-touch-icon.png', './icon-192.png', './icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 跨域（Supabase / CDN）走网络优先
  if (url.origin !== location.origin) {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }
  // 本地资源：网络优先，失败回退缓存（保证离线可开）
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
