# Testes

`npm run check` executa testes locais sem escrita externa e valida manifesto/estrutura. As fixtures usam nomes, e-mails e documentos sintéticos em `tests/fixtures`.

Cobertura automatizada:

- Unicode, espaços, listas, acentos, caixa-alta e zeros à esquerda;
- CPF, CNPJ numérico e CNPJ alfanumérico;
- campos PF/PJ, obrigatórios ausentes, item desconhecido e origem Forms;
- obrigatoriedade condicional PIX/TED e rejeição de meio desconhecido;
- mapeamento atualizado dos 46 itens e conversão de linhas históricas por cabeçalho, timestamp e ID sintético estável;
- título PF/PJ real da planilha vinculada, compatibilidade com o título histórico e detecção local de divergência entre títulos do Forms e do mapa;
- repetição literal de placeholders, vários placeholders junto a texto fixo no mesmo run, fragmentação real entre runs, caracteres especiais e negrito restrito ao valor inserido;
- template ausente/desconhecido/incompleto, incompatibilidade de ramo, seleção PF/PJ e adaptação do Blob DOCX para ZIP antes da descompactação do Apps Script;
- mudança de dia em `America/Sao_Paulo`;
- duplicidade por resposta equivalente e responseId editado;
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

Resultado atual: 54/54. A validação estrutural encontrou 16 arquivos Apps Script e 46 campos. O teste de acionadores antigos também confirma sua remoção limitada ao mesmo handler interno; as regressões novas cobrem fila/checkpoint do expurgo, o nome compartilhado da pasta técnica e a migração segura do release oficial v1 para v2.

Os DOCX v2 PF e PJ foram validados e renderizados localmente com 9 páginas cada. As prévias Google Docs exportaram 10 páginas e confirmaram visualmente as assinaturas paralelas; essa diferença reforça que o runtime deve continuar preenchendo diretamente o OOXML. Testes locais não comprovam permissões, execução real do gatilho nem o primeiro arquivo final produzido pelo runtime.

O procedimento de homologação PF e PJ pela interface real do Forms está em `GUIA_TESTE_TEMPO_REAL.md` e só deve ser executado depois que os dois DOCX estiverem validados e ativos.
