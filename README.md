# Cadastro e contratos de documentalistas

Automação vinculada ao Google Forms existente para validar cadastros PF/PJ, selecionar o contrato correspondente ao tipo de pessoa, gerar o DOCX a partir de templates versionados no Drive, copiar e preparar a planilha de controle e manter estado persistente/idempotente.

O código está configurado para o projeto Apps Script `1EmkbYu2DGs2hSd6wBIT50ukyDyqAP_eNS6gU0XWyY5atYfHpMtbsKZof`. O runtime usa V8, Drive API v3, `America/Sao_Paulo` e planilhas `pt_BR`. A versão 1.1.4 adicionou retomada segura após uma pausa; a 1.1.5 alinhou validação e cláusula contratual aos ramos condicionais PIX/TED; a 1.1.6 corrigiu o nome da pasta e adicionou lote histórico nominal; a 1.1.7 tornou os lotes e novos envios retomáveis após timeout. A 1.1.8 acrescentou regeneração controlada de contrato legado; a 1.1.9 permite adotar explicitamente a linha histórica corrigida; a 1.1.10 identifica continuações temporizadas por UID. A 1.1.11 acrescentou expurgo retomável e ativou os templates v2 com margens reduzidas e assinaturas paralelas na pasta compartilhada `._automacao_documentalista`; a 1.1.12 estendeu o expurgo a respostas atuais rejeitadas. A 1.2.0 adiciona um painel web administrativo para expurgo e publicação/ativação de templates sem editar Script Properties a cada operação.

## Estado de produção

Há dois DOCX ativos: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS.docx`, exclusivo para PJ (`definitivo-2026-09-v2`), e `CONTRATO DE PRESTAÇÃO DE SERVIÇOS - PF.docx`, exclusivo para PF (`definitivo-pf-2026-09-v2`). O segundo preserva as cláusulas e a estrutura do primeiro, adaptando a qualificação e a sucessão para uma contratada pessoa física. O runtime escolhe o template pelo campo `tipoPessoa` normalizado do Forms e preenche diretamente o OOXML; a conversão Google Docs existe apenas como prévia técnica e não é usada para emitir contratos.

Para validar ou atualizar uma nova versão:

```bash
npm run template:validate -- --file "CONTRATO DE PRESTAÇÃO DE SERVIÇOS.docx" --version "definitivo-2026-09-v2"
npm run template:validate -- --file "CONTRATO DE PRESTAÇÃO DE SERVIÇOS - PF.docx" --version "definitivo-pf-2026-09-v2"
npm run template:sync -- --file "CONTRATO DE PRESTAÇÃO DE SERVIÇOS.docx" --version "definitivo-2026-09-v2"
npm run template:sync -- --file "CONTRATO DE PRESTAÇÃO DE SERVIÇOS - PF.docx" --version "definitivo-pf-2026-09-v2"
```

Os comandos preservam os DOCX locais, criam/reutilizam os recursos técnicos por hash e gravam `template-sync-result-PF.json`/`template-sync-result-PJ.json` locais (ignorados pelo Git). A fonte da emissão é sempre o `SOURCE_ID` do tipo selecionado.

- `CONTRACT_TEMPLATE_PF_SOURCE_ID`, `CONTRACT_TEMPLATE_PF_DOC_ID`, `CONTRACT_TEMPLATE_PF_HASH`, `CONTRACT_TEMPLATE_PF_VERSION`
- `CONTRACT_TEMPLATE_PJ_SOURCE_ID`, `CONTRACT_TEMPLATE_PJ_DOC_ID`, `CONTRACT_TEMPLATE_PJ_HASH`, `CONTRACT_TEMPLATE_PJ_VERSION`

As chaves genéricas antigas continuam como alias de compatibilidade para PJ. O botão **Executar** do editor não recebe argumentos; na ativação manual, `configurarProjetoDocumentalistas()` grava os dois conjuntos versionados e `validarTemplateContratoDocumentalistas()` valida ambos.

Na publicação 1.1.11, o runtime migra automaticamente o conjunto oficial v1 salvo nas Script Properties para o v2 no primeiro acionamento. A regra exige correspondência integral dos IDs, hashes e versões anteriores e não substitui releases customizados pela equipe.

## Painel administrativo

O projeto standalone expõe `doGet()` como Web App e exige login Google. Antes de abrir o painel, configure `ADMIN_PANEL_ALLOWED_EMAILS` nas Script Properties com os e-mails autorizados, separados por vírgula. A implantação executa como o usuário que está acessando; portanto cada administrador precisa ter acesso ao formulário, à planilha vinculada e à raiz do Shared Drive.

O painel oferece duas operações:

- **Expurgar resposta:** informa a linha, localiza a resposta original, mostra documento mascarado e erro de validação e exige a frase `EXPURGAR LINHA N` antes de remover.
- **Atualizar contrato:** envia um DOCX de até 8 MB, valida ZIP/OOXML, placeholders, ramo PF/PJ, versão e hash; depois exige a frase apresentada, publica fonte e prévia em `._automacao_documentalista` e atualiza as propriedades ativas sob lock. O release anterior é preservado e a configuração volta ao estado anterior se a validação remota falhar.

O acesso do manifesto é `ANYONE`, que significa qualquer usuário **autenticado**, mas o backend recusa contas ausentes de `ADMIN_PANEL_ALLOWED_EMAILS`. Não use `ANYONE_ANONYMOUS`.

Implantação atual: [Painel administrativo](https://script.google.com/macros/s/AKfycbztSi9OTBWnLf20wABLbv_qZtY1F8kQA7Z3PKK8ouqBxn0o_O3lH78ad9MwtngZeTzM/exec). Ela permanece bloqueada até a allowlist ser configurada.

## Validação e publicação

```bash
npm run check
clasp status
clasp push
clasp pull
```

`rootDir` é `src`; testes, documentação, fixtures, credenciais e binários não são enviados pelo `clasp`.

Após o primeiro push, a conta executora precisa autorizar e executar, nesta ordem:

1. `configurarProjetoDocumentalistas()` — grava apenas as propriedades conhecidas e não apaga propriedades existentes.
2. `diagnosticarConfiguracaoDocumentalistas()` — testa Forms, Drive, planilha, template e gatilhos.
3. `listarCamposFormularioDocumentalistas()` — confere os IDs reais do formulário.
4. `validarTemplateContratoDocumentalistas()` — deve retornar `VALID` após a sincronização.
5. `prepararAtivacaoDocumentalistas()` — congela o recorte histórico da planilha vinculada, cria o gatilho Forms idempotente e agenda lotes do backfill quando existirem.

O Web App existe somente para o painel administrativo. O processamento operacional continua no handler `onFormSubmitDocumentalistas(e)` e exige o evento instalável do Forms (`e.response`).

## Operação

- Simulação sem escrita: `simularRespostaDocumentalistas(responseId)`.
- Reprocessamento explícito: `reprocessarRespostaDocumentalistas(responseId)`.
- Consulta: `consultarEstadoDocumentalistas(identityKeyOrResponseId)`.
- Backfill delimitado: `importarRespostasHistoricasDocumentalistas()`; falhas ficam em `importacoes_historicas` e podem ser retomadas por linha explícita.
- Diagnóstico do checkpoint: `diagnosticarCheckpointHistoricoDocumentalistas()`; não altera propriedades nem respostas.
- Lote histórico explícito: defina `MANUAL_HISTORICAL_ROWS` e execute `reprocessarLinhasHistoricasSelecionadasDocumentalistas()`; somente linhas incompletas da lista entram na fila durável, em pequenos lotes continuados por `retomarFilaHistoricaDocumentalistas`.
- Histórico pendente completo: `reprocessarHistoricoPendenteDocumentalistas()` instala/reutiliza primeiro o gatilho Forms, amplia o recorte até a última linha atual e enfileira somente estados que ainda não possuem pasta, contrato e planilha concluídos.
- Diagnóstico da continuação histórica: `diagnosticarFilaHistoricaDocumentalistas()` informa modo, linhas pendentes e eventual linha em processamento.
- Regeneração controlada de um contrato antigo: defina `MANUAL_HISTORICAL_ROW` e execute `regenerarContratoLinhaHistoricaConfiguradaDocumentalistas()`; somente o DOCX identificado vai para a lixeira, a pasta é reconciliada/renomeada e a planilha existente é preservada. Quando a linha foi corrigida depois da primeira emissão, defina também `CONFIRM_CONTRACT_DATA_MIGRATION_ROW` com o mesmo número: a função exige a mesma identidade, bloqueia ramos PIX/TED misturados e mantém checkpoint para retomada.
- Descarte recuperável de um teste: defina `MANUAL_HISTORICAL_ROW` e execute `removerArtefatosLinhaHistoricaConfiguradaDocumentalistas()`; a função valida parent e metadados, envia a pasta para a lixeira e mantém o estado pronto para reprocessamento.
- Expurgo integral de uma resposta indevida: defina `MANUAL_HISTORICAL_ROW` e `CONFIRM_HISTORICAL_PURGE_ROW` com o mesmo número e execute `expurgarCadastroLinhaHistoricaConfiguradaDocumentalistas()`; a operação única retira filas, exclui a resposta original do Forms, limpa a linha sem deslocá-la, envia a pasta identificada à lixeira e remove estado e auditoria. Um checkpoint interno permite repetir a mesma função após timeout até a conclusão.
- Teste controlado: `testarIntegracaoControladaDocumentalistas(responseId, false)`; escrita exige argumento `true` e `INTEGRATION_TEST_WRITES_ENABLED=true`.

Pelo botão **Executar** do editor, que não aceita argumentos, defina `MANUAL_RESPONSE_ID` nas Script Properties e use `simularRespostaConfiguradaDocumentalistas()` ou `reprocessarRespostaConfiguradaDocumentalistas()`. Para consulta, `consultarEstadoConfiguradoDocumentalistas()` usa `MANUAL_STATE_LOOKUP_KEY` quando presente e, caso contrário, o próprio `MANUAL_RESPONSE_ID`.

Consulte [arquitetura](docs/ARQUITETURA.md), [configuração](docs/CONFIGURACAO.md), [dicionário de campos](docs/DICIONARIO_DE_CAMPOS.md), [operação e recuperação](docs/OPERACAO.md), [testes](docs/TESTES.md), [estado da publicação](docs/STATUS_PUBLICACAO.md) e [guia manual de teste em tempo real](docs/GUIA_TESTE_TEMPO_REAL.md).

## Referências locais consultadas

- `00 - Início/Base de conhecimento.md`
- `20 - Projetos/SmartCaixa Apps Script/00 - Índice SmartCaixa Apps Script.md`
- `20 - Projetos/SmartCaixa Apps Script/SmartCaixa Apps Script - Formulário de Arrematantes.md`
- `20 - Projetos/Smart Leilões GitHub/Repositório - gerador-de-contratos.md`
- `20 - Projetos/Smart Leilões GitHub/Repositório - Gabriel-Max-Automa-es-Appscript.md`
- checkout local `webhook-smartleiloesimobiliaria-appscript/` para a convenção `00_core/`, `10_automations/` e `90_operations/`.

Foram reaproveitados os padrões observados de V8, módulos por responsabilidade, Drive API avançada, segredos em `Script Properties`, logs redigidos, idempotência persistente, recuperação explícita e separação entre Git, `clasp push`, autorização, gatilhos e runtime.
