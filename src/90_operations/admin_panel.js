function autorizarPainelAdministrativo_() {
  var properties = PropertiesService.getScriptProperties();
  var allowed = String(properties.getProperty('ADMIN_PANEL_ALLOWED_EMAILS') || '')
    .split(',')
    .map(function (email) { return email.trim().toLowerCase(); })
    .filter(Boolean);
  var activeEmail = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  var authorized = allowed.length && activeEmail && allowed.indexOf(activeEmail) >= 0;
  if (!authorized) {
    DocumentalistasErrors.fail(
      allowed.length ? 'ADMIN_PANEL_ACCESS_DENIED' : 'ADMIN_PANEL_ACCESS_NOT_CONFIGURED',
      allowed.length
        ? 'A conta atual não está autorizada a usar o painel administrativo.'
        : 'Defina ADMIN_PANEL_ALLOWED_EMAILS nas Script Properties para liberar o painel a outras contas.'
    );
  }
  return activeEmail;
}

function criarHtmlPainelAdministrativo_() {
  return HtmlService.createHtmlOutputFromFile('90_operations/AdminPanel')
    .setTitle('Administração de documentalistas')
    .setWidth(980)
    .setHeight(760);
}

function confirmacaoPainelCorresponde_(received, expected) {
  return String(received || '').trim() === String(expected || '').trim();
}

function doGet() {
  autorizarPainelAdministrativo_();
  return criarHtmlPainelAdministrativo_();
}

function obterResumoPainelDocumentalistas() {
  autorizarPainelAdministrativo_();
  var config = DocumentalistasConfig.get();
  var checkpoint = lerCheckpointExpurgoHistorico_(PropertiesService.getScriptProperties());
  return {
    templates: ['PF', 'PJ'].map(function (entityType) {
      var selected = DocumentalistasTemplate.resolveTemplateConfig(config, null, entityType);
      return {
        entityType: entityType,
        version: selected.version,
        hash: selected.hash,
        sourceConfigured: !!selected.sourceId
      };
    }),
    purgeCheckpoint: checkpoint ? { active: true, sourceRow: Number(checkpoint.sourceRow), startedAt: checkpoint.startedAt || '' } : { active: false }
  };
}

function diagnosticarLinhaExpurgoPainelDocumentalistas(rowValue) {
  autorizarPainelAdministrativo_();
  var rowNumber = interpretarLinhaExpurgo_(rowValue);
  var config = DocumentalistasConfig.get();
  var source = DocumentalistasHistoricalImport.getSource(config);
  if (rowNumber > source.lastRow) {
    DocumentalistasErrors.fail('PURGE_ROW_OUT_OF_RANGE', 'A linha informada não existe na planilha de respostas atual.', { sourceRow: rowNumber, lastRow: source.lastRow });
  }
  var row = source.sheet.getRange(rowNumber, 1, 1, source.lastColumn).getValues()[0];
  if (row.every(function (value) { return value === '' || value === null; })) {
    DocumentalistasErrors.fail('HISTORICAL_PURGE_SOURCE_ROW_EMPTY', 'A linha selecionada está vazia.');
  }
  var raw = DocumentalistasHistoricalImport.rowToRaw(source.headers, row, rowNumber, config);
  if (!(raw.submittedAt instanceof Date) || isNaN(raw.submittedAt.getTime())) {
    DocumentalistasErrors.fail('HISTORICAL_PURGE_SOURCE_TIMESTAMP_INVALID', 'A linha selecionada não possui um timestamp válido do Forms.');
  }
  var type = DocumentalistasNormalize.normalize(raw.answersByItemId['151260162'], 'entityType').canonical;
  var documentValue = type === 'PJ' ? raw.answersByItemId['319976783'] : raw.answersByItemId['285166117'];
  var displayName = type === 'PJ' ? raw.answersByItemId['832580151'] : raw.answersByItemId['1047884631'];
  var extractedIdentityKey = '';
  var validationStatus = 'REJECTED_OR_INCOMPLETE';
  var validationCode = '';
  try {
    var input = DocumentalistasForm.extract(raw, new Date());
    extractedIdentityKey = DocumentalistasNormalize.sha256(config.ROOT_FOLDER_ID + '|' + input.identity.documentType + '|' + input.identity.canonicalDocument);
    validationStatus = 'VALID';
  } catch (error) {
    validationCode = DocumentalistasErrors.asError(error).code;
  }
  var form = FormApp.openById(config.FORM_ID);
  var response = localizarRespostaOriginalExpurgo_(form, raw, extractedIdentityKey, config);
  return {
    row: rowNumber,
    submittedAt: raw.submittedAt.toISOString(),
    entityType: type === 'PJ' ? 'PJ' : (type === 'PF' ? 'PF' : 'DESCONHECIDO'),
    displayName: DocumentalistasNormalize.whitespace(displayName),
    maskedDocument: DocumentalistasErrors.maskDocument(documentValue),
    validationStatus: validationStatus,
    validationCode: validationCode,
    responseReference: '…' + String(response.getId()).slice(-8),
    confirmation: 'EXPURGAR LINHA ' + rowNumber
  };
}

function expurgarLinhaPainelDocumentalistas(payload) {
  autorizarPainelAdministrativo_();
  payload = payload || {};
  var rowNumber = interpretarLinhaExpurgo_(payload.row);
  var expected = 'EXPURGAR LINHA ' + rowNumber;
  if (!confirmacaoPainelCorresponde_(payload.confirmation, expected)) {
    DocumentalistasErrors.fail('PURGE_PANEL_CONFIRMATION_REQUIRED', 'Digite exatamente "' + expected + '" para confirmar.');
  }
  var properties = PropertiesService.getScriptProperties();
  properties.setProperties({
    MANUAL_HISTORICAL_ROW: String(rowNumber),
    CONFIRM_HISTORICAL_PURGE_ROW: String(rowNumber)
  }, false);
  try {
    return expurgarCadastroLinhaConfiguradaDocumentalistas();
  } catch (error) {
    if (!properties.getProperty('HISTORICAL_PURGE_ACTIVE_JSON')) {
      properties.deleteProperty('CONFIRM_HISTORICAL_PURGE_ROW');
    }
    throw error;
  }
}

function normalizarTipoTemplatePainel_(value) {
  var entityType = String(value || '').trim().toUpperCase();
  if (entityType !== 'PF' && entityType !== 'PJ') {
    DocumentalistasErrors.fail('INVALID_ENTITY_TYPE', 'Selecione PF ou PJ.');
  }
  return entityType;
}

function validarVersaoTemplatePainel_(entityType, value) {
  var version = String(value || '').trim();
  var pattern = entityType === 'PF'
    ? /^definitivo-pf-\d{4}-\d{2}-v\d+$/
    : /^definitivo-\d{4}-\d{2}-v\d+$/;
  if (!pattern.test(version)) {
    DocumentalistasErrors.fail('INVALID_TEMPLATE_VERSION', 'Use o padrão ' + (entityType === 'PF' ? 'definitivo-pf-AAAA-MM-vN' : 'definitivo-AAAA-MM-vN') + '.');
  }
  return version;
}

function decodificarTemplatePainel_(payload) {
  payload = payload || {};
  var entityType = normalizarTipoTemplatePainel_(payload.entityType);
  var version = validarVersaoTemplatePainel_(entityType, payload.version);
  var fileName = String(payload.fileName || '').trim();
  if (!/\.docx$/i.test(fileName)) DocumentalistasErrors.fail('INVALID_DOCX_FILE_NAME', 'Selecione um arquivo com extensão .docx.');
  var encoded = String(payload.base64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!encoded) DocumentalistasErrors.fail('TEMPLATE_FILE_REQUIRED', 'Selecione o arquivo DOCX.');
  var bytes;
  try { bytes = Utilities.base64Decode(encoded); }
  catch (error) { DocumentalistasErrors.fail('INVALID_TEMPLATE_UPLOAD', 'O arquivo enviado não pôde ser decodificado.'); }
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
    DocumentalistasErrors.fail('TEMPLATE_FILE_SIZE_INVALID', 'O DOCX deve possuir entre 1 byte e 8 MB.', { byteLength: bytes.length });
  }
  var blob = Utilities.newBlob(bytes, DocumentalistasDrive.DOCX_MIME, fileName);
  var validation = DocumentalistasTemplate.validateDocxBlob(blob);
  DocumentalistasTemplate.assertEntityType(validation.placeholders, entityType);
  if (validation.supportedEntityTypes.length !== 1) {
    DocumentalistasErrors.fail('TEMPLATE_ENTITY_TYPE_REQUIRED', 'O template deve ser exclusivo para PF ou PJ.');
  }
  var hash = DocumentalistasTemplate.sha256Blob(blob);
  return {
    entityType: entityType,
    version: version,
    fileName: fileName,
    blob: blob,
    hash: hash,
    placeholders: validation.placeholders,
    supportedEntityTypes: validation.supportedEntityTypes,
    confirmation: 'ATIVAR ' + entityType + ' ' + version + ' ' + hash.slice(0, 12)
  };
}

function validarTemplatePainelDocumentalistas(payload) {
  autorizarPainelAdministrativo_();
  var candidate = decodificarTemplatePainel_(payload);
  return {
    status: 'VALID',
    entityType: candidate.entityType,
    version: candidate.version,
    fileName: candidate.fileName,
    hash: candidate.hash,
    placeholders: candidate.placeholders,
    supportedEntityTypes: candidate.supportedEntityTypes,
    confirmation: candidate.confirmation
  };
}

function propriedadesTemplatePainel_(entityType, sourceId, docId, hash, version) {
  var prefix = 'CONTRACT_TEMPLATE_' + entityType + '_';
  var values = {};
  values[prefix + 'SOURCE_ID'] = sourceId;
  values[prefix + 'DOC_ID'] = docId;
  values[prefix + 'HASH'] = hash;
  values[prefix + 'VERSION'] = version;
  if (entityType === 'PJ') {
    values.CONTRACT_TEMPLATE_SOURCE_ID = sourceId;
    values.CONTRACT_TEMPLATE_DOC_ID = docId;
    values.CONTRACT_TEMPLATE_HASH = hash;
    values.CONTRACT_TEMPLATE_VERSION = version;
  }
  return values;
}

function restaurarPropriedadesPainel_(properties, previous, keys) {
  keys.forEach(function (key) {
    if (previous[key] === null || previous[key] === undefined) properties.deleteProperty(key);
    else properties.setProperty(key, previous[key]);
  });
}

function selecionarReleaseTemplatePainel_(technical, context, candidate, kind, mimeType, sourceId) {
  var versionMatches = DocumentalistasDrive.directChildren(technical.id, context, {
    mimeType: mimeType,
    appProperties: { sl_kind: kind, sl_template_version: candidate.version }
  });
  var conflicting = versionMatches.filter(function (file) {
    var metadata = file.properties || file.appProperties || {};
    return metadata.sl_template_hash !== candidate.hash || (sourceId && metadata.sl_template_source_id !== sourceId);
  });
  if (conflicting.length) {
    DocumentalistasErrors.fail('TEMPLATE_VERSION_CONFLICT', 'Já existe um arquivo com a mesma versão e conteúdo diferente. Incremente a versão antes de ativar.', { entityType: candidate.entityType, version: candidate.version });
  }
  return DocumentalistasDrive.selectUnique(versionMatches, 'TEMPLATE_REMOTE_CONFLICT', 'release do template ' + candidate.entityType);
}

function publicarEAtivarTemplatePainelDocumentalistas(payload) {
  autorizarPainelAdministrativo_();
  var candidate = decodificarTemplatePainel_(payload);
  if (!confirmacaoPainelCorresponde_(payload && payload.confirmation, candidate.confirmation)) {
    DocumentalistasErrors.fail('TEMPLATE_ACTIVATION_CONFIRMATION_REQUIRED', 'Digite exatamente a confirmação fornecida após a validação.');
  }
  var config = DocumentalistasConfig.get();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(config.LOCK_WAIT_MS)) DocumentalistasErrors.fail('LOCK_TIMEOUT_RETRYABLE', 'Não foi possível obter o bloqueio para publicar o template; tente novamente.');
  try {
    var context = DocumentalistasDrive.driveContext(config.ROOT_FOLDER_ID);
    var technical = DocumentalistasDrive.ensureTechnicalFolder(config, context);
    var metadata = {
      sl_kind: 'contract_template_source',
      sl_entity_type: candidate.entityType,
      sl_template_hash: candidate.hash,
      sl_template_version: candidate.version
    };
    var source = selecionarReleaseTemplatePainel_(technical, context, candidate, metadata.sl_kind, DocumentalistasDrive.DOCX_MIME, '');
    if (!source) {
      source = Drive.Files.create({
        name: (candidate.entityType === 'PF' ? 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS - PF - ' : 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS - ') + candidate.version + '.docx',
        mimeType: DocumentalistasDrive.DOCX_MIME,
        parents: [technical.id],
        properties: metadata,
        appProperties: metadata
      }, candidate.blob, { supportsAllDrives: true, fields: 'id,name,mimeType,parents,properties,appProperties' });
    }
    DocumentalistasDrive.verifyParent(source.id, technical.id);
    var remoteBlob = DocumentalistasTemplate.downloadSourceBlob(source.id);
    if (DocumentalistasTemplate.sha256Blob(remoteBlob) !== candidate.hash) {
      DocumentalistasErrors.fail('TEMPLATE_HASH_MISMATCH', 'O DOCX publicado não corresponde ao arquivo validado.');
    }
    DocumentalistasTemplate.assertEntityType(DocumentalistasTemplate.validateDocxBlob(remoteBlob).placeholders, candidate.entityType);

    var previewMetadata = {
      sl_kind: 'contract_template_doc',
      sl_entity_type: candidate.entityType,
      sl_template_hash: candidate.hash,
      sl_template_version: candidate.version,
      sl_template_source_id: source.id
    };
    var preview = selecionarReleaseTemplatePainel_(technical, context, candidate, previewMetadata.sl_kind, DocumentalistasDrive.DOC_MIME, source.id);
    if (!preview) {
      preview = Drive.Files.create({
        name: (candidate.entityType === 'PF' ? 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS - PF - ' : 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS - ') + candidate.version + ' [PROCESSAMENTO]',
        mimeType: DocumentalistasDrive.DOC_MIME,
        parents: [technical.id],
        properties: previewMetadata,
        appProperties: previewMetadata
      }, candidate.blob, { supportsAllDrives: true, fields: 'id,name,mimeType,parents,properties,appProperties' });
    }
    DocumentalistasDrive.verifyParent(preview.id, technical.id);

    var values = propriedadesTemplatePainel_(candidate.entityType, source.id, preview.id, candidate.hash, candidate.version);
    var properties = PropertiesService.getScriptProperties();
    var keys = Object.keys(values);
    var previous = {};
    keys.forEach(function (key) { previous[key] = properties.getProperty(key); });
    properties.setProperties(values, false);
    try {
      DocumentalistasTemplate.validateConfiguredTemplate(DocumentalistasConfig.get(), null, candidate.entityType);
    } catch (error) {
      restaurarPropriedadesPainel_(properties, previous, keys);
      throw error;
    }
    var result = {
      status: 'ACTIVE',
      entityType: candidate.entityType,
      version: candidate.version,
      hash: candidate.hash,
      sourceDocxId: source.id,
      convertedDocId: preview.id,
      technicalFolderId: technical.id,
      previousVersion: previous['CONTRACT_TEMPLATE_' + candidate.entityType + '_VERSION'] || ''
    };
    DocumentalistasErrors.log('ADMIN_TEMPLATE_ACTIVATION', 'ACTIVE', result);
    return result;
  } finally {
    lock.releaseLock();
  }
}
