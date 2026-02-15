import { JSDOM } from "jsdom";

export interface CatalogOnlinerResult {
  html: string;
  title: string;
}

/**
 * Извлекает контент страницы каталога Onliner:
 * - список товаров: из .catalog-form__offers (если есть)
 * - карточка товара: из .catalog-content
 * - иначе: из .g-middle
 */
export function extractCatalogOnlinerContent(html: string): CatalogOnlinerResult | null {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const title = doc.querySelector("title")?.textContent?.trim() ?? "Каталог Onlíner";

  const offers = doc.querySelector(".catalog-form__offers");
  if (offers) {
    return { html: offers.innerHTML, title };
  }

  const content = doc.querySelector(".catalog-content");
  if (content) {
    return { html: content.innerHTML, title };
  }

  const middle = doc.querySelector(".g-middle");
  if (middle) {
    return { html: middle.innerHTML, title };
  }

  return null;
}

export function isCatalogOnlinerUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "catalog.onliner.by";
  } catch {
    return false;
  }
}
