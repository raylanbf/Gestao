const $ = (sel, root = document) => root.querySelector(sel);

carregar();

async function carregar() {
  let spec;
  try {
    const resp = await fetch(chrome.runtime.getURL("openapi.json"));
    spec = await resp.json();
  } catch (e) {
    $("#app").textContent = "Não foi possível carregar openapi.json: " + (e && e.message ? e.message : e);
    return;
  }

  // Se houver URL configurada na extensão, mostra o endereço real.
  let serverUrl = null;
  try {
    const st = await chrome.storage.local.get("config");
    if (st.config && st.config.postUrl) serverUrl = st.config.postUrl;
  } catch {}

  render(spec, serverUrl);
}

function render(spec, serverUrl) {
  const app = $("#app");
  app.textContent = "";

  const info = spec.info || {};
  app.appendChild(el("h1", null, info.title || "API"));
  const meta = el("div", "meta");
  meta.appendChild(el("span", "badge", "v" + (info.version || "?")));
  meta.appendChild(el("span", "badge", "OpenAPI " + (spec.openapi || "")));
  app.appendChild(meta);
  if (info.description) app.appendChild(el("p", "desc", info.description));

  app.appendChild(el("h2", null, "Endpoint"));
  const paths = spec.paths || {};
  for (const [rota, metodos] of Object.entries(paths)) {
    for (const [metodo, op] of Object.entries(metodos)) {
      app.appendChild(renderEndpoint(metodo, rota, op, serverUrl, spec));
    }
  }

  const schemas = (spec.components && spec.components.schemas) || {};
  app.appendChild(el("h2", null, "Modelo de dados"));
  for (const nome of ordenarSchemas(schemas, "DashboardPayload")) {
    app.appendChild(renderSchema(nome, schemas[nome]));
  }
}

function renderEndpoint(metodo, rota, op, serverUrl, spec) {
  const sec = el("section", "endpoint");

  const linha = el("div", "ep-linha");
  linha.appendChild(el("span", "metodo " + metodo.toLowerCase(), metodo.toUpperCase()));
  const base = (serverUrl || (spec.servers && spec.servers[0] && spec.servers[0].url) || "").replace(/\/$/, "");
  linha.appendChild(el("span", "ep-url", base + (rota === "/" ? "" : rota)));
  sec.appendChild(linha);

  if (op.summary) sec.appendChild(el("p", "desc", op.summary));
  sec.appendChild(el("p", "hint", serverUrl
    ? "URL atualmente configurada na extensão."
    : "Configure a URL de destino na extensão para ver o endereço real."));
  if (op.description) sec.appendChild(el("p", "desc", op.description));

  const h = el("div", "sub");
  h.appendChild(el("b", null, "Headers: "));
  h.appendChild(el("code", null, "Content-Type: application/json"));
  sec.appendChild(h);

  const rb = op.requestBody && op.requestBody.content && op.requestBody.content["application/json"];
  if (rb && rb.schema && rb.schema.$ref) {
    const nome = refNome(rb.schema.$ref);
    const p = el("div", "sub");
    p.appendChild(el("b", null, "Corpo (Request Body): "));
    const a = el("a", null, nome);
    a.href = "#schema-" + nome;
    p.appendChild(a);
    sec.appendChild(p);
  }

  if (rb && rb.example) {
    sec.appendChild(el("h4", null, "Exemplo de envio"));
    const pre = el("pre", "exemplo");
    pre.textContent = JSON.stringify(rb.example, null, 2);
    sec.appendChild(pre);
  }

  if (op.responses) {
    sec.appendChild(el("h4", null, "Respostas"));
    const tab = el("table", "campos");
    const thr = el("tr");
    ["Código", "Descrição"].forEach((t) => thr.appendChild(el("th", null, t)));
    tab.appendChild(thr);
    for (const [cod, r] of Object.entries(op.responses)) {
      const tr = el("tr");
      tr.appendChild(el("td", "campo", cod));
      tr.appendChild(el("td", "descr", (r && r.description) || ""));
      tab.appendChild(tr);
    }
    sec.appendChild(tab);
  }

  return sec;
}

function renderSchema(nome, schema) {
  const card = el("section", "schema");
  card.id = "schema-" + nome;
  card.appendChild(el("h3", null, nome));
  if (schema.description) card.appendChild(el("p", "desc", schema.description));

  if (schema.properties) {
    const req = new Set(schema.required || []);
    const tabela = el("table", "campos");
    const thead = el("tr");
    ["Campo", "Tipo", "Obrigatório", "Descrição"].forEach((t) => thead.appendChild(el("th", null, t)));
    tabela.appendChild(thead);

    for (const [prop, ps] of Object.entries(schema.properties)) {
      const tr = el("tr");
      tr.appendChild(el("td", "campo", prop));

      const tdTipo = el("td", "tipo");
      const dt = descreverTipo(ps);
      if (dt.ref) {
        const a = el("a", null, dt.texto);
        a.href = "#schema-" + dt.ref;
        tdTipo.appendChild(a);
      } else {
        tdTipo.appendChild(el("code", null, dt.texto));
      }
      if (ps.nullable) tdTipo.appendChild(el("span", "null", " · null"));
      tr.appendChild(tdTipo);

      tr.appendChild(el("td", "obr", req.has(prop) ? "sim" : "—"));
      tr.appendChild(el("td", "descr", ps.description || ""));
      tabela.appendChild(tr);
    }
    card.appendChild(tabela);
  } else {
    card.appendChild(el("code", null, descreverTipo(schema).texto));
  }
  return card;
}

/* ---------- helpers ---------- */
function descreverTipo(schema) {
  if (!schema) return { texto: "any" };
  if (schema.$ref) { const n = refNome(schema.$ref); return { texto: n, ref: n }; }
  if (schema.type === "array") {
    const it = schema.items || {};
    if (it.$ref) { const n = refNome(it.$ref); return { texto: n + "[]", ref: n }; }
    let t = it.type || "any";
    if (it.format) t += " <" + it.format + ">";
    return { texto: t + "[]" };
  }
  let t = schema.type || "any";
  if (schema.format) t += " <" + schema.format + ">";
  return { texto: t };
}

function ordenarSchemas(schemas, root) {
  const nomes = Object.keys(schemas);
  const out = [];
  if (schemas[root]) out.push(root);
  for (const n of nomes) if (n !== root) out.push(n);
  return out;
}

function refNome(ref) { return String(ref).split("/").pop(); }

function el(tag, cls, texto) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto != null) e.textContent = texto;
  return e;
}
