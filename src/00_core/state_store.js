var DocumentalistasState = (function () {
  'use strict';

  var HEADERS = Object.freeze([
    'identityKey', 'documentType', 'maskedDocument', 'displayName', 'fingerprint',
    'responseIdsJson', 'latestResponseId', 'submittedAt', 'emissionDateIso',
    'templateVersion', 'templateHash', 'templateSourceId', 'templateDocId', 'folderId', 'spreadsheetId', 'contractId',
    'stage', 'status', 'lastErrorCode', 'lastErrorMessage', 'conflictFingerprint',
    'createdAt', 'updatedAt'
  ]);

  function ensureRegistry(config, context) {
    var technical = DocumentalistasDrive.ensureTechnicalFolder(config, context);
    var file;
    if (config.REGISTRY_SPREADSHEET_ID) {
      file = DocumentalistasDrive.getFile(config.REGISTRY_SPREADSHEET_ID);
      if (file.mimeType !== DocumentalistasDrive.SHEET_MIME || file.trashed || (file.parents || []).indexOf(technical.id) < 0) {
        DocumentalistasErrors.fail('INVALID_REGISTRY', 'REGISTRY_SPREADSHEET_ID não é uma planilha ativa dentro da pasta técnica.');
      }
    } else {
      file = DocumentalistasDrive.selectUnique(DocumentalistasDrive.directChildren(technical.id, context, {
        mimeType: DocumentalistasDrive.SHEET_MIME,
        appProperties: { sl_kind: 'documentalistas_registry' }
      }), 'REGISTRY_CONFLICT', 'registro persistente de processamento');
      if (!file) {
        file = Drive.Files.create({
          name: config.REGISTRY_FILE_NAME,
          mimeType: DocumentalistasDrive.SHEET_MIME,
          parents: [technical.id],
          properties: { sl_kind: 'documentalistas_registry' },
          appProperties: { sl_kind: 'documentalistas_registry' }
        }, null, { supportsAllDrives: true, fields: 'id,name,mimeType,parents,properties,appProperties' });
      }
      DocumentalistasConfig.setNonDestructive({ REGISTRY_SPREADSHEET_ID: file.id });
    }
    DocumentalistasDrive.verifyParent(file.id, technical.id);
    var spreadsheet = SpreadsheetApp.openById(file.id);
    spreadsheet.setSpreadsheetLocale(config.SPREADSHEET_LOCALE);
    spreadsheet.setSpreadsheetTimeZone(config.TIME_ZONE);
    var sheet = spreadsheet.getSheets()[0];
    if (sheet.getName() !== 'processamentos') sheet.setName('processamentos');
    var currentHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0];
    if (currentHeaders.every(function (value) { return !value; })) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS.slice()]);
      sheet.setFrozenRows(1);
    } else if (!headersEqual(currentHeaders, HEADERS)) {
      DocumentalistasErrors.fail('REGISTRY_SCHEMA_MISMATCH', 'O registro persistente possui cabeçalhos incompatíveis.');
    }
    return { file: file, spreadsheet: spreadsheet, sheet: sheet };
  }

  function headersEqual(actual, expected) {
    return expected.every(function (value, index) { return String(actual[index] || '').trim() === value; });
  }

  function fromRow(row, rowNumber) {
    var state = { rowNumber: rowNumber };
    HEADERS.forEach(function (header, index) { state[header] = row[index] === undefined ? '' : row[index]; });
    try { state.responseIds = JSON.parse(state.responseIdsJson || '[]'); } catch (error) { state.responseIds = []; }
    return state;
  }

  function all(store) {
    var lastRow = store.sheet.getLastRow();
    if (lastRow < 2) return [];
    return store.sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getDisplayValues().map(function (row, index) {
      return fromRow(row, index + 2);
    });
  }

  function findByIdentity(store, identityKey) {
    return all(store).filter(function (state) { return state.identityKey === identityKey; })[0] || null;
  }

  function findByResponseId(store, responseId) {
    return all(store).filter(function (state) { return (state.responseIds || []).indexOf(String(responseId)) >= 0; })[0] || null;
  }

  function save(store, state) {
    var now = new Date().toISOString();
    if (!state.createdAt) state.createdAt = now;
    state.updatedAt = now;
    state.responseIds = uniqueStrings(state.responseIds || []);
    state.responseIdsJson = JSON.stringify(state.responseIds);
    var row = HEADERS.map(function (header) { return state[header] === undefined || state[header] === null ? '' : state[header]; });
    if (state.rowNumber) {
      store.sheet.getRange(state.rowNumber, 1, 1, HEADERS.length).setValues([row]);
    } else {
      store.sheet.appendRow(row);
      state.rowNumber = store.sheet.getLastRow();
    }
    SpreadsheetApp.flush();
    return state;
  }

  function remove(store, state) {
    if (!state || !state.rowNumber) return false;
    store.sheet.deleteRow(Number(state.rowNumber));
    SpreadsheetApp.flush();
    return true;
  }

  function uniqueStrings(values) {
    var seen = {};
    return values.map(String).filter(function (value) {
      if (seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function createInitial(input) {
    return {
      identityKey: input.identityKey,
      documentType: input.identity.documentType,
      maskedDocument: DocumentalistasErrors.maskDocument(input.identity.canonicalDocument),
      displayName: input.identity.displayName,
      fingerprint: input.fingerprint,
      responseIds: [input.responseId],
      latestResponseId: input.responseId,
      submittedAt: input.submittedAt,
      emissionDateIso: '',
      templateVersion: '',
      templateHash: '',
      templateSourceId: '',
      templateDocId: '',
      folderId: '',
      spreadsheetId: '',
      contractId: '',
      stage: 'RECEIVED',
      status: 'PROCESSING',
      lastErrorCode: '',
      lastErrorMessage: '',
      conflictFingerprint: ''
    };
  }

  return {
    HEADERS: HEADERS,
    ensureRegistry: ensureRegistry,
    headersEqual: headersEqual,
    all: all,
    findByIdentity: findByIdentity,
    findByResponseId: findByResponseId,
    save: save,
    remove: remove,
    createInitial: createInitial,
    uniqueStrings: uniqueStrings
  };
})();
