// Camada de dados do app. Por enquanto tudo fica no navegador (localStorage),
// pra testar sem servidor. Quando a loja for pro ar, so este arquivo muda:
// as funcoes carregarLoja()/salvarLoja() passam a ler/gravar num lugar central
// (planilha Google ou banco), e o resto do app continua igual.

const CHAVE_LOJA = "agropet_loja_v1";

const LOJA_INICIAL = {
  config: {
    nome: "Agro Pet",
    logo: "",                // imagem do logo no topo (vazio = patinha)
    corPrincipal: "#2f6b3a", // cor da loja (topo, botões, destaques)
    whatsapp: "",            // so numeros, com DDD. Ex: 54999998888
    // capa: banners em carrossel, cada um com imagem/cor, textos, posição e botão
    banners: [
      { id: "b1", ativo: true, img: "", enquadramento: "center", escurecer: true, cor: "#2f6b3a",
        titulo: "Tudo pro seu cão e gato", sub: "Ração, petiscos e acessórios com entrega na sua casa",
        posicao: "baixo-esquerda", corTexto: "claro", tamanho: "m", botaoTexto: "", botaoCategoria: "" },
      { id: "b2", ativo: true, img: "", enquadramento: "center", escurecer: true, cor: "#e0742b",
        titulo: "Promoções da semana", sub: "Rações selecionadas com desconto",
        posicao: "meio-centro", corTexto: "claro", tamanho: "m", botaoTexto: "Ver promoções", botaoCategoria: "Promoções" },
    ],
    alturaBanner: "media",   // baixa | media | alta
    trocaBanner: 5,          // segundos entre banners (0 = não troca sozinho)
    mostrarPromocoes: true,  // filtro "Promoções" na vitrine
    textoBusca: "Buscar ração, petisco, areia...",
    horarios: ["08:00 - 10:00", "10:00 - 12:00", "13:30 - 15:30", "15:30 - 18:00"],
    diasSemEntrega: [0],     // 0 = domingo ... 6 = sábado
    taxaEntrega: 0,
  },
  produtos: [
    { id: "p1", nome: "Ração Premium Cães Adultos Frango e Arroz", detalhe: "15 kg", categoria: "Cachorro", preco: 189.9, precoDe: 219.9, foto: "", ativo: true },
    { id: "p2", nome: "Ração Cães Filhotes Raças Pequenas", detalhe: "3 kg", categoria: "Cachorro", preco: 72.5, precoDe: null, foto: "", ativo: true },
    { id: "p3", nome: "Ração Cães Adultos Carne", detalhe: "20 kg", categoria: "Cachorro", preco: 139.9, precoDe: null, foto: "", ativo: true },
    { id: "p4", nome: "Ração Gatos Castrados Salmão", detalhe: "10,1 kg", categoria: "Gato", preco: 249.0, precoDe: 279.0, foto: "", ativo: true },
    { id: "p5", nome: "Ração Gatos Filhotes", detalhe: "1 kg", categoria: "Gato", preco: 38.9, precoDe: null, foto: "", ativo: true },
    { id: "p6", nome: "Sachê Gatos Adultos Peixe", detalhe: "85 g", categoria: "Gato", preco: 3.49, precoDe: null, foto: "", ativo: true },
    { id: "p7", nome: "Bifinho Sabor Carne", detalhe: "500 g", categoria: "Petiscos", preco: 24.9, precoDe: 29.9, foto: "", ativo: true },
    { id: "p8", nome: "Areia Higiênica Grãos Finos", detalhe: "4 kg", categoria: "Gato", preco: 19.9, precoDe: null, foto: "", ativo: true },
    { id: "p9", nome: "Coleira Ajustável Nylon", detalhe: "Tam. M", categoria: "Acessórios", preco: 29.0, precoDe: null, foto: "", ativo: true },
    { id: "p10", nome: "Comedouro Inox Antiderrapante", detalhe: "700 ml", categoria: "Acessórios", preco: 34.9, precoDe: null, foto: "", ativo: true },
  ],
};

function carregarLoja() {
  try {
    const salvo = localStorage.getItem(CHAVE_LOJA);
    if (salvo) {
      const dados = JSON.parse(salvo);
      const cfg = dados.config || {};
      // versão antiga tinha um banner só (bannerImg/bannerTitulo): vira o 1º banner da lista
      if (!cfg.banners && ("bannerImg" in cfg || "bannerTitulo" in cfg)) {
        cfg.banners = [{ ...LOJA_INICIAL.config.banners[0], img: cfg.bannerImg || "",
          titulo: cfg.bannerComTexto === false ? "" : (cfg.bannerTitulo || ""),
          sub: cfg.bannerComTexto === false ? "" : (cfg.bannerSub || "") }];
      }
      ["bannerImg", "bannerTitulo", "bannerSub", "bannerComTexto"].forEach(k => delete cfg[k]);
      return { config: { ...JSON.parse(JSON.stringify(LOJA_INICIAL.config)), ...cfg }, produtos: dados.produtos || [] };
    }
  } catch (e) { /* sem acesso ao armazenamento: usa os dados iniciais */ }
  return JSON.parse(JSON.stringify(LOJA_INICIAL));
}

function salvarLoja(loja) {
  try {
    localStorage.setItem(CHAVE_LOJA, JSON.stringify(loja));
    return true;
  } catch (e) {
    return false; // geralmente: foto grande demais pro armazenamento do navegador
  }
}

function emPromocao(p) {
  return p.precoDe != null && Number(p.precoDe) > Number(p.preco);
}

function descontoPct(p) {
  return Math.round((1 - p.preco / p.precoDe) * 100);
}

const fmtReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function real(v) { return fmtReal.format(v || 0); }

const ICONE_CATEGORIA = { Cachorro: "🐶", Gato: "🐱", Petiscos: "🦴", Acessórios: "🎾" };
function iconeDe(cat) { return ICONE_CATEGORIA[cat] || "🐾"; }

function escaparHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------- capa (usado pela loja e pela prévia do painel) ----------------
const ALTURAS_BANNER = { baixa: "3 / 1", media: "16 / 7", alta: "16 / 9" };

function novoBanner() {
  return { id: "b" + Date.now().toString(36), ativo: true, img: "", enquadramento: "center", escurecer: true,
    cor: "#2f6b3a", titulo: "Novo banner", sub: "", posicao: "meio-centro", corTexto: "claro",
    tamanho: "m", botaoTexto: "", botaoCategoria: "" };
}

function htmlBanner(b) {
  const [v, h] = String(b.posicao || "baixo-esquerda").split("-");
  const classes = ["slide", `v-${v}`, `h-${h}`, `txt-${b.corTexto || "claro"}`, `tam-${b.tamanho || "m"}`];
  if (b.img && b.escurecer !== false && (b.titulo || b.sub)) classes.push("escurecido");
  const cor = /^#[0-9a-f]{6}$/i.test(b.cor || "") ? b.cor : "#2f6b3a";
  const fundo = b.img ? "" : `background: linear-gradient(120deg, ${cor} 0%, ${misturar(cor, "#ffffff", 0.35)} 100%);`;
  const img = b.img ? `<img src="${escaparHtml(b.img)}" alt="" style="object-position:center ${escaparHtml(b.enquadramento || "center")}">` : "";
  const temTexto = b.titulo || b.sub || b.botaoTexto;
  return `<div class="${classes.join(" ")}" style="${fundo}">${img}${temTexto ? `
    <div class="textos">
      ${b.titulo ? `<h2>${escaparHtml(b.titulo)}</h2>` : ""}
      ${b.sub ? `<p>${escaparHtml(b.sub)}</p>` : ""}
      ${b.botaoTexto ? `<button type="button" class="btn-banner" data-banner-cat="${escaparHtml(b.botaoCategoria || "Todos")}">${escaparHtml(b.botaoTexto)}</button>` : ""}
    </div>` : ""}</div>`;
}

// ---------------- cor da loja ----------------
function misturar(hex, com, peso) {
  const a = hex.match(/\w\w/g).map(x => parseInt(x, 16));
  const b = com.match(/\w\w/g).map(x => parseInt(x, 16));
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * peso).toString(16).padStart(2, "0")).join("");
}
function aplicarTema(cor) {
  if (!/^#[0-9a-f]{6}$/i.test(cor || "")) return;
  const raiz = document.documentElement.style;
  raiz.setProperty("--verde", cor);
  raiz.setProperty("--verde-escuro", misturar(cor, "#000000", 0.25));
  raiz.setProperty("--verde-claro", misturar(cor, "#ffffff", 0.88));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", cor);
}
