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
let passo = "itens";               // itens | entrega | ok | pedidos

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
// ---------------- taxa de entrega (normal ou por dia/horário) ----------------
function minutosDe(txt) { const m = String(txt || "").match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
function temTaxasEspeciais() { return (loja.config.taxasEspeciais || []).length > 0; }
// vale a 1ª regra que bate com o dia da semana e o horário (início da faixa escolhida); senão, a taxa normal
function taxaPara(dataIso, faixa) {
  const normal = Number(loja.config.taxaEntrega || 0);
  if (!dataIso || !faixa) return normal;
  const dia = dataDeISO(dataIso).getDay();
  const ini = minutosDe(faixa) ?? 0;
  const regra = (loja.config.taxasEspeciais || []).find(r =>
    (!r.dias?.length || r.dias.includes(dia)) && ini >= (minutosDe(r.de) ?? 0) && ini < (minutosDe(r.ate) ?? 24 * 60));
  return regra ? Math.max(0, Number(regra.valor) || 0) : normal;
}
function entregaEscolhida() {
  const campo = document.getElementById("fData");
  return { iso: campo ? campo.value : "", faixa: document.querySelector('input[name="horario"]:checked')?.value || "" };
}
function rodapeEntrega() {
  const t = totais();
  const { faixa } = entregaEscolhida();
  const taxaTxt = t.taxa > 0 ? real(t.taxa) : (faixa || !temTaxasEspeciais() ? "Grátis" : "escolha o horário");
  $("rodapePainel").innerHTML = `
    <div class="linha-total"><span>Taxa de entrega</span><span>${taxaTxt}</span></div>
    <div class="linha-total grande"><span>Total</span><span>${real(t.total)}</span></div>
    <button class="btn-principal" id="btnEnviar">Enviar pedido</button>`;
}

function totais() {
  const itens = itensDoCarrinho();
  const qtd = itens.reduce((s, i) => s + i.qtd, 0);
  const subtotal = itens.reduce((s, i) => s + i.qtd * i.p.preco, 0);
  const economia = itens.reduce((s, i) => s + (emPromocao(i.p) ? i.qtd * (i.p.precoDe - i.p.preco) : 0), 0);
  const { iso, faixa } = entregaEscolhida();
  const taxa = qtd > 0 ? taxaPara(iso, faixa) : 0;
  return { itens, qtd, subtotal, economia, taxa, total: subtotal + taxa };
}
function limiteDe(p) { return p && p.estoque != null ? Math.max(0, p.estoque) : Infinity; }
function mudarQtd(id, delta) {
  const p = produtoPorId(id);
  if (delta > 0 && (carrinho[id] || 0) + delta > limiteDe(p)) {
    avisar(limiteDe(p) > 0 ? `Só temos ${limiteDe(p)} em estoque` : "Produto esgotado");
    return;
  }
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
  if (loja.id) { // nome do ícone no celular = o que a loja escolheu; o app instalado abre direto nesta loja
    const nomeApp = nomeDoApp(c);
    aplicarNomeDoApp({ nome: nomeApp, curto: nomeApp, inicio: "index.html?loja=" + encodeURIComponent(loja.slug),
      id: "?app=loja&loja=" + encodeURIComponent(loja.slug), escopo: "", icones: "loja", cor: c.corPrincipal, icone: c.icone || "" });
  }
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
    const limite = limiteDe(p);
    const esgotado = limite <= 0;
    const botao = qtd
      ? `<div class="passo"><button data-menos="${p.id}" aria-label="Diminuir">−</button><span>${qtd}</span><button data-mais="${p.id}" aria-label="Aumentar" ${qtd >= limite ? "disabled" : ""}>+</button></div>`
      : esgotado ? `<button class="btn-add" disabled>Esgotado</button>`
      : `<button class="btn-add" data-mais="${p.id}">Adicionar</button>`;
    const restam = !esgotado && limite <= 5 ? `<div class="restam">Só ${limite === 1 ? "resta 1" : `restam ${limite}`}</div>` : "";
    return `
      <article class="produto ${esgotado ? "esgotado" : ""}" data-produto="${p.id}">
        <button class="btn-compartilhar-prod" data-compartilhar="${p.id}" aria-label="Compartilhar ${escaparHtml(p.nome)}" title="Compartilhar">📤</button>
        ${promo ? `<span class="selo">-${descontoPct(p)}%</span>` : ""}
        <div class="foto">${foto}</div>
        <div class="info">
          <div class="nome">${escaparHtml(p.nome)}</div>
          <div class="detalhe">${escaparHtml(p.detalhe)}</div>
          <div class="precos">
            ${promo ? `<div class="preco-de">de ${real(p.precoDe)}</div>` : ""}
            <div class="preco ${promo ? "promo" : ""}">${promo ? "por " : ""}${real(p.preco)}</div>
          </div>
          ${restam}
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
  if (passo === "ok" || passo === "pedidos") passo = "itens";
  atualizarBarra();
}

function montarPainel() {
  $("viewItens").classList.toggle("oculto", passo !== "itens");
  $("viewEntrega").classList.toggle("oculto", passo !== "entrega");
  $("viewOk").classList.toggle("oculto", passo !== "ok");
  $("viewPedidos").classList.toggle("oculto", passo !== "pedidos");
  $("btnVoltar").classList.toggle("oculto", passo !== "entrega");
  $("painelTitulo").textContent = { itens: "Seu carrinho", entrega: "Entrega", ok: "Pedido enviado", pedidos: "Meus pedidos" }[passo];

  const t = totais();
  if (passo === "itens") {
    $("viewItens").innerHTML = t.itens.length ? t.itens.map(({ p, qtd }) => `
      <div class="item-carrinho">
        <div class="mini">${p.foto ? `<img src="${escaparHtml(p.foto)}" alt="">` : iconeDe(p.categoria)}</div>
        <div class="meio">
          <div class="nome">${escaparHtml(p.nome)}</div>
          <div class="sub">${escaparHtml(p.detalhe)} · ${real(p.preco)} cada</div>
          <div class="passo"><button data-menos="${p.id}" aria-label="Diminuir">−</button><span>${qtd}</span><button data-mais="${p.id}" aria-label="Aumentar" ${qtd >= limiteDe(p) ? "disabled" : ""}>+</button></div>
        </div>
        <div class="total-item">${real(p.preco * qtd)}</div>
      </div>`).join("")
      : `<div class="vazio">Seu carrinho está vazio.<br>Que tal dar uma olhada nas rações? 🐶🐱</div>`;

    $("rodapePainel").innerHTML = t.itens.length ? `
      ${t.economia > 0 ? `<div class="linha-total" style="color:var(--laranja)"><span>Você economiza</span><span>${real(t.economia)}</span></div>` : ""}
      ${temTaxasEspeciais()
        ? `<div class="linha-total"><span>Taxa de entrega</span><span style="font-size:13px">conforme dia e horário</span></div>`
        : t.taxa > 0 ? `<div class="linha-total"><span>Taxa de entrega</span><span>${real(t.taxa)}</span></div>` : ""}
      <div class="linha-total grande"><span>${temTaxasEspeciais() ? "Produtos" : "Total"}</span><span>${real(temTaxasEspeciais() ? t.subtotal : t.total)}</span></div>
      <button class="btn-principal" id="btnIrEntrega">Escolher entrega</button>
      <button class="btn-secundario" id="btnContinuar">Continuar comprando</button>`
      : `<button class="btn-principal" id="btnContinuar">Ver produtos</button>`;
  }

  if (passo === "entrega") {
    prepararData();
    rodapeEntrega();
  }

  if (passo === "ok") {
    $("rodapePainel").innerHTML = `
      <button class="btn-principal" id="btnContinuar">Voltar pra loja</button>
      <button class="btn-secundario" id="btnAcompanhar">📋 Acompanhar meus pedidos</button>`;
  }

  if (passo === "pedidos") {
    montarMeusPedidos();
    $("rodapePainel").innerHTML = `<button class="btn-secundario" id="btnContinuar">Voltar pra loja</button>`;
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
    const frete = temTaxasEspeciais() && ok ? taxaPara(iso, h) : null;
    const freteTxt = frete == null ? "" : `<small class="frete-faixa">${frete > 0 ? "frete " + real(frete) : "frete grátis"}</small>`;
    return `<label class="${ok ? "" : "indisponivel"}"><input type="radio" name="horario" value="${escaparHtml(h)}" ${ok ? "" : "disabled"} ${ok && h === marcado ? "checked" : ""}>${escaparHtml(h)}${freteTxt}</label>`;
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
    codigo: crypto.randomUUID(), // código secreto: só este celular consegue acompanhar o pedido
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
    loja_id: loja.id, codigo: pedido.codigo, numero: pedido.numero, cliente: pedido.cliente, itens: pedido.itens,
    taxa: pedido.taxa, total: pedido.total, entrega: pedido.entrega,
    pagamento: pedido.pagamento, troco: pedido.troco, obs: pedido.obs,
  });
  enviando = false;
  if (error && /ESTOQUE_INSUFICIENTE/.test(error.message || "")) {
    const qual = (error.message.match(/ESTOQUE_INSUFICIENTE:\s*(.+?)\s*\(/) || [])[1] || "Um produto";
    if (botao) { botao.disabled = false; botao.textContent = "Enviar pedido"; }
    await carregarDoBanco(); // pega o estoque atual e ajusta o carrinho
    passo = "itens"; montarPainel();
    avisar(`${qual} acabou de esgotar ou não tem essa quantidade. Confira o carrinho.`);
    return;
  }
  if (error) {
    console.warn("Pedido não foi guardado no banco:", error.message);
    if (botao) { botao.disabled = false; botao.textContent = "Enviar pedido"; }
    avisar("Não conseguimos enviar o pedido. Confira a internet e tente de novo.");
    return;
  }

  guardarMeuPedido({
    codigo: pedido.codigo, numero: pedido.numero, criadoEm: pedido.criadoEm, total: pedido.total, taxa: pedido.taxa,
    itens: pedido.itens, entrega: { data: pedido.entrega.data, horario: pedido.entrega.horario },
  });
  carrinho = {};
  gravarCarrinho();
  passo = "ok";
  $("viewOk").innerHTML = `
    <div class="confirmado">
      <div class="grande">🐾</div>
      <h3>Pedido enviado!</h3>
      <p>A loja já recebeu seu pedido <b>${escaparHtml(pedido.numero)}</b>. Se precisar, ela fala com você pelo telefone que você informou.</p>
      <p class="ajuda" style="margin:0">Acompanhe a situação em <b>📋 Meus pedidos</b>, no topo da loja.</p>
      <div class="resumo-pedido">${escaparHtml(texto)}</div>
    </div>`;
  montarPainel();
  atualizarTudo();
}

// ---------------- meus pedidos (sem conta: guardados neste celular) ----------------
const CHAVE_MEUS = "agropet_meus_pedidos_" + SLUG;
let statusPedidos = {};   // codigo -> situação atual vinda da loja
let timerPedidos = null;
const ROTULO_STATUS = { novo: ["st-recebido", "Recebido"], confirmado: ["st-confirmado", "Confirmado"], entregue: ["st-entregue", "Entregue"], cancelado: ["st-cancelado", "Cancelado"] };

function lerMeusPedidos() { try { return JSON.parse(localStorage.getItem(CHAVE_MEUS)) || []; } catch (e) { return []; } }
function guardarMeuPedido(p) {
  const lista = [p, ...lerMeusPedidos().filter(x => x.codigo !== p.codigo)].slice(0, 50);
  try { localStorage.setItem(CHAVE_MEUS, JSON.stringify(lista)); } catch (e) { /* sem espaço: segue */ }
  atualizarBotaoPedidos();
}
function atualizarBotaoPedidos() {
  const lista = lerMeusPedidos();
  $("btnMeusPedidos").classList.toggle("oculto", !lista.length);
  const andamento = lista.filter(p => ["novo", "confirmado"].includes(statusPedidos[p.codigo]?.status || "novo")).length;
  $("pontoPedidos").classList.toggle("oculto", !andamento);
}
// pergunta pra loja a situação dos pedidos deste celular (só devolve os que têm o código)
async function atualizarStatusPedidos() {
  const lista = lerMeusPedidos();
  if (!lista.length) return;
  try {
    const { data, error } = await db.rpc("meus_pedidos", { p_codigos: lista.map(p => p.codigo) });
    if (error) throw error;
    statusPedidos = Object.fromEntries((data || []).map(r => [r.codigo, r]));
  } catch (e) { console.warn("Não deu pra atualizar os pedidos:", e.message || e); }
  atualizarBotaoPedidos();
  if (painelAberto() && passo === "pedidos") montarMeusPedidos();
}
function abrirMeusPedidos() {
  abrirPainel("pedidos");
  atualizarStatusPedidos();
  clearInterval(timerPedidos);
  timerPedidos = setInterval(() => {
    if (painelAberto() && passo === "pedidos") atualizarStatusPedidos(); else clearInterval(timerPedidos);
  }, 20000);
}
function linhaDoTempo(st) {
  if (st === "cancelado") return `<div class="linha-tempo cancelado">Este pedido foi cancelado pela loja.</div>`;
  const etapas = [["novo", "Recebido"], ["confirmado", "Confirmado"], ["entregue", "Entregue"]];
  const atual = etapas.findIndex(([k]) => k === st);
  return `<div class="linha-tempo">${etapas.map(([, t], i) => `<span class="${i <= atual ? "feito" : ""}">${t}</span>`).join("")}</div>`;
}
function montarMeusPedidos() {
  const lista = lerMeusPedidos();
  $("viewPedidos").innerHTML = lista.length ? lista.map(p => {
    const b = statusPedidos[p.codigo];
    const st = b?.status || "novo";
    const [classe, texto] = ROTULO_STATUS[st] || ["st-recebido", st];
    const itens = b?.itens || p.itens || [];
    const quando = new Date(b?.criado_em || p.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const dataEnt = String(b?.entrega_data || p.entrega?.data || "").split("-").reverse().join("/");
    const hor = b?.entrega_horario || p.entrega?.horario || "";
    return `<div class="meu-pedido">
      <div class="cab"><b>Pedido ${escaparHtml(p.numero)}</b><span class="status-cli ${classe}">${texto}</span></div>
      <div class="sub">Feito em ${quando}${dataEnt ? ` · entrega ${dataEnt}${hor ? ", " + escaparHtml(hor) : ""}` : ""}</div>
      ${linhaDoTempo(st)}
      <ul>${itens.map(i => `<li>${Number(i.qtd)}x ${escaparHtml(i.nome)}${i.detalhe ? ` (${escaparHtml(i.detalhe)})` : ""}</li>`).join("")}</ul>
      <div class="rodape-pedido"><span>Total <b>${real(Number(b?.total ?? p.total))}</b></span>
        <button class="btn-secundario" data-repetir="${escaparHtml(p.codigo)}">🔁 Pedir de novo</button></div>
    </div>`;
  }).join("") : `<div class="vazio">Você ainda não fez pedidos neste celular.</div>`;
}
// coloca os mesmos itens no carrinho (preço e estoque de hoje)
function pedirDeNovo(codigo) {
  const p = lerMeusPedidos().find(x => x.codigo === codigo);
  const itens = statusPedidos[codigo]?.itens || p?.itens || [];
  let colocados = 0;
  const faltaram = [];
  for (const i of itens) {
    const prod = produtoPorId(i.id);
    if (!prod || limiteDe(prod) <= 0) { faltaram.push(i.nome); continue; }
    carrinho[prod.id] = Math.max(carrinho[prod.id] || 0, Math.min(Number(i.qtd) || 1, limiteDe(prod)));
    colocados++;
  }
  gravarCarrinho();
  atualizarTudo();
  if (!colocados) { avisar("Esses produtos não estão disponíveis agora"); return; }
  passo = "itens"; montarPainel();
  avisar(faltaram.length ? `Indisponível agora: ${faltaram.join(", ")}` : "Itens colocados no carrinho");
}

// ---------------- compartilhar a loja ou um produto ----------------
async function abrirCompartilhar(titulo, texto, url) {
  if (await compartilharNativo(titulo, texto, url)) return;
  $("tituloCompartilhar").textContent = titulo;
  $("folhaTexto").textContent = texto;
  $("folhaLink").value = url;
  $("folhaWhats").href = linkWhatsApp(texto + " " + url);
  $("folhaCompartilhar").classList.remove("oculto");
}
function fecharFolha() { $("folhaCompartilhar").classList.add("oculto"); }
function compartilharLoja() {
  const nome = loja.config.nome || "nossa loja";
  abrirCompartilhar(`Compartilhar ${nome}`, `Peça ração, petiscos e acessórios na ${nome} pelo app, com entrega em casa:`, linkDaLoja(SLUG));
}
function compartilharProduto(id) {
  const p = produtoPorId(id);
  if (!p) return;
  abrirCompartilhar(`Compartilhar produto`, `Olha esse produto na ${loja.config.nome}: ${p.nome}${p.detalhe ? " " + p.detalhe : ""} por ${real(p.preco)}`, linkDaLoja(SLUG, p.id));
}
// abriu por link de um produto: rola até ele e destaca
let produtoDoLink = new URLSearchParams(location.search).get("p");
function mostrarProdutoDoLink() {
  if (!produtoDoLink || estadoCarga !== "ok") return;
  const id = produtoDoLink;
  produtoDoLink = null;
  if (!produtoPorId(id)) { avisar("Esse produto não está mais disponível"); return; }
  if (categoriaAtiva !== "Todos" || termoBusca) { categoriaAtiva = "Todos"; termoBusca = ""; $("busca").value = ""; montarChips(); montarGrade(); }
  const el = document.querySelector(`[data-produto="${CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("destaque");
  setTimeout(() => el.classList.remove("destaque"), 2600);
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
  const comp = ev.target.closest("[data-compartilhar]");
  if (comp) { compartilharProduto(comp.dataset.compartilhar); return; }
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
  else if (ev.target.closest("#btnAcompanhar")) abrirMeusPedidos();
  else if (ev.target.closest("[data-repetir]")) pedirDeNovo(ev.target.closest("[data-repetir]").dataset.repetir);
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
$("btnMeusPedidos").onclick = () => abrirMeusPedidos();
$("btnCompartilhar").onclick = compartilharLoja;
$("btnFecharFolha").onclick = fecharFolha;
$("folhaCompartilhar").onclick = ev => { if (ev.target === $("folhaCompartilhar")) fecharFolha(); };
$("folhaCopiar").onclick = async () => avisar(await copiarTexto($("folhaLink").value) ? "Link copiado! É só colar onde quiser" : "Não deu pra copiar: segure no link e copie");
$("btnBarra").onclick = () => abrirPainel("itens");
$("btnFechar").onclick = fecharPainel;
$("fundo").onclick = fecharPainel;
$("btnVoltar").onclick = () => { passo = "itens"; montarPainel(); };
document.addEventListener("keydown", ev => {
  if (ev.key !== "Escape") return;
  if (!$("folhaCompartilhar").classList.contains("oculto")) fecharFolha();
  else if (painelAberto()) fecharPainel();
});
$("busca").addEventListener("input", ev => { termoBusca = ev.target.value; montarGrade(); });
$("fCep").addEventListener("input", buscarCep);
$("fData").addEventListener("change", montarHorarios);
// trocou o dia ou o horário: atualiza a taxa e o total
$("viewEntrega").addEventListener("change", ev => {
  if (passo === "entrega" && (ev.target.name === "horario" || ev.target.id === "fData")) rodapeEntrega();
});
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
// produto esgotou ou baixou o estoque enquanto estava no carrinho: corrige e avisa
function ajustarCarrinhoAoEstoque() {
  let mudou = false;
  for (const [id, qtd] of Object.entries(carrinho)) {
    const lim = limiteDe(produtoPorId(id));
    if (qtd > lim) { if (lim > 0) carrinho[id] = lim; else delete carrinho[id]; mudou = true; }
  }
  if (mudou) { gravarCarrinho(); avisar("Alguns itens do carrinho esgotaram e foram ajustados"); }
  return mudou;
}
async function carregarDoBanco() {
  try {
    const v = await buscarVitrine(SLUG);
    if (v) { loja = v; estadoCarga = "ok"; ajustarCarrinhoAoEstoque(); }
    else { estadoCarga = "sem-loja"; loja.produtos = []; }
  } catch (e) {
    console.warn("Não deu pra buscar a loja:", e.message || e);
    if (estadoCarga !== "ok") estadoCarga = "erro"; // sem internet e sem cópia guardada
  }
  montarTudo();
  mostrarProdutoDoLink();
}
montarTudo();
carregarDoBanco();
atualizarBotaoPedidos();
atualizarStatusPedidos();
// voltou pro app depois de um tempo? busca preços/banners atualizados
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") carregarDoBanco(); });
