var DocumentalistasConfig = (function () {
  'use strict';

  var DEFAULTS = Object.freeze({
    FORM_ID: '1909wHJxDC5b4s2HXO3sd1t2Iydh7PpQRDQ1hzetoneM',
    ROOT_FOLDER_ID: '1W2jIPu6AUnl4-sqa3pj-GXICVREZUUN_',
    SPREADSHEET_TEMPLATE_ID: '1sSyzjTU19x4-SIMf1uR1c0-FY3KOJ2c__fa2mtlpBA0',
    RESPONSE_SPREADSHEET_ID: '18xtCdLKVk-WKcenh6bR468P4yeHXCpAtbHHo_521qN4',
    RESPONSE_SHEET_ID: '1808239713',
    CONTRACT_TEMPLATE_SOURCE_ID: '1XDy6dUHsLWguDPyo7iCku-CDsrC3gWIf',
    CONTRACT_TEMPLATE_DOC_ID: '1VnfGOuNcz7aSszUYN4MEV_hzT61MUmlvfxcL59Y_ejA',
    CONTRACT_TEMPLATE_HASH: 'c30e7d366613160015f8669dedc2ef92cfdcda9d6e802f2755f1de92aaf92579',
    CONTRACT_TEMPLATE_VERSION: 'definitivo-2026-09-v1',
    CONTRACT_TEMPLATE_PJ_SOURCE_ID: '1XDy6dUHsLWguDPyo7iCku-CDsrC3gWIf',
    CONTRACT_TEMPLATE_PJ_DOC_ID: '1VnfGOuNcz7aSszUYN4MEV_hzT61MUmlvfxcL59Y_ejA',
    CONTRACT_TEMPLATE_PJ_HASH: 'c30e7d366613160015f8669dedc2ef92cfdcda9d6e802f2755f1de92aaf92579',
    CONTRACT_TEMPLATE_PJ_VERSION: 'definitivo-2026-09-v1',
    CONTRACT_TEMPLATE_PF_SOURCE_ID: '1QtA0OKeIfxbcJnF94r8j-NBUVHC94r4b',
    CONTRACT_TEMPLATE_PF_DOC_ID: '1-BcACwxT_5-HbLP0xzB8lmf_w01FOWiAk87CPb88XO0',
    CONTRACT_TEMPLATE_PF_HASH: '9652eac539e89ea1fb3db20076ef85564ad2dcd0ecc7bfdacaadc4168d81b0ce',
    CONTRACT_TEMPLATE_PF_VERSION: 'definitivo-pf-2026-09-v1',
    TECHNICAL_FOLDER_ID: '1MMA02xssPtHOed0kWC4qpSvQl5I675vy',
    TIME_ZONE: 'America/Sao_Paulo',
    SPREADSHEET_LOCALE: 'pt_BR',
    SIGNATURE_LOCATION: 'NOVA LIMA/MG',
    FOLDER_NAME_PATTERN: '{{nomeCompletoDocumentalista}}, ({{cpfCnpjDocumentalista}})',
    CONTRACT_NAME_PATTERN: 'Contrato - {{nomeCompletoDocumentalista}}.docx',
    SPREADSHEET_NAME_PATTERN: 'Planilha de Controle - {{nomeCompletoDocumentalista}}',
    CONTRACT_OUTPUT_FORMAT: 'DOCX',
    LOCK_WAIT_MS: '30000',
    TECHNICAL_FOLDER_NAME: '._automacao_documentalistas',
    REGISTRY_FILE_NAME: 'Registro de Processamento - Documentalistas',
    RETRY_HANDLER: 'retomarFilaPendenteDocumentalistas',
    HISTORICAL_IMPORT_HANDLER: 'retomarImportacaoHistoricaDocumentalistas',
    HISTORICAL_RETRY_HANDLER: 'retomarFilaHistoricaDocumentalistas',
    HISTORICAL_IMPORT_BATCH_SIZE: '10',
    HISTORICAL_RETRY_BATCH_SIZE: '2',
    RETRY_TRIGGER_DELAY_MS: '300000',
    SUBMIT_HANDLER: 'onFormSubmitDocumentalistas'
  });

  var SCRIPT_PROPERTY_KEYS = Object.freeze([
    'FORM_ID',
    'ROOT_FOLDER_ID',
    'SPREADSHEET_TEMPLATE_ID',
    'RESPONSE_SPREADSHEET_ID',
    'RESPONSE_SHEET_ID',
    'TIME_ZONE',
    'SPREADSHEET_LOCALE',
    'SIGNATURE_LOCATION',
    'FOLDER_NAME_PATTERN',
    'CONTRACT_NAME_PATTERN',
    'SPREADSHEET_NAME_PATTERN',
    'CONTRACT_OUTPUT_FORMAT',
    'CONTRACT_TEMPLATE_DOC_ID',
    'CONTRACT_TEMPLATE_SOURCE_ID',
    'CONTRACT_TEMPLATE_HASH',
    'CONTRACT_TEMPLATE_VERSION',
    'CONTRACT_TEMPLATE_PJ_DOC_ID',
    'CONTRACT_TEMPLATE_PJ_SOURCE_ID',
    'CONTRACT_TEMPLATE_PJ_HASH',
    'CONTRACT_TEMPLATE_PJ_VERSION',
    'CONTRACT_TEMPLATE_PF_DOC_ID',
    'CONTRACT_TEMPLATE_PF_SOURCE_ID',
    'CONTRACT_TEMPLATE_PF_HASH',
    'CONTRACT_TEMPLATE_PF_VERSION',
    'TECHNICAL_FOLDER_ID',
    'REGISTRY_SPREADSHEET_ID',
    'ACTIVATION_START_ISO',
    'HISTORICAL_IMPORT_START_ROW',
    'HISTORICAL_IMPORT_END_ROW',
    'HISTORICAL_IMPORT_NEXT_ROW',
    'INTEGRATION_TEST_WRITES_ENABLED'
  ]);

  function get() {
    var properties = PropertiesService.getScriptProperties().getProperties();
    var config = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      config[key] = properties[key] || DEFAULTS[key];
    });
    SCRIPT_PROPERTY_KEYS.forEach(function (key) {
      if (properties[key] !== undefined && properties[key] !== '') {
        config[key] = properties[key];
      }
    });
    config.LOCK_WAIT_MS = Number(config.LOCK_WAIT_MS || DEFAULTS.LOCK_WAIT_MS);
    return config;
  }

  function setNonDestructive(values) {
    var accepted = {};
    Object.keys(values || {}).forEach(function (key) {
      if (SCRIPT_PROPERTY_KEYS.indexOf(key) >= 0 && values[key] !== undefined && values[key] !== null) {
        accepted[key] = String(values[key]);
      }
    });
    PropertiesService.getScriptProperties().setProperties(accepted, false);
    return accepted;
  }

  return {
    DEFAULTS: DEFAULTS,
    SCRIPT_PROPERTY_KEYS: SCRIPT_PROPERTY_KEYS,
    get: get,
    setNonDestructive: setNonDestructive
  };
})();
