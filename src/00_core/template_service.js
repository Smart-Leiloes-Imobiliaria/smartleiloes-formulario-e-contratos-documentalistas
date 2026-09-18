var DocumentalistasTemplate = (function () {
  'use strict';

  function extractPlaceholders(text) {
    var matches = String(text || '').match(/\{\{[A-Za-z][A-Za-z0-9_]*\}\}/g) || [];
    return matches.filter(function (value, index) { return matches.indexOf(value) === index; });
  }

  function validatePlaceholderSet(found) {
    var allowed = DocumentalistasFields.allowedPlaceholders();
    var unknown = found.filter(function (placeholder) { return allowed.indexOf(placeholder) < 0; });
    var missing = DocumentalistasFields.REQUIRED_TEMPLATE_PLACEHOLDERS.filter(function (placeholder) { return found.indexOf(placeholder) < 0; });
    if (unknown.length) {
      DocumentalistasErrors.fail('UNKNOWN_TEMPLATE_PLACEHOLDER', 'O template contém placeholders sem mapeamento.', { placeholders: unknown });
    }
    if (missing.length) {
      DocumentalistasErrors.fail('REQUIRED_TEMPLATE_PLACEHOLDER_MISSING', 'O template não contém todos os placeholders mínimos.', { placeholders: missing });
    }
    return { placeholders: found, unknown: unknown, missing: missing, supportedEntityTypes: supportedEntityTypes(found) };
  }

  function supportedEntityTypes(placeholders) {
    var definitions = DocumentalistasFields.byDomain();
    var rulesByPlaceholder = {};
    Object.keys(definitions).forEach(function (domain) {
      var definition = definitions[domain];
      if (definition.placeholder) rulesByPlaceholder[definition.placeholder] = definition.requiredRule;
    });
    var hasPf = placeholders.some(function (placeholder) { return rulesByPlaceholder[placeholder] === 'PF'; });
    var hasPj = placeholders.some(function (placeholder) { return rulesByPlaceholder[placeholder] === 'PJ'; });
    if (hasPf && hasPj) {
      DocumentalistasErrors.fail('UNSUPPORTED_MIXED_ENTITY_TEMPLATE', 'O template contém campos PF e PJ sem blocos condicionais suportados. Use um texto neutro ou templates separados.');
    }
    if (hasPf) return ['PF'];
    if (hasPj) return ['PJ'];
    return ['PF', 'PJ'];
  }

  function assertEntityType(placeholders, entityType) {
    var supported = supportedEntityTypes(placeholders || []);
    if (supported.indexOf(entityType) < 0) {
      DocumentalistasErrors.fail('TEMPLATE_ENTITY_TYPE_MISMATCH', 'O template ativo não é compatível com o tipo de pessoa da resposta.', {
        entityType: entityType,
        supportedEntityTypes: supported
      });
    }
    return supported;
  }

  function collectTextContainers(document) {
    if (typeof document.getTabs === 'function' && document.getTabs().length > 1) {
      DocumentalistasErrors.fail('UNSUPPORTED_TEMPLATE_TABS', 'Templates DOCX convertidos devem possuir apenas uma guia do Google Docs.');
    }
    var containers = [];
    [document.getBody(), document.getHeader(), document.getFooter()].filter(Boolean).forEach(function (root) {
      walk(root, containers);
    });
    return containers;
  }

  function walk(element, containers) {
    var type = String(element.getType ? element.getType() : '');
    if (type === String(DocumentApp.ElementType.PARAGRAPH) || type === String(DocumentApp.ElementType.LIST_ITEM)) {
      containers.push(element);
      return;
    }
    if (typeof element.getNumChildren === 'function') {
      for (var index = 0; index < element.getNumChildren(); index++) walk(element.getChild(index), containers);
    }
  }

  function documentText(document) {
    return collectTextContainers(document).map(function (container) { return container.getText(); }).join('\n');
  }

  function validateDocument(document) {
    return validatePlaceholderSet(extractPlaceholders(documentText(document)));
  }

  function resolveTemplateConfig(config, recorded, entityType) {
    recorded = recorded || {};
    entityType = String(entityType || '').toUpperCase();
    if (entityType !== 'PF' && entityType !== 'PJ') {
      DocumentalistasErrors.fail('INVALID_ENTITY_TYPE', 'O tipo de pessoa deve ser PF ou PJ para selecionar o template contratual.', { entityType: entityType });
    }
    if (recorded.sourceId || recorded.hash || recorded.version || recorded.docId) {
      return {
        docId: recorded.docId || '',
        sourceId: recorded.sourceId || '',
        hash: recorded.hash || '',
        version: recorded.version || '',
        entityType: entityType,
        recorded: true
      };
    }
    var prefix = 'CONTRACT_TEMPLATE_' + entityType + '_';
    return {
      docId: config[prefix + 'DOC_ID'] || (entityType === 'PJ' ? config.CONTRACT_TEMPLATE_DOC_ID : '') || '',
      sourceId: config[prefix + 'SOURCE_ID'] || (entityType === 'PJ' ? config.CONTRACT_TEMPLATE_SOURCE_ID : '') || '',
      hash: config[prefix + 'HASH'] || (entityType === 'PJ' ? config.CONTRACT_TEMPLATE_HASH : '') || '',
      version: config[prefix + 'VERSION'] || (entityType === 'PJ' ? config.CONTRACT_TEMPLATE_VERSION : '') || '',
      entityType: entityType,
      recorded: false
    };
  }

  function validateConfiguredTemplate(config, recorded, entityType) {
    var selected = resolveTemplateConfig(config || {}, recorded, entityType);
    var templateDocId = selected.docId;
    var sourceId = selected.sourceId;
    var hash = selected.hash;
    var version = selected.version;
    if (!sourceId || !hash || !version) {
      DocumentalistasErrors.fail('TEMPLATE_NOT_CONFIGURED_' + selected.entityType, 'Template DOCX para ' + selected.entityType + ' ainda não foi sincronizado e ativado.', { entityType: selected.entityType });
    }
    var sourceFile = DocumentalistasDrive.getFile(sourceId);
    if (sourceFile.mimeType !== DocumentalistasDrive.DOCX_MIME || sourceFile.trashed) {
      DocumentalistasErrors.fail('TEMPLATE_SOURCE_INVALID', 'O source ID do template ' + selected.entityType + ' não aponta para o DOCX original ativo.', { entityType: selected.entityType });
    }
    var metadata = sourceFile.properties || sourceFile.appProperties || {};
    if (metadata.sl_template_hash && metadata.sl_template_hash !== hash) {
      DocumentalistasErrors.fail('TEMPLATE_HASH_MISMATCH', 'O hash configurado não corresponde aos metadados do DOCX de origem.');
    }
    var sourceBlob = downloadSourceBlob(sourceId);
    var actualHash = sha256Blob(sourceBlob);
    if (actualHash !== hash) DocumentalistasErrors.fail('TEMPLATE_HASH_MISMATCH', 'O conteúdo do DOCX de origem não corresponde ao hash configurado.');
    var validation = validateDocxBlob(sourceBlob);
    assertEntityType(validation.placeholders, selected.entityType);
    return {
      docId: templateDocId,
      sourceId: sourceFile.id,
      hash: hash,
      version: version,
      placeholders: validation.placeholders,
      supportedEntityTypes: validation.supportedEntityTypes,
      entityType: selected.entityType
    };
  }

  function downloadSourceBlob(sourceId) {
    var response = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(sourceId) + '?alt=media', {
      method: 'get',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      DocumentalistasErrors.fail('TEMPLATE_SOURCE_DOWNLOAD_FAILED', 'Falha ao baixar o DOCX original do template.', { status: response.getResponseCode() });
    }
    return response.getBlob().setName('template.docx').setContentType(DocumentalistasDrive.DOCX_MIME);
  }

  function sha256Blob(blob) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, blob.getBytes()).map(function (byte) {
      return ('0' + ((byte < 0 ? byte + 256 : byte).toString(16))).slice(-2);
    }).join('');
  }

  function decodeXml(value) {
    return String(value).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }

  function countOccurrences(text, token) {
    return String(text || '').split(token).length - 1;
  }

  function inspectXmlPlaceholders(xml, partName) {
    var found = [];
    var paragraphs = String(xml || '').match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];
    paragraphs.forEach(function (paragraph) {
      var textNodes = [];
      paragraph.replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, function (_whole, text) {
        textNodes.push(decodeXml(text));
        return _whole;
      });
      var combined = textNodes.join('');
      extractPlaceholders(combined).forEach(function (placeholder) {
        if (found.indexOf(placeholder) < 0) found.push(placeholder);
        var supportedOccurrences = textNodes.reduce(function (total, node) {
          return total + countOccurrences(node, placeholder);
        }, 0);
        if (supportedOccurrences < countOccurrences(combined, placeholder)) {
          DocumentalistasErrors.fail('FRAGMENTED_TEMPLATE_PLACEHOLDER', 'Placeholder fragmentado entre runs de formatação no DOCX.', { placeholder: placeholder, part: partName });
        }
      });
    });
    return found;
  }

  function unzipDocxBlob(blob) {
    var bytes = blob.getBytes();
    var hasZipSignature = bytes.length >= 4 &&
      (bytes[0] & 255) === 0x50 &&
      (bytes[1] & 255) === 0x4B &&
      (bytes[2] & 255) === 0x03 &&
      (bytes[3] & 255) === 0x04;
    if (!hasZipSignature) {
      DocumentalistasErrors.fail('INVALID_DOCX', 'O template baixado não possui a assinatura binária de um pacote DOCX.', { byteLength: bytes.length });
    }
    try {
      var zipBlob = Utilities.newBlob(bytes, 'application/zip', 'template.zip');
      return Utilities.unzip(zipBlob);
    } catch (error) {
      DocumentalistasErrors.fail('INVALID_DOCX', 'O template configurado não pôde ser aberto como pacote DOCX.', { cause: error.message, byteLength: bytes.length });
    }
  }

  function validateDocxBlob(blob) {
    var files = unzipDocxBlob(blob);
    var found = [];
    var hasDocument = false;
    files.forEach(function (part) {
      var name = part.getName();
      if (name === 'word/document.xml') hasDocument = true;
      if (!/^word\/(document|header\d+|footer\d+)\.xml$/.test(name)) return;
      inspectXmlPlaceholders(part.getDataAsString('UTF-8'), name).forEach(function (placeholder) {
        if (found.indexOf(placeholder) < 0) found.push(placeholder);
      });
    });
    if (!hasDocument) DocumentalistasErrors.fail('INVALID_DOCX', 'DOCX sem word/document.xml.');
    return validatePlaceholderSet(found);
  }

  return {
    extractPlaceholders: extractPlaceholders,
    validatePlaceholderSet: validatePlaceholderSet,
    collectTextContainers: collectTextContainers,
    documentText: documentText,
    validateDocument: validateDocument,
    resolveTemplateConfig: resolveTemplateConfig,
    validateConfiguredTemplate: validateConfiguredTemplate,
    validateDocxBlob: validateDocxBlob,
    unzipDocxBlob: unzipDocxBlob,
    inspectXmlPlaceholders: inspectXmlPlaceholders,
    downloadSourceBlob: downloadSourceBlob,
    sha256Blob: sha256Blob,
    supportedEntityTypes: supportedEntityTypes,
    assertEntityType: assertEntityType
  };
})();
