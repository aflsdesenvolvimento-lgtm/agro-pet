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
  $("abaCapa").classList.toggle("oculto", b.dataset.aba !== "capa");
  $("abaEntrega").classList.toggle("oculto", b.dataset.aba !== "entrega");
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


// ---------------- capa: banners ----------------
const CORES = ["#2f6b3a", "#1f5f8b", "#e0742b", "#b3261e", "#7b4fa0", "#8a5a2b", "#1f2a1f"];
const POSICOES = [
  ["topo-esquerda", "↖"], ["topo-centro", "↑"], ["topo-direita", "↗"],
  ["meio-esquerda", "←"], ["meio-centro", "•"], ["meio-direita", "→"],
  ["baixo-esquerda", "↙"], ["baixo-centro", "↓"], ["baixo-direita", "↘"],
];
let bannerEd = null; // banner aberto no editor (cópia)

function proporcao() { return ALTURAS_BANNER[loja.config.alturaBanner] || ALTURAS_BANNER.media; }

function montarListaBanners() {
  const lista = loja.config.banners || [];
  $("listaBanners").innerHTML = lista.length ? lista.map((b, i) => `
    <div class="linha-adm ${b.ativo === false ? "inativo" : ""}">
      <div class="ordem">
        <button type="button" data-subir="${i}" ${i === 0 ? "disabled" : ""} aria-label="Subir">▲</button>
        <button type="button" data-descer="${i}" ${i === lista.length - 1 ? "disabled" : ""} aria-label="Descer">▼</button>
      </div>
      <div class="mini-banner"><div class="carrossel"><div class="slides">${htmlBanner(b)}</div></div></div>
      <div class="meio">
        <div class="nome">${escaparHtml(b.titulo || "(só imagem)")}</div>
        <div class="sub">${b.img ? "Com imagem" : "Cor de fundo"}${b.ativo === false ? " · fora da loja" : ""}</div>
      </div>
      <button class="btn-secundario" data-editar-banner="${i}" style="padding:8px 12px">Editar</button>
    </div>`).join("") : `<div class="vazio" style="padding:16px 0">Nenhum banner. A loja abre direto nos produtos.</div>`;
}

$("listaBanners").onclick = ev => {
  const lista = loja.config.banners;
  const sobe = ev.target.closest("[data-subir]"), desce = ev.target.closest("[data-descer]");
  const ed = ev.target.closest("[data-editar-banner]");
  if (sobe || desce) {
    const i = Number(sobe ? sobe.dataset.subir : desce.dataset.descer);
    const j = sobe ? i - 1 : i + 1;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    gravar("Ordem dos banners salva");
    montarListaBanners();
  } else if (ed) {
    abrirBanner(lista[Number(ed.dataset.editarBanner)]);
  }
};
$("btnNovoBanner").onclick = () => abrirBanner(null);

// ----- editor -----
function abrirBanner(b) {
  bannerEd = b ? JSON.parse(JSON.stringify(b)) : { ...novoBanner(), cor: loja.config.corPrincipal || "#2f6b3a" };
  bannerEd._novo = !b;
  $("bTitulo").value = bannerEd.titulo || "";
  $("bSub").value = bannerEd.sub || "";
  $("bBotao").value = bannerEd.botaoTexto || "";
  $("bEscurecer").checked = bannerEd.escurecer !== false;
  $("bAtivo").checked = bannerEd.ativo !== false;
  const cats = ["Todos", "Promoções", ...new Set(loja.produtos.map(p => p.categoria).filter(Boolean))];
  $("bDestino").innerHTML = cats.map(c => `<option value="${escaparHtml(c)}">${c === "Todos" ? "Todos os produtos" : escaparHtml(c)}</option>`).join("");
  $("bDestino").value = cats.includes(bannerEd.botaoCategoria) ? bannerEd.botaoCategoria : "Todos";
  $("btnExcluirBanner").classList.toggle("oculto", bannerEd._novo);
  $("painelBanner").classList.remove("oculto");
  $("fundo").classList.remove("oculto");
  $("formBanner").scrollTop = 0;
  atualizarEditorBanner();
}
function fecharBanner() {
  $("painelBanner").classList.add("oculto");
  $("fundo").classList.add("oculto");
  bannerEd = null;
}
$("btnFecharBanner").onclick = fecharBanner;

function atualizarEditorBanner() {
  const b = bannerEd;
  $("previaCarrossel").dataset.altura = loja.config.alturaBanner || "media";
  $("previaSlide").innerHTML = htmlBanner(b);
  document.querySelectorAll("#formBanner .segmentos").forEach(s => {
    s.querySelectorAll("button").forEach(x => x.classList.toggle("ativo", x.dataset.valor === String(b[s.dataset.campo])));
  });
  $("gradePosicao").innerHTML = POSICOES.map(([v, seta]) =>
    `<button type="button" data-pos="${v}" class="${b.posicao === v ? "ativo" : ""}">${b.posicao === v ? "Aqui" : seta}</button>`).join("");
  $("coresFundo").innerHTML = coresHtml(b.cor, "fundo");
  $("opcoesImg").classList.toggle("oculto", !b.img);
  $("campoCorFundo").classList.toggle("oculto", !!b.img);
  $("btnTirarImg").classList.toggle("oculto", !b.img);
}

function coresHtml(atual, grupo) {
  return CORES.map(c => `<button type="button" data-cor-${grupo}="${c}" class="${c === atual ? "ativo" : ""}" style="background:${c}" aria-label="Cor ${c}"></button>`).join("")
    + `<input type="color" data-cor-${grupo}-livre value="${escaparHtml(atual || "#2f6b3a")}" title="Outra cor">`;
}

// tudo que muda no formulário atualiza a prévia na hora
$("formBanner").addEventListener("input", ev => {
  if (!bannerEd) return;
  const t = ev.target;
  if (t.id === "bTitulo") bannerEd.titulo = t.value;
  else if (t.id === "bSub") bannerEd.sub = t.value;
  else if (t.id === "bBotao") bannerEd.botaoTexto = t.value;
  else if (t.id === "bEscurecer") bannerEd.escurecer = t.checked;
  else if (t.id === "bAtivo") bannerEd.ativo = t.checked;
  else if (t.id === "bDestino") bannerEd.botaoCategoria = t.value;
  else if (t.hasAttribute("data-cor-fundo-livre")) bannerEd.cor = t.value;
  else return;
  $("previaSlide").innerHTML = htmlBanner(bannerEd);
});
$("formBanner").addEventListener("change", ev => {
  if (!bannerEd) return;
  if (ev.target.id === "bDestino") { bannerEd.botaoCategoria = ev.target.value; $("previaSlide").innerHTML = htmlBanner(bannerEd); }
  if (ev.target.hasAttribute("data-cor-fundo-livre")) { bannerEd.cor = ev.target.value; atualizarEditorBanner(); }
});
$("formBanner").addEventListener("click", ev => {
  if (!bannerEd) return;
  const seg = ev.target.closest(".segmentos button");
  const pos = ev.target.closest("[data-pos]");
  const cor = ev.target.closest("[data-cor-fundo]");
  if (seg) bannerEd[seg.parentElement.dataset.campo] = seg.dataset.valor;
  else if (pos) bannerEd.posicao = pos.dataset.pos;
  else if (cor) bannerEd.cor = cor.dataset.corFundo;
  else return;
  atualizarEditorBanner();
});
$("arqBanner").onchange = async ev => {
  const f = ev.target.files[0];
  if (!f || !bannerEd) return;
  try { bannerEd.img = await lerImagem(f, 1600); atualizarEditorBanner(); }
  catch (e) { avisar("Não consegui abrir essa imagem"); }
  ev.target.value = "";
};
$("btnTirarImg").onclick = () => { if (bannerEd) { bannerEd.img = ""; atualizarEditorBanner(); } };

$("btnSalvarBanner").onclick = () => {
  if (!bannerEd) return;
  if (!bannerEd.img && !bannerEd.titulo.trim() && !bannerEd.sub.trim()) {
    avisar("Coloque uma imagem ou pelo menos um título");
    return;
  }
  const { _novo, ...b } = bannerEd;
  b.titulo = b.titulo.trim(); b.sub = b.sub.trim(); b.botaoTexto = b.botaoTexto.trim();
  const lista = loja.config.banners;
  const i = lista.findIndex(x => x.id === b.id);
  if (i >= 0) lista[i] = b; else lista.push(b);
  gravar("Banner salvo");
  fecharBanner();
  montarListaBanners();
};
$("btnExcluirBanner").onclick = () => {
  if (!bannerEd || !confirm("Excluir este banner? Não dá pra desfazer.")) return;
  loja.config.banners = loja.config.banners.filter(x => x.id !== bannerEd.id);
  gravar("Banner excluído");
  fecharBanner();
  montarListaBanners();
};

// altura e tempo de troca salvam na hora
$("cAltura").onchange = ev => { loja.config.alturaBanner = ev.target.value; gravar("Altura dos banners salva"); montarListaBanners(); };
$("cTroca").onchange = ev => { loja.config.trocaBanner = Number(ev.target.value); gravar("Tempo de troca salvo"); };

// ---------------- capa: identidade e vitrine ----------------
let logoAtual = loja.config.logo || "";
let corAtual = loja.config.corPrincipal || "#2f6b3a";
function mostrarLogo() {
  $("previaLogo").innerHTML = logoAtual ? `<img src="${escaparHtml(logoAtual)}" alt="">` : "🐾";
  $("btnTirarLogo").classList.toggle("oculto", !logoAtual);
}
function mostrarCores() {
  $("cores").innerHTML = coresHtml(corAtual, "loja");
  aplicarTema(corAtual); // o painel já mostra a cor escolhida
}
$("cores").addEventListener("click", ev => {
  const b = ev.target.closest("[data-cor-loja]");
  if (b) { corAtual = b.dataset.corLoja; mostrarCores(); }
});
$("cores").addEventListener("change", ev => {
  if (ev.target.hasAttribute("data-cor-loja-livre")) { corAtual = ev.target.value; mostrarCores(); }
});
$("arqLogo").onchange = async ev => {
  const f = ev.target.files[0];
  if (!f) return;
  try { logoAtual = await lerImagem(f, 400); mostrarLogo(); }
  catch (e) { avisar("Não consegui abrir essa imagem"); }
  ev.target.value = "";
};
$("btnTirarLogo").onclick = () => { logoAtual = ""; mostrarLogo(); };

$("btnSalvarCapa").onclick = () => {
  Object.assign(loja.config, {
    nome: $("cNome").value.trim() || "Agro Pet",
    logo: logoAtual,
    corPrincipal: corAtual,
    mostrarPromocoes: $("cPromo").checked,
    textoBusca: $("cBusca").value.trim(),
  });
  gravar("Identidade e vitrine salvas");
  montarListaBanners();
};

// ---------------- entrega ----------------
function montarConfig() {
  const c = loja.config;
  $("cNome").value = c.nome;
  $("cPromo").checked = c.mostrarPromocoes !== false;
  $("cBusca").value = c.textoBusca || "";
  $("cAltura").value = c.alturaBanner || "media";
  $("cTroca").value = String(c.trocaBanner ?? 5);
  $("cWhats").value = c.whatsapp;
  $("cHorarios").value = (c.horarios || []).join("\n");
  $("cTaxa").value = paraCampo(Number(c.taxaEntrega || 0));
  $("cDias").innerHTML = DIAS_CURTOS.map((d, i) =>
    `<label><input type="checkbox" value="${i}" ${(c.diasSemEntrega || []).includes(i) ? "checked" : ""}>${d}</label>`).join("");
  mostrarLogo();
  mostrarCores();
  montarListaBanners();
}

$("btnSalvarLoja").onclick = () => {
  const horarios = $("cHorarios").value.split("\n").map(s => s.trim()).filter(Boolean);
  const taxa = numero($("cTaxa").value);
  if (!horarios.length) { avisar("Coloque pelo menos um horário de entrega"); return; }
  if (taxa != null && (isNaN(taxa) || taxa < 0)) { avisar("Taxa de entrega inválida"); return; }
  Object.assign(loja.config, {
    whatsapp: $("cWhats").value.replace(/\D/g, ""),
    horarios,
    diasSemEntrega: [...document.querySelectorAll("#cDias input:checked")].map(i => Number(i.value)),
    taxaEntrega: taxa || 0,
  });
  gravar("Entrega salva");
};

// o fundo escuro e o Esc fecham qualquer editor aberto
$("fundo").onclick = () => { if (bannerEd) fecharBanner(); else fecharEditor(); };
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && bannerEd) fecharBanner(); });

montarLista();
montarConfig();
