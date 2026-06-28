import puppeteer from "puppeteer-core";

const CHROMIUM_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  "/usr/bin/chromium-browser";

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
    ],
    headless: true,
    timeout: 15_000,
  });

  try {
    const page = await browser.newPage();
    // domcontentloaded: no espera recursos externos (imágenes remotas, fuentes CDN)
    // Evita que logo_url externo bloquee la generación del PDF
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
