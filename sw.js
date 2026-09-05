const CACHE="sp-v3-fixed-qr-1";
const ASSETS=[
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./sw.js",
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
      .then(keys=>Promise.all(
        keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))
      ))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", event=>{
  if(event.request.method!=="GET") return;

  event.respondWith(
    caches.match(event.request).then(cached=>{
      if(cached) return cached;

      return fetch(event.request).then(response=>{
        if(response && response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return response;
      }).catch(()=>{
        if(event.request.mode==="navigate") return caches.match("./index.html");
        return new Response("",{status:504,statusText:"Offline"});
      });
    })
  );
});
