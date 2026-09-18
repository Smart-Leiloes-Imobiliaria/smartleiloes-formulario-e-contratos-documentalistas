import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';

const SPREADSHEET_ID = '18xtCdLKVk-WKcenh6bR468P4yeHXCpAtbHHo_521qN4';
const SHEET_ID = 1808239713;

async function main() {
  const token = await refreshClaspToken();
  try {
    await inspectWithSheetsApi(token);
  } catch (error) {
    if (error.code !== 'SHEETS_API_DISABLED') throw error;
    await inspectWithAuthenticatedCsv(token);
  }
}

async function inspectWithSheetsApi(token) {
  const metadata = await sheetsApi(token, `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?includeGridData=false&fields=spreadsheetId,properties(title,locale,timeZone),sheets(properties(sheetId,title,index,hidden,gridProperties))`);
  const target = (metadata.sheets || []).map((sheet) => sheet.properties).find((sheet) => sheet.sheetId === SHEET_ID);
  if (!target) throw coded('RESPONSE_SHEET_TAB_NOT_FOUND', `A aba gid=${SHEET_ID} não existe na planilha configurada.`);
  const quotedTitle = `'${String(target.title).replace(/'/g, "''")}'`;
  const [headerResult, timestampResult] = await Promise.all([
    sheetsApi(token, `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`${quotedTitle}!1:1`)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`),
    sheetsApi(token, `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`${quotedTitle}!A2:A`)}?majorDimension=COLUMNS&valueRenderOption=UNFORMATTED_VALUE`)
  ]);
  const headers = headerResult.values?.[0] || [];
  const normalized = headers.map(normalizeHeader);
  const duplicates = normalized.filter((value, index) => value && normalized.indexOf(value) !== index);
  const result = {
    spreadsheetId: SPREADSHEET_ID,
    title: metadata.properties?.title,
    locale: metadata.properties?.locale,
    timeZone: metadata.properties?.timeZone,
    sheetId: target.sheetId,
    sheetTitle: target.title,
    gridRows: target.gridProperties?.rowCount,
    gridColumns: target.gridProperties?.columnCount,
    responseRows: timestampResult.values?.[0]?.filter((value) => value !== '').length || 0,
    headers,
    duplicateNormalizedHeaders: [...new Set(duplicates)]
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function inspectWithAuthenticatedCsv(token) {
  const response = await fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'follow'
  });
  if (!response.ok) return inspectWithDriveExport(token);
  const rows = parseCsv(await response.text());
  const headers = rows[0] || [];
  const normalized = headers.map(normalizeHeader);
  const duplicates = normalized.filter((value, index) => value && normalized.indexOf(value) !== index);
  process.stdout.write(`${JSON.stringify({
    spreadsheetId: SPREADSHEET_ID,
    sheetId: SHEET_ID,
    responseRows: Math.max(rows.filter((row, index) => index > 0 && row.some((value) => value !== '')).length, 0),
    headers,
    duplicateNormalizedHeaders: [...new Set(duplicates)],
    inspectionTransport: 'authenticated-csv-export',
    note: 'A API Sheets do cliente OAuth do clasp está desabilitada; nenhum valor de resposta foi exibido.'
  }, null, 2)}\n`);
}

async function inspectWithDriveExport(token) {
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${SPREADSHEET_ID}/export?mimeType=${encodeURIComponent(mime)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw coded(response.status === 403 ? 'SHEETS_AUTHORIZATION_OR_PERMISSION_DENIED' : 'SHEET_XLSX_EXPORT_ERROR', `Exportação XLSX ${response.status}.`);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'documentalistas-responses-'));
  const input = path.join(scratch, 'responses.xlsx');
  try {
    fs.writeFileSync(input, Buffer.from(await response.arrayBuffer()));
    childProcess.execFileSync('libreoffice', ['--headless', '--convert-to', 'csv', '--outdir', scratch, input], { stdio: 'ignore' });
    const csv = path.join(scratch, 'responses.csv');
    if (!fs.existsSync(csv)) throw coded('SHEET_XLSX_CONVERSION_FAILED', 'O XLSX foi exportado, mas a conversão local para CSV falhou.');
    const rows = parseCsv(fs.readFileSync(csv, 'utf8'));
    const headers = rows[0] || [];
    const normalized = headers.map(normalizeHeader);
    const duplicates = normalized.filter((value, index) => value && normalized.indexOf(value) !== index);
    process.stdout.write(`${JSON.stringify({
      spreadsheetId: SPREADSHEET_ID,
      configuredSheetId: SHEET_ID,
      responseRows: rows.filter((row, index) => index > 0 && row.some((value) => value !== '')).length,
      headers,
      duplicateNormalizedHeaders: [...new Set(duplicates)],
      inspectionTransport: 'drive-xlsx-export',
      note: 'A API Sheets do cliente OAuth do clasp está desabilitada; o XLSX foi lido localmente e nenhum valor de resposta foi exibido.'
    }, null, 2)}\n`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === ',') { row.push(cell); cell = ''; }
    else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function normalizeHeader(value) {
  return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
}

async function refreshClaspToken() {
  const claspPath = path.join(process.env.HOME, '.clasprc.json');
  if (!fs.existsSync(claspPath)) throw coded('CLASP_AUTH_MISSING', 'Execute clasp login antes da inspeção.');
  const tokens = JSON.parse(fs.readFileSync(claspPath, 'utf8')).tokens?.default;
  if (!tokens?.refresh_token || !tokens?.client_id || !tokens?.client_secret) throw coded('CLASP_AUTH_INVALID', 'Credencial clasp incompleta.');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: tokens.client_id, client_secret: tokens.client_secret, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' })
  });
  const payload = await response.json();
  if (!response.ok) throw coded('CLASP_AUTH_REFRESH_FAILED', `Falha OAuth ${response.status}: ${payload.error || 'sem detalhe'}`);
  return payload.access_token;
}

async function sheetsApi(token, url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json();
  if (!response.ok) {
    const message = payload.error?.message || 'sem detalhe';
    const disabled = response.status === 403 && /has not been used|is disabled/i.test(message);
    throw coded(disabled ? 'SHEETS_API_DISABLED' : (response.status === 403 ? 'SHEETS_AUTHORIZATION_OR_PERMISSION_DENIED' : 'SHEETS_API_ERROR'), `Sheets API ${response.status}: ${message}`);
  }
  return payload;
}

function coded(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

main().catch((error) => {
  process.stderr.write(`${error.code || 'RESPONSE_SHEET_INSPECTION_ERROR'}: ${error.message}\n`);
  process.exitCode = 1;
});
