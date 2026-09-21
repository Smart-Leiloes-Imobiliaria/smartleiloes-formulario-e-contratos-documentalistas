# Estado da publicação

Data da verificação: 2026-09-21.

## Resultado confirmado

- destino: projeto Apps Script `1EmkbYu2DGs2hSd6wBIT50ukyDyqAP_eNS6gU0XWyY5atYfHpMtbsKZof`, já vinculado ao formulário;
- backup remoto imediatamente anterior à versão 1.1.11: `/tmp/documentalistas-appsscript-backup-v111-GD8ioH`;
- publicação: `clasp push` concluído com 17 arquivos;
- conferência final da 1.1.11: clonagem limpa em `/tmp/documentalistas-appsscript-verify-v111-final-kyTrRS`, comparada byte a byte com `src/`, sem diferença;
- seleção do `clasp`: 16 arquivos de código e o manifesto; testes, documentação, Vault, credenciais e DOCX não foram enviados como código;
- validação local: 54/54 testes aprovados; 16 arquivos Apps Script, 46 campos, V8 e Drive API v3;
- formulário vivo: 56 itens totais, 46 respondíveis, sem mapeamento ausente, obsoleto ou título divergente;
- template PJ: hash `53e5651b5deaefc76b3782ad4aae751f80eb9ca47e563cb1a1827238727ac7c8`, versão `definitivo-2026-09-v2`, 19 placeholders e sincronização repetida com reutilização integral;
- template PF: hash `e057a5e24a74ed8a491d4c733b04d844d7b0567ba240ecfecd9c43bcb8b7b62e`, versão `definitivo-pf-2026-09-v2`, 16 placeholders e sincronização repetida com reutilização integral;
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
- correção 1.1.11: expurgo integral protegido por confirmação, lock e checkpoint retira a linha das filas, exclui a resposta original do Forms, limpa a linha sem deslocá-la, envia a pasta identificada à lixeira e remove estado/auditoria. A pasta técnica foi renomeada no mesmo ID para `._automacao_documentalista`, recebeu os releases v2 e passa a reconciliar o nome automaticamente. O primeiro carregamento da configuração migra somente os tuples oficiais v1 para v2 e preserva qualquer release customizado.

O backup em `/tmp` é transitório. Ele já continha a arquitetura de 17 arquivos publicada anteriormente; a atualização atual acrescenta o roteamento PF/PJ sem reverter a segmentação `00_core/`, `10_automations/` e `90_operations/`. Os 15 arquivos planos de 16/09/2026 permanecem apenas como baseline histórica.

## Estado por camada

| Camada | Estado | Evidência ou pendência |
|---|---|---|
| Código Apps Script | Publicado e conferido | versão 1.1.11; 17 arquivos; clone remoto final idêntico |
| DOCX definitivos | Preparados e validados | PJ com 19 placeholders; PF com 16; ambos com hash/versionamento, margens de 0,5″ e 9 páginas locais |
| Templates no Drive | Disponibilizados | releases v2 originais e prévias dentro de `._automacao_documentalista`; repetição reutilizou os quatro recursos e downloads conferiram por hash |
| Seleção e emissão | Implementadas | PF/PJ pelo campo do Forms; Blob ZIP compatível com Apps Script; múltiplos placeholders no mesmo run; substituição direta no OOXML; versão da primeira emissão preservada |
| Prévia Google Docs | Somente diagnóstico | PF/PJ exportaram 10 páginas e confirmaram assinaturas paralelas; produção usa o DOCX original de 9 páginas |
| Planilha de respostas | Acessível; correção de schema publicada | runtime abriu a aba correta; leitura externa confirmou 48 cabeçalhos usados em `Respostas do Formulário 1`, sem escrita |
| Script Properties | Migração automática preparada | o primeiro acionamento após o push migra exatamente o release oficial v1 para v2; configurações customizadas não são alteradas |
| Autorizações Google | Concedidas para o diagnóstico | acesso a Forms, raiz, modelos e planilha confirmado pela execução fornecida; consentimento não cria gatilhos |
| Gatilhos | Código de retomada publicado | confirmar um gatilho Forms; gatilhos temporizados da 1.1.7 só serão criados ao iniciar a nova fila |
| Backfill histórico | Fila geral em andamento | linha 15 regenerada; linha 2 saiu da fila; linha 7 foi observada em voo e a continuidade por UID foi corrigida na 1.1.10 |
| Teste ponta a ponta | Pendente | requer um envio PF e um PJ reais controlados e inspeção dos artefatos |

## Limitações observadas

`clasp run configurarProjetoDocumentalistas` retornou `NOT_FOUND`: o projeto não está configurado como executável da Apps Script API. Nenhuma implantação pública ou web app foi criada para contornar isso; a ativação do release oficial foi tratada por migração segura no próximo acionamento do runtime.

O OAuth local do `clasp` continua sem conseguir executar funções remotas via `clasp run`. A leitura externa controlada da planilha foi limitada à coluna de timestamp e não alterou células. O runtime da conta executora comprovou acesso e percorreu o recorte histórico.

## Próxima validação operacional

No próximo acionamento do runtime, confirmar pelo diagnóstico que PF/PJ apontam para as versões v2. Depois, realizar um envio PF e um PJ controlados e comparar os DOCX finais com os templates originais, principalmente margens, paginação, assinaturas e negrito dos valores. A execução real do expurgo deve ocorrer somente para uma resposta indevida explicitamente autorizada, com as duas propriedades de confirmação iguais.
