var DocumentalistasConfig = (function () {
  'use strict';

  var DEFAULTS = Object.freeze({
    FORM_ID: '1909wHJxDC5b4s2HXO3sd1t2Iydh7PpQRDQ1hzetoneM',
    ROOT_FOLDER_ID: '1W2jIPu6AUnl4-sqa3pj-GXICVREZUUN_',
    SPREADSHEET_TEMPLATE_ID: '1sSyzjTU19x4-SIMf1uR1c0-FY3KOJ2c__fa2mtlpBA0',
    RESPONSE_SPREADSHEET_ID: '18xtCdLKVk-WKcenh6bR468P4yeHXCpAtbHHo_521qN4',
    RESPONSE_SHEET_ID: '1808239713',
    CONTRACT_TEMPLATE_SOURCE_ID: '1EtMxMsg7Snsk6gAxU4hlf61I6G8RjeWF',
    CONTRACT_TEMPLATE_DOC_ID: '17THA8Bt7ALW5YwxjFrjBb8bYNLBSTMIbTnIgQgak-ZI',
    CONTRACT_TEMPLATE_HASH: '53e5651b5deaefc76b3782ad4aae751f80eb9ca47e563cb1a1827238727ac7c8',
    CONTRACT_TEMPLATE_VERSION: 'definitivo-2026-09-v2',
    CONTRACT_TEMPLATE_PJ_SOURCE_ID: '1EtMxMsg7Snsk6gAxU4hlf61I6G8RjeWF',
    CONTRACT_TEMPLATE_PJ_DOC_ID: '17THA8Bt7ALW5YwxjFrjBb8bYNLBSTMIbTnIgQgak-ZI',
    CONTRACT_TEMPLATE_PJ_HASH: '53e5651b5deaefc76b3782ad4aae751f80eb9ca47e563cb1a1827238727ac7c8',
    CONTRACT_TEMPLATE_PJ_VERSION: 'definitivo-2026-09-v2',
    CONTRACT_TEMPLATE_PF_SOURCE_ID: '1bpAGivQMzcaBHw83Nf3zDIli3oBeGc6O',
    CONTRACT_TEMPLATE_PF_DOC_ID: '12hB_vh-2dHAvaMo2b-vFw9i23GrPmoHORTLV9T5Wfec',
    CONTRACT_TEMPLATE_PF_HASH: 'e057a5e24a74ed8a491d4c733b04d844d7b0567ba240ecfecd9c43bcb8b7b62e',
    CONTRACT_TEMPLATE_PF_VERSION: 'definitivo-pf-2026-09-v2',
    TECHNICAL_FOLDER_ID: '1MMA02xssPtHOed0kWC4qpSvQl5I675vy',
    TIME_ZONE: 'America/Sao_Paulo',
    SPREADSHEET_LOCALE: 'pt_BR',
    SIGNATURE_LOCATION: 'NOVA LIMA/MG',
    FOLDER_NAME_PATTERN: '{{nomeCompletoDocumentalista}}, ({{cpfCnpjDocumentalista}})',
    CONTRACT_NAME_PATTERN: 'Contrato - {{nomeCompletoDocumentalista}}.docx',
    SPREADSHEET_NAME_PATTERN: 'Planilha de Controle - {{nomeCompletoDocumentalista}}',
    CONTRACT_OUTPUT_FORMAT: 'DOCX',
    LOCK_WAIT_MS: '30000',
    TECHNICAL_FOLDER_NAME: '._automacao_documentalista',
    REGISTRY_FILE_NAME: 'Registro de Processamento - Documentalistas',
    RETRY_HANDLER: 'retomarFilaPendenteDocumentalistas',
    HISTORICAL_IMPORT_HANDLER: 'retomarImportacaoHistoricaDocumentalistas',
    HISTORICAL_RETRY_HANDLER: 'retomarFilaHistoricaDocumentalistas',
    ERROR_COMPENSATION_HANDLER: 'retomarCompensacoesErroDocumentalistas',
    HISTORICAL_IMPORT_BATCH_SIZE: '10',
    HISTORICAL_RETRY_BATCH_SIZE: '2',
    ERROR_COMPENSATION_BATCH_SIZE: '3',
    RETRY_TRIGGER_DELAY_MS: '300000',
    ERROR_COMPENSATION_TRIGGER_DELAY_MS: '300000',
    DOCUMENTALISTAS_CHATAPP_LICENSE_ID: '71521',
    DOCUMENTALISTAS_CHATAPP_MESSENGER_TYPE: 'caWhatsApp',
    DOCUMENTALISTAS_CHATAPP_ERROR_TEMPLATE_ID: '1322926056423441',
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
    'ADMIN_PANEL_ALLOWED_EMAILS',
    'DOCUMENTALISTAS_CHATAPP_LICENSE_ID',
    'DOCUMENTALISTAS_CHATAPP_MESSENGER_TYPE',
    'DOCUMENTALISTAS_CHATAPP_ERROR_TEMPLATE_ID',
    'REGISTRY_SPREADSHEET_ID',
    'ACTIVATION_START_ISO',
    'HISTORICAL_IMPORT_START_ROW',
    'HISTORICAL_IMPORT_END_ROW',
    'HISTORICAL_IMPORT_NEXT_ROW',
    'INTEGRATION_TEST_WRITES_ENABLED'
  ]);

  var LEGACY_TEMPLATE_RELEASES = Object.freeze({
    PJ: Object.freeze({
      sourceId: '1XDy6dUHsLWguDPyo7iCku-CDsrC3gWIf',
      docId: '1VnfGOuNcz7aSszUYN4MEV_hzT61MUmlvfxcL59Y_ejA',
      hash: 'c30e7d366613160015f8669dedc2ef92cfdcda9d6e802f2755f1de92aaf92579',
      version: 'definitivo-2026-09-v1'
    }),
    PF: Object.freeze({
      sourceId: '1QtA0OKeIfxbcJnF94r8j-NBUVHC94r4b',
      docId: '1-BcACwxT_5-HbLP0xzB8lmf_w01FOWiAk87CPb88XO0',
      hash: '9652eac539e89ea1fb3db20076ef85564ad2dcd0ecc7bfdacaadc4168d81b0ce',
      version: 'definitivo-pf-2026-09-v1'
    })
  });

  function releaseMatches(properties, prefix, release) {
    return properties[prefix + '_SOURCE_ID'] === release.sourceId &&
      properties[prefix + '_DOC_ID'] === release.docId &&
      properties[prefix + '_HASH'] === release.hash &&
      properties[prefix + '_VERSION'] === release.version;
  }

  function migrateOfficialTemplateRelease(properties) {
    var updates = {};
    ['PF', 'PJ'].forEach(function (entityType) {
      var prefix = 'CONTRACT_TEMPLATE_' + entityType;
      if (!releaseMatches(properties, prefix, LEGACY_TEMPLATE_RELEASES[entityType])) return;
      updates[prefix + '_SOURCE_ID'] = DEFAULTS[prefix + '_SOURCE_ID'];
      updates[prefix + '_DOC_ID'] = DEFAULTS[prefix + '_DOC_ID'];
      updates[prefix + '_HASH'] = DEFAULTS[prefix + '_HASH'];
      updates[prefix + '_VERSION'] = DEFAULTS[prefix + '_VERSION'];
    });
    if (releaseMatches(properties, 'CONTRACT_TEMPLATE', LEGACY_TEMPLATE_RELEASES.PJ)) {
      updates.CONTRACT_TEMPLATE_SOURCE_ID = DEFAULTS.CONTRACT_TEMPLATE_SOURCE_ID;
      updates.CONTRACT_TEMPLATE_DOC_ID = DEFAULTS.CONTRACT_TEMPLATE_DOC_ID;
      updates.CONTRACT_TEMPLATE_HASH = DEFAULTS.CONTRACT_TEMPLATE_HASH;
      updates.CONTRACT_TEMPLATE_VERSION = DEFAULTS.CONTRACT_TEMPLATE_VERSION;
    }
    if (Object.keys(updates).length) {
      PropertiesService.getScriptProperties().setProperties(updates, false);
      Object.keys(updates).forEach(function (key) { properties[key] = updates[key]; });
    }
    return properties;
  }

  function get() {
    var properties = migrateOfficialTemplateRelease(PropertiesService.getScriptProperties().getProperties());
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
    LEGACY_TEMPLATE_RELEASES: LEGACY_TEMPLATE_RELEASES,
    SCRIPT_PROPERTY_KEYS: SCRIPT_PROPERTY_KEYS,
    get: get,
    migrateOfficialTemplateRelease: migrateOfficialTemplateRelease,
    setNonDestructive: setNonDestructive
  };
})();
