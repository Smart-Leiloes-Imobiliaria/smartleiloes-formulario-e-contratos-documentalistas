var DocumentalistasNormalize = (function () {
  'use strict';

  function unicode(value) {
    var text = value === null || value === undefined ? '' : String(value);
    return typeof text.normalize === 'function' ? text.normalize('NFC') : text;
  }

  function whitespace(value) {
    return unicode(value)
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(function (line) { return line.replace(/[\t\f\v ]+/g, ' ').trim(); })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function upper(value) {
    return whitespace(value).toLocaleUpperCase('pt-BR');
  }

  function isEmptyRaw(value) {
    if (Array.isArray(value)) return value.every(function (item) { return whitespace(item) === ''; });
    return whitespace(value) === '';
  }

  function presentationList(value) {
    var items = Array.isArray(value) ? value : [value];
    return items.map(upper).filter(Boolean).join('; ');
  }

  function canonicalList(value) {
    var items = Array.isArray(value) ? value : [value];
    return items.map(function (item) { return upper(item); }).filter(Boolean).sort().join('|');
  }

  function stripAllowedMask(value, allowedPattern, label) {
    var source = upper(value);
    var canonical = source.replace(/[.\/\-\s()]/g, '');
    if (canonical && !allowedPattern.test(canonical)) {
      DocumentalistasErrors.fail('INVALID_IDENTIFIER_CHARACTERS', label + ' contém caracteres não permitidos.', { field: label });
    }
    return canonical;
  }

  function cpfCanonical(value) {
    return stripAllowedMask(value, /^\d+$/, 'CPF');
  }

  function cnpjCanonical(value) {
    return stripAllowedMask(value, /^[A-Z0-9]+$/, 'CNPJ');
  }

  function digits(value, label) {
    var source = whitespace(value);
    var canonical = source.replace(/[\s().+\-\/]/g, '');
    if (canonical && !/^\d+$/.test(canonical)) {
      DocumentalistasErrors.fail('INVALID_IDENTIFIER_CHARACTERS', (label || 'Identificador') + ' deve conter somente dígitos e máscara permitida.');
    }
    return canonical;
  }

  function formatCpf(canonical) {
    if (!/^\d{11}$/.test(canonical)) return canonical;
    return canonical.slice(0, 3) + '.' + canonical.slice(3, 6) + '.' + canonical.slice(6, 9) + '-' + canonical.slice(9);
  }

  function formatCnpj(canonical) {
    if (!/^[A-Z0-9]{12}\d{2}$/.test(canonical)) return canonical;
    return canonical.slice(0, 2) + '.' + canonical.slice(2, 5) + '.' + canonical.slice(5, 8) + '/' + canonical.slice(8, 12) + '-' + canonical.slice(12);
  }

  function formatCep(canonical) {
    return /^\d{8}$/.test(canonical) ? canonical.slice(0, 5) + '-' + canonical.slice(5) : canonical;
  }

  function normalize(rawValue, kind) {
    var original = Array.isArray(rawValue) ? rawValue.slice() : rawValue;
    if (kind === 'secret') {
      return { original: original, technical: whitespace(rawValue), canonical: whitespace(rawValue), display: '' };
    }
    if (Array.isArray(rawValue)) {
      return { original: original, technical: rawValue.map(whitespace), canonical: canonicalList(rawValue), display: presentationList(rawValue) };
    }

    var technical = whitespace(rawValue);
    var canonical = upper(rawValue);
    var display = upper(rawValue);
    if (kind === 'email' || kind === 'url') {
      canonical = technical.toLocaleLowerCase('pt-BR');
    } else if (kind === 'phone') {
      canonical = digits(rawValue, 'Telefone');
      display = canonical;
      technical = canonical;
    } else if (kind === 'cep') {
      canonical = digits(rawValue, 'CEP');
      display = formatCep(canonical);
      technical = canonical;
    } else if (kind === 'cpf') {
      canonical = cpfCanonical(rawValue);
      display = formatCpf(canonical);
      technical = canonical;
    } else if (kind === 'cnpj') {
      canonical = cnpjCanonical(rawValue);
      display = formatCnpj(canonical);
      technical = canonical;
    } else if (kind === 'entityType') {
      var entityLabel = upper(rawValue);
      canonical = entityLabel.indexOf('PESSOA JURÍDICA') === 0 ? 'PJ' : (entityLabel.indexOf('PESSOA FÍSICA') === 0 ? 'PF' : entityLabel);
    } else if (kind === 'uf') {
      canonical = upper(rawValue);
      display = canonical;
    } else if (kind === 'identifier') {
      canonical = upper(rawValue).replace(/\s+/g, '');
    }
    return { original: original, technical: technical, canonical: canonical, display: display };
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + stableStringify(value[key]);
    }).join(',') + '}';
  }

  function sha256(value) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
    return bytes.map(function (byte) {
      var normalized = byte < 0 ? byte + 256 : byte;
      return ('0' + normalized.toString(16)).slice(-2);
    }).join('');
  }

  return {
    unicode: unicode,
    whitespace: whitespace,
    upper: upper,
    isEmptyRaw: isEmptyRaw,
    normalize: normalize,
    cpfCanonical: cpfCanonical,
    cnpjCanonical: cnpjCanonical,
    formatCpf: formatCpf,
    formatCnpj: formatCnpj,
    formatCep: formatCep,
    stableStringify: stableStringify,
    sha256: sha256
  };
})();
