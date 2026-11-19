// Painel da loja: cadastro de produtos/preços/promoção, banner e regras de entrega.

const loja = carregarLoja();
const $ = id => document.getElementById(id);
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
let editando = null;     // produto aberto no editor (cópia)
let precoOriginal = null; // preço antes de abrir o editor
let fotoAtual = "";

function numero(v) {
  const t = String(v ?? "").trim().replace(/\s|R\$/g, "");
  if (!t) return null;
  // aceita 1.234,56 / 1234,56 / 1234.56
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : NaN;
}
function paraCampo(v) { return v == null ? "" : String(v.toFixed(2)).replace(".", ","); }

let timerAviso;
function avisar(texto) {
  const el = $("aviso");
  el.textContent = texto;
  el.classList.add("mostrar");
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => el.classList.remove("mostrar"), 2200);
}
function gravar(msgOk) {
  if (salvarLoja(loja)) avisar(msgOk);
  else avisar("Não deu pra salvar: a imagem está grande demais. Tente uma menor.");
}

// reduz a imagem antes de guardar (fotos de celular são enormes)
function lerImagem(arquivo, larguraMax) {
  return new Promise((ok, erro) => {
    const leitor = new FileReader();
    leitor.onerror = erro;
    leitor.onload = () => {
      const img = new Image();
      img.onerror = erro;
      img.onload = () => {
        const escala = Math.min(1, larguraMax / img.width);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL("image/jpeg", 0.82));
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

// ---------------- abas ----------------
document.querySelectorAll("[data-aba]").forEach(b => b.onclick = () => {
  document.querySelectorAll("[data-aba]").forEach(x => x.classList.toggle("ativo", x === b));
  $("abaProdutos").classList.toggle("oculto", b.dataset.aba !== "produtos");
  $("abaLoja").classList.toggle("oculto", b.dataset.aba !== "loja");
});

// ---------------- lista de produtos ----------------
function montarLista() {
  const termo = $("buscaAdm").value.trim().toLowerCase();
  const lista = loja.produtos.filter(p => !termo || `${p.nome} ${p.detalhe} ${p.categoria}`.toLowerCase().includes(termo));
  $("listaAdm").innerHTML = lista.length ? lista.map(p => `
    <div class="linha-adm ${p.ativo ? "" : "inativo"}">
      <div class="previa-foto" style="width:52px;height:52px;font-size:26px">${p.foto ? `<img src="${escaparHtml(p.foto)}" alt="">` : iconeDe(p.categoria)}</div>
      <div class="meio">
        <div class="nome">${escaparHtml(p.nome)}</div>
        <div class="sub">${escaparHtml(p.detalhe)} · ${escaparHtml(p.categoria)}${p.ativo ? "" : " · fora da loja"}</div>
      </div>
      <div class="valor">
        ${emPromocao(p) ? `<div class="preco-de">${real(p.precoDe)}</div>` : ""}
        <div class="preco ${emPromocao(p) ? "promo" : ""}" style="font-size:16px">${real(p.preco)}</div>
      </div>
      <button class="btn-secundario" data-editar="${p.id}" style="padding:8px 12px">Editar</button>
    </div>`).join("") : `<div class="vazio">Nenhum produto.</div>`;
}
$("buscaAdm").oninput = montarLista;
$("listaAdm").onclick = ev => {
  const b = ev.target.closest("[data-editar]");
  if (b) abrirEditor(loja.produtos.find(p => p.id === b.dataset.editar));
};
$("btnNovo").onclick = () => abrirEditor(null);

// ---------------- editor ----------------
function abrirEditor(p) {
  editando = p ? { ...p } : { id: "p" + Date.now().toString(36), nome: "", detalhe: "", categoria: "", preco: null, precoDe: null, foto: "", ativo: true };
  precoOriginal = p ? p.preco : null;
  fotoAtual = editando.foto || "";
  $("edTitulo").textContent = p ? "Editar produto" : "Novo produto";
  $("pNome").value = editando.nome;
  $("pDetalhe").value = editando.detalhe;
  $("pCategoria").value = editando.categoria;
  $("pPreco").value = paraCampo(editando.preco);
  $("pPrecoDe").value = emPromocao(editando) ? paraCampo(editando.precoDe) : "";
  $("pAtivo").checked = !!editando.ativo;
  $("btnExcluir").classList.toggle("oculto", !p);
  $("listaCategorias").innerHTML = [...new Set(loja.produtos.map(x => x.categoria).filter(Boolean))].map(c => `<option value="${escaparHtml(c)}">`).join("");
  document.querySelectorAll("#formProduto .campo.erro").forEach(c => c.classList.remove("erro"));
  mostrarFoto();
  mostrarPromo();
  $("painel").classList.remove("oculto");
  $("fundo").classList.remove("oculto");
  $("pNome").focus();
}
function fecharEditor() {
  $("painel").classList.add("oculto");
  $("fundo").classList.add("oculto");
  editando = null;
}
$("btnFechar").onclick = fecharEditor;
$("fundo").onclick = fecharEditor;
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && editando) fecharEditor(); });

function mostrarFoto() {
  $("previaFoto").innerHTML = fotoAtual ? `<img src="${escaparHtml(fotoAtual)}" alt="">` : iconeDe($("pCategoria").value);
  $("btnTirarFoto").classList.toggle("oculto", !fotoAtual);
}
$("pCategoria").oninput = () => { if (!fotoAtual) mostrarFoto(); };
$("arqFoto").onchange = async ev => {
  const f = ev.target.files[0];
  if (!f) return;
  try { fotoAtual = await lerImagem(f, 600); mostrarFoto(); }
  catch (e) { avisar("Não consegui abrir essa imagem"); }
  ev.target.value = "";
};
$("btnTirarFoto").onclick = () => { fotoAtual = ""; mostrarFoto(); };

// Baixou o preço? Vira promoção sozinho: o preço antigo vai pro "de" riscado.
$("pPreco").addEventListener("change", () => {
  const novo = numero($("pPreco").value);
  if (precoOriginal != null && novo != null && !isNaN(novo) && novo < precoOriginal && !$("pPrecoDe").value.trim()) {
    $("pPrecoDe").value = paraCampo(precoOriginal);
  }
  mostrarPromo();
});
$("pPrecoDe").addEventListener("input", mostrarPromo);

function mostrarPromo() {
  const preco = numero($("pPreco").value);
  const de = numero($("pPrecoDe").value);
  const caixa = $("infoPromo");
  if (preco && de && de > preco) {
    caixa.innerHTML = `<div class="info-promo"><span>🔥 Em promoção: de <b>${real(de)}</b> por <b>${real(preco)}</b> (-${Math.round((1 - preco / de) * 100)}%)</span><button type="button" class="btn-icone" id="btnEncerrar" style="font-size:13px;white-space:nowrap">Encerrar</button></div>`;
    $("btnEncerrar").onclick = () => {
      $("pPreco").value = paraCampo(de);
      $("pPrecoDe").value = "";
      mostrarPromo();
      avisar(`Promoção encerrada: volta pra ${real(de)} ao salvar`);
    };
  } else {
    caixa.innerHTML = "";
  }
}

function erroCampo(id, texto) {
  const c = $(id).closest(".campo");
  c.classList.add("erro");
  c.querySelector(".msg").textContent = texto;
}

$("btnSalvarProduto").onclick = () => {
  document.querySelectorAll("#formProduto .campo.erro").forEach(c => c.classList.remove("erro"));
  const nome = $("pNome").value.trim();
  const preco = numero($("pPreco").value);
  let de = numero($("pPrecoDe").value);
  let ok = true;
  if (!nome) { erroCampo("pNome", "Dê um nome ao produto"); ok = false; }
  if (preco == null || isNaN(preco) || preco <= 0) { erroCampo("pPreco", "Preço inválido"); ok = false; }
  if (de != null && isNaN(de)) { erroCampo("pPrecoDe", "Valor inválido"); ok = false; }
  if (!ok) return;
  if (de != null && de <= preco) de = null; // "de" menor ou igual não é promoção

  Object.assign(editando, {
    nome,
    detalhe: $("pDetalhe").value.trim(),
    categoria: $("pCategoria").value.trim() || "Outros",
    preco,
    precoDe: de,
    foto: fotoAtual,
    ativo: $("pAtivo").checked,
  });
  const i = loja.produtos.findIndex(p => p.id === editando.id);
  if (i >= 0) loja.produtos[i] = editando; else loja.produtos.unshift(editando);
  gravar(de ? "Salvo — aparece como promoção" : "Produto salvo");
  fecharEditor();
  montarLista();
};

$("btnExcluir").onclick = () => {
  if (!editando || !confirm(`Excluir "${editando.nome}"? Não dá pra desfazer.`)) return;
  loja.produtos = loja.produtos.filter(p => p.id !== editando.id);
  gravar("Produto excluído");
  fecharEditor();
  montarLista();
};

// ---------------- banner e entrega ----------------
let bannerAtual = loja.config.bannerImg || "";
function mostrarBanner() {
  $("previaBanner").innerHTML = bannerAtual ? `<img src="${escaparHtml(bannerAtual)}" alt="">` : "Sem imagem (usa o fundo verde)";
  $("btnTirarBanner").classList.toggle("oculto", !bannerAtual);
}
function montarConfig() {
  const c = loja.config;
  $("cNome").value = c.nome;
  $("cTitulo").value = c.bannerTitulo;
  $("cSub").value = c.bannerSub;
  $("cComTexto").checked = c.bannerComTexto !== false;
  $("cWhats").value = c.whatsapp;
  $("cHorarios").value = (c.horarios || []).join("\n");
  $("cTaxa").value = paraCampo(Number(c.taxaEntrega || 0));
  $("cDias").innerHTML = DIAS_CURTOS.map((d, i) =>
    `<label><input type="checkbox" value="${i}" ${(c.diasSemEntrega || []).includes(i) ? "checked" : ""}>${d}</label>`).join("");
  mostrarBanner();
}
$("arqBanner").onchange = async ev => {
  const f = ev.target.files[0];
  if (!f) return;
  try { bannerAtual = await lerImagem(f, 1600); mostrarBanner(); avisar("Imagem pronta — clique em Salvar"); }
  catch (e) { avisar("Não consegui abrir essa imagem"); }
  ev.target.value = "";
};
$("btnTirarBanner").onclick = () => { bannerAtual = ""; mostrarBanner(); };

$("btnSalvarLoja").onclick = () => {
  const horarios = $("cHorarios").value.split("\n").map(s => s.trim()).filter(Boolean);
  const taxa = numero($("cTaxa").value);
  if (!horarios.length) { avisar("Coloque pelo menos um horário de entrega"); return; }
  if (taxa != null && (isNaN(taxa) || taxa < 0)) { avisar("Taxa de entrega inválida"); return; }
  Object.assign(loja.config, {
    nome: $("cNome").value.trim() || "Agro Pet",
    bannerTitulo: $("cTitulo").value.trim(),
    bannerSub: $("cSub").value.trim(),
    bannerImg: bannerAtual,
    bannerComTexto: $("cComTexto").checked,
    whatsapp: $("cWhats").value.replace(/\D/g, ""),
    horarios,
    diasSemEntrega: [...document.querySelectorAll("#cDias input:checked")].map(i => Number(i.value)),
    taxaEntrega: taxa || 0,
  });
  gravar("Loja salva");
};

montarLista();
montarConfig();
