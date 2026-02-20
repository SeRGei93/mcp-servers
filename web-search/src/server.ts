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
} from "./config.js";
import { performBatchWebSearch, performWebSearch } from "./search.js";
import { fetchPageAsMarkdown, fetchRawHtml } from "./fetch.js";
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

export async function getAvbyBrands(): Promise<AvByBrand[]> {
  const cached = await readAvbyCache<AvByBrand[]>("brands");
  if (cached) return cached;
  const html = await fetchRawHtml("https://cars.av.by/", FETCH_LIMITS.timeoutMs);
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
      const html = await fetchRawHtml(
        `https://cars.av.by/${encodeURIComponent(brand as string)}`,
        FETCH_LIMITS.timeoutMs,
      );
      const models = parseAvByModels(html);
      await writeAvbyCache(cacheKey, models);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(models) }] };
    },
  );

  return server;
}
