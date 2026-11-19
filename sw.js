// Service worker: guarda a parte visual do app no aparelho.
// Estratégia "rede primeiro": com internet, sempre pega a versão mais nova
// (atualização chega pra todo mundo na hora); sem internet, usa a cópia guardada.
// Chamadas pra fora (ViaCEP, WhatsApp) passam direto, sem cache.

const VERSAO = "agropet-v1";
const ARQUIVOS = [
  "./", "./index.html", "./admin.html",
  "./estilo.css", "./dados.js", "./loja.js", "./admin.js", "./pwa.js",
  "./manifest-loja.json", "./manifest-painel.json",
  "./icones/loja-192.png", "./icones/loja-512.png", "./icones/loja-apple.png",
  "./icones/painel-192.png", "./icones/painel-512.png", "./icones/painel-apple.png",
];

self.addEventListener("install", ev => {
  ev.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", ev => {
  ev.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith(
    fetch(req)
      .then(resp => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(VERSAO).then(c => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(r => r || (req.mode === "navigate" ? caches.match("./index.html") : undefined)))
  );
});
