const fs = require('node:fs/promises');
const path = require('node:path');
const AdmZip = require('adm-zip');

async function extractZipFiles(zipPaths, extractedDir) {
  const txtFiles = [];

  for (const zipPath of zipPaths) {
    const baseName = path.basename(zipPath, '.zip');
    const targetDir = path.join(extractedDir, baseName);
    await fs.mkdir(targetDir, { recursive: true });

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(targetDir, true);

    const found = await findTxtFiles(targetDir);
    txtFiles.push(...found);
  }

  return txtFiles;
}

async function findTxtFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findTxtFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) {
      files.push(fullPath);
    }
  }

  return files;
}

module.exports = { extractZipFiles, findTxtFiles };
