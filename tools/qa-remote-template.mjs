import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { refreshClaspToken } from './sync-template.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resultPath = path.join(projectRoot, 'template-sync-result.json');

async function main() {
  if (!fs.existsSync(resultPath)) throw new Error('TEMPLATE_SYNC_RESULT_MISSING');
  const release = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const token = await refreshClaspToken();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'documentalistas-remote-template-qa-'));
  const remotePdf = path.join(scratch, 'remote-converted.pdf');
  const localPdfDir = path.join(scratch, 'local');
  fs.mkdirSync(localPdfDir);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(release.convertedDocId)}/export?mimeType=${encodeURIComponent('application/pdf')}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`REMOTE_TEMPLATE_EXPORT_FAILED_${response.status}`);
  fs.writeFileSync(remotePdf, Buffer.from(await response.arrayBuffer()));
  const source = path.join(projectRoot, 'templates', 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS.docx');
  childProcess.execFileSync('libreoffice', ['--headless', '--convert-to', 'pdf', '--outdir', localPdfDir, source], { stdio: 'ignore' });
  const localPdf = path.join(localPdfDir, 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS.pdf');
  const localPages = pdfPages(localPdf);
  const remotePages = pdfPages(remotePdf);
  const remoteText = childProcess.execFileSync('pdftotext', ['-layout', remotePdf, '-'], { encoding: 'utf8' });
  const placeholders = [...new Set(remoteText.match(/\{\{[A-Za-z][A-Za-z0-9_]*\}\}/g) || [])];
  const pagesDir = path.join(scratch, 'pages');
  fs.mkdirSync(pagesDir);
  childProcess.execFileSync('pdftoppm', ['-png', '-r', '90', remotePdf, path.join(pagesDir, 'page')]);
  const images = fs.readdirSync(pagesDir).filter((name) => name.endsWith('.png')).sort().map((name) => path.join(pagesDir, name));
  const contactSheet = path.join(scratch, 'remote-contact.png');
  childProcess.execFileSync('montage', [...images, '-thumbnail', '300x', '-tile', '3x', '-geometry', '+8+8', contactSheet]);
  const result = { status: localPages === remotePages && placeholders.length ? 'PASS' : 'REVIEW_REQUIRED', localPages, remotePages, placeholders, contactSheet, note: 'A igualdade de páginas é um sinal de fidelidade, não prova equivalência tipográfica pixel a pixel.' };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function pdfPages(filePath) {
  const info = childProcess.execFileSync('pdfinfo', [filePath], { encoding: 'utf8' });
  return Number(info.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
