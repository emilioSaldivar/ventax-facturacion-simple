const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const cheerio = require('cheerio');

async function fetchZipLinks(url) {
  const response = await axios.get(url, { timeout: 60000 });
  const $ = cheerio.load(response.data);
  const links = new Set();

  $('a[href]').each((_, element) => {
    const href = String($(element).attr('href') || '').trim();
    const lowerHref = href.toLowerCase();
    if (!lowerHref.includes('.zip')) {
      return;
    }

    if (!/\/ruc\d+\.zip(?:\/|$|\?)/i.test(lowerHref)) {
      return;
    }

    const absolute = new URL(href, url).toString();
    links.add(absolute);
  });

  return [...links].sort();
}

async function downloadZipFiles(zipLinks, outputDir) {
  const downloaded = [];

  for (const link of zipLinks) {
    const match = new URL(link).pathname.match(/(ruc\d+\.zip)/i);
    const filename = match?.[1]?.toLowerCase() || path.basename(new URL(link).pathname) || `ruc-${Date.now()}.zip`;
    const destination = path.join(outputDir, filename);
    const response = await axios.get(link, { responseType: 'stream', timeout: 120000 });

    await new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(destination);
      response.data.pipe(stream);
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    downloaded.push(destination);
  }

  return downloaded;
}

module.exports = { fetchZipLinks, downloadZipFiles };
