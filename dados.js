// Camada de dados do app. Por enquanto tudo fica no navegador (localStorage),
// pra testar sem servidor. Quando a loja for pro ar, so este arquivo muda:
// as funcoes carregarLoja()/salvarLoja() passam a ler/gravar num lugar central
// (planilha Google ou banco), e o resto do app continua igual.

const CHAVE_LOJA = "agropet_loja_v1";

const LOJA_INICIAL = {
  config: {
    nome: "Agro Pet",
    whatsapp: "",            // so numeros, com DDD. Ex: 54999998888
    bannerImg: "",           // imagem do banner (enviada no painel da loja)
    bannerTitulo: "Tudo pro seu cão e gato",
    bannerSub: "Ração, petiscos e acessórios com entrega na sua casa",
    bannerComTexto: true,    // false quando a imagem do banner já tem texto/logo
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
      return { config: { ...LOJA_INICIAL.config, ...dados.config }, produtos: dados.produtos || [] };
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
