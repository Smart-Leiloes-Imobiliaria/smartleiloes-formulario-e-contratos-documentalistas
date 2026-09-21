# Arquitetura

```text
Gatilho instalável do Forms ou recorte histórico congelado da planilha vinculada
  → valida origem, responseId e timestamp
  → extrai por itemId
  → normaliza/valida PF ou PJ
  → calcula identityKey e fingerprint
  → LockService (script lock)
  → registro persistente em planilha técnica
  → seleciona template PF/PJ pelo tipo normalizado
  → valida template versionado e compatibilidade do ramo
  → encontra/cria pasta direta na raiz
  → gera/reconcilia contrato DOCX
  → copia e prepara a planilha nativa
  → checkpoints e conclusão

Qualquer falha do caminho ao vivo depois da extração da resposta
  → traduz código técnico em motivo seguro para o cliente
  → localiza unicamente a linha vinculada
  → envia template Meta pelo SmartChatApp ao telefone informado
  → persiste confirmação do envio
  → expurga resposta, linha, estado, auditoria e artefatos
```

## Módulos Apps Script

- `src/00_core/`: configuração, erros/logs, mapa, normalização, validação, extração, ChatApp, Drive, estado, planilha, template, contrato e workflow.
- `src/10_automations/form_submission/`: gatilho Forms, fila de respostas e compensação durável de falhas por notificação seguida de expurgo.
- `src/10_automations/historical_import/importer.js`: leitura delimitada da planilha vinculada, IDs sintéticos estáveis, log por linha, fila durável e retomada após timeout.
- `src/90_operations/`: diagnóstico, configuração, ativação, simulação, reprocessamento, painel administrativo HTML e compatibilidade dos entrypoints.

## Painel administrativo

Como o projeto é standalone, a interface é um Web App servido por `doGet()`, e não uma caixa vinculada ao editor do Forms. O manifesto aceita somente usuários autenticados e executa como o usuário que acessa. Além da barreira do Google, cada chamada do servidor exige que `Session.getActiveUser().getEmail()` conste em `ADMIN_PANEL_ALLOWED_EMAILS`.

O expurgo mantém diagnóstico e mutação separados, exige confirmação textual e reutiliza lock/checkpoint da operação retomável. O upload de template ocorre em duas fases: validação sem escrita e publicação confirmada. A fase de publicação revalida bytes/hash/ramo, cria ou reutiliza source DOCX e preview Google Docs versionados, verifica o parent técnico e somente então troca as propriedades ativas. Se a validação pós-ativação falhar, as propriedades anteriores são restauradas; arquivos candidatos permanecem versionados para auditoria.

## Identidade e idempotência

`identityKey = SHA-256(ROOT_FOLDER_ID | tipoDocumento | documentoCanônico)`.

O `fingerprint` usa dados contratuais normalizados e exclui responseId, timestamps de execução, links gerados e credenciais ONR. A versão do template é registrada à parte.

- Mesmo documento/fingerprint: reconcilia e reutiliza pasta, contrato e planilha.
- Outra resposta equivalente: adiciona o responseId ao mesmo registro.
- Outra resposta equivalente recebida pelo gatilho ao vivo: `REGISTRATION_ALREADY_EXISTS`, para avisar o cliente e expurgar somente a nova submissão; o cadastro legítimo permanece inalterado.
- Mesmo documento/dados diferentes: `CONTRACT_DATA_CONFLICT`, sem sobrescrita.
- Mesmo responseId com outra identidade: `RESPONSE_IDENTITY_CHANGED`.
- Mesmo nome/documentos diferentes: identidades/pastas distintas.
- Estado incompleto: cada `ensure*` pesquisa antes de criar e continua do checkpoint.

Os recursos recebem `properties` não sensíveis do Drive na criação/cópia e `appProperties` como compatibilidade interna. `properties` permite que provisionador local (`clasp`) e runtime Apps Script reconheçam a mesma identidade/hash apesar de usarem clientes OAuth distintos. Recursos legados só são adotados por correspondência única de nome, tipo e parent pertinente; múltiplos candidatos bloqueiam a escolha.

## Persistência e concorrência

Uma planilha técnica sob `ROOT_FOLDER_ID/._automacao_documentalista` guarda identidade, fingerprint, IDs de resposta, IDs dos artefatos, template, data de emissão, etapa e erro. A aba `importacoes_historicas` registra planilha/aba/linha, status e erro sem copiar respostas completas ou credenciais. Os DOCX versionados PF/PJ ficam nessa mesma pasta compartilhada para permitir manutenção pela equipe sem depender da estação local do autor.

O script lock cobre decisão e criação. Todo novo responseId entra numa fila pequena em `Script Properties` antes do processamento e só é retirado após confirmação. Assim, lock ocupado, erro transitório ou encerramento abrupto pelo limite de execução deixam um caminho de retomada por gatilho temporal. A fila histórica mantém separadamente as linhas pendentes e uma linha em voo; somente um estado `COMPLETED` com pasta, contrato e planilha é considerado concluído. Cache não é fonte de verdade.

A compensação de erros usa uma terceira fila em Script Properties. Ela persiste apenas responseId, código/mensagem segura, linha e checkpoints; telefone, respostas brutas e tokens não são copiados. O envio ao ChatApp precede qualquer remoção. Se o envio ou a localização unívoca falhar, a submissão permanece intacta e é tentada novamente. Depois da confirmação do envio, o checkpoint impede reenvio nas retomadas normais e o expurgo reutiliza o lock/checkpoint já existente. Uma interrupção exatamente entre a aceitação remota da mensagem e a persistência local ainda pode causar novo envio, pois a API não oferece chave de idempotência documentada para esse endpoint.

A exclusão física da linha só é autorizada para a última linha atual, posterior ao recorte histórico congelado e fora da fila histórica. Essa regra evita renumerar linhas usadas como identidade do backfill. Quando qualquer condição não é satisfeita, a operação limpa as células e conserva a posição. O checkpoint grava a intenção e um fingerprint antes de `deleteRow`, permitindo distinguir retomada da linha já eliminada de uma linha nova que eventualmente ocupou a mesma posição.

## Contrato

Os DOCX PF e PJ são provisionados separadamente por hash. `tipoPessoa` é normalizado para `PF` ou `PJ`; essa chave escolhe as quatro propriedades do template correspondente antes do download. O runtime valida que o arquivo contém somente placeholders compatíveis com o ramo, baixa seus bytes, descompacta o OOXML e processa os runs que contêm placeholders completos. Quando texto fixo e um ou mais placeholders compartilham o mesmo `w:t`, o run é dividido em segmentos clonados: o estilo-base é preservado, caracteres especiais são escapados e somente os valores inseridos recebem negrito. Ao final, o runtime verifica a ausência de placeholders e recompõe o DOCX. Não existe conversão Google Docs no caminho de produção nem arquivo intermediário na pasta do documentalista.

O estado registra source ID, hash e versão na primeira emissão. Uma retomada usa essa identidade gravada mesmo que a configuração ativa mude depois, evitando troca de contrato no meio do processamento. O template PJ preserva a qualificação societária; o PF qualifica diretamente a contratada por nacionalidade, estado civil, profissão, RG, CPF e domicílio e adapta a cláusula de sucessão.

Somente placeholders realmente fragmentados entre nós `w:t` são bloqueados por `FRAGMENTED_TEMPLATE_PLACEHOLDER`; texto fixo no mesmo run é suportado. A prévia Google Docs foi mantida apenas para diagnóstico: sua exportação resultou em 13 páginas contra 11 do DOCX, razão pela qual não é fonte de emissão.

## Entrada histórica

`prepararAtivacaoDocumentalistas()` grava o instante de ativação e congela `HISTORICAL_IMPORT_END_ROW` com a última linha existente. Cada linha recebe `sheet:<spreadsheetId>:<sheetId>:row:<n>`; editar a mesma linha preserva a identidade da resposta e força nova comparação de fingerprint. O backfill inicial ocorre em lotes de 10. Reprocessamentos autorizados usam uma fila menor, com até duas linhas por execução e checkpoint de linha em voo. `reprocessarHistoricoPendenteDocumentalistas()` instala primeiro o gatilho Forms, amplia o fim do recorte até a última linha atual e enfileira apenas estados incompletos; novos envios posteriores seguem pelo gatilho Forms.

## Planilha

A fonte é copiada nativamente pelo ID. A cópia mantém abas, formatação, validações, congelamentos, dimensões e fórmulas locais. Conteúdo das linhas operacionais é removido, preservando fórmulas não externas e validações. A coluna A (`ID`) permanece oculta e vazia.

O `IMPORTRANGE` da aba oculta `data` é neutralizado sem autorizar o arquivo externo. A validação de parceiro é substituída pelo nome real. Se outra validação indispensável ainda depender da aba `data` vazia, o fluxo registra `UNRESOLVED_SPREADSHEET_DEPENDENCY` em vez de declarar a planilha funcional.
