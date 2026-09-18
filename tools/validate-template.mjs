import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectDocx, hashFile, versionFromHash, parseArgs, coded } from './lib/template-files.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function validateTemplate(options = {}) {
  const templatesDir = path.join(projectRoot, 'templates');
  const filePath = selectDocx(templatesDir, options.file || process.env.TEMPLATE_FILE);
  const entries = childProcess.execFileSync('unzip', ['-Z1', filePath], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((entry) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(entry));
  if (!entries.includes('word/document.xml')) throw coded('INVALID_DOCX', 'DOCX sem word/document.xml.');

  const paragraphs = [];
  for (const entry of entries) {
    const xml = childProcess.execFileSync('unzip', ['-p', filePath, entry], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    const paragraphMatches = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];
    for (const paragraph of paragraphMatches) {
      const textNodes = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1]));
      const text = textNodes.join('');
      for (const placeholder of unique(text.match(/\{\{[A-Za-z][A-Za-z0-9_]*\}\}/g) || [])) {
        const supportedOccurrences = textNodes.reduce((total, node) => total + countOccurrences(node, placeholder), 0);
        if (supportedOccurrences < countOccurrences(text, placeholder)) {
          throw coded('FRAGMENTED_TEMPLATE_PLACEHOLDER', `Placeholder fragmentado entre runs em ${entry}: ${placeholder}`);
        }
      }
      paragraphs.push({ entry, text });
    }
  }

  const found = unique(paragraphs.flatMap(({ text }) => text.match(/\{\{[A-Za-z][A-Za-z0-9_]*\}\}/g) || []));
  const allowed = allowedPlaceholders();
  const required = ['{{nomeCompletoDocumentalista}}', '{{cpfCnpjDocumentalista}}', '{{dataAssinatura}}', '{{localAssinatura}}'];
  const unknown = found.filter((placeholder) => !allowed.includes(placeholder));
  const missing = required.filter((placeholder) => !found.includes(placeholder));
  const malformed = paragraphs.filter(({ text }) => {
    const withoutValid = text.replace(/\{\{[A-Za-z][A-Za-z0-9_]*\}\}/g, '');
    return withoutValid.includes('{{') || withoutValid.includes('}}');
  }).map(({ entry }) => entry);
  if (unknown.length) throw coded('UNKNOWN_TEMPLATE_PLACEHOLDER', `Placeholders sem mapeamento: ${unknown.join(', ')}`);
  if (missing.length) throw coded('REQUIRED_TEMPLATE_PLACEHOLDER_MISSING', `Placeholders mínimos ausentes: ${missing.join(', ')}`);
  if (malformed.length) throw coded('MALFORMED_TEMPLATE_PLACEHOLDER', `Construção de placeholder inválida em: ${unique(malformed).join(', ')}`);

  const supportedEntityTypes = inferSupportedEntityTypes(found);

  const hash = hashFile(filePath);
  return {
    filePath,
    fileName: path.basename(filePath),
    hash,
    version: versionFromHash(hash, options.version),
    placeholders: found,
    supportedEntityTypes,
    xmlParts: entries
  };
}

function inferSupportedEntityTypes(placeholders) {
  const source = fs.readFileSync(path.join(projectRoot, 'src', '00_core', 'field_map.js'), 'utf8');
  const rules = new Map([...source.matchAll(/field\(\d+,\s*'[^']+',\s*'(\{\{[A-Za-z][A-Za-z0-9_]*\}\})',\s*'[^']*',\s*'[^']+',\s*'(PF|PJ)'/g)]
    .map((match) => [match[1], match[2]]));
  const hasPf = placeholders.some((placeholder) => rules.get(placeholder) === 'PF');
  const hasPj = placeholders.some((placeholder) => rules.get(placeholder) === 'PJ');
  if (hasPf && hasPj) throw coded('UNSUPPORTED_MIXED_ENTITY_TEMPLATE', 'O DOCX mistura placeholders PF e PJ sem blocos condicionais suportados.');
  if (hasPf) return ['PF'];
  if (hasPj) return ['PJ'];
  return ['PF', 'PJ'];
}

function allowedPlaceholders() {
  const source = fs.readFileSync(path.join(projectRoot, 'src', '00_core', 'field_map.js'), 'utf8');
  return unique(source.match(/\{\{[A-Za-z][A-Za-z0-9_]*\}\}/g) || []);
}

function decodeXml(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function unique(values) {
  return [...new Set(values)];
}

function countOccurrences(text, token) {
  return String(text || '').split(token).length - 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = validateTemplate(args);
    process.stdout.write(`${JSON.stringify({ status: 'VALID', fileName: result.fileName, hash: result.hash, version: result.version, placeholders: result.placeholders, supportedEntityTypes: result.supportedEntityTypes, xmlParts: result.xmlParts }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.code || 'TEMPLATE_VALIDATION_ERROR'}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
