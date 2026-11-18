/* 引力信使 Service Worker
 * 目标只有一个：装到桌面后断网也能玩。
 * 页面本身是单文件（CSS/JS 全内联），所以缓存 1 个 HTML + 图标就够了。
 * 改了游戏记得把 VERSION 加一，否则老玩家会一直看到旧缓存。
 */
'use strict';

const VERSION = 'v1-2026.11.18';
const CACHE = 'gravity-courier-' + VERSION;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL).catch(() => { /* 单个资源失败不影响安装 */ }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 站外资源不接管

  // 页面导航：优先走网络（这样更新能及时生效），断网时回落到缓存的 index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // 其它同源资源：缓存优先，未命中再请求并回填
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
