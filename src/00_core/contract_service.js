var DocumentalistasContract = (function () {
  'use strict';

  function findAllOccurrences(text, token) {
    var indexes = [];
    var offset = 0;
    while (true) {
      var index = text.indexOf(token, offset);
      if (index < 0) break;
      indexes.push(index);
      offset = index + token.length;
    }
    return indexes;
  }

  function replaceLiteralInText(textAdapter, replacements) {
    var applied = [];
    Object.keys(replacements).sort(function (a, b) { return b.length - a.length; }).forEach(function (token) {
      var currentText = textAdapter.getText();
      var indexes = findAllOccurrences(currentText, token).sort(function (a, b) { return b - a; });
      indexes.forEach(function (start) {
        var value = replacements[token] === null || replacements[token] === undefined ? '' : String(replacements[token]);
        textAdapter.deleteText(start, start + token.length - 1);
        if (value) {
          textAdapter.insertText(start, value);
          textAdapter.setBold(start, start + value.length - 1, true);
        }
        applied.push({ placeholder: token, start: start, length: value.length });
      });
    });
    return applied;
  }

  function replaceDocument(document, replacements) {
    DocumentalistasTemplate.validateDocument(document);
    var applied = [];
    DocumentalistasTemplate.collectTextContainers(document).forEach(function (container) {
      applied = applied.concat(replaceLiteralInText(container.editAsText(), replacements));
    });
    var unresolved = DocumentalistasTemplate.extractPlaceholders(DocumentalistasTemplate.documentText(document));
    if (unresolved.length) {
      DocumentalistasErrors.fail('UNRESOLVED_TEMPLATE_PLACEHOLDER', 'O contrato ainda contém placeholders após o preenchimento.', { placeholders: unresolved });
    }
    if (!applied.length) DocumentalistasErrors.fail('NO_PLACEHOLDERS_REPLACED', 'Nenhum placeholder foi substituído no contrato.');
    document.saveAndClose();
    return applied;
  }

  function exportGoogleDocAsDocx(fileId, outputName) {
    var encodedMime = encodeURIComponent(DocumentalistasDrive.DOCX_MIME);
    var response = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '/export?mimeType=' + encodedMime, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      DocumentalistasErrors.fail('DOCX_EXPORT_FAILED', 'Falha ao exportar o contrato intermediário para DOCX.', { status: response.getResponseCode() });
    }
    return response.getBlob().setName(outputName).setContentType(DocumentalistasDrive.DOCX_MIME);
  }

  function escapeXml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function boldRunProperties(run) {
    if (/<w:rPr(?:\s[^>]*)?>/.test(run)) {
      if (/<w:b(?:\s[^>]*)?\/?\s*>/.test(run)) return run;
      return run.replace(/<w:rPr(?:\s[^>]*)?>/, function (opening) { return opening + '<w:b/><w:bCs/>'; });
    }
    return run.replace(/<w:r(?:\s[^>]*)?>/, function (opening) { return opening + '<w:rPr><w:b/><w:bCs/></w:rPr>'; });
  }

  function splitPlaceholderSegments(text, replacements) {
    var tokens = Object.keys(replacements).sort(function (a, b) { return b.length - a.length; });
    var segments = [];
    var cursor = 0;
    while (cursor < text.length) {
      var nextIndex = -1;
      var nextToken = '';
      tokens.forEach(function (token) {
        var index = text.indexOf(token, cursor);
        if (index < 0) return;
        if (nextIndex < 0 || index < nextIndex || (index === nextIndex && token.length > nextToken.length)) {
          nextIndex = index;
          nextToken = token;
        }
      });
      if (nextIndex < 0) {
        segments.push({ text: text.slice(cursor), bold: false, placeholder: '' });
        break;
      }
      if (nextIndex > cursor) segments.push({ text: text.slice(cursor, nextIndex), bold: false, placeholder: '' });
      var rawValue = replacements[nextToken];
      segments.push({ text: rawValue === null || rawValue === undefined ? '' : String(rawValue), bold: true, placeholder: nextToken });
      cursor = nextIndex + nextToken.length;
    }
    return segments;
  }

  function runWithText(run, value, bold) {
    var target = bold ? boldRunProperties(run) : run;
    var xmlValue = escapeXml(value).replace(/\r\n|\r|\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
    return target.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/, '<w:t xml:space="preserve">' + xmlValue + '</w:t>');
  }

  function specializePaymentText(text, replacements) {
    var method = String(replacements['{{formaPagamento}}'] || '').normalize('NFC').trim().toLocaleUpperCase('pt-BR');
    if (method !== 'PIX' && method !== 'TED') return { text: text, specialized: false };
    var common = 'através de {{formaPagamento}}, para a conta indicada pela CONTRATADA, qual seja, ';
    var complete = common + 'Código do banco (COMPE): {{codigoBanco}}, Agência: {{agenciaBancaria}}, {{tipoContaBancaria}}: {{contaBancaria}}, {{tipoChavePix}}: {{chavePix}},';
    if (text.indexOf(complete) < 0) return { text: text, specialized: false };
    var selected = method === 'PIX'
      ? common + '{{tipoChavePix}}: {{chavePix}},'
      : common + 'Código do banco (COMPE): {{codigoBanco}}, Agência: {{agenciaBancaria}}, {{tipoContaBancaria}}: {{contaBancaria}},';
    return { text: text.replace(complete, selected), specialized: true };
  }

  function specializePaymentClauseXml(xml, replacements) {
    var source = String(xml);
    var compositeTokens = ['{{formaPagamento}}', '{{codigoBanco}}', '{{agenciaBancaria}}', '{{tipoContaBancaria}}', '{{contaBancaria}}', '{{tipoChavePix}}', '{{chavePix}}'];
    var hasCompositeClause = compositeTokens.every(function (token) { return source.indexOf(token) >= 0; });
    if (!hasCompositeClause) return { xml: source, specialized: false };
    var count = 0;
    var updated = source.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, function (run) {
      var textMatches = Array.from(run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g));
      if (textMatches.length !== 1) return run;
      var decoded = textMatches[0][1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
      var result = specializePaymentText(decoded, replacements);
      if (!result.specialized) return run;
      count += 1;
      return runWithText(run, result.text, false);
    });
    if (count !== 1) {
      DocumentalistasErrors.fail('PAYMENT_TEMPLATE_STRUCTURE_UNSUPPORTED', 'A cláusula de pagamento do DOCX não pôde ser especializada com segurança.', { occurrences: count });
    }
    return { xml: updated, specialized: true };
  }

  function replaceDocxXml(xml, replacements) {
    var applied = [];
    var specialized = specializePaymentClauseXml(xml, replacements);
    var updated = specialized.xml.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, function (run) {
      var textMatches = Array.from(run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g));
      if (textMatches.length !== 1) return run;
      var encoded = textMatches[0][1];
      var decoded = encoded.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
      var segments = splitPlaceholderSegments(decoded, replacements);
      var replacementsInRun = segments.filter(function (segment) { return !!segment.placeholder; });
      if (!replacementsInRun.length) return run;
      replacementsInRun.forEach(function (segment) { applied.push(segment.placeholder); });
      return segments.filter(function (segment) { return segment.text !== ''; }).map(function (segment) {
        return runWithText(run, segment.text, segment.bold);
      }).join('');
    });
    return { xml: updated, applied: applied };
  }

  function buildDocx(sourceBlob, outputName, replacements) {
    var parts = DocumentalistasTemplate.unzipDocxBlob(sourceBlob);
    var applied = [];
    parts = parts.map(function (part) {
      if (!/^word\/(document|header\d+|footer\d+)\.xml$/.test(part.getName())) return part;
      var result = replaceDocxXml(part.getDataAsString('UTF-8'), replacements);
      applied = applied.concat(result.applied);
      return Utilities.newBlob(result.xml, 'application/xml', part.getName());
    });
    var unresolved = [];
    parts.forEach(function (part) {
      if (!/^word\/(document|header\d+|footer\d+)\.xml$/.test(part.getName())) return;
      unresolved = unresolved.concat(DocumentalistasTemplate.extractPlaceholders(part.getDataAsString('UTF-8')));
    });
    unresolved = unresolved.filter(function (value, index) { return unresolved.indexOf(value) === index; });
    if (unresolved.length) DocumentalistasErrors.fail('UNRESOLVED_TEMPLATE_PLACEHOLDER', 'O DOCX ainda contém placeholders após o preenchimento.', { placeholders: unresolved });
    if (!applied.length) DocumentalistasErrors.fail('NO_PLACEHOLDERS_REPLACED', 'Nenhum placeholder foi substituído no DOCX.');
    return Utilities.zip(parts, outputName).setName(outputName).setContentType(DocumentalistasDrive.DOCX_MIME);
  }

  function ensure(input, state, folderId, template, config, context) {
    if (String(config.CONTRACT_OUTPUT_FORMAT).toUpperCase() !== 'DOCX') {
      DocumentalistasErrors.fail('UNSUPPORTED_OUTPUT_FORMAT', 'Somente DOCX está habilitado nesta versão.');
    }
    var outputName = DocumentalistasDrive.renderName(config.CONTRACT_NAME_PATTERN, input.identity);
    var finalProperties = {
      sl_kind: 'documentalista_contract',
      sl_identity: input.identityKey,
      sl_fingerprint: input.fingerprint,
      sl_template_version: template.version
    };
    var final = findFinal(folderId, outputName, finalProperties, context);
    if (final) return final;

    var sourceBlob = DocumentalistasTemplate.downloadSourceBlob(template.sourceId);
    var blob = buildDocx(sourceBlob, outputName, input.placeholders);
    try {
      final = Drive.Files.create({
        name: outputName,
        mimeType: DocumentalistasDrive.DOCX_MIME,
        parents: [folderId],
        properties: finalProperties,
        appProperties: finalProperties
      }, blob, { supportsAllDrives: true, fields: 'id,name,mimeType,parents,driveId,properties,appProperties' });
    } catch (error) {
      final = findFinal(folderId, outputName, finalProperties, context);
      if (!final) throw error;
    }
    DocumentalistasDrive.verifyParent(final.id, folderId);
    return final;
  }

  function findFinal(folderId, outputName, properties, context) {
    var final = DocumentalistasDrive.selectUnique(DocumentalistasDrive.directChildren(folderId, context, {
      mimeType: DocumentalistasDrive.DOCX_MIME,
      appProperties: properties
    }), 'CONTRACT_CONFLICT', 'contrato final identificado');
    if (!final) {
      final = DocumentalistasDrive.selectUnique(DocumentalistasDrive.directChildren(folderId, context, {
        mimeType: DocumentalistasDrive.DOCX_MIME,
        name: outputName
      }), 'CONTRACT_CONFLICT', 'contrato legado pelo nome e contexto');
      if (final) DocumentalistasDrive.mergeAppProperties(final.id, properties);
    }
    return final;
  }

  return {
    findAllOccurrences: findAllOccurrences,
    replaceLiteralInText: replaceLiteralInText,
    replaceDocument: replaceDocument,
    replaceDocxXml: replaceDocxXml,
    splitPlaceholderSegments: splitPlaceholderSegments,
    specializePaymentText: specializePaymentText,
    specializePaymentClauseXml: specializePaymentClauseXml,
    buildDocx: buildDocx,
    exportGoogleDocAsDocx: exportGoogleDocAsDocx,
    ensure: ensure,
    findFinal: findFinal
  };
})();
