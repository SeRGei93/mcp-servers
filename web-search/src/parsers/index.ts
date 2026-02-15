import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { fetchRawHtml } from "../fetch.js";
import type { NewsItem, NewsParser } from "./types.js";
import type { NewsArticle, NewsFeedSection } from "./types.js";
import { formatArticleToMarkdown, formatNewsToMarkdown, formatFeedSectionsToMarkdown } from "./markdown.js";
import { onlinerParser } from "./onliner.js";
import { tochkaParser } from "./tochka.js";
import { smartpressParser } from "./smartpress.js";
import {
  isOnlinerArticleUrl,
  parseOnlinerArticle,
} from "./onliner-article.js";

const PARSER_REGISTRY = new Map<string, NewsParser>();

function registerParser(parser: NewsParser): void {
  for (const domain of parser.domains) {
    PARSER_REGISTRY.set(domain, parser);
  }
}

registerParser(onlinerParser);
registerParser(tochkaParser);
registerParser(smartpressParser);

const ONLINER_URLS = [
  "https://money.onliner.by/",
  "https://people.onliner.by/",
  "https://tech.onliner.by/",
] as const;

const TOCHKA_URLS = [
  "https://tochka.by/articles/sport/",
  "https://tochka.by/articles/drive/",
  "https://tochka.by/articles/turizm/",
  "https://tochka.by/articles/economics/",
] as const;

const SMARTPRESS_URLS = [
  "https://smartpress.by/news/",
] as const;

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 минут

const CACHE_DIR =
  process.env.NEWS_CACHE_DIR ??
  join(process.cwd(), ".cache", "news");

/**
 * Стабильный идентификатор кеша для каждого сайта.
 * Один сайт = один файл кеша.
 */
function getCacheIdForSite(siteInput: string): string {
  const s = siteInput.trim().toLowerCase();
  if (s === "onliner.by") return "onliner_by";
  if (s === "tochka.by" || s === "https://tochka.by") return "tochka_by";
  if (s === "smartpress.by" || s === "https://smartpress.by")
    return "smartpress_by";
  try {
    const url = new URL(s.startsWith("http") ? s : `https://${s}`);
    return url.hostname.replace(/\./g, "_");
  } catch {
    return createHash("sha256").update(siteInput, "utf8").digest("hex").slice(0, 16);
  }
}

function getCacheFilePath(cacheId: string): string {
  return join(CACHE_DIR, `${cacheId}.json`);
}

async function ensureCacheDir(): Promise<void> {
  if (!existsSync(CACHE_DIR)) {
    await mkdir(CACHE_DIR, { recursive: true });
  }
}

async function readCache(cacheId: string): Promise<NewsFeedSection[] | null> {
  const filePath = getCacheFilePath(cacheId);
  if (!existsSync(filePath)) return null;
  try {
    const raw = await readFile(filePath, "utf-8");
    const { expiresAt, data } = JSON.parse(raw) as {
      expiresAt: number;
      data: NewsFeedSection[];
    };
    if (Date.now() < expiresAt) return data;
    return null;
  } catch {
    return null;
  }
}

async function writeCache(
  cacheId: string,
  data: NewsFeedSection[]
): Promise<void> {
  await ensureCacheDir();
  const filePath = getCacheFilePath(cacheId);
  const payload = JSON.stringify({
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  });
  await writeFile(filePath, payload, "utf-8");
}

export type { NewsItem, NewsParser, NewsFeedSection, NewsArticle };
export { formatNewsToMarkdown, formatFeedSectionsToMarkdown, formatArticleToMarkdown };
export { isOnlinerArticleUrl, parseOnlinerArticle };
export { isTochkaArticleUrl, parseTochkaArticle } from "./tochka-article.js";
export { isSmartpressArticleUrl, parseSmartpressArticle } from "./smartpress-article.js";

export async function fetchNewsArticle(
  url: string,
  timeoutMs: number = 30000
): Promise<NewsArticle | null> {
  const { isOnlinerArticleUrl, parseOnlinerArticle } = await import("./onliner-article.js");
  const { isTochkaArticleUrl, parseTochkaArticle } = await import("./tochka-article.js");
  const { isSmartpressArticleUrl, parseSmartpressArticle } = await import("./smartpress-article.js");
  const html = await fetchRawHtml(url, timeoutMs);
  if (isOnlinerArticleUrl(url)) return parseOnlinerArticle(html, url);
  if (isTochkaArticleUrl(url)) return parseTochkaArticle(html, url);
  if (isSmartpressArticleUrl(url)) return parseSmartpressArticle(html, url);
  return null;
}

/**
 * Нормализует значение site в массив URL для парсинга.
 * onliner.by → [money, people, tech].onliner.by
 * tochka.by → [sport, drive, turizm, economics].tochka.by/articles
 */
export function normalizeSites(site: string): string[] {
  const trimmed = site.trim().toLowerCase();
  if (trimmed === "onliner.by") {
    return [...ONLINER_URLS];
  }
  if (trimmed === "tochka.by" || trimmed === "https://tochka.by") {
    return [...TOCHKA_URLS];
  }
  if (trimmed === "smartpress.by" || trimmed === "https://smartpress.by") {
    return [...SMARTPRESS_URLS];
  }
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return [url.href];
  } catch {
    return [];
  }
}

function getParserForUrl(url: string): NewsParser | null {
  try {
    const hostname = new URL(url).hostname;
    return PARSER_REGISTRY.get(hostname) ?? null;
  } catch {
    return null;
  }
}

function isOnlinerSite(siteInput: string): boolean {
  const s = siteInput.trim().toLowerCase();
  return s === "onliner.by";
}

function isTochkaSite(siteInput: string): boolean {
  const s = siteInput.trim().toLowerCase();
  return s === "tochka.by" || s === "https://tochka.by";
}

function isSmartpressSite(siteInput: string): boolean {
  const s = siteInput.trim().toLowerCase();
  return s === "smartpress.by" || s === "https://smartpress.by";
}

export async function searchNews(
  sites: string[],
  timeoutMs: number = 30000
): Promise<NewsFeedSection[]> {
  const sections: NewsFeedSection[] = [];

  for (const siteInput of sites) {
    const urls = normalizeSites(siteInput);
    if (urls.length === 0) continue;

    const cacheId = getCacheIdForSite(siteInput);
    const cached = await readCache(cacheId);
    if (cached) {
      sections.push(...cached);
      continue;
    }

    const siteSections: NewsFeedSection[] = [];

    if (isOnlinerSite(siteInput) && urls.length > 1) {
      const allItems: NewsItem[] = [];
      let lastError: string | undefined;

      for (const url of urls) {
        const parser = getParserForUrl(url);
        if (!parser) {
          lastError = "Парсер для этого сайта не найден";
          continue;
        }
        try {
          const html = await fetchRawHtml(url, timeoutMs);
          const items = parser.parse(html, url);
          allItems.push(...items);
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }

      allItems.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

      siteSections.push({
        source: "onliner.by",
        url: "https://onliner.by/",
        items: allItems,
        error: allItems.length === 0 ? lastError : undefined,
      });
    } else if (isTochkaSite(siteInput) && urls.length > 1) {
      const allItems: NewsItem[] = [];
      let lastError: string | undefined;

      for (const url of urls) {
        const parser = getParserForUrl(url);
        if (!parser) {
          lastError = "Парсер для этого сайта не найден";
          continue;
        }
        try {
          const html = await fetchRawHtml(url, timeoutMs);
          const items = parser.parse(html, url);
          allItems.push(...items);
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }

      const seen = new Set<string>();
      const uniqueItems = allItems.filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      });
      uniqueItems.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

      siteSections.push({
        source: "tochka.by",
        url: "https://tochka.by/articles/",
        items: uniqueItems,
        error: uniqueItems.length === 0 ? lastError : undefined,
      });
    } else if (isSmartpressSite(siteInput) && urls.length > 0) {
      const parser = getParserForUrl(urls[0]);
      if (parser) {
        try {
          const html = await fetchRawHtml(urls[0], timeoutMs);
          const items = parser.parse(html, urls[0]);
          items.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
          siteSections.push({
            source: "smartpress.by",
            url: "https://smartpress.by/news/",
            items,
          });
        } catch (error) {
          const lastError = error instanceof Error ? error.message : String(error);
          siteSections.push({
            source: "smartpress.by",
            url: "https://smartpress.by/news/",
            items: [],
            error: lastError,
          });
        }
      } else {
        siteSections.push({
          source: "smartpress.by",
          url: "https://smartpress.by/news/",
          items: [],
          error: "Парсер для smartpress.by не найден",
        });
      }
    } else {
      for (const url of urls) {
        const sourceName = (() => {
          try {
            return new URL(url).hostname;
          } catch {
            return url;
          }
        })();

        const parser = getParserForUrl(url);
        if (!parser) {
          try {
            const { fetchPageAsMarkdown } = await import("../fetch.js");
            const fallbackMarkdown = await fetchPageAsMarkdown(url, timeoutMs);
            siteSections.push({
              source: sourceName,
              url,
              items: [],
              fallbackMarkdown,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            siteSections.push({
              source: sourceName,
              url,
              items: [],
              error: message,
            });
          }
          continue;
        }

        try {
          const html = await fetchRawHtml(url, timeoutMs);
          const items = parser.parse(html, url);
          items.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
          siteSections.push({ source: sourceName, url, items });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          siteSections.push({ source: sourceName, url, items: [], error: message });
        }
      }
    }

    await writeCache(cacheId, siteSections);
    sections.push(...siteSections);
  }

  return sections;
}
