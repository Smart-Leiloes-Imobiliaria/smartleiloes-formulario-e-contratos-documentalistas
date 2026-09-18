import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FORM_ID = '1909wHJxDC5b4s2HXO3sd1t2Iydh7PpQRDQ1hzetoneM';
const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), '..');

async function main() {
  const response = await fetch(`https://docs.google.com/forms/d/${FORM_ID}/viewform`, { redirect: 'follow' });
  if (!response.ok) throw new Error(`FORM_FETCH_FAILED: HTTP ${response.status}`);
  const html = await response.text();
  const match = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.*?\]);<\/script>/s);
  if (!match) throw new Error('FORM_SCHEMA_NOT_FOUND');
  const data = JSON.parse(match[1]);
  const items = data[1][1].map((item) => ({
    itemId: item[0],
    title: item[1],
    publicType: item[3],
    responseEntries: Array.isArray(item[4]) ? item[4].map((entry) => ({ entryId: entry?.[0], required: Boolean(entry?.[2]), options: entry?.[1]?.map?.((option) => option?.[0]).filter(Boolean) || [] })) : []
  }));
  const source = fs.readFileSync(path.join(projectRoot, 'src', '00_core', 'field_map.js'), 'utf8');
  const mappedFields = [...source.matchAll(/field\((\d+),\s*'[^']*',\s*(?:null|'[^']*'),\s*'([^']*)'/g)]
    .map((entry) => ({ itemId: Number(entry[1]), title: entry[2] }));
  const mappedIds = mappedFields.map((entry) => entry.itemId);
  const answerItemIds = items.filter((item) => item.responseEntries.length).map((item) => item.itemId);
  const missing = answerItemIds.filter((id) => !mappedIds.includes(id));
  const stale = mappedIds.filter((id) => !answerItemIds.includes(id));
  const titleMismatches = items.filter((item) => item.responseEntries.length).map((item) => {
    const mapped = mappedFields.find((entry) => entry.itemId === item.itemId);
    return mapped && normalizeTitle(mapped.title) !== normalizeTitle(item.title)
      ? { itemId: item.itemId, mappedTitle: mapped.title, formTitle: item.title }
      : null;
  }).filter(Boolean);
  process.stdout.write(`${JSON.stringify({ formId: FORM_ID, title: data[1][8], totalItems: items.length, answerItems: answerItemIds.length, missingMappings: missing, staleMappings: stale, titleMismatches, items }, null, 2)}\n`);
  if (missing.length || stale.length || titleMismatches.length) process.exitCode = 1;
}

function normalizeTitle(value) {
  return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').replace(/:$/, '').toLocaleUpperCase('pt-BR');
}

if (process.argv[1] === scriptPath) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
