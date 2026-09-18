import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTemplate } from './validate-template.mjs';
import { parseArgs, coded } from './lib/template-files.mjs';

const ROOT_FOLDER_ID = '1W2jIPu6AUnl4-sqa3pj-GXICVREZUUN_';
const TECHNICAL_FOLDER_NAME = '._automacao_documentalistas';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), '..');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const validated = validateTemplate(args);
  if (validated.supportedEntityTypes.length !== 1) throw coded('TEMPLATE_ENTITY_TYPE_REQUIRED', 'O template sincronizado deve ser exclusivo para PF ou PJ.');
  const entityType = validated.supportedEntityTypes[0];
  const accessToken = await refreshClaspToken();
  const root = await driveGet(accessToken, ROOT_FOLDER_ID, 'id,name,mimeType,driveId,capabilities(canAddChildren)');
  if (root.mimeType !== 'application/vnd.google-apps.folder' || !root.capabilities?.canAddChildren) {
    throw coded('ROOT_PERMISSION_DENIED', 'A credencial local não pode criar itens em ROOT_FOLDER_ID.');
  }
  const technical = await ensureTechnicalFolder(accessToken, root);
  const sourceProperties = { sl_kind: 'contract_template_source', sl_template_hash: validated.hash, sl_template_version: validated.version };
  const docProperties = { sl_kind: 'contract_template_doc', sl_template_hash: validated.hash, sl_template_version: validated.version };

  let source = await findUnique(accessToken, technical.id, root.driveId, sourceProperties, DOCX_MIME);
  if (!source) {
    source = await multipartUpload(accessToken, {
      name: `${path.basename(validated.filePath, '.docx')} - ${validated.version}.docx`,
      mimeType: DOCX_MIME,
      parents: [technical.id],
      properties: sourceProperties,
      appProperties: sourceProperties
    }, fs.readFileSync(validated.filePath), DOCX_MIME);
  }

  docProperties.sl_template_source_id = source.id;
  let converted = await findUnique(accessToken, technical.id, root.driveId, docProperties, GOOGLE_DOC_MIME);
  if (!converted) {
    converted = await multipartUpload(accessToken, {
      name: `${path.basename(validated.filePath, '.docx')} - ${validated.version} [PROCESSAMENTO]`,
      mimeType: GOOGLE_DOC_MIME,
      parents: [technical.id],
      properties: docProperties,
      appProperties: docProperties
    }, fs.readFileSync(validated.filePath), DOCX_MIME);
  }

  const [verifiedSource, verifiedDoc] = await Promise.all([
    driveGet(accessToken, source.id, 'id,name,mimeType,parents,properties,appProperties'),
    driveGet(accessToken, converted.id, 'id,name,mimeType,parents,properties,appProperties')
  ]);
  if (!verifiedSource.parents?.includes(technical.id) || !verifiedDoc.parents?.includes(technical.id)) {
    throw coded('TEMPLATE_PARENT_MISMATCH', 'Os modelos provisionados não ficaram na pasta técnica esperada.');
  }

  const result = {
    entityType,
    sourceDocxId: verifiedSource.id,
    convertedDocId: verifiedDoc.id,
    sha256: validated.hash,
    version: validated.version,
    supportedEntityTypes: validated.supportedEntityTypes,
    technicalFolderId: technical.id,
    runtimeSource: 'DOCX_OOXML',
    convertedPreviewOnly: true,
    reusedSource: source.reused === true,
    reusedConverted: converted.reused === true
  };
  fs.writeFileSync(path.join(projectRoot, `template-sync-result-${entityType}.json`), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write('No editor Apps Script, abra Configurações do projeto > Propriedades do script e grave:\n');
  process.stdout.write(`CONTRACT_TEMPLATE_${entityType}_SOURCE_ID=${result.sourceDocxId}\n`);
  process.stdout.write(`CONTRACT_TEMPLATE_${entityType}_DOC_ID=${result.convertedDocId}\n`);
  process.stdout.write(`CONTRACT_TEMPLATE_${entityType}_HASH=${result.sha256}\n`);
  process.stdout.write(`CONTRACT_TEMPLATE_${entityType}_VERSION=${result.version}\n`);
  process.stdout.write('Depois execute validarTemplateContratoDocumentalistas().\n');
}

export async function refreshClaspToken() {
  const claspPath = path.join(process.env.HOME, '.clasprc.json');
  if (!fs.existsSync(claspPath)) throw coded('CLASP_AUTH_MISSING', 'Arquivo ~/.clasprc.json não encontrado; execute clasp login.');
  const tokens = JSON.parse(fs.readFileSync(claspPath, 'utf8')).tokens?.default;
  if (!tokens?.refresh_token || !tokens?.client_id || !tokens?.client_secret) throw coded('CLASP_AUTH_INVALID', 'Credencial clasp não contém refresh token utilizável.');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: tokens.client_id, client_secret: tokens.client_secret, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' })
  });
  const payload = await response.json();
  if (!response.ok) throw coded('CLASP_AUTH_REFRESH_FAILED', `Falha OAuth ${response.status}: ${payload.error || 'sem detalhe'}`);
  return payload.access_token;
}

async function driveGet(token, id, fields) {
  return api(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=${encodeURIComponent(fields)}`);
}

async function ensureTechnicalFolder(token, root) {
  const properties = { sl_kind: 'documentalistas_technical_root' };
  let folder = await findUnique(token, root.id, root.driveId, properties, 'application/vnd.google-apps.folder');
  if (folder) return folder;
  return api(token, 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,mimeType,parents,driveId,properties,appProperties', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: TECHNICAL_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: [root.id], properties, appProperties: properties })
  });
}

async function findUnique(token, parentId, driveId, properties, mimeType) {
  let q = `'${escapeQuery(parentId)}' in parents and trashed = false and mimeType = '${escapeQuery(mimeType)}'`;
  for (const [key, value] of Object.entries(properties)) q += ` and properties has { key='${escapeQuery(key)}' and value='${escapeQuery(value)}' }`;
  const params = new URLSearchParams({ q, spaces: 'drive', pageSize: '100', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', fields: 'files(id,name,mimeType,parents,driveId,properties,appProperties)' });
  if (driveId) { params.set('corpora', 'drive'); params.set('driveId', driveId); }
  const result = await api(token, `https://www.googleapis.com/drive/v3/files?${params}`);
  if ((result.files || []).length > 1) throw coded('TEMPLATE_REMOTE_CONFLICT', 'Mais de um template remoto possui a mesma identidade/hash.');
  if (!result.files?.length) return null;
  return { ...result.files[0], reused: true };
}

async function multipartUpload(token, metadata, bytes, sourceMime) {
  const boundary = `codex-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const prefix = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${sourceMime}\r\n\r\n`);
  const suffix = Buffer.from(`\r\n--${boundary}--`);
  return api(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,parents,driveId,properties,appProperties', {
    method: 'POST',
    headers: { 'content-type': `multipart/related; boundary=${boundary}` },
    body: Buffer.concat([prefix, bytes, suffix])
  });
}

async function api(token, url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const payload = await response.json();
  if (!response.ok) throw coded(response.status === 403 ? 'DRIVE_AUTHORIZATION_OR_PERMISSION_DENIED' : 'DRIVE_API_ERROR', `Drive API ${response.status}: ${payload.error?.message || 'sem detalhe'}`);
  return payload;
}

function escapeQuery(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

if (process.argv[1] === scriptPath) {
  main().catch((error) => {
    process.stderr.write(`${error.code || 'TEMPLATE_SYNC_ERROR'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
