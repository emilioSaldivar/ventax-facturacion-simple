const fs = require('node:fs/promises');
const path = require('node:path');
const { dnitRucUrl, importBatchSize, paths } = require('./config');
const { fetchZipLinks, downloadZipFiles } = require('./download');
const { extractZipFiles } = require('./extract');
const { importTxtFiles } = require('./import');
const { withClient, closePool } = require('./db');

function monthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

async function ensureDirs() {
  await fs.mkdir(paths.downloadsDir, { recursive: true });
  await fs.mkdir(paths.extractedDir, { recursive: true });
  await fs.mkdir(paths.logsDir, { recursive: true });
}

async function clearOldArtifacts(currentMonth) {
  await clearExceptMonth(paths.downloadsDir, currentMonth);
  await clearExceptMonth(paths.extractedDir, currentMonth);
}

async function clearExceptMonth(baseDir, currentMonth) {
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === currentMonth) {
      continue;
    }
    await fs.rm(path.join(baseDir, entry.name), { recursive: true, force: true });
  }
}

async function removeProcessedArtifacts(files) {
  for (const file of files) {
    await fs.rm(file, { force: true });
  }
}

async function run() {
  const startedAt = Date.now();
  const currentMonth = monthKey();
  const monthDownloadDir = path.join(paths.downloadsDir, currentMonth);
  const monthExtractedDir = path.join(paths.extractedDir, currentMonth);

  await ensureDirs();
  await fs.mkdir(monthDownloadDir, { recursive: true });
  await fs.mkdir(monthExtractedDir, { recursive: true });

  await clearOldArtifacts(currentMonth);

  const zipLinks = await fetchZipLinks(dnitRucUrl);
  if (zipLinks.length === 0) {
    throw new Error(`No se encontraron archivos ruc*.zip en ${dnitRucUrl}`);
  }

  const zipFiles = await downloadZipFiles(zipLinks, monthDownloadDir);
  const txtFiles = await extractZipFiles(zipFiles, monthExtractedDir);

  if (txtFiles.length === 0) {
    throw new Error('No se encontraron archivos .txt luego de descomprimir ZIP.');
  }

  const importSummary = await withClient((client) => importTxtFiles(client, txtFiles, importBatchSize));

  await removeProcessedArtifacts(zipFiles);
  await removeProcessedArtifacts(txtFiles);

  const durationMs = Date.now() - startedAt;

  console.log('DNIT import summary');
  console.log(`- zip_links_found: ${zipLinks.length}`);
  console.log(`- zip_files_downloaded: ${zipFiles.length}`);
  console.log(`- txt_files_processed: ${importSummary.processedFiles}`);
  console.log(`- rows_parsed: ${importSummary.parsedRows}`);
  console.log(`- rows_inserted: ${importSummary.insertedRows}`);
  console.log(`- invalid_lines: ${importSummary.invalidLines}`);
  console.log(`- duration_ms: ${durationMs}`);
}

run()
  .catch((error) => {
    console.error('[dnit-ruc-loader] error', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
