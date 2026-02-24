import { dirname, join } from "path";

import type { RateLimit } from "./types.js";

export const DEFAULT_REGION = "ru-by";
export const DEFAULT_SEARCH_LANGUAGE = "all";

export const CONFIG = {
  server: {
    name: "web-search-service",
    version: "1.0.0",
  },
  rateLimit: {
    perSecond: Number.parseInt(process.env.RATE_LIMIT_PER_SECOND ?? "20", 10),
    perMonth: Number.parseInt(process.env.RATE_LIMIT_PER_MONTH ?? "15000", 10),
  } as RateLimit,
  search: {
    maxQueryLength: 400,
    maxResults: 20,
    defaultResults: 10,
    defaultSafeSearch: "moderate" as const,
  },
} as const;

export const WEB_SEARCH_TOOL_DESCRIPTION =
  "Performs a web search. " +
  "Use for general queries, recent events, and broad information gathering. " +
  `Maximum ${CONFIG.search.maxResults} results per request.`;

export const WEB_SEARCH_BATCH_TOOL_DESCRIPTION =
  "Runs multiple search queries in parallel and returns grouped results.";

export const FETCH_PAGE_TOOL_DESCRIPTION =
  "Fetches a web page by URL, extracts the main content, removes visual noise, and returns markdown.";

export const SEARCH_NEWS_TOOL_DESCRIPTION =
  "Fetches news feed from supported sites. Without site returns news from all sources (onliner.by, tochka.by, smartpress.by). Use site='onliner.by' for Onliner, site='tochka.by' for Tochka, site='smartpress.by' for Smartpress. Multiple sites: site='onliner.by;smartpress.by'. Returns markdown with title, url, date, views, description.";

export const AVBY_SEARCH_TOOL_DESCRIPTION =
  "Search car listings on cars.av.by marketplace. " +
  "Takes brand slug (from avby_models resource list), optional model name, year range, price range in USD, sorting and page. " +
  "Resolves all IDs internally and returns listing results.";

export const KUFAR_SEARCH_TOOL_DESCRIPTION =
  "Search listings on kufar.by marketplace (Belarus). " +
  "Takes optional query, category or subcategory slug (from kufar://categories and kufar://subcategories/{category}), " +
  "region/city in Russian (from kufar://regions), price range in BYN, condition (new/used), private_only flag and page. " +
  "Returns listing results sorted by newest first.";

export const NESTY_SEARCH_TOOL_DESCRIPTION =
  "Search apartment rental listings on nesty.by aggregator (Belarus). " +
  "Takes city slug (minsk, brest, grodno, gomel, mogilev, vitebsk), optional rooms, price range in USD, " +
  "area, floor range, district (from nesty://districts/{city}), sub-district (from nesty://subdistricts/{city}/{district}), " +
  "metro station (from nesty://metro/{city}), sources (Realt, Kufar, Onliner, Domovita, Hata, Neagent), sorting and page. " +
  "Returns listing results with links to original sources.";

export const SEARCH_NEWS_DEFAULT_SITES = ["onliner.by", "tochka.by", "smartpress.by"] as const;

export const SEARCH_NEWS_MAX_TOTAL = 50;
export const SEARCH_NEWS_MIN_ONLINER = 15;

export const FETCH_LIMITS = {
  timeoutMs: 30000,
} as const;

export const FETCH_CACHE_TTL_MS = 10 * 60 * 1000; // 10 минут
export const FETCH_CACHE_DIR =
  process.env.FETCH_CACHE_DIR ??
  (process.env.NEWS_CACHE_DIR
    ? join(dirname(process.env.NEWS_CACHE_DIR), "fetch")
    : join(process.cwd(), ".cache", "fetch"));

export const SEARCH_API_URL = process.env.SEARXNG_URL ?? "http://searxng:8080";
export const SEARCH_ENGINES = process.env.SEARXNG_ENGINES ?? "google,yandex";
export const SEARCH_USERNAME = process.env.SEARXNG_USERNAME;
export const SEARCH_PASSWORD = process.env.SEARXNG_PASSWORD;
export const SEARCH_CATEGORIES = process.env.SEARXNG_CATEGORIES ?? "general";
export const SEARCH_API_TIMEOUT_MS = Number.parseInt(
  process.env.SEARXNG_TIMEOUT_MS ?? "12000",
  10
);
export const SEARCH_API_RETRIES = Number.parseInt(
  process.env.SEARXNG_RETRIES ?? "2",
  10
);
export const SEARCH_API_BACKOFF_MS = Number.parseInt(
  process.env.SEARXNG_RETRY_BACKOFF_MS ?? "350",
  10
);
export const MAX_BATCH_QUERIES = Number.parseInt(
  process.env.MAX_BATCH_QUERIES ?? "8",
  10
);

/** Домены, для которых используется headless-браузер вместо fetch() */
export const BROWSER_DOMAINS = new Set(
  (process.env.BROWSER_DOMAINS ?? "cars.av.by,www.kufar.by")
    .split(",").map((s) => s.trim()).filter(Boolean)
);

export const REGION_ALIASES: Record<string, string> = {
  global: DEFAULT_REGION,
  world: DEFAULT_REGION,
  all: DEFAULT_REGION,
  wt: DEFAULT_REGION,
  ru: "ru-ru",
  russia: "ru-ru",
  by: "ru-by",
  belarus: "ru-by",
  belarusian: "ru-by",
  ua: "ua-uk",
  ukraine: "ua-uk",
  us: "us-en",
  usa: "us-en",
  en: "us-en",
  uk: "uk-en",
  gb: "uk-en",
  germany: "de-de",
  de: "de-de",
  france: "fr-fr",
  fr: "fr-fr",
};

export const REGION_TO_LANGUAGE: Record<string, string> = {
  "wt-wt": "all",
  "ru-ru": "ru-RU",
  "ru-by": "ru-BY",
  "ua-uk": "uk-UA",
  "us-en": "en-US",
  "uk-en": "en-GB",
  "de-de": "de-DE",
  "fr-fr": "fr-FR",
};
