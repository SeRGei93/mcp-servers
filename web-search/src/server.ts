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
  RABOTA_SEARCH_TOOL_DESCRIPTION,
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
import { nestySearch, fetchNestyFilters, fetchNestySubDistricts, getCityNames, getMetroCities } from "./nesty/search.js";
import { kufarSearch, fetchKufarCategories, fetchKufarSubcategories, getKufarTopRegions, getKufarAreas } from "./kufar/search.js";
import { rabotaSearch } from "./rabota_by/search.js";
import {
  RELAX_CITIES,
  relaxPlaceSearch,
  relaxAfishaSearch,
  getRelaxCategories,
  getRelaxAfishaCategories,
} from "./relax/search.js";
import {
  MED103_DOCTOR_TYPES,
  MED103_CLINIC_TYPES,
  MED103_CITIES,
  MED103_SORT_ORDERS,
  med103DoctorSearch,
  med103ClinicSearch,
  med103ServiceSearch,
  med103PharmacySearch,
} from "./103by/search.js";
import { CITIES, PERIODS, fetchWeather } from "./weather/weather.js";

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
        sub_district: z
          .array(z.string())
          .optional()
          .describe("Sub-districts (values from nesty://subdistricts/{city}/{district} resource)"),
        metro: z
          .array(z.string())
          .optional()
          .describe("Metro stations (values from nesty://metro/{city} resource)"),
        sources: z
          .array(z.string())
          .optional()
          .describe("Sources: Realt, Kufar, Onliner, Domovita, Hata, Neagent"),
        page: z.number().int().min(1).optional().describe("Page number (default 1)"),
      },
    },
    async ({ city, rooms, price_min, price_max, area_min, area_max, floor_min, floor_max, district, sub_district, metro, sources, page }) => {
      try {
        const result = await nestySearch({
          city, rooms, price_min, price_max, area_min, area_max,
          floor_min, floor_max, district, sub_district, metro, sources, page,
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

  server.registerTool(
    "rabota_search",
    {
      description: RABOTA_SEARCH_TOOL_DESCRIPTION,
      inputSchema: {
        text: z
          .string()
          .min(1)
          .describe("Search query text, e.g. job title, skills, company name"),
        area: z
          .string()
          .optional()
          .describe("City: minsk, brest, vitebsk, gomel, grodno, mogilev. Default: all Belarus."),
        experience: z
          .string()
          .optional()
          .describe("Experience: noExperience, between1And3, between3And6, moreThan6"),
        education: z
          .string()
          .optional()
          .describe("Education: higher, special_secondary, secondary, bachelor, master"),
        schedule: z
          .string()
          .optional()
          .describe("Schedule: fullDay, shift, flexible, remote, flyInFlyOut"),
        employment: z
          .string()
          .optional()
          .describe("Employment type: full, part, project"),
        salary: z
          .number()
          .int()
          .optional()
          .describe("Minimum salary in BYR"),
        only_with_salary: z
          .boolean()
          .optional()
          .describe("Only show vacancies with specified salary"),
        order_by: z
          .string()
          .optional()
          .describe("Sort: relevance, publication_time, salary_desc, salary_asc"),
        page: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Page number"),
      },
    },
    async ({ text, area, experience, education, schedule, employment, salary, only_with_salary, order_by, page }) => {
      try {
        const result = await rabotaSearch({
          text, area, experience, education, schedule, employment, salary, only_with_salary, order_by, page,
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

  // Resource: nesty sub-districts by city and district
  server.registerResource(
    "nesty_subdistricts",
    new ResourceTemplate("nesty://subdistricts/{city}/{district}", {
      list: async () => ({ resources: [] }),
    }),
    { description: "Sub-districts for a district in a city on nesty.by. First select a district from nesty://districts/{city}, then load sub-districts." },
    async (uri, { city, district }) => {
      const subDistricts = await fetchNestySubDistricts(city as string, decodeURIComponent(district as string));
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(subDistricts),
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

  // Relax.by resources
  const relaxCityValues = Object.keys(RELAX_CITIES).join(", ");

  server.registerResource(
    "relax_categories",
    "relax://categories",
    { description: "All place categories on www.relax.by with Russian names, paths, and groups. Use the path value as the category parameter for relax_search." },
    async (uri) => {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(getRelaxCategories()),
        }],
      };
    },
  );

  server.registerResource(
    "relax_afisha_categories",
    "relax://afisha_categories",
    { description: "All event categories on afisha.relax.by with Russian names. Use the slug value as the category parameter for relax_afisha." },
    async (uri) => {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(getRelaxAfishaCategories()),
        }],
      };
    },
  );

  // Relax.by tools (2 universal tools replacing 21 hardcoded ones)
  server.registerTool(
    "relax_search",
    {
      description: `Search places/venues on www.relax.by (Belarus). Common categories: ent/restorans (рестораны), ent/cafe (кафе), ent/bar (бары), ent/clubs (клубы), ent/coffee (кофейни), ent/sushi (суши), ent/saunas (бани), tourism/hotels (гостиницы), tourism/cottages (коттеджи), health/fitness (фитнес), health/beauty (салоны красоты), active/pools (бассейны), kids/entertainment (детские развлечения). For the full list of ~80 categories read the relax://categories resource. Response includes FastLinks for subcategory refinement.`,
      inputSchema: {
        category: z
          .string()
          .min(1)
          .describe('Category path, e.g. "ent/restorans", "tourism/hotels", "health/fitness". Also accepts full paths like "/cat/ent/restorans/" or URLs.'),
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
    async ({ category, city, page }) => {
      try {
        const result = await relaxPlaceSearch(category, { city, page });
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

  server.registerTool(
    "relax_afisha",
    {
      description: `Search events on afisha.relax.by (Belarus). Categories: kino (кино), theatre (театр), conserts (концерты), event (события), expo (выставки), quest (квесты), stand-up (стенд-ап), kids (детям), clubs (клубы), ekskursii (экскурсии), education (образование), sport (спорт), hokkej (хоккей), free (бесплатно), circus (цирк), entertainment (развлечения), kviz (квиз), festivali (фестивали). Full list: relax://afisha_categories resource.`,
      inputSchema: {
        category: z
          .string()
          .min(1)
          .describe('Afisha category slug, e.g. "kino", "conserts", "theatre", "event", "quest", "stand-up"'),
        city: z
          .string()
          .optional()
          .describe(`City: ${relaxCityValues}. Default: all cities.`),
      },
    },
    async ({ category, city }) => {
      try {
        const result = await relaxAfishaSearch(category, { city });
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

  // 103.by doctor tools (one per specialty)
  const med103CityValues = Object.keys(MED103_CITIES).join(", ");
  for (const t of MED103_DOCTOR_TYPES) {
    server.registerTool(
      t.tool,
      {
        description: t.description,
        inputSchema: {
          city: z
            .string()
            .optional()
            .describe(`City: ${med103CityValues}. Default: all cities.`),
          sort_order: z
            .enum(MED103_SORT_ORDERS)
            .optional()
            .describe("Sort: reviews, rating, prices, work_experience. Default: relevance."),
          page: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe("Page number (default 1)"),
        },
      },
      async ({ city, sort_order, page }) => {
        try {
          const result = await med103DoctorSearch(t.specialty, { city, sort_order, page });
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

  // 103.by clinic tools (med centers, dental, hospitals, polyclinics)
  for (const t of MED103_CLINIC_TYPES) {
    server.registerTool(
      t.tool,
      {
        description: t.description,
        inputSchema: {
          city: z
            .string()
            .optional()
            .describe(`City: ${med103CityValues}. Default: all cities.`),
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
          const result = await med103ClinicSearch(t.path, { city, page });
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

  // 103.by services tool (MRT, CT, UZI, etc.)
  server.registerTool(
    "103by_services",
    {
      description: "Search medical services on 103.by (Belarus). Returns list of clinics offering the service with prices. Requires city. Use full service slugs from the site, e.g. mrt, kt, uzi-pri-beremennosti, analiz-krovi, koloskopiya, gastroskopiya, mammografiya, ekg, ftorografiya.",
      inputSchema: {
        service: z
          .string()
          .min(1)
          .describe("Service slug, e.g. mrt, kt, uzi-pri-beremennosti, analiz-krovi, mammografiya, ekg"),
        city: z
          .string()
          .optional()
          .describe(`City: ${med103CityValues}. Default: all cities.`),
      },
    },
    async ({ service, city }) => {
      try {
        const result = await med103ServiceSearch(service, { city });
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

  // 103.by pharmacy tool
  server.registerTool(
    "103by_pharmacy",
    {
      description: "Search medicine prices in pharmacies on apteka.103.by (Belarus). Returns list of pharmacies with prices for the specified medicine.",
      inputSchema: {
        medicine: z
          .string()
          .min(1)
          .describe("Medicine name in Russian, e.g. парацетамол, ибупрофен, амоксициллин"),
      },
    },
    async ({ medicine }) => {
      try {
        const result = await med103PharmacySearch(medicine);
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

  // Resource: weather cities list
  server.registerResource(
    "weather_cities",
    "weather://cities",
    { description: "List of Belarusian cities available for weather forecast. Use city slug as {city} in weather://forecast/{city}/{period}." },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(
          Object.entries(CITIES).map(([slug, city]) => ({ slug, name: city.name })),
        ),
      }],
    }),
  );

  // Resource: weather forecast by city and period (gismeteo.by)
  const periodNames = Object.entries(PERIODS).map(([k, v]) => `${k} (${v.name})`).join(", ");
  server.registerResource(
    "weather_forecast",
    new ResourceTemplate("weather://forecast/{city}/{period}", {
      list: async () => ({
        resources: Object.entries(CITIES).flatMap(([slug, city]) =>
          Object.entries(PERIODS).map(([periodSlug, period]) => ({
            uri: `weather://forecast/${slug}/${periodSlug}`,
            name: `${city.name} — ${period.name}`,
            description: `Weather forecast for ${city.name}: ${period.name}`,
            mimeType: "text/html",
          })),
        ),
      }),
    }),
    { description: `Weather forecast for Belarusian cities from gismeteo.by. Periods: ${periodNames}.` },
    async (uri, { city, period }) => {
      const data = await fetchWeather(city as string, period as string);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/html",
          text: data,
        }],
      };
    },
  );

  return server;
}
