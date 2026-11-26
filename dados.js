// Camada de dados do app: conversa com o banco central (Supabase).
// A chave abaixo é a "publishable" (pública, feita pra ficar no navegador):
// quem decide o que cada um pode ver/alterar são as regras de segurança do banco
// (ver banco/01_estrutura.sql). Nenhuma senha ou chave secreta fica aqui.

const SUPA_URL = "https://qnashukesmcbqojwqock.supabase.co";
const SUPA_CHAVE = "sb_publishable_ndy5gd7lxlkEKtHtbsF72A_z_MhqQb1";
const db = window.supabase.createClient(SUPA_URL, SUPA_CHAVE, {
  auth: { storageKey: "agropet_sessao", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const LOJA_PADRAO = "agro-pet"; // loja aberta quando o link não diz qual

// configuração que toda loja nova recebe (e que completa o que faltar numa loja antiga)
const CONFIG_PADRAO = {
  logo: "",                // imagem do logo no topo (vazio = patinha)
  corPrincipal: "#2f6b3a", // cor da loja (topo, botões, destaques)
  whatsapp: "",            // só números, com DDD. Ex: 54999998888
  banners: [
    { id: "b1", ativo: true, img: "", enquadramento: "center", escurecer: true, cor: "#2f6b3a",
      titulo: "Tudo pro seu cão e gato", sub: "Ração, petiscos e acessórios com entrega na sua casa",
      posicao: "baixo-esquerda", corTexto: "claro", tamanho: "m", botaoTexto: "", botaoCategoria: "" },
  ],
  alturaBanner: "media",   // baixa | media | alta
  trocaBanner: 5,          // segundos entre banners (0 = não troca sozinho)
  mostrarPromocoes: true,  // filtro "Promoções" na vitrine
  textoBusca: "Buscar ração, petisco, areia...",
  horarios: ["08:00 - 10:00", "10:00 - 12:00", "13:30 - 15:30", "15:30 - 18:00"],
  diasSemEntrega: [0],     // 0 = domingo ... 6 = sábado
  taxaEntrega: 0,
  taxasEspeciais: [],        // [{ dias: [0..6] (vazio = todos), de: "19:00", ate: "", valor: 10 }]
};
function copia(o) { return JSON.parse(JSON.stringify(o)); }

// ---------------- conversão banco <-> app ----------------
function produtoDoBanco(r) {
  return { id: r.id, nome: r.nome, detalhe: r.detalhe || "", categoria: r.categoria || "Outros",
    preco: Number(r.preco), precoDe: r.preco_de == null ? null : Number(r.preco_de),
    foto: r.foto || "", ativo: r.ativo, ordem: r.ordem || 0,
    estoque: r.estoque == null ? null : Number(r.estoque), // null = a loja não controla estoque desse produto
    estoqueMinimo: Number(r.estoque_minimo || 0) };
}
function produtoParaBanco(p, lojaId) {
  return { loja_id: lojaId, nome: p.nome, detalhe: p.detalhe || "", categoria: p.categoria || "Outros",
    preco: p.preco, preco_de: p.precoDe ?? null, foto: p.foto || "", ativo: !!p.ativo, ordem: p.ordem || 0 };
}
function lojaDoBanco(r) {
  return { id: r.id, slug: r.slug, ativa: r.ativa, config: { ...copia(CONFIG_PADRAO), ...(r.config || {}), nome: r.nome } };
}
function configParaBanco(config) {
  const { nome, ...resto } = config; // o nome fica numa coluna própria
  return resto;
}

// ---------------- nome do app no celular (embaixo do ícone da tela inicial) ----------------
function nomeDoApp(config) { return String(config.nomeApp || config.nome || "").trim(); }
let ultimoManifesto = "";
// troca o nome (e o endereço de abertura) que o celular usa ao instalar o app.
// opc: { nome, curto, inicio, id, escopo, icones: "loja" | "painel", cor }
function aplicarNomeDoApp(opc) {
  if (!opc.curto) return;
  const base = location.origin + location.pathname.replace(/[^/]*$/, "");
  document.querySelectorAll('meta[name="apple-mobile-web-app-title"], meta[name="application-name"]')
    .forEach(m => m.setAttribute("content", opc.curto)); // iPhone usa esse
  const icones = opc.icone // ícone montado no painel (cor/logo da loja)
    ? ["any", "maskable"].map(purpose => ({ src: opc.icone, sizes: "512x512", type: "image/png", purpose }))
    : [192, 512].flatMap(t => ["any", "maskable"].map(purpose =>
      ({ src: `${base}icones/${opc.icones}-${t}.png`, sizes: `${t}x${t}`, type: "image/png", purpose })));
  if (opc.icones === "loja") { // iPhone pega o ícone daqui na hora de instalar
    document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute("href", opc.icone || "icones/loja-apple.png");
    document.querySelector('link[rel="icon"]')?.setAttribute("href", opc.icone || "icones/loja-192.png");
  }
  const m = {
    id: base + opc.id, name: opc.nome, short_name: opc.curto, lang: "pt-BR",
    start_url: base + opc.inicio, scope: base + opc.escopo, display: "standalone", orientation: "portrait",
    background_color: "#f7f5f0", theme_color: opc.cor || "#2f6b3a", icons: icones,
  };
  const json = JSON.stringify(m);
  if (json === ultimoManifesto) return;
  ultimoManifesto = json;
  // o arquivo de instalação é criado só aqui, já com o nome da loja (o iPhone pega o 1º que vê e ignora troca depois)
  let link = document.querySelector('link[rel="manifest"]');
  if (!link) { link = document.createElement("link"); link.rel = "manifest"; document.head.appendChild(link); }
  link.href = URL.createObjectURL(new Blob([json], { type: "application/manifest+json" })); // Android/Chrome usa esse
}

// ---------------- vitrine (tela do cliente) ----------------
// ---------------- compartilhar ----------------
function linkDaLoja(slug, produtoId) {
  const base = location.origin + location.pathname.replace(/[^/]*$/, "") + "index.html?loja=" + encodeURIComponent(slug);
  return produtoId ? base + "&p=" + encodeURIComponent(produtoId) : base;
}
// janela de compartilhar do próprio aparelho (WhatsApp, Instagram...). Sem ela devolve false e a tela mostra outras opções.
async function compartilharNativo(titulo, texto, url) {
  if (!navigator.share) return false;
  try { await navigator.share({ title: titulo, text: texto, url }); return true; }
  catch (e) { return !!e && e.name === "AbortError"; } // a pessoa fechou: não mostra mais nada
}
async function copiarTexto(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e2) { /* sem cópia */ }
    ta.remove();
    return ok;
  }
}
function linkWhatsApp(texto) { return "https://wa.me/?text=" + encodeURIComponent(texto); }

function slugAtual() {
  const doLink = new URLSearchParams(location.search).get("loja");
  if (doLink) {
    const s = doLink.trim().toLowerCase();
    try { localStorage.setItem("agropet_ultima_loja", s); } catch (e) {}
    return s;
  }
  try { return localStorage.getItem("agropet_ultima_loja") || LOJA_PADRAO; } catch (e) { return LOJA_PADRAO; }
}

// devolve { id, slug, ativa, config, produtos } ou null se a loja não existe / está suspensa
async function buscarVitrine(slug) {
  const { data: l, error } = await db.from("lojas").select("id,slug,nome,config,ativa").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!l || !l.ativa) { guardarCache(slug, null); return null; }
  const { data: ps, error: e2 } = await db.from("produtos").select("*")
    .eq("loja_id", l.id).eq("ativo", true).order("ordem").order("criado_em", { ascending: false });
  if (e2) throw e2;
  const vitrine = { ...lojaDoBanco(l), produtos: ps.map(produtoDoBanco) };
  guardarCache(slug, vitrine);
  return vitrine;
}
// cópia da última vitrine carregada: abre rápido e funciona sem internet
function vitrineEmCache(slug) {
  try { return JSON.parse(localStorage.getItem("agropet_vitrine_" + slug)); } catch (e) { return null; }
}
function guardarCache(slug, vitrine) {
  try {
    if (vitrine) localStorage.setItem("agropet_vitrine_" + slug, JSON.stringify(vitrine));
    else localStorage.removeItem("agropet_vitrine_" + slug);
  } catch (e) { /* sem espaço: segue sem cache */ }
}

// ---------------- fotos ----------------
function ehDataUrl(s) { return typeof s === "string" && s.startsWith("data:"); }
// sobe uma imagem (data URL gerada no painel) pra pasta da loja e devolve o endereço público
async function enviarImagem(lojaId, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const caminho = `${lojaId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("imagens").upload(caminho, blob, { contentType: blob.type, cacheControl: "31536000" });
  if (error) throw error;
  return db.storage.from("imagens").getPublicUrl(caminho).data.publicUrl;
}

// apaga do armazenamento uma foto que deixou de ser usada (sem travar a tela se falhar)
function apagarImagem(url) {
  const marca = "/storage/v1/object/public/imagens/";
  if (typeof url !== "string" || !url.startsWith(SUPA_URL) || !url.includes(marca)) return;
  db.storage.from("imagens").remove([url.split(marca)[1]])
    .then(({ error }) => { if (error) console.warn("Foto antiga não foi apagada:", error.message); });
}

// ---------------- utilidades ----------------
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
