import { chromium, type Browser, type Page } from "playwright";
import { BROWSER_DOMAINS } from "./config.js";

const CHROME_PATH = process.env.CHROME_PATH;
const MAX_PAGES = 4;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Domains limited to 1 concurrent browser tab to avoid bot detection */
const SERIAL_DOMAINS = new Set(["www.kufar.by"]);

// ---------------------------------------------------------------------------
// Simple semaphore
// ---------------------------------------------------------------------------

interface Semaphore {
  active: number;
  max: number;
  queue: Array<() => void>;
}

function makeSemaphore(max: number): Semaphore {
  return { active: 0, max, queue: [] };
}

function acquireSem(sem: Semaphore): Promise<void> {
  if (sem.active < sem.max) {
    sem.active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => sem.queue.push(resolve));
}

function releaseSem(sem: Semaphore): void {
  const next = sem.queue.shift();
  if (next) {
    next();
  } else {
    sem.active--;
  }
}

/** Global semaphore for total open tabs */
const globalSem = makeSemaphore(MAX_PAGES);

/** Per-domain semaphores for serial domains (concurrency = 1) */
const domainSems = new Map<string, Semaphore>();

function getDomainSem(hostname: string): Semaphore | null {
  if (!SERIAL_DOMAINS.has(hostname)) return null;
  let sem = domainSems.get(hostname);
  if (!sem) {
    sem = makeSemaphore(1);
    domainSems.set(hostname, sem);
  }
  return sem;
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
        "--disable-blink-features=AutomationControlled",
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
  waitSelector?: string,
): Promise<string> {
  const hostname = new URL(url).hostname;
  const dSem = getDomainSem(hostname);

  // Acquire per-domain slot first (serializes requests to bot-sensitive sites)
  if (dSem) await acquireSem(dSem);
  await acquireSem(globalSem);

  const browser = await getBrowser();
  let page: Page | null = null;
  try {
    page = await browser.newPage({
      userAgent: USER_AGENT,
      viewport: { width: 1366, height: 768 },
      locale: "ru-BY",
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });
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

    // Wait for dynamic content if selector specified (e.g. client-side rendered listings)
    if (waitSelector) {
      try {
        await page.waitForSelector(waitSelector, { timeout: 15_000 });
      } catch {
        // Selector didn't appear (empty results or timeout) — return current content
      }
    }

    return await page.content();
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    releaseSem(globalSem);
    if (dSem) releaseSem(dSem);
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
