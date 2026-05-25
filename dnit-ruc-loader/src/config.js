const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config();

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || './data');

function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    return null;
  }
  try {
    const parsed = new URL(databaseUrl);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 5432),
      database: decodeURIComponent(parsed.pathname.replace(/^\/+/, '')),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password)
    };
  } catch {
    return null;
  }
}

const dbFromUrl = parseDatabaseUrl(process.env.DATABASE_URL);

module.exports = {
  dnitRucUrl: process.env.DNIT_RUC_URL || 'https://www.dnit.gov.py/en/web/portal-institucional/listado-de-ruc-con-sus-equivalencias',
  db: {
    host: process.env.DB_HOST || dbFromUrl?.host || '127.0.0.1',
    port: Number(process.env.DB_PORT || dbFromUrl?.port || 5432),
    database: process.env.DB_NAME || dbFromUrl?.database || 'ventax',
    user: process.env.DB_USER || dbFromUrl?.user || 'postgres',
    password: process.env.DB_PASSWORD || dbFromUrl?.password || 'postgres'
  },
  importBatchSize: Number(process.env.IMPORT_BATCH_SIZE || 5000),
  paths: {
    rootDir,
    dataDir,
    downloadsDir: path.join(dataDir, 'downloads'),
    extractedDir: path.join(dataDir, 'extracted'),
    logsDir: path.join(dataDir, 'logs')
  }
};
