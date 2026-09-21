var DocumentalistasChatApp = (function () {
  'use strict';

  var TOKEN_KEYS = Object.freeze({
    accessToken: 'CHATAPP_ACCESS_TOKEN',
    refreshToken: 'CHATAPP_REFRESH_TOKEN',
    accessTokenExpiresAt: 'CHATAPP_TOKEN_EXPIRES_AT',
    refreshTokenExpiresAt: 'CHATAPP_REFRESH_EXPIRES_AT'
  });

  function assertLibrary() {
    if (typeof SmartChatApp === 'undefined' || !SmartChatApp || typeof SmartChatApp.fromPropertyMap !== 'function') {
      DocumentalistasErrors.fail('CHATAPP_LIBRARY_UNAVAILABLE', 'A biblioteca SmartChatApp versão 6 não está disponível no projeto Apps Script.');
    }
  }

  function createClient(properties) {
    assertLibrary();
    var values = properties || PropertiesService.getScriptProperties().getProperties();
    return SmartChatApp.fromPropertyMap(values, { usePropertyStore: false });
  }

  function persistTokenState(client, propertyStore) {
    var state = client.getTokenState();
    var values = {};
    Object.keys(TOKEN_KEYS).forEach(function (stateKey) {
      if (state[stateKey] !== undefined && state[stateKey] !== null && String(state[stateKey])) {
        values[TOKEN_KEYS[stateKey]] = String(state[stateKey]);
      }
    });
    if (Object.keys(values).length) (propertyStore || PropertiesService.getScriptProperties()).setProperties(values, false);
    return state;
  }

  function getAccessToken(client, propertyStore) {
    var selected = client || createClient();
    var token = selected.getAccessToken(false);
    persistTokenState(selected, propertyStore);
    return token;
  }

  function refreshAccessToken(client, propertyStore) {
    var selected = client || createClient();
    var token = selected.refreshAccessToken();
    persistTokenState(selected, propertyStore);
    return token;
  }

  function normalizePhone(value) {
    var digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
    if (!/^55\d{10,11}$/.test(digits)) {
      DocumentalistasErrors.fail('INVALID_CHATAPP_PHONE', 'O telefone informado não pode ser usado para a notificação no WhatsApp.');
    }
    return digits;
  }

  function configuration(config) {
    var values = config || DocumentalistasConfig.get();
    var selected = {
      licenseId: String(values.DOCUMENTALISTAS_CHATAPP_LICENSE_ID || '').trim(),
      messengerType: String(values.DOCUMENTALISTAS_CHATAPP_MESSENGER_TYPE || '').trim(),
      templateId: String(values.DOCUMENTALISTAS_CHATAPP_ERROR_TEMPLATE_ID || '').trim()
    };
    if (!selected.licenseId || !selected.messengerType || !selected.templateId) {
      DocumentalistasErrors.fail('CHATAPP_CONFIGURATION_INCOMPLETE', 'A integração ChatApp dos documentalistas não possui licença, messenger ou template configurado.');
    }
    return selected;
  }

  function assertSuccessfulResponse(response) {
    var body = response && response.body;
    if (!response || response.ok === false || (body && body.success === false)) {
      DocumentalistasErrors.fail('CHATAPP_TEMPLATE_SEND_FAILED', 'O ChatApp não confirmou o envio do template de erro.');
    }
    return response;
  }

  function sendErrorTemplate(phone, clientMessage, config) {
    var channel = configuration(config);
    var client = createClient();
    var response;
    try {
      getAccessToken(client);
      response = client.messages.sendTemplate({
        licenseId: channel.licenseId,
        messengerType: channel.messengerType,
        chatId: normalizePhone(phone),
        templateId: channel.templateId,
        params: [String(clientMessage || '').trim()],
        sender: 'system'
      });
      return assertSuccessfulResponse(response);
    } finally {
      persistTokenState(client);
    }
  }

  function messageId(response) {
    var data = response && (response.data || (response.body && response.body.data));
    return data && data.id ? String(data.id) : '';
  }

  return {
    TOKEN_KEYS: TOKEN_KEYS,
    assertLibrary: assertLibrary,
    createClient: createClient,
    persistTokenState: persistTokenState,
    getAccessToken: getAccessToken,
    refreshAccessToken: refreshAccessToken,
    normalizePhone: normalizePhone,
    configuration: configuration,
    assertSuccessfulResponse: assertSuccessfulResponse,
    sendErrorTemplate: sendErrorTemplate,
    messageId: messageId
  };
})();

function obterTokenChatAppDocumentalistas_() {
  return DocumentalistasChatApp.getAccessToken();
}

function atualizarTokenChatAppDocumentalistas_() {
  return DocumentalistasChatApp.refreshAccessToken();
}

function diagnosticarChatAppDocumentalistas() {
  var config = DocumentalistasConfig.get();
  var channel = DocumentalistasChatApp.configuration(config);
  var client = DocumentalistasChatApp.createClient();
  DocumentalistasChatApp.getAccessToken(client);
  var response = client.templates.list(channel.licenseId, channel.messengerType);
  DocumentalistasChatApp.persistTokenState(client);
  var data = response && (response.data || (response.body && response.body.data));
  var templates = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
  var found = templates.some(function (template) {
    return String(template && (template.id || template.templateId) || '') === channel.templateId;
  });
  var result = {
    status: found ? 'READY' : 'TEMPLATE_NOT_FOUND',
    libraryVersion: SmartChatApp.about().version,
    licenseId: channel.licenseId,
    messengerType: channel.messengerType,
    templateId: channel.templateId,
    templateFound: found,
    listedTemplates: templates.length
  };
  DocumentalistasErrors.log('CHATAPP_DIAGNOSTIC', result.status, result);
  return result;
}
