# Guia manual — ativação, histórico e testes PF/PJ em tempo real

Este é o roteiro operacional da versão 1.1.10, publicada em 18/09/2026. Ele cobre:

1. ativação segura da automação e criação dos gatilhos;
2. processamento das respostas que chegaram antes da ativação;
3. um envio real como pessoa física e outro como pessoa jurídica;
4. confirmação de que o tipo escolhido no Forms seleciona o contrato correto;
5. idempotência, rastreabilidade e inspeção dos artefatos.

Use apenas dados sintéticos ou cadastros de homologação autorizados. Não registre senha ONR, CPF/CNPJ integral ou respostas completas em evidências públicas.

## 1. Estado publicado e verificações locais

Na raiz do repositório, execute:

```bash
npm run check
npm run form:inspect
npm run template:validate -- --file "CONTRATO DE PRESTAÇÃO DE SERVIÇOS.docx" --version "definitivo-2026-09-v1"
npm run template:validate -- --file "CONTRATO DE PRESTAÇÃO DE SERVIÇOS - PF.docx" --version "definitivo-pf-2026-09-v1"
```

Resultados de referência:

- 50/50 testes aprovados, incluindo preenchimento do XML dos dois DOCX definitivos, cabeçalhos histórico atual/legado, retomada segura após pausa/timeout, ramificação PIX/TED, lote explícito, nome de pasta, regeneração isolada, migração confirmada do fingerprint e agendamento por UID;
- 56 itens totais e 46 respondíveis no Forms;
- `missingMappings: []`, `staleMappings: []` e `titleMismatches: []`;
- PJ: 19 placeholders, `supportedEntityTypes: ["PJ"]`, hash `c30e7d366613160015f8669dedc2ef92cfdcda9d6e802f2755f1de92aaf92579`;
- PF: 16 placeholders, `supportedEntityTypes: ["PF"]`, hash `9652eac539e89ea1fb3db20076ef85564ad2dcd0ecc7bfdacaadc4168d81b0ce`;
- os dois DOCX possuem 11 páginas na renderização local;
- a sincronização repetida de cada arquivo deve retornar `reusedSource: true` e `reusedConverted: true`;
- `runtimeSource: "DOCX_OOXML"` nos dois ramos.

A prévia Google Docs do PJ possui 13 páginas contra 11 do DOCX. Ela é apenas diagnóstica: a emissão usa diretamente o OOXML do DOCX original de cada ramo.

## 2. Conta executora e acessos

Abra o [projeto Apps Script](https://script.google.com/home/projects/1EmkbYu2DGs2hSd6wBIT50ukyDyqAP_eNS6gU0XWyY5atYfHpMtbsKZof/edit) com a conta que ficará responsável pelos gatilhos.

Essa conta precisa conseguir abrir:

- o [formulário de cadastro](https://docs.google.com/forms/d/1909wHJxDC5b4s2HXO3sd1t2Iydh7PpQRDQ1hzetoneM/edit);
- a [planilha vinculada de respostas](https://docs.google.com/spreadsheets/d/18xtCdLKVk-WKcenh6bR468P4yeHXCpAtbHHo_521qN4/edit?gid=1808239713#gid=1808239713);
- a [raiz de destino no Shared Drive](https://drive.google.com/drive/folders/1W2jIPu6AUnl4-sqa3pj-GXICVREZUUN_);
- o modelo nativo da planilha de controle;
- a pasta técnica e os dois DOCX sincronizados.

O OAuth local do `clasp` não conseguiu executar funções remotas (`clasp run` retornou `NOT_FOUND`) nem confirmar o acesso da conta executora à planilha de respostas. Portanto, as etapas no editor abaixo são obrigatórias.

Se `configurarProjetoDocumentalistas` já foi executada com êxito e as propriedades acima estão salvas, não é necessário repetir a configuração dos templates. A versão 1.1.6 passou a usar `NOME, (DOCUMENTO)`; a 1.1.7 adiciona filas persistentes para atravessar o limite de seis minutos. Execute `corrigirPadraoNomePastaDocumentalistas` uma vez antes do lote se a propriedade antiga ainda tiver dois pares de parênteses.

## 3. Autorizar e gravar a configuração

No seletor de funções do editor, execute:

```text
configurarProjetoDocumentalistas
```

Conceda os escopos solicitados. A função grava somente chaves conhecidas e preserva propriedades existentes.

Em **Configurações do projeto → Propriedades do script**, confira:

| Propriedade | Valor esperado |
|---|---|
| `RESPONSE_SPREADSHEET_ID` | `18xtCdLKVk-WKcenh6bR468P4yeHXCpAtbHHo_521qN4` |
| `RESPONSE_SHEET_ID` | `1808239713` |
| `CONTRACT_TEMPLATE_PJ_SOURCE_ID` | `1XDy6dUHsLWguDPyo7iCku-CDsrC3gWIf` |
| `CONTRACT_TEMPLATE_PJ_DOC_ID` | `1VnfGOuNcz7aSszUYN4MEV_hzT61MUmlvfxcL59Y_ejA` |
| `CONTRACT_TEMPLATE_PJ_VERSION` | `definitivo-2026-09-v1` |
| `CONTRACT_TEMPLATE_PJ_HASH` | `c30e7d366613160015f8669dedc2ef92cfdcda9d6e802f2755f1de92aaf92579` |
| `CONTRACT_TEMPLATE_PF_SOURCE_ID` | `1QtA0OKeIfxbcJnF94r8j-NBUVHC94r4b` |
| `CONTRACT_TEMPLATE_PF_DOC_ID` | `1-BcACwxT_5-HbLP0xzB8lmf_w01FOWiAk87CPb88XO0` |
| `CONTRACT_TEMPLATE_PF_VERSION` | `definitivo-pf-2026-09-v1` |
| `CONTRACT_TEMPLATE_PF_HASH` | `9652eac539e89ea1fb3db20076ef85564ad2dcd0ecc7bfdacaadc4168d81b0ce` |

As quatro propriedades genéricas antigas de template são aliases do PJ e podem permanecer. Não cole tokens, cookies nem credenciais da ONR nas propriedades.

## 4. Validar recursos antes da ativação

Execute, nesta ordem:

1. `validarTemplateContratoDocumentalistas`;
2. `listarCamposFormularioDocumentalistas`;
3. `diagnosticarConfiguracaoDocumentalistas`.

Confirme:

- retorno geral `VALID` com `templates.PF` e `templates.PJ`;
- PF com versão/hash esperados e compatibilidade exclusiva `PF`;
- PJ com versão/hash esperados e compatibilidade exclusiva `PJ`;
- 46 perguntas respondíveis mapeadas;
- `responseSpreadsheet` com o ID e `sheetId` esperados;
- raiz reconhecida como Shared Drive;
- planilha-modelo acessível e com 38 cabeçalhos válidos;
- fuso `America/Sao_Paulo`;
- diagnóstico geral `READY`.

Se `responseSpreadsheet` retornar `RESPONSE_SPREADSHEET_ACCESS_DENIED`, compartilhe a planilha com a conta executora ou use a conta que vinculou as respostas. Se retornar `HISTORICAL_HEADERS_INCOMPATIBLE`, consulte `details.missingHeaders` no próprio diagnóstico e interrompa a ativação. Não complete dados ausentes por suposição.

## 5. Congelar o histórico e criar os gatilhos

Execute uma vez:

```text
prepararAtivacaoDocumentalistas
```

Essa operação valida os dois templates, grava `ACTIVATION_START_ISO` se ausente, fixa o recorte histórico e cria/reutiliza o gatilho instalável `onFormSubmitDocumentalistas` associado ao Forms. Havendo backlog, agenda `retomarImportacaoHistoricaDocumentalistas` em lotes de até 10 linhas.

Abra **Gatilhos** e confirme:

- exatamente um gatilho visível para a sua conta com função `onFormSubmitDocumentalistas`, origem **Do formulário** e evento **Ao enviar formulário**;
- no máximo um gatilho temporizado `retomarImportacaoHistoricaDocumentalistas` enquanto houver backlog;
- nenhum gatilho de outra conta foi removido.

A API só lista os gatilhos acessíveis à conta executora; ela não prova a ausência de gatilhos criados por outras contas.

### Retomada após a pausa de 17/09/2026

Não execute novamente `prepararAtivacaoDocumentalistas` e não edite manualmente os checkpoints. O estado preservado foi:

```text
ACTIVATION_START_ISO=2026-09-17T20:50:23.581Z
HISTORICAL_IMPORT_START_ROW=2
HISTORICAL_IMPORT_END_ROW=11
HISTORICAL_IMPORT_NEXT_ROW=12
```

Em 18/09/2026, a leitura limitada à coluna de timestamp encontrou a última resposta na linha 22. Para retomar, execute:

```text
retomarAtivacaoAposPausaDocumentalistas
```

A rotina valida os recursos, confirma o checkpoint, instala/reutiliza primeiro o gatilho Forms, relê a planilha e somente então amplia o fim do recorte e agenda o backfill. Se nenhuma nova resposta chegar durante a execução, o retorno esperado contém:

```text
previousEndRow: 11
endRow: 22
nextRow: 12
newlyIncludedRows: 11
pendingRows: 11
```

Uma linha posterior a 22 é válida se uma nova resposta chegar antes da releitura. Na execução real de 18/09/2026, o runtime ampliou o corte para 23 e terminou com `nextRow: 24`. Confirme novamente um gatilho `onFormSubmitDocumentalistas` e no máximo um `retomarImportacaoHistoricaDocumentalistas`.

Execute `diagnosticarCheckpointHistoricoDocumentalistas`. O esperado após esses lotes é `endRow: 23`, `nextRow: 24` e `pendingRows: 0`. Se a tela de propriedades ainda mostrar 22/23, atualize a página; se o diagnóstico também mostrar 22/23 com `sourceLastRow` igual ou superior a 23, execute novamente `retomarAtivacaoAposPausaDocumentalistas` para reconciliar somente a linha posterior ao corte.

## 6. Acompanhar respostas históricas

Abra **Execuções** e acompanhe o backfill. Na pasta técnica, abra `Registro de Processamento - Documentalistas` e consulte `importacoes_historicas`.

Para cada linha, confira `sourceSpreadsheetId`, `sourceSheetId`, `sourceRow`, `syntheticResponseId`, `status`, `identityKey` ou `errorCode`. O ID sintético deve seguir:

```text
sheet:<spreadsheetId>:<sheetId>:row:<n>
```

Agora tanto linhas PF quanto PJ podem concluir, desde que contenham todos os campos obrigatórios do respectivo ramo. Uma linha já concluída não deve criar novos artefatos. Se a mesma linha for editada, o ID sintético permanece igual e o fingerprint é comparado novamente.

Para retomar uma linha corrigida, defina:

```text
MANUAL_HISTORICAL_ROW=<número da linha>
```

Execute `reprocessarLinhaHistoricaConfiguradaDocumentalistas`. Não reinicialize a planilha técnica nem apague artefatos existentes.

### Teste controlado obrigatório com a linha 3

Antes de reprocessar, localize a linha 3 em `importacoes_historicas` por `sourceRow: 3`. Registros criados antes da versão 1.1.5 podem mostrar o ID legado sem `:row:`; o estado persistente e os novos registros usam:

```text
sheet:18xtCdLKVk-WKcenh6bR468P4yeHXCpAtbHHo_521qN4:1808239713:row:3
```

O erro anterior `REQUIRED_FIELD_MISSING` para COMPE em uma resposta PIX foi causado pela versão 1.1.4 e está corrigido. Defina:

```text
MANUAL_HISTORICAL_ROW=3
```

Execute `reprocessarLinhaHistoricaConfiguradaDocumentalistas`. Nesta primeira execução corrigida, o esperado é `COMPLETED`; como a tentativa antiga falhou antes de criar estado, `alreadyProcessed` pode ser `false`. A própria linha em `importacoes_historicas` deve mudar para `COMPLETED`. Execute a função uma segunda vez: agora o esperado é `alreadyProcessed: true`, com os mesmos IDs e data de emissão.

Para consultar o estado pelo ID sintético, defina:

```text
MANUAL_STATE_LOOKUP_KEY=sheet:18xtCdLKVk-WKcenh6bR468P4yeHXCpAtbHHo_521qN4:1808239713:row:3
```

Execute `consultarEstadoConfiguradoDocumentalistas` antes e depois e compare os IDs. Remova as duas propriedades manuais ao terminar.

Depois que a linha 3 concluir e o contrato for inspecionado, prefira a fila segura descrita abaixo. `reprocessarErrosHistoricosDocumentalistas` permanece apenas como compatibilidade e pode concentrar trabalho demais numa execução.

### Lote explícito autorizado em 18/09/2026

As linhas autorizadas são `3,4,5,6,8,9,10,15`. A inspeção atual confirmou PIX sem COMPE nas linhas 3, 4, 5, 6, 8, 9 e 10, e TED com COMPE e sem tipo PIX na linha 15. Não apague células dessas linhas antes deste lote.

Defina:

```text
MANUAL_HISTORICAL_ROWS=3,4,5,6,8,9,10,15
```

Execute:

```text
corrigirPadraoNomePastaDocumentalistas
reprocessarLinhasHistoricasSelecionadasDocumentalistas
```

Na tentativa feita ainda com a versão 1.1.6, a execução atingiu seis minutos durante Vivian, linha 9. A inspeção do registro persistente comprovou:

- linha 9: pasta e contrato salvos, `stage: CONTRACT_READY`, planilha ainda ausente;
- linha 10: não iniciada por esse lote;
- linha 15: já integralmente concluída.

Depois de recarregar o editor com a versão 1.1.7, mantenha a mesma propriedade e execute novamente `reprocessarLinhasHistoricasSelecionadasDocumentalistas`. A função filtrará as linhas já concluídas; no estado observado, `initialPendingRows` deve conter `[9,10]`. Vivian será retomada na criação/reconciliação da planilha, sem recriar a pasta ou o contrato, e a linha 15 será ignorada.

A execução trabalha no máximo duas linhas e garante previamente um gatilho `retomarFilaHistoricaDocumentalistas`. Se ainda houver trabalho ao fim da chamada — ou se o Apps Script interromper abruptamente a execução — o gatilho continua a fila. Não execute várias cópias manualmente em paralelo.

Execute `diagnosticarFilaHistoricaDocumentalistas` até obter:

```text
pendingRows: []
inFlightRow: null
```

Um `inFlightRow` recente significa que outra execução ainda está trabalhando. Após um timeout, o checkpoint fica elegível novamente depois da janela de segurança e a retomada reconcilia os artefatos existentes. Um gatilho já agendado pode executar uma última vez sem trabalho; isso é esperado.

Na execução real, a fila concluiu com duas tentativas e nenhuma falha: a linha 9 preservou `folderId`/`contractId` e recebeu a planilha faltante; a linha 10 criou os três artefatos. O diagnóstico posterior retornou fila vazia e nenhuma linha em voo.

### Regenerar somente o contrato da linha 15

A linha 15 já estava marcada como integralmente concluída e, por isso, é corretamente ignorada pelas filas idempotentes. Como sua pasta ainda usa o padrão antigo e o contrato foi emitido antes da correção TED/PIX, use a operação específica antes da varredura geral.

Defina:

```text
MANUAL_HISTORICAL_ROW=15
CONFIRM_CONTRACT_DATA_MIGRATION_ROW=15
```

Execute uma única vez:

```text
regenerarContratoLinhaHistoricaConfiguradaDocumentalistas
```

A segunda propriedade confirma que a linha 15 corrigida é agora a fonte contratual canônica. Ela é necessária porque o registro persistente conserva o hash anterior, mas não armazena uma cópia integral dos dados antigos que permita reconstruir a diferença. A operação continua bloqueada se o CPF/CNPJ mudar ou se o ramo TED ainda contiver dados PIX. A confirmação é consumida automaticamente após o checkpoint seguro.

A operação valida o estado e os metadados, preserva a planilha e a data de emissão, envia somente o contrato antigo para a lixeira, reconcilia o nome da pasta e gera o novo DOCX com a lógica TED atual. Confirme no retorno:

- `status: COMPLETED`;
- `sourceRow: 15`;
- `spreadsheetPreserved: true`;
- `spreadsheetId` igual ao anterior;
- `contractId` diferente de `oldContractId`;
- `folderName` com apenas um par de parênteses;
- `templateVersion` preservada.
- `fingerprintMigrated: true`.

O contrato antigo fica recuperável na lixeira. Se houver timeout, execute a mesma função novamente: `CONTRACT_REGENERATION_ACTIVE_JSON` permite reconciliar o contrato antigo já descartado ou uma emissão concluída cujo retorno tenha se perdido. Não edite essa propriedade interna. Não use `removerArtefatosLinhaHistoricaConfiguradaDocumentalistas` para esse caso, pois essa outra função remove a pasta completa e também a planilha.

Na execução real de 18/09/2026, a regeneração da linha 15 concluiu com a migração confirmada, preservando a planilha e substituindo o contrato legado.

### Processar todos os demais históricos e manter os próximos envios

Somente depois que a fila selecionada estiver vazia, execute uma vez:

```text
reprocessarHistoricoPendenteDocumentalistas
```

Essa rotina:

1. instala ou reutiliza primeiro `onFormSubmitDocumentalistas` no Forms;
2. relê a última linha atual da planilha vinculada e amplia o fim do recorte;
3. pula apenas identidades `COMPLETED` que tenham `folderId`, `contractId` e `spreadsheetId`;
4. enfileira as linhas ausentes, com erro ou incompletas;
5. continua em lotes de até duas linhas por `retomarFilaHistoricaDocumentalistas`.

Acompanhe com `diagnosticarFilaHistoricaDocumentalistas`, **Execuções** e `importacoes_historicas`. Códigos de validação, conflito ou permissão continuam exigindo correção humana e saem da fila automática com o erro registrado; não são repetidos indefinidamente.

Os envios realizados depois dessa fotografia são cobertos por `onFormSubmitDocumentalistas`. Desde a 1.1.7, o responseId é salvo antes do processamento; se a execução exceder o tempo, `retomarFilaPendenteDocumentalistas` retoma o mesmo cadastro. Confirme que existe exatamente um gatilho Forms visível para a conta executora. Não é necessário executar periodicamente a raspagem completa.

Na execução real de 18/09/2026, a fila geral foi iniciada com 15 linhas pendentes e avançou da linha 2 para a 7, restando 14. `retomarFilaPendenteDocumentalistas` pertence à fila de novos envios do Forms e pode executar vazio; a continuação do histórico usa `retomarFilaHistoricaDocumentalistas`. Um `inFlightRow` com menos de sete minutos é reservado e não deve ser retomado em paralelo. A versão 1.1.10 identifica a continuação futura pelo UID, remove somente acionadores antigos do mesmo handler interno e ignora os registros desativados ao agendar. O diagnóstico retorna `continuationScheduled`. Após recarregar o editor, espere o lease da linha 7 vencer e execute uma vez `retomarFilaHistoricaDocumentalistas`; depois deixe a fila prosseguir pelos acionadores criados.

### Recriar o teste da linha 3

A pasta de Sérgio não pôde ser excluída pelo acesso técnico local: o conector conseguiu listá-la, mas a exclusão recebeu `NOT_FOUND` no Shared Drive. Para removê-la de forma recuperável com a conta executora, mantenha `MANUAL_HISTORICAL_ROW=3` e execute:

```text
removerArtefatosLinhaHistoricaConfiguradaDocumentalistas
```

Confirme `status: TRASHED` e então execute o lote acima. A pasta irá para a lixeira, o estado preservará a data da primeira emissão e a linha 3 recriará contrato/planilha sob `SERGIO RODRIGO ZANOBINI SATHLER, (029.414.967-85)`.

Daniela está na linha 4, porém a auditoria encontrou essa linha em `ERROR`, sem estado concluído e sem pasta filha da raiz. Portanto, não existe artefato de Daniela a apagar; ela será criada pela primeira vez no lote selecionado. A execução concluída anterior à de Sérgio pertence à linha 15, Gisela, e não deve ser apagada por engano.

### Se outra resposta tiver campos dos dois ramos

É permitido corrigir a planilha vinculada manualmente antes do primeiro processamento correto, mas limpe apenas o ramo que não corresponde a `Forma de pagamento`:

- PIX: limpar `Código do banco (COMPE)`, `Agência bancária`, `Conta bancária` e `Tipo de conta bancária`;
- TED: limpar `Tipo de Chave PIX` e `Chave PIX`.

Não exclua a linha inteira, o timestamp nem dados cadastrais. Se já houver estado `COMPLETED`, a alteração muda o fingerprint e exige revisão/reset controlado; não force a sobrescrita.

### Expurgo integral de uma resposta indevida

Use somente quando a resposta e o cadastro inteiro precisarem ser removidos, e não quando o objetivo for testar uma nova emissão. Configure o mesmo número nas duas propriedades:

```text
MANUAL_HISTORICAL_ROW=<linha>
CONFIRM_HISTORICAL_PURGE_ROW=<mesma linha>
```

Execute `expurgarCadastroLinhaHistoricaConfiguradaDocumentalistas()`. Antes da primeira remoção, a função exige uma única resposta original do Forms com o mesmo timestamp/identidade, bloqueia identidades associadas a outras respostas e valida pasta, contrato e planilha pelos metadados da automação. Sob lock exclusivo, ela retira a linha das filas, exclui a resposta no Forms, limpa o conteúdo da linha sem removê-la, envia a pasta ao lixo e remove o estado e a auditoria histórica.

Se houver timeout, execute novamente a mesma função sem trocar a linha nem apagar `HISTORICAL_PURGE_ACTIVE_JSON`. O checkpoint retoma apenas as etapas restantes. A pasta permanece recuperável na lixeira do Drive; retenção do Forms, histórico da planilha, backups e logs são camadas externas à função.

Erros que exigem revisão humana incluem `REQUIRED_FIELD_MISSING`, `INVALID_CPF`, `INVALID_CNPJ`, `INVALID_CEP`, `AMBIGUOUS_HISTORICAL_VALUE`, `CONTRACT_DATA_CONFLICT` e qualquer código terminado em `_CONFLICT`. `TEMPLATE_ENTITY_TYPE_MISMATCH` não é resultado esperado com os releases atuais; se ocorrer, pare e confirme se o arquivo/configuração do ramo foi trocado.

## 7. Preparar os dois envios em tempo real

Use dois cadastros de homologação autorizados, com documentos válidos e ainda não processados nesta raiz:

| Caso | Escolha no Forms | Identidade da pasta | Template esperado |
|---|---|---|---|
| PF | `Pessoa Física` | CPF canônico | `definitivo-pf-2026-09-v1` |
| PJ | opção iniciada por `Pessoa Jurídica` | CNPJ canônico | `definitivo-2026-09-v1` |

Para cada envio, anote em local seguro:

- data/hora e conta executora;
- tipo esperado;
- nome/razão social esperado em caixa-alta;
- documento canônico;
- responseId do Forms;
- execution ID do gatilho;
- folderId, contractId e spreadsheetId;
- versão/hash selecionados.

## 8. Enviar o caso PF pela interface real

Abra o [formulário público](https://docs.google.com/forms/d/1909wHJxDC5b4s2HXO3sd1t2Iydh7PpQRDQ1hzetoneM/viewform).

1. Preencha nome, telefone, e-mails e credencial ONR de teste autorizada.
2. Em **Como você realizará as assessorias?**, escolha **Pessoa Física**.
3. Preencha nacionalidade, estado civil, profissão, RG, CPF e endereço da pessoa física.
4. Escolha a forma de pagamento. Para PIX, preencha somente tipo e chave PIX; para TED, preencha COMPE, agência, conta e tipo de conta.
5. Preserve zeros à esquerda em banco, agência, conta, documentos, CEP e telefone.
6. Envie pelo botão normal do Forms e anote o horário.

Não preencha campos PJ por fora do fluxo condicional e não reutilize CPF já associado a dados contratuais diferentes.

## 9. Enviar o caso PJ pela interface real

Abra novamente o formulário público.

1. Preencha os campos comuns com um cadastro PJ de homologação autorizado.
2. Em **Como você realizará as assessorias?**, escolha a opção iniciada por **Pessoa Jurídica**.
3. Preencha razão social, CNPJ e endereço da empresa.
4. Preencha nacionalidade, estado civil, profissão, RG, CPF e endereço do representante.
5. Escolha a forma de pagamento e preencha somente os campos exibidos pelo ramo PIX ou TED.
6. Envie pelo botão normal do Forms e anote o horário.

Os envios reais são indispensáveis: reprocessar por função não comprova o disparo do gatilho Forms.

Se nesta homologação só puder ser usada a resposta histórica da linha 3, será possível validar geração, recuperação e idempotência, mas o critério de disparo real do gatilho continuará pendente até existir um novo envio pela interface do Forms.

## 10. Conferir as execuções do gatilho

Em **Execuções**, localize as duas execuções `onFormSubmitDocumentalistas` iniciadas após os horários anotados.

Para cada uma, o esperado é:

- origem por gatilho e status **Concluído**;
- log `FORM_SUBMIT` com `COMPLETED`;
- responseId e identityKey técnicos;
- nenhuma resposta integral, senha ou documento sem máscara nos logs.

Se houver erro, anote o código antes de reenviar. Falha de lock deve entrar na fila e criar, quando necessário, um único gatilho `retomarFilaPendenteDocumentalistas`.

## 11. Consultar o estado persistente

Para cada responseId, defina:

```text
MANUAL_RESPONSE_ID=<responseId>
```

Execute `consultarEstadoConfiguradoDocumentalistas` e confira:

- `status: COMPLETED` e `stage: COMPLETED`;
- `folderId`, `contractId` e `spreadsheetId`;
- PF com `templateVersion: definitivo-pf-2026-09-v1`;
- PJ com `templateVersion: definitivo-2026-09-v1`;
- data da primeira emissão;
- documento apenas mascarado.

Uma inversão de versões indica falha de roteamento e reprova o teste.

## 12. Conferir pastas e planilhas

Na raiz de destino, cada cadastro deve possuir uma pasta filha direta:

```text
NOME OU RAZÃO SOCIAL, (CPF/CNPJ FORMATADO)
```

Dentro dela:

```text
Contrato - NOME OU RAZÃO SOCIAL.docx
Planilha de Controle - NOME OU RAZÃO SOCIAL
```

Confirme que PF e PJ com nomes iguais, mas documentos diferentes, não foram confundidos. Não pode haver fallback para Meu Drive nem alteração automática de compartilhamento.

Em cada planilha, confira nome/aba personalizados, localidade `pt_BR`, fuso `America/Sao_Paulo`, 38 colunas, `ID` oculto em A, B:AL na ordem documentada, ausência de histórico/fila fictícia de imóveis, preservação das validações úteis e aba `data` sem `IMPORTRANGE` ativo.

## 13. Conferir o contrato PF

Baixe o contrato PF e compare-o com `templates/CONTRATO DE PRESTAÇÃO DE SERVIÇOS - PF.docx` no mesmo editor.

A qualificação deve ter esta estrutura, com os placeholders preenchidos em caixa-alta e negrito:

```text
CONTRATADA: <NOME>, de nacionalidade <NACIONALIDADE>, estado civil <ESTADO CIVIL>, de profissão <PROFISSÃO>, titular do RG nº <RG> e do CPF nº <CPF>, com domicílio em <ENDEREÇO>.
```

Confira também:

- nenhuma menção a CNPJ, razão social, sede, sócio ou representante na qualificação da contratada;
- inciso sucessório referindo-se ao falecimento da `CONTRATADA` e ao valor proporcional devido a ela ou a seus sucessores;
- nome da contratada repetido corretamente no bloco de assinatura;
- `NOVA LIMA/MG, DATA POR EXTENSO.`;
- nenhum `{{placeholder}}` restante;
- texto jurídico fixo, paginação, margens, numeração, parágrafos e assinaturas preservados.

## 14. Conferir o contrato PJ

Baixe o contrato PJ e compare-o com `templates/CONTRATO DE PRESTAÇÃO DE SERVIÇOS.docx`.

Confira razão social, CNPJ, sede, nome e qualificação do representante, endereço do representante, pagamento e assinatura. Os valores devem estar em caixa-alta e negrito somente nos trechos inseridos, sem placeholders restantes e sem alteração do texto fixo.

Nos dois contratos, teste visualmente caracteres como `&`, `<`, `>`, aspas e barras quando estiverem presentes nos dados autorizados. O número de páginas pode variar conforme o tamanho dos valores, mas não deve apresentar a mudança estrutural da conversão Google Docs.

## 15. Comprovar idempotência por ramo

Reenvie o PF com o mesmo CPF e os mesmos dados contratuais. Depois faça o mesmo para o PJ.

Em cada par original/reenvio devem permanecer iguais:

- folderId;
- contractId;
- spreadsheetId;
- data de emissão;
- versão/hash do template.

O estado deve associar os novos responseIds sem criar outra pasta, planilha ou contrato. Em teste separado e controlado, mudar um dado contratual mantendo o mesmo CPF ou CNPJ deve produzir `CONTRACT_DATA_CONFLICT`, preservar os artefatos anteriores e impedir sobrescrita silenciosa.

## 16. Critérios de aprovação

- [ ] configuração gravada e OAuth autorizado pela conta executora;
- [ ] diagnóstico `READY`, inclusive acesso à planilha vinculada;
- [ ] templates PF e PJ retornaram `VALID` com versões/hashes corretos;
- [ ] um gatilho Forms instalado para a conta;
- [ ] recorte histórico congelado e lotes concluídos/auditados;
- [ ] uma resposta PF enviada pela interface real e concluída;
- [ ] uma resposta PJ enviada pela interface real e concluída;
- [ ] PF registrou a versão PF e PJ registrou a versão PJ;
- [ ] cada estado terminou `COMPLETED` com os três IDs de artefato;
- [ ] parents dos artefatos conferidos no Shared Drive;
- [ ] os dois DOCX finais comparados visualmente com seus originais;
- [ ] valores em caixa-alta/negrito e texto fixo preservado;
- [ ] planilhas vazias, saneadas e funcionais;
- [ ] reenvios equivalentes reutilizaram os mesmos IDs;
- [ ] nenhuma credencial ou resposta completa apareceu em logs.

## 17. Encerramento

Depois da homologação:

- remova `MANUAL_RESPONSE_ID`, `MANUAL_STATE_LOOKUP_KEY`, `MANUAL_HISTORICAL_ROW` e `MANUAL_HISTORICAL_ROWS` se não forem mais necessários;
- mantenha o gatilho Forms apenas se a ativação de produção estiver autorizada;
- remova manualmente somente gatilhos criados pela própria conta caso seja necessário desativar;
- não apague registros, planilhas, pastas, contratos ou templates sem conferir IDs e retenção;
- preserve versão e hash do template usado em cada emissão.

O código e os dois templates estão publicados. A automação só deve ser declarada integralmente validada em produção quando todos os itens acima forem comprovados pela conta executora e o primeiro DOCX real de cada ramo tiver sido revisado visualmente.
