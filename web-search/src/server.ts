import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CONFIG,
  FETCH_LIMITS,
  FETCH_PAGE_TOOL_DESCRIPTION,
  MAX_BATCH_QUERIES,
  SEARCH_NEWS_DEFAULT_SITES,
  SEARCH_NEWS_TOOL_DESCRIPTION,
  WEB_SEARCH_BATCH_TOOL_DESCRIPTION,
  WEB_SEARCH_TOOL_DESCRIPTION,
  AVBY_SEARCH_TOOL_DESCRIPTION,
  KUFAR_SEARCH_TOOL_DESCRIPTION,
  NESTY_SEARCH_TOOL_DESCRIPTION,
} from "./config.js";
import { performBatchWebSearch, performWebSearch } from "./search.js";
import { fetchPageAsMarkdown } from "./fetch.js";
import { fetchHtmlWithBrowser } from "./browser.js";
import {
  searchNews,
  mergeAndLimitNews,
  formatFeedSectionsToMarkdown,
  formatNewsWithSourceToMarkdown,
} from "./parsers/index.js";
import {
  parseAvByBrands,
  parseAvByModels,
  type AvByBrand,
} from "./cars_av_by/cars-avby.js";
import { readAvbyCache, writeAvbyCache } from "./cars_av_by/cache.js";
import { avbySearch } from "./cars_av_by/search.js";
import { nestySearch, fetchNestyFilters, getCityNames, getMetroCities } from "./nesty/search.js";
import { kufarSearch, fetchKufarCategories, fetchKufarSubcategories, getKufarTopRegions, getKufarAreas } from "./kufar/search.js";
import {
  RELAX_PLACE_TYPES,
  RELAX_AFISHA_TYPES,
  RELAX_CITIES,
  relaxPlaceSearch,
  relaxAfishaSearch,
} from "./relax/search.js";

export async function getAvbyBrands(): Promise<AvByBrand[]> {
  const cached = await readAvbyCache<AvByBrand[]>("brands");
  if (cached) return cached;
  const html = await fetchHtmlWithBrowser("https://cars.av.by/", FETCH_LIMITS.timeoutMs);
  const brands = parseAvByBrands(html);
  await writeAvbyCache("brands", brands);
  return brands;
}

export function createServer(): McpServer {
  const server = new McpServer(CONFIG.server);

  server.registerTool(
    "web_search",
    {
      description: WEB_SEARCH_TOOL_DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(CONFIG.search.maxQueryLength)
          .describe(
            `Search query, max ${CONFIG.search.maxQueryLength} characters`
          ),
        count: z
          .number()
          .int()
          .min(1)
          .max(CONFIG.search.maxResults)
          .optional()
          .describe(
            `Number of results, from 1 to ${CONFIG.search.maxResults}, default ${CONFIG.search.defaultResults}`
          ),
        safeSearch: z
          .enum(["strict", "moderate", "off"])
          .optional()
          .describe("Safe search mode: strict, moderate, off"),
        region: z
          .string()
          .min(2)
          .max(32)
          .optional()
          .describe(
            'Search region (e.g. "ru-ru", "us-en", "wt-wt") or alias ("belarus", "by", "ru").'
          ),
      },
    },
    async ({ query, count, safeSearch, region }) => {
      try {
        const result = await performWebSearch(
          query,
          count ?? CONFIG.search.defaultResults,
          safeSearch ?? CONFIG.search.defaultSafeSearch,
          region
        );

        return {
          content: [{ type: "text", text: result }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "web_search_batch",
    {
      description: WEB_SEARCH_BATCH_TOOL_DESCRIPTION,
      inputSchema: {
        queries: z
          .array(z.string().min(1).max(CONFIG.search.maxQueryLength))
          .min(1)
          .max(MAX_BATCH_QUERIES)
          .describe(`Array of search queries, max ${MAX_BATCH_QUERIES} per request`),
        count: z
          .number()
          .int()
          .min(1)
          .max(CONFIG.search.maxResults)
          .optional()
          .describe(
            `Number of results per query, from 1 to ${CONFIG.search.maxResults}, default ${CONFIG.search.defaultResults}`
          ),
        safeSearch: z
          .enum(["strict", "moderate", "off"])
          .optional()
          .describe("Safe search mode for all queries"),
        region: z
          .string()
          .min(2)
          .max(32)
          .optional()
          .describe("Search region for all queries"),
      },
    },
    async ({ queries, count, safeSearch, region }) => {
      try {
        const result = await performBatchWebSearch(
          queries,
          count ?? CONFIG.search.defaultResults,
          safeSearch ?? CONFIG.search.defaultSafeSearch,
          region
        );

        return {
          content: [{ type: "text", text: result }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "fetch_url",
    {
      description: FETCH_PAGE_TOOL_DESCRIPTION,
      inputSchema: {
        url: z.url().describe("URL of the page to fetch"),
        timeoutMs: z
          .number()
          .int()
          .min(1000)
          .max(120000)
          .optional()
          .describe(
            `Request timeout in ms, default ${FETCH_LIMITS.timeoutMs}, max 120000`
          ),
      },
    },
    async ({ url, timeoutMs }) => {
      try {
        const markdown = await fetchPageAsMarkdown(
          url,
          timeoutMs ?? FETCH_LIMITS.timeoutMs
        );

        return {
          content: [{ type: "text", text: markdown }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "search_news",
    {
      description: SEARCH_NEWS_TOOL_DESCRIPTION,
      inputSchema: {
        site: z
          .string()
          .optional()
          .describe(
            'News source(s). Omit for all: onliner.by, tochka.by, smartpress.by. Or specify: "onliner.by", "tochka.by", "smartpress.by" (separate multiple with ";")'
          ),
        timeoutMs: z
          .number()
          .int()
          .min(1000)
          .max(120000)
          .optional()
          .describe(
            `Request timeout in ms, default ${FETCH_LIMITS.timeoutMs}, max 120000`
          ),
      },
    },
    async ({ site, timeoutMs }) => {
      try {
        const sites =
          site
            ?.split(";")
            .map((s) => s.trim())
            .filter(Boolean) ?? [];
        const sitesToUse =
          sites.length > 0 ? sites : [...SEARCH_NEWS_DEFAULT_SITES];
        const sections = await searchNews(
          sitesToUse,
          timeoutMs ?? FETCH_LIMITS.timeoutMs
        );
        const merged = mergeAndLimitNews(sections);
        const markdown =
          merged.length > 0
            ? formatNewsWithSourceToMarkdown(merged)
            : formatFeedSectionsToMarkdown(sections);
        return {
          content: [{ type: "text", text: markdown }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "avby_search",
    {
      description: AVBY_SEARCH_TOOL_DESCRIPTION,
      inputSchema: {
        brand: z
          .string()
          .min(1)
          .describe('Brand slug from resource list, e.g. "audi", "bmw", "mercedes-benz"'),
        model: z
          .string()
          .optional()
          .describe('Model name, e.g. "A5", "X5", "Q7". Read avby://models/{brand} resource to see available models.'),
        year_min: z.number().int().optional().describe("Minimum year"),
        year_max: z.number().int().optional().describe("Maximum year"),
        price_usd_min: z.number().int().optional().describe("Minimum price in USD"),
        price_usd_max: z.number().int().optional().describe("Maximum price in USD"),
        mileage_km_max: z.number().int().optional().describe("Maximum mileage in km"),
        engine_type: z
          .string()
          .optional()
          .describe("Engine: petrol, diesel, hybrid, electric, petrol-lpg, petrol-cng, diesel-hybrid"),
        transmission: z
          .string()
          .optional()
          .describe("Transmission: automatic, manual, robot, cvt"),
        body_type: z
          .string()
          .optional()
          .describe("Body: sedan, wagon, hatchback, suv, coupe, minivan, cabriolet, pickup, liftback, roadster"),
        drive_type: z
          .string()
          .optional()
          .describe("Drive: fwd, rwd, awd, awd-part"),
        condition: z
          .string()
          .optional()
          .describe("Condition: used, new, damaged, parts"),
        color: z
          .string()
          .optional()
          .describe("Color: white, black, grey, silver, blue, red, green, brown, burgundy, orange, yellow, purple"),
        region: z
          .string()
          .optional()
          .describe("Region: minsk, brest, vitebsk, gomel, grodno, mogilev"),
        sort: z
          .number()
          .int()
          .optional()
          .describe("Sort: 1=relevant, 2=cheapest, 3=expensive, 4=newest listing, 5=oldest listing, 6=newest year, 7=oldest year, 8=lowest mileage"),
        page: z.number().int().min(1).optional().describe("Page number"),
      },
    },
    async ({ brand, model, year_min, year_max, price_usd_min, price_usd_max, mileage_km_max, engine_type, transmission, body_type, drive_type, condition, color, region, sort, page }) => {
      try {
        const brands = await getAvbyBrands();
        const result = await avbySearch(
          { brand, model, year_min, year_max, price_usd_min, price_usd_max, mileage_km_max, engine_type, transmission, body_type, drive_type, condition, color, region, sort, page },
          brands,
        );
        return { content: [{ type: "text", text: result }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "nesty_search",
    {
      description: NESTY_SEARCH_TOOL_DESCRIPTION,
      inputSchema: {
        city: z
          .string()
          .min(1)
          .describe('City slug: minsk, brest, grodno, gomel, mogilev, vitebsk'),
        rooms: z
          .array(z.number().int().min(1).max(5))
          .optional()
          .describe("Number of rooms (1, 2, 3, 4, 5)"),
        price_min: z.number().int().optional().describe("Minimum price in USD"),
        price_max: z.number().int().optional().describe("Maximum price in USD"),
        area_min: z.number().optional().describe("Minimum area in m²"),
        area_max: z.number().optional().describe("Maximum area in m²"),
        floor_min: z.number().int().optional().describe("Minimum floor"),
        floor_max: z.number().int().optional().describe("Maximum floor"),
        district: z
          .array(z.string())
          .optional()
          .describe("Districts (values from nesty://districts/{city} resource)"),
        metro: z
          .array(z.string())
          .optional()
          .describe("Metro stations (values from nesty://metro/{city} resource)"),
        sort: z
          .string()
          .optional()
          .describe("Sort: price_asc, price_desc, date_desc (default)"),
        page: z.number().int().min(1).optional().describe("Page number (default 1)"),
      },
    },
    async ({ city, rooms, price_min, price_max, area_min, area_max, floor_min, floor_max, district, metro, sort, page }) => {
      try {
        const result = await nestySearch({
          city, rooms, price_min, price_max, area_min, area_max,
          floor_min, floor_max, district, metro, sort, page,
        });
        return { content: [{ type: "text", text: result }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "kufar_search",
    {
      description: KUFAR_SEARCH_TOOL_DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe("Search query text"),
        category: z
          .string()
          .optional()
          .describe('Category or subcategory slug, e.g. "elektronika", "velotovary". Read kufar://categories for top-level, kufar://subcategories/{category} for subcategories.'),
        region: z
          .string()
          .optional()
          .describe('Region or city name in Russian from kufar://regions and kufar://areas/{rgn} resources, e.g. "Минск", "Брест", "Лида", "Гомельская область"'),
        price_min: z.number().int().optional().describe("Minimum price in BYN"),
        price_max: z.number().int().optional().describe("Maximum price in BYN"),
        condition: z
          .string()
          .optional()
          .describe("Item condition: new, used"),
        private_only: z
          .boolean()
          .optional()
          .describe("Show only private sellers (no companies)"),
        page: z.number().int().min(1).optional().describe("Page number"),
      },
    },
    async ({ query, category, region, price_min, price_max, condition, private_only, page }) => {
      try {
        const result = await kufarSearch({
          query, category, region, price_min, price_max, condition, private_only, page,
        });
        return { content: [{ type: "text", text: result }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Resource: nesty districts by city
  server.registerResource(
    "nesty_districts",
    new ResourceTemplate("nesty://districts/{city}", {
      list: async () => {
        const cities = getCityNames();
        return {
          resources: Object.entries(cities).map(([slug, name]) => ({
            uri: `nesty://districts/${slug}`,
            name: `${name} — районы`,
            description: `Districts for rental search in ${name}`,
            mimeType: "application/json",
          })),
        };
      },
    }),
    { description: "Districts for apartment rental search on nesty.by" },
    async (uri, { city }) => {
      const filters = await fetchNestyFilters(city as string);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(filters.districts),
        }],
      };
    },
  );

  // Resource: nesty metro stations by city
  server.registerResource(
    "nesty_metro",
    new ResourceTemplate("nesty://metro/{city}", {
      list: async () => {
        const metroCities = getMetroCities();
        const cities = getCityNames();
        return {
          resources: metroCities.map((slug) => ({
            uri: `nesty://metro/${slug}`,
            name: `${cities[slug]} — метро`,
            description: `Metro stations for rental search in ${cities[slug]}`,
            mimeType: "application/json",
          })),
        };
      },
    }),
    { description: "Metro stations for apartment rental search on nesty.by" },
    async (uri, { city }) => {
      const filters = await fetchNestyFilters(city as string);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(filters.metroStations),
        }],
      };
    },
  );

  // Resource: avby models by brand — LLM sees all brands via resources/list
  server.registerResource(
    "avby_models",
    new ResourceTemplate("avby://models/{brand}", {
      list: async () => {
        try {
          const brands = await getAvbyBrands();
          return {
            resources: brands.map((b) => ({
                uri: `avby://models/${b.slug}`,
                name: b.name,
                description: `Models for ${b.name}${b.count ? ` (${b.count} listings)` : ""}`,
                mimeType: "application/json",
              })),
          };
        } catch {
          return { resources: [] };
        }
      },
    }),
    { description: "Car models for a brand on cars.av.by" },
    async (uri, { brand }) => {
      const cacheKey = `models_${brand}`;
      const cached = await readAvbyCache(cacheKey);
      if (cached) {
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(cached) }] };
      }
      const html = await fetchHtmlWithBrowser(
        `https://cars.av.by/${encodeURIComponent(brand as string)}`,
        FETCH_LIMITS.timeoutMs,
      );
      const models = parseAvByModels(html);
      await writeAvbyCache(cacheKey, models);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(models) }] };
    },
  );

  // Resource: kufar top-level categories (parsed from kufar.by/l)
  server.registerResource(
    "kufar_categories",
    "kufar://categories",
    { description: "Top-level categories on kufar.by marketplace" },
    async (uri) => {
      const categories = await fetchKufarCategories();
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(categories),
        }],
      };
    },
  );

  // Resource: kufar subcategories per category (parsed from category page)
  server.registerResource(
    "kufar_subcategories",
    new ResourceTemplate("kufar://subcategories/{category}", {
      list: async () => {
        try {
          const categories = await fetchKufarCategories();
          return {
            resources: categories.map((c) => ({
              uri: `kufar://subcategories/${c.slug}`,
              name: c.name,
              description: `Subcategories for ${c.name}`,
              mimeType: "application/json",
            })),
          };
        } catch {
          return { resources: [] };
        }
      },
    }),
    { description: "Subcategories for a category on kufar.by marketplace" },
    async (uri, { category }) => {
      const subs = await fetchKufarSubcategories(category as string);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(subs),
        }],
      };
    },
  );

  // Resource: kufar top-level regions (oblasts + Minsk)
  server.registerResource(
    "kufar_regions",
    "kufar://regions",
    { description: "Top-level regions (oblasts) on kufar.by. Use Russian name as the region parameter. Read kufar://areas/{rgn} for cities within a region." },
    async (uri) => {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(getKufarTopRegions()),
        }],
      };
    },
  );

  // Resource: kufar areas (cities/districts) within a region
  server.registerResource(
    "kufar_areas",
    new ResourceTemplate("kufar://areas/{rgn}", {
      list: async () => {
        const topRegions = getKufarTopRegions();
        return {
          resources: topRegions.map((r) => ({
            uri: `kufar://areas/${r.rgn}`,
            name: r.name,
            description: `Cities and districts in ${r.name}`,
            mimeType: "application/json",
          })),
        };
      },
    }),
    { description: "Cities and districts within a region on kufar.by" },
    async (uri, { rgn }) => {
      const areas = getKufarAreas(rgn as string);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(areas),
        }],
      };
    },
  );

  // Relax.by place tools (restaurants, cafes, bars, etc.)
  const relaxCityValues = Object.keys(RELAX_CITIES).join(", ");
  for (const t of RELAX_PLACE_TYPES) {
    server.registerTool(
      t.tool,
      {
        description: t.description,
        inputSchema: {
          city: z
            .string()
            .optional()
            .describe(`City: ${relaxCityValues}. Default: all cities.`),
          page: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe("Page number (default 1)"),
        },
      },
      async ({ city, page }) => {
        try {
          const result = await relaxPlaceSearch(t.path, { city, page });
          return { content: [{ type: "text", text: result }] };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      },
    );
  }

  // Relax.by afisha tools (cinema, concerts, theatre, etc.)
  for (const t of RELAX_AFISHA_TYPES) {
    server.registerTool(
      t.tool,
      {
        description: t.description,
        inputSchema: {
          city: z
            .string()
            .optional()
            .describe(`City: ${relaxCityValues}. Default: all cities.`),
        },
      },
      async ({ city }) => {
        try {
          const result = await relaxAfishaSearch(t.slug, { city });
          return { content: [{ type: "text", text: result }] };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      },
    );
  }

  return server;
}
