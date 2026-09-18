# Template contratual de produção

Os arquivos ativos são `CONTRATO DE PRESTAÇÃO DE SERVIÇOS.docx` (PJ) e `CONTRATO DE PRESTAÇÃO DE SERVIÇOS - PF.docx` (PF). O segundo é derivado do primeiro por `npm run template:create-pf`, preservando a estrutura e alterando somente a qualificação e a cláusula sucessória que pressupunham pessoa jurídica. O PDF presente no diretório é referência e não é aceito pelo provisionamento.

## Seleção do arquivo

- Um único `.docx`: selecionado automaticamente.
- Vários `.docx`: informe `--file` ou `TEMPLATE_FILE`; nenhum arquivo é escolhido arbitrariamente.

```bash
npm run template:prepare -- --file "CONTRATO DE PRESTAÇÃO DE SERVIÇOS.docx" --version "definitivo-2026-09-v1"
npm run template:create-pf
npm run template:validate -- --file "CONTRATO DE PRESTAÇÃO DE SERVIÇOS.docx" --version "definitivo-2026-09-v1"
npm run template:validate -- --file "CONTRATO DE PRESTAÇÃO DE SERVIÇOS - PF.docx" --version "definitivo-pf-2026-09-v1"
npm run template:sync -- --file "CONTRATO DE PRESTAÇÃO DE SERVIÇOS.docx" --version "definitivo-2026-09-v1"
npm run template:sync -- --file "CONTRATO DE PRESTAÇÃO DE SERVIÇOS - PF.docx" --version "definitivo-pf-2026-09-v1"
```

## Placeholders

Use `{{campoEmCamelCase}}`. O dicionário permitido está em `docs/DICIONARIO_DE_CAMPOS.md`. São mínimos:

- `{{nomeCompletoDocumentalista}}`
- `{{cpfCnpjDocumentalista}}`
- `{{dataAssinatura}}`
- `{{localAssinatura}}`

O bloco esperado é `NOVA LIMA/MG, {{dataAssinatura}}.`. A data é preenchida por extenso, em português e caixa-alta. Os valores vindos do formulário são inseridos literalmente e em negrito; o texto jurídico fixo não é reformatado.

A cláusula-base contém os placeholders dos dois meios de pagamento. No runtime, `PIX` conserva somente `{{tipoChavePix}}` e `{{chavePix}}`; `TED` conserva somente COMPE, agência, tipo e número da conta. Essa especialização ocorre no OOXML antes das substituições e não altera o DOCX original nem seu hash.

`template:prepare` só altera os quatro parágrafos variáveis conhecidos (qualificação, pagamento, data/local e nome no bloco de assinatura) e cria uma cópia de segurança transitória em `/tmp` antes de substituir o arquivo local. Revise o diff visual sempre que o texto jurídico ou a diagramação mudar.

O template PJ contém 19 placeholders; o PF, 16. Cada arquivo é compatível exclusivamente com seu tipo. Um placeholder completo pode compartilhar o mesmo run de texto com conteúdo fixo ou com outros placeholders: o runtime separa esses segmentos, preserva o estilo original do texto fixo e aplica negrito apenas aos valores inseridos. Um placeholder realmente fragmentado entre dois ou mais nós `w:t`, desconhecido, malformado ou mínimo ausente bloqueia a emissão.

Qualificação da versão PF:

```text
CONTRATADA: {{nomeCompletoDocumentalista}}, de nacionalidade {{nacionalidadePessoaFisica}}, estado civil {{estadoCivilPessoaFisica}}, de profissão {{profissaoPessoaFisica}}, titular do RG nº {{rgPessoaFisica}} e do CPF nº {{cpfCnpjDocumentalista}}, com domicílio em {{enderecoCompletoDocumentalista}}.
```

A cláusula de sucessão passa a tratar o falecimento da `CONTRATADA` e a remuneração proporcional devida a ela ou a seus sucessores, sem referência a representantes legais da contratada PF. O texto deve receber revisão jurídica antes da ativação definitiva caso a organização exija aprovação formal.

## Atualização segura

A sincronização usa SHA-256 e versão. Repetir o comando com o mesmo arquivo reutiliza os recursos remotos; uma versão nova cria recursos técnicos e não altera contratos emitidos. O runtime usa o DOCX original selecionado (`CONTRACT_TEMPLATE_PF_SOURCE_ID` ou `CONTRACT_TEMPLATE_PJ_SOURCE_ID`) e substitui seu OOXML diretamente. A conversão Google Docs é somente uma prévia: no PJ ela mudou a paginação de 11 para 13 páginas e não pode ser usada como fonte do contrato.

O botão **Executar** do editor Apps Script não aceita argumentos. `configurarProjetoDocumentalistas()` grava os releases versionados atuais. Para um chamador programático, `configurarTemplatePorTipoDocumentalistas(entityType, ...)` atualiza PF ou PJ; `configurarTemplateAtivoDocumentalistas(...)` permanece como alias de PJ.

O login do `clasp` é validado separadamente para acesso ao Drive. Falta de escopo ou permissão interrompe o upload; não existe fallback para Meu Drive.
