import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
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

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
turndown.use(gfm);

turndown.addRule("applicationLdJson", {
  filter: (node) =>
    node.nodeName === "SCRIPT" &&
    node.getAttribute?.("type") === "application/ld+json",
  replacement: (content) =>
    content.trim() ? `\n\n\`\`\`json\n${content.trim()}\n\`\`\`\n\n` : "",
});

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

function extractMainHtml(
  url: string,
  html: string
): {
  title: string;
  html: string;
} {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const title = doc.title?.trim() || new URL(url).hostname;
  const bodyHtml =
    doc.body?.innerHTML ?? `<article><p>No content.</p></article>`;
  return { title, html: bodyHtml };
}

export async function fetchPageAsMarkdown(
  url: string,
  timeoutMs: number
): Promise<string> {
  const cached = await readFetchCache(url);
  if (cached) return cached;

  if (isOnlinerArticleUrl(url) || isTochkaArticleUrl(url) || isSmartpressArticleUrl(url)) {
    const article = await fetchNewsArticle(url, timeoutMs);
    if (article) {
      const markdown = formatArticleToMarkdown(article);
      await writeFetchCache(url, markdown);
      return markdown;
    }
  }

  let html = await fetchRawHtml(url, timeoutMs);
  if (isCatalogOnlinerUrl(url)) {
    const catalog = extractCatalogOnlinerContent(html);
    if (catalog) {
      const escapedTitle = catalog.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html = `<!DOCTYPE html><html><head><title>${escapedTitle}</title></head><body><div class="g-middle">${catalog.html}</div></body></html>`;
    }
  } else if (isShopCatalogUrl(url)) {
    const shop = extractShopCatalogContent(html);
    if (shop) {
      const escapedTitle = shop.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html = `<!DOCTYPE html><html><head><title>${escapedTitle}</title></head><body><div class="PageType__BlockRightWrapper">${shop.html}</div></body></html>`;
    }
  } else if (isShopProductUrl(url)) {
    const shop = extractShopProductContent(html);
    if (shop) {
      const escapedTitle = shop.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html = `<!DOCTYPE html><html><head><title>${escapedTitle}</title></head><body><div class="PageModel__shopContent">${shop.html}</div></body></html>`;
    }
  } else if (isSmartpressNewsListUrl(url)) {
    const smart = extractSmartpressNewsContent(html);
    if (smart) {
      const escapedTitle = smart.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html = `<!DOCTYPE html><html><head><title>${escapedTitle}</title></head><body>${smart.html}</body></html>`;
    }
  } else if (isGismeteoWeatherUrl(url)) {
    const gism = extractGismeteoContent(html);
    if (gism) {
      const escapedTitle = gism.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html = `<!DOCTYPE html><html><head><title>${escapedTitle}</title></head><body>${gism.html}</body></html>`;
    }
  } else if (isYandexPogodaUrl(url)) {
    const yandex = extractYandexPogodaContent(html);
    if (yandex) {
      const escapedTitle = yandex.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html = `<!DOCTYPE html><html><head><title>${escapedTitle}</title></head><body>${yandex.html}</body></html>`;
    }
  }
  const extracted = extractMainHtml(url, html);
  const markdownBody = turndown.turndown(extracted.html).trim();

  const output = `# ${extracted.title}

Source: ${url}

---

${markdownBody}`;

  await writeFetchCache(url, output);
  return output;
}
