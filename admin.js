// Painel: login, lojas (master), produtos, pedidos, capa e entrega — tudo no banco central.

const $ = id => document.getElementById(id);
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const CHAVE_LOJA_PAINEL = "agropet_painel_loja"; // última loja aberta pela master

let perfil = null;   // { papel: 'master' | 'adm', loja_id, email }
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
  $("abaLojasBtn").classList.toggle("oculto", perfil.papel !== "master");
  let escolhida = perfil.papel === "adm" ? perfil.loja_id : null;
  if (!escolhida) { try { escolhida = localStorage.getItem(CHAVE_LOJA_PAINEL); } catch (e) {} }
  if (!lojas.some(l => l.id === escolhida)) escolhida = lojas[0]?.id;
  if (escolhida) await abrirLoja(escolhida);
  else if (perfil.papel === "master") { trocarAba("lojas"); avisar("Crie a primeira loja"); }
  // abriu pelo aviso de pedido novo
  if (escolhida && location.hash === "#pedidos") trocarAba("pedidos");
}

async function carregarLojas() {
  let q = db.from("lojas").select("id,slug,nome,config,ativa,criada_em").order("nome");
  if (perfil.papel === "adm") q = q.eq("id", perfil.loja_id);
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
  carregarPedidos(true);
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
function trocarAba(nome) {
  document.querySelectorAll("[data-aba]").forEach(x => x.classList.toggle("ativo", x.dataset.aba === nome));
  ["produtos", "pedidos", "capa", "entrega", "lojas"].forEach(a =>
    $("aba" + a[0].toUpperCase() + a.slice(1)).classList.toggle("oculto", a !== nome));
  if (nome === "pedidos") { carregarPedidos(); montarAvisos(); }
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
  const lista = pedidos.filter(p => f === "todos" ? true : f === "abertos" ? ["novo", "confirmado"].includes(p.status) : p.status === f);
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
        <div class="det">📍 ${escaparHtml(e.referencia || "")}</div>
        <div class="det">💳 ${escaparHtml(p.pagamento)}${p.troco ? ` (troco para ${escaparHtml(p.troco)})` : ""}${p.obs ? ` · 📝 ${escaparHtml(p.obs)}` : ""}</div>
        <div class="rodape">
          <b>Total ${real(p.total)}</b>
          <select data-status="${p.id}">${Object.entries(STATUS).map(([v, t]) => `<option value="${v}" ${v === p.status ? "selected" : ""}>${t}</option>`).join("")}</select>
        </div>
      </div>`;
  }).join("") : `<div class="vazio">Nenhum pedido aqui ainda.</div>`;
}
$("filtroStatus").onchange = montarPedidos;
$("btnAtualizarPedidos").onclick = () => carregarPedidos();
$("listaPedidos").addEventListener("change", async ev => {
  const s = ev.target.closest("[data-status]");
  if (!s) return;
  const id = s.dataset.status, novo = s.value;
  const r = await ocupado("Salvando...", async () => { checar(await db.from("pedidos").update({ status: novo }).eq("id", id)); return true; });
  if (r) { const p = pedidos.find(x => x.id === id); if (p) p.status = novo; avisar(`Pedido marcado como ${STATUS[novo].toLowerCase()}`); }
  montarPedidos();
});
// confere pedido novo a cada minuto enquanto o painel está aberto
setInterval(() => { if (loja && document.visibilityState === "visible") carregarPedidos(true); }, 60000);

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
  let ligado = false;
  try {
    const sub = await inscricaoDoAparelho();
    if (sub) {
      const { data } = await db.from("push_inscricoes").select("id").eq("endpoint", sub.endpoint).maybeSingle();
      ligado = !!data;
    }
  } catch (e) { console.warn(e); }
  mostrar(ligado);
  det.textContent = ligado
    ? (perfil?.papel === "master" ? "Você recebe aqui os pedidos de todas as lojas." : "Você recebe aqui os pedidos da sua loja.")
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
      loja_id: perfil.papel === "master" ? null : perfil.loja_id,
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
    perfis = checar(await db.from("perfis").select("user_id,email,papel,loja_id"));
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
          ${adms.map(p => `<li><span>👤 ${escaparHtml(p.email)}</span><button data-tirar-adm="${p.user_id}" data-email="${escaparHtml(p.email)}">tirar acesso</button></li>`).join("")}
          ${pend.map(c => `<li><span>✉️ ${escaparHtml(c.email)} <span class="pendente">aguardando criar conta</span></span><button data-tirar-convite="${escaparHtml(c.email)}">cancelar</button></li>`).join("")}
          ${!adms.length && !pend.length ? `<li class="ajuda" style="margin:0">Ninguém administra essa loja ainda.</li>` : ""}
        </ul>
        <div class="linha-convite">
          <input type="email" placeholder="e-mail de quem vai administrar" data-email-convite="${l.id}">
          <button class="btn-secundario" data-convidar="${l.id}">Liberar acesso</button>
        </div>
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
  }
});

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
  salvarConfig("Entrega salva");
};

// o fundo escuro e o Esc fecham qualquer editor aberto
$("fundo").onclick = () => { if (bannerEd) fecharBanner(); else fecharEditor(); };
document.addEventListener("keydown", ev => {
  if (ev.key !== "Escape") return;
  if (bannerEd) fecharBanner(); else if (editando) fecharEditor();
});

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
