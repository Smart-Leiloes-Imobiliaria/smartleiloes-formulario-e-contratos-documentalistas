# Configuração

## Defaults versionados

| Chave | Valor |
|---|---|
| `FORM_ID` | `1909wHJxDC5b4s2HXO3sd1t2Iydh7PpQRDQ1hzetoneM` |
| `ROOT_FOLDER_ID` | `1W2jIPu6AUnl4-sqa3pj-GXICVREZUUN_` |
| `SPREADSHEET_TEMPLATE_ID` | `1sSyzjTU19x4-SIMf1uR1c0-FY3KOJ2c__fa2mtlpBA0` |
| `RESPONSE_SPREADSHEET_ID` | `18xtCdLKVk-WKcenh6bR468P4yeHXCpAtbHHo_521qN4` |
| `RESPONSE_SHEET_ID` | `1808239713` |
| `TIME_ZONE` | `America/Sao_Paulo` |
| `SPREADSHEET_LOCALE` | `pt_BR` |
| `SIGNATURE_LOCATION` | `NOVA LIMA/MG` |
| `CONTRACT_OUTPUT_FORMAT` | `DOCX` |
| `CONTRACT_TEMPLATE_PJ_VERSION` | `definitivo-2026-09-v1` |
| `CONTRACT_TEMPLATE_PJ_HASH` | `c30e7d366613160015f8669dedc2ef92cfdcda9d6e802f2755f1de92aaf92579` |
| `CONTRACT_TEMPLATE_PF_VERSION` | `definitivo-pf-2026-09-v1` |
| `CONTRACT_TEMPLATE_PF_HASH` | `9652eac539e89ea1fb3db20076ef85564ad2dcd0ecc7bfdacaadc4168d81b0ce` |

O sublinhado final de `ROOT_FOLDER_ID` faz parte do ID real. A API da conta do `clasp` confirmou que é uma pasta em Shared Drive; a variante sem `_` não existe para essa conta.

## Script Properties

`configurarProjetoDocumentalistas()` grava somente as propriedades conhecidas e preserva todas as demais.

Propriedades preenchidas pela ativação dos templates:

- `CONTRACT_TEMPLATE_PF_SOURCE_ID`, `CONTRACT_TEMPLATE_PF_DOC_ID`, `CONTRACT_TEMPLATE_PF_HASH`, `CONTRACT_TEMPLATE_PF_VERSION`
- `CONTRACT_TEMPLATE_PJ_SOURCE_ID`, `CONTRACT_TEMPLATE_PJ_DOC_ID`, `CONTRACT_TEMPLATE_PJ_HASH`, `CONTRACT_TEMPLATE_PJ_VERSION`

As propriedades genéricas `CONTRACT_TEMPLATE_SOURCE_ID`, `CONTRACT_TEMPLATE_DOC_ID`, `CONTRACT_TEMPLATE_HASH` e `CONTRACT_TEMPLATE_VERSION` permanecem apenas como fallback compatível do template PJ. Os valores ativos estão nos defaults versionados e `configurarProjetoDocumentalistas()` grava ambos os ramos sem apagar outras propriedades. Uma nova versão deve ser sincronizada e registrada antes de ser usada; contratos já emitidos mantêm source ID, hash e versão.

Propriedades operacionais criadas/aceitas:

- `TECHNICAL_FOLDER_ID`
- `REGISTRY_SPREADSHEET_ID`
- `ACTIVATION_START_ISO` — opcional; o gatilho recusa respostas anteriores, mas reprocessamento explícito por ID continua permitido.
- `HISTORICAL_IMPORT_START_ROW`, `HISTORICAL_IMPORT_END_ROW` e `HISTORICAL_IMPORT_NEXT_ROW` — recorte e checkpoint do backfill; são definidos idempotentemente por `prepararAtivacaoDocumentalistas()`.
- `INTEGRATION_TEST_WRITES_ENABLED` — deve ser `true` junto com confirmação explícita para teste de integração com escrita.
- `MANUAL_RESPONSE_ID` — ID selecionado explicitamente para simulação/reprocessamento pelos wrappers sem argumentos do editor.
- `MANUAL_STATE_LOOKUP_KEY` — identityKey ou responseId selecionado para a consulta manual; se ausente, a consulta usa `MANUAL_RESPONSE_ID`.
- `MANUAL_HISTORICAL_ROW` — uma linha específica do recorte histórico para retomada manual.
- `CONFIRM_HISTORICAL_PURGE_ROW` — confirmação destrutiva temporária; deve repetir exatamente `MANUAL_HISTORICAL_ROW` para habilitar o expurgo integral de uma resposta indevida e é removida ao concluir.
- `MANUAL_HISTORICAL_ROWS` — lista explícita, separada por vírgulas, de até 20 linhas do recorte histórico para processamento seletivo; exemplo: `3,4,5,6,8,9,10,15`.
- padrões de nomes documentados em `src/00_core/config.js`.

Filas internas, que não devem ser configuradas ou apagadas manualmente enquanto houver execução:

- `PENDING_RESPONSE_IDS` — IDs de respostas novas aguardando confirmação de conclusão;
- `HISTORICAL_RETRY_QUEUE_ROWS` e `HISTORICAL_RETRY_QUEUE_MODE` — linhas e origem da fila histórica;
- `HISTORICAL_RETRY_IN_FLIGHT_ROW` e `HISTORICAL_RETRY_IN_FLIGHT_AT` — checkpoint da linha histórica que pode ter sido interrompida por timeout.
- `HISTORICAL_PURGE_ACTIVE_JSON` — checkpoint interno do expurgo integral; não editar nem apagar durante uma retomada.

Os handlers `retomarFilaPendenteDocumentalistas` e `retomarFilaHistoricaDocumentalistas` consomem essas filas. O atraso padrão de continuação é de cinco minutos e o lote histórico é deliberadamente pequeno para respeitar o limite de seis minutos do Apps Script.

## Escopos e serviços

O manifesto declara Forms (formulário atual), Drive, Docs, Sheets, gatilhos, requisições externas e e-mail da conta executora. Drive API v3 é serviço avançado obrigatório. A conta que executa `prepararAtivacaoDocumentalistas()` será a conta dos gatilhos e precisa acessar o formulário, a planilha vinculada, a raiz, o modelo de planilha e o DOCX técnico.

A conta OAuth local do `clasp` não conseguiu ler a planilha de respostas: a API Sheets associada está desabilitada e o export pelo Drive retornou 403. A conta executora do Apps Script comprovou acesso pelo diagnóstico, e uma leitura externa controlada confirmou os metadados e cabeçalhos sem acessar respostas. O backfill só pode começar depois que o diagnóstico da versão 1.1.3 retornar `READY`.

O acesso local do `clasp` e a autorização do runtime Apps Script são independentes. `clasp push` não concede autorização e não instala gatilho.
