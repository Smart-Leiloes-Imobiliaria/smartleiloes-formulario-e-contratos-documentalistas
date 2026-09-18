import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'src');
function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(resolved);
    return /\.(gs|js)$/.test(entry.name) ? [resolved] : [];
  });
}

const files = sourceFiles(sourceDir).sort();
const forbidden = /\b(require\s*\(|process\.env|fs\.|import\s+[^('])/;
for (const filePath of files) {
  const relative = path.relative(sourceDir, filePath);
  const source = fs.readFileSync(filePath, 'utf8');
  new vm.Script(source, { filename: relative });
  if (forbidden.test(source)) throw new Error(`Node API não permitida no runtime Apps Script: ${relative}`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'appsscript.json'), 'utf8'));
if (manifest.timeZone !== 'America/Sao_Paulo' || manifest.runtimeVersion !== 'V8') throw new Error('Manifesto com runtime/fuso incorreto.');
if (!manifest.dependencies?.enabledAdvancedServices?.some((service) => service.serviceId === 'drive' && service.version === 'v3')) throw new Error('Drive API v3 não declarada.');
const clasp = JSON.parse(fs.readFileSync(path.join(root, '.clasp.json'), 'utf8'));
if (clasp.scriptId !== '1EmkbYu2DGs2hSd6wBIT50ukyDyqAP_eNS6gU0XWyY5atYfHpMtbsKZof' || clasp.rootDir !== 'src' || clasp.skipSubdirectories !== false) throw new Error('.clasp.json aponta para projeto/rootDir/estrutura incorreto.');
const fieldMap = fs.readFileSync(path.join(sourceDir, '00_core', 'field_map.js'), 'utf8');
const mappingCount = [...fieldMap.matchAll(/field\((\d+),/g)].length;
if (mappingCount !== 46) throw new Error(`Esperados 46 campos mapeados; encontrados ${mappingCount}.`);
process.stdout.write(`Projeto válido: ${files.length} arquivos Apps Script em arquitetura 00/10/90, ${mappingCount} campos, Drive v3 e V8.\n`);
