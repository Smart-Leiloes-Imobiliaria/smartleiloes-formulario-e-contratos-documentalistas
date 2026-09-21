# Testes

`npm run check` executa testes locais sem escrita externa e valida manifesto/estrutura. As fixtures usam nomes, e-mails e documentos sintéticos em `tests/fixtures`.

Cobertura automatizada:

- Unicode, espaços, listas, acentos, caixa-alta e zeros à esquerda;
- CPF, CNPJ numérico e CNPJ alfanumérico;
- campos PF/PJ, obrigatórios ausentes, item desconhecido e origem Forms;
- obrigatoriedade condicional PIX/TED e rejeição de meio desconhecido;
- mapeamento atualizado dos 46 itens e conversão de linhas por cabeçalho, timestamp e ID sintético estável, inclusive quando uma validação cadastral impede o processamento;
- título PF/PJ real da planilha vinculada, compatibilidade com o título histórico e detecção local de divergência entre títulos do Forms e do mapa;
- repetição literal de placeholders, vários placeholders junto a texto fixo no mesmo run, fragmentação real entre runs, caracteres especiais e negrito restrito ao valor inserido;
- template ausente/desconhecido/incompleto, incompatibilidade de ramo, seleção PF/PJ e adaptação do Blob DOCX para ZIP antes da descompactação do Apps Script;
- mudança de dia em `America/Sao_Paulo`;
- duplicidade por resposta equivalente e responseId editado;
- rejeição de uma nova submissão ao vivo para identidade já cadastrada sem mutar o estado legítimo;
- serialização/idempotência de envios concorrentes;
- fila de retomada sem duplicação ou descarte silencioso, com remoção somente após confirmação;
- checkpoints, falhas por etapa e criação com resposta de rede perdida;
- conflito sem sobrescrita e nomes iguais/documentos distintos;
- cabeçalhos, importação externa e candidatos conflitantes;
- falta de permissão sem fallback;
- instalação idempotente do gatilho;
- retomada pós-pausa que amplia somente o fim do recorte e preserva o próximo checkpoint;
- preenchimento integral do `word/document.xml` dos DOCX definitivos PF e PJ, sem placeholders remanescentes;
- especialização da cláusula do DOCX para PIX ou TED, sem rótulos vazios e sem colocar o texto fixo em negrito;
- seleção limitada de linhas históricas em `ERROR` dentro do recorte congelado;
- seleção da fila histórica que pula apenas estados integralmente concluídos e preserva checkpoints incompletos;
- classificação de erros recuperáveis e tolerância a propriedade de fila inválida;
- descarte seguro restrito ao contrato identificado, bloqueando documento com parent ou metadados incompatíveis;
- seleção/hash/versionamento repetível dos templates, preparação idempotente do DOCX PJ e derivação idempotente do DOCX PF sem representação societária.
- painel administrativo com autenticação por allowlist, padrão de versão PF/PJ, propriedades de ativação, integrações HTML e manifesto Web App autenticado;
- normalização de telefone brasileiro, persistência segura de tokens renovados, payload exato do template Meta e mensagens amigáveis com fallback;
- encaminhamento de qualquer falha do handler para a compensação, além da exclusão física restrita à última linha atual fora do recorte histórico.

Resultado atual: 66/66. A validação estrutural encontrou 19 arquivos Apps Script, um painel HTML e 46 campos. As regressões cobrem fila/checkpoint do expurgo, seleção de linha atual fora do recorte histórico, localização de resposta com CPF inválido, segurança/configuração do painel, confirmação literal das operações, integração SmartChatApp, o nome compartilhado da pasta técnica e a migração segura do release oficial v1 para v2.

Os DOCX ativos v2 PF e PJ foram validados e renderizados localmente com 9 páginas cada. Os candidatos locais seguintes também foram validados estruturalmente e renderizados em 9 páginas; permanecem apenas no Git até publicação explícita pelo painel. Testes locais não comprovam permissões, execução real do gatilho, autorização do Web App, validade dos tokens ChatApp, existência do template na licença nem o primeiro arquivo final produzido pelo runtime.

O procedimento de homologação PF e PJ pela interface real do Forms está em `GUIA_TESTE_TEMPO_REAL.md` e só deve ser executado depois que os dois DOCX estiverem validados e ativos.
