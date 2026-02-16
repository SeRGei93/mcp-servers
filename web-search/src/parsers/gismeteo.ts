import { JSDOM } from "jsdom";

export interface GismeteoResult {
  html: string;
  title: string;
}

/** Заменяет кастомные элементы Gismeteo (value в атрибуте) на текст */
function replaceCustomElements(html: string): string {
  return html
    .replace(
      /<temperature-value\s+[^>]*value="(-?\d+)"[^>]*\/?>\s*(?:<\/temperature-value>)?/gi,
      "$1°"
    )
    .replace(
      /<speed-value\s+[^>]*value="([^"]*)"[^>]*\/?>\s*(?:<\/speed-value>)?/gi,
      "$1 м/с"
    )
    .replace(
      /<precipitation-value\s+[^>]*value="([^"]*)"[^>]*\/?>\s*(?:<\/precipitation-value>)?/gi,
      "$1 мм"
    )
    .replace(
      /<snow-value\s+[^>]*value="([^"]*)"[^>]*\/?>\s*(?:<\/snow-value>)?/gi,
      "$1 см"
    )
    .replace(
      /<temperature-value\s+[^>]*\/?>\s*(?:<\/temperature-value>)?/gi,
      ""
    )
    .replace(/<speed-value\s+[^>]*\/?>\s*(?:<\/speed-value>)?/gi, "")
    .replace(/<precipitation-value\s+[^>]*\/?>\s*(?:<\/precipitation-value>)?/gi, "")
    .replace(/<snow-value\s+[^>]*\/?>\s*(?:<\/snow-value>)?/gi, "");
}

/** Удаляет script, application/json, style и рекламу. application/ld+json оставляем */
function stripJunk(html: string): string {
  const processed = replaceCustomElements(html);
  const dom = new JSDOM(`<div>${processed}</div>`);
  const container = dom.window.document.body.firstElementChild!;
  container
    .querySelectorAll(
      "script:not([type='application/ld+json']), [type='application/json'], style"
    )
    .forEach((el) => el.remove());
  container
    .querySelectorAll(".widget-advert-wrap, .js-widget-row-advert")
    .forEach((el) => el.remove());
  return container.innerHTML;
}

export function isGismeteoWeatherUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host !== "www.gismeteo.ru" && host !== "gismeteo.ru") return false;
    return u.pathname.startsWith("/weather-");
  } catch {
    return false;
  }
}

/**
 * Извлекает полезные блоки: header и content-column (виджет погоды).
 */
export function extractGismeteoContent(html: string): GismeteoResult | null {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const title =
    doc.querySelector("title")?.textContent?.trim() ?? "Погода — Gismeteo";

  const header = doc.querySelector("header.header");
  const contentColumn = doc.querySelector("main .content-column");
  if (!header && !contentColumn) return null;

  const parts: string[] = [];
  if (header) parts.push(stripJunk(header.outerHTML));
  if (contentColumn) parts.push(stripJunk(contentColumn.outerHTML));
  if (parts.length === 0) return null;

  return { html: parts.join("\n"), title };
}
