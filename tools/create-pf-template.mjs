import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { coded } from './lib/template-files.mjs';
import { validateTemplate } from './validate-template.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), '..');
const templatesDir = path.join(projectRoot, 'templates');
const sourcePath = path.join(templatesDir, 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS.docx');
const outputPath = path.join(templatesDir, 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS - PF.docx');

export function qualificationPfSegments() {
  return [
    { text: 'CONTRATADA: ', bold: true },
    { text: '{{nomeCompletoDocumentalista}}' },
    { text: ', de nacionalidade ' },
    { text: '{{nacionalidadePessoaFisica}}' },
    { text: ', estado civil ' },
    { text: '{{estadoCivilPessoaFisica}}' },
    { text: ', de profissão ' },
    { text: '{{profissaoPessoaFisica}}' },
    { text: ', titular do RG nº ' },
    { text: '{{rgPessoaFisica}}' },
    { text: ' e do CPF nº ' },
    { text: '{{cpfCnpjDocumentalista}}' },
    { text: ', com domicílio em ' },
    { text: '{{enderecoCompletoDocumentalista}}' },
    { text: '.' }
  ];
}

export function successionPfSegments() {
  return [{
    text: 'INCISO VII – Ocorrendo o falecimento da CONTRATADA ou dos representantes legais da CONTRATANTE, o presente contrato se resolverá sem qualquer ônus, indenização ou multa para os sucessores, sendo que, neste caso, será devido à CONTRATADA ou a seus sucessores apenas o valor proporcional aos serviços prestados.'
  }];
}

export function createPfTemplate() {
  if (!fs.existsSync(sourcePath)) throw coded('PJ_TEMPLATE_NOT_FOUND', `Template-base PJ não encontrado: ${sourcePath}`);
  const sourceValidation = validateTemplate({ file: path.basename(sourcePath), version: 'source-pj' });
  if (JSON.stringify(sourceValidation.supportedEntityTypes) !== JSON.stringify(['PJ'])) {
    throw coded('PJ_TEMPLATE_REQUIRED', 'A origem da versão PF deve ser o template validado exclusivamente como PJ.');
  }

  if (fs.existsSync(outputPath)) {
    const existing = validateTemplate({ file: path.basename(outputPath), version: 'definitivo-pf-2026-09-v2' });
    if (JSON.stringify(existing.supportedEntityTypes) !== JSON.stringify(['PF'])) {
      throw coded('PF_TEMPLATE_INVALID', 'O arquivo PF existente não é compatível exclusivamente com PF.');
    }
    return { changed: false, filePath: outputPath, hash: existing.hash, version: existing.version, placeholders: existing.placeholders, supportedEntityTypes: existing.supportedEntityTypes };
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'documentalistas-pf-template-'));
  const unpacked = path.join(scratch, 'unpacked');
  const staged = path.join(templatesDir, `.${path.basename(outputPath)}.${process.pid}.tmp`);
  fs.mkdirSync(unpacked);
  childProcess.execFileSync('unzip', ['-q', sourcePath, '-d', unpacked]);
  const documentPath = path.join(unpacked, 'word', 'document.xml');
  let xml = fs.readFileSync(documentPath, 'utf8');
  xml = replaceUniqueParagraph(xml, (text) => text.indexOf('CONTRATADA: {{nomeCompletoDocumentalista}}, pessoa jurídica') === 0, qualificationPfSegments(), 'qualificação PF');
  xml = replaceUniqueParagraph(xml, (text) => text.indexOf('INCISO VII – Ocorrendo o falecimento dos representantes legais das partes') === 0, successionPfSegments(), 'sucessão da CONTRATADA PF');
  fs.writeFileSync(documentPath, xml, 'utf8');
  try {
    childProcess.execFileSync('zip', ['-qr', staged, '.'], { cwd: unpacked });
    childProcess.execFileSync('unzip', ['-tq', staged]);
    fs.renameSync(staged, outputPath);
  } finally {
    if (fs.existsSync(staged)) fs.unlinkSync(staged);
  }
  const validation = validateTemplate({ file: path.basename(outputPath), version: 'definitivo-pf-2026-09-v2' });
  if (JSON.stringify(validation.supportedEntityTypes) !== JSON.stringify(['PF'])) {
    throw coded('PF_TEMPLATE_INVALID', 'A versão derivada não foi reconhecida exclusivamente como PF.');
  }
  return { changed: true, filePath: outputPath, hash: validation.hash, version: validation.version, placeholders: validation.placeholders, supportedEntityTypes: validation.supportedEntityTypes };
}

function replaceUniqueParagraph(xml, predicate, segments, description) {
  let matches = 0;
  const updated = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (paragraph) => {
    const text = paragraphText(paragraph);
    if (!predicate(text)) return paragraph;
    matches += 1;
    return rebuildParagraph(paragraph, segments);
  });
  if (matches !== 1) throw coded('PF_TEMPLATE_STRUCTURE_CHANGED', `Esperado exatamente um parágrafo para ${description}; encontrados ${matches}.`);
  return updated;
}

function rebuildParagraph(paragraph, segments) {
  const opening = paragraph.match(/^<w:p(?:\s[^>]*)?>/);
  const properties = paragraph.match(/<w:pPr(?:\s[^>]*)?>[\s\S]*?<\/w:pPr>/);
  if (!opening) throw coded('INVALID_DOCX_PARAGRAPH', 'Parágrafo DOCX sem tag de abertura reconhecível.');
  return `${opening[0]}${properties ? properties[0] : ''}${segments.map(xmlRun).join('')}</w:p>`;
}

function xmlRun(segment) {
  const properties = segment.bold ? '<w:rPr><w:b/></w:rPr>' : '';
  return `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(segment.text)}</w:t></w:r>`;
}

function paragraphText(paragraph) {
  return [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1])).join('');
}

function escapeXml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function decodeXml(value) { return String(value).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }

if (process.argv[1] === scriptPath) {
  try { process.stdout.write(`${JSON.stringify(createPfTemplate(), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.code || 'PF_TEMPLATE_CREATION_ERROR'}: ${error.message}\n`); process.exitCode = 1; }
}
