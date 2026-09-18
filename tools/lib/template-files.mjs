import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function selectDocx(directory, configuredFile) {
  const candidates = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((name) => /\.docx$/i.test(name)).sort()
    : [];
  if (configuredFile) {
    const resolved = path.resolve(directory, configuredFile);
    if (!fs.existsSync(resolved) || !/\.docx$/i.test(resolved)) {
      throw coded('TEMPLATE_FILE_NOT_FOUND', `DOCX configurado não encontrado: ${resolved}`);
    }
    return resolved;
  }
  if (!candidates.length) throw coded('TEMPLATE_NOT_CONFIGURED', 'Nenhum DOCX de produção foi encontrado em templates/.');
  if (candidates.length > 1) throw coded('TEMPLATE_SELECTION_REQUIRED', 'Há vários DOCX; use --file <nome.docx> ou TEMPLATE_FILE.');
  return path.join(directory, candidates[0]);
}

export function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function versionFromHash(hash, configuredVersion) {
  return configuredVersion || `sha256-${hash.slice(0, 12)}`;
}

export function coded(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--file') result.file = argv[++index];
    else if (argv[index] === '--version') result.version = argv[++index];
    else throw coded('INVALID_ARGUMENT', `Argumento desconhecido: ${argv[index]}`);
  }
  return result;
}
