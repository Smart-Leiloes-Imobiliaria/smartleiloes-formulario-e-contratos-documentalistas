var DocumentalistasSpreadsheet = (function () {
  'use strict';

  var EXPECTED_HEADERS = Object.freeze([
    'ID', 'LINK DRIVE', 'CÓDIGO IMÓVEL', 'UF IMÓVEL', 'CIDADE IMÓVEL', 'PROPONENTE',
    'DATA CONTRATAÇÃO', 'DATA PREENCHIMENTO FORMULÁRIO', 'DATA DELEGAÇÃO', 'AGÊNCIA',
    'TIPO CONTRATO', 'PARCEIRO RESPONSÁVEL', 'MODELO ESCOLHIDO', 'DATA INÍCIO ITBI',
    'STATUS ITBI', 'DATA TÉRMINO ITBI', 'OBSERVAÇÕES ITBI', 'DATA INÍCIO TITULARIDADE',
    'STATUS TITULARIDADE', 'DATA TÉRMINO TITULARIDADE', 'OBSERVAÇÕES TITULARIDADE',
    'LOGIN PREFEITURA ITBI/TT', 'DATA INÍCIO CONTRATOS', 'STATUS ESCRITURA PÚBLICA',
    'STATUS CCV', 'STATUS FINANCIAMENTO/FGTS', 'STATUS FGTS À VISTA', 'DATA TÉRMINO CONTRATO',
    'OBSERVAÇÕES CONTRATO', 'STATUS LEILÕES', 'DOCS LEILÃO C/ PROTOCOLO REGISTRO',
    'DATA INÍCIO REGISTRO', 'STATUS REGISTRO', 'DATA INÍCIO PROTOCOLO',
    'Nº PROTOCOLO REGISTRO', 'VENCIMENTO PRENOTAÇÃO REGISTRO', 'DATA TÉRMINO REGISTRO',
    'OBSERVAÇÕES REGISTRO'
  ]);

  function normalizeHeaders(values) {
    return values.map(function (value) { return String(value || '').trim(); });
  }

  function headersMatch(values) {
    var normalized = normalizeHeaders(values);
    return normalized.length >= EXPECTED_HEADERS.length && EXPECTED_HEADERS.every(function (expected, index) {
      return normalized[index] === expected;
    });
  }

  function isExternalFormula(formula) {
    return /^\s*=.*\b(IMPORTRANGE|IMPORTHTML|IMPORTXML|IMPORTDATA|GOOGLEFINANCE)\s*\(/i.test(String(formula || ''));
  }

  function safeSheetName(name) {
    var sanitized = String(name).replace(/[\[\]*?:\\/]/g, ' ').replace(/\s+/g, ' ').trim();
    return sanitized.slice(0, 100) || 'Controle';
  }

  function locateMainSheet(spreadsheet) {
    var candidates = spreadsheet.getSheets().filter(function (sheet) {
      if (sheet.getMaxColumns() < EXPECTED_HEADERS.length) return false;
      return headersMatch(sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).getDisplayValues()[0]);
    });
    if (candidates.length !== 1) {
      DocumentalistasErrors.fail('SPREADSHEET_TEMPLATE_INVALID', 'A planilha modelo deve possuir exatamente uma aba com os 38 cabeçalhos esperados.', { matches: candidates.length });
    }
    return candidates[0];
  }

  function clearHistoryPreservingStructure(sheet) {
    var rows = Math.max(0, sheet.getMaxRows() - 1);
    if (!rows) return;
    var range = sheet.getRange(2, 1, rows, EXPECTED_HEADERS.length);
    var formulas = range.getFormulas();
    formulas = formulas.map(function (row) {
      return row.map(function (formula) { return isExternalFormula(formula) ? '' : formula; });
    });
    range.clearContent();
    range.setFormulas(formulas);
  }

  function disableExternalImports(spreadsheet) {
    var disabled = [];
    spreadsheet.getSheets().forEach(function (sheet) {
      var range = sheet.getDataRange();
      var formulas = range.getFormulas();
      formulas.forEach(function (row, rowIndex) {
        row.forEach(function (formula, columnIndex) {
          if (isExternalFormula(formula)) {
            sheet.getRange(rowIndex + 1, columnIndex + 1).clearContent();
            disabled.push(sheet.getName() + '!' + sheet.getRange(rowIndex + 1, columnIndex + 1).getA1Notation());
          }
        });
      });
    });
    return disabled;
  }

  function personalizePartnerValidation(sheet, displayName) {
    var partnerColumn = EXPECTED_HEADERS.indexOf('PARCEIRO RESPONSÁVEL') + 1;
    var rowCount = Math.max(1, sheet.getMaxRows() - 1);
    var validation = SpreadsheetApp.newDataValidation()
      .requireValueInList([displayName], true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, partnerColumn, rowCount, 1).setDataValidation(validation);
  }

  function prepareCopy(fileId, input, config) {
    var spreadsheet = SpreadsheetApp.openById(fileId);
    spreadsheet.setSpreadsheetLocale(config.SPREADSHEET_LOCALE);
    spreadsheet.setSpreadsheetTimeZone(config.TIME_ZONE);
    var main = locateMainSheet(spreadsheet);
    clearHistoryPreservingStructure(main);
    disableExternalImports(spreadsheet);
    main.getRange(1, 1, 1, EXPECTED_HEADERS.length).setValues([EXPECTED_HEADERS.slice()]);
    main.hideColumns(1);
    personalizePartnerValidation(main, input.identity.displayName);
    assertNoBrokenValidationDependencies(spreadsheet, main);
    main.setName(safeSheetName(DocumentalistasDrive.renderName(config.SPREADSHEET_NAME_PATTERN, input.identity)));
    SpreadsheetApp.flush();
    verifyPrepared(spreadsheet, main);
    return { spreadsheet: spreadsheet, mainSheet: main };
  }

  function assertNoBrokenValidationDependencies(spreadsheet, main) {
    var dataSheet = spreadsheet.getSheetByName('data');
    if (!dataSheet) return;
    var issues = [];
    var validations = main.getRange(2, 1, Math.max(1, main.getMaxRows() - 1), EXPECTED_HEADERS.length).getDataValidations();
    validations.forEach(function (row, rowIndex) {
      row.forEach(function (validation, columnIndex) {
        if (!validation || validation.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) return;
        var args = validation.getCriteriaValues();
        var sourceRange = args && args[0];
        if (sourceRange && sourceRange.getSheet().getSheetId() === dataSheet.getSheetId() && dataSheet.getLastRow() === 0) {
          issues.push(main.getRange(rowIndex + 2, columnIndex + 1).getA1Notation());
        }
      });
    });
    if (issues.length) {
      DocumentalistasErrors.fail('UNRESOLVED_SPREADSHEET_DEPENDENCY', 'A importação externa foi desativada, mas ainda existem validações indispensáveis dependentes da aba data.', { cells: issues.slice(0, 20) });
    }
  }

  function verifyPrepared(spreadsheet, main) {
    if (spreadsheet.getSpreadsheetLocale() !== 'pt_BR') {
      DocumentalistasErrors.fail('SPREADSHEET_LOCALE_INVALID', 'A cópia não ficou configurada com localidade pt_BR.');
    }
    if (spreadsheet.getSpreadsheetTimeZone() !== 'America/Sao_Paulo') {
      DocumentalistasErrors.fail('SPREADSHEET_TIMEZONE_INVALID', 'A cópia não ficou configurada com fuso America/Sao_Paulo.');
    }
    if (!headersMatch(main.getRange(1, 1, 1, EXPECTED_HEADERS.length).getDisplayValues()[0])) {
      DocumentalistasErrors.fail('SPREADSHEET_HEADERS_INVALID', 'Os cabeçalhos da cópia não correspondem ao contrato de 38 colunas.');
    }
    var formulas = [];
    spreadsheet.getSheets().forEach(function (sheet) {
      sheet.getDataRange().getFormulas().forEach(function (row) { formulas = formulas.concat(row.filter(Boolean)); });
    });
    if (formulas.some(isExternalFormula)) {
      DocumentalistasErrors.fail('EXTERNAL_IMPORT_REMAINS', 'A cópia ainda contém fórmula de importação externa.');
    }
    if (main.getLastRow() > 1) {
      var historyRange = main.getRange(2, 1, main.getLastRow() - 1, EXPECTED_HEADERS.length);
      var values = historyRange.getDisplayValues();
      var formulas = historyRange.getFormulas();
      var hasLiteralHistory = values.some(function (row, rowIndex) {
        return row.some(function (value, columnIndex) { return value !== '' && formulas[rowIndex][columnIndex] === ''; });
      });
      if (hasLiteralHistory) DocumentalistasErrors.fail('SPREADSHEET_HISTORY_REMAINS', 'A cópia ainda contém registros operacionais do exemplo.');
    }
  }

  function ensure(input, folderId, config, context) {
    var name = DocumentalistasDrive.renderName(config.SPREADSHEET_NAME_PATTERN, input.identity);
    var filters = { sl_kind: 'documentalista_control_sheet', sl_identity: input.identityKey };
    var found = DocumentalistasDrive.selectUnique(DocumentalistasDrive.directChildren(folderId, context, {
      mimeType: DocumentalistasDrive.SHEET_MIME,
      appProperties: filters
    }), 'SPREADSHEET_CONFLICT', 'planilha de controle identificada');
    if (!found) {
      found = DocumentalistasDrive.selectUnique(DocumentalistasDrive.directChildren(folderId, context, {
        mimeType: DocumentalistasDrive.SHEET_MIME,
        name: name
      }), 'SPREADSHEET_CONFLICT', 'planilha de controle legada');
      if (found) DocumentalistasDrive.mergeAppProperties(found.id, filters);
    }
    if (!found) {
      try {
        found = DocumentalistasDrive.copyFile(config.SPREADSHEET_TEMPLATE_ID, name, folderId, filters);
      } catch (error) {
        found = DocumentalistasDrive.selectUnique(DocumentalistasDrive.directChildren(folderId, context, {
          mimeType: DocumentalistasDrive.SHEET_MIME,
          appProperties: filters
        }), 'SPREADSHEET_CONFLICT', 'planilha criada com resultado incerto');
        if (!found) throw error;
      }
      prepareCopy(found.id, input, config);
    }
    DocumentalistasDrive.verifyParent(found.id, folderId);
    return found;
  }

  return {
    EXPECTED_HEADERS: EXPECTED_HEADERS,
    normalizeHeaders: normalizeHeaders,
    headersMatch: headersMatch,
    isExternalFormula: isExternalFormula,
    safeSheetName: safeSheetName,
    locateMainSheet: locateMainSheet,
    clearHistoryPreservingStructure: clearHistoryPreservingStructure,
    disableExternalImports: disableExternalImports,
    personalizePartnerValidation: personalizePartnerValidation,
    assertNoBrokenValidationDependencies: assertNoBrokenValidationDependencies,
    prepareCopy: prepareCopy,
    verifyPrepared: verifyPrepared,
    ensure: ensure
  };
})();
