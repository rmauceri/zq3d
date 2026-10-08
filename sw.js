'use strict';

const PREFIX = 'zq3d-shell-';
const CACHE = `${PREFIX}v3`;
const ROOT = new URL('./', self.location.href);
const ASSETS = [
    './index.html', './styles.css', './core.js', './renderer.js', './audio.js',
    './app.js', './manifest.webmanifest', './icon.svg',
    './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
    './icons/apple-touch-icon.png'
].map(path => new URL(path, ROOT).href);
const SHELL = new Set(ASSETS);

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', event => {
    if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
    const key = new URL(url.pathname, ROOT.origin).href;
    const shellNavigation = request.mode === 'navigate' &&
        (url.pathname === ROOT.pathname || key === ASSETS[0]);
    if (!SHELL.has(key) && !shellNavigation) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const asset = shellNavigation ? ASSETS[0] : key;
        const cached = await cache.match(asset);
        if (cached) return cached;
        // Do not cache partial releases here; the next worker installs its complete shell atomically.
        try { return await fetch(request); }
        catch (error) {
            console.warn('zq3d: an uncached resource is unavailable offline.', asset, error);
            return new Response('This aquarium file is not available offline yet. Reconnect and reload zq3d.', {
                status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }
    })());
});
