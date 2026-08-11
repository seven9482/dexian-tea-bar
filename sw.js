/* 自杀式 Service Worker：注销自己并清除所有缓存，彻底消除缓存干扰 */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      await self.registration.unregister();
      await self.clients.claim();
    })()
  );
});
// 不做任何请求拦截，所有请求直接走网络
self.addEventListener('fetch', e => { /* no-op */ });
