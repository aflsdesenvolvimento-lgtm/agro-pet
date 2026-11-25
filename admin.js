// Painel: login, lojas (master), produtos, pedidos, capa e entrega — tudo no banco central.

const $ = id => document.getElementById(id);
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const CHAVE_LOJA_PAINEL = "agropet_painel_loja"; // última loja aberta pela master

let perfil = null;   // { user_id, papel: 'master' | 'adm' | 'equipe', loja_id, email, nome, telefone, abas }
let lojas = [];      // lojas que essa pessoa pode editar
let loja = null;     // loja aberta: { id, slug, ativa, config, produtos }
let pedidos = [];
let editando = null;      // produto aberto no editor (cópia)
let precoOriginal = null; // preço antes de abrir o editor
let fotoAtual = "";

// ================= utilidades =================
function numero(v) {
  const t = String(v ?? "").trim().replace(/\s|R\$/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); // 1.234,56 / 1234,56 / 1234.56
  return Number.isFinite(n) ? n : NaN;
}
function paraCampo(v) { return v == null ? "" : String(Number(v).toFixed(2)).replace(".", ","); }

let timerAviso;
function avisar(texto) {
  const el = $("aviso");
  el.textContent = texto;
  el.classList.add("mostrar");
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => el.classList.remove("mostrar"), 2600);
}
function textoErro(e) {
  const m = String(e?.message || e || "");
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "Sem internet. Tente de novo.";
  if (/row-level security|permission denied|42501/i.test(m)) return "Sem permissão pra isso.";
  if (/duplicate key|already exists|23505/i.test(m)) return "Esse endereço/e-mail já está em uso.";
  if (/exceeded|too large|Payload/i.test(m)) return "Imagem grande demais.";
  return m || "Algo deu errado.";
}
// mostra "Salvando..." enquanto espera o banco
async function ocupado(texto, fn) {
  $("carregandoTexto").textContent = texto;
  $("carregando").classList.remove("oculto");
  try { return await fn(); }
  catch (e) { console.error(e); avisar(textoErro(e)); return undefined; }
  finally { $("carregando").classList.add("oculto"); }
}
function checar({ data, error }) { if (error) throw error; return data; }

// reduz a imagem antes de enviar (fotos de celular são enormes). PNG mantém fundo transparente (logo).
function lerImagem(arquivo, larguraMax, tipo = "image/jpeg") {
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
        ok(c.toDataURL(tipo, 0.82));
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

// ================= login =================
let modoLogin = "login";
function urlPainel() { return location.origin + location.pathname; }

function mostrarTela(qual) {
  $("telaLogin").classList.toggle("oculto", qual !== "login");
  $("telaSemAcesso").classList.toggle("oculto", qual !== "sem-acesso");
  $("areaPainel").classList.toggle("oculto", qual !== "painel");
  $("btnSair").classList.toggle("oculto", qual === "login");
  $("linkVerLoja").classList.toggle("oculto", qual !== "painel");
  $("btnConta").classList.toggle("oculto", qual !== "painel");
  $("marcaIcone").classList.toggle("oculto", qual === "painel");
  if (qual !== "painel") fecharMenuConta();
}

function mostrarLogin(modo = "login", msg = "", tipoMsg = "") {
  modoLogin = modo;
  mostrarTela("login");
  const textos = {
    login: ["Entrar no painel", "Use o e-mail e a senha da sua conta.", "Entrar"],
    cadastro: ["Criar conta", "Use o e-mail que a administradora da plataforma liberou pra sua loja.", "Criar conta"],
    esqueci: ["Esqueci a senha", "Mandamos um link pro seu e-mail pra criar uma senha nova.", "Enviar link"],
    "nova-senha": ["Senha nova", "Escolha a senha nova da sua conta.", "Salvar senha"],
  }[modo];
  $("loginTitulo").textContent = textos[0];
  $("loginAjuda").textContent = textos[1];
  $("btnLogin").textContent = textos[2];
  $("campoEmail").classList.toggle("oculto", modo === "nova-senha");
  $("campoSenha").classList.toggle("oculto", modo === "esqueci");
  $("campoSenha2").classList.toggle("oculto", !(modo === "cadastro" || modo === "nova-senha"));
  $("lSenha").autocomplete = modo === "login" ? "current-password" : "new-password";
  $("linksLogin").innerHTML = modo === "login"
    ? `<button type="button" data-modo="cadastro">Criar conta</button><button type="button" data-modo="esqueci">Esqueci a senha</button>`
    : modo === "nova-senha" ? "" : `<button type="button" data-modo="login">← Voltar pro login</button>`;
  $("lSenha").value = ""; $("lSenha2").value = "";
  document.querySelectorAll("#formLogin .campo.erro").forEach(c => c.classList.remove("erro"));
  const m = $("msgLogin");
  m.textContent = msg;
  m.className = "msg-login " + tipoMsg;
}
$("linksLogin").onclick = ev => { const b = ev.target.closest("[data-modo]"); if (b) mostrarLogin(b.dataset.modo); };

function msgLogin(texto, tipo = "erro") { const m = $("msgLogin"); m.textContent = texto; m.className = "msg-login " + tipo; }
function erroLogin(e) {
  const m = String(e?.message || e);
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha errados.";
  if (/Email not confirmed/i.test(m)) return "Falta confirmar o e-mail: abra o link que mandamos pra você.";
  if (/already registered|already been registered/i.test(m)) return "Esse e-mail já tem conta. Use \"Entrar\" ou \"Esqueci a senha\".";
  if (/rate limit|too many/i.test(m)) return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if (/Password should be/i.test(m)) return "Senha fraca: use pelo menos 8 caracteres, misturando letras e números.";
  return textoErro(e);
}

$("formLogin").addEventListener("submit", async ev => {
  ev.preventDefault();
  const email = $("lEmail").value.trim().toLowerCase();
  const senha = $("lSenha").value;
  if (modoLogin !== "nova-senha" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return msgLogin("Digite um e-mail válido.");
  if ((modoLogin === "cadastro" || modoLogin === "nova-senha")) {
    if (senha.length < 8) return msgLogin("A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== $("lSenha2").value) return msgLogin("As duas senhas não estão iguais.");
  }
  if (modoLogin === "login" && !senha) return msgLogin("Digite a senha.");
  $("btnLogin").disabled = true;
  try {
    if (modoLogin === "login") {
      checar(await db.auth.signInWithPassword({ email, password: senha }));
      await entrar();
    } else if (modoLogin === "cadastro") {
      const r = checar(await db.auth.signUp({ email, password: senha, options: { emailRedirectTo: urlPainel() } }));
      if (r.session) await entrar();
      else mostrarLogin("login", `Conta criada! Mandamos um link pra ${email}. Abra o e-mail, toque no link e depois entre aqui.`, "ok");
    } else if (modoLogin === "esqueci") {
      checar(await db.auth.resetPasswordForEmail(email, { redirectTo: urlPainel() }));
      mostrarLogin("login", `Se existir conta com ${email}, chega um link pra criar a senha nova.`, "ok");
    } else if (modoLogin === "nova-senha") {
      checar(await db.auth.updateUser({ password: senha }));
      recuperandoSenha = false;
      history.replaceState(null, "", urlPainel());
      avisar("Senha nova salva");
      await entrar();
    }
  } catch (e) {
    msgLogin(erroLogin(e));
  } finally {
    $("btnLogin").disabled = false;
  }
});

$("btnSair").onclick = async () => {
  await db.auth.signOut();
  perfil = null; loja = null; lojas = [];
  $("pontoConta").classList.add("oculto");
  pararVigia();
  mostrarLogin("login", "Você saiu do painel.", "ok");
};
$("btnTentarDeNovo").onclick = () => entrar();

// depois do login: descobre se é master ou adm (aceitando convite pendente) e abre a loja
async function entrar() {
  const ok = await ocupado("Entrando...", async () => {
    const { data: { user } } = await db.auth.getUser();
    if (!user) { mostrarLogin("login"); return false; }
    perfil = checar(await db.rpc("aceitar_convite"));
    if (!perfil || !perfil.papel) {
      perfil = null;
      $("semAcessoTexto").innerHTML = !user.email_confirmed_at
        ? `Falta confirmar o e-mail <b>${escaparHtml(user.email)}</b>: abra o link que mandamos e depois toque no botão abaixo.`
        : `A conta <b>${escaparHtml(user.email)}</b> ainda não está ligada a nenhuma loja. Peça pra administradora da plataforma liberar esse e-mail e depois toque no botão abaixo.`;
      mostrarTela("sem-acesso");
      return false;
    }
    await carregarLojas();
    return true;
  });
  if (!ok) return;
  mostrarTela("painel");
  document.querySelectorAll(".abas [data-aba]").forEach(b => b.classList.toggle("oculto", !podeAba(b.dataset.aba)));
  let escolhida = perfil.papel !== "master" ? perfil.loja_id : null;
  if (!escolhida) { try { escolhida = localStorage.getItem(CHAVE_LOJA_PAINEL); } catch (e) {} }
  if (!lojas.some(l => l.id === escolhida)) escolhida = lojas[0]?.id;
  if (escolhida) {
    await abrirLoja(escolhida);
    // abriu pelo aviso de pedido novo
    const inicial = location.hash === "#pedidos" && podeAba("pedidos") ? "pedidos" : primeiraAba();
    if (inicial) trocarAba(inicial);
    else { abrirConta("dados"); avisar("Sua conta ainda não tem nenhuma parte do painel liberada. Fale com o administrador da loja."); }
  }
  else if (perfil.papel === "master") { trocarAba("lojas"); avisar("Crie a primeira loja"); }
}

async function carregarLojas() {
  let q = db.from("lojas").select("id,slug,nome,config,ativa,criada_em").order("nome");
  if (perfil.papel !== "master") q = q.eq("id", perfil.loja_id);
  lojas = checar(await q).map(lojaDoBanco);
  montarSeletor();
}
function montarSeletor() {
  const master = perfil?.papel === "master";
  $("seletorLoja").classList.toggle("oculto", !master);
  $("nomeLojaFixo").classList.toggle("oculto", master);
  $("seletorLoja").innerHTML = lojas.map(l =>
    `<option value="${l.id}">${escaparHtml(l.config.nome)}${l.ativa ? "" : " (suspensa)"}</option>`).join("");
  if (loja) $("seletorLoja").value = loja.id;
  $("nomeLojaFixo").textContent = loja?.config.nome || lojas[0]?.config.nome || "";
}
$("seletorLoja").onchange = ev => abrirLoja(ev.target.value);

async function abrirLoja(id) {
  await ocupado("Abrindo loja...", async () => {
    const l = checar(await db.from("lojas").select("id,slug,nome,config,ativa").eq("id", id).single());
    const ps = checar(await db.from("produtos").select("*").eq("loja_id", id).order("ordem").order("criado_em", { ascending: false }));
    loja = { ...lojaDoBanco(l), produtos: ps.map(produtoDoBanco) };
    try { localStorage.setItem(CHAVE_LOJA_PAINEL, id); } catch (e) {}
  });
  if (!loja) return;
  $("linkVerLoja").href = `index.html?loja=${encodeURIComponent(loja.slug)}`;
  montarSeletor();
  logoAtual = loja.config.logo || "";
  corAtual = loja.config.corPrincipal || "#2f6b3a";
  montarLista();
  montarConfig();
  if (podeAba("pedidos")) carregarPedidos(true);
  vigiarPedidos();
  if (!$("abaFinanceiro").classList.contains("oculto")) carregarFinanceiro();
  if (!$("abaEstoque").classList.contains("oculto")) montarEstoque();
  contarEstoqueBaixo();
  // master trocou de loja com a Equipe/Mensalidade aberta: recarrega pra loja nova
  if (!$("abaConta").classList.contains("oculto") && (contaAtual === "equipe" || contaAtual === "mensalidade")) abrirConta(contaAtual);
  atualizarPontoConta();
}

// grava nome + configuração (capa, entrega...) da loja aberta
async function salvarConfig(msgOk) {
  const r = await ocupado("Salvando...", async () => {
    checar(await db.from("lojas").update({ nome: loja.config.nome, config: configParaBanco(loja.config) }).eq("id", loja.id));
    return true;
  });
  if (r) { avisar(msgOk); const i = lojas.findIndex(l => l.id === loja.id); if (i >= 0) lojas[i].config = copia(loja.config); montarSeletor(); }
  return !!r;
}

// ================= abas =================
const ABAS_PAINEL = ["produtos", "estoque", "pedidos", "financeiro", "capa", "entrega", "lojas"];
// o que cada um pode abrir (o banco confere de novo: isso aqui só esconde)
function podeAba(aba) {
  if (!perfil) return false;
  if (aba === "lojas") return perfil.papel === "master";
  return perfil.papel !== "equipe" || (perfil.abas || []).includes(aba);
}
function primeiraAba() { return ABAS_PAINEL.find(podeAba) || null; }
function trocarAba(nome) {
  if (!podeAba(nome)) { nome = primeiraAba(); if (!nome) { abrirConta("dados"); return; } }
  document.querySelectorAll("[data-aba]").forEach(x => x.classList.toggle("ativo", x.dataset.aba === nome));
  [...ABAS_PAINEL, "conta"].forEach(a =>
    $("aba" + a[0].toUpperCase() + a.slice(1)).classList.toggle("oculto", a !== nome));
  if (nome === "pedidos") { carregarPedidos(); montarAvisos(); }
  if (nome === "financeiro") carregarFinanceiro();
  if (nome === "estoque") montarEstoque();
  if (nome === "lojas") montarLojas();
}
document.querySelectorAll("[data-aba]").forEach(b => b.onclick = () => trocarAba(b.dataset.aba));

// ================= produtos =================
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
    </div>`).join("") : `<div class="vazio">${loja.produtos.length ? "Nenhum produto com esse nome." : "Nenhum produto ainda. Toque em \"+ Novo produto\"."}</div>`;
}
$("buscaAdm").oninput = montarLista;
$("listaAdm").onclick = ev => {
  const b = ev.target.closest("[data-editar]");
  if (b) abrirEditor(loja.produtos.find(p => p.id === b.dataset.editar));
};
$("btnNovo").onclick = () => abrirEditor(null);

function abrirEditor(p) {
  editando = p ? { ...p } : { id: null, nome: "", detalhe: "", categoria: "", preco: null, precoDe: null, foto: "", ativo: true, ordem: 0 };
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

function mostrarFoto() {
  $("previaFoto").innerHTML = fotoAtual ? `<img src="${escaparHtml(fotoAtual)}" alt="">` : iconeDe($("pCategoria").value);
  $("btnTirarFoto").classList.toggle("oculto", !fotoAtual);
}
$("pCategoria").oninput = () => { if (!fotoAtual) mostrarFoto(); };
$("arqFoto").onchange = async ev => {
  const f = ev.target.files[0];
  if (!f) return;
  try { fotoAtual = await lerImagem(f, 800); mostrarFoto(); }
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

$("btnSalvarProduto").onclick = async () => {
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

  const salvo = await ocupado("Salvando produto...", async () => {
    const foto = ehDataUrl(fotoAtual) ? await enviarImagem(loja.id, fotoAtual) : fotoAtual;
    const dados = produtoParaBanco({ ...editando, nome, detalhe: $("pDetalhe").value.trim(),
      categoria: $("pCategoria").value.trim() || "Outros", preco, precoDe: de, foto, ativo: $("pAtivo").checked }, loja.id);
    const q = editando.id
      ? db.from("produtos").update(dados).eq("id", editando.id).select().single()
      : db.from("produtos").insert(dados).select().single();
    return produtoDoBanco(checar(await q));
  });
  if (!salvo) return;
  if (editando.foto && editando.foto !== salvo.foto) apagarImagem(editando.foto); // trocou ou tirou a foto
  const i = loja.produtos.findIndex(p => p.id === salvo.id);
  if (i >= 0) loja.produtos[i] = salvo; else loja.produtos.unshift(salvo);
  avisar(emPromocao(salvo) ? "Salvo — aparece como promoção" : "Produto salvo");
  fecharEditor();
  montarLista();
};

$("btnExcluir").onclick = async () => {
  if (!editando?.id || !confirm(`Excluir "${editando.nome}"? Não dá pra desfazer.`)) return;
  const id = editando.id;
  const r = await ocupado("Excluindo...", async () => { checar(await db.from("produtos").delete().eq("id", id)); return true; });
  if (!r) return;
  apagarImagem(editando.foto);
  loja.produtos = loja.produtos.filter(p => p.id !== id);
  avisar("Produto excluído");
  fecharEditor();
  montarLista();
};

// ================= pedidos =================
const STATUS = { novo: "Novo", confirmado: "Confirmado", entregue: "Entregue", cancelado: "Cancelado" };
async function carregarPedidos(silencioso = false) {
  if (!loja) return;
  const buscar = async () => {
    pedidos = checar(await db.from("pedidos").select("*").eq("loja_id", loja.id).order("criado_em", { ascending: false }).limit(200));
    pedidos.forEach(p => pedidosVistos.add(p.id));
    return true;
  };
  if (silencioso) { try { await buscar(); } catch (e) { console.warn(e); } }
  else await ocupado("Buscando pedidos...", buscar);
  montarPedidos();
}
function montarPedidos() {
  const novos = pedidos.filter(p => p.status === "novo").length;
  $("contPedidos").textContent = novos;
  $("contPedidos").classList.toggle("oculto", !novos);
  const f = $("filtroStatus").value;
  const lista = pedidos.filter(p => f === "todos" ? true
    : f === "abertos" ? ["novo", "confirmado"].includes(p.status)
    : f === "receber" ? p.status === "entregue" && !p.pago
    : p.status === f);
  $("listaPedidos").innerHTML = lista.length ? lista.map(p => {
    const e = p.entrega || {}, c = p.cliente || {};
    const tel = String(c.telefone || "").replace(/\D/g, "");
    const quando = new Date(p.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const dataEntrega = e.data ? e.data.split("-").reverse().join("/") : "";
    return `
      <div class="pedido">
        <div class="cab"><b>${escaparHtml(c.nome || "Cliente")}</b><span class="status ${p.status}">${STATUS[p.status]}</span></div>
        <div class="det">Pedido ${escaparHtml(p.numero)} · feito ${quando}${tel ? ` · <a href="https://wa.me/55${tel.replace(/^55/, "")}" target="_blank" rel="noopener">WhatsApp ${escaparHtml(c.telefone)}</a>` : ""}</div>
        <ul class="itens">${(p.itens || []).map(i => `<li>${i.qtd}x ${escaparHtml(i.nome)} ${i.detalhe ? `(${escaparHtml(i.detalhe)})` : ""} — ${real(i.preco * i.qtd)}</li>`).join("")}</ul>
        <div class="det">🚚 <b>${dataEntrega}</b>, ${escaparHtml(e.horario || "")} · ${escaparHtml(e.rua || "")}, ${escaparHtml(e.numero || "")}${e.complemento ? " - " + escaparHtml(e.complemento) : ""} - ${escaparHtml(e.bairro || "")}, ${escaparHtml(e.cidade || "")}/${escaparHtml(e.uf || "")}</div>
        ${e.referencia ? `<div class="det">📍 ${escaparHtml(e.referencia)}</div>` : ""}
        <div class="det">💳 ${escaparHtml(p.pagamento)}${p.troco ? ` (troco para ${escaparHtml(p.troco)})` : ""}${p.obs ? ` · 📝 ${escaparHtml(p.obs)}` : ""}</div>
        <div class="rodape">
          <b>Total ${real(p.total)}</b>
          <div class="acoes-pedido">
            ${p.status === "cancelado" ? "" : `<label class="marca-pago ${p.pago ? "sim" : ""}"><input type="checkbox" data-pago="${p.id}" ${p.pago ? "checked" : ""}> 💰 ${p.pago ? "Pago" : "Não pago"}</label>`}
            <select data-status="${p.id}">${Object.entries(STATUS).map(([v, t]) => `<option value="${v}" ${v === p.status ? "selected" : ""}>${t}</option>`).join("")}</select>
          </div>
        </div>
      </div>`;
  }).join("") : `<div class="vazio">Nenhum pedido aqui ainda.</div>`;
}
$("filtroStatus").onchange = montarPedidos;
$("btnAtualizarPedidos").onclick = () => carregarPedidos();
const PAGA_NA_ENTREGA = ["Dinheiro", "Cartão de débito", "Cartão de crédito"];
// grava mudanças no pedido e atualiza a lista e o financeiro
async function mudarPedido(id, mudancas, msg) {
  const r = await ocupado("Salvando...", async () => {
    return checar(await db.from("pedidos").update(mudancas).eq("id", id).select().single());
  });
  if (r) {
    const i = pedidos.findIndex(x => x.id === id);
    if (i >= 0) pedidos[i] = r;
    const j = finPedidos.findIndex(x => x.id === id);
    if (j >= 0) finPedidos[j] = { ...finPedidos[j], ...r };
    avisar(msg);
  }
  montarPedidos();
  if (!$("abaFinanceiro").classList.contains("oculto")) montarFinanceiro();
  return !!r;
}
async function aoMudarPedido(ev) {
  const s = ev.target.closest("[data-status]");
  const pg = ev.target.closest("[data-pago]");
  if (pg) {
    const pago = pg.checked;
    await mudarPedido(pg.dataset.pago, { pago }, pago ? "Pagamento marcado como recebido" : "Pagamento desmarcado");
    return;
  }
  if (!s) return;
  const id = s.dataset.status, novo = s.value;
  const p = pedidos.find(x => x.id === id) || finPedidos.find(x => x.id === id);
  const mudancas = { status: novo };
  // entregou e o cliente paga na entrega? pergunta se já recebeu
  if (novo === "entregue" && p && !p.pago && PAGA_NA_ENTREGA.includes(p.pagamento)
      && confirm(`Pagamento na entrega (${p.pagamento}). Já recebeu ${real(p.total)}? Marcar como pago também?`)) {
    mudancas.pago = true;
  }
  if (novo === "entregue" && p && !p.pago && p.pagamento === "Pix" && !mudancas.pago
      && confirm(`O Pix de ${real(p.total)} já caiu? Marcar como pago também?`)) {
    mudancas.pago = true;
  }
  await mudarPedido(id, mudancas, `Pedido marcado como ${STATUS[novo].toLowerCase()}${mudancas.pago ? " e pago" : ""}`);
}
$("listaPedidos").addEventListener("change", aoMudarPedido);
// confere pedido novo a cada minuto enquanto o painel está aberto
setInterval(() => { if (loja && document.visibilityState === "visible") carregarPedidos(true); }, 60000);

// ================= financeiro =================
// Base de tudo: pedidos FEITOS no período (criado_em), na loja aberta ou em todas (master).
// Cada número sai dessa mesma lista, pra numerador e denominador baterem.
let finPedidos = [];
let finPeriodoTxt = "";

function inicioDoDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function somaDias(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoLocal(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dataBr(d) { return d.toLocaleDateString("pt-BR"); }

function periodoEscolhido() {
  const hoje = inicioDoDia(new Date());
  const p = $("finPeriodo").value;
  if (p === "hoje") return [hoje, somaDias(hoje, 1)];
  if (p === "7") return [somaDias(hoje, -6), somaDias(hoje, 1)];
  if (p === "30") return [somaDias(hoje, -29), somaDias(hoje, 1)];
  if (p === "mes") return [new Date(hoje.getFullYear(), hoje.getMonth(), 1), somaDias(hoje, 1)];
  if (p === "mesPassado") return [new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1), new Date(hoje.getFullYear(), hoje.getMonth(), 1)];
  const de = $("finDe").value ? new Date($("finDe").value + "T00:00") : somaDias(hoje, -29);
  const ate = $("finAte").value ? somaDias(new Date($("finAte").value + "T00:00"), 1) : somaDias(hoje, 1);
  return ate > de ? [de, ate] : [ate, de];
}

async function carregarFinanceiro() {
  if (!loja) return;
  const master = perfil?.papel === "master";
  $("finEscopo").classList.toggle("oculto", !master);
  const todas = master && $("finEscopo").value === "todas";
  const [de, ate] = periodoEscolhido();
  finPeriodoTxt = `${dataBr(de)} a ${dataBr(somaDias(ate, -1))}`;
  const ok = await ocupado("Somando...", async () => {
    let q = db.from("pedidos").select("*").gte("criado_em", de.toISOString()).lt("criado_em", ate.toISOString())
      .order("criado_em").limit(5000);
    if (!todas) q = q.eq("loja_id", loja.id);
    finPedidos = checar(await q);
    return true;
  });
  if (!ok) return;
  $("finLegenda").textContent = `Pedidos feitos de ${finPeriodoTxt}${todas ? ", todas as lojas" : ` · ${loja.config.nome}`}.`;
  montarFinanceiro();
}

function resumoFin(lista) {
  const soma = l => l.reduce((s, p) => s + Number(p.total || 0), 0);
  const validos = lista.filter(p => p.status !== "cancelado");
  const entregues = lista.filter(p => p.status === "entregue");
  const pagos = validos.filter(p => p.pago);
  const receber = entregues.filter(p => !p.pago);
  const andamento = lista.filter(p => ["novo", "confirmado"].includes(p.status));
  const cancelados = lista.filter(p => p.status === "cancelado");
  return {
    pedidos: validos.length,
    vendido: soma(entregues), nEntregues: entregues.length,
    recebido: soma(pagos), nPagos: pagos.length,
    receber: soma(receber), nReceber: receber.length, listaReceber: receber,
    andamento: soma(andamento), nAndamento: andamento.length,
    cancelado: soma(cancelados), nCancelados: cancelados.length,
    ticket: entregues.length ? soma(entregues) / entregues.length : 0,
    entregues,
  };
}

function montarFinanceiro() {
  const r = resumoFin(finPedidos);
  const kpi = (rotulo, valor, extra) => `<div class="kpi"><div class="rotulo">${rotulo}</div><div class="valor">${valor}</div><div class="extra">${extra}</div></div>`;
  const qtd = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  $("finKpis").innerHTML = [
    kpi("Vendido (entregue)", real(r.vendido), qtd(r.nEntregues, "pedido entregue", "pedidos entregues")),
    kpi("Recebido", real(r.recebido), qtd(r.nPagos, "pedido pago", "pedidos pagos")),
    kpi("A receber", real(r.receber), qtd(r.nReceber, "entregue sem pagamento", "entregues sem pagamento")),
    kpi("Em andamento", real(r.andamento), qtd(r.nAndamento, "pedido ainda não entregue", "pedidos ainda não entregues")),
    kpi("Ticket médio", real(r.ticket), "por pedido entregue"),
    kpi("Cancelados", real(r.cancelado), qtd(r.nCancelados, "pedido", "pedidos")),
  ].join("");

  // por loja (só quando a master olha todas)
  const todas = perfil?.papel === "master" && $("finEscopo").value === "todas";
  $("finPorLojaBox").classList.toggle("oculto", !todas);
  if (todas) {
    const linhas = lojas.map(l => ({ l, r: resumoFin(finPedidos.filter(p => p.loja_id === l.id)) }))
      .filter(x => x.r.pedidos || x.r.nCancelados).sort((a, b) => b.r.vendido - a.r.vendido);
    $("finPorLoja").innerHTML = `<thead><tr><th>Loja</th><th class="num">Pedidos</th><th class="num">Vendido</th><th class="num">Recebido</th><th class="num">A receber</th></tr></thead>
      <tbody>${linhas.map(({ l, r }) => `<tr><td>${escaparHtml(l.config.nome)}</td><td class="num">${r.pedidos}</td><td class="num">${real(r.vendido)}</td><td class="num">${real(r.recebido)}</td><td class="num">${real(r.receber)}</td></tr>`).join("") || `<tr><td colspan="5">Nenhum pedido no período.</td></tr>`}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${r.pedidos}</td><td class="num">${real(r.vendido)}</td><td class="num">${real(r.recebido)}</td><td class="num">${real(r.receber)}</td></tr></tfoot>`;
  }

  montarGraficoDias(r.entregues);

  // por forma de pagamento (pedidos entregues)
  const formas = {};
  r.entregues.forEach(p => {
    const f = p.pagamento || "Não informado";
    formas[f] = formas[f] || { n: 0, total: 0, pago: 0 };
    formas[f].n++; formas[f].total += Number(p.total); if (p.pago) formas[f].pago += Number(p.total);
  });
  const fl = Object.entries(formas).sort((a, b) => b[1].total - a[1].total);
  $("finFormas").innerHTML = fl.length ? `<thead><tr><th>Forma</th><th class="num">Pedidos</th><th class="num">Vendido</th><th class="num">Recebido</th></tr></thead>
    <tbody>${fl.map(([f, v]) => `<tr><td>${escaparHtml(f)}</td><td class="num">${v.n}</td><td class="num">${real(v.total)}</td><td class="num">${real(v.pago)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${r.nEntregues}</td><td class="num">${real(r.vendido)}</td><td class="num">${real(r.entregues.filter(p => p.pago).reduce((s, p) => s + Number(p.total), 0))}</td></tr></tfoot>`
    : `<tbody><tr><td>Nenhum pedido entregue no período.</td></tr></tbody>`;

  // produtos mais vendidos (pedidos entregues)
  const prods = {};
  r.entregues.forEach(p => (p.itens || []).forEach(i => {
    const k = `${i.nome}${i.detalhe ? ` (${i.detalhe})` : ""}`;
    prods[k] = prods[k] || { qtd: 0, valor: 0 };
    prods[k].qtd += Number(i.qtd || 0); prods[k].valor += Number(i.preco || 0) * Number(i.qtd || 0);
  }));
  const pl = Object.entries(prods).sort((a, b) => b[1].valor - a[1].valor).slice(0, 10);
  $("finProdutos").innerHTML = pl.length ? `<thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Valor</th></tr></thead>
    <tbody>${pl.map(([n, v]) => `<tr><td>${escaparHtml(n)}</td><td class="num">${v.qtd}</td><td class="num">${real(v.valor)}</td></tr>`).join("")}</tbody>`
    : `<tbody><tr><td>Nenhum produto entregue no período.</td></tr></tbody>`;

  // a receber
  const nomeLoja = id => lojas.find(l => l.id === id)?.config.nome || "";
  $("finReceber").innerHTML = r.listaReceber.length ? r.listaReceber.map(p => `
    <div class="linha-adm">
      <div class="meio">
        <div class="nome">${escaparHtml(p.cliente?.nome || "Cliente")} · ${real(p.total)}</div>
        <div class="sub">${new Date(p.criado_em).toLocaleDateString("pt-BR")} · ${escaparHtml(p.pagamento || "")}${todas ? " · " + escaparHtml(nomeLoja(p.loja_id)) : ""}${p.cliente?.telefone ? " · " + escaparHtml(p.cliente.telefone) : ""}</div>
      </div>
      <button class="btn-secundario" data-pago-rapido="${p.id}" style="padding:8px 12px">💰 Marcar pago</button>
    </div>`).join("") : `<div class="vazio" style="padding:12px 0">Nada a receber nesse período. 👍</div>`;
}

// gráfico de barras: valor entregue por dia (uma série, na cor da loja)
function montarGraficoDias(entregues) {
  const [de, ate] = periodoEscolhido();
  const dias = [];
  for (let d = new Date(de); d < ate && dias.length < 93; d = somaDias(d, 1)) dias.push(isoLocal(d));
  const porDia = Object.fromEntries(dias.map(d => [d, { total: 0, n: 0 }]));
  entregues.forEach(p => { const k = isoLocal(new Date(p.criado_em)); if (porDia[k]) { porDia[k].total += Number(p.total); porDia[k].n++; } });
  const max = Math.max(0, ...dias.map(d => porDia[d].total));
  const passo = Math.ceil(dias.length / 8); // no máximo ~8 datas escritas embaixo
  const fmtDia = d => d.split("-").reverse().slice(0, 2).join("/");
  $("finGrafico").innerHTML = max ? dias.map((d, i) => {
    const v = porDia[d], alt = v.total / max * 100;
    const ehMax = v.total === max;
    return `<div class="coluna" data-dica="${fmtDia(d)}: ${real(v.total)} · ${v.n} ${v.n === 1 ? "pedido" : "pedidos"}" aria-label="${fmtDia(d)}: ${real(v.total)}">
      ${ehMax ? `<span class="rotulo-max" style="bottom:calc(${alt}% + 4px)">${real(v.total)}</span>` : ""}
      <div class="barra" style="height:${alt}%"></div>
      ${i % passo === 0 ? `<span class="dia">${fmtDia(d)}</span>` : ""}
    </div>`;
  }).join("") : `<div class="vazio">Nenhuma venda entregue no período.</div>`;
  $("finTabelaDia").innerHTML = `<thead><tr><th>Dia</th><th class="num">Pedidos</th><th class="num">Vendido</th></tr></thead>
    <tbody>${dias.filter(d => porDia[d].n).map(d => `<tr><td>${fmtDia(d)}</td><td class="num">${porDia[d].n}</td><td class="num">${real(porDia[d].total)}</td></tr>`).join("") || `<tr><td colspan="3">Sem vendas entregues.</td></tr>`}</tbody>`;
}

// dica ao passar o mouse / tocar numa barra
const dicaGrafico = document.createElement("div");
dicaGrafico.className = "dica-grafico oculto";
document.body.appendChild(dicaGrafico);
function mostrarDica(ev) {
  const col = ev.target.closest("#finGrafico .coluna");
  if (!col) { dicaGrafico.classList.add("oculto"); return; }
  dicaGrafico.textContent = col.dataset.dica;
  dicaGrafico.classList.remove("oculto");
  const x = Math.min(ev.clientX + 12, window.innerWidth - dicaGrafico.offsetWidth - 8);
  dicaGrafico.style.left = Math.max(8, x) + "px";
  dicaGrafico.style.top = (ev.clientY - 40) + "px";
}
$("finGrafico").addEventListener("mousemove", mostrarDica);
$("finGrafico").addEventListener("click", mostrarDica);
$("finGrafico").addEventListener("mouseleave", () => dicaGrafico.classList.add("oculto"));

$("finPeriodo").onchange = () => {
  $("finDatas").classList.toggle("oculto", $("finPeriodo").value !== "personalizado");
  if ($("finPeriodo").value === "personalizado") {
    if (!$("finDe").value) $("finDe").value = isoLocal(somaDias(new Date(), -29));
    if (!$("finAte").value) $("finAte").value = isoLocal(new Date());
  }
  carregarFinanceiro();
};
$("finDe").onchange = carregarFinanceiro;
$("finAte").onchange = carregarFinanceiro;
$("finEscopo").onchange = carregarFinanceiro;
$("finReceber").addEventListener("click", ev => {
  const b = ev.target.closest("[data-pago-rapido]");
  if (b) mudarPedido(b.dataset.pagoRapido, { pago: true }, "Pagamento marcado como recebido");
});

// planilha (abre no Excel): todos os pedidos do período
$("btnBaixarFin").onclick = () => {
  if (!finPedidos.length) { avisar("Nenhum pedido no período"); return; }
  const nomeLoja = id => lojas.find(l => l.id === id)?.config.nome || "";
  const num = v => String(Number(v || 0).toFixed(2)).replace(".", ",");
  const cel = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linhas = [["Data", "Loja", "Pedido", "Cliente", "Telefone", "Status", "Pago", "Pago em", "Pagamento", "Taxa entrega", "Total", "Data entrega", "Horário", "Bairro", "Cidade", "Itens"]];
  finPedidos.forEach(p => linhas.push([
    new Date(p.criado_em).toLocaleString("pt-BR"), nomeLoja(p.loja_id), p.numero, p.cliente?.nome, p.cliente?.telefone,
    STATUS[p.status] || p.status, p.pago ? "Sim" : "Não", p.pago_em ? new Date(p.pago_em).toLocaleString("pt-BR") : "",
    p.pagamento, num(p.taxa), num(p.total), (p.entrega?.data || "").split("-").reverse().join("/"), p.entrega?.horario,
    p.entrega?.bairro, p.entrega?.cidade, (p.itens || []).map(i => `${i.qtd}x ${i.nome}${i.detalhe ? ` (${i.detalhe})` : ""}`).join(" | "),
  ]));
  const csv = "﻿" + linhas.map(l => l.map(cel).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `faturamento_${$("finEscopo").value === "todas" ? "todas-lojas" : loja.slug}_${finPeriodoTxt.replace(/\//g, "-").replace(/ a /, "_a_")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

// ================= aviso de pedido novo (notificação no aparelho) =================
const FUNC_AVISO = SUPA_URL + "/functions/v1/avisar-pedido";
const EH_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const INSTALADO = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function suportaAvisos() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
function chaveParaBytes(b64) {
  const s = atob((b64 + "=".repeat((4 - b64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
async function inscricaoDoAparelho() {
  if (!suportaAvisos()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function montarAvisos() {
  const cartao = $("cartaoAvisos"), det = $("avisosDetalhe");
  const mostrar = ligado => {
    cartao.classList.toggle("ligado", ligado);
    $("avisosTitulo").textContent = ligado ? "🔔 Avisos ligados neste aparelho" : "🔔 Aviso de pedido novo";
    $("btnLigarAvisos").classList.toggle("oculto", ligado);
    $("btnTestarAvisos").classList.toggle("oculto", !ligado);
    $("btnDesligarAvisos").classList.toggle("oculto", !ligado);
  };
  $("btnLigarAvisos").disabled = false;
  if (!suportaAvisos()) {
    mostrar(false);
    $("btnLigarAvisos").disabled = true;
    det.textContent = EH_IOS && !INSTALADO
      ? "No iPhone: primeiro instale o Painel na tela de início (Compartilhar → Adicionar à Tela de Início) e abra por lá."
      : "Este navegador não aceita avisos. Use o Chrome (Android ou computador) ou o Painel instalado no iPhone.";
    return;
  }
  if (Notification.permission === "denied") {
    mostrar(false);
    $("btnLigarAvisos").disabled = true;
    det.textContent = "As notificações estão bloqueadas pra este site no navegador. Libere nas configurações do site e abra o painel de novo.";
    return;
  }
  let ligado = false, outraLoja = "";
  try {
    const sub = await inscricaoDoAparelho();
    if (sub) {
      const { data } = await db.from("push_inscricoes").select("id,loja_id").eq("endpoint", sub.endpoint).maybeSingle();
      ligado = !!data && data.loja_id === loja?.id;
      if (data && !ligado) outraLoja = lojas.find(l => l.id === data.loja_id)?.config.nome || "outra loja";
    }
  } catch (e) { console.warn(e); }
  mostrar(ligado);
  det.textContent = ligado
    ? (perfil?.papel === "master" ? `Você recebe aqui os pedidos de ${loja.config.nome}.` : "Você recebe aqui os pedidos da sua loja.")
    : outraLoja ? `Este aparelho recebe os pedidos de ${outraLoja}. Ligar aqui troca para esta loja.`
    : "Receba uma notificação neste aparelho quando chegar pedido.";
}

$("btnLigarAvisos").onclick = async () => {
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") { avisar("Sem permitir as notificações o aviso não aparece"); montarAvisos(); return; }
  const ok = await ocupado("Ligando avisos...", async () => {
    const { publica } = await (await fetch(FUNC_AVISO)).json();
    if (!publica) throw new Error("Não deu pra ligar os avisos agora. Tente de novo.");
    const chave = chaveParaBytes(publica);
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // inscrição antiga com outra chave: refaz
    if (sub && sub.options?.applicationServerKey) {
      const atual = new Uint8Array(sub.options.applicationServerKey);
      if (atual.length !== chave.length || atual.some((b, i) => b !== chave[i])) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
    const j = sub.toJSON();
    const { data: { user } } = await db.auth.getUser();
    await db.from("push_inscricoes").delete().eq("endpoint", j.endpoint); // só apaga se for dela mesma
    checar(await db.from("push_inscricoes").insert({
      user_id: user.id,
      loja_id: loja.id,
      endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
      aparelho: navigator.userAgent.slice(0, 150),
    }));
    return true;
  });
  await montarAvisos();
  if (ok) avisar("Avisos ligados! Toque em Testar pra ver como chega.");
};

$("btnTestarAvisos").onclick = async () => {
  const r = await ocupado("Mandando aviso de teste...", async () => {
    const { data: { session } } = await db.auth.getSession();
    const resp = await fetch(FUNC_AVISO, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
      body: JSON.stringify({ teste: true }),
    });
    const j = await resp.json();
    if (!resp.ok) throw new Error(j.erro || "falhou");
    return j;
  });
  if (r) avisar(r.enviados ? "Aviso de teste enviado — deve aparecer em segundos" : "Nenhum aparelho recebeu. Desligue e ligue os avisos de novo.");
};

$("btnDesligarAvisos").onclick = async () => {
  await ocupado("Desligando...", async () => {
    const sub = await inscricaoDoAparelho();
    if (sub) {
      await db.from("push_inscricoes").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    return true;
  });
  await montarAvisos();
  avisar("Avisos desligados neste aparelho");
};

// tocou na notificação com o painel aberto: vai pra aba Pedidos
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", ev => {
    if (ev.data?.tipo === "abrir-pedidos" && loja) trocarAba("pedidos");
  });
}

// ================= lojas (só master) =================
function slugDe(texto) {
  return String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
let slugMexido = false;
$("nlNome").oninput = () => { if (!slugMexido) $("nlSlug").value = slugDe($("nlNome").value); mostrarLinkNovo(); };
$("nlSlug").oninput = () => { slugMexido = true; mostrarLinkNovo(); };
function mostrarLinkNovo() {
  const s = slugDe($("nlSlug").value);
  $("nlLink").textContent = s ? `A loja vai ficar em: ${location.origin}${location.pathname.replace(/admin\.html$/, "")}index.html?loja=${s}` : "Só letras minúsculas, números e hífen";
}
$("btnCriarLoja").onclick = async () => {
  const nome = $("nlNome").value.trim();
  const slug = slugDe($("nlSlug").value || nome);
  if (!nome || !slug) { avisar("Preencha o nome da loja"); return; }
  const nova = await ocupado("Criando loja...", async () => {
    const config = configParaBanco({ ...copia(CONFIG_PADRAO), nome });
    config.banners[0].titulo = nome;
    return checar(await db.from("lojas").insert({ slug, nome, config }).select("id").single());
  });
  if (!nova) return;
  $("nlNome").value = ""; $("nlSlug").value = ""; slugMexido = false; mostrarLinkNovo();
  await carregarLojas();
  await montarLojas();
  avisar(`Loja "${nome}" criada. Agora convide quem vai administrar.`);
};

async function montarLojas() {
  if (perfil?.papel !== "master") return;
  let perfis = [], convites = [];
  await ocupado("Carregando lojas...", async () => {
    perfis = checar(await db.from("perfis").select("user_id,email,nome,papel,loja_id"));
    convites = checar(await db.from("convites").select("email,papel,loja_id"));
  });
  const base = `${location.origin}${location.pathname.replace(/admin\.html$/, "")}index.html?loja=`;
  $("listaLojas").innerHTML = lojas.map(l => {
    const adms = perfis.filter(p => p.loja_id === l.id);
    const pend = convites.filter(c => c.loja_id === l.id);
    return `
      <div class="loja-card">
        <div class="cab">
          <b>${escaparHtml(l.config.nome)}</b>
          <label class="chave"><input type="checkbox" data-ativa="${l.id}" ${l.ativa ? "checked" : ""}> No ar</label>
        </div>
        <div class="link"><a href="${base}${encodeURIComponent(l.slug)}" target="_blank" rel="noopener">${base}${escaparHtml(l.slug)}</a></div>
        <ul class="pessoas">
          ${adms.map(p => `<li><span>👤 ${escaparHtml(p.email)}${p.papel === "equipe" ? ` <span class="pendente">equipe</span>` : ""}</span><button data-tirar-adm="${p.user_id}" data-email="${escaparHtml(p.email)}">tirar acesso</button></li>`).join("")}
          ${pend.map(c => `<li><span>✉️ ${escaparHtml(c.email)} <span class="pendente">aguardando criar conta</span></span><button data-tirar-convite="${escaparHtml(c.email)}">cancelar</button></li>`).join("")}
          ${!adms.length && !pend.length ? `<li class="ajuda" style="margin:0">Ninguém administra essa loja ainda.</li>` : ""}
        </ul>
        <div class="linha-convite">
          <input type="email" placeholder="e-mail de quem vai administrar" data-email-convite="${l.id}">
          <button class="btn-secundario" data-convidar="${l.id}">Liberar acesso</button>
        </div>
        <div class="rodape-loja"><button class="link-perigo" data-apagar-loja="${l.id}">Apagar loja</button></div>
      </div>`;
  }).join("") || `<div class="vazio">Nenhuma loja ainda.</div>`;
}
$("listaLojas").addEventListener("change", async ev => {
  const chave = ev.target.closest("[data-ativa]");
  if (!chave) return;
  const id = chave.dataset.ativa, ativa = chave.checked;
  if (!ativa && !confirm("Tirar a loja do ar? Os clientes deixam de ver os produtos até você ligar de novo.")) { chave.checked = true; return; }
  const r = await ocupado("Salvando...", async () => { checar(await db.from("lojas").update({ ativa }).eq("id", id)); return true; });
  if (r) { const l = lojas.find(x => x.id === id); if (l) l.ativa = ativa; montarSeletor(); avisar(ativa ? "Loja no ar" : "Loja fora do ar"); }
  else chave.checked = !ativa;
});
$("listaLojas").addEventListener("click", async ev => {
  const conv = ev.target.closest("[data-convidar]");
  const tirarAdm = ev.target.closest("[data-tirar-adm]");
  const tirarConv = ev.target.closest("[data-tirar-convite]");
  if (conv) {
    const lojaId = conv.dataset.convidar;
    const email = document.querySelector(`[data-email-convite="${lojaId}"]`).value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { avisar("Digite um e-mail válido"); return; }
    const r = await ocupado("Liberando...", async () => {
      checar(await db.from("convites").insert({ email, papel: "adm", loja_id: lojaId }));
      return true;
    });
    if (r) { avisar("Acesso liberado: a pessoa cria a conta no painel com esse e-mail"); montarLojas(); }
  } else if (tirarAdm) {
    if (!confirm(`Tirar o acesso de ${tirarAdm.dataset.email} ao painel dessa loja?`)) return;
    const r = await ocupado("Salvando...", async () => { checar(await db.from("perfis").delete().eq("user_id", tirarAdm.dataset.tirarAdm)); return true; });
    if (r) { avisar("Acesso retirado"); montarLojas(); }
  } else if (tirarConv) {
    const r = await ocupado("Salvando...", async () => { checar(await db.from("convites").delete().eq("email", tirarConv.dataset.tirarConvite)); return true; });
    if (r) { avisar("Convite cancelado"); montarLojas(); }
  } else if (ev.target.closest("[data-apagar-loja]")) {
    apagarLoja(ev.target.closest("[data-apagar-loja]").dataset.apagarLoja);
  }
});

// apaga a loja inteira: produtos, pedidos, acessos, convites, mensalidades e arquivos. Não tem volta.
async function contar(tabela, lojaId) {
  const { count } = await db.from(tabela).select("id", { count: "exact", head: true }).eq("loja_id", lojaId);
  return count || 0;
}
async function apagarPasta(balde, lojaId) {
  for (let i = 0; i < 20; i++) { // até 20 rodadas de 100 arquivos
    const { data, error } = await db.storage.from(balde).list(lojaId, { limit: 100 });
    if (error || !data?.length) return;
    const caminhos = data.filter(f => f.name && !f.name.startsWith(".")).map(f => `${lojaId}/${f.name}`);
    if (!caminhos.length) return;
    const { error: e2 } = await db.storage.from(balde).remove(caminhos);
    if (e2) { console.warn("arquivos não apagados", e2.message); return; }
  }
}
async function apagarLoja(id) {
  const l = lojas.find(x => x.id === id);
  if (!l) return;
  const nome = l.config.nome;
  const n = await ocupado("Conferindo a loja...", async () => ({
    produtos: await contar("produtos", id), pedidos: await contar("pedidos", id), mensalidades: await contar("mensalidades", id),
  }));
  if (!n) return;
  const digitado = prompt(
    `Apagar a loja "${nome}" PARA SEMPRE?\n\n` +
    `Vai junto: ${n.produtos} produto(s), ${n.pedidos} pedido(s), ${n.mensalidades} mensalidade(s), as fotos, ` +
    `e o acesso de quem administra (a conta da pessoa continua existindo, só fica sem loja).\n` +
    `Não dá pra desfazer. Se só quiser esconder dos clientes, use "No ar".\n\n` +
    `Pra confirmar, digite o nome da loja:`);
  if (digitado == null) return;
  if (digitado.trim().toLowerCase() !== String(nome).trim().toLowerCase()) { avisar("Nome diferente: a loja NÃO foi apagada"); return; }
  const r = await ocupado("Apagando a loja...", async () => {
    checar(await db.from("lojas").delete().eq("id", id).select("id").single());
    await apagarPasta("imagens", id);   // fotos dos produtos, banners e logo
    await apagarPasta("cobrancas", id); // notas e boletos da mensalidade
    return true;
  });
  if (!r) return;
  try { if (localStorage.getItem(CHAVE_LOJA_PAINEL) === id) localStorage.removeItem(CHAVE_LOJA_PAINEL); } catch (e) {}
  await carregarLojas();
  if (loja?.id === id) {
    loja = null;
    pararVigia();
    if (lojas.length) await abrirLoja(lojas[0].id);
  }
  montarSeletor();
  trocarAba("lojas");
  avisar(`Loja "${nome}" apagada`);
}

// ================= capa: banners =================
const CORES = ["#2f6b3a", "#1f5f8b", "#e0742b", "#b3261e", "#7b4fa0", "#8a5a2b", "#1f2a1f"];
const POSICOES = [
  ["topo-esquerda", "↖"], ["topo-centro", "↑"], ["topo-direita", "↗"],
  ["meio-esquerda", "←"], ["meio-centro", "•"], ["meio-direita", "→"],
  ["baixo-esquerda", "↙"], ["baixo-centro", "↓"], ["baixo-direita", "↘"],
];
let bannerEd = null; // banner aberto no editor (cópia)

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
    montarListaBanners();
    salvarConfig("Ordem dos banners salva");
  } else if (ed) {
    abrirBanner(lista[Number(ed.dataset.editarBanner)]);
  }
};
$("btnNovoBanner").onclick = () => abrirBanner(null);

function abrirBanner(b) {
  bannerEd = b ? copia(b) : { ...novoBanner(), cor: loja.config.corPrincipal || "#2f6b3a" };
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

$("btnSalvarBanner").onclick = async () => {
  if (!bannerEd) return;
  if (!bannerEd.img && !bannerEd.titulo.trim() && !bannerEd.sub.trim()) {
    avisar("Coloque uma imagem ou pelo menos um título");
    return;
  }
  const { _novo, ...b } = bannerEd;
  b.titulo = b.titulo.trim(); b.sub = b.sub.trim(); b.botaoTexto = b.botaoTexto.trim();
  if (ehDataUrl(b.img)) {
    const url = await ocupado("Enviando imagem...", () => enviarImagem(loja.id, b.img));
    if (!url) return;
    b.img = url;
  }
  const lista = loja.config.banners;
  const antes = copia(lista);
  const i = lista.findIndex(x => x.id === b.id);
  const imgVelha = i >= 0 ? lista[i].img : "";
  if (i >= 0) lista[i] = b; else lista.push(b);
  if (await salvarConfig("Banner salvo")) {
    if (imgVelha && imgVelha !== b.img) apagarImagem(imgVelha);
    fecharBanner(); montarListaBanners();
  }
  else loja.config.banners = antes;
};
$("btnExcluirBanner").onclick = async () => {
  if (!bannerEd || !confirm("Excluir este banner? Não dá pra desfazer.")) return;
  const antes = copia(loja.config.banners);
  const imgVelha = (antes.find(x => x.id === bannerEd.id) || {}).img;
  loja.config.banners = loja.config.banners.filter(x => x.id !== bannerEd.id);
  if (await salvarConfig("Banner excluído")) { apagarImagem(imgVelha); fecharBanner(); montarListaBanners(); }
  else loja.config.banners = antes;
};

// altura e tempo de troca salvam na hora
$("cAltura").onchange = ev => { loja.config.alturaBanner = ev.target.value; montarListaBanners(); salvarConfig("Altura dos banners salva"); };
$("cTroca").onchange = ev => { loja.config.trocaBanner = Number(ev.target.value); salvarConfig("Tempo de troca salvo"); };

// ================= capa: identidade e vitrine =================
let logoAtual = "";
let corAtual = "#2f6b3a";
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
  try { logoAtual = await lerImagem(f, 400, "image/png"); mostrarLogo(); }
  catch (e) { avisar("Não consegui abrir essa imagem"); }
  ev.target.value = "";
};
$("btnTirarLogo").onclick = () => { logoAtual = ""; mostrarLogo(); };

$("btnSalvarCapa").onclick = async () => {
  let logo = logoAtual;
  if (ehDataUrl(logo)) {
    logo = await ocupado("Enviando logo...", () => enviarImagem(loja.id, logo));
    if (!logo) return;
    logoAtual = logo;
  }
  const logoVelho = loja.config.logo;
  Object.assign(loja.config, {
    nome: $("cNome").value.trim() || loja.config.nome,
    logo,
    corPrincipal: corAtual,
    mostrarPromocoes: $("cPromo").checked,
    textoBusca: $("cBusca").value.trim(),
  });
  if (await salvarConfig("Identidade e vitrine salvas")) {
    if (logoVelho && logoVelho !== logo) apagarImagem(logoVelho);
    montarListaBanners();
  }
};

// ================= entrega =================
function montarConfig() {
  const c = loja.config;
  $("cNome").value = c.nome;
  $("cPromo").checked = c.mostrarPromocoes !== false;
  $("cBusca").value = c.textoBusca || "";
  $("cAltura").value = c.alturaBanner || "media";
  $("cTroca").value = String(c.trocaBanner ?? 5);
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
    horarios,
    diasSemEntrega: [...document.querySelectorAll("#cDias input:checked")].map(i => Number(i.value)),
    taxaEntrega: taxa || 0,
  });
  salvarConfig("Entrega salva");
};

// o fundo escuro e o Esc fecham qualquer editor aberto
$("fundo").onclick = () => { if (bannerEd) fecharBanner(); else fecharEditor(); };
document.addEventListener("keydown", ev => {
  if (ev.key !== "Escape") return;
  if ($("menuConta").classList.contains("aberto")) fecharMenuConta();
  else if (bannerEd) fecharBanner(); else if (editando) fecharEditor();
});

// ================= minha conta (menu da engrenagem) =================
const ABAS_EQUIPE = [["produtos", "Produtos"], ["estoque", "Estoque"], ["pedidos", "Pedidos"], ["financeiro", "Faturamento"], ["capa", "Identidade"], ["entrega", "Entrega"]];
const NOMES_PAPEL = { master: "Master da plataforma", adm: "Administrador(a) da loja", equipe: "Equipe da loja" };
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
let contaAtual = null;
let abaAntesDaConta = null;

function cuidaDaLoja() { return !!perfil && (perfil.papel === "master" || perfil.papel === "adm"); }
function nomesAbas(abas) {
  const n = ABAS_EQUIPE.filter(([k]) => (abas || []).includes(k)).map(([, t]) => t);
  return n.length ? n.join(", ") : "nenhuma parte";
}
function papelTexto() {
  return NOMES_PAPEL[perfil.papel] + (perfil.papel !== "master" && loja ? ` · ${loja.config.nome}` : "");
}

function abrirMenuConta() {
  if (!perfil) return;
  const nome = perfil.nome || perfil.email;
  $("mcAvatar").textContent = (nome.trim()[0] || "?").toUpperCase();
  $("mcNome").textContent = nome;
  $("mcEmail").textContent = perfil.nome ? perfil.email : "";
  $("mcPapel").textContent = papelTexto();
  $("mcEquipe").classList.toggle("oculto", !cuidaDaLoja() || !loja);
  $("mcMensalidade").classList.toggle("oculto", !cuidaDaLoja() || !loja);
  document.querySelectorAll("#menuConta [data-conta]").forEach(b =>
    b.classList.toggle("ativo", !$("abaConta").classList.contains("oculto") && b.dataset.conta === contaAtual));
  $("menuConta").classList.add("aberto");
  $("fundoConta").classList.remove("oculto");
  $("btnConta").setAttribute("aria-expanded", "true");
}
function fecharMenuConta() {
  $("menuConta").classList.remove("aberto");
  $("fundoConta").classList.add("oculto");
  $("btnConta").setAttribute("aria-expanded", "false");
}
$("btnConta").onclick = () => $("menuConta").classList.contains("aberto") ? fecharMenuConta() : abrirMenuConta();
$("btnFecharConta").onclick = fecharMenuConta;
$("fundoConta").onclick = fecharMenuConta;
$("mcSair").onclick = () => { fecharMenuConta(); $("btnSair").click(); };
$("menuConta").addEventListener("click", ev => {
  const b = ev.target.closest("[data-conta]");
  if (!b) return;
  fecharMenuConta();
  if (b.dataset.conta === "painel") voltarAoPainel(); else abrirConta(b.dataset.conta);
});
$("btnVoltarPainel").onclick = () => voltarAoPainel();

function voltarAoPainel() {
  const destino = abaAntesDaConta && podeAba(abaAntesDaConta) ? abaAntesDaConta : primeiraAba();
  if (destino && loja) trocarAba(destino);
  else avisar("Sua conta ainda não tem nenhuma parte do painel liberada.");
}

function abrirConta(qual) {
  if ((qual === "equipe" || qual === "mensalidade") && (!cuidaDaLoja() || !loja)) qual = "dados";
  if ($("abaConta").classList.contains("oculto")) abaAntesDaConta = document.querySelector(".abas [data-aba].ativo")?.dataset.aba || null;
  contaAtual = qual;
  document.querySelectorAll(".abas [data-aba]").forEach(x => x.classList.remove("ativo"));
  ABAS_PAINEL.forEach(a => $("aba" + a[0].toUpperCase() + a.slice(1)).classList.add("oculto"));
  $("abaConta").classList.remove("oculto");
  ["dados", "senha", "equipe", "mensalidade"].forEach(s =>
    $("conta" + s[0].toUpperCase() + s.slice(1)).classList.toggle("oculto", s !== qual));
  if (qual === "dados") montarMeusDados();
  if (qual === "senha") { ["msAtual", "msNova", "msNova2"].forEach(id => $(id).value = ""); $("msUsuario").value = perfil.email; }
  if (qual === "equipe") montarEquipe();
  if (qual === "mensalidade") montarMensalidades();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ----- meus dados -----
function formatarTel(v) {
  const d = String(v).replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function montarMeusDados() {
  $("mdNome").value = perfil.nome || "";
  $("mdTel").value = perfil.telefone || "";
  $("mdEmail").value = perfil.email;
  $("mdPapel").textContent = papelTexto() + (perfil.papel === "equipe" ? ` · pode acessar: ${nomesAbas(perfil.abas)}` : "");
  // e-mail de pedido: só pra quem cuida dos pedidos de uma loja
  $("blocoAvisoEmail").classList.toggle("oculto", perfil.papel === "master" || !podeAba("pedidos"));
  $("mdAvisoEmail").checked = perfil.aviso_email !== false;
}
$("mdAvisoEmail").onchange = async () => {
  const aviso_email = $("mdAvisoEmail").checked;
  const r = await ocupado("Salvando...", async () =>
    checar(await db.from("perfis").update({ aviso_email }).eq("user_id", perfil.user_id).select().single()));
  if (r) { perfil = { ...perfil, ...r }; avisar(aviso_email ? "Você vai receber e-mail a cada pedido" : "E-mail de pedido desligado"); }
  else $("mdAvisoEmail").checked = !aviso_email;
};
$("btnTesteEmail").onclick = async () => {
  const r = await ocupado("Mandando e-mail de teste...", async () => {
    const { data: { session } } = await db.auth.getSession();
    const resp = await fetch(FUNC_AVISO, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
      body: JSON.stringify({ teste_email: true }),
    });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(j.erro || "Não deu pra mandar o e-mail agora.");
    return true;
  });
  if (r) avisar(`E-mail de teste enviado para ${perfil.email}. Olhe também o spam.`);
};
$("mdTel").oninput = () => { $("mdTel").value = formatarTel($("mdTel").value); };
$("btnSalvarDados").onclick = async () => {
  const nome = $("mdNome").value.trim(), telefone = $("mdTel").value.trim();
  if (telefone && telefone.replace(/\D/g, "").length < 10) { avisar("Telefone com DDD"); return; }
  const r = await ocupado("Salvando...", async () =>
    checar(await db.from("perfis").update({ nome, telefone }).eq("user_id", perfil.user_id).select().single()));
  if (r) { perfil = { ...perfil, ...r }; avisar("Dados salvos"); }
};

// ----- trocar senha (confere a senha atual antes) -----
$("formSenha").addEventListener("submit", async ev => {
  ev.preventDefault();
  const atual = $("msAtual").value, nova = $("msNova").value;
  if (!atual) { avisar("Digite a senha atual"); return; }
  if (nova.length < 8) { avisar("A senha nova precisa ter pelo menos 8 caracteres"); return; }
  if (nova !== $("msNova2").value) { avisar("As duas senhas novas não estão iguais"); return; }
  if (nova === atual) { avisar("A senha nova é igual à atual"); return; }
  const r = await ocupado("Trocando a senha...", async () => {
    const { error } = await db.auth.signInWithPassword({ email: perfil.email, password: atual });
    if (error) throw new Error(/Invalid login credentials/i.test(error.message) ? "Senha atual errada." : erroLogin(error));
    const { error: e2 } = await db.auth.updateUser({ password: nova });
    if (e2) throw new Error(erroLogin(e2));
    return true;
  });
  if (r) { ["msAtual", "msNova", "msNova2"].forEach(id => $(id).value = ""); avisar("Senha trocada"); }
});

// ----- equipe da loja (adm convida e escolhe o que cada um acessa) -----
let equipe = [], convitesEquipe = [];
function chipsAbas(marcadas) {
  return ABAS_EQUIPE.map(([k, t]) =>
    `<label><input type="checkbox" value="${k}" ${(marcadas || []).includes(k) ? "checked" : ""}>${t}</label>`).join("");
}
function quemHtml(p) {
  return `<div class="quem"><b>${escaparHtml(p.nome || p.email)}</b>${p.nome ? `<span>${escaparHtml(p.email)}</span>` : ""}</div>`;
}
async function montarEquipe() {
  if (!loja || !cuidaDaLoja()) return;
  const lojaId = loja.id;
  const ok = await ocupado("Carregando a equipe...", async () => {
    equipe = checar(await db.from("perfis").select("user_id,email,nome,papel,abas").eq("loja_id", lojaId).order("criado_em"));
    convitesEquipe = checar(await db.from("convites").select("email,nome,papel,abas").eq("loja_id", lojaId).order("criado_em"));
    return true;
  });
  if (!ok || lojaId !== loja?.id) return;
  const master = perfil.papel === "master";
  const pessoas = equipe.map(p => p.papel === "adm"
    ? `<div class="pessoa">${quemHtml(p)}<span class="etiqueta">Administrador(a) · acesso a tudo</span></div>`
    : `<div class="pessoa">${quemHtml(p)}
         <div class="permissoes" data-abas-de="${p.user_id}">${chipsAbas(p.abas)}</div>
         <button class="link-perigo" data-tirar-equipe="${p.user_id}" data-email="${escaparHtml(p.email)}">tirar acesso</button></div>`);
  const pendentes = convitesEquipe.map(c => `<div class="pessoa">${quemHtml(c)}
      <span class="pendente">aguardando criar conta · ${c.papel === "equipe" ? "pode acessar: " + nomesAbas(c.abas) : "administrador(a)"}</span>
      ${c.papel === "equipe" || master ? `<button class="link-perigo" data-cancelar-convite="${escaparHtml(c.email)}">cancelar convite</button>` : ""}</div>`);
  $("listaEquipe").innerHTML = [...pessoas, ...pendentes].join("") || `<div class="ajuda" style="margin:0">Ninguém ainda.</div>`;
}
$("listaEquipe").addEventListener("change", async ev => {
  const caixa = ev.target.closest("[data-abas-de]");
  if (!caixa) return;
  const abas = [...caixa.querySelectorAll("input:checked")].map(i => i.value);
  const r = await ocupado("Salvando...", async () => {
    checar(await db.from("perfis").update({ abas }).eq("user_id", caixa.dataset.abasDe).select("user_id").single());
    return true;
  });
  if (r) avisar(abas.length ? "Acesso atualizado" : "Acesso atualizado: essa pessoa não vê nenhuma parte do painel");
  else montarEquipe();
});
$("listaEquipe").addEventListener("click", async ev => {
  const tirar = ev.target.closest("[data-tirar-equipe]");
  const cancelar = ev.target.closest("[data-cancelar-convite]");
  if (tirar) {
    if (!confirm(`Tirar o acesso de ${tirar.dataset.email} ao painel da loja?`)) return;
    const r = await ocupado("Salvando...", async () => {
      checar(await db.from("perfis").delete().eq("user_id", tirar.dataset.tirarEquipe).select("user_id").single());
      return true;
    });
    if (r) { avisar("Acesso retirado"); montarEquipe(); }
  } else if (cancelar) {
    const r = await ocupado("Salvando...", async () => {
      checar(await db.from("convites").delete().eq("email", cancelar.dataset.cancelarConvite));
      return true;
    });
    if (r) { avisar("Convite cancelado"); montarEquipe(); }
  }
});
$("eqAbas").innerHTML = chipsAbas(["pedidos"]);
$("btnConvidarEquipe").onclick = async () => {
  const nome = $("eqNome").value.trim();
  const email = $("eqEmail").value.trim().toLowerCase();
  const abas = [...$("eqAbas").querySelectorAll("input:checked")].map(i => i.value);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { avisar("Digite um e-mail válido"); return; }
  if (email === perfil.email) { avisar("Esse é o seu próprio e-mail"); return; }
  if (!abas.length) { avisar("Marque pelo menos uma parte que a pessoa pode acessar"); return; }
  if (equipe.some(p => p.email === email)) { avisar("Essa pessoa já está na equipe"); return; }
  const r = await ocupado("Liberando...", async () => {
    const { error } = await db.from("convites").insert({ email, nome, papel: "equipe", loja_id: loja.id, abas });
    if (error && /duplicate key|23505/i.test(error.message + error.code)) throw new Error("Esse e-mail já tem um convite esperando.");
    if (error) throw error;
    return true;
  });
  if (r) {
    $("eqNome").value = ""; $("eqEmail").value = ""; $("eqAbas").innerHTML = chipsAbas(["pedidos"]);
    avisar("Acesso liberado: a pessoa cria a conta no painel com esse e-mail");
    montarEquipe();
  }
};

// ----- mensalidade da plataforma (master lança; adm da loja vê e baixa nota/boleto) -----
let mensalidades = [];
function mesRef(iso) { const [a, m] = String(iso).split("-"); return `${MESES[Number(m) - 1]}/${a}`; }
function dataIsoBr(iso) { return String(iso).slice(0, 10).split("-").reverse().join("/"); }
function situacaoMensal(m) {
  if (m.status === "paga") return ["paga", "Paga"];
  if (m.status === "cancelada") return ["cancelado", "Cancelada"];
  if (m.vencimento < isoLocal(new Date())) return ["vencida", "Vencida"];
  return ["aberta", "Em aberto"];
}
function sugerirCobranca() {
  const hoje = new Date();
  $("mmMes").value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  $("mmVenc").value = isoLocal(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 10));
}
async function montarMensalidades() {
  if (!loja || !cuidaDaLoja()) return;
  const master = perfil.papel === "master";
  const lojaId = loja.id;
  $("formMensal").classList.toggle("oculto", !master);
  $("mmPara").textContent = `Cobrança para a loja ${loja.config.nome}. A loja vê na Mensalidade do painel dela.`;
  if (master && !$("mmMes").value) sugerirCobranca();
  $("mmAjuda").textContent = master
    ? `Cobranças lançadas para ${loja.config.nome}.`
    : "Aqui ficam as cobranças da plataforma, com a nota fiscal e o boleto de cada mês.";
  const ok = await ocupado("Carregando...", async () => {
    mensalidades = checar(await db.from("mensalidades").select("*").eq("loja_id", lojaId)
      .order("referencia", { ascending: false }).order("criada_em", { ascending: false }));
    return true;
  });
  if (!ok || lojaId !== loja?.id) return;
  const NOMES_STATUS = { aberta: "Em aberto", paga: "Paga", cancelada: "Cancelada" };
  $("listaMensal").innerHTML = mensalidades.map(m => {
    const [classe, texto] = situacaoMensal(m);
    return `<div class="mensal">
      <div class="cab"><b>${mesRef(m.referencia)}</b><span class="status ${classe}">${texto}</span></div>
      <div class="valor-mensal">${real(Number(m.valor))}</div>
      <div class="det">Vencimento ${dataIsoBr(m.vencimento)}${m.paga_em ? ` · paga em ${new Date(m.paga_em).toLocaleDateString("pt-BR")}` : ""}</div>
      ${m.obs ? `<div class="det">${escaparHtml(m.obs)}</div>` : ""}
      <div class="acoes-pedido">
        ${m.nota ? `<button class="btn-secundario" data-arquivo="${escaparHtml(m.nota)}">📄 Nota fiscal</button>` : ""}
        ${m.boleto ? `<button class="btn-secundario" data-arquivo="${escaparHtml(m.boleto)}">🧾 Boleto</button>` : ""}
        ${master ? `<select data-status-mensal="${m.id}" aria-label="Situação">${Object.entries(NOMES_STATUS).map(([v, n]) =>
          `<option value="${v}" ${m.status === v ? "selected" : ""}>${n}</option>`).join("")}</select>
          <button class="link-perigo" data-apagar-mensal="${m.id}">apagar</button>` : ""}
      </div></div>`;
  }).join("") || `<div class="vazio" style="padding:20px 0">Nenhuma cobrança ainda.</div>`;
  atualizarPontoConta();
}
$("listaMensal").addEventListener("click", async ev => {
  const arq = ev.target.closest("[data-arquivo]");
  const apagar = ev.target.closest("[data-apagar-mensal]");
  if (arq) {
    // abre a janela já no toque (senão o navegador bloqueia) e depois coloca o link temporário
    const janela = window.open("", "_blank");
    const { data, error } = await db.storage.from("cobrancas").createSignedUrl(arq.dataset.arquivo, 300);
    if (error || !data?.signedUrl) { if (janela) janela.close(); avisar("Não deu pra abrir o arquivo agora"); return; }
    if (janela) janela.location = data.signedUrl; else location.href = data.signedUrl;
  } else if (apagar) {
    const m = mensalidades.find(x => x.id === apagar.dataset.apagarMensal);
    if (!m || !confirm(`Apagar a cobrança de ${mesRef(m.referencia)}? A nota e o boleto anexados também são apagados.`)) return;
    const r = await ocupado("Apagando...", async () => {
      checar(await db.from("mensalidades").delete().eq("id", m.id));
      const arquivos = [m.nota, m.boleto].filter(Boolean);
      if (arquivos.length) await db.storage.from("cobrancas").remove(arquivos);
      return true;
    });
    if (r) { avisar("Cobrança apagada"); montarMensalidades(); }
  }
});
$("listaMensal").addEventListener("change", async ev => {
  const s = ev.target.closest("[data-status-mensal]");
  if (!s) return;
  const r = await ocupado("Salvando...", async () => {
    checar(await db.from("mensalidades").update({ status: s.value }).eq("id", s.dataset.statusMensal));
    return true;
  });
  if (r) avisar(s.value === "paga" ? "Marcada como paga" : "Cobrança atualizada");
  montarMensalidades();
});
const TIPOS_COBRANCA = ["application/pdf", "image/jpeg", "image/png"];
async function enviarArquivoCobranca(arquivo, tipo) {
  const ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" }[arquivo.type];
  const caminho = `${loja.id}/${crypto.randomUUID()}-${tipo}.${ext}`;
  checar(await db.storage.from("cobrancas").upload(caminho, arquivo, { contentType: arquivo.type, upsert: false }));
  return caminho;
}
$("btnLancarMensal").onclick = async () => {
  const mes = $("mmMes").value, venc = $("mmVenc").value, valor = numero($("mmValor").value);
  const nota = $("mmNota").files[0], boleto = $("mmBoleto").files[0];
  if (!/^\d{4}-\d{2}$/.test(mes)) { avisar("Escolha o mês cobrado"); return; }
  if (!valor || isNaN(valor) || valor <= 0) { avisar("Valor inválido"); return; }
  if (!venc) { avisar("Escolha o vencimento"); return; }
  for (const f of [nota, boleto].filter(Boolean)) {
    if (!TIPOS_COBRANCA.includes(f.type)) { avisar("Envie a nota e o boleto em PDF, JPG ou PNG"); return; }
    if (f.size > 10 * 1024 * 1024) { avisar("Arquivo maior que 10 MB"); return; }
  }
  const nomeLoja = loja.config.nome;
  const r = await ocupado("Lançando a cobrança...", async () => {
    const enviados = [];
    try {
      const caminhoNota = nota ? await enviarArquivoCobranca(nota, "nota") : "";
      if (caminhoNota) enviados.push(caminhoNota);
      const caminhoBoleto = boleto ? await enviarArquivoCobranca(boleto, "boleto") : "";
      if (caminhoBoleto) enviados.push(caminhoBoleto);
      checar(await db.from("mensalidades").insert({
        loja_id: loja.id, referencia: mes + "-01", valor, vencimento: venc,
        nota: caminhoNota, boleto: caminhoBoleto, obs: $("mmObs").value.trim(),
      }));
    } catch (e) {
      if (enviados.length) await db.storage.from("cobrancas").remove(enviados); // não deixa arquivo solto
      throw e;
    }
    return true;
  });
  if (r) {
    $("mmValor").value = ""; $("mmObs").value = ""; $("mmNota").value = ""; $("mmBoleto").value = "";
    sugerirCobranca();
    avisar(`Cobrança lançada para ${nomeLoja}`);
    montarMensalidades();
  }
};

// bolinha na engrenagem quando o adm tem mensalidade em aberto
async function atualizarPontoConta() {
  let n = 0;
  if (perfil?.papel === "adm" && loja) {
    const { count } = await db.from("mensalidades").select("id", { count: "exact", head: true })
      .eq("loja_id", loja.id).eq("status", "aberta");
    n = count || 0;
  }
  $("pontoConta").classList.toggle("oculto", !n);
  $("contMensal").textContent = n;
  $("contMensal").classList.toggle("oculto", !n);
  $("btnConta").title = n ? `Minha conta · ${n} mensalidade(s) em aberto` : "Minha conta";
}

// ================= alerta de pedido novo com o painel aberto =================
// O pedido chega na hora pelo "tempo real" do Supabase; a cada 60 s uma conferência de reserva
// pega o que tiver escapado (internet caiu, aba dormiu). Toca som, vibra e mostra um alerta até alguém ver.
let pedidosVistos = new Set();
let canalPedidos = null, vigiaLoja = null, alertaQtd = 0, timerSom = null, somCtx = null;
const TITULO_PAGINA = document.title;

function prepararSom() {
  try {
    if (!somCtx) somCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (somCtx.state === "suspended") somCtx.resume();
  } catch (e) { /* sem som neste navegador: o alerta na tela continua */ }
}
// o navegador só libera som depois de um toque na página
["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, prepararSom, { passive: true }));

function tocarSom() {
  if (!somCtx || somCtx.state !== "running") return;
  const t0 = somCtx.currentTime;
  [[0, 880], [0.22, 880], [0.44, 1175]].forEach(([d, freq]) => {
    const o = somCtx.createOscillator(), g = somCtx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.2);
    o.connect(g).connect(somCtx.destination);
    o.start(t0 + d); o.stop(t0 + d + 0.22);
  });
}

function mostrarAlertaPedido(p) {
  alertaQtd++;
  $("alertaTitulo").textContent = alertaQtd > 1 ? `🛒 ${alertaQtd} pedidos novos!` : "🛒 Pedido novo!";
  $("alertaDetalhe").textContent = `${p.cliente?.nome || "Cliente"} · ${real(Number(p.total) || 0)}`;
  $("alertaPedido").classList.remove("oculto");
  document.title = `(${alertaQtd}) Pedido novo! · ${TITULO_PAGINA}`;
  tocarSom();
  try { navigator.vibrate?.([200, 100, 200]); } catch (e) {}
  clearInterval(timerSom);
  timerSom = setInterval(tocarSom, 20000); // repete o som até alguém ver
  carregarPedidos(true);
}
function dispensarAlerta(irParaPedidos) {
  alertaQtd = 0;
  clearInterval(timerSom); timerSom = null;
  $("alertaPedido").classList.add("oculto");
  document.title = TITULO_PAGINA;
  if (irParaPedidos && podeAba("pedidos")) { trocarAba("pedidos"); window.scrollTo({ top: 0, behavior: "smooth" }); }
}
$("btnVerAlerta").onclick = () => dispensarAlerta(true);
$("btnFecharAlerta").onclick = () => dispensarAlerta(false);

function pedidoChegou(p) {
  if (!p || !loja || p.loja_id !== loja.id || p.status !== "novo" || pedidosVistos.has(p.id)) return;
  pedidosVistos.add(p.id);
  mostrarAlertaPedido(p);
}

async function conferirNovos(semAlerta = false) {
  if (!loja || !podeAba("pedidos")) return;
  const lojaId = loja.id;
  const { data, error } = await db.from("pedidos").select("id,loja_id,status,cliente,total")
    .eq("loja_id", lojaId).eq("status", "novo").order("criado_em", { ascending: false }).limit(50);
  if (error || lojaId !== loja?.id) return;
  (data || []).forEach(p => semAlerta ? pedidosVistos.add(p.id) : pedidoChegou(p));
}

function pararVigia() {
  if (canalPedidos) { db.removeChannel(canalPedidos); canalPedidos = null; }
  vigiaLoja = null;
  pedidosVistos = new Set();
  dispensarAlerta(false);
}
async function vigiarPedidos() {
  if (!loja || !podeAba("pedidos")) { pararVigia(); return; }
  if (vigiaLoja === loja.id && canalPedidos) return;
  pararVigia();
  vigiaLoja = loja.id;
  await conferirNovos(true); // o que já estava lá não toca
  canalPedidos = db.channel("pedidos-" + vigiaLoja)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "pedidos", filter: `loja_id=eq.${vigiaLoja}` },
      ev => pedidoChegou(ev.new))
    .subscribe();
}
// reserva: confere a cada 60 s e quando o painel volta a aparecer na tela
setInterval(() => conferirNovos(), 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) conferirNovos(); });

// ================= estoque =================
let movimentos = [], filtroEstoque = "todos", abertoEstoque = null; // abertoEstoque = { id, modo: 'chegou' | 'ajustar' }
const TIPOS_MOV = { entrada: "Chegou", ajuste: "Ajuste de contagem", venda: "Venda", devolucao: "Devolvido (pedido cancelado)" };

function situacaoEstoque(p) {
  if (p.estoque == null) return ["sem", "Não controla"];
  if (p.estoque <= 0) return ["falta", p.estoque < 0 ? "Faltando" : "Esgotado"];
  if (p.estoque <= (p.estoqueMinimo || 0)) return ["baixo", "Baixo"];
  return ["ok", "Em estoque"];
}
// bolinha na aba: quantos produtos esgotados ou abaixo do mínimo
function contarEstoqueBaixo() {
  const n = (loja?.produtos || []).filter(p => ["falta", "baixo"].includes(situacaoEstoque(p)[0])).length;
  $("contEstoque").textContent = n;
  $("contEstoque").classList.toggle("oculto", !n);
}
async function montarEstoque(recarregar = true) {
  if (!loja) return;
  if (recarregar) {
    const lojaId = loja.id;
    const ok = await ocupado("Carregando estoque...", async () => {
      const ps = checar(await db.from("produtos").select("id,estoque,estoque_minimo").eq("loja_id", lojaId));
      ps.forEach(r => {
        const p = loja.produtos.find(x => x.id === r.id);
        if (p) { p.estoque = r.estoque == null ? null : Number(r.estoque); p.estoqueMinimo = Number(r.estoque_minimo || 0); }
      });
      movimentos = checar(await db.from("estoque_movimentos").select("*").eq("loja_id", lojaId)
        .order("criado_em", { ascending: false }).limit(40));
      return true;
    });
    if (!ok || lojaId !== loja?.id) return;
  }
  const ps = loja.produtos;
  const cont = { falta: 0, baixo: 0, ok: 0, sem: 0 };
  ps.forEach(p => cont[situacaoEstoque(p)[0]]++);
  $("estResumo").innerHTML = [["falta", "Esgotados"], ["baixo", "Estoque baixo"], ["ok", "Em estoque"], ["todos", "Todos os produtos"]]
    .map(([f, t]) => `<button data-filtro-est="${f}" class="${filtroEstoque === f ? "ativo" : ""}"><b>${f === "todos" ? ps.length : cont[f]}</b><span>${t}</span></button>`).join("");
  const termo = slugDe($("estBusca").value).replace(/-/g, " ");
  const ordem = { falta: 0, baixo: 1, ok: 2, sem: 3 };
  const lista = ps.filter(p => {
    if (filtroEstoque !== "todos" && situacaoEstoque(p)[0] !== filtroEstoque) return false;
    return !termo || slugDe(`${p.nome} ${p.detalhe} ${p.categoria}`).replace(/-/g, " ").includes(termo);
  }).sort((a, b) => ordem[situacaoEstoque(a)[0]] - ordem[situacaoEstoque(b)[0]] || a.nome.localeCompare(b.nome));
  $("listaEstoque").innerHTML = lista.map(linhaEstoque).join("")
    || `<div class="vazio" style="padding:20px 0">${ps.length ? "Nenhum produto nesse filtro." : "Cadastre produtos na aba Produtos primeiro."}</div>`;
  const nomeDe = id => ps.find(p => p.id === id)?.nome || "Produto apagado";
  $("listaMov").innerHTML = movimentos.map(m => `
    <div class="mov">
      <span class="quando">${new Date(m.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
      <span class="oque">${escaparHtml(nomeDe(m.produto_id))}<small>${TIPOS_MOV[m.tipo] || m.tipo}${m.obs ? " · " + escaparHtml(m.obs) : ""} · ficou ${m.saldo}</small></span>
      <span class="delta ${m.quantidade >= 0 ? "mais" : "menos"}">${m.quantidade > 0 ? "+" : ""}${m.quantidade}</span>
    </div>`).join("") || `<p class="ajuda" style="margin:0">Nada ainda.</p>`;
  contarEstoqueBaixo();
}
function linhaEstoque(p) {
  const [cls, txt] = situacaoEstoque(p);
  const modo = abertoEstoque?.id === p.id ? abertoEstoque.modo : null;
  const sub = [p.detalhe, p.estoque != null && p.estoqueMinimo ? `mínimo ${p.estoqueMinimo}` : "", p.ativo ? "" : "fora da loja"].filter(Boolean).join(" · ");
  const form = modo === "chegou" ? `
    <div class="form-est">
      <div class="linha">
        <div class="campo"><label for="estQtd">Quantidade que chegou</label><input id="estQtd" type="number" min="1" step="1" inputmode="numeric"></div>
        <div class="campo"><label for="estObs">Observação (opcional)</label><input id="estObs" maxlength="200" placeholder="Ex: nota 1234, fornecedor"></div>
      </div>
      <div class="botoes"><button class="btn-principal" data-est-salvar="chegou">Somar ao estoque</button><button class="btn-secundario" data-est-cancelar>Cancelar</button></div>
    </div>` : modo === "ajustar" ? `
    <div class="form-est">
      <label class="chk"><input type="checkbox" id="estControlar" ${p.estoque != null || !abertoEstoque.desligado ? "checked" : ""}> Controlar o estoque deste produto</label>
      <div class="linha">
        <div class="campo"><label for="estContagem">Quantidade que tem agora</label><input id="estContagem" type="number" min="0" step="1" inputmode="numeric" value="${p.estoque ?? ""}"></div>
        <div class="campo"><label for="estMinimo">Avisar quando ficar em</label><input id="estMinimo" type="number" min="0" step="1" inputmode="numeric" value="${p.estoqueMinimo || 0}"></div>
      </div>
      <div class="campo"><label for="estObs">Motivo (opcional)</label><input id="estObs" maxlength="200" placeholder="Ex: contagem do mês, avaria"></div>
      <div class="botoes"><button class="btn-principal" data-est-salvar="ajustar">Salvar</button><button class="btn-secundario" data-est-cancelar>Cancelar</button></div>
    </div>` : "";
  return `
    <div class="linha-est ${cls}" data-est-produto="${p.id}">
      <div class="topo-est">
        <div class="meio"><div class="nome">${escaparHtml(p.nome)}</div><div class="sub">${escaparHtml(sub)}</div></div>
        <div class="qtd-est"><b>${p.estoque == null ? "—" : p.estoque}</b><span class="selo-est ${cls}">${txt}</span></div>
      </div>
      ${modo ? "" : `<div class="botoes-est">
        <button class="btn-principal" data-est-abrir="chegou" data-id="${p.id}">+ Chegou</button>
        <button class="btn-secundario" data-est-abrir="ajustar" data-id="${p.id}">${p.estoque == null ? "Controlar estoque" : "Ajustar"}</button>
      </div>`}
      ${form}
    </div>`;
}
function inteiro(v) { const n = Number(String(v).trim()); return String(v).trim() !== "" && Number.isInteger(n) ? n : null; }

$("abaEstoque").addEventListener("click", async ev => {
  const filtro = ev.target.closest("[data-filtro-est]");
  const abrir = ev.target.closest("[data-est-abrir]");
  const salvar = ev.target.closest("[data-est-salvar]");
  if (filtro) { filtroEstoque = filtro.dataset.filtroEst === filtroEstoque ? "todos" : filtro.dataset.filtroEst; abertoEstoque = null; montarEstoque(false); return; }
  if (abrir) {
    abertoEstoque = { id: abrir.dataset.id, modo: abrir.dataset.estAbrir };
    montarEstoque(false);
    setTimeout(() => ($("estQtd") || $("estContagem"))?.focus(), 0);
    return;
  }
  if (ev.target.closest("[data-est-cancelar]")) { abertoEstoque = null; montarEstoque(false); return; }
  if (ev.target.closest("#btnAtualizarEstoque")) { montarEstoque(); return; }
  if (!salvar || !abertoEstoque) return;
  const p = loja.produtos.find(x => x.id === abertoEstoque.id);
  if (!p) return;
  const obs = ($("estObs")?.value || "").trim();
  if (salvar.dataset.estSalvar === "chegou") {
    const qtd = inteiro($("estQtd").value);
    if (!qtd || qtd <= 0) { avisar("Digite quantas unidades chegaram"); return; }
    const r = await ocupado("Somando ao estoque...", async () =>
      checar(await db.rpc("mover_estoque", { p_produto: p.id, p_tipo: "entrada", p_qtd: qtd, p_obs: obs })));
    if (r == null) return;
    avisar(`+${qtd} ${p.nome}: agora tem ${r}`);
  } else {
    const controlar = $("estControlar").checked;
    const minimo = inteiro($("estMinimo").value) ?? 0;
    const contagem = inteiro($("estContagem").value);
    if (minimo < 0) { avisar("O mínimo não pode ser negativo"); return; }
    if (controlar && (contagem == null || contagem < 0)) { avisar("Digite quantas unidades tem agora"); return; }
    const r = await ocupado("Salvando...", async () => {
      checar(await db.rpc("configurar_estoque", { p_produto: p.id, p_minimo: minimo, p_controlar: controlar }));
      if (controlar && contagem !== p.estoque) {
        checar(await db.rpc("mover_estoque", { p_produto: p.id, p_tipo: "ajuste", p_qtd: contagem, p_obs: obs }));
      }
      return true;
    });
    if (!r) return;
    avisar(controlar ? `${p.nome}: estoque ${contagem}` : `${p.nome}: estoque não é mais controlado`);
  }
  abertoEstoque = null;
  montarEstoque();
});
$("abaEstoque").addEventListener("keydown", ev => {
  if (ev.key === "Enter" && ev.target.matches(".form-est input:not([type=checkbox])")) {
    ev.preventDefault();
    document.querySelector("[data-est-salvar]")?.click();
  }
});
$("estBusca").oninput = () => { abertoEstoque = null; montarEstoque(false); };

// ================= início =================
let recuperandoSenha = false;
db.auth.onAuthStateChange(evento => {
  // veio do link "esqueci a senha" do e-mail: pede a senha nova antes de abrir o painel
  if (evento === "PASSWORD_RECOVERY") { recuperandoSenha = true; setTimeout(() => mostrarLogin("nova-senha"), 0); }
});
(async () => {
  const { data: { session } } = await db.auth.getSession();
  if (recuperandoSenha) return;
  // tira o ?code=... do endereço depois do link de confirmação/recuperação
  if (/[?&]code=/.test(location.search)) history.replaceState(null, "", urlPainel());
  if (session) entrar();
  else mostrarLogin("login");
})();
