import { JSDOM } from "jsdom";
import {
  readFetchCache,
  writeFetchCache,
} from "./fetch-cache.js";
import {
  fetchNewsArticle,
  formatArticleToMarkdown,
  isOnlinerArticleUrl,
  isTochkaArticleUrl,
  isSmartpressArticleUrl,
} from "./parsers/index.js";
import {
  isCatalogOnlinerUrl,
  extractCatalogOnlinerContent,
} from "./parsers/catalog-onliner.js";
import {
  isShopCatalogUrl,
  extractShopCatalogContent,
  isShopProductUrl,
  extractShopProductContent,
} from "./parsers/shop-product.js";
import {
  isSmartpressNewsListUrl,
  extractSmartpressNewsContent,
} from "./parsers/smartpress.js";
import {
  isGismeteoWeatherUrl,
  extractGismeteoContent,
} from "./parsers/gismeteo.js";
import {
  isYandexPogodaUrl,
  extractYandexPogodaContent,
} from "./parsers/yandex-pogoda.js";

/** Селекторы мусора удаляемого при универсальной очистке */
const JUNK_SELECTORS = [
  // Технические теги
  "script", "style", "noscript",
  // Медиа без текстового содержимого
  "img", "svg", "canvas", "picture", "video", "audio",
  // Интерактивные элементы
  "button", "form", "input", "select", "textarea",
  // Встраиваемый контент
  "iframe", "embed", "object",
  // Структурная навигация
  "header", "footer", "nav", "aside",
  // ARIA-роли навигационного мусора
  "[role='navigation']", "[role='banner']", "[role='contentinfo']",
  "[role='complementary']", "[role='search']",
  // Скрытые элементы
  "[aria-hidden='true']", "[hidden]",
  // Реклама
  "[class*='advert']", "[class*='ad-']", "[id*='ad-']",
  "[class*='-ad']", "[id*='-ad']",
  // Попапы, куки, соцсети
  "[class*='banner']", "[class*='popup']", "[class*='modal']",
  "[class*='cookie']", "[class*='social']", "[class*='share']",
  // Боковые колонки
  "[class*='sidebar']", "[class*='side-bar']",
  // Рекомендации и похожие материалы
  "[class*='recommend']", "[class*='related']", "[class*='more-']",
  // Хлебные крошки и пагинация
  "[class*='breadcrumb']", "[class*='pagination']",
];

export async function fetchRawHtml(
  url: string,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "web-search-mcp/1.0",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error(`Unsupported content-type: ${contentType}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/** Универсальная очистка HTML от мусора, возвращает очищенный innerHTML основного контента */
function cleanHtml(url: string, html: string): { title: string; html: string } {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const title = doc.title?.trim() || new URL(url).hostname;

  // Сохраняем json-ld перед удалением скриптов
  const jsonLdBlocks: string[] = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    const content = el.textContent?.trim();
    if (content) jsonLdBlocks.push(content);
  });

  // Удаляем мусор
  JUNK_SELECTORS.forEach((selector) => {
    try {
      doc.querySelectorAll(selector).forEach((el) => el.remove());
    } catch {
      // игнорируем невалидные селекторы
    }
  });

  const bodyHtml = doc.body?.innerHTML ?? "<p>No content.</p>";

  // Схлопываем лишние пробелы
  const clean = bodyHtml.replace(/\s{2,}/g, " ").replace(/>\s+</g, "><").trim();

  // Добавляем json-ld в конец если есть
  const jsonLdSection = jsonLdBlocks.length > 0
    ? "\n\n" + jsonLdBlocks.map((b) => `<script type="application/ld+json">${b}</script>`).join("\n")
    : "";

  return { title, html: clean + jsonLdSection };
}

function buildOutput(title: string, url: string, bodyHtml: string): string {
  return `# ${title}\n\nSource: ${url}\n\n---\n\n${bodyHtml}`;
}

export async function fetchPageAsMarkdown(
  url: string,
  timeoutMs: number
): Promise<string> {
  const cached = await readFetchCache(url);
  if (cached) return cached;

  // Новостные статьи — возвращают markdown (специальные парсеры)
  if (isOnlinerArticleUrl(url) || isTochkaArticleUrl(url) || isSmartpressArticleUrl(url)) {
    const article = await fetchNewsArticle(url, timeoutMs);
    if (article) {
      const markdown = formatArticleToMarkdown(article);
      await writeFetchCache(url, markdown);
      return markdown;
    }
  }

  const rawHtml = await fetchRawHtml(url, timeoutMs);

  // Специализированные парсеры — возвращают уже очищенный HTML
  let specialHtml: string | null = null;
  let specialTitle: string | null = null;

  if (isCatalogOnlinerUrl(url)) {
    const r = extractCatalogOnlinerContent(rawHtml);
    if (r) { specialHtml = r.html; specialTitle = r.title; }
  } else if (isShopCatalogUrl(url)) {
    const r = extractShopCatalogContent(rawHtml);
    if (r) { specialHtml = r.html; specialTitle = r.title; }
  } else if (isShopProductUrl(url)) {
    const r = extractShopProductContent(rawHtml);
    if (r) { specialHtml = r.html; specialTitle = r.title; }
  } else if (isSmartpressNewsListUrl(url)) {
    const r = extractSmartpressNewsContent(rawHtml);
    if (r) { specialHtml = r.html; specialTitle = r.title; }
  } else if (isGismeteoWeatherUrl(url)) {
    const r = extractGismeteoContent(rawHtml);
    if (r) { specialHtml = r.text; specialTitle = r.title; }
  } else if (isYandexPogodaUrl(url)) {
    const r = extractYandexPogodaContent(rawHtml);
    if (r) { specialHtml = r.html; specialTitle = r.title; }
  }

  let output: string;
  if (specialHtml !== null && specialTitle !== null) {
    output = buildOutput(specialTitle, url, specialHtml);
  } else {
    // Универсальная очистка для всех остальных сайтов
    const { title, html } = cleanHtml(url, rawHtml);
    output = buildOutput(title, url, html);
  }

  await writeFetchCache(url, output);
  return output;
}
