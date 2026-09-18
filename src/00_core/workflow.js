var DocumentalistasWorkflow = (function () {
  'use strict';

  function addResponse(state, input) {
    state.responseIds = DocumentalistasState.uniqueStrings((state.responseIds || []).concat([input.responseId]));
    state.latestResponseId = input.responseId;
    state.submittedAt = input.submittedAt;
  }

  function runPipeline(input, services) {
    var state;
    var existed = false;
    try {
      var responseState = services.findByResponseId(input.responseId);
      if (responseState && responseState.identityKey !== input.identityKey) {
        DocumentalistasErrors.fail('RESPONSE_IDENTITY_CHANGED', 'O mesmo ID de resposta passou a identificar outro documento; revisão manual obrigatória.');
      }

      state = services.findByIdentity(input.identityKey);
      existed = !!state;
      if (state && state.fingerprint !== input.fingerprint) {
        addResponse(state, input);
        state.status = 'CONFLICT';
        state.lastErrorCode = 'CONTRACT_DATA_CONFLICT';
        state.lastErrorMessage = 'Mesmo documento com dados contratuais diferentes.';
        state.conflictFingerprint = input.fingerprint;
        services.save(state);
        DocumentalistasErrors.fail('CONTRACT_DATA_CONFLICT', 'Já existe cadastro para o mesmo documento com dados contratuais diferentes. Nenhum contrato foi substituído.');
      }

      if (!state) {
        state = services.createInitial(input);
        services.save(state);
      } else {
        addResponse(state, input);
        state.status = 'PROCESSING';
        state.lastErrorCode = '';
        state.lastErrorMessage = '';
        state.conflictFingerprint = '';
        services.save(state);
      }

      var template = services.validateTemplate(state, input);
      if (!state.templateSourceId) {
        state.templateDocId = template.docId;
        state.templateVersion = template.version;
        state.templateHash = template.hash;
        state.templateSourceId = template.sourceId;
        state.stage = 'TEMPLATE_VALIDATED';
        services.save(state);
      } else if (state.templateVersion !== template.version) {
        DocumentalistasErrors.fail('TEMPLATE_VERSION_CHANGED_DURING_RESUME', 'A retomada deve usar a mesma versão de template registrada na primeira emissão.');
      }

      if (!state.emissionDateIso) {
        state.emissionDateIso = input.emissionDateIso;
        services.save(state);
      }
      input.emissionDateIso = state.emissionDateIso;
      input.emissionDateDisplay = DocumentalistasForm.formatEmissionIso(state.emissionDateIso);
      input.placeholders['{{dataAssinatura}}'] = input.emissionDateDisplay;

      var folder = services.ensureFolder(input);
      state.folderId = folder.id;
      state.stage = 'FOLDER_READY';
      services.save(state);

      var contract = services.ensureContract(input, state, folder.id, template);
      state.contractId = contract.id;
      state.stage = 'CONTRACT_READY';
      services.save(state);

      var spreadsheet = services.ensureSpreadsheet(input, folder.id);
      state.spreadsheetId = spreadsheet.id;
      state.stage = 'SPREADSHEET_READY';
      services.save(state);

      state.stage = 'COMPLETED';
      state.status = 'COMPLETED';
      state.lastErrorCode = '';
      state.lastErrorMessage = '';
      services.save(state);
      return {
        status: 'COMPLETED',
        alreadyProcessed: existed,
        identityKey: state.identityKey,
        folderId: state.folderId,
        contractId: state.contractId,
        spreadsheetId: state.spreadsheetId,
        emissionDateIso: state.emissionDateIso,
        templateVersion: state.templateVersion
      };
    } catch (error) {
      var normalized = DocumentalistasErrors.asError(error);
      if (state && normalized.code !== 'CONTRACT_DATA_CONFLICT') {
        state.status = normalized.code.indexOf('CONFLICT') >= 0 ? 'CONFLICT' : 'FAILED';
        state.lastErrorCode = normalized.code;
        state.lastErrorMessage = normalized.message;
        services.save(state);
      }
      throw normalized;
    }
  }

  function productionServices(config, context, store) {
    return {
      findByResponseId: function (responseId) { return DocumentalistasState.findByResponseId(store, responseId); },
      findByIdentity: function (identityKey) { return DocumentalistasState.findByIdentity(store, identityKey); },
      createInitial: DocumentalistasState.createInitial,
      save: function (state) { return DocumentalistasState.save(store, state); },
      validateTemplate: function (state, input) {
        var recorded = state && state.templateSourceId ? {
          docId: state.templateDocId,
          sourceId: state.templateSourceId,
          hash: state.templateHash,
          version: state.templateVersion
        } : null;
        return DocumentalistasTemplate.validateConfiguredTemplate(config, recorded, input.entityType);
      },
      ensureFolder: function (input) { return DocumentalistasDrive.ensureProfessionalFolder(input, config, context); },
      ensureContract: function (input, state, folderId, template) { return DocumentalistasContract.ensure(input, state, folderId, template, config, context); },
      ensureSpreadsheet: function (input, folderId) { return DocumentalistasSpreadsheet.ensure(input, folderId, config, context); }
    };
  }

  function processRaw(raw, options) {
    options = options || {};
    var config = DocumentalistasConfig.get();
    if (!options.explicit && config.ACTIVATION_START_ISO && raw.submittedAt < new Date(config.ACTIVATION_START_ISO)) {
      DocumentalistasErrors.fail('BEFORE_ACTIVATION_WINDOW', 'Resposta anterior à data de ativação; use reprocessamento explícito por ID.');
    }
    var input = DocumentalistasForm.extract(raw, options.now || new Date());
    input.identityKey = DocumentalistasNormalize.sha256(config.ROOT_FOLDER_ID + '|' + input.identity.documentType + '|' + input.identity.canonicalDocument);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(config.LOCK_WAIT_MS)) {
      if (options.enqueueOnLockFailure) {
        enqueueResponse(input.responseId, config);
        return { status: 'QUEUED_FOR_RETRY', responseId: input.responseId };
      }
      DocumentalistasErrors.fail('LOCK_TIMEOUT_RETRYABLE', 'Não foi possível obter o bloqueio; a resposta deve ser retomada.');
    }
    try {
      var context = DocumentalistasDrive.driveContext(config.ROOT_FOLDER_ID);
      var store = DocumentalistasState.ensureRegistry(config, context);
      return runPipeline(input, productionServices(config, context, store));
    } finally {
      lock.releaseLock();
    }
  }

  function enqueueResponse(responseId, config) {
    return enqueueResponses([responseId], config, true);
  }

  function parsePendingQueue(properties) {
    try { return JSON.parse(properties.getProperty('PENDING_RESPONSE_IDS') || '[]'); }
    catch (error) { return []; }
  }

  function mergeRetryQueue(current, additions, limit) {
    var merged = DocumentalistasState.uniqueStrings((current || []).concat(additions || []));
    if (merged.length > limit) {
      DocumentalistasErrors.fail('RETRY_QUEUE_CAPACITY_EXCEEDED', 'A fila de retomada atingiu o limite; use reprocessamento explícito para a resposta informada.', {
        queueSize: (current || []).length,
        additions: (additions || []).length,
        limit: limit
      });
    }
    return merged;
  }

  function enqueueResponses(responseIds, config, schedule) {
    var userLock = LockService.getUserLock();
    if (!userLock.tryLock(10000)) DocumentalistasErrors.fail('RETRY_QUEUE_LOCK_FAILED', 'Não foi possível registrar a retomada com segurança.');
    var queue;
    try {
      var properties = PropertiesService.getScriptProperties();
      queue = mergeRetryQueue(parsePendingQueue(properties), responseIds.map(String), 100);
      properties.setProperty('PENDING_RESPONSE_IDS', JSON.stringify(queue));
    } finally {
      userLock.releaseLock();
    }
    if (schedule) scheduleRetry(config, null);
    return queue.length;
  }

  function takePendingResponses(limit) {
    var userLock = LockService.getUserLock();
    if (!userLock.tryLock(10000)) DocumentalistasErrors.fail('RETRY_QUEUE_LOCK_FAILED', 'Não foi possível obter a fila de retomada com segurança.');
    try {
      var properties = PropertiesService.getScriptProperties();
      var queue = parsePendingQueue(properties);
      var batch = queue.slice(0, limit);
      var remaining = queue.slice(limit);
      if (remaining.length) properties.setProperty('PENDING_RESPONSE_IDS', JSON.stringify(remaining));
      else properties.deleteProperty('PENDING_RESPONSE_IDS');
      return { batch: batch, remaining: remaining };
    } finally {
      userLock.releaseLock();
    }
  }

  function pendingResponses(limit) {
    var queue = parsePendingQueue(PropertiesService.getScriptProperties());
    return limit ? queue.slice(0, Number(limit)) : queue;
  }

  function removePendingResponse(responseId) {
    var userLock = LockService.getUserLock();
    if (!userLock.tryLock(10000)) DocumentalistasErrors.fail('RETRY_QUEUE_LOCK_FAILED', 'Não foi possível atualizar a fila de retomada com segurança.');
    try {
      var properties = PropertiesService.getScriptProperties();
      var queue = parsePendingQueue(properties).filter(function (item) { return String(item) !== String(responseId); });
      if (queue.length) properties.setProperty('PENDING_RESPONSE_IDS', JSON.stringify(queue));
      else properties.deleteProperty('PENDING_RESPONSE_IDS');
      return queue.length;
    } finally {
      userLock.releaseLock();
    }
  }

  function isRetryableError(error) {
    var code = String((error && error.code) || 'UNEXPECTED_ERROR');
    return ['LOCK_TIMEOUT_RETRYABLE', 'RETRY_QUEUE_LOCK_FAILED', 'UNEXPECTED_ERROR', 'RESOURCE_INACCESSIBLE'].indexOf(code) >= 0;
  }

  function pendingResponseCount() {
    return parsePendingQueue(PropertiesService.getScriptProperties()).length;
  }

  function acknowledgeScheduledTrigger(e, markerKey) {
    var triggerUid = e && e.triggerUid ? String(e.triggerUid) : '';
    if (!triggerUid) return false;
    var properties = PropertiesService.getScriptProperties();
    if (String(properties.getProperty(markerKey) || '') !== triggerUid) return false;
    properties.deleteProperty(markerKey);
    return true;
  }

  function scheduledTriggerStatus(handler, markerKey) {
    var recordedUid = PropertiesService.getScriptProperties().getProperty(markerKey);
    if (!recordedUid) return { scheduled: false };
    var scheduled = ScriptApp.getProjectTriggers().some(function (trigger) {
      return trigger.getHandlerFunction() === handler && String(trigger.getUniqueId()) === String(recordedUid);
    });
    return { scheduled: scheduled };
  }

  function ensureTimeTrigger(handler, delayMs, markerKey) {
    var userLock = LockService.getUserLock();
    if (!userLock.tryLock(10000)) DocumentalistasErrors.fail('RETRY_QUEUE_LOCK_FAILED', 'Não foi possível agendar a retomada com segurança.');
    try {
      var properties = PropertiesService.getScriptProperties();
      var recordedUid = properties.getProperty(markerKey);
      var matchingTriggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
        return trigger.getHandlerFunction() === handler;
      });
      var recordedTrigger = recordedUid && matchingTriggers.filter(function (trigger) {
        return String(trigger.getUniqueId()) === String(recordedUid);
      })[0];
      matchingTriggers.forEach(function (trigger) {
        if (!recordedTrigger || String(trigger.getUniqueId()) !== String(recordedUid)) {
          try { ScriptApp.deleteTrigger(trigger); } catch (ignored) {}
        }
      });
      var recordedStillExists = !!recordedTrigger;
      if (recordedStillExists) return false;
      if (recordedUid) properties.deleteProperty(markerKey);
      var created = ScriptApp.newTrigger(handler).timeBased().after(Number(delayMs)).create();
      properties.setProperty(markerKey, String(created.getUniqueId()));
      return true;
    } finally {
      userLock.releaseLock();
    }
  }

  function scheduleRetry(config, ignoredTriggerUid) {
    return ensureTimeTrigger(config.RETRY_HANDLER, Number(config.RETRY_TRIGGER_DELAY_MS || 300000), 'PENDING_RESPONSE_RETRY_TRIGGER_UID');
  }

  return {
    addResponse: addResponse,
    runPipeline: runPipeline,
    productionServices: productionServices,
    processRaw: processRaw,
    enqueueResponse: enqueueResponse,
    enqueueResponses: enqueueResponses,
    mergeRetryQueue: mergeRetryQueue,
    takePendingResponses: takePendingResponses,
    pendingResponses: pendingResponses,
    removePendingResponse: removePendingResponse,
    pendingResponseCount: pendingResponseCount,
    isRetryableError: isRetryableError,
    acknowledgeScheduledTrigger: acknowledgeScheduledTrigger,
    scheduledTriggerStatus: scheduledTriggerStatus,
    ensureTimeTrigger: ensureTimeTrigger,
    scheduleRetry: scheduleRetry
  };
})();
