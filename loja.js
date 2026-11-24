// Loja (tela do cliente): catálogo, carrinho, entrega e envio do pedido.

const SLUG = slugAtual();
const CHAVE_CARRINHO = "agropet_carrinho_" + SLUG; // cada loja tem o seu carrinho
const ANTECEDENCIA_MIN = 0; // folga (min) antes do FIM da faixa de hoje; 0 = vale até a faixa acabar

// começa com a cópia guardada (abre na hora, até sem internet) e depois atualiza pelo banco
let loja = vitrineEmCache(SLUG) || { id: null, slug: SLUG, config: { ...copia(CONFIG_PADRAO), nome: "" }, produtos: [] };
let estadoCarga = loja.id ? "ok" : "carregando"; // carregando | ok | sem-loja | erro
let carrinho = lerCarrinho();      // { idProduto: quantidade }
let categoriaAtiva = "Todos";
let termoBusca = "";
let passo = "itens";               // itens | entrega | ok

const $ = id => document.getElementById(id);
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// ---------------- carrinho ----------------
function lerCarrinho() {
  try { return JSON.parse(localStorage.getItem(CHAVE_CARRINHO)) || {}; } catch (e) { return {}; }
}
function gravarCarrinho() {
  try { localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(carrinho)); } catch (e) {}
}
function produtoPorId(id) { return loja.produtos.find(p => p.id === id && p.ativo); }

function itensDoCarrinho() {
  return Object.entries(carrinho)
    .map(([id, qtd]) => ({ p: produtoPorId(id), qtd }))
    .filter(i => i.p && i.qtd > 0);
}
function totais() {
  const itens = itensDoCarrinho();
  const qtd = itens.reduce((s, i) => s + i.qtd, 0);
  const subtotal = itens.reduce((s, i) => s + i.qtd * i.p.preco, 0);
  const economia = itens.reduce((s, i) => s + (emPromocao(i.p) ? i.qtd * (i.p.precoDe - i.p.preco) : 0), 0);
  const taxa = qtd > 0 ? Number(loja.config.taxaEntrega || 0) : 0;
  return { itens, qtd, subtotal, economia, taxa, total: subtotal + taxa };
}
function mudarQtd(id, delta) {
  const nova = Math.max(0, (carrinho[id] || 0) + delta);
  if (nova === 0) delete carrinho[id]; else carrinho[id] = nova;
  gravarCarrinho();
  atualizarTudo();
  if (delta > 0 && nova === 1) avisar("Adicionado ao carrinho");
}

// ---------------- topo e banner ----------------
function montarTopo() {
  const c = loja.config;
  aplicarTema(c.corPrincipal);
  document.title = c.nome ? `${c.nome} - Pedidos` : "Carregando...";
  $("nomeLoja").textContent = c.nome;
  $("logoLoja").innerHTML = c.logo ? `<img class="logo" src="${escaparHtml(c.logo)}" alt="">` : "🐾";
  $("busca").placeholder = c.textoBusca || "Buscar produto";
  montarCarrossel();
}

// ---------------- carrossel de banners ----------------
let slideAtual = 0, timerSlide = null;
function bannersAtivos() {
  if (estadoCarga !== "ok") return []; // não mostra banner de exemplo enquanto a loja carrega
  return (loja.config.banners || []).filter(b => b.ativo !== false);
}

function montarCarrossel() {
  const lista = bannersAtivos();
  $("secaoBanner").classList.toggle("oculto", lista.length === 0);
  $("carrossel").dataset.altura = loja.config.alturaBanner || "media";
  $("slides").innerHTML = lista.map(htmlBanner).join("");
  $("pontos").innerHTML = lista.length > 1
    ? lista.map((_, i) => `<button data-slide="${i}" aria-label="Banner ${i + 1}"></button>`).join("") : "";
  irParaSlide(0);
}
function irParaSlide(i) {
  const n = bannersAtivos().length;
  if (!n) return;
  slideAtual = (i + n) % n;
  $("slides").style.transform = `translateX(-${slideAtual * 100}%)`;
  document.querySelectorAll("#pontos button").forEach((b, j) => b.classList.toggle("ativo", j === slideAtual));
  clearTimeout(timerSlide);
  const seg = Number(loja.config.trocaBanner);
  if (n > 1 && seg > 0) timerSlide = setTimeout(() => irParaSlide(slideAtual + 1), seg * 1000);
}
// arrastar o dedo troca o banner
let toqueX = null;
$("carrossel").addEventListener("pointerdown", ev => { toqueX = ev.clientX; });
$("carrossel").addEventListener("pointerup", ev => {
  if (toqueX == null) return;
  const dx = ev.clientX - toqueX;
  toqueX = null;
  if (Math.abs(dx) > 40) irParaSlide(slideAtual + (dx < 0 ? 1 : -1));
});

// ---------------- catálogo ----------------
function montarChips() {
  const cats = ["Todos", ...(loja.config.mostrarPromocoes !== false ? ["Promoções"] : []),
    ...new Set(loja.produtos.filter(p => p.ativo).map(p => p.categoria))];
  $("chips").innerHTML = cats.map(c =>
    `<button class="chip ${c === categoriaAtiva ? "ativo" : ""}" data-cat="${escaparHtml(c)}">${c === "Promoções" ? "🔥 " : ""}${escaparHtml(c)}</button>`
  ).join("");
}

function normalizar(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

function montarGrade() {
  const termo = normalizar(termoBusca.trim());
  const lista = loja.produtos.filter(p => {
    if (!p.ativo) return false;
    if (categoriaAtiva === "Promoções" && !emPromocao(p)) return false;
    if (categoriaAtiva !== "Todos" && categoriaAtiva !== "Promoções" && p.categoria !== categoriaAtiva) return false;
    if (termo && !normalizar(`${p.nome} ${p.detalhe} ${p.categoria}`).includes(termo)) return false;
    return true;
  });
  if (!lista.length) {
    const msg = {
      carregando: "Carregando produtos...",
      "sem-loja": "Essa loja não foi encontrada ou está fora do ar no momento.",
      erro: "Não deu pra carregar a loja. Confira a internet e abra de novo.",
    }[estadoCarga] || "Nenhum produto encontrado.";
    $("grade").innerHTML = `<div class="vazio">${msg}</div>`;
    return;
  }
  $("grade").innerHTML = lista.map(p => {
    const qtd = carrinho[p.id] || 0;
    const promo = emPromocao(p);
    const foto = p.foto ? `<img src="${escaparHtml(p.foto)}" alt="">` : iconeDe(p.categoria);
    const botao = qtd
      ? `<div class="passo"><button data-menos="${p.id}" aria-label="Diminuir">−</button><span>${qtd}</span><button data-mais="${p.id}" aria-label="Aumentar">+</button></div>`
      : `<button class="btn-add" data-mais="${p.id}">Adicionar</button>`;
    return `
      <article class="produto">
        ${promo ? `<span class="selo">-${descontoPct(p)}%</span>` : ""}
        <div class="foto">${foto}</div>
        <div class="info">
          <div class="nome">${escaparHtml(p.nome)}</div>
          <div class="detalhe">${escaparHtml(p.detalhe)}</div>
          <div class="precos">
            ${promo ? `<div class="preco-de">de ${real(p.precoDe)}</div>` : ""}
            <div class="preco ${promo ? "promo" : ""}">${promo ? "por " : ""}${real(p.preco)}</div>
          </div>
          ${botao}
        </div>
      </article>`;
  }).join("");
}

function atualizarBarra() {
  const t = totais();
  $("bolinha").textContent = t.qtd;
  $("bolinha").classList.toggle("oculto", t.qtd === 0);
  $("barraCarrinho").classList.toggle("oculto", t.qtd === 0 || painelAberto());
  $("barraQtd").textContent = `🛒 ${t.qtd} ${t.qtd === 1 ? "item" : "itens"} · Ver carrinho`;
  $("barraTotal").textContent = real(t.subtotal);
}

// ---------------- painel (carrinho → entrega → ok) ----------------
function painelAberto() { return !$("painel").classList.contains("oculto"); }

function abrirPainel(p = "itens") {
  passo = p;
  $("painel").classList.remove("oculto");
  $("fundo").classList.remove("oculto");
  document.body.style.overflow = "hidden";
  montarPainel();
  atualizarBarra();
}
function fecharPainel() {
  $("painel").classList.add("oculto");
  $("fundo").classList.add("oculto");
  document.body.style.overflow = "";
  if (passo === "ok") passo = "itens";
  atualizarBarra();
}

function montarPainel() {
  $("viewItens").classList.toggle("oculto", passo !== "itens");
  $("viewEntrega").classList.toggle("oculto", passo !== "entrega");
  $("viewOk").classList.toggle("oculto", passo !== "ok");
  $("btnVoltar").classList.toggle("oculto", passo !== "entrega");
  $("painelTitulo").textContent = { itens: "Seu carrinho", entrega: "Entrega", ok: "Pedido enviado" }[passo];

  const t = totais();
  if (passo === "itens") {
    $("viewItens").innerHTML = t.itens.length ? t.itens.map(({ p, qtd }) => `
      <div class="item-carrinho">
        <div class="mini">${p.foto ? `<img src="${escaparHtml(p.foto)}" alt="">` : iconeDe(p.categoria)}</div>
        <div class="meio">
          <div class="nome">${escaparHtml(p.nome)}</div>
          <div class="sub">${escaparHtml(p.detalhe)} · ${real(p.preco)} cada</div>
          <div class="passo"><button data-menos="${p.id}" aria-label="Diminuir">−</button><span>${qtd}</span><button data-mais="${p.id}" aria-label="Aumentar">+</button></div>
        </div>
        <div class="total-item">${real(p.preco * qtd)}</div>
      </div>`).join("")
      : `<div class="vazio">Seu carrinho está vazio.<br>Que tal dar uma olhada nas rações? 🐶🐱</div>`;

    $("rodapePainel").innerHTML = t.itens.length ? `
      ${t.economia > 0 ? `<div class="linha-total" style="color:var(--laranja)"><span>Você economiza</span><span>${real(t.economia)}</span></div>` : ""}
      ${t.taxa > 0 ? `<div class="linha-total"><span>Taxa de entrega</span><span>${real(t.taxa)}</span></div>` : ""}
      <div class="linha-total grande"><span>Total</span><span>${real(t.total)}</span></div>
      <button class="btn-principal" id="btnIrEntrega">Escolher entrega</button>
      <button class="btn-secundario" id="btnContinuar">Continuar comprando</button>`
      : `<button class="btn-principal" id="btnContinuar">Ver produtos</button>`;
  }

  if (passo === "entrega") {
    prepararData();
    $("rodapePainel").innerHTML = `
      <div class="linha-total grande"><span>Total</span><span>${real(t.total)}</span></div>
      <button class="btn-principal" id="btnEnviar">Enviar pedido</button>`;
  }

  if (passo === "ok") {
    $("rodapePainel").innerHTML = `<button class="btn-principal" id="btnContinuar">Voltar pra loja</button>`;
  }
}

// ---------------- data e horário ----------------
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dataDeISO(iso) { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); }
// fim da faixa "13:30 - 18:00" = 18:00 (se a faixa tiver um horário só, usa ele)
function minutosDoFim(faixa) {
  const horas = [...String(faixa).matchAll(/(\d{1,2}):(\d{2})/g)].slice(0, 2);
  const m = horas[horas.length - 1];
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}
// hoje: dá pra escolher a faixa que já começou, desde que ainda dê tempo de entregar antes dela acabar
function horarioDisponivel(dataIso, faixa) {
  if (dataIso !== hojeISO()) return true;
  const agora = new Date();
  return minutosDoFim(faixa) - (agora.getHours() * 60 + agora.getMinutes()) > ANTECEDENCIA_MIN;
}
function diaFechado(dataIso) {
  return (loja.config.diasSemEntrega || []).includes(dataDeISO(dataIso).getDay());
}

function prepararData() {
  const campo = $("fData");
  campo.min = hojeISO();
  if (!campo.value) {
    // sugere o primeiro dia com algum horário livre
    const d = new Date();
    for (let i = 0; i < 14; i++) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!diaFechado(iso) && loja.config.horarios.some(h => horarioDisponivel(iso, h))) { campo.value = iso; break; }
      d.setDate(d.getDate() + 1);
    }
  }
  montarHorarios();
}

function montarHorarios() {
  const iso = $("fData").value;
  const marcado = document.querySelector('input[name="horario"]:checked')?.value;
  const fechado = iso && diaFechado(iso);
  const campoData = $("fData").closest(".campo");
  campoData.classList.toggle("erro", !!fechado);
  campoData.querySelector(".msg").textContent = fechado ? `Não entregamos ${DIAS[dataDeISO(iso).getDay()]}. Escolha outro dia.` : "";

  $("horarios").innerHTML = loja.config.horarios.map(h => {
    const ok = iso && !fechado && horarioDisponivel(iso, h);
    return `<label class="${ok ? "" : "indisponivel"}"><input type="radio" name="horario" value="${escaparHtml(h)}" ${ok ? "" : "disabled"} ${ok && h === marcado ? "checked" : ""}>${escaparHtml(h)}</label>`;
  }).join("");
}

// ---------------- CEP (ViaCEP) ----------------
let ultimoCep = "";
async function buscarCep() {
  const campo = $("fCep");
  const digitos = campo.value.replace(/\D/g, "").slice(0, 8);
  campo.value = digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
  const caixa = campo.closest(".campo");
  const msg = caixa.querySelector(".msg");
  if (digitos.length < 8) { caixa.classList.remove("erro"); msg.textContent = "Digite o CEP que a gente completa o endereço"; ultimoCep = ""; return; }
  if (digitos === ultimoCep) return;
  ultimoCep = digitos;
  msg.textContent = "Buscando endereço...";
  try {
    const r = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
    const d = await r.json();
    if (digitos !== ultimoCep) return; // usuário já mudou o CEP
    if (d.erro) throw new Error("nao encontrado");
    $("fRua").value = d.logradouro || "";
    $("fBairro").value = d.bairro || "";
    $("fCidade").value = d.localidade || "";
    $("fUf").value = d.uf || "";
    caixa.classList.remove("erro");
    // CEP geral da cidade vem sem rua/bairro: deixa a pessoa preencher
    msg.textContent = d.logradouro ? "Endereço encontrado ✓" : "CEP geral da cidade: preencha a rua e o bairro";
    (d.logradouro ? $("fNumero") : $("fRua")).focus();
    ["fRua", "fBairro", "fCidade", "fUf"].forEach(id => $(id).closest(".campo").classList.remove("erro"));
  } catch (e) {
    if (digitos !== ultimoCep) return;
    caixa.classList.add("erro");
    msg.textContent = "CEP não encontrado. Confira ou preencha o endereço à mão.";
  }
}

// ---------------- validação e envio ----------------
function marcarErro(id, texto) {
  const caixa = $(id).closest(".campo");
  caixa.classList.add("erro");
  caixa.querySelector(".msg").textContent = texto;
}
function limparErros() {
  document.querySelectorAll("#viewEntrega .campo.erro").forEach(c => {
    c.classList.remove("erro");
    if (c.querySelector("#fCep")) return;
    const m = c.querySelector(".msg"); if (m) m.textContent = "";
  });
}

function validar() {
  limparErros();
  const erros = [];
  const obrig = { fNome: "Informe seu nome", fRua: "Informe a rua", fNumero: "Informe o número", fBairro: "Informe o bairro", fCidade: "Informe a cidade", fUf: "UF" };
  for (const [id, texto] of Object.entries(obrig)) if (!$(id).value.trim()) { marcarErro(id, texto); erros.push(id); }
  if ($("fTel").value.replace(/\D/g, "").length < 10) { marcarErro("fTel", "Telefone com DDD"); erros.push("fTel"); }
  if ($("fCep").value.replace(/\D/g, "").length !== 8) { marcarErro("fCep", "CEP com 8 números"); erros.push("fCep"); }
  const iso = $("fData").value;
  if (!iso || iso < hojeISO()) { marcarErro("fData", "Escolha uma data a partir de hoje"); erros.push("fData"); }
  else if (diaFechado(iso)) { marcarErro("fData", `Não entregamos ${DIAS[dataDeISO(iso).getDay()]}`); erros.push("fData"); }
  const h = document.querySelector('input[name="horario"]:checked');
  if (!h || !horarioDisponivel(iso, h.value)) { marcarErro("campoHorario", "Escolha um horário"); erros.push("campoHorario"); }
  if (erros.length) {
    const primeiro = $(erros[0]);
    primeiro.scrollIntoView({ behavior: "smooth", block: "center" });
    if (primeiro.focus) primeiro.focus({ preventScroll: true });
  }
  return erros.length === 0;
}

function trocoTxt(v) {
  const n = Number(String(v).replace(/[^\d,.]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? real(n) : v;
}

function montarMensagem(pedido) {
  const c = loja.config;
  const linhas = pedido.itens.map(i => `• ${i.qtd}x ${i.nome} (${i.detalhe}) — ${real(i.preco * i.qtd)}`);
  const e = pedido.entrega;
  const dataTxt = `${DIAS[dataDeISO(e.data).getDay()]}, ${e.data.split("-").reverse().join("/")}`;
  return [
    `*Resumo do pedido - ${c.nome}*`,
    ``,
    `*Cliente:* ${pedido.cliente.nome}`,
    `*Telefone:* ${pedido.cliente.telefone}`,
    ``,
    `*Itens:*`,
    ...linhas,
    ``,
    pedido.taxa > 0 ? `Taxa de entrega: ${real(pedido.taxa)}` : null,
    `*Total: ${real(pedido.total)}*`,
    ``,
    `*Entrega:* ${dataTxt}, das ${e.horario.replace(" - ", " às ")}`,
    `*Endereço:* ${e.rua}, ${e.numero}${e.complemento ? " - " + e.complemento : ""} - ${e.bairro}, ${e.cidade}/${e.uf} - CEP ${e.cep}`,
    ...(e.referencia ? [`*Referência:* ${e.referencia}`] : []),
    ``,
    `*Pagamento:* ${pedido.pagamento}${pedido.troco ? ` (troco para ${trocoTxt(pedido.troco)})` : ""}`,
    pedido.obs ? `*Obs:* ${pedido.obs}` : null,
  ].filter(l => l !== null).join("\n");
}

let enviando = false; // evita pedido em dobro se tocar duas vezes no botão
async function enviarPedido() {
  if (enviando || !validar()) return;
  const t = totais();
  if (!t.itens.length) { abrirPainel("itens"); return; }
  const pedido = {
    numero: Date.now().toString(36).toUpperCase(),
    criadoEm: new Date().toISOString(),
    cliente: { nome: $("fNome").value.trim(), telefone: $("fTel").value.trim() },
    itens: t.itens.map(({ p, qtd }) => ({ id: p.id, nome: p.nome, detalhe: p.detalhe, preco: p.preco, qtd })),
    taxa: t.taxa,
    total: t.total,
    entrega: {
      data: $("fData").value,
      horario: document.querySelector('input[name="horario"]:checked').value,
      cep: $("fCep").value, rua: $("fRua").value.trim(), numero: $("fNumero").value.trim(),
      complemento: $("fCompl").value.trim(), bairro: $("fBairro").value.trim(),
      cidade: $("fCidade").value.trim(), uf: $("fUf").value.trim().toUpperCase(), referencia: $("fRef").value.trim(),
    },
    pagamento: $("fPagamento").value,
    troco: $("fPagamento").value === "Dinheiro" ? $("fTroco").value.trim() : "",
    obs: $("fObs").value.trim(),
  };
  const texto = montarMensagem(pedido).replace(/\*/g, "");

  // o pedido vai direto pro banco: a loja vê no painel e recebe a notificação no celular
  const botao = $("btnEnviar");
  if (botao) { botao.disabled = true; botao.textContent = "Enviando pedido..."; }
  enviando = true;
  const { error } = await db.from("pedidos").insert({
    loja_id: loja.id, numero: pedido.numero, cliente: pedido.cliente, itens: pedido.itens,
    taxa: pedido.taxa, total: pedido.total, entrega: pedido.entrega,
    pagamento: pedido.pagamento, troco: pedido.troco, obs: pedido.obs,
  });
  enviando = false;
  if (error) {
    console.warn("Pedido não foi guardado no banco:", error.message);
    if (botao) { botao.disabled = false; botao.textContent = "Enviar pedido"; }
    avisar("Não conseguimos enviar o pedido. Confira a internet e tente de novo.");
    return;
  }

  carrinho = {};
  gravarCarrinho();
  passo = "ok";
  $("viewOk").innerHTML = `
    <div class="confirmado">
      <div class="grande">🐾</div>
      <h3>Pedido enviado!</h3>
      <p>A loja já recebeu seu pedido <b>${escaparHtml(pedido.numero)}</b>. Se precisar, ela fala com você pelo telefone que você informou.</p>
      <div class="resumo-pedido">${escaparHtml(texto)}</div>
    </div>`;
  montarPainel();
  atualizarTudo();
}

// ---------------- avisos ----------------
let timerAviso;
function avisar(texto) {
  const el = $("aviso");
  el.textContent = texto;
  el.classList.add("mostrar");
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => el.classList.remove("mostrar"), 1600);
}

function atualizarTudo() {
  montarGrade();
  atualizarBarra();
  if (painelAberto() && passo === "itens") montarPainel();
}

// ---------------- eventos ----------------
document.addEventListener("click", ev => {
  const mais = ev.target.closest("[data-mais]");
  const menos = ev.target.closest("[data-menos]");
  const chip = ev.target.closest("[data-cat]");
  const botaoBanner = ev.target.closest("[data-banner-cat]");
  const ponto = ev.target.closest("[data-slide]");
  if (botaoBanner) {
    // botão do banner leva pra uma categoria (ou promoções) da vitrine
    const cat = botaoBanner.dataset.bannerCat;
    categoriaAtiva = document.querySelector(`#chips [data-cat="${CSS.escape(cat)}"]`) ? cat : "Todos";
    montarChips(); montarGrade();
    $("chips").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (ponto) { irParaSlide(Number(ponto.dataset.slide)); return; }
  if (mais) mudarQtd(mais.dataset.mais, +1);
  else if (menos) mudarQtd(menos.dataset.menos, -1);
  else if (chip) { categoriaAtiva = chip.dataset.cat; montarChips(); montarGrade(); }
  else if (ev.target.closest("#btnIrEntrega")) { passo = "entrega"; montarPainel(); $("viewEntrega").scrollTop = 0; }
  else if (ev.target.closest("#btnContinuar")) fecharPainel();
  else if (ev.target.closest("#btnEnviar")) enviarPedido();
});
// telefone vai sendo formatado: (54) 99999-9999
$("fTel").addEventListener("input", ev => {
  const d = ev.target.value.replace(/\D/g, "").slice(0, 11);
  let t = d;
  if (d.length > 2) t = `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length > 6) t = `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  ev.target.value = t;
});
$("btnCarrinhoTopo").onclick = () => abrirPainel("itens");
$("btnBarra").onclick = () => abrirPainel("itens");
$("btnFechar").onclick = fecharPainel;
$("fundo").onclick = fecharPainel;
$("btnVoltar").onclick = () => { passo = "itens"; montarPainel(); };
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && painelAberto()) fecharPainel(); });
$("busca").addEventListener("input", ev => { termoBusca = ev.target.value; montarGrade(); });
$("fCep").addEventListener("input", buscarCep);
$("fData").addEventListener("change", montarHorarios);
$("horarios").addEventListener("change", () => $("campoHorario").classList.remove("erro"));
$("fPagamento").addEventListener("change", ev => $("campoTroco").classList.toggle("oculto", ev.target.value !== "Dinheiro"));
$("viewEntrega").addEventListener("submit", ev => { ev.preventDefault(); enviarPedido(); });
$("viewEntrega").addEventListener("input", ev => {
  const c = ev.target.closest(".campo");
  if (c && c.classList.contains("erro") && ev.target.id !== "fCep") { c.classList.remove("erro"); c.querySelector(".msg").textContent = ""; }
});
// ---------------- início ----------------
function montarTudo() {
  montarTopo();
  montarChips();
  atualizarTudo();
}
async function carregarDoBanco() {
  try {
    const v = await buscarVitrine(SLUG);
    if (v) { loja = v; estadoCarga = "ok"; }
    else { estadoCarga = "sem-loja"; loja.produtos = []; }
  } catch (e) {
    console.warn("Não deu pra buscar a loja:", e.message || e);
    if (estadoCarga !== "ok") estadoCarga = "erro"; // sem internet e sem cópia guardada
  }
  montarTudo();
}
montarTudo();
carregarDoBanco();
// voltou pro app depois de um tempo? busca preços/banners atualizados
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") carregarDoBanco(); });
