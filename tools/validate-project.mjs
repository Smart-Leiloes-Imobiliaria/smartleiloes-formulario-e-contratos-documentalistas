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
const expectedCodeFiles = 17;
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
if (manifest.webapp?.access !== 'ANYONE' || manifest.webapp?.executeAs !== 'USER_ACCESSING') throw new Error('Web app administrativo deve exigir login e executar como usuário acessando.');
const clasp = JSON.parse(fs.readFileSync(path.join(root, '.clasp.json'), 'utf8'));
if (clasp.scriptId !== '1EmkbYu2DGs2hSd6wBIT50ukyDyqAP_eNS6gU0XWyY5atYfHpMtbsKZof' || clasp.rootDir !== 'src' || clasp.skipSubdirectories !== false) throw new Error('.clasp.json aponta para projeto/rootDir/estrutura incorreto.');
const claspIgnore = fs.readFileSync(path.join(root, '.claspignore'), 'utf8');
if (!claspIgnore.includes('!**/*.html')) throw new Error('.claspignore não permite publicar o painel HTML.');
const fieldMap = fs.readFileSync(path.join(sourceDir, '00_core', 'field_map.js'), 'utf8');
const mappingCount = [...fieldMap.matchAll(/field\((\d+),/g)].length;
if (mappingCount !== 46) throw new Error(`Esperados 46 campos mapeados; encontrados ${mappingCount}.`);
if (files.length !== expectedCodeFiles) throw new Error(`Esperados ${expectedCodeFiles} arquivos Apps Script; encontrados ${files.length}.`);
const panelPath = path.join(sourceDir, '90_operations', 'AdminPanel.html');
if (!fs.existsSync(panelPath)) throw new Error('Painel HTML administrativo ausente.');
const panel = fs.readFileSync(panelPath, 'utf8');
['diagnosticarLinhaExpurgoPainelDocumentalistas', 'expurgarLinhaPainelDocumentalistas', 'validarTemplatePainelDocumentalistas', 'publicarEAtivarTemplatePainelDocumentalistas'].forEach((entrypoint) => {
  if (!panel.includes(entrypoint)) throw new Error(`Painel HTML sem integração com ${entrypoint}.`);
});
process.stdout.write(`Projeto válido: ${files.length} arquivos Apps Script e painel HTML em arquitetura 00/10/90, ${mappingCount} campos, Drive v3 e V8.\n`);
