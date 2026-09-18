# Dicionário de campos

Fonte: estrutura pública real do formulário consultada em 17/09/2026 e confirmável por `listarCamposFormularioDocumentalistas()`/`npm run form:inspect`. São 56 itens totais e 46 respondíveis, todos mapeados por ID. Títulos são referência humana e aliases restritos para importação histórica.

Regras: `always` é comum; `PF`/`PJ` dependem da ramificação; `optional` não bloqueia. Todo valor apresentado é NFC, espaços normalizados e caixa-alta. E-mail técnico preserva a grafia original separadamente. Credenciais ONR são validadas como presentes, mas não entram em contrato, fingerprint, estado ou logs.

| Item ID | Título | Domínio | Regra | Normalização | Placeholder |
|---:|---|---|---|---|---|
| 1047884631 | Nome completo (contato) | `nomeContato` | always | texto | `{{nomeContatoDocumentalista}}` |
| 1470720521 | Telefone | `telefone` | always | telefone/dígitos | `{{telefoneDocumentalista}}` |
| 1535363824 | E-mail de tratativas | `emailTratativas` | always | e-mail | `{{emailDocumentalista}}` |
| 1445428169 | E-mail ONR | `emailOnr` | always | e-mail sensível | excluído |
| 846483570 | Senha ONR | `senhaOnr` | always | segredo | excluído |
| 151260162 | Como você realizará as assessorias? | `tipoPessoa` | always | enum PF/PJ | `{{tipoPessoaDocumentalista}}` |
| 832580151 | Razão Social | `razaoSocial` | PJ | texto | `{{razaoSocialDocumentalista}}` |
| 319976783 | CNPJ | `cnpj` | PJ | CNPJ numérico/alfanumérico | `{{cnpjDocumentalista}}` |
| 1180972700 | Logradouro da empresa | `logradouroEmpresa` | PJ | texto | `{{logradouroEmpresa}}` |
| 1293424621 | Número da empresa | `numeroEmpresa` | PJ | identificador | `{{numeroEmpresa}}` |
| 375797955 | Bairro da empresa | `bairroEmpresa` | PJ | texto | `{{bairroEmpresa}}` |
| 1257839207 | Cidade da empresa | `cidadeEmpresa` | PJ | texto | `{{cidadeEmpresa}}` |
| 1938095597 | UF da empresa | `ufEmpresa` | PJ | UF | `{{ufEmpresa}}` |
| 1822550634 | Complemento da empresa | `complementoEmpresa` | optional | texto | `{{complementoEmpresa}}` |
| 142020862 | CEP da empresa | `cepEmpresa` | PJ | CEP | `{{cepEmpresa}}` |
| 1047500087 | Nacionalidade do representante | `nacionalidadeRepresentante` | PJ | texto | `{{nacionalidadeRepresentante}}` |
| 853769405 | Estado civil do representante | `estadoCivilRepresentante` | PJ | escolha | `{{estadoCivilRepresentante}}` |
| 1931028404 | Profissão do representante | `profissaoRepresentante` | PJ | texto | `{{profissaoRepresentante}}` |
| 371706119 | RG do representante | `rgRepresentante` | PJ | identificador | `{{rgRepresentante}}` |
| 490967935 | CPF do representante | `cpfRepresentante` | PJ | CPF | `{{cpfRepresentante}}` |
| 1761830300 | Logradouro do representante | `logradouroRepresentante` | PJ | texto | `{{logradouroRepresentante}}` |
| 598935057 | Número do representante | `numeroRepresentante` | PJ | identificador | `{{numeroRepresentante}}` |
| 1684611537 | Bairro do representante | `bairroRepresentante` | PJ | texto | `{{bairroRepresentante}}` |
| 209326216 | Cidade do representante | `cidadeRepresentante` | PJ | texto | `{{cidadeRepresentante}}` |
| 1126299457 | UF do representante | `ufRepresentante` | PJ | UF | `{{ufRepresentante}}` |
| 2112002118 | Complemento do representante | `complementoRepresentante` | optional | texto | `{{complementoRepresentante}}` |
| 258712430 | CEP do representante | `cepRepresentante` | PJ | CEP | `{{cepRepresentante}}` |
| 1602576040 | Nacionalidade PF | `nacionalidadePessoaFisica` | PF | texto | `{{nacionalidadePessoaFisica}}` |
| 1576355491 | Estado civil PF | `estadoCivilPessoaFisica` | PF | escolha | `{{estadoCivilPessoaFisica}}` |
| 1620242353 | Profissão PF | `profissaoPessoaFisica` | PF | texto | `{{profissaoPessoaFisica}}` |
| 2069803501 | RG PF | `rgPessoaFisica` | PF | identificador | `{{rgPessoaFisica}}` |
| 285166117 | CPF | `cpf` | PF | CPF | `{{cpfDocumentalista}}` |
| 1812958733 | Logradouro PF | `logradouroPessoaFisica` | PF | texto | `{{logradouroPessoaFisica}}` |
| 1145187293 | Número PF | `numeroPessoaFisica` | PF | identificador | `{{numeroPessoaFisica}}` |
| 884016567 | Bairro PF | `bairroPessoaFisica` | PF | texto | `{{bairroPessoaFisica}}` |
| 1640714327 | Cidade PF | `cidadePessoaFisica` | PF | texto | `{{cidadePessoaFisica}}` |
| 1968258039 | UF PF | `ufPessoaFisica` | PF | UF | `{{ufPessoaFisica}}` |
| 66191943 | Complemento PF | `complementoPessoaFisica` | optional | texto | `{{complementoPessoaFisica}}` |
| 1137989209 | CEP PF | `cepPessoaFisica` | PF | CEP | `{{cepPessoaFisica}}` |
| 818261484 | Forma de pagamento | `formaPagamento` | always | escolha | `{{formaPagamento}}` |
| 1712386931 | Código do banco (COMPE) | `codigoBanco` | payment:TED | identificador | `{{codigoBanco}}` |
| 275738346 | Agência bancária | `agenciaBancaria` | payment:TED | identificador | `{{agenciaBancaria}}` |
| 227212574 | Conta bancária | `contaBancaria` | payment:TED | identificador | `{{contaBancaria}}` |
| 1466424304 | Tipo de conta | `tipoContaBancaria` | payment:TED | texto | `{{tipoContaBancaria}}` |
| 343479973 | Tipo de Chave PIX | `tipoChavePix` | payment:PIX | escolha | `{{tipoChavePix}}` |
| 596704228 | Chave PIX | `chavePix` | payment:PIX | identificador | `{{chavePix}}` |

## Campos calculados

| Placeholder | Origem |
|---|---|
| `{{nomeCompletoDocumentalista}}` | nome comum para PF ou razão social para PJ |
| `{{nomeRepresentante}}` | campo comum `Nome completo` no formulário atual; no histórico, o alias específico de representante PJ tem precedência |
| `{{cpfCnpjDocumentalista}}` | CPF/CNPJ formatado da identidade |
| `{{enderecoCompletoDocumentalista}}` | composição dos campos reais de endereço PF/PJ |
| `{{enderecoCompletoRepresentante}}` | composição dos campos reais do representante PJ |
| `{{dataAssinatura}}` | data da primeira emissão em `America/Sao_Paulo`, por extenso |
| `{{localAssinatura}}` | `NOVA LIMA/MG` |

O template pode usar um subconjunto dos campos mapeados, mas não pode introduzir placeholder desconhecido. Os quatro placeholders mínimos estão documentados no README de `templates/`.

`payment:TED` e `payment:PIX` seguem a navegação condicional real do Forms. Campos do meio de pagamento não selecionado não são obrigatórios e são removidos da cláusula antes do preenchimento. O formato anterior do fingerprint foi preservado para que cadastros já concluídos continuem idempotentes; no Forms, campos ocultos chegam vazios. Os valores do ramo escolhido permanecem em caixa-alta e negrito.

O template PJ contém 19 placeholders e é validado como `supportedEntityTypes: ["PJ"]`. O template PF contém 16 placeholders e é validado como `supportedEntityTypes: ["PF"]`. O campo `tipoPessoa` decide o ramo antes da geração; um arquivo incompatível ainda é bloqueado por `TEMPLATE_ENTITY_TYPE_MISMATCH`, evitando preencher qualificação PF com dados PJ ou vice-versa.

Na versão PF, a qualificação usa `{{nomeCompletoDocumentalista}}`, `{{nacionalidadePessoaFisica}}`, `{{estadoCivilPessoaFisica}}`, `{{profissaoPessoaFisica}}`, `{{rgPessoaFisica}}`, `{{cpfCnpjDocumentalista}}` e `{{enderecoCompletoDocumentalista}}`. Na versão PJ, permanecem razão social/CNPJ, sede e dados do representante.
