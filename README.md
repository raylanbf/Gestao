# CSC · Extrator de Dashboard

Extensão do Chrome (Manifest V3) que abre um **painel lateral** para registrar
os dados do **Dashboard de Chamados** do CSC. Cada registro vira um **card** com
opção de **baixar o JSON** e de **enviar (POST)** para uma URL configurável.

## Como funciona

O dashboard renderiza os gráficos (ApexCharts) a partir de campos
`<input type="hidden">` que já contêm os dados em texto/JSON. Ao clicar em
**Registrar**, a extensão lê esses campos na aba ativa, monta um JSON limpo e
guarda como um card. Como lê o DOM ao vivo, cada registro reflete o estado atual
(dados mutáveis). Não usa OCR, não lê o canvas dos gráficos nem depende de API.

## Instalação (modo desenvolvedor)

1. Abra `chrome://extensions` no Chrome/Edge.
2. Ative **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione esta pasta
   (`c:\Users\Casa\Gestao`).
4. Fixe o ícone da extensão na barra, se quiser.

## Uso

1. Abra a página do **Dashboard de Chamados** no CSC.
2. Clique no ícone da extensão → o **painel lateral** abre.
3. (Opcional) Em **Configuração de envio**, informe a **URL de destino (POST)**
   e clique em **Salvar URL**.
4. Com a aba do Dashboard selecionada, clique em **＋ Registrar coleta atual**.
   Na primeira vez o Chrome pede permissão para acessar o site do dashboard —
   conceda (só é pedido uma vez).
5. Um **card** aparece com o resumo. Nele você pode:
   - **⬇ Baixar JSON** — salva `csc-dashboard_AAAA-MM-DD_HH-MM-SS.json`.
   - **➤ Enviar** — faz `POST` do JSON para a URL configurada (`Content-Type:
     application/json`). O status (HTTP/erro) aparece no próprio card.
   - **✕** — exclui o registro.

Os registros e a URL ficam salvos (`chrome.storage.local`) e persistem entre
sessões.

## Permissões

- `sidePanel` — painel lateral.
- `scripting` + `tabs` — ler os campos da aba ativa do Dashboard.
- `storage` — guardar registros e a URL de destino.
- `optional_host_permissions: <all_urls>` — concedida **sob demanda**: ao
  registrar (host do dashboard) e ao enviar (host do seu servidor). Nada é
  liberado na instalação.

## Envio (POST) — o que o servidor recebe

Corpo da requisição = o mesmo JSON do download. Exemplo do payload:

```json
{
  "extraidoEm": "2026-06-30T21:15:00.000Z",
  "origem": { "url": "...", "empresaId": 5, "userId": 4833, "grupos": "1940" },
  "indicadores": {
    "tempoMedioAtendimentoHoras": 218.96,
    "tempoMedioAtendimentoHHMM": "218:96",
    "satisfacaoCliente": null,
    "chamadosEmAberto": 308,
    "chamadosAbertosForaPrazo": 7,
    "chamadosFechados": 287
  },
  "chamadosPorDepartamento": [
    { "area": "RES_NED/CEAD_Gestão_do_Ambiente_Virtual", "quantidade": 23 }
  ],
  "rankingAtendimento": [
    { "nome": "Lucas Henrique Batista França", "quantidade": 51 }
  ],
  "abertosFechados": { "total": 595, "abertos": 308, "fechados": 287 },
  "chamadosStatus": [
    { "nome": "Acumulados", "quantidade": 287 },
    { "nome": "Não resolvidos", "quantidade": 308 }
  ],
  "slaMensal": [ { "mes": "jan", "valor": 82.27 } ],
  "mensalAbertosFechados": {
    "abertos":  [ { "mes": "Jan", "valor": 76 } ],
    "fechados": [ { "mes": "Jan", "valor": 70 } ]
  }
}
```

> Se o seu endpoint estiver em outra origem, ele não precisa de CORS: a extensão
> faz a requisição com permissão de host concedida. Basta o servidor aceitar
> `POST` com JSON.

## Documentação embutida (estilo Swagger)

A extensão traz um **manual da API** e o **contrato OpenAPI** do que é enviado:

- **📖 Manual da API** (em *Configuração de envio*): abre uma página que renderiza
  o endpoint, os headers, o modelo de dados (com tipos, campos obrigatórios e
  descrições) e um exemplo de envio. Se você já configurou a URL de destino, o
  manual mostra o endereço real.
- **⬇ OpenAPI**: baixa `csc-dashboard-openapi.json` (OpenAPI 3.0.3). Pode ser
  importado no **Swagger Editor**, **Postman**, **Redoc**, ou usado para gerar
  clients/validar o payload no seu servidor.

O `openapi.json` é a **fonte única de verdade**: o manual é renderizado a partir
dele, então documentação e contrato nunca divergem.

## Arquivos

| Arquivo          | Papel                                             |
|------------------|---------------------------------------------------|
| `manifest.json`  | Configuração MV3 (side panel, permissões).        |
| `background.js`  | Service worker: abre o painel ao clicar no ícone. |
| `sidepanel.html` | Interface do painel lateral.                      |
| `sidepanel.js`   | Registro, cards, download, envio e extração.      |
| `openapi.json`   | Contrato OpenAPI 3.0.3 do payload (POST).          |
| `manual.html`    | Página do manual (renderiza o contrato).          |
| `manual.js`      | Renderizador do manual a partir do `openapi.json`.|
