// Service Worker para nanana PWA
const CACHE = 'nanana-v2';
const ASSETS = ['/nanana/', '/nanana/index.html', '/nanana/manifest.json', '/nanana/styles.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  // Nunca interceptar llamadas a APIs externas ni a YouTube (reproductor)
  if (url.includes('googleapis') || url.includes('musicbrainz') ||
      url.includes('audioscrobbler') || url.includes('deezer') ||
      url.includes('itunes') || url.includes('lrclib') ||
      url.includes('script.google') || url.includes('youtube.com') ||
      url.includes('ytimg.com') || url.includes('googlevideo.com')) return;

  e.respondWith(
    caches.match(e.request).then(cached => fetch(e.request).then(resp => {
      if (resp.ok && url.startsWith(self.location.origin)) {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return resp;
    }).catch(() => cached))
  );
});
