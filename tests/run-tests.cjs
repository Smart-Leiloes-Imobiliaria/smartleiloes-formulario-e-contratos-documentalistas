const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const os = require('node:os');
const childProcess = require('node:child_process');

const root = path.resolve(__dirname, '..');
const propertyBag = {};
const sandbox = {
  console: { log() {}, error() {} },
  Date,
  JSON,
  Math,
  Object,
  Array,
  String,
  Number,
  RegExp,
  Error,
  Intl,
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(_algorithm, value) {
      return [...crypto.createHash('sha256').update(String(value), 'utf8').digest()].map((byte) => byte > 127 ? byte - 256 : byte);
    },
    newBlob(data, contentType, name) {
      return { getBytes: () => data, getContentType: () => contentType, getName: () => name };
    },
    formatDate(date, timezone, pattern) {
      if (pattern !== 'yyyy-MM-dd') throw new Error(`Unsupported test pattern ${pattern}`);
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
      const get = (type) => parts.find((part) => part.type === type).value;
      return `${get('year')}-${get('month')}-${get('day')}`;
    }
  },
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperties: () => ({ ...propertyBag }),
        getProperty: (key) => propertyBag[key] ?? null,
        setProperty: (key, value) => { propertyBag[key] = String(value); },
        deleteProperty: (key) => { delete propertyBag[key]; },
        setProperties: (values, deleteAll) => {
          if (deleteAll) for (const key of Object.keys(propertyBag)) delete propertyBag[key];
          Object.assign(propertyBag, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])));
        }
      };
    }
  },
  DocumentApp: { ElementType: { PARAGRAPH: 'PARAGRAPH', LIST_ITEM: 'LIST_ITEM' } },
  SpreadsheetApp: { DataValidationCriteria: { VALUE_IN_RANGE: 'VALUE_IN_RANGE' } }
};
vm.createContext(sandbox);
function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(resolved);
    return /\.(gs|js)$/.test(entry.name) ? [resolved] : [];
  });
}
for (const filePath of sourceFiles(path.join(root, 'src')).sort()) {
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), sandbox, { filename: path.relative(root, filePath) });
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(condition, message) { if (!condition) throw new Error(message || 'Assertion failed'); }
function equal(actual, expected, message) { if (actual !== expected) throw new Error(`${message || 'Values differ'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function throwsCode(fn, code) {
  try { fn(); } catch (error) { equal(error.code, code, `Wrong error code (${error.message})`); return error; }
  throw new Error(`Expected ${code}`);
}
function fixture(name) { return JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', name), 'utf8')); }
function extract(name, now = new Date('2026-09-16T15:00:00Z')) {
  return sandbox.DocumentalistasForm.extract(sandbox.DocumentalistasForm.rawFixtureToRaw(fixture(name)), now);
}

test('normaliza Unicode, espaços, acentos, caixa-alta e zeros à esquerda', () => {
  const input = extract('form-response-pf.json');
  equal(input.values.nomeContato.display, "JOÃO D'ÁVILA");
  equal(input.values.numeroPessoaFisica.canonical, '0012');
  equal(input.values.cepPessoaFisica.display, '01234-567');
  equal(input.values.emailTratativas.technical, 'Joao.Teste@example.invalid');
  equal(input.values.emailTratativas.display, 'JOAO.TESTE@EXAMPLE.INVALID');
  equal(sandbox.DocumentalistasNormalize.normalize(['  ação ', 'São  José'], 'text').display, 'AÇÃO; SÃO JOSÉ');
});

test('valida CPF, CNPJ numérico e CNPJ alfanumérico oficial', () => {
  assert(sandbox.DocumentalistasValidation.validateCpf('52998224725'));
  assert(sandbox.DocumentalistasValidation.validateCnpj('11222333000181'));
  assert(sandbox.DocumentalistasValidation.validateCnpj('00000000E08G12'));
  assert(!sandbox.DocumentalistasValidation.validateCnpj('00000000E08G13'));
});

test('extrai PF e PJ pelos IDs reais e respeita campos condicionais', () => {
  const pf = extract('form-response-pf.json');
  const pj = extract('form-response-pj.json');
  equal(pf.entityType, 'PF');
  equal(pj.entityType, 'PJ');
  equal(pf.identity.documentType, 'CPF');
  equal(pj.identity.documentType, 'CNPJ');
  equal(pj.identity.displayName, 'EMPRESA ÁRVORE SERVIÇOS LTDA');
  equal(pj.identity.formattedDocument, '00.000.000/E08G-12');
});

test('valida dados de pagamento somente no ramo PIX ou TED escolhido', () => {
  const pix = extract('form-response-pf.json');
  const ted = extract('form-response-pj.json');
  equal(pix.values.codigoBanco.canonical, '');
  equal(pix.values.chavePix.canonical, 'PIX.TESTE@EXAMPLE.INVALID');
  equal(ted.values.codigoBanco.canonical, '000');
  equal(ted.values.chavePix.canonical, '');

  const pixMissingKey = fixture('form-response-pf.json');
  delete pixMissingKey.answersByItemId['596704228'];
  throwsCode(() => sandbox.DocumentalistasForm.extract(sandbox.DocumentalistasForm.rawFixtureToRaw(pixMissingKey), new Date()), 'REQUIRED_FIELD_MISSING');

  const tedMissingBank = fixture('form-response-pj.json');
  delete tedMissingBank.answersByItemId['1712386931'];
  throwsCode(() => sandbox.DocumentalistasForm.extract(sandbox.DocumentalistasForm.rawFixtureToRaw(tedMissingBank), new Date()), 'REQUIRED_FIELD_MISSING');

  const invalidMethod = fixture('form-response-pf.json');
  invalidMethod.answersByItemId['818261484'] = 'DINHEIRO';
  throwsCode(() => sandbox.DocumentalistasForm.extract(sandbox.DocumentalistasForm.rawFixtureToRaw(invalidMethod), new Date()), 'INVALID_PAYMENT_METHOD');
});

test('bloqueia obrigatório ausente e item novo não mapeado', () => {
  const missing = fixture('form-response-pf.json');
  delete missing.answersByItemId['285166117'];
  throwsCode(() => sandbox.DocumentalistasForm.extract(sandbox.DocumentalistasForm.rawFixtureToRaw(missing), new Date()), 'REQUIRED_FIELD_MISSING');
  const changed = fixture('form-response-pf.json');
  changed.answersByItemId['999999999'] = 'novo valor';
  throwsCode(() => sandbox.DocumentalistasForm.extract(sandbox.DocumentalistasForm.rawFixtureToRaw(changed), new Date()), 'UNMAPPED_FORM_ITEM');
});

test('rejeita evento de planilha e formulário inesperado', () => {
  throwsCode(() => sandbox.DocumentalistasForm.eventToRaw({ namedValues: {}, range: {} }), 'INVALID_FORMS_EVENT');
  const raw = fixture('form-response-pf.json');
  raw.formId = 'outro';
  throwsCode(() => sandbox.DocumentalistasForm.extract(sandbox.DocumentalistasForm.rawFixtureToRaw(raw), new Date()), 'UNEXPECTED_FORM');
});

test('converte linha histórica por cabeçalhos, preserva timestamp e usa ID estável', () => {
  const source = fixture('form-response-pj.json');
  const headers = ['Carimbo de data/hora'].concat(sandbox.DocumentalistasFields.MAP.map((definition) => `${definition.title}:`)).concat(['Nome completo do representante:']);
  const row = [new Date(source.submittedAt)].concat(sandbox.DocumentalistasFields.MAP.map((definition) => source.answersByItemId[String(definition.itemId)] || '')).concat(['Representante Histórico']);
  const config = { FORM_ID: source.formId, RESPONSE_SPREADSHEET_ID: 'sheet-id', RESPONSE_SHEET_ID: '123' };
  const raw = sandbox.DocumentalistasHistoricalImport.rowToRaw(headers, row, 7, config);
  equal(raw.responseId, 'sheet:sheet-id:123:row:7');
  equal(raw.answersByItemId['1047884631'], 'Representante Histórico');
  equal(raw.submittedAt.toISOString(), source.submittedAt);
  row[1] = 'Nome editado';
  equal(sandbox.DocumentalistasHistoricalImport.rowToRaw(headers, row, 7, config).responseId, raw.responseId);
});

test('detecta ausência da coluna histórica de timestamp', () => {
  throwsCode(() => sandbox.DocumentalistasHistoricalImport.buildColumnMap(['Nome completo']), 'HISTORICAL_TIMESTAMP_COLUMN_MISSING');
});

test('mapeia o cabeçalho PF/PJ atual e preserva o título histórico como alias', () => {
  const currentHeaders = ['Carimbo de data/hora', 'Endereço de email'].concat(
    sandbox.DocumentalistasFields.MAP.map((definition) => `${definition.title}:`)
  );
  const currentMap = sandbox.DocumentalistasHistoricalImport.buildColumnMap(currentHeaders);
  assert(sandbox.DocumentalistasFields.MAP.every((definition) => currentMap.columnsByItemId[String(definition.itemId)].length > 0));

  const legacyHeaders = currentHeaders.slice();
  const currentTypeIndex = currentMap.columnsByItemId['151260162'][0];
  legacyHeaders[currentTypeIndex] = 'Pessoa Física ou Pessoa Jurídica?';
  const legacyMap = sandbox.DocumentalistasHistoricalImport.buildColumnMap(legacyHeaders);
  equal(legacyMap.columnsByItemId['151260162'][0], currentTypeIndex);
});

test('wrappers manuais exigem responseId configurado sem editar código', () => {
  delete propertyBag.MANUAL_RESPONSE_ID;
  delete propertyBag.MANUAL_STATE_LOOKUP_KEY;
  throwsCode(() => sandbox.simularRespostaConfiguradaDocumentalistas(), 'MANUAL_RESPONSE_ID_NOT_CONFIGURED');
  throwsCode(() => sandbox.consultarEstadoConfiguradoDocumentalistas(), 'MANUAL_STATE_LOOKUP_KEY_NOT_CONFIGURED');
});

class FakeText {
  constructor(text) { this.text = text; this.bold = new Set(); }
  getText() { return this.text; }
  deleteText(start, end) {
    const removed = end - start + 1;
    this.text = this.text.slice(0, start) + this.text.slice(end + 1);
    this.bold = new Set([...this.bold].filter((index) => index < start || index > end).map((index) => index > end ? index - removed : index));
    return this;
  }
  insertText(start, value) {
    this.text = this.text.slice(0, start) + value + this.text.slice(start);
    this.bold = new Set([...this.bold].map((index) => index >= start ? index + value.length : index));
    return this;
  }
  setBold(start, end, value) { if (value) for (let i = start; i <= end; i += 1) this.bold.add(i); return this; }
}

test('substitui placeholders repetidos literalmente e põe apenas inserções em negrito', () => {
  const text = new FakeText('FIXO {{nomeCompletoDocumentalista}} / {{nomeCompletoDocumentalista}} / {{chavePix}} FIM');
  const replacements = { '{{nomeCompletoDocumentalista}}': 'JOÃO & <CIA>', '{{chavePix}}': 'A/B "C"' };
  const applied = sandbox.DocumentalistasContract.replaceLiteralInText(text, replacements);
  equal(text.text, 'FIXO JOÃO & <CIA> / JOÃO & <CIA> / A/B "C" FIM');
  equal(applied.length, 3);
  assert(!text.bold.has(0) && !text.bold.has(1), 'Texto fixo não deve ficar em negrito');
  assert([...text.bold].length === ('JOÃO & <CIA>'.length * 2 + 'A/B "C"'.length));
});

test('preenche runs DOCX diretamente, escapa caracteres e preserva texto fixo', () => {
  const xml = '<w:p><w:r><w:t>FIXO</w:t></w:r><w:r><w:t>{{nomeCompletoDocumentalista}}</w:t></w:r><w:r><w:t>{{nomeCompletoDocumentalista}}</w:t></w:r></w:p>';
  const result = sandbox.DocumentalistasContract.replaceDocxXml(xml, { '{{nomeCompletoDocumentalista}}': 'JOÃO & <CIA>' });
  equal(result.applied.length, 2);
  assert(result.xml.includes('<w:t>FIXO</w:t>'));
  assert(result.xml.includes('JOÃO &amp; &lt;CIA&gt;'));
  equal((result.xml.match(/<w:b\/>/g) || []).length, 2);
});

test('substitui vários placeholders no mesmo run e mantém texto fixo sem negrito', () => {
  const xml = '<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>PAGAMENTO: {{formaPagamento}}, AGÊNCIA: {{agenciaBancaria}}.</w:t></w:r></w:p>';
  const result = sandbox.DocumentalistasContract.replaceDocxXml(xml, { '{{formaPagamento}}': 'PIX & TED', '{{agenciaBancaria}}': '0001' });
  equal(result.applied.length, 2);
  equal((result.xml.match(/<w:b\/>/g) || []).length, 2);
  assert(result.xml.includes('PIX &amp; TED'));
  const runs = [...result.xml.matchAll(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g)].map((match) => ({
    text: (match[0].match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/) || [null, ''])[1].replace(/&amp;/g, '&'),
    bold: /<w:b\/>/.test(match[0])
  }));
  equal(JSON.stringify(runs), JSON.stringify([
    { text: 'PAGAMENTO: ', bold: false },
    { text: 'PIX & TED', bold: true },
    { text: ', AGÊNCIA: ', bold: false },
    { text: '0001', bold: true },
    { text: '.', bold: false }
  ]));
});

test('especializa a cláusula de pagamento para PIX ou TED sem rótulos vazios', () => {
  const clause = ' O pagamento será feito através de {{formaPagamento}}, para a conta indicada pela CONTRATADA, qual seja, Código do banco (COMPE): {{codigoBanco}}, Agência: {{agenciaBancaria}}, {{tipoContaBancaria}}: {{contaBancaria}}, {{tipoChavePix}}: {{chavePix}}, desde que emitido o recibo.';
  const xml = `<w:p><w:r><w:t xml:space="preserve">${clause}</w:t></w:r></w:p>`;
  const pix = sandbox.DocumentalistasContract.replaceDocxXml(xml, {
    '{{formaPagamento}}': 'PIX', '{{codigoBanco}}': '', '{{agenciaBancaria}}': '', '{{tipoContaBancaria}}': '', '{{contaBancaria}}': '',
    '{{tipoChavePix}}': 'ENDEREÇO DE E-MAIL', '{{chavePix}}': 'PIX.TESTE@EXAMPLE.INVALID'
  });
  assert(!pix.xml.includes('Código do banco'));
  assert(!pix.xml.includes('Agência:'));
  assert(pix.xml.includes('ENDEREÇO DE E-MAIL'));
  equal(sandbox.DocumentalistasTemplate.extractPlaceholders(pix.xml).length, 0);

  const ted = sandbox.DocumentalistasContract.replaceDocxXml(xml, {
    '{{formaPagamento}}': 'TED', '{{codigoBanco}}': '000', '{{agenciaBancaria}}': '0001', '{{tipoContaBancaria}}': 'CONTA CORRENTE', '{{contaBancaria}}': '000099-0',
    '{{tipoChavePix}}': '', '{{chavePix}}': ''
  });
  assert(ted.xml.includes('Código do banco (COMPE):'));
  assert(!ted.xml.includes('{{tipoChavePix}}'));
  assert(!ted.xml.includes('Chave PIX'));
  equal(sandbox.DocumentalistasTemplate.extractPlaceholders(ted.xml).length, 0);
});

test('aceita placeholder completo com texto fixo e rejeita fragmentação entre runs', () => {
  const mixed = '<w:p><w:r><w:t>LOCAL: {{localAssinatura}}, {{dataAssinatura}}.</w:t></w:r></w:p>';
  equal(JSON.stringify(sandbox.DocumentalistasTemplate.inspectXmlPlaceholders(mixed, 'word/document.xml')), JSON.stringify(['{{localAssinatura}}', '{{dataAssinatura}}']));
  const fragmented = '<w:p><w:r><w:t>{{local</w:t></w:r><w:r><w:t>Assinatura}}</w:t></w:r></w:p>';
  throwsCode(() => sandbox.DocumentalistasTemplate.inspectXmlPlaceholders(fragmented, 'word/document.xml'), 'FRAGMENTED_TEMPLATE_PLACEHOLDER');
});

test('preenche integralmente os XML reais dos contratos PF e PJ', () => {
  [
    { file: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS - PF.docx', fixture: 'form-response-pf.json' },
    { file: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS.docx', fixture: 'form-response-pj.json' }
  ].forEach((entry) => {
    const xml = childProcess.execFileSync('unzip', [
      '-p',
      path.join(root, 'templates', entry.file),
      'word/document.xml'
    ], { encoding: 'utf8' });
    const input = extract(entry.fixture);
    const sourcePlaceholders = sandbox.DocumentalistasTemplate.extractPlaceholders(xml);
    const result = sandbox.DocumentalistasContract.replaceDocxXml(xml, input.placeholders);
    const unresolved = sandbox.DocumentalistasTemplate.extractPlaceholders(result.xml);
    equal(unresolved.length, 0, `${entry.file} manteve placeholders sem substituição`);
    assert(result.applied.length > 0 && result.applied.length <= sourcePlaceholders.length, `${entry.file} não registrou as substituições aplicáveis`);
    assert(result.xml.includes('<w:b/>'), `${entry.file} não aplicou negrito aos valores inseridos`);
    if (input.values.formaPagamento.canonical === 'PIX') {
      assert(!result.xml.includes('Código do banco (COMPE):'), `${entry.file} manteve os campos TED no contrato PIX`);
      assert(result.xml.includes(input.values.tipoChavePix.display), `${entry.file} não manteve o tipo de chave PIX`);
    } else {
      assert(result.xml.includes('Código do banco (COMPE):'), `${entry.file} removeu os campos TED`);
      assert(!result.xml.includes('{{tipoChavePix}}'), `${entry.file} manteve placeholder PIX no contrato TED`);
    }
  });
});

test('detecta template ausente, placeholder desconhecido e obrigatório ausente', () => {
  throwsCode(() => sandbox.DocumentalistasTemplate.validateConfiguredTemplate({}, null, 'PF'), 'TEMPLATE_NOT_CONFIGURED_PF');
  throwsCode(() => sandbox.DocumentalistasTemplate.validatePlaceholderSet(['{{nomeCompletoDocumentalista}}', '{{campoInventado}}']), 'UNKNOWN_TEMPLATE_PLACEHOLDER');
  throwsCode(() => sandbox.DocumentalistasTemplate.validatePlaceholderSet(['{{nomeCompletoDocumentalista}}']), 'REQUIRED_TEMPLATE_PLACEHOLDER_MISSING');
});

test('adapta bytes DOCX para Blob ZIP antes de chamar Utilities.unzip', () => {
  const originalUnzip = sandbox.Utilities.unzip;
  let received;
  sandbox.Utilities.unzip = (blob) => { received = blob; return ['ok']; };
  try {
    const result = sandbox.DocumentalistasTemplate.unzipDocxBlob({ getBytes: () => [0x50, 0x4B, 0x03, 0x04, 0x01] });
    equal(JSON.stringify(result), JSON.stringify(['ok']));
    equal(received.getContentType(), 'application/zip');
    equal(received.getName(), 'template.zip');
    throwsCode(() => sandbox.DocumentalistasTemplate.unzipDocxBlob({ getBytes: () => [0x7B, 0x22, 0x65, 0x72] }), 'INVALID_DOCX');
  } finally {
    sandbox.Utilities.unzip = originalUnzip;
  }
});

test('seleciona template PF/PJ pelo tipo da resposta e preserva template registrado', () => {
  const config = {
    CONTRACT_TEMPLATE_PF_SOURCE_ID: 'pf-source', CONTRACT_TEMPLATE_PF_DOC_ID: 'pf-doc', CONTRACT_TEMPLATE_PF_HASH: 'pf-hash', CONTRACT_TEMPLATE_PF_VERSION: 'pf-v1',
    CONTRACT_TEMPLATE_PJ_SOURCE_ID: 'pj-source', CONTRACT_TEMPLATE_PJ_DOC_ID: 'pj-doc', CONTRACT_TEMPLATE_PJ_HASH: 'pj-hash', CONTRACT_TEMPLATE_PJ_VERSION: 'pj-v1'
  };
  const pf = sandbox.DocumentalistasTemplate.resolveTemplateConfig(config, null, 'PF');
  const pj = sandbox.DocumentalistasTemplate.resolveTemplateConfig(config, null, 'PJ');
  equal(pf.sourceId, 'pf-source');
  equal(pf.version, 'pf-v1');
  equal(pj.sourceId, 'pj-source');
  equal(pj.version, 'pj-v1');
  const recorded = sandbox.DocumentalistasTemplate.resolveTemplateConfig(config, { sourceId: 'original-source', docId: 'original-doc', hash: 'original-hash', version: 'original-v1' }, 'PF');
  equal(recorded.sourceId, 'original-source');
  equal(recorded.version, 'original-v1');
  throwsCode(() => sandbox.DocumentalistasTemplate.resolveTemplateConfig(config, null, 'OUTRO'), 'INVALID_ENTITY_TYPE');
});

test('bloqueia template de ramo incompatível e mistura PF/PJ sem condicionais', () => {
  const base = ['{{nomeCompletoDocumentalista}}', '{{cpfCnpjDocumentalista}}', '{{dataAssinatura}}', '{{localAssinatura}}'];
  equal(JSON.stringify(sandbox.DocumentalistasTemplate.supportedEntityTypes(base.concat(['{{nacionalidadeRepresentante}}']))), JSON.stringify(['PJ']));
  throwsCode(() => sandbox.DocumentalistasTemplate.assertEntityType(base.concat(['{{nacionalidadeRepresentante}}']), 'PF'), 'TEMPLATE_ENTITY_TYPE_MISMATCH');
  throwsCode(() => sandbox.DocumentalistasTemplate.supportedEntityTypes(base.concat(['{{nacionalidadeRepresentante}}', '{{rgPessoaFisica}}'])), 'UNSUPPORTED_MIXED_ENTITY_TEMPLATE');
});

test('calcula data de São Paulo corretamente perto da mudança de dia', () => {
  const result = sandbox.DocumentalistasForm.formatEmissionDate(new Date('2026-09-17T02:30:00.000Z'), 'America/Sao_Paulo');
  equal(result.iso, '2026-09-16');
  equal(result.display, '16 DE SETEMBRO DE 2026');
});

function pipelineInput(responseId = 'response-a', fingerprint = 'fingerprint-a') {
  const input = extract('form-response-pf.json');
  input.responseId = responseId;
  input.fingerprint = fingerprint;
  input.identityKey = 'identity-a';
  return input;
}

function fakeServices(options = {}) {
  const states = [];
  const resources = {};
  const creates = { folder: 0, contract: 0, spreadsheet: 0 };
  let lostContractOnce = Boolean(options.networkLostAfterContractCreate);
  const service = {
    states, resources, creates,
    findByResponseId(id) { return states.find((state) => (state.responseIds || []).includes(String(id))) || null; },
    findByIdentity(id) { return states.find((state) => state.identityKey === id) || null; },
    createInitial: sandbox.DocumentalistasState.createInitial,
    save(state) { if (!states.includes(state)) states.push(state); return state; },
    validateTemplate(state) {
      if (options.failAt === 'template') throw new sandbox.DocumentalistasErrors.AutomationError('TEMPLATE_NOT_CONFIGURED', 'missing');
      return state.templateSourceId
        ? { docId: state.templateDocId, sourceId: state.templateSourceId, hash: state.templateHash, version: state.templateVersion }
        : { docId: 'template-doc', sourceId: 'template-source', hash: 'hash-v1', version: 'v1' };
    },
    ensureFolder() {
      if (!resources.folder) { resources.folder = { id: 'folder-1' }; creates.folder += 1; }
      if (options.failAt === 'folder') throw new sandbox.DocumentalistasErrors.AutomationError('ROOT_PERMISSION_DENIED', 'denied');
      return resources.folder;
    },
    ensureContract() {
      if (!resources.contract) { resources.contract = { id: 'contract-1' }; creates.contract += 1; }
      if (lostContractOnce) { lostContractOnce = false; throw new Error('network response lost'); }
      if (options.failAt === 'contract') throw new Error('contract failed');
      return resources.contract;
    },
    ensureSpreadsheet() {
      if (!resources.spreadsheet) { resources.spreadsheet = { id: 'sheet-1' }; creates.spreadsheet += 1; }
      if (options.failAt === 'spreadsheet') throw new Error('sheet failed');
      return resources.spreadsheet;
    }
  };
  return service;
}

test('reenvio idêntico e resposta diferente equivalente reutilizam todos os recursos', () => {
  const services = fakeServices();
  const first = sandbox.DocumentalistasWorkflow.runPipeline(pipelineInput('response-a'), services);
  const second = sandbox.DocumentalistasWorkflow.runPipeline(pipelineInput('response-b'), services);
  equal(first.alreadyProcessed, false);
  equal(second.alreadyProcessed, true);
  equal(services.creates.folder, 1);
  equal(services.creates.contract, 1);
  equal(services.creates.spreadsheet, 1);
  equal(services.states[0].responseIds.length, 2);
});

test('envios serializados/concorrrentes não duplicam recursos', () => {
  const services = fakeServices();
  sandbox.DocumentalistasWorkflow.runPipeline(pipelineInput('concurrent-a'), services);
  sandbox.DocumentalistasWorkflow.runPipeline(pipelineInput('concurrent-b'), services);
  equal(Object.values(services.creates).reduce((sum, value) => sum + value, 0), 3);
});

test('fila de retomada preserva ordem, remove duplicados e não descarta ao exceder o limite', () => {
  const merged = sandbox.DocumentalistasWorkflow.mergeRetryQueue(['a', 'b'], ['b', 'c'], 3);
  equal(JSON.stringify(merged), JSON.stringify(['a', 'b', 'c']));
  throwsCode(() => sandbox.DocumentalistasWorkflow.mergeRetryQueue(['a', 'b', 'c'], ['d'], 3), 'RETRY_QUEUE_CAPACITY_EXCEEDED');
});

test('fila persistente reencaminha falhas e agenda somente um retry', () => {
  const retryTriggers = [];
  sandbox.LockService = {
    getUserLock: () => ({ tryLock: () => true, releaseLock() {} })
  };
  sandbox.ScriptApp = {
    getProjectTriggers: () => retryTriggers,
    newTrigger(handler) {
      return {
        timeBased() { return this; },
        after() { return this; },
        create() {
          const trigger = { getHandlerFunction: () => handler, getUniqueId: () => `retry-${retryTriggers.length + 1}` };
          retryTriggers.push(trigger);
          return trigger;
        }
      };
    }
  };
  const config = { RETRY_HANDLER: 'retomarFilaPendenteDocumentalistas' };
  sandbox.DocumentalistasWorkflow.enqueueResponse('retry-a', config);
  sandbox.DocumentalistasWorkflow.enqueueResponse('retry-a', config);
  equal(sandbox.DocumentalistasWorkflow.pendingResponseCount(), 1);
  equal(retryTriggers.length, 1);
  const taken = sandbox.DocumentalistasWorkflow.takePendingResponses(20);
  equal(JSON.stringify(taken.batch), JSON.stringify(['retry-a']));
  sandbox.DocumentalistasWorkflow.enqueueResponses(taken.batch, config, false);
  equal(sandbox.DocumentalistasWorkflow.pendingResponseCount(), 1);
});

test('fila de respostas mantém o item até confirmação e permite remoção idempotente', () => {
  propertyBag.PENDING_RESPONSE_IDS = JSON.stringify(['timeout-a', 'timeout-b']);
  sandbox.LockService = {
    getUserLock: () => ({ tryLock: () => true, releaseLock() {} })
  };
  equal(JSON.stringify(sandbox.DocumentalistasWorkflow.pendingResponses(1)), JSON.stringify(['timeout-a']));
  equal(sandbox.DocumentalistasWorkflow.removePendingResponse('timeout-a'), 1);
  equal(JSON.stringify(sandbox.DocumentalistasWorkflow.pendingResponses()), JSON.stringify(['timeout-b']));
  equal(sandbox.DocumentalistasWorkflow.removePendingResponse('timeout-a'), 1);
  equal(sandbox.DocumentalistasWorkflow.removePendingResponse('timeout-b'), 0);
  equal(sandbox.DocumentalistasWorkflow.pendingResponseCount(), 0);
});

test('classifica somente falhas recuperáveis para nova tentativa automática', () => {
  assert(sandbox.DocumentalistasWorkflow.isRetryableError({ code: 'LOCK_TIMEOUT_RETRYABLE' }));
  assert(sandbox.DocumentalistasWorkflow.isRetryableError({ code: 'RESOURCE_INACCESSIBLE' }));
  assert(!sandbox.DocumentalistasWorkflow.isRetryableError({ code: 'REQUIRED_FIELD_MISSING' }));
  assert(!sandbox.DocumentalistasWorkflow.isRetryableError({ code: 'CONTRACT_DATA_CONFLICT' }));
});

test('retoma checkpoints e reconcilia criação com resposta de rede perdida', () => {
  const services = fakeServices({ networkLostAfterContractCreate: true });
  throwsCode(() => sandbox.DocumentalistasWorkflow.runPipeline(pipelineInput(), services), 'UNEXPECTED_ERROR');
  equal(services.states[0].stage, 'FOLDER_READY');
  const resumed = sandbox.DocumentalistasWorkflow.runPipeline(pipelineInput(), services);
  equal(resumed.status, 'COMPLETED');
  equal(services.creates.contract, 1);
  equal(services.creates.folder, 1);
  equal(services.creates.spreadsheet, 1);
});

test('registra falhas após template, pasta, contrato e planilha sem perder estado', () => {
  for (const stage of ['template', 'folder', 'contract', 'spreadsheet']) {
    const services = fakeServices({ failAt: stage });
    try { sandbox.DocumentalistasWorkflow.runPipeline(pipelineInput(`failure-${stage}`), services); } catch {}
    equal(services.states.length, 1, `state missing for ${stage}`);
    equal(services.states[0].status, 'FAILED', `wrong status for ${stage}`);
  }
});

test('mesmo documento com dados diferentes e resposta editada geram conflito sem sobrescrever', () => {
  const services = fakeServices();
  sandbox.DocumentalistasWorkflow.runPipeline(pipelineInput('same-response', 'fp-original'), services);
  throwsCode(() => sandbox.DocumentalistasWorkflow.runPipeline(pipelineInput('same-response', 'fp-edited'), services), 'CONTRACT_DATA_CONFLICT');
  equal(services.states[0].fingerprint, 'fp-original');
  equal(services.creates.contract, 1);
});

test('mesmo nome com documentos diferentes produz identidades distintas', () => {
  const pf = extract('form-response-pf.json');
  const second = extract('form-response-pf.json');
  second.identity.canonicalDocument = '11144477735';
  const firstKey = sandbox.DocumentalistasNormalize.sha256('root|CPF|' + pf.identity.canonicalDocument);
  const secondKey = sandbox.DocumentalistasNormalize.sha256('root|CPF|' + second.identity.canonicalDocument);
  assert(firstKey !== secondKey);
});

test('seleção de recurso bloqueia múltiplos candidatos e aceita recurso único', () => {
  equal(sandbox.DocumentalistasDrive.selectUnique([{ id: 'one' }], 'X', 'teste').id, 'one');
  throwsCode(() => sandbox.DocumentalistasDrive.selectUnique([{ id: 'one' }, { id: 'two' }], 'MULTIPLE_CANDIDATES', 'teste'), 'MULTIPLE_CANDIDATES');
});

test('regeneração descarta somente contrato identificado e preserva o parent', () => {
  const updates = [];
  sandbox.Drive = {
    Files: {
      get: () => ({
        id: 'contract-old', name: 'Contrato - TESTE.docx',
        mimeType: sandbox.DocumentalistasDrive.DOCX_MIME,
        parents: ['folder-1'], trashed: false,
        properties: { sl_kind: 'documentalista_contract', sl_identity: 'identity-1' }
      }),
      update: (resource, fileId) => { updates.push({ resource, fileId }); return { id: fileId }; }
    }
  };
  const removed = sandbox.DocumentalistasDrive.trashOwnedContract('contract-old', 'identity-1', 'folder-1');
  equal(removed.id, 'contract-old');
  equal(removed.alreadyTrashed, false);
  equal(updates.length, 1);
  equal(updates[0].fileId, 'contract-old');
  equal(updates[0].resource.trashed, true);

  sandbox.Drive.Files.get = () => ({
    id: 'contract-foreign', name: 'Contrato.docx',
    mimeType: sandbox.DocumentalistasDrive.DOCX_MIME,
    parents: ['other-folder'], trashed: false,
    properties: { sl_kind: 'documentalista_contract', sl_identity: 'identity-1' }
  });
  throwsCode(() => sandbox.DocumentalistasDrive.trashOwnedContract('contract-foreign', 'identity-1', 'folder-1'), 'UNSAFE_CONTRACT_CLEANUP');
});

test('migração de contrato exige que o ramo de pagamento inativo esteja vazio', () => {
  const pix = extract('form-response-pf.json');
  const ted = extract('form-response-pj.json');
  equal(sandbox.diagnosticarRamoPagamentoRegeneracao_(pix).clean, true);
  equal(sandbox.diagnosticarRamoPagamentoRegeneracao_(ted).clean, true);

  pix.values.codigoBanco.canonical = '001';
  const dirtyPix = sandbox.diagnosticarRamoPagamentoRegeneracao_(pix);
  equal(dirtyPix.clean, false);
  equal(JSON.stringify(dirtyPix.populatedInactiveDomains), JSON.stringify(['codigoBanco']));

  ted.values.chavePix.canonical = 'CHAVE-INDEVIDA';
  const dirtyTed = sandbox.diagnosticarRamoPagamentoRegeneracao_(ted);
  equal(dirtyTed.clean, false);
  equal(JSON.stringify(dirtyTed.populatedInactiveDomains), JSON.stringify(['chavePix']));
});

test('checkpoint da regeneração é validado antes de qualquer retomada', () => {
  delete propertyBag.CONTRACT_REGENERATION_ACTIVE_JSON;
  equal(sandbox.lerCheckpointRegeneracaoContrato_(sandbox.PropertiesService.getScriptProperties()), null);
  propertyBag.CONTRACT_REGENERATION_ACTIVE_JSON = JSON.stringify({ sourceRow: 15, oldContractId: 'old', currentFingerprint: 'fp', preservedSpreadsheetId: 'sheet' });
  equal(sandbox.lerCheckpointRegeneracaoContrato_(sandbox.PropertiesService.getScriptProperties()).sourceRow, 15);
  propertyBag.CONTRACT_REGENERATION_ACTIVE_JSON = '{invalido';
  throwsCode(() => sandbox.lerCheckpointRegeneracaoContrato_(sandbox.PropertiesService.getScriptProperties()), 'INVALID_CONTRACT_REGENERATION_CHECKPOINT');
  delete propertyBag.CONTRACT_REGENERATION_ACTIVE_JSON;
});

test('cabeçalhos são comparados após trim e importações externas são detectadas', () => {
  const headers = sandbox.DocumentalistasSpreadsheet.EXPECTED_HEADERS.slice();
  headers[29] += '   ';
  assert(sandbox.DocumentalistasSpreadsheet.headersMatch(headers));
  assert(sandbox.DocumentalistasSpreadsheet.isExternalFormula('=UNIQUE(QUERY(IMPORTRANGE("x";"A:F")))'));
  assert(!sandbox.DocumentalistasSpreadsheet.isExternalFormula('=SUM(A1:A5)'));
});

test('falha de permissão não cria fallback e permanece recuperável', () => {
  const services = fakeServices({ failAt: 'folder' });
  throwsCode(() => sandbox.DocumentalistasWorkflow.runPipeline(pipelineInput(), services), 'ROOT_PERMISSION_DENIED');
  equal(services.creates.folder, 1);
  equal(services.creates.contract, 0);
  equal(services.states[0].lastErrorCode, 'ROOT_PERMISSION_DENIED');
});

test('instalação do gatilho é idempotente e não remove gatilhos alheios', () => {
  const triggers = [{ getHandlerFunction: () => 'outroHandler', getEventType: () => 'ON_FORM_SUBMIT', getTriggerSourceId: () => 'outro-form' }];
  sandbox.FormApp = { openById: (id) => ({ getId: () => id }) };
  sandbox.ScriptApp = {
    EventType: { ON_FORM_SUBMIT: 'ON_FORM_SUBMIT' },
    getProjectTriggers: () => triggers,
    newTrigger(handler) {
      const trigger = { getHandlerFunction: () => handler, getEventType: () => 'ON_FORM_SUBMIT', getTriggerSourceId: () => sandbox.DocumentalistasConfig.DEFAULTS.FORM_ID };
      return { forForm() { return this; }, onFormSubmit() { return this; }, create() { triggers.push(trigger); return trigger; } };
    }
  };
  equal(sandbox.instalarGatilhoDocumentalistas().created, true);
  equal(sandbox.instalarGatilhoDocumentalistas().created, false);
  equal(triggers.length, 2);
});

test('agendamento do backfill histórico é idempotente', () => {
  delete propertyBag.HISTORICAL_IMPORT_TRIGGER_UID;
  const triggers = [];
  sandbox.ScriptApp = {
    getProjectTriggers: () => triggers,
    deleteTrigger(trigger) {
      const index = triggers.indexOf(trigger);
      if (index >= 0) triggers.splice(index, 1);
    },
    newTrigger(handler) {
      return {
        timeBased() { return this; },
        after() { return this; },
        create() {
          const trigger = { getHandlerFunction: () => handler, getUniqueId: () => `historical-${triggers.length + 1}` };
          triggers.push(trigger);
          return trigger;
        }
      };
    }
  };
  const config = { HISTORICAL_IMPORT_HANDLER: 'retomarImportacaoHistoricaDocumentalistas' };
  equal(sandbox.DocumentalistasHistoricalImport.schedule(config, null), true);
  equal(sandbox.DocumentalistasHistoricalImport.schedule(config, null), false);
  equal(triggers.length, 1);
  delete propertyBag.HISTORICAL_IMPORT_TRIGGER_UID;
});

test('acionadores desativados antigos não bloqueiam uma nova continuação histórica', () => {
  delete propertyBag.HISTORICAL_RETRY_TRIGGER_UID;
  const triggers = [{
    getHandlerFunction: () => 'retomarFilaHistoricaDocumentalistas',
    getUniqueId: () => 'disabled-old-trigger'
  }];
  sandbox.ScriptApp = {
    getProjectTriggers: () => triggers,
    deleteTrigger(trigger) {
      const index = triggers.indexOf(trigger);
      if (index >= 0) triggers.splice(index, 1);
    },
    newTrigger(handler) {
      return {
        timeBased() { return this; },
        after() { return this; },
        create() {
          const trigger = { getHandlerFunction: () => handler, getUniqueId: () => 'active-historical-trigger' };
          triggers.push(trigger);
          return trigger;
        }
      };
    }
  };
  const config = { HISTORICAL_RETRY_HANDLER: 'retomarFilaHistoricaDocumentalistas', RETRY_TRIGGER_DELAY_MS: 300000 };
  equal(sandbox.DocumentalistasHistoricalImport.scheduleRetryQueue(config, null), true);
  equal(propertyBag.HISTORICAL_RETRY_TRIGGER_UID, 'active-historical-trigger');
  equal(sandbox.DocumentalistasHistoricalImport.scheduleRetryQueue(config, null), false);
  equal(triggers.length, 1);
  equal(triggers[0].getUniqueId(), 'active-historical-trigger');
  delete propertyBag.HISTORICAL_RETRY_TRIGGER_UID;
});

test('disparo reconhece seu UID e libera o agendamento da continuação seguinte', () => {
  propertyBag.HISTORICAL_RETRY_TRIGGER_UID = 'consumed-trigger';
  equal(sandbox.DocumentalistasWorkflow.acknowledgeScheduledTrigger({ triggerUid: 'other-trigger' }, 'HISTORICAL_RETRY_TRIGGER_UID'), false);
  equal(propertyBag.HISTORICAL_RETRY_TRIGGER_UID, 'consumed-trigger');
  equal(sandbox.DocumentalistasWorkflow.acknowledgeScheduledTrigger({ triggerUid: 'consumed-trigger' }, 'HISTORICAL_RETRY_TRIGGER_UID'), true);
  equal(propertyBag.HISTORICAL_RETRY_TRIGGER_UID, undefined);
});

test('retomada pós-pausa amplia somente o fim e preserva o checkpoint', () => {
  const checkpoint = {
    activationStartIso: '2026-09-17T20:50:23.581Z',
    startRow: 2,
    endRow: 11,
    nextRow: 12
  };
  const resumed = sandbox.DocumentalistasHistoricalImport.calculateResume(checkpoint, 22);
  equal(resumed.previousEndRow, 11);
  equal(resumed.endRow, 22);
  equal(resumed.nextRow, 12);
  equal(resumed.newlyIncludedRows, 11);
  equal(resumed.pendingRows, 11);

  const unchanged = sandbox.DocumentalistasHistoricalImport.calculateResume(checkpoint, 10);
  equal(unchanged.endRow, 11);
  equal(unchanged.pendingRows, 0);
});

test('seleciona somente linhas históricas em erro dentro do recorte', () => {
  const values = [
    ['source-2', 'sheet', 'gid', '2', 'synthetic-2', 'COMPLETED'],
    ['source-3', 'sheet', 'gid', '3', 'synthetic-3', 'ERROR'],
    ['source-3-duplicate', 'sheet', 'gid', '3', 'synthetic-3', 'ERROR'],
    ['source-12', 'sheet', 'gid', '12', 'synthetic-12', 'ERROR'],
    ['source-24', 'sheet', 'gid', '24', 'synthetic-24', 'ERROR']
  ];
  equal(JSON.stringify(sandbox.DocumentalistasHistoricalImport.errorRowsFromLogValues(values, 2, 23)), JSON.stringify([3, 12]));
});

test('valida e ordena um lote explícito de linhas históricas sem ampliar o recorte', () => {
  const selected = sandbox.DocumentalistasHistoricalImport.parseSelectedRows('15, 3,4,5,6,8,9,10,3', 2, 23, 20);
  equal(JSON.stringify(selected), JSON.stringify([3, 4, 5, 6, 8, 9, 10, 15]));
  throwsCode(() => sandbox.DocumentalistasHistoricalImport.parseSelectedRows('3,x', 2, 23, 20), 'INVALID_HISTORICAL_ROW_LIST');
  throwsCode(() => sandbox.DocumentalistasHistoricalImport.parseSelectedRows('3,24', 2, 23, 20), 'HISTORICAL_ROW_OUT_OF_RANGE');
});

test('fila histórica ignora somente estados integralmente concluídos', () => {
  const config = { RESPONSE_SPREADSHEET_ID: 'sheet-id', RESPONSE_SHEET_ID: 'gid-1' };
  const states = [
    {
      status: 'COMPLETED', stage: 'COMPLETED', folderId: 'folder-3', contractId: 'contract-3', spreadsheetId: 'sheet-3',
      responseIds: ['sheet:sheet-id:gid-1:row:3']
    },
    {
      status: 'PROCESSING', stage: 'CONTRACT_READY', folderId: 'folder-9', contractId: 'contract-9', spreadsheetId: '',
      responseIds: ['sheet:sheet-id:gid-1:row:9']
    },
    {
      status: 'COMPLETED', stage: 'COMPLETED', folderId: 'folder-15', contractId: 'contract-15', spreadsheetId: '',
      responseIds: ['sheet:sheet-id:gid-1:row:15']
    }
  ];
  equal(
    JSON.stringify(sandbox.DocumentalistasHistoricalImport.pendingHistoricalRows([3, 9, 10, 15], states, config)),
    JSON.stringify([9, 10, 15])
  );
});

test('fila histórica tolera propriedade corrompida sem inventar linhas', () => {
  propertyBag.HISTORICAL_RETRY_QUEUE_ROWS = '{invalido';
  equal(JSON.stringify(sandbox.DocumentalistasHistoricalImport.parseRetryQueue(sandbox.PropertiesService.getScriptProperties())), '[]');
  delete propertyBag.HISTORICAL_RETRY_QUEUE_ROWS;
});

test('expurgo retira somente a linha selecionada da fila histórica e limpa o voo correspondente', () => {
  propertyBag.HISTORICAL_RETRY_QUEUE_ROWS = JSON.stringify([2, 3, 7]);
  propertyBag.HISTORICAL_RETRY_QUEUE_MODE = 'ALL_PENDING';
  propertyBag.HISTORICAL_RETRY_IN_FLIGHT_ROW = '3';
  propertyBag.HISTORICAL_RETRY_IN_FLIGHT_AT = String(Date.now());
  const remaining = sandbox.DocumentalistasHistoricalImport.removeRetryRow(sandbox.PropertiesService.getScriptProperties(), 3);
  equal(JSON.stringify(remaining), JSON.stringify([2, 7]));
  equal(propertyBag.HISTORICAL_RETRY_QUEUE_ROWS, JSON.stringify([2, 7]));
  equal(propertyBag.HISTORICAL_RETRY_IN_FLIGHT_ROW, undefined);
  equal(propertyBag.HISTORICAL_RETRY_IN_FLIGHT_AT, undefined);
  delete propertyBag.HISTORICAL_RETRY_QUEUE_ROWS;
  delete propertyBag.HISTORICAL_RETRY_QUEUE_MODE;
});

test('checkpoint do expurgo é validado e bloqueia retomada da mesma linha', () => {
  delete propertyBag.HISTORICAL_PURGE_ACTIVE_JSON;
  equal(sandbox.lerCheckpointExpurgoHistorico_(sandbox.PropertiesService.getScriptProperties()), null);
  propertyBag.HISTORICAL_PURGE_ACTIVE_JSON = JSON.stringify({
    sourceRow: 3,
    sourceKey: 'sheet:gid:3',
    syntheticResponseId: 'sheet:sheet:gid:row:3',
    originalResponseId: 'forms-response-3',
    identityKey: 'identity-3',
    steps: {}
  });
  equal(sandbox.lerCheckpointExpurgoHistorico_(sandbox.PropertiesService.getScriptProperties()).sourceRow, 3);
  propertyBag.HISTORICAL_IMPORT_START_ROW = '2';
  propertyBag.HISTORICAL_IMPORT_END_ROW = '10';
  throwsCode(() => sandbox.DocumentalistasHistoricalImport.retryRow(3), 'HISTORICAL_ROW_PURGE_IN_PROGRESS');
  propertyBag.HISTORICAL_PURGE_ACTIVE_JSON = '{invalido';
  throwsCode(() => sandbox.lerCheckpointExpurgoHistorico_(sandbox.PropertiesService.getScriptProperties()), 'INVALID_HISTORICAL_PURGE_CHECKPOINT');
  delete propertyBag.HISTORICAL_PURGE_ACTIVE_JSON;
  delete propertyBag.HISTORICAL_IMPORT_START_ROW;
  delete propertyBag.HISTORICAL_IMPORT_END_ROW;
});

test('padrão de pasta usa somente um par de parênteses', () => {
  const identity = { displayName: 'NOME TESTE', formattedDocument: '000.000.000-00' };
  equal(sandbox.DocumentalistasConfig.DEFAULTS.FOLDER_NAME_PATTERN, '{{nomeCompletoDocumentalista}}, ({{cpfCnpjDocumentalista}})');
  equal(sandbox.DocumentalistasDrive.renderName(sandbox.DocumentalistasConfig.DEFAULTS.FOLDER_NAME_PATTERN, identity), 'NOME TESTE, (000.000.000-00)');
});

test('pasta técnica usa o nome operacional compartilhado no singular', () => {
  equal(sandbox.DocumentalistasConfig.DEFAULTS.TECHNICAL_FOLDER_NAME, '._automacao_documentalista');
});

test('release oficial v1 migra automaticamente para v2 sem sobrescrever template customizado', () => {
  const legacy = sandbox.DocumentalistasConfig.LEGACY_TEMPLATE_RELEASES;
  for (const entityType of ['PF', 'PJ']) {
    const prefix = `CONTRACT_TEMPLATE_${entityType}`;
    propertyBag[`${prefix}_SOURCE_ID`] = legacy[entityType].sourceId;
    propertyBag[`${prefix}_DOC_ID`] = legacy[entityType].docId;
    propertyBag[`${prefix}_HASH`] = legacy[entityType].hash;
    propertyBag[`${prefix}_VERSION`] = legacy[entityType].version;
  }
  propertyBag.CONTRACT_TEMPLATE_SOURCE_ID = legacy.PJ.sourceId;
  propertyBag.CONTRACT_TEMPLATE_DOC_ID = legacy.PJ.docId;
  propertyBag.CONTRACT_TEMPLATE_HASH = legacy.PJ.hash;
  propertyBag.CONTRACT_TEMPLATE_VERSION = legacy.PJ.version;
  const migrated = sandbox.DocumentalistasConfig.get();
  equal(migrated.CONTRACT_TEMPLATE_PF_VERSION, 'definitivo-pf-2026-09-v2');
  equal(migrated.CONTRACT_TEMPLATE_PJ_VERSION, 'definitivo-2026-09-v2');
  equal(propertyBag.CONTRACT_TEMPLATE_VERSION, 'definitivo-2026-09-v2');

  propertyBag.CONTRACT_TEMPLATE_PF_SOURCE_ID = 'custom-source';
  propertyBag.CONTRACT_TEMPLATE_PF_DOC_ID = 'custom-doc';
  propertyBag.CONTRACT_TEMPLATE_PF_HASH = 'custom-hash';
  propertyBag.CONTRACT_TEMPLATE_PF_VERSION = 'custom-v3';
  const preserved = sandbox.DocumentalistasConfig.get();
  equal(preserved.CONTRACT_TEMPLATE_PF_SOURCE_ID, 'custom-source');
  equal(preserved.CONTRACT_TEMPLATE_PF_VERSION, 'custom-v3');
  for (const key of Object.keys(propertyBag)) {
    if (key.indexOf('CONTRACT_TEMPLATE') === 0) delete propertyBag[key];
  }
});

test('seleção/versionamento local do template é repetível e exige escolha entre múltiplos DOCX', async () => {
  const lib = await import(path.join(root, 'tools', 'lib', 'template-files.mjs'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'documentalistas-template-test-'));
  fs.writeFileSync(path.join(dir, 'a.docx'), 'fixture-sintetica-a');
  equal(path.basename(lib.selectDocx(dir)), 'a.docx');
  const hash = lib.hashFile(path.join(dir, 'a.docx'));
  equal(lib.versionFromHash(hash), lib.versionFromHash(hash));
  fs.writeFileSync(path.join(dir, 'b.docx'), 'fixture-sintetica-b');
  try { lib.selectDocx(dir); throw new Error('expected selection error'); } catch (error) { equal(error.code, 'TEMPLATE_SELECTION_REQUIRED'); }
  equal(path.basename(lib.selectDocx(dir, 'b.docx')), 'b.docx');
});

test('preparação do template definitivo mapeia qualificação, pagamento e assinatura', async () => {
  const lib = await import(path.join(root, 'tools', 'prepare-template.mjs'));
  const qualification = lib.qualificationSegments().map((segment) => segment.text).join('');
  assert(qualification.includes('{{nomeCompletoDocumentalista}}'));
  assert(qualification.includes('{{enderecoCompletoRepresentante}}'));
  const bank = lib.bankSegments('INCISO I – pagamento através de transferência bancária, para a conta indicada pelo CONTRATADO, qual seja, xxxxx – Banco xxxx, Agência: 0001, Conta Corrente: xxxxxxx, Chave Pix: xxxxxxx, desde que').map((segment) => segment.text).join('');
  assert(bank.includes('{{formaPagamento}}'));
  assert(bank.includes('{{codigoBanco}}'));
  assert(bank.includes('{{agenciaBancaria}}'));
  assert(bank.includes('{{tipoContaBancaria}}: {{contaBancaria}}'));
  assert(!/Banco xxxx/i.test(bank));
  equal(lib.signatureNameSegments()[0].text, '{{nomeCompletoDocumentalista}}');
});

test('versão PF deriva do contrato PJ sem representação societária e é idempotente', async () => {
  const creator = await import(path.join(root, 'tools', 'create-pf-template.mjs'));
  const validator = await import(path.join(root, 'tools', 'validate-template.mjs'));
  const qualification = creator.qualificationPfSegments().map((segment) => segment.text).join('');
  assert(qualification.startsWith('CONTRATADA: {{nomeCompletoDocumentalista}}'));
  assert(qualification.includes('{{nacionalidadePessoaFisica}}'));
  assert(qualification.includes('{{rgPessoaFisica}}'));
  assert(qualification.includes('CPF nº {{cpfCnpjDocumentalista}}'));
  assert(!/pessoa jurídica|sóci[oa]|representante/i.test(qualification));
  const created = creator.createPfTemplate();
  equal(created.changed, false);
  equal(JSON.stringify(created.supportedEntityTypes), JSON.stringify(['PF']));
  const pf = validator.validateTemplate({ file: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS - PF.docx', version: 'definitivo-pf-2026-09-v2' });
  const pj = validator.validateTemplate({ file: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS.docx', version: 'definitivo-2026-09-v2' });
  equal(JSON.stringify(pf.supportedEntityTypes), JSON.stringify(['PF']));
  equal(JSON.stringify(pj.supportedEntityTypes), JSON.stringify(['PJ']));
  const pfInput = extract('form-response-pf.json');
  const pjInput = extract('form-response-pj.json');
  assert(pf.placeholders.every((placeholder) => Object.prototype.hasOwnProperty.call(pfInput.placeholders, placeholder)), 'Fixture PF não fornece todos os placeholders do template PF');
  assert(pj.placeholders.every((placeholder) => Object.prototype.hasOwnProperty.call(pjInput.placeholders, placeholder)), 'Fixture PJ não fornece todos os placeholders do template PJ');
});

(async () => {
  let passed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      process.stdout.write(`✓ ${name}\n`);
    } catch (error) {
      process.stderr.write(`✗ ${name}\n  ${error.stack || error.message}\n`);
      process.exitCode = 1;
    }
  }
  process.stdout.write(`\n${passed}/${tests.length} testes aprovados.\n`);
})();
