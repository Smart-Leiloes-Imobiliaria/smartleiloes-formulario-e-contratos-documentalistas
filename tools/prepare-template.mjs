import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, selectDocx, coded } from './lib/template-files.mjs';
import { validateTemplate } from './validate-template.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), '..');

export function qualificationSegments() {
  return [
    { text: 'CONTRATADA: ', bold: true },
    { text: '{{nomeCompletoDocumentalista}}' },
    { text: ', pessoa jurídica de direito privado inscrita sob o CNPJ de nº ' },
    { text: '{{cpfCnpjDocumentalista}}' },
    { text: ', com sede em ' },
    { text: '{{enderecoCompletoDocumentalista}}' },
    { text: ', neste ato representada pelo sócio ' },
    { text: '{{nomeRepresentante}}' },
    { text: ', ' },
    { text: '{{nacionalidadeRepresentante}}' },
    { text: ', ' },
    { text: '{{estadoCivilRepresentante}}' },
    { text: ', ' },
    { text: '{{profissaoRepresentante}}' },
    { text: ', portador do RG de nº ' },
    { text: '{{rgRepresentante}}' },
    { text: ', inscrito no CPF sob nº ' },
    { text: '{{cpfRepresentante}}' },
    { text: ', residente e domiciliado em ' },
    { text: '{{enderecoCompletoRepresentante}}' },
    { text: '.' }
  ];
}

export function bankSegments(originalText) {
  const marker = /através de transferência bancária, para a conta indicada pelo CONTRATADO, qual seja, xxxxx\s*[–-]\s*Banco xxxx, Agência: 0001, Conta Corrente: xxxxxxx, Chave Pix: xxxxxxx,/i;
  if (!marker.test(originalText)) throw coded('TEMPLATE_BANK_MARKER_NOT_FOUND', 'O trecho variável de pagamento não foi encontrado no parágrafo esperado.');
  const replacement = 'através de {{formaPagamento}}, para a conta indicada pela CONTRATADA, qual seja, Código do banco (COMPE): {{codigoBanco}}, Agência: {{agenciaBancaria}}, {{tipoContaBancaria}}: {{contaBancaria}}, {{tipoChavePix}}: {{chavePix}},';
  const updated = originalText.replace(marker, replacement);
  const prefix = updated.match(/^INCISO I\s*[–-]/i);
  return prefix ? [{ text: prefix[0], bold: true }, { text: updated.slice(prefix[0].length) }] : [{ text: updated }];
}

export function signatureDateSegments() {
  return [{ text: '{{localAssinatura}}, {{dataAssinatura}}.' }];
}

export function signatureNameSegments() {
  return [{ text: '{{nomeCompletoDocumentalista}}' }];
}

export function prepareTemplate(options = {}) {
  const templatesDir = path.join(projectRoot, 'templates');
  const filePath = selectDocx(templatesDir, options.file);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'documentalistas-template-prepare-'));
  const unpacked = path.join(scratch, 'unpacked');
  const output = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.prepared.tmp`);
  const backup = path.join(scratch, `${path.basename(filePath)}.before-placeholders.docx`);
  fs.mkdirSync(unpacked);
  fs.copyFileSync(filePath, backup);
  childProcess.execFileSync('unzip', ['-q', filePath, '-d', unpacked]);

  const documentXmlPath = path.join(unpacked, 'word', 'document.xml');
  let xml = fs.readFileSync(documentXmlPath, 'utf8');
  const existing = extractText(xml);
  const expected = [
    '{{nomeCompletoDocumentalista}}', '{{cpfCnpjDocumentalista}}', '{{nomeRepresentante}}',
    '{{formaPagamento}}', '{{codigoBanco}}', '{{chavePix}}', '{{dataAssinatura}}', '{{localAssinatura}}'
  ];
  const alreadyPrepared = expected.every((placeholder) => existing.includes(placeholder));

  if (!alreadyPrepared) {
    xml = replaceUniqueParagraph(xml, (text) => /^CONTRATADA:\s*X{5,}/i.test(text), qualificationSegments(), 'qualificação da contratada');
    xml = replaceUniqueParagraph(xml, (text) => text.includes('conta indicada pelo CONTRATADO') && /Banco xxxx/i.test(text), null, 'dados de pagamento', bankSegments);
    xml = replaceUniqueParagraph(xml, (text) => /^Nova Lima,\s*17\s+de\s+Setembro\s+de\s+2026\.$/i.test(normalizeSpaces(text)), signatureDateSegments(), 'data de assinatura');
    xml = replaceUniqueParagraph(xml, (text) => normalizeSpaces(text) === 'CONTRATADA', signatureNameSegments(), 'nome da contratada no bloco de assinatura');
    fs.writeFileSync(documentXmlPath, xml, 'utf8');
    try {
      childProcess.execFileSync('zip', ['-qr', output, '.'], { cwd: unpacked });
      childProcess.execFileSync('unzip', ['-tq', output]);
      fs.renameSync(output, filePath);
    } finally {
      if (fs.existsSync(output)) fs.unlinkSync(output);
    }
  }

  const validated = validateTemplate({ file: path.basename(filePath), version: options.version });
  return {
    filePath,
    backupPath: backup,
    changed: !alreadyPrepared,
    hash: validated.hash,
    version: validated.version,
    placeholders: validated.placeholders,
    supportedEntityTypes: validated.supportedEntityTypes
  };
}

function replaceUniqueParagraph(xml, predicate, segments, description, segmentFactory) {
  let matches = 0;
  const updated = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (paragraph) => {
    const text = paragraphText(paragraph);
    if (!predicate(text)) return paragraph;
    matches += 1;
    return rebuildParagraph(paragraph, segmentFactory ? segmentFactory(text) : segments);
  });
  if (matches !== 1) throw coded('TEMPLATE_STRUCTURE_CHANGED', `Esperado exatamente um parágrafo para ${description}; encontrados ${matches}.`);
  return updated;
}

function rebuildParagraph(paragraph, segments) {
  const opening = paragraph.match(/^<w:p(?:\s[^>]*)?>/);
  if (!opening) throw coded('INVALID_DOCX_PARAGRAPH', 'Parágrafo DOCX sem tag de abertura reconhecível.');
  const properties = paragraph.match(/<w:pPr(?:\s[^>]*)?>[\s\S]*?<\/w:pPr>/);
  return `${opening[0]}${properties ? properties[0] : ''}${segments.map(xmlRun).join('')}</w:p>`;
}

function xmlRun(segment) {
  const properties = segment.bold ? '<w:rPr><w:b/></w:rPr>' : '';
  return `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(segment.text)}</w:t></w:r>`;
}

function paragraphText(paragraph) {
  return [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1])).join('');
}

function extractText(xml) {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1])).join('\n');
}

function normalizeSpaces(value) { return String(value).replace(/\s+/g, ' ').trim(); }
function escapeXml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function decodeXml(value) { return String(value).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }

if (process.argv[1] === scriptPath) {
  try {
    const result = prepareTemplate(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.code || 'TEMPLATE_PREPARATION_ERROR'}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
