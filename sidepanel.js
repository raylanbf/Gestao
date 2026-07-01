const $ = (sel, root = document) => root.querySelector(sel);

let config = { postUrl: "" };
let registros = [];
let abaAtual = { id: null, url: "" };

init();

async function init() {
  const st = await chrome.storage.local.get(["config", "registros"]);
  if (st.config) config = st.config;
  if (Array.isArray(st.registros)) registros = st.registros;

  $("#url").value = config.postUrl || "";
  render();
  rastrearAba();

  $("#salvar").addEventListener("click", salvarConfig);
  $("#registrar").addEventListener("click", registrar);
  $("#manual").addEventListener("click", abrirManual);
  $("#baixar-openapi").addEventListener("click", baixarOpenApi);
}

/* ---------- documentação (Manual / OpenAPI) ---------- */
function abrirManual() {
  chrome.tabs.create({ url: chrome.runtime.getURL("manual.html") });
}

async function baixarOpenApi() {
  const resp = await fetch(chrome.runtime.getURL("openapi.json"));
  const texto = await resp.text();
  const blob = new Blob([texto], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "csc-dashboard-openapi.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- aba ativa ---------- */
function rastrearAba() {
  const upd = () =>
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        abaAtual = { id: tabs[0].id, url: tabs[0].url || "" };
        pintarAba();
      }
    });
  upd();
  chrome.tabs.onActivated.addListener(upd);
  chrome.tabs.onUpdated.addListener((_id, _info, tab) => { if (tab && tab.active) upd(); });
  chrome.windows.onFocusChanged.addListener(upd);
}

function pintarAba() {
  let host = "—";
  try { host = new URL(abaAtual.url).host || "—"; } catch {}
  $("#aba").textContent = host;
}

/* ---------- configuração ---------- */
function salvarConfig() {
  const v = $("#url").value.trim();
  if (v) {
    try { new URL(v); } catch { return setCfgStatus("URL inválida.", "erro"); }
  }
  config.postUrl = v;
  persist();
  setCfgStatus(v ? "URL salva ✓" : "URL removida.", v ? "ok" : "muted");
}

function setCfgStatus(msg, cls) {
  const e = $("#cfg-status");
  e.textContent = msg;
  e.className = cls || "muted";
}

function setStatus(msg, cls) {
  const e = $("#status");
  e.textContent = msg;
  e.className = cls || "muted";
}

function persist() { chrome.storage.local.set({ config, registros }); }

/* ---------- registrar (extrair da página) ---------- */
function registrar() {
  setStatus("");
  if (!abaAtual.id || !abaAtual.url) {
    return setStatus("Não identifiquei a aba ativa. Clique na aba do Dashboard e tente de novo.", "erro");
  }
  let origem;
  try { origem = new URL(abaAtual.url).origin + "/*"; }
  catch { return setStatus("A aba ativa não é uma página web válida.", "erro"); }

  // Pede acesso ao host da aba (dentro do gesto do clique). Se já concedido,
  // não mostra prompt. Uma vez autorizado, funciona mesmo após recarregar.
  chrome.permissions.request({ origins: [origem] }, (granted) => {
    if (!granted) return setStatus("Permissão negada para ler esta página.", "erro");

    chrome.scripting.executeScript(
      { target: { tabId: abaAtual.id }, func: extrairDadosDaPagina },
      (res) => {
        if (chrome.runtime.lastError) {
          return setStatus("Erro ao ler a página: " + chrome.runtime.lastError.message, "erro");
        }
        const r = res && res[0] && res[0].result;
        if (!r) return setStatus("Sem resposta da página.", "erro");
        if (!r.ok) return setStatus("⚠ " + r.motivo, "erro");

        const registro = {
          id: "r_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
          criadoEm: r.dados.extraidoEm,
          dados: r.dados,
          resumo: r.resumo,
          envio: { status: "nao_enviado" },
        };
        registros.unshift(registro);
        persist();
        render();
        setStatus("Registro criado ✓", "ok");
      }
    );
  });
}

/* ---------- render dos cards ---------- */
function render() {
  const lista = $("#lista");
  lista.textContent = "";

  if (!registros.length) {
    const vazio = document.createElement("div");
    vazio.className = "vazio";
    vazio.textContent = "Nenhum registro ainda. Abra o Dashboard e clique em Registrar.";
    lista.appendChild(vazio);
    return;
  }
  for (const reg of registros) lista.appendChild(criarCard(reg));
}

function criarCard(reg) {
  const card = document.createElement("div");
  card.className = "card";

  const head = document.createElement("div");
  head.className = "card-head";
  const dt = document.createElement("div");
  dt.className = "card-data";
  dt.textContent = fmtData(reg.criadoEm);
  const del = document.createElement("button");
  del.className = "icon-btn";
  del.textContent = "✕";
  del.title = "Excluir registro";
  del.addEventListener("click", () => excluir(reg.id));
  head.append(dt, del);

  const chips = document.createElement("div");
  chips.className = "chips";
  const s = reg.resumo || {};
  addChip(chips, "Ranking", s.ranking);
  addChip(chips, "Aberto", s.chamadosEmAberto);
  addChip(chips, "Fechado", s.chamadosFechados);
  if (s.tempoMedioAtendimentoHHMM) addChip(chips, "Tempo", s.tempoMedioAtendimentoHHMM);

  const acoes = document.createElement("div");
  acoes.className = "acoes";
  const bBaixar = document.createElement("button");
  bBaixar.className = "btn-sec";
  bBaixar.textContent = "⬇ Baixar JSON";
  bBaixar.addEventListener("click", () => baixar(reg));
  const bEnviar = document.createElement("button");
  bEnviar.className = "btn-sec";
  bEnviar.textContent = "➤ Enviar";
  bEnviar.disabled = reg.envio && reg.envio.status === "enviando";
  bEnviar.addEventListener("click", () => enviar(reg));
  acoes.append(bBaixar, bEnviar);

  const status = document.createElement("div");
  status.className = "envio-status " + statusClasse(reg.envio);
  status.textContent = statusTexto(reg.envio);

  card.append(head, chips, acoes, status);
  return card;
}

function addChip(container, rotulo, valor) {
  const chip = document.createElement("span");
  chip.className = "chip";
  const b = document.createElement("b");
  b.textContent = valor == null ? "—" : valor;
  chip.append(rotulo + ": ", b);
  container.appendChild(chip);
}

/* ---------- baixar ---------- */
function baixar(reg) {
  const nome = "csc-dashboard_" + carimboDe(reg.criadoEm) + ".json";
  const blob = new Blob([JSON.stringify(reg.dados, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- enviar (POST) ---------- */
function enviar(reg) {
  if (!config.postUrl) {
    return atualizarEnvio(reg, { status: "erro", mensagem: "Configure a URL de destino em 'Configuração de envio'." });
  }
  let origem;
  try { origem = new URL(config.postUrl).origin + "/*"; }
  catch { return atualizarEnvio(reg, { status: "erro", mensagem: "URL de destino inválida." }); }

  chrome.permissions.request({ origins: [origem] }, (granted) => {
    if (!granted) {
      return atualizarEnvio(reg, { status: "erro", mensagem: "Permissão de envio negada para " + origem });
    }
    atualizarEnvio(reg, { status: "enviando" });

    fetch(config.postUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reg.dados),
    })
      .then(async (resp) => {
        let corpo = "";
        try { corpo = (await resp.text()).slice(0, 160); } catch {}
        atualizarEnvio(reg, {
          status: resp.ok ? "ok" : "erro",
          mensagem: resp.ok
            ? "Enviado ✓ HTTP " + resp.status
            : "HTTP " + resp.status + " " + resp.statusText + (corpo ? " — " + corpo : ""),
          enviadoEm: new Date().toISOString(),
        });
      })
      .catch((e) => {
        atualizarEnvio(reg, { status: "erro", mensagem: "Falha de rede: " + (e && e.message ? e.message : e) });
      });
  });
}

function atualizarEnvio(reg, envio) {
  reg.envio = Object.assign({ status: "nao_enviado" }, reg.envio, envio);
  persist();
  render();
}

/* ---------- excluir ---------- */
function excluir(id) {
  registros = registros.filter((r) => r.id !== id);
  persist();
  render();
}

/* ---------- helpers ---------- */
function statusTexto(e) {
  if (!e || e.status === "nao_enviado") return "Não enviado";
  if (e.status === "enviando") return "Enviando...";
  if (e.status === "ok") return e.mensagem || "Enviado ✓";
  if (e.status === "erro") return "Erro: " + (e.mensagem || "desconhecido");
  return "";
}
function statusClasse(e) {
  if (!e) return "muted";
  if (e.status === "ok") return "ok";
  if (e.status === "erro") return "erro";
  if (e.status === "enviando") return "info";
  return "muted";
}
function fmtData(iso) {
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, "0");
  return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() +
    " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}
function carimboDe(iso) {
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
    "_" + p(d.getHours()) + "-" + p(d.getMinutes()) + "-" + p(d.getSeconds());
}

/* ---------- função injetada na página do Dashboard ---------- */
function extrairDadosDaPagina() {
  const val = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : null;
  };
  const parseJSONSafe = (s, fb) => {
    try { return JSON.parse(s); } catch { return fb; }
  };
  const numPtBr = (s) => {
    if (s == null) return null;
    const t = String(s).trim();
    if (t === "" || t.toLowerCase() === "nan") return null;
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const num = (v) => {
    const n = Number(String(v == null ? "" : v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  if (!document.getElementById("hidUserid") && !document.getElementById("hidUsuarioQtd")) {
    return {
      ok: false,
      motivo: "Esta aba não é o Dashboard de Chamados. Abra o dashboard do CSC e selecione a aba dele antes de registrar.",
    };
  }

  const areasObj = parseJSONSafe(val("hidAreasQtd"), {}) || {};
  const areasArr = areasObj.listaGraficoDepartamento ?? areasObj.ListaGraficoDepartamento ?? [];
  const mensalObj = parseJSONSafe(val("hidMensalAbertosFechados"), {}) || {};
  const mapSerieMensal = (lista) =>
    (Array.isArray(lista) ? lista : []).map((p) => ({
      mes: String(p.Mes ?? p.mes ?? ""),
      valor: num(p.Valor ?? p.valor ?? 0),
    }));

  const dados = {
    extraidoEm: new Date().toISOString(),
    origem: {
      url: location.href,
      empresaId: numPtBr(val("hidEmpresaid")),
      userId: numPtBr(val("hidUserid")),
      grupos: val("hidGrupos"),
    },
    indicadores: {
      tempoMedioAtendimentoHoras: numPtBr(val("hidTempoAtendimento")),
      tempoMedioAtendimentoHHMM: (val("hidTempoAtendimentoHHMM") || "").trim() || null,
      satisfacaoCliente: numPtBr(val("hidSatisfacao")),
      chamadosEmAberto: numPtBr(val("hidChamadosAbertos")),
      chamadosAbertosForaPrazo: numPtBr(val("hidChamadosForaPrazo")),
      chamadosFechados: numPtBr(val("hidChamadosFechados")),
    },
    chamadosPorDepartamento: (Array.isArray(areasArr) ? areasArr : []).map((i) => ({
      area: String(i.Area ?? i.area ?? ""),
      quantidade: num(i.Quantidade ?? i.quantidade ?? i.qtd ?? 0),
    })),
    rankingAtendimento: (parseJSONSafe(val("hidUsuarioQtd"), []) || []).map((i) => ({
      nome: String(i.Nome ?? i.nome ?? ""),
      quantidade: num(i.Quantidade ?? i.quantidade ?? 0),
    })),
    abertosFechados: (() => {
      const o = parseJSONSafe(val("hidAbertosFechados"), {}) || {};
      return {
        total: num(o.total ?? 0),
        abertos: num(o.abertos ?? 0),
        fechados: num(o.fechados ?? 0),
      };
    })(),
    chamadosStatus: (parseJSONSafe(val("hidChamadosStatus"), []) || []).map((i) => ({
      nome: String(i.nome ?? i.label ?? ""),
      quantidade: num(i.qtd ?? i.valor ?? i.value ?? 0),
    })),
    slaMensal: (parseJSONSafe(val("hidSlaMensal"), []) || []).map((i) => ({
      mes: String(i.mes ?? i.Mes ?? ""),
      valor: num(i.valor ?? i.Valor ?? i.value ?? 0),
    })),
    mensalAbertosFechados: {
      abertos: mapSerieMensal(mensalObj.abertos),
      fechados: mapSerieMensal(mensalObj.fechados),
    },
  };

  return {
    ok: true,
    dados,
    resumo: {
      ranking: dados.rankingAtendimento.length,
      departamentos: dados.chamadosPorDepartamento.length,
      chamadosEmAberto: dados.indicadores.chamadosEmAberto,
      chamadosFechados: dados.indicadores.chamadosFechados,
      tempoMedioAtendimentoHHMM: dados.indicadores.tempoMedioAtendimentoHHMM,
    },
  };
}
