// Deixa o app instalável: registra o service worker, mostra o botão "Instalar"
// (Android/Chrome/Edge) e uma dica de como instalar no iPhone (Safari não tem botão).

(function () {
  const CHAVE_DICA = "agropet_dica_ios_fechada";
  const instalado = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const botao = document.getElementById("btnInstalar");
  let pedidoInstalacao = null;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  window.addEventListener("beforeinstallprompt", ev => {
    ev.preventDefault();               // guarda o pedido e mostra o nosso botão
    pedidoInstalacao = ev;
    if (botao && !instalado) botao.classList.remove("oculto");
  });

  if (botao) {
    botao.addEventListener("click", async () => {
      if (!pedidoInstalacao) return;
      pedidoInstalacao.prompt();
      await pedidoInstalacao.userChoice.catch(() => {});
      pedidoInstalacao = null;
      botao.classList.add("oculto");
    });
  }

  window.addEventListener("appinstalled", () => {
    if (botao) botao.classList.add("oculto");
    if (typeof avisar === "function") avisar("App instalado! Procure o ícone na tela inicial.");
  });

  // iPhone/iPad no Safari: não existe botão de instalar, então ensina o caminho
  const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let fechada = false;
  try { fechada = localStorage.getItem(CHAVE_DICA) === "1"; } catch (e) {}
  if (ehIOS && !instalado && !fechada) {
    const dica = document.createElement("div");
    dica.className = "dica-ios";
    dica.innerHTML = `
      <span>📲 Instale este app: toque em <b>Compartilhar</b> <span class="icone-compartilhar">⬆︎</span> e depois em <b>Adicionar à Tela de Início</b>.</span>
      <button class="btn-icone" aria-label="Fechar dica">✕</button>`;
    dica.querySelector("button").onclick = () => {
      dica.remove();
      try { localStorage.setItem(CHAVE_DICA, "1"); } catch (e) {}
    };
    document.querySelector(".topo").insertAdjacentElement("afterend", dica);
  }
})();
