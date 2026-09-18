function reprocessarRespostaDocumentalistas(responseId) {
  if (!responseId) DocumentalistasErrors.fail('RESPONSE_ID_REQUIRED', 'Informe explicitamente o ID da resposta a reprocessar.');
  var config = DocumentalistasConfig.get();
  var form = FormApp.openById(config.FORM_ID);
  var response = form.getResponse(String(responseId));
  var raw = DocumentalistasForm.responseToRaw(response, form.getId());
  var result = DocumentalistasWorkflow.processRaw(raw, { enqueueOnLockFailure: false, explicit: true });
  DocumentalistasErrors.log('MANUAL_REPROCESS', result.status, { responseId: responseId, identityKey: result.identityKey });
  return result;
}

function responseIdManualDocumentalistas_() {
  var responseId = PropertiesService.getScriptProperties().getProperty('MANUAL_RESPONSE_ID');
  if (!responseId) DocumentalistasErrors.fail('MANUAL_RESPONSE_ID_NOT_CONFIGURED', 'Defina MANUAL_RESPONSE_ID nas Script Properties para usar a rotina sem argumentos.');
  return responseId;
}

function simularRespostaConfiguradaDocumentalistas() {
  return simularRespostaDocumentalistas(responseIdManualDocumentalistas_());
}

function reprocessarRespostaConfiguradaDocumentalistas() {
  return reprocessarRespostaDocumentalistas(responseIdManualDocumentalistas_());
}

function consultarEstadoConfiguradoDocumentalistas() {
  var properties = PropertiesService.getScriptProperties();
  var key = properties.getProperty('MANUAL_STATE_LOOKUP_KEY') || properties.getProperty('MANUAL_RESPONSE_ID');
  if (!key) DocumentalistasErrors.fail('MANUAL_STATE_LOOKUP_KEY_NOT_CONFIGURED', 'Defina MANUAL_STATE_LOOKUP_KEY ou MANUAL_RESPONSE_ID nas Script Properties.');
  return consultarEstadoDocumentalistas(key);
}

function configurarProjetoDocumentalistas() {
  var configured = DocumentalistasConfig.setNonDestructive({
    FORM_ID: DocumentalistasConfig.DEFAULTS.FORM_ID,
    ROOT_FOLDER_ID: DocumentalistasConfig.DEFAULTS.ROOT_FOLDER_ID,
    SPREADSHEET_TEMPLATE_ID: DocumentalistasConfig.DEFAULTS.SPREADSHEET_TEMPLATE_ID,
    RESPONSE_SPREADSHEET_ID: DocumentalistasConfig.DEFAULTS.RESPONSE_SPREADSHEET_ID,
    RESPONSE_SHEET_ID: DocumentalistasConfig.DEFAULTS.RESPONSE_SHEET_ID,
    CONTRACT_TEMPLATE_SOURCE_ID: DocumentalistasConfig.DEFAULTS.CONTRACT_TEMPLATE_SOURCE_ID,
    CONTRACT_TEMPLATE_DOC_ID: DocumentalistasConfig.DEFAULTS.CONTRACT_TEMPLATE_DOC_ID,
    CONTRACT_TEMPLATE_HASH: DocumentalistasConfig.DEFAULTS.CONTRACT_TEMPLATE_HASH,
    CONTRACT_TEMPLATE_VERSION: DocumentalistasConfig.DEFAULTS.CONTRACT_TEMPLATE_VERSION,
    CONTRACT_TEMPLATE_PJ_SOURCE_ID: DocumentalistasConfig.DEFAULTS.CONTRACT_TEMPLATE_PJ_SOURCE_ID,
    CONTRACT_TEMPLATE_PJ_DOC_ID: DocumentalistasConfig.DEFAULTS.CONTRACT_TEMPLATE_PJ_DOC_ID,
    CONTRACT_TEMPLATE_PJ_HASH: DocumentalistasConfig.DEFAULTS.CONTRACT_TEMPLATE_PJ_HASH,
    CONTRACT_TEMPLATE_PJ_VERSION: DocumentalistasConfig.DEFAULTS.CONTRACT_TEMPLATE_PJ_VERSION,
    CONTRACT_TEMPLATE_PF_SOURCE_ID: DocumentalistasConfig.DEFAULTS.CONTRACT_TEMPLATE_PF_SOURCE_ID,
    CONTRACT_TEMPLATE_PF_DOC_ID: DocumentalistasConfig.DEFAULTS.CONTRACT_TEMPLATE_PF_DOC_ID,
    CONTRACT_TEMPLATE_PF_HASH: DocumentalistasConfig.DEFAULTS.CONTRACT_TEMPLATE_PF_HASH,
    CONTRACT_TEMPLATE_PF_VERSION: DocumentalistasConfig.DEFAULTS.CONTRACT_TEMPLATE_PF_VERSION,
    TECHNICAL_FOLDER_ID: DocumentalistasConfig.DEFAULTS.TECHNICAL_FOLDER_ID,
    TIME_ZONE: DocumentalistasConfig.DEFAULTS.TIME_ZONE,
    SPREADSHEET_LOCALE: DocumentalistasConfig.DEFAULTS.SPREADSHEET_LOCALE,
    SIGNATURE_LOCATION: DocumentalistasConfig.DEFAULTS.SIGNATURE_LOCATION,
    FOLDER_NAME_PATTERN: DocumentalistasConfig.DEFAULTS.FOLDER_NAME_PATTERN,
    CONTRACT_OUTPUT_FORMAT: DocumentalistasConfig.DEFAULTS.CONTRACT_OUTPUT_FORMAT
  });
  var result = { configuredKeys: Object.keys(configured), preservedExistingProperties: true };
  DocumentalistasErrors.log('PROJECT_CONFIGURATION', 'OK', result);
  return result;
}

function configurarTemplateAtivoDocumentalistas(sourceDocxId, convertedDocId, sha256, version) {
  return configurarTemplatePorTipoDocumentalistas('PJ', sourceDocxId, convertedDocId, sha256, version);
}

function configurarTemplatePfDocumentalistas(sourceDocxId, convertedDocId, sha256, version) {
  return configurarTemplatePorTipoDocumentalistas('PF', sourceDocxId, convertedDocId, sha256, version);
}

function configurarTemplatePorTipoDocumentalistas(entityType, sourceDocxId, convertedDocId, sha256, version) {
  if (!sourceDocxId || !convertedDocId || !sha256 || !version) {
    DocumentalistasErrors.fail('TEMPLATE_CONFIGURATION_INCOMPLETE', 'Informe sourceDocxId, convertedDocId, sha256 e version retornados pela sincronização local.');
  }
  entityType = String(entityType || '').toUpperCase();
  if (entityType !== 'PF' && entityType !== 'PJ') DocumentalistasErrors.fail('INVALID_ENTITY_TYPE', 'Informe PF ou PJ ao configurar o template.');
  var values = {};
  values['CONTRACT_TEMPLATE_' + entityType + '_SOURCE_ID'] = sourceDocxId;
  values['CONTRACT_TEMPLATE_' + entityType + '_DOC_ID'] = convertedDocId;
  values['CONTRACT_TEMPLATE_' + entityType + '_HASH'] = sha256;
  values['CONTRACT_TEMPLATE_' + entityType + '_VERSION'] = version;
  if (entityType === 'PJ') {
    values.CONTRACT_TEMPLATE_SOURCE_ID = sourceDocxId;
    values.CONTRACT_TEMPLATE_DOC_ID = convertedDocId;
    values.CONTRACT_TEMPLATE_HASH = sha256;
    values.CONTRACT_TEMPLATE_VERSION = version;
  }
  DocumentalistasConfig.setNonDestructive(values);
  return validarTemplateContratoDocumentalistas();
}

function listarCamposFormularioDocumentalistas() {
  var config = DocumentalistasConfig.get();
  var form = FormApp.openById(config.FORM_ID);
  var mapping = DocumentalistasFields.byItemId();
  var fields = form.getItems().map(function (item) {
    var itemId = String(item.getId());
    var definition = mapping[itemId] || null;
    var required = false;
    try { required = questionItem_(item).isRequired(); } catch (error) { required = false; }
    return {
      itemId: Number(itemId),
      title: item.getTitle(),
      type: String(item.getType()),
      requiredInForm: required,
      domain: definition && definition.domain,
      placeholder: definition && definition.placeholder,
      requiredRule: definition && definition.requiredRule,
      mapped: !!definition
    };
  });
  DocumentalistasErrors.log('FORM_FIELDS_DIAGNOSTIC', 'OK', { formId: form.getId(), itemCount: fields.length, mappedAnswerItems: fields.filter(function (field) { return field.mapped; }).length });
  return fields;
}

function questionItem_(item) {
  var type = String(item.getType());
  var methods = {
    TEXT: 'asTextItem', PARAGRAPH_TEXT: 'asParagraphTextItem', MULTIPLE_CHOICE: 'asMultipleChoiceItem',
    CHECKBOX: 'asCheckboxItem', LIST: 'asListItem', SCALE: 'asScaleItem', GRID: 'asGridItem',
    CHECKBOX_GRID: 'asCheckboxGridItem', DATE: 'asDateItem', DATETIME: 'asDateTimeItem',
    TIME: 'asTimeItem', DURATION: 'asDurationItem'
  };
  if (!methods[type] || typeof item[methods[type]] !== 'function') throw new Error('Item sem resposta obrigatória');
  return item[methods[type]]();
}

function validarTemplateContratoDocumentalistas() {
  var config = DocumentalistasConfig.get();
  var templates = {};
  ['PF', 'PJ'].forEach(function (entityType) {
    var template = DocumentalistasTemplate.validateConfiguredTemplate(config, null, entityType);
    templates[entityType] = { templateDocId: template.docId, templateSourceId: template.sourceId, templateVersion: template.version, templateHash: template.hash, placeholders: template.placeholders, supportedEntityTypes: template.supportedEntityTypes };
  });
  var result = { status: 'VALID', templates: templates };
  DocumentalistasErrors.log('TEMPLATE_VALIDATION', 'VALID', result);
  return result;
}

function instalarGatilhoDocumentalistas() {
  var config = DocumentalistasConfig.get();
  var form = FormApp.openById(config.FORM_ID);
  var matches = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === config.SUBMIT_HANDLER &&
      trigger.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT &&
      trigger.getTriggerSourceId() === config.FORM_ID;
  });
  if (!matches.length) ScriptApp.newTrigger(config.SUBMIT_HANDLER).forForm(form).onFormSubmit().create();
  var result = {
    handler: config.SUBMIT_HANDLER,
    formId: config.FORM_ID,
    existingForExecutingAccount: matches.length,
    created: matches.length === 0,
    note: 'A API lista somente gatilhos acessíveis à conta executora; gatilhos de outras contas não são removidos.'
  };
  DocumentalistasErrors.log('TRIGGER_INSTALLATION', result.created ? 'CREATED' : 'REUSED', { handler: result.handler, formId: result.formId, existingForExecutingAccount: result.existingForExecutingAccount });
  return result;
}

function prepararAtivacaoDocumentalistas() {
  validarTemplateContratoDocumentalistas();
  var historical = DocumentalistasHistoricalImport.snapshotActivation();
  var formTrigger = instalarGatilhoDocumentalistas();
  var result = { formTrigger: formTrigger, historicalImport: historical };
  DocumentalistasErrors.log('ACTIVATION_PREPARED', 'OK', result);
  return result;
}

function retomarAtivacaoAposPausaDocumentalistas() {
  var config = DocumentalistasConfig.get();
  validarTemplateContratoDocumentalistas();
  DocumentalistasHistoricalImport.readCheckpoint();
  DocumentalistasHistoricalImport.getSource(config);
  var formTrigger = instalarGatilhoDocumentalistas();
  var historical = DocumentalistasHistoricalImport.resumeAfterPause();
  var result = { formTrigger: formTrigger, historicalImport: historical };
  DocumentalistasErrors.log('ACTIVATION_RESUMED_AFTER_PAUSE', 'OK', result);
  return result;
}

function importarRespostasHistoricasDocumentalistas() {
  return DocumentalistasHistoricalImport.runBatch(null);
}

function reprocessarLinhaHistoricaDocumentalistas(rowNumber) {
  if (!rowNumber) DocumentalistasErrors.fail('HISTORICAL_ROW_REQUIRED', 'Informe explicitamente a linha histórica a reprocessar.');
  return DocumentalistasHistoricalImport.retryRow(rowNumber);
}

function reprocessarLinhaHistoricaConfiguradaDocumentalistas() {
  var row = PropertiesService.getScriptProperties().getProperty('MANUAL_HISTORICAL_ROW');
  if (!row) DocumentalistasErrors.fail('MANUAL_HISTORICAL_ROW_NOT_CONFIGURED', 'Defina MANUAL_HISTORICAL_ROW nas Script Properties.');
  return reprocessarLinhaHistoricaDocumentalistas(Number(row));
}

function reprocessarErrosHistoricosDocumentalistas() {
  return DocumentalistasHistoricalImport.retryFailedRows(20);
}

function reprocessarLinhasHistoricasSelecionadasDocumentalistas() {
  var rows = PropertiesService.getScriptProperties().getProperty('MANUAL_HISTORICAL_ROWS');
  return DocumentalistasHistoricalImport.retrySelectedRows(rows, 20);
}

function reprocessarHistoricoPendenteDocumentalistas() {
  instalarGatilhoDocumentalistas();
  return DocumentalistasHistoricalImport.retryAllPendingRows();
}

function diagnosticarFilaHistoricaDocumentalistas() {
  var result = DocumentalistasHistoricalImport.retryQueueStatus();
  DocumentalistasErrors.log('HISTORICAL_RETRY_QUEUE_DIAGNOSTIC', result.pendingRows.length ? 'IN_PROGRESS' : 'COMPLETED', result);
  return result;
}

function corrigirPadraoNomePastaDocumentalistas() {
  var pattern = DocumentalistasConfig.DEFAULTS.FOLDER_NAME_PATTERN;
  DocumentalistasConfig.setNonDestructive({ FOLDER_NAME_PATTERN: pattern });
  var result = { status: 'UPDATED', folderNamePattern: pattern };
  DocumentalistasErrors.log('FOLDER_NAME_PATTERN_CONFIGURATION', 'UPDATED', result);
  return result;
}

function removerArtefatosLinhaHistoricaConfiguradaDocumentalistas() {
  var properties = PropertiesService.getScriptProperties();
  var configuredRow = properties.getProperty('MANUAL_HISTORICAL_ROW');
  if (!configuredRow) DocumentalistasErrors.fail('MANUAL_HISTORICAL_ROW_NOT_CONFIGURED', 'Defina MANUAL_HISTORICAL_ROW nas Script Properties.');
  var checkpoint = DocumentalistasHistoricalImport.readCheckpoint();
  var rowNumber = DocumentalistasHistoricalImport.parseSelectedRows(configuredRow, checkpoint.startRow, checkpoint.endRow, 1)[0];
  var config = DocumentalistasConfig.get();
  var responseId = 'sheet:' + config.RESPONSE_SPREADSHEET_ID + ':' + config.RESPONSE_SHEET_ID + ':row:' + rowNumber;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(config.LOCK_WAIT_MS)) DocumentalistasErrors.fail('LOCK_TIMEOUT_RETRYABLE', 'Não foi possível obter o bloqueio para remover os artefatos; tente novamente.');
  try {
    var context = DocumentalistasDrive.driveContext(config.ROOT_FOLDER_ID);
    var store = DocumentalistasState.ensureRegistry(config, context);
    var state = DocumentalistasState.findByResponseId(store, responseId);
    if (!state || !state.folderId) {
      var absent = { status: 'NO_ARTIFACTS', sourceRow: rowNumber, responseId: responseId };
      DocumentalistasErrors.log('HISTORICAL_ARTIFACT_RESET', absent.status, absent);
      return absent;
    }
    var removed = DocumentalistasDrive.trashProfessionalFolder(state.folderId, state.identityKey, config.ROOT_FOLDER_ID);
    state.folderId = '';
    state.contractId = '';
    state.spreadsheetId = '';
    state.stage = 'RESET_PENDING_REPROCESS';
    state.status = 'PENDING_REPROCESS';
    state.lastErrorCode = '';
    state.lastErrorMessage = '';
    DocumentalistasState.save(store, state);
    var result = {
      status: removed.alreadyTrashed ? 'ALREADY_TRASHED' : 'TRASHED',
      sourceRow: rowNumber,
      responseId: responseId,
      folderId: removed.id,
      recoverableFromDriveTrash: true,
      nextAction: 'reprocessarLinhaHistoricaConfiguradaDocumentalistas'
    };
    DocumentalistasErrors.log('HISTORICAL_ARTIFACT_RESET', result.status, result);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function diagnosticarRamoPagamentoRegeneracao_(input) {
  var paymentMethod = String(input.values.formaPagamento.canonical || '');
  var inactiveDomains = paymentMethod === 'PIX'
    ? ['codigoBanco', 'agenciaBancaria', 'contaBancaria', 'tipoContaBancaria']
    : ['tipoChavePix', 'chavePix'];
  var populatedInactiveDomains = inactiveDomains.filter(function (domain) {
    return !!(input.values[domain] && input.values[domain].canonical);
  });
  return {
    paymentMethod: paymentMethod,
    inactiveDomains: inactiveDomains,
    populatedInactiveDomains: populatedInactiveDomains,
    clean: populatedInactiveDomains.length === 0
  };
}

function lerCheckpointRegeneracaoContrato_(properties) {
  var serialized = properties.getProperty('CONTRACT_REGENERATION_ACTIVE_JSON');
  if (!serialized) return null;
  try {
    var marker = JSON.parse(serialized);
    if (!marker || !marker.sourceRow || !marker.oldContractId || !marker.currentFingerprint || !marker.preservedSpreadsheetId) throw new Error('incompleto');
    return marker;
  } catch (error) {
    DocumentalistasErrors.fail('INVALID_CONTRACT_REGENERATION_CHECKPOINT', 'O checkpoint da regeneração está inválido; nenhum contrato foi removido.');
  }
}

function regenerarContratoLinhaHistoricaConfiguradaDocumentalistas() {
  var properties = PropertiesService.getScriptProperties();
  var configuredRow = properties.getProperty('MANUAL_HISTORICAL_ROW');
  if (!configuredRow) DocumentalistasErrors.fail('MANUAL_HISTORICAL_ROW_NOT_CONFIGURED', 'Defina MANUAL_HISTORICAL_ROW nas Script Properties.');
  var checkpoint = DocumentalistasHistoricalImport.readCheckpoint();
  var rowNumber = DocumentalistasHistoricalImport.parseSelectedRows(configuredRow, checkpoint.startRow, checkpoint.endRow, 1)[0];
  var config = DocumentalistasConfig.get();
  var responseId = DocumentalistasHistoricalImport.syntheticResponseId(config, rowNumber);
  var oldContract;
  var preservedSpreadsheetId;
  var fingerprintMigrated = false;
  var resumedFromCheckpoint = false;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(config.LOCK_WAIT_MS)) DocumentalistasErrors.fail('LOCK_TIMEOUT_RETRYABLE', 'Não foi possível obter o bloqueio para regenerar o contrato; tente novamente.');
  try {
    var context = DocumentalistasDrive.driveContext(config.ROOT_FOLDER_ID);
    var source = DocumentalistasHistoricalImport.getSource(config);
    var raw = DocumentalistasHistoricalImport.rowToRaw(
      source.headers,
      source.sheet.getRange(rowNumber, 1, 1, source.lastColumn).getValues()[0],
      rowNumber,
      config
    );
    var currentInput = DocumentalistasForm.extract(raw, new Date());
    currentInput.identityKey = DocumentalistasNormalize.sha256(config.ROOT_FOLDER_ID + '|' + currentInput.identity.documentType + '|' + currentInput.identity.canonicalDocument);
    var store = DocumentalistasState.ensureRegistry(config, context);
    var state = DocumentalistasState.findByResponseId(store, responseId);
    var checkpointMarker = lerCheckpointRegeneracaoContrato_(properties);
    if (checkpointMarker && Number(checkpointMarker.sourceRow) !== rowNumber) {
      DocumentalistasErrors.fail('CONTRACT_REGENERATION_ALREADY_ACTIVE', 'Há outra regeneração de contrato em andamento; conclua-a antes de selecionar outra linha.', {
        activeSourceRow: Number(checkpointMarker.sourceRow),
        requestedSourceRow: rowNumber
      });
    }
    if (!state || !state.folderId || !state.spreadsheetId || (!state.contractId && !checkpointMarker)) {
      DocumentalistasErrors.fail('CONTRACT_REGENERATION_STATE_INCOMPLETE', 'A regeneração exige estado com pasta, contrato e planilha registrados.', { sourceRow: rowNumber });
    }
    if (currentInput.identityKey !== state.identityKey) {
      DocumentalistasErrors.fail('CONTRACT_REGENERATION_IDENTITY_CONFLICT', 'O CPF/CNPJ atual da linha difere da identidade emitida; nenhum contrato foi removido.', { sourceRow: rowNumber });
    }
    if (checkpointMarker && checkpointMarker.currentFingerprint !== currentInput.fingerprint) {
      DocumentalistasErrors.fail('CONTRACT_REGENERATION_SOURCE_CHANGED', 'A linha mudou depois do início da regeneração; nenhum novo contrato foi emitido.', { sourceRow: rowNumber });
    }

    if (checkpointMarker && state.status === 'COMPLETED' && state.contractId && state.contractId !== checkpointMarker.oldContractId && state.fingerprint === currentInput.fingerprint) {
      if (state.spreadsheetId !== checkpointMarker.preservedSpreadsheetId) {
        DocumentalistasErrors.fail('SPREADSHEET_ID_CHANGED_DURING_CONTRACT_REGENERATION', 'A planilha existente não foi preservada durante a regeneração do contrato.', {
          sourceRow: rowNumber,
          expectedSpreadsheetId: checkpointMarker.preservedSpreadsheetId,
          actualSpreadsheetId: state.spreadsheetId
        });
      }
      var completedFolder = DocumentalistasDrive.getFile(state.folderId, 'id,name,parents,trashed');
      properties.deleteProperty('CONTRACT_REGENERATION_ACTIVE_JSON');
      properties.deleteProperty('CONFIRM_CONTRACT_DATA_MIGRATION_ROW');
      var recoveredResult = {
        status: 'COMPLETED',
        sourceRow: rowNumber,
        responseId: responseId,
        folderId: state.folderId,
        folderName: completedFolder.name,
        oldContractId: checkpointMarker.oldContractId,
        oldContractRecoverableFromTrash: true,
        contractId: state.contractId,
        spreadsheetId: state.spreadsheetId,
        spreadsheetPreserved: true,
        emissionDateIso: state.emissionDateIso,
        templateVersion: state.templateVersion,
        fingerprintMigrated: !!checkpointMarker.fingerprintMigrationApproved,
        resumedAfterUncertainCompletion: true
      };
      DocumentalistasErrors.log('HISTORICAL_CONTRACT_REGENERATION', 'ALREADY_COMPLETED', recoveredResult);
      return recoveredResult;
    }

    if (currentInput.fingerprint !== state.fingerprint) {
      var paymentBranch = diagnosticarRamoPagamentoRegeneracao_(currentInput);
      var confirmedRow = properties.getProperty('CONFIRM_CONTRACT_DATA_MIGRATION_ROW');
      var migrationWasApproved = checkpointMarker && checkpointMarker.fingerprintMigrationApproved;
      if (!migrationWasApproved && String(confirmedRow || '') !== String(rowNumber)) {
        DocumentalistasErrors.fail('CONTRACT_REGENERATION_DATA_MIGRATION_CONFIRMATION_REQUIRED', 'Os dados atuais da linha diferem do estado emitido. Confirme explicitamente a adoção da linha corrigida; nenhum contrato foi removido.', {
          sourceRow: rowNumber,
          confirmationProperty: 'CONFIRM_CONTRACT_DATA_MIGRATION_ROW',
          paymentMethod: paymentBranch.paymentMethod,
          inactiveBranchClean: paymentBranch.clean,
          populatedInactiveDomains: paymentBranch.populatedInactiveDomains
        });
      }
      if (!paymentBranch.clean) {
        DocumentalistasErrors.fail('CONTRACT_REGENERATION_PAYMENT_BRANCH_NOT_CLEAN', 'A linha ainda contém valores no ramo de pagamento não selecionado; nenhum contrato foi removido.', {
          sourceRow: rowNumber,
          paymentMethod: paymentBranch.paymentMethod,
          populatedInactiveDomains: paymentBranch.populatedInactiveDomains
        });
      }
      fingerprintMigrated = true;
    }

    if (!checkpointMarker) {
      checkpointMarker = {
        sourceRow: rowNumber,
        responseId: responseId,
        identityKey: state.identityKey,
        oldContractId: state.contractId,
        preservedSpreadsheetId: state.spreadsheetId,
        currentFingerprint: currentInput.fingerprint,
        fingerprintMigrationApproved: fingerprintMigrated,
        startedAt: new Date().toISOString()
      };
      properties.setProperty('CONTRACT_REGENERATION_ACTIVE_JSON', JSON.stringify(checkpointMarker));
    } else {
      resumedFromCheckpoint = true;
      fingerprintMigrated = !!checkpointMarker.fingerprintMigrationApproved;
      if (checkpointMarker.identityKey !== state.identityKey || checkpointMarker.responseId !== responseId || checkpointMarker.preservedSpreadsheetId !== state.spreadsheetId) {
        DocumentalistasErrors.fail('CONTRACT_REGENERATION_CHECKPOINT_CONFLICT', 'O estado atual não corresponde ao checkpoint da regeneração; nenhum contrato foi removido.', { sourceRow: rowNumber });
      }
    }
    var currentFolder = DocumentalistasDrive.getFile(state.folderId, 'id,name,mimeType,parents,trashed,properties,appProperties');
    var folderMetadata = currentFolder.properties || currentFolder.appProperties || {};
    if (currentFolder.mimeType !== DocumentalistasDrive.FOLDER_MIME || currentFolder.trashed ||
        (currentFolder.parents || []).indexOf(config.ROOT_FOLDER_ID) < 0 ||
        folderMetadata.sl_kind !== 'documentalista_folder' || folderMetadata.sl_identity !== state.identityKey) {
      DocumentalistasErrors.fail('UNSAFE_CONTRACT_REGENERATION_FOLDER', 'Regeneração bloqueada: a pasta não possui identidade e parent esperados da automação.', { sourceRow: rowNumber, folderId: state.folderId });
    }
    DocumentalistasDrive.verifyParent(state.spreadsheetId, state.folderId);
    preservedSpreadsheetId = checkpointMarker.preservedSpreadsheetId;
    oldContract = DocumentalistasDrive.trashOwnedContract(checkpointMarker.oldContractId, state.identityKey, state.folderId);
    if (fingerprintMigrated) state.fingerprint = currentInput.fingerprint;
    state.stage = 'FOLDER_READY';
    state.status = 'PENDING_REPROCESS';
    state.lastErrorCode = '';
    state.lastErrorMessage = '';
    state.conflictFingerprint = '';
    DocumentalistasState.save(store, state);
    properties.deleteProperty('CONFIRM_CONTRACT_DATA_MIGRATION_ROW');
    DocumentalistasErrors.log('HISTORICAL_CONTRACT_REGENERATION', 'OLD_CONTRACT_TRASHED', {
      sourceRow: rowNumber,
      responseId: responseId,
      oldContractId: oldContract.id,
      folderId: state.folderId,
      spreadsheetId: preservedSpreadsheetId,
      fingerprintMigrated: fingerprintMigrated,
      resumedFromCheckpoint: resumedFromCheckpoint
    });
  } finally {
    lock.releaseLock();
  }

  var processed = DocumentalistasHistoricalImport.retryRow(rowNumber);
  if (processed.spreadsheetId !== preservedSpreadsheetId) {
    DocumentalistasErrors.fail('SPREADSHEET_ID_CHANGED_DURING_CONTRACT_REGENERATION', 'A planilha existente não foi preservada durante a regeneração do contrato.', {
      sourceRow: rowNumber,
      expectedSpreadsheetId: preservedSpreadsheetId,
      actualSpreadsheetId: processed.spreadsheetId
    });
  }
  var folder = DocumentalistasDrive.getFile(processed.folderId, 'id,name,parents,trashed');
  var result = {
    status: 'COMPLETED',
    sourceRow: rowNumber,
    responseId: responseId,
    folderId: processed.folderId,
    folderName: folder.name,
    oldContractId: oldContract.id,
    oldContractRecoverableFromTrash: true,
    contractId: processed.contractId,
    spreadsheetId: processed.spreadsheetId,
    spreadsheetPreserved: true,
    emissionDateIso: processed.emissionDateIso,
    templateVersion: processed.templateVersion,
    fingerprintMigrated: fingerprintMigrated,
    resumedFromCheckpoint: resumedFromCheckpoint
  };
  properties.deleteProperty('CONTRACT_REGENERATION_ACTIVE_JSON');
  properties.deleteProperty('CONFIRM_CONTRACT_DATA_MIGRATION_ROW');
  DocumentalistasErrors.log('HISTORICAL_CONTRACT_REGENERATION', 'COMPLETED', result);
  return result;
}

function diagnosticarCheckpointHistoricoDocumentalistas() {
  var config = DocumentalistasConfig.get();
  var checkpoint = DocumentalistasHistoricalImport.readCheckpoint();
  var source = DocumentalistasHistoricalImport.getSource(config);
  var result = {
    activationStartIso: checkpoint.activationStartIso,
    startRow: checkpoint.startRow,
    endRow: checkpoint.endRow,
    nextRow: checkpoint.nextRow,
    pendingRows: Math.max(0, checkpoint.endRow - checkpoint.nextRow + 1),
    sourceLastRow: source.lastRow,
    rowsAfterCutoff: Math.max(0, source.lastRow - checkpoint.endRow)
  };
  DocumentalistasErrors.log('HISTORICAL_CHECKPOINT_DIAGNOSTIC', 'OK', result);
  return result;
}

function simularRespostaDocumentalistas(responseId) {
  if (!responseId) DocumentalistasErrors.fail('RESPONSE_ID_REQUIRED', 'Informe explicitamente o ID da resposta a simular.');
  var config = DocumentalistasConfig.get();
  var form = FormApp.openById(config.FORM_ID);
  var input = DocumentalistasForm.extract(DocumentalistasForm.responseToRaw(form.getResponse(String(responseId)), form.getId()), new Date());
  input.identityKey = DocumentalistasNormalize.sha256(config.ROOT_FOLDER_ID + '|' + input.identity.documentType + '|' + input.identity.canonicalDocument);
  var result = {
    dryRun: true,
    responseId: input.responseId,
    submittedAt: input.submittedAt,
    entityType: input.entityType,
    maskedDocument: DocumentalistasErrors.maskDocument(input.identity.canonicalDocument),
    identityKey: input.identityKey,
    fingerprint: input.fingerprint,
    folderName: DocumentalistasDrive.renderName(config.FOLDER_NAME_PATTERN, input.identity),
    contractName: DocumentalistasDrive.renderName(config.CONTRACT_NAME_PATTERN, input.identity),
    spreadsheetName: DocumentalistasDrive.renderName(config.SPREADSHEET_NAME_PATTERN, input.identity),
    writesPerformed: false
  };
  DocumentalistasErrors.log('DRY_RUN', 'OK', { responseId: result.responseId, identityKey: result.identityKey, fingerprint: result.fingerprint, writesPerformed: false });
  return result;
}

function consultarEstadoDocumentalistas(identityKeyOrResponseId) {
  if (!identityKeyOrResponseId) DocumentalistasErrors.fail('STATE_LOOKUP_KEY_REQUIRED', 'Informe identityKey ou responseId.');
  var config = DocumentalistasConfig.get();
  var context = DocumentalistasDrive.driveContext(config.ROOT_FOLDER_ID);
  var store = DocumentalistasState.ensureRegistry(config, context);
  var state = DocumentalistasState.findByIdentity(store, String(identityKeyOrResponseId)) || DocumentalistasState.findByResponseId(store, String(identityKeyOrResponseId));
  if (!state) {
    DocumentalistasErrors.log('STATE_LOOKUP', 'NOT_FOUND', { lookupKey: String(identityKeyOrResponseId) });
    return null;
  }
  var result = DocumentalistasErrors.redact({
    identityKey: state.identityKey,
    documentType: state.documentType,
    maskedDocument: state.maskedDocument,
    responseIds: state.responseIds,
    fingerprint: state.fingerprint,
    emissionDateIso: state.emissionDateIso,
    templateVersion: state.templateVersion,
    templateHash: state.templateHash,
    folderId: state.folderId,
    spreadsheetId: state.spreadsheetId,
    contractId: state.contractId,
    stage: state.stage,
    status: state.status,
    lastErrorCode: state.lastErrorCode,
    lastErrorMessage: state.lastErrorMessage,
    updatedAt: state.updatedAt
  });
  DocumentalistasErrors.log('STATE_LOOKUP', result.status || 'FOUND', {
    identityKey: result.identityKey,
    maskedDocument: result.maskedDocument,
    folderId: result.folderId,
    spreadsheetId: result.spreadsheetId,
    contractId: result.contractId,
    stage: result.stage,
    status: result.status,
    lastErrorCode: result.lastErrorCode
  });
  return result;
}

function diagnosticarConfiguracaoDocumentalistas() {
  var config = DocumentalistasConfig.get();
  var checks = [];
  function check(name, action) {
    try { var detail = action(); checks.push({ name: name, status: 'OK', detail: detail || null }); }
    catch (error) {
      var normalized = DocumentalistasErrors.asError(error, 'ACCESS_OR_AUTHORIZATION_ERROR');
      checks.push({ name: name, status: 'ERROR', code: normalized.code, message: normalized.message, details: normalized.details || null });
    }
  }
  check('form', function () { var form = FormApp.openById(config.FORM_ID); return { id: form.getId(), title: form.getTitle() }; });
  check('rootFolder', function () { var context = DocumentalistasDrive.driveContext(config.ROOT_FOLDER_ID); return { id: context.root.id, driveId: context.driveId || null, sharedDrive: !!context.driveId }; });
  check('spreadsheetTemplate', function () { var file = DocumentalistasDrive.getFile(config.SPREADSHEET_TEMPLATE_ID); var sheet = SpreadsheetApp.openById(file.id); return { id: file.id, title: sheet.getName(), locale: sheet.getSpreadsheetLocale(), timeZone: sheet.getSpreadsheetTimeZone(), headersValid: DocumentalistasSpreadsheet.headersMatch(DocumentalistasSpreadsheet.locateMainSheet(sheet).getRange(1, 1, 1, 38).getDisplayValues()[0]) }; });
  check('responseSpreadsheet', function () { var source = DocumentalistasHistoricalImport.getSource(config); return { id: source.spreadsheet.getId(), sheetId: source.sheet.getSheetId(), sheetTitle: source.sheet.getName(), lastRow: source.lastRow, headersValid: true }; });
  check('contractTemplate', function () { return validarTemplateContratoDocumentalistas(); });
  check('triggers', function () { return ScriptApp.getProjectTriggers().map(function (trigger) { return { handler: trigger.getHandlerFunction(), eventType: String(trigger.getEventType()), sourceId: trigger.getTriggerSourceId() }; }); });
  var status = checks.every(function (item) { return item.status === 'OK'; }) ? 'READY' : (checks.filter(function (item) { return item.status === 'ERROR'; }).every(function (item) { return String(item.code || '').indexOf('TEMPLATE_NOT_CONFIGURED') === 0; }) ? 'BLOCKED_TEMPLATE' : 'NOT_READY');
  var result = { status: status, scriptTimeZone: Session.getScriptTimeZone(), executorEmail: Session.getEffectiveUser().getEmail(), checks: checks };
  DocumentalistasErrors.log('CONFIG_DIAGNOSTIC', status, {
    scriptTimeZone: result.scriptTimeZone,
    checks: checks.map(function (item) { return { name: item.name, status: item.status, code: item.code || '', details: item.details || null }; })
  });
  return result;
}

function testarIntegracaoControladaDocumentalistas(responseId, confirmarEscrita) {
  var config = DocumentalistasConfig.get();
  if (!confirmarEscrita || String(config.INTEGRATION_TEST_WRITES_ENABLED).toLowerCase() !== 'true') return simularRespostaDocumentalistas(responseId);
  return reprocessarRespostaDocumentalistas(responseId);
}
