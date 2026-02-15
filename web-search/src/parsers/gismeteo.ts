import { JSDOM } from "jsdom";

export interface GismeteoResult {
  html: string;
  title: string;
}

/**
 * Удаляет script, JSON-LD, style и другой мусор из HTML.
 */
function stripJunk(html: string): string {
  const dom = new JSDOM(`<div>${html}</div>`);
  const container = dom.window.document.body.firstElementChild!;
  container
    .querySelectorAll(
      "script, [type='application/ld+json'], [type='application/json'], style"
    )
    .forEach((el) => el.remove());
  // Удаляем контейнеры рекламы
  container.querySelectorAll(".widget-advert-wrap, .js-widget-row-advert").forEach((el) => el.remove());
  return container.innerHTML;
}

/**
 * Определяет, является ли URL страницей погоды Gismeteo.
 */
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
 * Извлекает контент страницы погоды Gismeteo:
 * - header.header — шапка с навигацией
 * - main .content-column:nth-child(1) — первая колонка основного контента (прогноз погоды)
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
  if (header) {
    parts.push(stripJunk(header.outerHTML));
  }
  if (contentColumn) {
    parts.push(stripJunk(contentColumn.outerHTML));
  }

  if (parts.length === 0) return null;

  return {
    html: parts.join("\n"),
    title,
  };
}
