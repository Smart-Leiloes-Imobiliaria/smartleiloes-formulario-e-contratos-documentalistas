# Estado da publicação

Data da verificação: 2026-09-18.

## Resultado confirmado

- destino: projeto Apps Script `1EmkbYu2DGs2hSd6wBIT50ukyDyqAP_eNS6gU0XWyY5atYfHpMtbsKZof`, já vinculado ao formulário;
- backup remoto imediatamente anterior à versão 1.1.10: `/tmp/documentalistas-appsscript-backup-triggeruid-eAiwrF`;
- publicação: `clasp push` concluído com 17 arquivos;
- conferência: clonagem limpa final em `/tmp/documentalistas-appsscript-verify-triggeruid-final-eKNlSN`, comparada byte a byte com `src/`, sem diferença;
- seleção do `clasp`: 16 arquivos de código e o manifesto; testes, documentação, Vault, credenciais e DOCX não foram enviados como código;
- validação local: 50/50 testes aprovados; 16 arquivos Apps Script, 46 campos, V8 e Drive API v3;
- formulário vivo: 56 itens totais, 46 respondíveis, sem mapeamento ausente, obsoleto ou título divergente;
- template PJ: hash `c30e7d366613160015f8669dedc2ef92cfdcda9d6e802f2755f1de92aaf92579`, versão `definitivo-2026-09-v1`, 19 placeholders e sincronização repetida com reutilização integral;
- template PF: hash `9652eac539e89ea1fb3db20076ef85564ad2dcd0ecc7bfdacaadc4168d81b0ce`, versão `definitivo-pf-2026-09-v1`, 16 placeholders e sincronização repetida com reutilização integral;
- compatibilidade: templates exclusivos por ramo e seleção automática pelo tipo PF/PJ normalizado do formulário.
- correção 1.1.1: o runtime recria o Blob DOCX como `application/zip` antes de `Utilities.unzip`; os dois arquivos remotos foram baixados e conferidos contra os hashes locais, assinatura `PK` e teste integral do ZIP;
- correção 1.1.2: placeholders completos junto a texto fixo ou a outros placeholders no mesmo `w:t` são separados em runs clonados, preservando o texto fixo e aplicando negrito apenas aos valores. Fragmentação real entre nós permanece bloqueada. O teste de regressão preencheu integralmente o XML dos dois DOCX definitivos, sem alterar arquivos, hashes, versões, IDs ou Script Properties.
- correção 1.1.3: o cabeçalho real `Como você realizará as assessorias?` passou a ser o título canônico do item `151260162`; `Pessoa Física ou Pessoa Jurídica?` permanece como alias histórico. O diagnóstico também expõe `details.missingHeaders` em erros futuros.
- correção 1.1.4: `retomarAtivacaoAposPausaDocumentalistas()` reinstala o gatilho Forms antes da releitura final, amplia somente o fim do recorte e preserva o checkpoint. A leitura externa de `A1:A122` encontrou a última resposta na linha 22, sem acessar outras colunas nem alterar células.
- correção 1.1.5: PIX exige somente tipo/chave; TED exige COMPE/agência/conta/tipo. A cláusula OOXML remove os rótulos do ramo não escolhido, mantendo o fingerprint anterior para compatibilidade com estados já concluídos. Reprocessamentos manuais atualizam a auditoria; uma operação limitada retoma somente registros `ERROR` do recorte.
- correção 1.1.6: pasta no padrão `NOME, (DOCUMENTO)`, reconciliação renomeia pastas identificadas, lote manual aceita somente linhas explicitamente configuradas e uma rotina protegida envia artefatos de homologação para a lixeira antes de recriá-los.
- correção 1.1.7: respostas novas são enfileiradas antes do processamento; lotes históricos selecionados e completos usam fila persistente, linha em voo, gatilho de continuação e lotes de até duas linhas. Apenas estados com pasta, contrato e planilha concluídos são ignorados, permitindo que um timeout em `CONTRACT_READY` retome somente a planilha faltante.
- correção 1.1.8: regeneração explícita de contrato histórico valida fingerprint, pasta, parent e metadados antes de qualquer remoção; envia somente o DOCX antigo para a lixeira, preserva a planilha e a data da primeira emissão, reconcilia o nome da pasta e gera o contrato com a lógica atual.
- correção 1.1.9: uma linha histórica corrigida pode substituir explicitamente o fingerprint anterior somente com confirmação por número de linha, identidade documental preservada e ramo PIX/TED inativo vazio. Um checkpoint em Script Properties torna a remoção/reemissão retomável quando o resultado de uma execução é incerto.
- correção 1.1.10: cada continuação temporizada é identificada pelo UID gravado em Script Properties. O disparo consome seu próprio UID, acionadores desativados antigos do mesmo handler não bloqueiam o próximo lote e são removidos sem tocar no gatilho Forms ou em handlers alheios; o diagnóstico informa `continuationScheduled`.

O backup em `/tmp` é transitório. Ele já continha a arquitetura de 17 arquivos publicada anteriormente; a atualização atual acrescenta o roteamento PF/PJ sem reverter a segmentação `00_core/`, `10_automations/` e `90_operations/`. Os 15 arquivos planos de 16/09/2026 permanecem apenas como baseline histórica.

## Estado por camada

| Camada | Estado | Evidência ou pendência |
|---|---|---|
| Código Apps Script | Publicado e conferido | versão 1.1.10; 17 arquivos; clone remoto idêntico |
| DOCX definitivos | Preparados e validados | PJ com 19 placeholders; PF com 16; ambos com hash/versionamento e 11 páginas locais |
| Templates no Drive | Disponibilizados | dois DOCX originais e respectivas prévias na pasta técnica; repetição reutilizou os quatro recursos |
| Seleção e emissão | Implementadas | PF/PJ pelo campo do Forms; Blob ZIP compatível com Apps Script; múltiplos placeholders no mesmo run; substituição direta no OOXML; versão da primeira emissão preservada |
| Prévia Google Docs | Não fiel para produção | exportou 13 páginas; mantida somente como diagnóstico |
| Planilha de respostas | Acessível; correção de schema publicada | runtime abriu a aba correta; leitura externa confirmou 48 cabeçalhos usados em `Respostas do Formulário 1`, sem escrita |
| Script Properties | Gravadas pela conta executora | não repetir a configuração na correção 1.1.3; IDs, versões e hashes não mudaram |
| Autorizações Google | Concedidas para o diagnóstico | acesso a Forms, raiz, modelos e planilha confirmado pela execução fornecida; consentimento não cria gatilhos |
| Gatilhos | Código de retomada publicado | confirmar um gatilho Forms; gatilhos temporizados da 1.1.7 só serão criados ao iniciar a nova fila |
| Backfill histórico | Fila geral em andamento | linha 15 regenerada; linha 2 saiu da fila; linha 7 foi observada em voo e a continuidade por UID foi corrigida na 1.1.10 |
| Teste ponta a ponta | Pendente | requer um envio PF e um PJ reais controlados e inspeção dos artefatos |

## Limitações observadas

`clasp run diagnosticarConfiguracaoDocumentalistas` retornou `NOT_FOUND`: o projeto não está configurado como executável da Apps Script API. Nenhuma implantação pública ou web app foi criada para contornar isso.

O OAuth local do `clasp` continua sem conseguir executar funções remotas via `clasp run`. A leitura externa controlada da planilha foi limitada à coluna de timestamp e não alterou células. O runtime da conta executora comprovou acesso e percorreu o recorte histórico.

## Próxima ação obrigatória

No editor Apps Script, com a conta executora e sem repetir `configurarProjetoDocumentalistas()`:

1. recarregar o editor e definir `MANUAL_HISTORICAL_ROW=15` e `CONFIRM_CONTRACT_DATA_MIGRATION_ROW=15`;
2. executar uma única vez `regenerarContratoLinhaHistoricaConfiguradaDocumentalistas()` e confirmar planilha preservada, novo contrato e pasta com parênteses simples;
3. executar uma vez `reprocessarHistoricoPendenteDocumentalistas()` para enfileirar todo o histórico ainda incompleto e garantir o gatilho Forms;
4. acompanhar `diagnosticarFilaHistoricaDocumentalistas()`, revisar erros não recuperáveis em `importacoes_historicas` e conferir os artefatos;
5. realizar os testes PF/PJ em tempo real quando houver envios autorizados.

A automação só estará integralmente validada após esses passos e a conferência visual do primeiro DOCX final de cada ramo.
