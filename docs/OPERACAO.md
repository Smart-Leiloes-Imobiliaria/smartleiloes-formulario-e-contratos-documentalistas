# Operação, duplicidades e recuperação

## Diagnóstico

`diagnosticarConfiguracaoDocumentalistas()` distingue recurso inacessível, autorização/permissão, planilha inválida, template ausente/inválido e situação dos gatilhos. Logs possuem etapa, resultado e identificadores técnicos; documentos são mascarados e respostas/credenciais não são registradas.

`listarCamposFormularioDocumentalistas()` retorna ID, título, tipo, obrigatoriedade do Forms e mapeamento. O comando local `npm run form:inspect` compara os 46 itens respondíveis do formulário público com o mapa versionado. O diagnóstico também abre a planilha de respostas pelo ID e localiza a aba pelo `gid`, sem depender do nome visível.

`diagnosticarChatAppDocumentalistas()` renova/obtém o token pela biblioteca, lista os templates da licença/messenger configurados e confirma o ID esperado sem retornar credenciais. `diagnosticarCompensacoesErroDocumentalistas()` mostra apenas referências mascaradas, código original, linha, etapa, tentativas e falha mais recente da fila automática.

## Simulação e ativação

1. Execute `npm run check`.
2. Publique com `clasp push`.
3. Autorize `configurarProjetoDocumentalistas()` e o diagnóstico.
4. Configure os tokens ChatApp exclusivamente nas Script Properties e exija `READY` em `diagnosticarChatAppDocumentalistas()`.
5. Sincronize/ative os DOCX PF e PJ.
6. Simule um responseId controlado de cada ramo.
7. Execute `prepararAtivacaoDocumentalistas()` para congelar o histórico e instalar/agendar os gatilhos.
8. Envie uma resposta real de homologação pelo Forms; chamada programática não comprova o disparo do gatilho.
9. Verifique pasta, parent dos dois arquivos, DOCX visual, planilha vazia e registro.
10. Reenvie dados equivalentes e confirme reutilização.

## Painel administrativo

1. Em **Configurações do projeto > Propriedades do script**, defina `ADMIN_PANEL_ALLOWED_EMAILS` com os administradores autorizados, separados por vírgula.
2. Publique o código e crie/atualize a implantação do tipo Web App.
3. Abra a URL `/exec` autenticado com uma conta autorizada e conceda os escopos solicitados.
4. Para expurgo, informe a linha, use **Conferir linha**, compare nome/documento mascarado/erro e digite a confirmação exibida.
5. Para contrato, escolha PF/PJ, informe uma versão nova no padrão indicado, selecione o DOCX, valide e só então confirme a publicação.

O painel nunca recebe senha ONR nem exibe documento integral. Templates aceitam no máximo 8 MB. Uma versão já existente com hash diferente é bloqueada; é necessário incrementar `vN`. A publicação mantém o release anterior e cadastros já iniciados continuam usando o template registrado em seu estado.

O histórico nunca é inferido diretamente de todas as respostas do Forms: ele é lido da planilha vinculada e delimitado por linhas. A ativação inicial usa o recorte congelado. Quando autorizado, `reprocessarHistoricoPendenteDocumentalistas()` amplia o fim desse recorte até a última linha atual, instala/reutiliza primeiro o gatilho Forms e enfileira somente registros ainda incompletos. Assim, respostas novas que chegarem depois da fotografia pertencem ao gatilho Forms e não ficam numa janela sem cobertura.

Como o botão **Executar** não fornece argumentos, a operação manual pode gravar `MANUAL_RESPONSE_ID` nas Script Properties e executar `simularRespostaConfiguradaDocumentalistas()` ou `reprocessarRespostaConfiguradaDocumentalistas()`. `consultarEstadoConfiguradoDocumentalistas()` usa `MANUAL_STATE_LOOKUP_KEY` ou, na ausência dela, `MANUAL_RESPONSE_ID`. Essas propriedades selecionam somente um registro e não autorizam reprocessamento histórico em massa.

## Falhas e checkpoints

Etapas: `RECEIVED`, `TEMPLATE_VALIDATED`, `FOLDER_READY`, `CONTRACT_READY`, `SPREADSHEET_READY`, `COMPLETED`.

Em timeout ou resposta incerta do Drive, a próxima tentativa consulta metadados, nome e parent antes de repetir. Falha de permissão nunca redireciona para Meu Drive. O contrato é criado diretamente do DOCX original; não há documento intermediário na pasta final.

Antes de processar um novo envio, o responseId entra em `PENDING_RESPONSE_IDS` e um gatilho temporizado é garantido. O item só sai depois de conclusão ou erro não recuperável. Portanto, inclusive um encerramento abrupto pelo limite de seis minutos deixa uma referência durável para `retomarFilaPendenteDocumentalistas`. O consumidor trabalha um ID por vez sob lock; falhas recuperáveis continuam na fila. A fila recusa novas inclusões ao atingir 100 IDs, com erro explícito, em vez de eliminar IDs antigos. O registro persistente conserva todos os IDs associados à identidade.

Erros efetivos do processamento ao vivo deixam a fila normal e entram em `ERROR_COMPENSATION_QUEUE_JSON`. A automação envia o template `1322926056423441` com uma mensagem amigável em `{{1}}` e só então chama o expurgo interno. Erros conhecidos — CPF/CNPJ, e-mail, CEP, obrigatório, tipo, pagamento, formulário alterado, conflito e cadastro existente — possuem texto específico; os demais recebem texto genérico sem detalhes internos. Falha de envio preserva a resposta. Após oito tentativas, corrija a causa, consulte `diagnosticarCompensacoesErroDocumentalistas()` e execute manualmente `retomarCompensacoesErroDocumentalistas()`.

O expurgo automático e o manual removem a resposta original do Forms, estado, auditoria e eventual pasta identificada. A linha é excluída fisicamente apenas quando for a última linha atual, posterior ao histórico congelado e fora de qualquer processamento histórico; caso contrário, suas células são limpas para impedir que referências por número de linha sejam deslocadas. O painel continua sendo a operação indicada para cadastros válidos posteriormente descontinuados.

Para retomar manualmente um processamento que não chegou a ser classificado como erro, corrija a causa e execute `reprocessarRespostaDocumentalistas(responseId)`. Consulte antes/depois com `consultarEstadoDocumentalistas(responseId)`.

## Importação histórica

`prepararAtivacaoDocumentalistas()` define, apenas se ainda ausentes, o instante de ativação, a linha inicial 2, a última linha existente e o próximo checkpoint. `retomarImportacaoHistoricaDocumentalistas` é um gatilho temporal de uma execução e agenda o próximo lote apenas enquanto houver linhas pendentes.

Após uma pausa em que os gatilhos foram removidos, use `retomarAtivacaoAposPausaDocumentalistas()`. A função exige checkpoints existentes, valida templates e fonte, reinstala primeiro o gatilho Forms, relê a última linha, amplia somente `HISTORICAL_IMPORT_END_ROW`, preserva `HISTORICAL_IMPORT_NEXT_ROW` e agenda um único gatilho de continuação quando houver linhas pendentes. Isso evita edição manual das propriedades e incorpora respostas recebidas durante a pausa.

Cada linha fica registrada em `importacoes_historicas`. Linhas concluídas são reutilizadas; linhas com erro não desaparecem e podem ser retomadas por `MANUAL_HISTORICAL_ROW` + `reprocessarLinhaHistoricaConfiguradaDocumentalistas()`. A identidade sintética é estável mesmo se o conteúdo da linha for alterado, fazendo o pipeline detectar mudança de fingerprint/conflito.

`diagnosticarCheckpointHistoricoDocumentalistas()` mostra o recorte efetivamente lido pelo runtime, o próximo checkpoint, a última linha atual da fonte e eventuais linhas posteriores ao corte, sem escrever. O reprocessamento manual atualiza também `importacoes_historicas`.

Para um lote nominal, defina `MANUAL_HISTORICAL_ROWS` com até 20 números separados por vírgula e execute `reprocessarLinhasHistoricasSelecionadasDocumentalistas()`. A lista é deduplicada, ordenada e rejeitada integralmente se contiver valor inválido ou linha fora do recorte. Estados realmente concluídos — `COMPLETED` com os três IDs de artefato — são ignorados. As demais linhas entram numa fila persistente, em lotes de até dois, com continuação por `retomarFilaHistoricaDocumentalistas`. Se uma execução for encerrada no meio, a linha em voo permanece marcada e volta a ser elegível após a janela de segurança; o pipeline retoma do último artefato salvo.

Depois do lote nominal, execute uma única vez `reprocessarHistoricoPendenteDocumentalistas()` para cobrir todo o intervalo da linha 2 até a última resposta atual. A função não recria quem já terminou e mantém o gatilho Forms ativo para os próximos envios. Acompanhe com `diagnosticarFilaHistoricaDocumentalistas()`: `pendingRows: []` e `inFlightRow: null` significam que a fila terminou. Gatilhos temporizados já criados podem executar uma última vez e encerrar sem trabalho.

`reprocessarErrosHistoricosDocumentalistas()` permanece por compatibilidade, mas executa o lote legado na mesma chamada e não é a rotina recomendada para um volume sujeito a timeout.

Se um artefato de homologação precisar ser recriado, defina `MANUAL_HISTORICAL_ROW` e execute `removerArtefatosLinhaHistoricaConfiguradaDocumentalistas()`. A remoção só ocorre quando a pasta é filha direta da raiz e possui `sl_kind`/`sl_identity` compatíveis com o estado. Ela vai para a lixeira do Drive, os IDs dos artefatos são limpos no registro e a data da primeira emissão é preservada para o reprocessamento seguinte.

Quando apenas um contrato emitido por uma versão anterior da lógica precisar ser corrigido, não descarte a pasta inteira. Defina `MANUAL_HISTORICAL_ROW` e execute `regenerarContratoLinhaHistoricaConfiguradaDocumentalistas()`. A operação exige pasta, contrato e planilha registrados, valida parent e metadados, envia somente o DOCX anterior para a lixeira, preserva o ID da planilha e a data da primeira emissão, reconcilia o nome da pasta e emite um novo contrato com o código atual. O retorno deve informar `spreadsheetPreserved: true`, o mesmo `spreadsheetId` e um novo `contractId`.

Na planilha vinculada, correções manuais devem limpar somente o ramo bancário indevido: para PIX, limpe COMPE/agência/conta/tipo de conta; para TED, limpe tipo/chave PIX. Não exclua a linha, timestamp, documento ou campos cadastrais. A planilha é a fonte do backfill; a resposta original no Forms não é alterada por essa edição.

Nos dados de pagamento, `Forma de pagamento` é sempre obrigatória. Para `PIX`, somente tipo e chave PIX são exigidos; para `TED`, são exigidos COMPE, agência, conta e tipo de conta. Campos do ramo oculto não entram no fingerprint nem aparecem como rótulos vazios no contrato.

## Homologação do contrato

Os DOCX v2 PF e PJ locais possuem 9 páginas, margens de 0,5″ e blocos de assinatura em duas colunas. As prévias convertidas pelo Drive possuem 10 páginas e foram mantidas apenas para inspeção. Os contratos finais são preenchidos diretamente no OOXML dos originais; ainda assim, o primeiro contrato real de cada ramo deve ser comparado visualmente: paginação, margens, cabeçalhos, rodapés, numeração, assinaturas e negrito dos valores.
