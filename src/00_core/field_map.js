var DocumentalistasFields = (function () {
  'use strict';

  function field(itemId, domain, placeholder, title, itemType, requiredRule, normalizer, options) {
    return Object.freeze(Object.assign({
      itemId: itemId,
      domain: domain,
      placeholder: placeholder,
      title: title,
      itemType: itemType,
      requiredRule: requiredRule,
      normalizer: normalizer || 'text',
      sensitive: false,
      fingerprint: true
    }, options || {}));
  }

  var MAP = Object.freeze([
    field(1047884631, 'nomeContato', '{{nomeContatoDocumentalista}}', 'Nome completo', 'TEXT', 'always', 'text', { sheetAliases: ['Nome completo', 'Nome completo do representante'] }),
    field(1470720521, 'telefone', '{{telefoneDocumentalista}}', 'Telefone', 'TEXT', 'always', 'phone'),
    field(1535363824, 'emailTratativas', '{{emailDocumentalista}}', 'E-mail que será utilizado para tratativas com Prefeituras/CAIXA', 'TEXT', 'always', 'email'),
    field(1445428169, 'emailOnr', null, 'E-mail de acesso à ONR', 'TEXT', 'always', 'email', { sensitive: true, fingerprint: false }),
    field(846483570, 'senhaOnr', null, 'Senha de acesso à ONR', 'TEXT', 'always', 'secret', { sensitive: true, fingerprint: false }),
    field(151260162, 'tipoPessoa', '{{tipoPessoaDocumentalista}}', 'Como você realizará as assessorias?', 'MULTIPLE_CHOICE', 'always', 'entityType', { sheetAliases: ['Pessoa Física ou Pessoa Jurídica?'] }),

    field(832580151, 'razaoSocial', '{{razaoSocialDocumentalista}}', 'Razão Social', 'TEXT', 'PJ', 'text'),
    field(319976783, 'cnpj', '{{cnpjDocumentalista}}', 'CNPJ', 'TEXT', 'PJ', 'cnpj'),
    field(1180972700, 'logradouroEmpresa', '{{logradouroEmpresa}}', 'Logradouro da empresa', 'TEXT', 'PJ', 'text'),
    field(1293424621, 'numeroEmpresa', '{{numeroEmpresa}}', 'Número residencial da empresa', 'TEXT', 'PJ', 'identifier'),
    field(375797955, 'bairroEmpresa', '{{bairroEmpresa}}', 'Bairro da empresa', 'TEXT', 'PJ', 'text'),
    field(1257839207, 'cidadeEmpresa', '{{cidadeEmpresa}}', 'Cidade da empresa', 'TEXT', 'PJ', 'text'),
    field(1938095597, 'ufEmpresa', '{{ufEmpresa}}', 'Estado (UF) da empresa', 'MULTIPLE_CHOICE', 'PJ', 'uf'),
    field(1822550634, 'complementoEmpresa', '{{complementoEmpresa}}', 'Complemento da empresa', 'TEXT', 'optional', 'text'),
    field(142020862, 'cepEmpresa', '{{cepEmpresa}}', 'Código de Endereçamento Postal (CEP) da empresa', 'TEXT', 'PJ', 'cep'),
    field(1047500087, 'nacionalidadeRepresentante', '{{nacionalidadeRepresentante}}', 'Nacionalidade do representante', 'TEXT', 'PJ', 'text'),
    field(853769405, 'estadoCivilRepresentante', '{{estadoCivilRepresentante}}', 'Estado civil do representante', 'MULTIPLE_CHOICE', 'PJ', 'text'),
    field(1931028404, 'profissaoRepresentante', '{{profissaoRepresentante}}', 'Profissão do representante', 'TEXT', 'PJ', 'text'),
    field(371706119, 'rgRepresentante', '{{rgRepresentante}}', 'Registro Geral (RG) do representante', 'TEXT', 'PJ', 'identifier'),
    field(490967935, 'cpfRepresentante', '{{cpfRepresentante}}', 'Cadastro de Pessoa Física (CPF) do representante', 'TEXT', 'PJ', 'cpf'),
    field(1761830300, 'logradouroRepresentante', '{{logradouroRepresentante}}', 'Logradouro do representante', 'TEXT', 'PJ', 'text'),
    field(598935057, 'numeroRepresentante', '{{numeroRepresentante}}', 'Número residencial do representante', 'TEXT', 'PJ', 'identifier'),
    field(1684611537, 'bairroRepresentante', '{{bairroRepresentante}}', 'Bairro do representante', 'TEXT', 'PJ', 'text'),
    field(209326216, 'cidadeRepresentante', '{{cidadeRepresentante}}', 'Cidade do representante', 'TEXT', 'PJ', 'text'),
    field(1126299457, 'ufRepresentante', '{{ufRepresentante}}', 'Estado (UF) do representante', 'MULTIPLE_CHOICE', 'PJ', 'uf'),
    field(2112002118, 'complementoRepresentante', '{{complementoRepresentante}}', 'Complemento do representante', 'TEXT', 'optional', 'text'),
    field(258712430, 'cepRepresentante', '{{cepRepresentante}}', 'Código de Endereçamento Postal (CEP) do representante', 'TEXT', 'PJ', 'cep'),

    field(1602576040, 'nacionalidadePessoaFisica', '{{nacionalidadePessoaFisica}}', 'Nacionalidade', 'TEXT', 'PF', 'text'),
    field(1576355491, 'estadoCivilPessoaFisica', '{{estadoCivilPessoaFisica}}', 'Estado civil', 'MULTIPLE_CHOICE', 'PF', 'text'),
    field(1620242353, 'profissaoPessoaFisica', '{{profissaoPessoaFisica}}', 'Profissão', 'TEXT', 'PF', 'text'),
    field(2069803501, 'rgPessoaFisica', '{{rgPessoaFisica}}', 'Registro Geral (RG)', 'TEXT', 'PF', 'identifier'),
    field(285166117, 'cpf', '{{cpfDocumentalista}}', 'Cadastro de Pessoa Física (CPF)', 'TEXT', 'PF', 'cpf'),
    field(1812958733, 'logradouroPessoaFisica', '{{logradouroPessoaFisica}}', 'Logradouro', 'TEXT', 'PF', 'text'),
    field(1145187293, 'numeroPessoaFisica', '{{numeroPessoaFisica}}', 'Número residencial', 'TEXT', 'PF', 'identifier'),
    field(884016567, 'bairroPessoaFisica', '{{bairroPessoaFisica}}', 'Bairro', 'TEXT', 'PF', 'text'),
    field(1640714327, 'cidadePessoaFisica', '{{cidadePessoaFisica}}', 'Cidade', 'TEXT', 'PF', 'text'),
    field(1968258039, 'ufPessoaFisica', '{{ufPessoaFisica}}', 'Estado (UF)', 'MULTIPLE_CHOICE', 'PF', 'uf'),
    field(66191943, 'complementoPessoaFisica', '{{complementoPessoaFisica}}', 'Complemento', 'TEXT', 'optional', 'text'),
    field(1137989209, 'cepPessoaFisica', '{{cepPessoaFisica}}', 'Código de Endereçamento Postal (CEP)', 'TEXT', 'PF', 'cep'),

    field(818261484, 'formaPagamento', '{{formaPagamento}}', 'Forma de pagamento', 'MULTIPLE_CHOICE', 'always', 'text'),
    field(1712386931, 'codigoBanco', '{{codigoBanco}}', 'Código do banco (COMPE)', 'TEXT', 'payment:TED', 'identifier'),
    field(275738346, 'agenciaBancaria', '{{agenciaBancaria}}', 'Agência bancária', 'TEXT', 'payment:TED', 'identifier'),
    field(227212574, 'contaBancaria', '{{contaBancaria}}', 'Conta bancária', 'TEXT', 'payment:TED', 'identifier'),
    field(1466424304, 'tipoContaBancaria', '{{tipoContaBancaria}}', 'Tipo de conta bancária', 'MULTIPLE_CHOICE', 'payment:TED', 'text'),
    field(343479973, 'tipoChavePix', '{{tipoChavePix}}', 'Tipo de Chave PIX', 'MULTIPLE_CHOICE', 'payment:PIX', 'text'),
    field(596704228, 'chavePix', '{{chavePix}}', 'Chave PIX', 'TEXT', 'payment:PIX', 'identifier')
  ]);

  var COMPUTED_PLACEHOLDERS = Object.freeze([
    '{{nomeCompletoDocumentalista}}',
    '{{cpfCnpjDocumentalista}}',
    '{{enderecoCompletoDocumentalista}}',
    '{{enderecoCompletoRepresentante}}',
    '{{nomeRepresentante}}',
    '{{dataAssinatura}}',
    '{{localAssinatura}}'
  ]);

  var REQUIRED_TEMPLATE_PLACEHOLDERS = Object.freeze([
    '{{nomeCompletoDocumentalista}}',
    '{{cpfCnpjDocumentalista}}',
    '{{dataAssinatura}}',
    '{{localAssinatura}}'
  ]);

  function byItemId() {
    var result = {};
    MAP.forEach(function (definition) { result[String(definition.itemId)] = definition; });
    return result;
  }

  function byDomain() {
    var result = {};
    MAP.forEach(function (definition) { result[definition.domain] = definition; });
    return result;
  }

  function allowedPlaceholders() {
    return MAP.map(function (definition) { return definition.placeholder; })
      .filter(Boolean)
      .concat(COMPUTED_PLACEHOLDERS);
  }

  return {
    MAP: MAP,
    COMPUTED_PLACEHOLDERS: COMPUTED_PLACEHOLDERS,
    REQUIRED_TEMPLATE_PLACEHOLDERS: REQUIRED_TEMPLATE_PLACEHOLDERS,
    byItemId: byItemId,
    byDomain: byDomain,
    allowedPlaceholders: allowedPlaceholders
  };
})();
