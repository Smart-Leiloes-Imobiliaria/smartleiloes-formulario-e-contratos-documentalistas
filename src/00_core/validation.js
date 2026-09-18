var DocumentalistasValidation = (function () {
  'use strict';

  function validateCpf(cpf) {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    for (var position = 9; position < 11; position++) {
      var sum = 0;
      for (var index = 0; index < position; index++) sum += Number(cpf.charAt(index)) * ((position + 1) - index);
      var digit = (sum * 10) % 11;
      if (digit === 10) digit = 0;
      if (digit !== Number(cpf.charAt(position))) return false;
    }
    return true;
  }

  function cnpjCharValue(character) {
    return character.charCodeAt(0) - 48;
  }

  function calculateCnpjDigit(base) {
    var weight = 2;
    var sum = 0;
    for (var index = base.length - 1; index >= 0; index--) {
      sum += cnpjCharValue(base.charAt(index)) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    var remainder = sum % 11;
    return remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  }

  function validateCnpj(cnpj) {
    if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return false;
    if (/^(.)\1{13}$/.test(cnpj)) return false;
    var base = cnpj.slice(0, 12);
    var first = calculateCnpjDigit(base);
    var second = calculateCnpjDigit(base + String(first));
    return cnpj.slice(12) === String(first) + String(second);
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isRequired(definition, entityType, paymentMethod) {
    return definition.requiredRule === 'always' ||
      definition.requiredRule === entityType ||
      definition.requiredRule === 'payment:' + paymentMethod;
  }

  function validateField(definition, normalized, entityType, paymentMethod) {
    if (!isRequired(definition, entityType, paymentMethod) && !normalized.canonical) return;
    if (!normalized.canonical) {
      DocumentalistasErrors.fail('REQUIRED_FIELD_MISSING', 'Campo obrigatório ausente: ' + definition.title + '.', { itemId: definition.itemId, domain: definition.domain });
    }
    if (definition.normalizer === 'cpf' && !validateCpf(normalized.canonical)) {
      DocumentalistasErrors.fail('INVALID_CPF', 'CPF inválido no campo: ' + definition.title + '.', { itemId: definition.itemId, domain: definition.domain });
    }
    if (definition.normalizer === 'cnpj' && !validateCnpj(normalized.canonical)) {
      DocumentalistasErrors.fail('INVALID_CNPJ', 'CNPJ inválido no campo: ' + definition.title + '.', { itemId: definition.itemId, domain: definition.domain });
    }
    if (definition.normalizer === 'email' && !validateEmail(normalized.technical)) {
      DocumentalistasErrors.fail('INVALID_EMAIL', 'E-mail inválido no campo: ' + definition.title + '.', { itemId: definition.itemId, domain: definition.domain });
    }
    if (definition.normalizer === 'cep' && !/^\d{8}$/.test(normalized.canonical)) {
      DocumentalistasErrors.fail('INVALID_CEP', 'CEP inválido no campo: ' + definition.title + '.', { itemId: definition.itemId, domain: definition.domain });
    }
    if (definition.normalizer === 'entityType' && ['PF', 'PJ'].indexOf(normalized.canonical) < 0) {
      DocumentalistasErrors.fail('INVALID_ENTITY_TYPE', 'Tipo de pessoa deve ser Pessoa Física ou Pessoa Jurídica.', { itemId: definition.itemId });
    }
    if (definition.domain === 'formaPagamento' && ['PIX', 'TED'].indexOf(normalized.canonical) < 0) {
      DocumentalistasErrors.fail('INVALID_PAYMENT_METHOD', 'Forma de pagamento deve ser PIX ou TED.', { itemId: definition.itemId });
    }
  }

  return {
    validateCpf: validateCpf,
    validateCnpj: validateCnpj,
    calculateCnpjDigit: calculateCnpjDigit,
    validateEmail: validateEmail,
    isRequired: isRequired,
    validateField: validateField
  };
})();
