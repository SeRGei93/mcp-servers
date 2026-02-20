import { chromium, type Browser, type Page } from "playwright";
import { BROWSER_DOMAINS } from "./config.js";

const CHROME_PATH = process.env.CHROME_PATH;
const MAX_PAGES = 4;

/** Простой семафор для ограничения одновременно открытых вкладок */
let active = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (active < MAX_PAGES) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => queue.push(resolve));
}

function releaseSlot(): void {
  const next = queue.shift();
  if (next) {
    next();
  } else {
    active--;
  }
}

let browserPromise: Promise<Browser> | null = null;

/**
 * Возвращает singleton-экземпляр браузера.
 * Создает при первом вызове, пересоздает при дисконнекте.
 */
function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise;

  browserPromise = chromium
    .launch({
      headless: true,
      ...(CHROME_PATH && { executablePath: CHROME_PATH }),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
      ],
    })
    .then((browser) => {
      browser.on("disconnected", () => {
        console.error("[WARN] Chromium disconnected, will re-launch on next request");
        browserPromise = null;
      });
      console.error("[INFO] Chromium browser launched");
      return browser;
    })
    .catch((err) => {
      browserPromise = null;
      throw err;
    });

  return browserPromise;
}

/**
 * Загружает HTML-страницу через headless Chromium.
 * Используется для сайтов, блокирующих plain fetch (WAF).
 */
export async function fetchHtmlWithBrowser(
  url: string,
  timeoutMs: number,
): Promise<string> {
  await acquireSlot();
  const browser = await getBrowser();
  let page: Page | null = null;
  try {
    page = await browser.newPage();
    const response = await page.goto(url, {
      timeout: timeoutMs,
      waitUntil: "domcontentloaded",
    });

    if (!response) {
      throw new Error(`Failed to fetch URL: no response from ${url}`);
    }

    const status = response.status();
    if (status >= 400) {
      throw new Error(`Failed to fetch URL: HTTP ${status}`);
    }

    return await page.content();
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    releaseSlot();
  }
}

/** Проверяет, нужен ли браузер для данного URL */
export function needsBrowser(url: string): boolean {
  try {
    return BROWSER_DOMAINS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Graceful shutdown */
export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    // ignore
  } finally {
    browserPromise = null;
  }
}
