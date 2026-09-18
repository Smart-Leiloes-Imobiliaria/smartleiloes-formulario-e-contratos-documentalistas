var DocumentalistasForm = (function () {
  'use strict';

  function assertExpectedForm(formId) {
    var expected = DocumentalistasConfig.get().FORM_ID;
    if (String(formId || '') !== String(expected)) {
      DocumentalistasErrors.fail('UNEXPECTED_FORM', 'O evento não pertence ao formulário configurado.', { receivedFormId: formId, expectedFormId: expected });
    }
  }

  function eventToRaw(e) {
    if (!e || !e.response || typeof e.response.getItemResponses !== 'function') {
      DocumentalistasErrors.fail('INVALID_FORMS_EVENT', 'Evento inválido: esperado gatilho instalável do Google Forms com e.response.');
    }
    var sourceId = e.source && typeof e.source.getId === 'function' ? e.source.getId() : null;
    assertExpectedForm(sourceId);
    return responseToRaw(e.response, sourceId);
  }

  function responseToRaw(formResponse, formId) {
    assertExpectedForm(formId);
    var answers = {};
    formResponse.getItemResponses().forEach(function (itemResponse) {
      var item = itemResponse.getItem();
      answers[String(item.getId())] = itemResponse.getResponse();
    });
    return {
      formId: formId,
      responseId: formResponse.getId(),
      submittedAt: formResponse.getTimestamp(),
      answersByItemId: answers
    };
  }

  function rawFixtureToRaw(fixture) {
    return {
      formId: fixture.formId,
      responseId: fixture.responseId,
      submittedAt: new Date(fixture.submittedAt),
      answersByItemId: Object.assign({}, fixture.answersByItemId)
    };
  }

  function extract(raw, now) {
    assertExpectedForm(raw.formId);
    if (!raw.responseId) DocumentalistasErrors.fail('MISSING_RESPONSE_ID', 'A resposta não possui identificador persistente.');
    if (!(raw.submittedAt instanceof Date) || isNaN(raw.submittedAt.getTime())) {
      DocumentalistasErrors.fail('MISSING_RESPONSE_TIMESTAMP', 'A resposta não possui timestamp original válido.');
    }

    var byItem = DocumentalistasFields.byItemId();
    var typeDefinition = byItem['151260162'];
    var typeValue = DocumentalistasNormalize.normalize(raw.answersByItemId['151260162'], typeDefinition.normalizer);
    DocumentalistasValidation.validateField(typeDefinition, typeValue, '');
    var entityType = typeValue.canonical;
    var values = {};
    var unknownAnsweredItems = [];

    Object.keys(raw.answersByItemId || {}).forEach(function (itemId) {
      if (!byItem[itemId] && !DocumentalistasNormalize.isEmptyRaw(raw.answersByItemId[itemId])) unknownAnsweredItems.push(itemId);
    });
    if (unknownAnsweredItems.length) {
      DocumentalistasErrors.fail('UNMAPPED_FORM_ITEM', 'A resposta contém itens ainda não mapeados; processamento bloqueado para evitar perda de dados.', { itemIds: unknownAnsweredItems });
    }

    DocumentalistasFields.MAP.forEach(function (definition) {
      var rawValue = raw.answersByItemId[String(definition.itemId)];
      values[definition.domain] = DocumentalistasNormalize.normalize(rawValue, definition.normalizer);
    });
    var paymentMethod = values.formaPagamento.canonical;
    DocumentalistasFields.MAP.forEach(function (definition) {
      DocumentalistasValidation.validateField(definition, values[definition.domain], entityType, paymentMethod);
    });

    var identity = buildIdentity(values, entityType);
    var config = DocumentalistasConfig.get();
    var emissionDate = formatEmissionDate(now || new Date(), config.TIME_ZONE);
    var placeholders = buildPlaceholders(values, identity, emissionDate, config);
    var fingerprintPayload = {};
    DocumentalistasFields.MAP.forEach(function (definition) {
      if (!definition.fingerprint) return;
      if (definition.requiredRule === 'PF' && entityType !== 'PF') return;
      if (definition.requiredRule === 'PJ' && entityType !== 'PJ') return;
      fingerprintPayload[definition.domain] = values[definition.domain].canonical;
    });

    return {
      formId: raw.formId,
      responseId: String(raw.responseId),
      submittedAt: raw.submittedAt.toISOString(),
      entityType: entityType,
      values: values,
      identity: identity,
      placeholders: placeholders,
      fingerprint: DocumentalistasNormalize.sha256(DocumentalistasNormalize.stableStringify(fingerprintPayload)),
      emissionDateIso: emissionDate.iso,
      emissionDateDisplay: emissionDate.display,
      unknownAnsweredItems: unknownAnsweredItems
    };
  }

  function buildIdentity(values, entityType) {
    var nameValue = entityType === 'PJ' ? values.razaoSocial : values.nomeContato;
    var documentValue = entityType === 'PJ' ? values.cnpj : values.cpf;
    return {
      documentType: entityType === 'PJ' ? 'CNPJ' : 'CPF',
      canonicalDocument: documentValue.canonical,
      formattedDocument: documentValue.display,
      displayName: nameValue.display
    };
  }

  function composeAddress(parts) {
    return parts.filter(Boolean).join(', ').replace(/, ([A-Z]{2}), /, ' - $1, ');
  }

  function buildPlaceholders(values, identity, emissionDate, config) {
    var placeholders = {};
    DocumentalistasFields.MAP.forEach(function (definition) {
      if (definition.placeholder && !definition.sensitive) placeholders[definition.placeholder] = values[definition.domain].display || '';
    });
    placeholders['{{nomeCompletoDocumentalista}}'] = identity.displayName;
    placeholders['{{nomeRepresentante}}'] = values.nomeContato.display;
    placeholders['{{cpfCnpjDocumentalista}}'] = identity.formattedDocument;
    placeholders['{{dataAssinatura}}'] = emissionDate.display;
    placeholders['{{localAssinatura}}'] = DocumentalistasNormalize.upper(config.SIGNATURE_LOCATION);
    placeholders['{{enderecoCompletoDocumentalista}}'] = values.tipoPessoa.canonical === 'PJ'
      ? composeAddress([values.logradouroEmpresa.display, values.numeroEmpresa.display, values.complementoEmpresa.display, values.bairroEmpresa.display, values.cidadeEmpresa.display, values.ufEmpresa.display, values.cepEmpresa.display])
      : composeAddress([values.logradouroPessoaFisica.display, values.numeroPessoaFisica.display, values.complementoPessoaFisica.display, values.bairroPessoaFisica.display, values.cidadePessoaFisica.display, values.ufPessoaFisica.display, values.cepPessoaFisica.display]);
    placeholders['{{enderecoCompletoRepresentante}}'] = values.tipoPessoa.canonical === 'PJ'
      ? composeAddress([values.logradouroRepresentante.display, values.numeroRepresentante.display, values.complementoRepresentante.display, values.bairroRepresentante.display, values.cidadeRepresentante.display, values.ufRepresentante.display, values.cepRepresentante.display])
      : '';
    return placeholders;
  }

  function formatEmissionDate(date, timezone, formatter) {
    var format = formatter || function (currentDate, currentTimezone, pattern) {
      return Utilities.formatDate(currentDate, currentTimezone, pattern);
    };
    var iso = format(date, timezone, 'yyyy-MM-dd');
    var parts = iso.split('-');
    var months = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    return {
      iso: iso,
      display: String(Number(parts[2])) + ' DE ' + months[Number(parts[1]) - 1] + ' DE ' + parts[0]
    };
  }

  function formatEmissionIso(iso) {
    var parts = String(iso || '').split('-');
    if (parts.length !== 3) DocumentalistasErrors.fail('INVALID_EMISSION_DATE', 'Data de emissão persistida é inválida.');
    var months = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    return String(Number(parts[2])) + ' DE ' + months[Number(parts[1]) - 1] + ' DE ' + parts[0];
  }

  return {
    assertExpectedForm: assertExpectedForm,
    eventToRaw: eventToRaw,
    responseToRaw: responseToRaw,
    rawFixtureToRaw: rawFixtureToRaw,
    extract: extract,
    buildIdentity: buildIdentity,
    buildPlaceholders: buildPlaceholders,
    formatEmissionDate: formatEmissionDate,
    formatEmissionIso: formatEmissionIso
  };
})();
