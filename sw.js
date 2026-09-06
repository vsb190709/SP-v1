const CACHE="sp-v4-final-20260906-1";
const ASSETS=[
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/sp-logo.jpeg"
];

self.addEventListener("install", event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", event=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  const isAppAsset=["index.html","app.js","style.css","sw.js"].some(f=>url.pathname.endsWith("/"+f));

  if(isAppAsset || event.request.mode==="navigate"){
    event.respondWith(
      fetch(event.request,{cache:"no-store"})
        .then(response=>{
          if(response && response.ok){
            const copy=response.clone();
            caches.open(CACHE).then(c=>c.put(event.request,copy));
          }
          return response;
        })
        .catch(()=>caches.match(event.request).then(r=>r || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>cached || fetch(event.request).then(response=>{
      if(response && response.ok){
        const copy=response.clone();
        caches.open(CACHE).then(c=>c.put(event.request,copy));
      }
      return response;
    }))
  );
});
