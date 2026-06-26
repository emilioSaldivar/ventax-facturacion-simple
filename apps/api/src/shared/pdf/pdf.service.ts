import puppeteer from "puppeteer-core";

const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH ?? "/usr/bin/chromium-browser";

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
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
