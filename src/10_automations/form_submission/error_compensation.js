var DocumentalistasErrorCompensation = (function () {
  'use strict';

  var QUEUE_KEY = 'ERROR_COMPENSATION_QUEUE_JSON';
  var TRIGGER_KEY = 'ERROR_COMPENSATION_TRIGGER_UID';
  var LEASE_MS = 10 * 60 * 1000;
  var MAX_QUEUE_SIZE = 50;
  var MAX_AUTOMATIC_ATTEMPTS = 8;

  function clientMessage(error) {
    var normalized = DocumentalistasErrors.asError(error);
    var field = normalized.details && normalized.details.itemId
      ? DocumentalistasFields.byItemId()[String(normalized.details.itemId)]
      : null;
    var messages = {
      INVALID_CPF: 'O CPF informado é inválido. Confira os 11 dígitos e tente novamente.',
      INVALID_CNPJ: 'O CNPJ informado é inválido. Confira os caracteres e os dígitos verificadores.',
      INVALID_EMAIL: 'O e-mail informado é inválido. Confira o endereço digitado.',
      INVALID_CEP: 'O CEP informado é inválido. Preencha os oito dígitos do CEP.',
      INVALID_ENTITY_TYPE: 'Não foi possível identificar se o cadastro é de pessoa física ou jurídica.',
      INVALID_PAYMENT_METHOD: 'A forma de pagamento informada é inválida. Selecione PIX ou TED.',
      INVALID_IDENTIFIER_CHARACTERS: 'Um dos documentos ou dados numéricos contém caracteres inválidos.',
      UNMAPPED_FORM_ITEM: 'O formulário foi alterado e esta resposta não pôde ser processada. Preencha-o novamente.',
      REGISTRATION_ALREADY_EXISTS: 'Já existe um cadastro para o CPF ou CNPJ informado.',
      CONTRACT_DATA_CONFLICT: 'Já existe um cadastro para o CPF ou CNPJ informado com dados diferentes.'
    };
    if (normalized.code === 'REQUIRED_FIELD_MISSING') {
      return 'O campo obrigatório "' + (field ? field.title : 'indicado no formulário') + '" não foi preenchido.';
    }
    return messages[normalized.code] || 'Não foi possível concluir o cadastro devido a uma inconsistência. Revise todos os campos e tente novamente.';
  }

  function readQueue(properties) {
    var serialized = properties.getProperty(QUEUE_KEY);
    if (!serialized) return [];
    try {
      var parsed = JSON.parse(serialized);
      if (!Array.isArray(parsed)) throw new Error('not-array');
      return parsed.filter(function (item) { return item && item.responseId; });
    } catch (error) {
      DocumentalistasErrors.fail('INVALID_ERROR_COMPENSATION_QUEUE', 'A fila de notificação e expurgo de erros está corrompida.');
    }
  }

  function writeQueue(properties, queue) {
    if (queue.length) properties.setProperty(QUEUE_KEY, JSON.stringify(queue));
    else properties.deleteProperty(QUEUE_KEY);
    return queue;
  }

  function withQueueLock(callback) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) DocumentalistasErrors.fail('ERROR_COMPENSATION_QUEUE_LOCK_FAILED', 'Não foi possível atualizar a fila de erros com segurança.');
    try { return callback(PropertiesService.getScriptProperties()); }
    finally { lock.releaseLock(); }
  }

  function schedule(config) {
    return DocumentalistasWorkflow.ensureTimeTrigger(
      config.ERROR_COMPENSATION_HANDLER,
      Number(config.ERROR_COMPENSATION_TRIGGER_DELAY_MS || 300000),
      TRIGGER_KEY
    );
  }

  function enqueue(responseId, error, config) {
    var normalized = DocumentalistasErrors.asError(error);
    var id = String(responseId || '').trim();
    if (!id) DocumentalistasErrors.fail('ERROR_COMPENSATION_RESPONSE_ID_REQUIRED', 'A compensação do erro exige o ID da resposta original.');
    var record = withQueueLock(function (properties) {
      var queue = readQueue(properties);
      var existing = queue.filter(function (item) { return item.responseId === id; })[0];
      if (existing) return existing;
      if (queue.length >= MAX_QUEUE_SIZE) {
        DocumentalistasErrors.fail('ERROR_COMPENSATION_QUEUE_CAPACITY_EXCEEDED', 'A fila de notificação e expurgo atingiu o limite de segurança.', { limit: MAX_QUEUE_SIZE });
      }
      var created = {
        responseId: id,
        errorCode: normalized.code,
        clientMessage: clientMessage(normalized),
        createdAt: new Date().toISOString(),
        attempts: 0,
        sourceRow: 0,
        notificationSent: false,
        messageId: '',
        lastFailureCode: '',
        blocked: false,
        inFlightAt: ''
      };
      queue.push(created);
      writeQueue(properties, queue);
      return created;
    });
    schedule(config || DocumentalistasConfig.get());
    return record;
  }

  function update(responseId, updater) {
    return withQueueLock(function (properties) {
      var queue = readQueue(properties);
      var selected = null;
      queue.forEach(function (item) {
        if (item.responseId !== responseId) return;
        updater(item);
        selected = item;
      });
      writeQueue(properties, queue);
      return selected;
    });
  }

  function claim(responseId, includeBlocked) {
    var now = Date.now();
    return withQueueLock(function (properties) {
      var queue = readQueue(properties);
      var claimed = null;
      queue.forEach(function (item) {
        if (claimed || item.responseId !== responseId || (item.blocked && !includeBlocked)) return;
        var lease = item.inFlightAt ? new Date(item.inFlightAt).getTime() : 0;
        if (lease && lease > now - LEASE_MS) return;
        item.inFlightAt = new Date(now).toISOString();
        item.attempts = Number(item.attempts || 0) + 1;
        if (includeBlocked) item.blocked = false;
        claimed = Object.assign({}, item, { claimed: true });
      });
      writeQueue(properties, queue);
      return claimed;
    });
  }

  function remove(responseId) {
    return withQueueLock(function (properties) {
      var queue = readQueue(properties).filter(function (item) { return item.responseId !== responseId; });
      writeQueue(properties, queue);
      return queue.length;
    });
  }

  function findSourceRow(raw, config) {
    var source = DocumentalistasHistoricalImport.getSource(config);
    if (source.lastRow < 2) DocumentalistasErrors.fail('ERROR_RESPONSE_SOURCE_ROW_NOT_FOUND', 'A resposta rejeitada não foi encontrada na planilha vinculada.');
    var rows = source.sheet.getRange(2, 1, source.lastRow - 1, source.lastColumn).getValues();
    var matches = [];
    rows.forEach(function (row, offset) {
      var rowNumber = offset + 2;
      try {
        var candidate = DocumentalistasHistoricalImport.rowToRaw(source.headers, row, rowNumber, config);
        if (Math.abs(candidate.submittedAt.getTime() - raw.submittedAt.getTime()) <= 1000 &&
            respostasEquivalentesExpurgo_(raw.answersByItemId, candidate.answersByItemId)) matches.push(rowNumber);
      } catch (ignored) {}
    });
    if (matches.length !== 1) {
      DocumentalistasErrors.fail('ERROR_RESPONSE_SOURCE_ROW_NOT_UNIQUE', 'A compensação exige exatamente uma linha compatível na planilha vinculada.', { matches: matches.length });
    }
    return matches[0];
  }

  function formResponseRaw(responseId, config) {
    var form = FormApp.openById(config.FORM_ID);
    var response;
    try { response = form.getResponse(responseId); }
    catch (error) { return null; }
    return DocumentalistasForm.responseToRaw(response, form.getId());
  }

  function processOne(responseId, includeBlocked) {
    var record = claim(String(responseId), includeBlocked === true);
    if (!record || !record.claimed) return { status: 'BUSY_OR_BLOCKED', responseId: String(responseId) };
    var config = DocumentalistasConfig.get();
    try {
      var raw = formResponseRaw(record.responseId, config);
      if (!raw && !(record.notificationSent && record.sourceRow)) {
        DocumentalistasErrors.fail('ERROR_COMPENSATION_FORM_RESPONSE_MISSING', 'A resposta original não está disponível para notificação e expurgo seguros.');
      }
      if (!record.sourceRow) {
        record.sourceRow = findSourceRow(raw, config);
        update(record.responseId, function (item) { item.sourceRow = record.sourceRow; });
      }
      if (!record.notificationSent) {
        var phone = raw && raw.answersByItemId['1470720521'];
        var response = DocumentalistasChatApp.sendErrorTemplate(phone, record.clientMessage, config);
        record.messageId = DocumentalistasChatApp.messageId(response);
        record.notificationSent = true;
        update(record.responseId, function (item) {
          item.notificationSent = true;
          item.messageId = record.messageId;
          item.lastFailureCode = '';
        });
      }
      var purge = expurgarCadastroLinhaAutomaticaDocumentalistas_(record.sourceRow);
      remove(record.responseId);
      var completed = {
        status: 'NOTIFIED_AND_PURGED',
        responseId: record.responseId,
        errorCode: record.errorCode,
        sourceRow: record.sourceRow,
        messageId: record.messageId,
        sourceRowDeleted: purge.sourceRowDeleted === true
      };
      DocumentalistasErrors.log('FORM_ERROR_COMPENSATION', completed.status, completed);
      return completed;
    } catch (error) {
      var normalized = DocumentalistasErrors.asError(error, 'ERROR_COMPENSATION_FAILED');
      var current = update(record.responseId, function (item) {
        item.inFlightAt = '';
        item.lastFailureCode = normalized.code;
        item.blocked = Number(item.attempts || 0) >= MAX_AUTOMATIC_ATTEMPTS;
      });
      if (current && !current.blocked) schedule(config);
      var pending = {
        status: current && current.blocked ? 'BLOCKED' : 'PENDING_RETRY',
        responseId: record.responseId,
        originalErrorCode: record.errorCode,
        compensationErrorCode: normalized.code,
        attempts: current ? Number(current.attempts || 0) : Number(record.attempts || 0)
      };
      DocumentalistasErrors.log('FORM_ERROR_COMPENSATION', pending.status, pending);
      return pending;
    }
  }

  function pending(includeBlocked) {
    return readQueue(PropertiesService.getScriptProperties()).filter(function (item) {
      return includeBlocked || !item.blocked;
    });
  }

  function runBatch(event) {
    var config = DocumentalistasConfig.get();
    DocumentalistasWorkflow.acknowledgeScheduledTrigger(event, TRIGGER_KEY);
    var includeBlocked = !event;
    var batch = pending(includeBlocked).slice(0, Number(config.ERROR_COMPENSATION_BATCH_SIZE || 3));
    var results = batch.map(function (item) { return processOne(item.responseId, includeBlocked); });
    if (pending(false).length) schedule(config);
    return { status: 'COMPLETED', attempted: results.length, results: results, remaining: pending(true).length };
  }

  function diagnose() {
    return readQueue(PropertiesService.getScriptProperties()).map(function (item) {
      return {
        responseReference: '…' + String(item.responseId).slice(-8),
        errorCode: item.errorCode,
        sourceRow: Number(item.sourceRow || 0),
        notificationSent: item.notificationSent === true,
        attempts: Number(item.attempts || 0),
        blocked: item.blocked === true,
        lastFailureCode: item.lastFailureCode || ''
      };
    });
  }

  return {
    QUEUE_KEY: QUEUE_KEY,
    TRIGGER_KEY: TRIGGER_KEY,
    clientMessage: clientMessage,
    readQueue: readQueue,
    writeQueue: writeQueue,
    enqueue: enqueue,
    findSourceRow: findSourceRow,
    processOne: processOne,
    pending: pending,
    runBatch: runBatch,
    diagnose: diagnose
  };
})();

function retomarCompensacoesErroDocumentalistas(e) {
  return DocumentalistasErrorCompensation.runBatch(e || null);
}

function diagnosticarCompensacoesErroDocumentalistas() {
  var result = DocumentalistasErrorCompensation.diagnose();
  DocumentalistasErrors.log('FORM_ERROR_COMPENSATION_DIAGNOSTIC', result.length ? 'PENDING' : 'EMPTY', { pending: result });
  return result;
}
