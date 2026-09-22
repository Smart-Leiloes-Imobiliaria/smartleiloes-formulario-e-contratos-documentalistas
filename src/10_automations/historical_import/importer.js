var DocumentalistasHistoricalImport = (function () {
  'use strict';

  var LOG_HEADERS = Object.freeze([
    'sourceKey', 'sourceSpreadsheetId', 'sourceSheetId', 'sourceRow', 'syntheticResponseId',
    'status', 'identityKey', 'resultStatus', 'errorCode', 'errorMessage', 'processedAt'
  ]);
  var TIMESTAMP_HEADERS = Object.freeze(['CARIMBO DE DATA/HORA', 'TIMESTAMP']);

  function normalizeHeader(value) {
    return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR').replace(/:$/, '');
  }

  function aliasesFor(definition) {
    return [definition.title].concat(definition.sheetAliases || []).map(normalizeHeader);
  }

  function buildColumnMap(headers) {
    var normalized = headers.map(normalizeHeader);
    var timestampIndex = -1;
    TIMESTAMP_HEADERS.some(function (header) {
      timestampIndex = normalized.indexOf(header);
      return timestampIndex >= 0;
    });
    if (timestampIndex < 0) DocumentalistasErrors.fail('HISTORICAL_TIMESTAMP_COLUMN_MISSING', 'A planilha vinculada não possui a coluna de timestamp do Forms.');
    var columnsByItemId = {};
    DocumentalistasFields.MAP.forEach(function (definition) {
      var aliases = aliasesFor(definition);
      columnsByItemId[String(definition.itemId)] = normalized.map(function (header, index) {
        return aliases.indexOf(header) >= 0 ? index : -1;
      }).filter(function (index) { return index >= 0; });
    });
    return { timestampIndex: timestampIndex, columnsByItemId: columnsByItemId, normalizedHeaders: normalized };
  }

  function isBlank(value) {
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
  }

  function selectValue(definition, indexes, row, entityType, headers) {
    var candidates = indexes.map(function (index) { return { index: index, value: row[index], header: normalizeHeader(headers[index]) }; })
      .filter(function (candidate) { return !isBlank(candidate.value); });
    if (!candidates.length) return '';
    if (definition.domain === 'nomeContato') {
      if (entityType === 'PJ') {
        var representative = candidates.filter(function (candidate) { return candidate.header === 'NOME COMPLETO DO REPRESENTANTE'; });
        if (representative.length) return representative[representative.length - 1].value;
      }
      return candidates[candidates.length - 1].value;
    }
    var distinct = [];
    candidates.forEach(function (candidate) {
      var comparable = String(candidate.value).normalize('NFC').trim();
      if (distinct.indexOf(comparable) < 0) distinct.push(comparable);
    });
    if (distinct.length > 1) {
      DocumentalistasErrors.fail('AMBIGUOUS_HISTORICAL_VALUE', 'Mais de uma coluna histórica contém valores diferentes para o mesmo campo.', { domain: definition.domain });
    }
    return candidates[candidates.length - 1].value;
  }

  function rowToRaw(headers, row, rowNumber, config) {
    var map = buildColumnMap(headers);
    var typeDefinition = DocumentalistasFields.byItemId()['151260162'];
    var typeValue = selectValue(typeDefinition, map.columnsByItemId['151260162'] || [], row, '', headers);
    var normalizedType = DocumentalistasNormalize.normalize(typeValue, typeDefinition.normalizer);
    var answers = {};
    DocumentalistasFields.MAP.forEach(function (definition) {
      answers[String(definition.itemId)] = selectValue(definition, map.columnsByItemId[String(definition.itemId)] || [], row, normalizedType.canonical, headers);
    });
    var timestamp = row[map.timestampIndex];
    var submittedAt = timestamp instanceof Date ? timestamp : new Date(timestamp);
    var syntheticId = 'sheet:' + config.RESPONSE_SPREADSHEET_ID + ':' + config.RESPONSE_SHEET_ID + ':row:' + rowNumber;
    return { formId: config.FORM_ID, responseId: syntheticId, submittedAt: submittedAt, answersByItemId: answers };
  }

  function getSource(config) {
    var spreadsheet;
    try { spreadsheet = SpreadsheetApp.openById(config.RESPONSE_SPREADSHEET_ID); }
    catch (error) { DocumentalistasErrors.fail('RESPONSE_SPREADSHEET_ACCESS_DENIED', 'A conta executora não consegue abrir a planilha vinculada ao formulário.', { cause: error.message }); }
    var sheet = spreadsheet.getSheetById(Number(config.RESPONSE_SHEET_ID));
    if (!sheet) DocumentalistasErrors.fail('RESPONSE_SHEET_NOT_FOUND', 'A aba configurada pelo gid não foi encontrada na planilha de respostas.');
    var lastColumn = sheet.getLastColumn();
    if (lastColumn < 2) DocumentalistasErrors.fail('RESPONSE_SHEET_EMPTY_SCHEMA', 'A aba de respostas ainda não possui cabeçalhos utilizáveis.');
    var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    var map = buildColumnMap(headers);
    var missingHeaders = DocumentalistasFields.MAP.filter(function (definition) {
      return !(map.columnsByItemId[String(definition.itemId)] || []).length;
    }).map(function (definition) { return definition.title; });
    if (missingHeaders.length) DocumentalistasErrors.fail('HISTORICAL_HEADERS_INCOMPATIBLE', 'A planilha vinculada não contém todos os campos atuais necessários.', { missingHeaders: missingHeaders });
    return { spreadsheet: spreadsheet, sheet: sheet, headers: headers, lastRow: sheet.getLastRow(), lastColumn: lastColumn };
  }

  function ensureLogSheet(store) {
    var sheet = store.spreadsheet.getSheetByName('importacoes_historicas');
    if (!sheet) sheet = store.spreadsheet.insertSheet('importacoes_historicas');
    var current = sheet.getRange(1, 1, 1, LOG_HEADERS.length).getDisplayValues()[0];
    if (current.every(function (value) { return !value; })) {
      sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS.slice()]);
      sheet.setFrozenRows(1);
    } else if (!DocumentalistasState.headersEqual(current, LOG_HEADERS)) {
      DocumentalistasErrors.fail('HISTORICAL_LOG_SCHEMA_MISMATCH', 'O log persistente da importação histórica possui cabeçalhos incompatíveis.');
    }
    return sheet;
  }

  function findLogRow(sheet, sourceKey) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    var values = sheet.getRange(2, 1, lastRow - 1, LOG_HEADERS.length).getDisplayValues();
    for (var index = 0; index < values.length; index++) if (values[index][0] === sourceKey) return { rowNumber: index + 2, values: values[index] };
    return null;
  }

  function saveLog(sheet, record) {
    var existing = findLogRow(sheet, record.sourceKey);
    var row = LOG_HEADERS.map(function (header) { return record[header] || ''; });
    if (existing) sheet.getRange(existing.rowNumber, 1, 1, LOG_HEADERS.length).setValues([row]);
    else sheet.appendRow(row);
  }

  function schedule(config, ignoredTriggerUid) {
    return DocumentalistasWorkflow.ensureTimeTrigger(config.HISTORICAL_IMPORT_HANDLER, 60 * 1000, 'HISTORICAL_IMPORT_TRIGGER_UID');
  }

  function snapshotActivation() {
    var config = DocumentalistasConfig.get();
    var source = getSource(config);
    var properties = PropertiesService.getScriptProperties();
    var values = {};
    if (!properties.getProperty('ACTIVATION_START_ISO')) values.ACTIVATION_START_ISO = new Date().toISOString();
    if (!properties.getProperty('HISTORICAL_IMPORT_START_ROW')) values.HISTORICAL_IMPORT_START_ROW = '2';
    if (!properties.getProperty('HISTORICAL_IMPORT_END_ROW')) values.HISTORICAL_IMPORT_END_ROW = String(source.lastRow);
    if (!properties.getProperty('HISTORICAL_IMPORT_NEXT_ROW')) values.HISTORICAL_IMPORT_NEXT_ROW = values.HISTORICAL_IMPORT_START_ROW || properties.getProperty('HISTORICAL_IMPORT_START_ROW') || '2';
    DocumentalistasConfig.setNonDestructive(values);
    config = DocumentalistasConfig.get();
    var start = Number(config.HISTORICAL_IMPORT_START_ROW || 2);
    var end = Number(config.HISTORICAL_IMPORT_END_ROW || 1);
    var next = Number(config.HISTORICAL_IMPORT_NEXT_ROW || start);
    if (next <= end) schedule(config, null);
    return { activationStartIso: config.ACTIVATION_START_ISO, startRow: start, endRow: end, nextRow: next, pendingRows: Math.max(0, end - next + 1), sourceSheetTitle: source.sheet.getName() };
  }

  function readCheckpoint() {
    var properties = PropertiesService.getScriptProperties();
    var activationStartIso = properties.getProperty('ACTIVATION_START_ISO');
    var startRow = Number(properties.getProperty('HISTORICAL_IMPORT_START_ROW') || 0);
    var endRow = Number(properties.getProperty('HISTORICAL_IMPORT_END_ROW') || 0);
    var nextRow = Number(properties.getProperty('HISTORICAL_IMPORT_NEXT_ROW') || 0);
    if (!activationStartIso || !startRow || !endRow || !nextRow) {
      DocumentalistasErrors.fail('HISTORICAL_IMPORT_NOT_PREPARED', 'A retomada exige um recorte histórico previamente preparado.');
    }
    if (startRow < 2 || endRow < startRow - 1 || nextRow < startRow || nextRow > endRow + 1) {
      DocumentalistasErrors.fail('HISTORICAL_CHECKPOINT_INVALID', 'Os checkpoints da importação histórica são inconsistentes.', {
        startRow: startRow,
        endRow: endRow,
        nextRow: nextRow
      });
    }
    return { activationStartIso: activationStartIso, startRow: startRow, endRow: endRow, nextRow: nextRow };
  }

  function calculateResume(checkpoint, sourceLastRow) {
    var lastRow = Number(sourceLastRow || 0);
    if (lastRow < checkpoint.startRow - 1) lastRow = checkpoint.startRow - 1;
    var resumedEndRow = Math.max(checkpoint.endRow, lastRow);
    return {
      activationStartIso: checkpoint.activationStartIso,
      startRow: checkpoint.startRow,
      previousEndRow: checkpoint.endRow,
      endRow: resumedEndRow,
      nextRow: checkpoint.nextRow,
      newlyIncludedRows: Math.max(0, resumedEndRow - checkpoint.endRow),
      pendingRows: Math.max(0, resumedEndRow - checkpoint.nextRow + 1)
    };
  }

  function resumeAfterPause() {
    var checkpoint = readCheckpoint();
    var config = DocumentalistasConfig.get();
    var source = getSource(config);
    var result = calculateResume(checkpoint, source.lastRow);
    if (result.endRow !== checkpoint.endRow) {
      DocumentalistasConfig.setNonDestructive({ HISTORICAL_IMPORT_END_ROW: String(result.endRow) });
    }
    if (result.pendingRows) schedule(config, null);
    result.sourceSheetTitle = source.sheet.getName();
    result.scheduled = result.pendingRows > 0;
    return result;
  }

  function runBatch(e) {
    var config = DocumentalistasConfig.get();
    DocumentalistasWorkflow.acknowledgeScheduledTrigger(e, 'HISTORICAL_IMPORT_TRIGGER_UID');
    var start = Number(config.HISTORICAL_IMPORT_START_ROW || 0);
    var end = Number(config.HISTORICAL_IMPORT_END_ROW || 0);
    var next = Number(config.HISTORICAL_IMPORT_NEXT_ROW || start);
    if (!start || !end) DocumentalistasErrors.fail('HISTORICAL_IMPORT_NOT_PREPARED', 'Execute prepararAtivacaoDocumentalistas() antes da importação histórica.');
    if (next > end) return { status: 'COMPLETED', attempted: 0, failed: 0, nextRow: next, endRow: end };
    var source = getSource(config);
    var last = Math.min(end, next + Number(config.HISTORICAL_IMPORT_BATCH_SIZE || 10) - 1);
    var rows = source.sheet.getRange(next, 1, last - next + 1, source.lastColumn).getValues();
    var context = DocumentalistasDrive.driveContext(config.ROOT_FOLDER_ID);
    var store = DocumentalistasState.ensureRegistry(config, context);
    var logSheet = ensureLogSheet(store);
    var failed = 0;
    rows.forEach(function (row, offset) {
      var rowNumber = next + offset;
      var sourceKey = config.RESPONSE_SPREADSHEET_ID + ':' + config.RESPONSE_SHEET_ID + ':' + rowNumber;
      var prior = findLogRow(logSheet, sourceKey);
      if (prior && prior.values[5] === 'COMPLETED') return;
      var record = { sourceKey: sourceKey, sourceSpreadsheetId: config.RESPONSE_SPREADSHEET_ID, sourceSheetId: config.RESPONSE_SHEET_ID, sourceRow: rowNumber, syntheticResponseId: 'sheet:' + config.RESPONSE_SPREADSHEET_ID + ':' + config.RESPONSE_SHEET_ID + ':row:' + rowNumber, processedAt: new Date().toISOString() };
      try {
        var raw = rowToRaw(source.headers, row, rowNumber, config);
        var result = DocumentalistasWorkflow.processRaw(raw, { explicit: true, enqueueOnLockFailure: false });
        record.status = 'COMPLETED'; record.identityKey = result.identityKey; record.resultStatus = result.status;
      } catch (error) {
        var normalized = DocumentalistasErrors.asError(error);
        record.status = 'ERROR'; record.errorCode = normalized.code; record.errorMessage = normalized.message; failed += 1;
      }
      saveLog(logSheet, record);
    });
    PropertiesService.getScriptProperties().setProperty('HISTORICAL_IMPORT_NEXT_ROW', String(last + 1));
    var remaining = Math.max(0, end - last);
    if (remaining) schedule(config, e && e.triggerUid);
    var result = { status: remaining ? 'IN_PROGRESS' : (failed ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED'), attempted: rows.length, failed: failed, nextRow: last + 1, endRow: end, remaining: remaining };
    DocumentalistasErrors.log('HISTORICAL_IMPORT', result.status, result);
    return result;
  }

  function retryRow(rowNumber) {
    var config = DocumentalistasConfig.get();
    var start = Number(config.HISTORICAL_IMPORT_START_ROW || 0);
    var end = Number(config.HISTORICAL_IMPORT_END_ROW || 0);
    rowNumber = Number(rowNumber);
    if (!rowNumber || rowNumber < start || rowNumber > end) DocumentalistasErrors.fail('HISTORICAL_ROW_OUT_OF_RANGE', 'A linha informada está fora do recorte histórico congelado.');
    var activePurge = PropertiesService.getScriptProperties().getProperty('HISTORICAL_PURGE_ACTIVE_JSON');
    if (activePurge) {
      try {
        if (Number(JSON.parse(activePurge).sourceRow) === rowNumber) {
          DocumentalistasErrors.fail('HISTORICAL_ROW_PURGE_IN_PROGRESS', 'A linha está em expurgo administrativo e não pode ser reprocessada.');
        }
      } catch (error) {
        if (error && error.code === 'HISTORICAL_ROW_PURGE_IN_PROGRESS') throw error;
        DocumentalistasErrors.fail('INVALID_HISTORICAL_PURGE_CHECKPOINT', 'O checkpoint do expurgo está inválido; o reprocessamento foi bloqueado por segurança.');
      }
    }
    var source = getSource(config);
    var context = DocumentalistasDrive.driveContext(config.ROOT_FOLDER_ID);
    var store = DocumentalistasState.ensureRegistry(config, context);
    var logSheet = ensureLogSheet(store);
    var sourceKey = config.RESPONSE_SPREADSHEET_ID + ':' + config.RESPONSE_SHEET_ID + ':' + rowNumber;
    var record = {
      sourceKey: sourceKey,
      sourceSpreadsheetId: config.RESPONSE_SPREADSHEET_ID,
      sourceSheetId: config.RESPONSE_SHEET_ID,
      sourceRow: rowNumber,
      syntheticResponseId: 'sheet:' + config.RESPONSE_SPREADSHEET_ID + ':' + config.RESPONSE_SHEET_ID + ':row:' + rowNumber,
      processedAt: new Date().toISOString()
    };
    try {
      var raw = rowToRaw(source.headers, source.sheet.getRange(rowNumber, 1, 1, source.lastColumn).getValues()[0], rowNumber, config);
      var result = DocumentalistasWorkflow.processRaw(raw, { explicit: true, enqueueOnLockFailure: false });
      record.status = 'COMPLETED';
      record.identityKey = result.identityKey;
      record.resultStatus = result.status;
      saveLog(logSheet, record);
      return result;
    } catch (error) {
      var normalized = DocumentalistasErrors.asError(error);
      record.status = 'ERROR';
      record.errorCode = normalized.code;
      record.errorMessage = normalized.message;
      saveLog(logSheet, record);
      throw normalized;
    }
  }

  function errorRowsFromLogValues(values, startRow, endRow) {
    return (values || []).filter(function (row) {
      var sourceRow = Number(row[3]);
      return row[5] === 'ERROR' && sourceRow >= startRow && sourceRow <= endRow;
    }).map(function (row) { return Number(row[3]); }).filter(function (row, index, rows) {
      return rows.indexOf(row) === index;
    }).sort(function (a, b) { return a - b; });
  }

  function retryFailedRows(limit) {
    var config = DocumentalistasConfig.get();
    var checkpoint = readCheckpoint();
    var context = DocumentalistasDrive.driveContext(config.ROOT_FOLDER_ID);
    var store = DocumentalistasState.ensureRegistry(config, context);
    var logSheet = ensureLogSheet(store);
    var lastRow = logSheet.getLastRow();
    var values = lastRow < 2 ? [] : logSheet.getRange(2, 1, lastRow - 1, LOG_HEADERS.length).getDisplayValues();
    var pendingBefore = errorRowsFromLogValues(values, checkpoint.startRow, checkpoint.endRow);
    var selected = pendingBefore.slice(0, Number(limit || 20));
    var succeeded = 0;
    var failed = 0;
    var errors = [];
    selected.forEach(function (rowNumber) {
      try {
        retryRow(rowNumber);
        succeeded += 1;
      } catch (error) {
        var normalized = DocumentalistasErrors.asError(error);
        failed += 1;
        errors.push({ sourceRow: rowNumber, errorCode: normalized.code });
      }
    });
    var remaining = pendingBefore.length - succeeded;
    var result = {
      status: failed ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      attempted: selected.length,
      succeeded: succeeded,
      failed: failed,
      remainingErrorRows: Math.max(0, remaining),
      errors: errors
    };
    DocumentalistasErrors.log('HISTORICAL_ERROR_RETRY', result.status, result);
    return result;
  }

  function parseSelectedRows(value, startRow, endRow, limit) {
    var raw = String(value || '').trim();
    if (!raw) DocumentalistasErrors.fail('MANUAL_HISTORICAL_ROWS_NOT_CONFIGURED', 'Defina MANUAL_HISTORICAL_ROWS com uma lista de linhas separadas por vírgula.');
    var invalid = [];
    var rows = raw.split(',').map(function (part) {
      var normalized = String(part || '').trim();
      if (!/^\d+$/.test(normalized)) {
        invalid.push(normalized || '(vazio)');
        return 0;
      }
      return Number(normalized);
    }).filter(function (row, index, allRows) {
      return row && allRows.indexOf(row) === index;
    }).sort(function (a, b) { return a - b; });
    if (invalid.length) DocumentalistasErrors.fail('INVALID_HISTORICAL_ROW_LIST', 'A lista de linhas históricas contém valores inválidos.', { invalidValues: invalid });
    if (rows.length > Number(limit || 20)) DocumentalistasErrors.fail('HISTORICAL_ROW_LIST_LIMIT_EXCEEDED', 'O lote manual excede o limite permitido.', { selected: rows.length, limit: Number(limit || 20) });
    var outOfRange = rows.filter(function (row) { return row < Number(startRow) || row > Number(endRow); });
    if (outOfRange.length) DocumentalistasErrors.fail('HISTORICAL_ROW_OUT_OF_RANGE', 'Uma ou mais linhas estão fora do recorte histórico congelado.', { rows: outOfRange, startRow: Number(startRow), endRow: Number(endRow) });
    return rows;
  }

  function syntheticResponseId(config, rowNumber) {
    return 'sheet:' + config.RESPONSE_SPREADSHEET_ID + ':' + config.RESPONSE_SHEET_ID + ':row:' + rowNumber;
  }

  function completedHistoricalRows(rows, states, config) {
    var completed = {};
    (states || []).forEach(function (state) {
      if (state.status !== 'COMPLETED' || state.stage !== 'COMPLETED' || !state.folderId || !state.contractId || !state.spreadsheetId) return;
      (state.responseIds || []).forEach(function (responseId) { completed[String(responseId)] = true; });
    });
    return (rows || []).filter(function (rowNumber) { return completed[syntheticResponseId(config, rowNumber)]; });
  }

  function pendingHistoricalRows(rows, states, config) {
    var completed = completedHistoricalRows(rows, states, config);
    return (rows || []).filter(function (rowNumber) { return completed.indexOf(rowNumber) < 0; });
  }

  function parseRetryQueue(properties) {
    try {
      var parsed = JSON.parse(properties.getProperty('HISTORICAL_RETRY_QUEUE_ROWS') || '[]');
      return Array.isArray(parsed) ? parsed.map(Number).filter(function (row) { return row > 0; }) : [];
    } catch (error) {
      return [];
    }
  }

  function saveRetryQueue(properties, rows, mode) {
    if (rows.length) {
      properties.setProperty('HISTORICAL_RETRY_QUEUE_ROWS', JSON.stringify(rows));
      if (mode) properties.setProperty('HISTORICAL_RETRY_QUEUE_MODE', String(mode));
    } else {
      properties.deleteProperty('HISTORICAL_RETRY_QUEUE_ROWS');
      properties.deleteProperty('HISTORICAL_RETRY_QUEUE_MODE');
      properties.deleteProperty('HISTORICAL_RETRY_IN_FLIGHT_ROW');
      properties.deleteProperty('HISTORICAL_RETRY_IN_FLIGHT_AT');
    }
  }

  function removeRetryRow(properties, rowNumber) {
    rowNumber = Number(rowNumber);
    var rows = parseRetryQueue(properties).filter(function (row) { return Number(row) !== rowNumber; });
    saveRetryQueue(properties, rows, properties.getProperty('HISTORICAL_RETRY_QUEUE_MODE'));
    if (Number(properties.getProperty('HISTORICAL_RETRY_IN_FLIGHT_ROW') || 0) === rowNumber) {
      properties.deleteProperty('HISTORICAL_RETRY_IN_FLIGHT_ROW');
      properties.deleteProperty('HISTORICAL_RETRY_IN_FLIGHT_AT');
    }
    return rows;
  }

  function removeLogBySourceKey(logSheet, sourceKey) {
    var existing = findLogRow(logSheet, sourceKey);
    if (!existing) return false;
    logSheet.deleteRow(existing.rowNumber);
    SpreadsheetApp.flush();
    return true;
  }

  function scheduleRetryQueue(config, ignoredTriggerUid) {
    return DocumentalistasWorkflow.ensureTimeTrigger(config.HISTORICAL_RETRY_HANDLER, Number(config.RETRY_TRIGGER_DELAY_MS || 300000), 'HISTORICAL_RETRY_TRIGGER_UID');
  }

  function claimRetryRow() {
    var lock = LockService.getUserLock();
    if (!lock.tryLock(10000)) DocumentalistasErrors.fail('HISTORICAL_QUEUE_LOCK_FAILED', 'Não foi possível acessar a fila histórica com segurança.');
    try {
      var properties = PropertiesService.getScriptProperties();
      var rows = parseRetryQueue(properties);
      if (!rows.length) return null;
      var inFlight = Number(properties.getProperty('HISTORICAL_RETRY_IN_FLIGHT_ROW') || 0);
      var inFlightAt = Number(properties.getProperty('HISTORICAL_RETRY_IN_FLIGHT_AT') || 0);
      if (inFlight && Date.now() - inFlightAt < 7 * 60 * 1000) return { busy: true, rowNumber: inFlight };
      var rowNumber = inFlight && rows.indexOf(inFlight) >= 0 ? inFlight : rows[0];
      properties.setProperty('HISTORICAL_RETRY_IN_FLIGHT_ROW', String(rowNumber));
      properties.setProperty('HISTORICAL_RETRY_IN_FLIGHT_AT', String(Date.now()));
      return { busy: false, rowNumber: rowNumber };
    } finally {
      lock.releaseLock();
    }
  }

  function finishRetryRow(rowNumber, keepQueued) {
    var lock = LockService.getUserLock();
    if (!lock.tryLock(10000)) DocumentalistasErrors.fail('HISTORICAL_QUEUE_LOCK_FAILED', 'Não foi possível atualizar a fila histórica com segurança.');
    try {
      var properties = PropertiesService.getScriptProperties();
      var rows = parseRetryQueue(properties);
      if (!keepQueued) rows = rows.filter(function (row) { return Number(row) !== Number(rowNumber); });
      properties.deleteProperty('HISTORICAL_RETRY_IN_FLIGHT_ROW');
      properties.deleteProperty('HISTORICAL_RETRY_IN_FLIGHT_AT');
      saveRetryQueue(properties, rows, properties.getProperty('HISTORICAL_RETRY_QUEUE_MODE'));
      return rows.length;
    } finally {
      lock.releaseLock();
    }
  }

  function initializeRetryQueue(rows, mode) {
    var config = DocumentalistasConfig.get();
    var context = DocumentalistasDrive.driveContext(config.ROOT_FOLDER_ID);
    var store = DocumentalistasState.ensureRegistry(config, context);
    var pending = pendingHistoricalRows(rows, DocumentalistasState.all(store), config);
    var lock = LockService.getUserLock();
    if (!lock.tryLock(10000)) DocumentalistasErrors.fail('HISTORICAL_QUEUE_LOCK_FAILED', 'Não foi possível inicializar a fila histórica com segurança.');
    try {
      var properties = PropertiesService.getScriptProperties();
      var existing = parseRetryQueue(properties);
      if (existing.length) return { created: false, mode: properties.getProperty('HISTORICAL_RETRY_QUEUE_MODE') || 'UNKNOWN', pendingRows: existing };
      saveRetryQueue(properties, pending, mode);
      return { created: true, mode: mode, pendingRows: pending };
    } finally {
      lock.releaseLock();
    }
  }

  function runRetryQueue(e) {
    var config = DocumentalistasConfig.get();
    DocumentalistasWorkflow.acknowledgeScheduledTrigger(e, 'HISTORICAL_RETRY_TRIGGER_UID');
    var properties = PropertiesService.getScriptProperties();
    var initial = parseRetryQueue(properties);
    var mode = properties.getProperty('HISTORICAL_RETRY_QUEUE_MODE') || 'UNKNOWN';
    if (!initial.length) return { status: 'COMPLETED', mode: mode, attempted: 0, remaining: 0, results: [] };
    scheduleRetryQueue(config, e && e.triggerUid);
    var results = [];
    var batchSize = Number(config.HISTORICAL_RETRY_BATCH_SIZE || 2);
    for (var index = 0; index < batchSize; index++) {
      var claim = claimRetryRow();
      if (!claim) break;
      if (claim.busy) {
        results.push({ sourceRow: claim.rowNumber, status: 'IN_FLIGHT' });
        break;
      }
      try {
        var processed = retryRow(claim.rowNumber);
        finishRetryRow(claim.rowNumber, false);
        results.push({
          sourceRow: claim.rowNumber,
          status: processed.status,
          alreadyProcessed: !!processed.alreadyProcessed,
          folderId: processed.folderId,
          contractId: processed.contractId,
          spreadsheetId: processed.spreadsheetId,
          templateVersion: processed.templateVersion
        });
      } catch (error) {
        var normalized = DocumentalistasErrors.asError(error);
        var retryable = DocumentalistasWorkflow.isRetryableError(normalized);
        finishRetryRow(claim.rowNumber, retryable);
        results.push({ sourceRow: claim.rowNumber, status: retryable ? 'RETRY_SCHEDULED' : 'ERROR', errorCode: normalized.code });
        if (retryable) break;
      }
    }
    var remaining = parseRetryQueue(PropertiesService.getScriptProperties()).length;
    if (remaining) scheduleRetryQueue(config, e && e.triggerUid);
    var failed = results.filter(function (item) { return item.status === 'ERROR'; }).length;
    var result = {
      status: remaining ? 'IN_PROGRESS' : (failed ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED'),
      mode: mode,
      attempted: results.filter(function (item) { return item.status !== 'IN_FLIGHT'; }).length,
      failed: failed,
      remaining: remaining,
      results: results
    };
    DocumentalistasErrors.log('HISTORICAL_RETRY_QUEUE', result.status, result);
    return result;
  }

  function retrySelectedRows(value, limit) {
    var checkpoint = readCheckpoint();
    var selected = parseSelectedRows(value, checkpoint.startRow, checkpoint.endRow, limit || 20);
    var initialized = initializeRetryQueue(selected, 'SELECTED');
    var result = runRetryQueue(null);
    result.queueCreated = initialized.created;
    result.initialPendingRows = initialized.pendingRows;
    return result;
  }

  function retryAllPendingRows() {
    var config = DocumentalistasConfig.get();
    var checkpoint = readCheckpoint();
    var source = getSource(config);
    var endRow = Math.max(checkpoint.endRow, source.lastRow);
    DocumentalistasConfig.setNonDestructive({
      HISTORICAL_IMPORT_END_ROW: String(endRow),
      HISTORICAL_IMPORT_NEXT_ROW: String(endRow + 1)
    });
    var rows = [];
    for (var rowNumber = checkpoint.startRow; rowNumber <= endRow; rowNumber++) rows.push(rowNumber);
    var initialized = initializeRetryQueue(rows, 'ALL_PENDING');
    var result = runRetryQueue(null);
    result.queueCreated = initialized.created;
    result.initialPendingRows = initialized.pendingRows;
    result.endRow = endRow;
    return result;
  }

  function retryQueueStatus() {
    var properties = PropertiesService.getScriptProperties();
    var config = DocumentalistasConfig.get();
    var continuation = DocumentalistasWorkflow.scheduledTriggerStatus(config.HISTORICAL_RETRY_HANDLER, 'HISTORICAL_RETRY_TRIGGER_UID');
    return {
      mode: properties.getProperty('HISTORICAL_RETRY_QUEUE_MODE') || '',
      pendingRows: parseRetryQueue(properties),
      inFlightRow: Number(properties.getProperty('HISTORICAL_RETRY_IN_FLIGHT_ROW') || 0) || null,
      inFlightAt: properties.getProperty('HISTORICAL_RETRY_IN_FLIGHT_AT') || '',
      continuationScheduled: continuation.scheduled
    };
  }

  return {
    LOG_HEADERS: LOG_HEADERS,
    normalizeHeader: normalizeHeader,
    buildColumnMap: buildColumnMap,
    selectValue: selectValue,
    rowToRaw: rowToRaw,
    getSource: getSource,
    readCheckpoint: readCheckpoint,
    calculateResume: calculateResume,
    resumeAfterPause: resumeAfterPause,
    ensureLogSheet: ensureLogSheet,
    snapshotActivation: snapshotActivation,
    runBatch: runBatch,
    retryRow: retryRow,
    errorRowsFromLogValues: errorRowsFromLogValues,
    retryFailedRows: retryFailedRows,
    parseSelectedRows: parseSelectedRows,
    syntheticResponseId: syntheticResponseId,
    completedHistoricalRows: completedHistoricalRows,
    pendingHistoricalRows: pendingHistoricalRows,
    parseRetryQueue: parseRetryQueue,
    removeRetryRow: removeRetryRow,
    removeLogBySourceKey: removeLogBySourceKey,
    initializeRetryQueue: initializeRetryQueue,
    runRetryQueue: runRetryQueue,
    retrySelectedRows: retrySelectedRows,
    retryAllPendingRows: retryAllPendingRows,
    retryQueueStatus: retryQueueStatus,
    scheduleRetryQueue: scheduleRetryQueue,
    schedule: schedule
  };
})();
