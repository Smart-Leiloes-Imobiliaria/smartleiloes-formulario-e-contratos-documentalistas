var DocumentalistasErrors = (function () {
  'use strict';

  function AutomationError(code, message, details) {
    this.name = 'AutomationError';
    this.code = code;
    this.message = message;
    this.details = details || {};
    this.stack = (new Error(message)).stack;
  }
  AutomationError.prototype = Object.create(Error.prototype);
  AutomationError.prototype.constructor = AutomationError;

  function fail(code, message, details) {
    throw new AutomationError(code, message, details);
  }

  function asError(error, fallbackCode) {
    if (error && error.code) return error;
    return new AutomationError(fallbackCode || 'UNEXPECTED_ERROR', error && error.message ? error.message : String(error));
  }

  function log(stage, result, data) {
    var safe = Object.assign({
      timestamp: new Date().toISOString(),
      stage: stage,
      result: result
    }, redact(data || {}));
    console.log(JSON.stringify(safe));
    return safe;
  }

  function redact(value, key) {
    if (value === null || value === undefined) return value;
    var normalizedKey = String(key || '').toLowerCase();
    if (/password|senha|secret|token|credential|authorization/.test(normalizedKey)) return '[REDACTED]';
    if (/cpf|cnpj|document/.test(normalizedKey) && typeof value === 'string') return maskDocument(value);
    if (Array.isArray(value)) return value.map(function (item) { return redact(item, key); });
    if (typeof value === 'object') {
      var output = {};
      Object.keys(value).forEach(function (childKey) {
        output[childKey] = redact(value[childKey], childKey);
      });
      return output;
    }
    return value;
  }

  function maskDocument(value) {
    var text = String(value || '').replace(/[^0-9A-Z]/gi, '');
    if (text.length <= 4) return '****';
    return new Array(Math.max(1, text.length - 3)).join('*') + text.slice(-4);
  }

  return {
    AutomationError: AutomationError,
    fail: fail,
    asError: asError,
    log: log,
    redact: redact,
    maskDocument: maskDocument
  };
})();
