import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { statelessHandler } from "express-mcp-handler";
import { z } from "zod";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

interface SearchResult {
  title: string;
  description: string;
  url: string;
}

interface RateLimit {
  perSecond: number;
  perMonth: number;
}

interface RequestCount {
  second: number;
  month: number;
  lastReset: number;
}

interface ResolvedRegion {
  requested: string;
  resolved: string;
  note?: string;
}

const CONFIG = {
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

const WEB_SEARCH_TOOL_DESCRIPTION =
  "Performs a web search. " +
  "Use for general queries, recent events, and broad information gathering. " +
  `Maximum ${CONFIG.search.maxResults} results per request.`;
const WEB_SEARCH_BATCH_TOOL_DESCRIPTION =
  "Runs multiple search queries in parallel and returns grouped results.";

const FETCH_PAGE_TOOL_DESCRIPTION =
  "Fetches a web page by URL, extracts the main content, removes visual noise, and returns markdown.";

const FETCH_LIMITS = {
  timeoutMs: 30000,
} as const;

const DEFAULT_REGION = "ru-by";
const DEFAULT_SEARCH_LANGUAGE = "all";
const SEARCH_API_URL = process.env.SEARXNG_URL ?? "http://searxng:8080";
const SEARCH_ENGINES = process.env.SEARXNG_ENGINES ?? "google,yandex";
const SEARCH_USERNAME = process.env.SEARXNG_USERNAME;
const SEARCH_PASSWORD = process.env.SEARXNG_PASSWORD;
const SEARCH_CATEGORIES = process.env.SEARXNG_CATEGORIES ?? "general";
const SEARCH_API_TIMEOUT_MS = Number.parseInt(
  process.env.SEARXNG_TIMEOUT_MS ?? "12000",
  10
);
const SEARCH_API_RETRIES = Number.parseInt(
  process.env.SEARXNG_RETRIES ?? "2",
  10
);
const SEARCH_API_BACKOFF_MS = Number.parseInt(
  process.env.SEARXNG_RETRY_BACKOFF_MS ?? "350",
  10
);
const MAX_BATCH_QUERIES = Number.parseInt(process.env.MAX_BATCH_QUERIES ?? "8", 10);

const REGION_ALIASES: Record<string, string> = {
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

const REGION_TO_LANGUAGE: Record<string, string> = {
  "wt-wt": "all",
  "ru-ru": "ru-RU",
  "ru-by": "ru-BY",
  "ua-uk": "uk-UA",
  "us-en": "en-US",
  "uk-en": "en-GB",
  "de-de": "de-DE",
  "fr-fr": "fr-FR",
};

let requestCount: RequestCount = {
  second: 0,
  month: 0,
  lastReset: Date.now(),
};

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function checkRateLimit(weight: number = 1): void {
  const now = Date.now();

  if (now - requestCount.lastReset > 1000) {
    requestCount.second = 0;
    requestCount.lastReset = now;
  }

  if (
    requestCount.second + weight > CONFIG.rateLimit.perSecond ||
    requestCount.month + weight > CONFIG.rateLimit.perMonth
  ) {
    throw new Error("Rate limit exceeded");
  }

  requestCount.second += weight;
  requestCount.month += weight;
}

function formatSearchResults(query: string, results: SearchResult[]): string {
  const formattedResults = results
    .map((r) => {
      return `### ${r.title}
${r.description}

Read more: ${r.url}
`;
    })
    .join("\n\n");

  return `# Web Search Results
Query: ${query}
Results: ${results.length}

---

${formattedResults}
`;
}

function resolveSearchRegion(region?: string): ResolvedRegion {
  if (!region) {
    return {
      requested: "default",
      resolved: DEFAULT_REGION,
    };
  }

  const normalized = region.trim().toLowerCase().replace("_", "-");
  if (!normalized) {
    return {
      requested: "default",
      resolved: DEFAULT_REGION,
    };
  }

  if (/^[a-z]{2}-[a-z]{2}$/.test(normalized)) {
    return {
      requested: region,
      resolved: normalized,
    };
  }

  const aliased = REGION_ALIASES[normalized];
  if (aliased) {
    const note =
      aliased === normalized
        ? undefined
        : `Region "${region}" mapped to "${aliased}".`;
    return {
      requested: region,
      resolved: aliased,
      note,
    };
  }

  return {
    requested: region,
    resolved: DEFAULT_REGION,
    note: `Unknown region "${region}", fallback to "${DEFAULT_REGION}".`,
  };
}

function resolveSearchLanguage(resolvedRegion: string): string {
  return REGION_TO_LANGUAGE[resolvedRegion] ?? DEFAULT_SEARCH_LANGUAGE;
}

async function performSearxSearch(
  query: string,
  safeSearch: "strict" | "moderate" | "off",
  region?: string
): Promise<SearchResult[]> {
  const resolvedRegion = resolveSearchRegion(region);
  const language = resolveSearchLanguage(resolvedRegion.resolved);
  const safeSearchLevel = safeSearch === "strict" ? "2" : safeSearch === "off" ? "0" : "1";

  const params = new URLSearchParams({
    q: query,
    format: "json",
    engines: SEARCH_ENGINES,
    language,
    safesearch: safeSearchLevel,
    categories: SEARCH_CATEGORIES,
  });
  const headers: HeadersInit = {
    accept: "application/json",
    "user-agent": "web-search-mcp/1.0",
  };

  if (SEARCH_USERNAME && SEARCH_PASSWORD) {
    const token = Buffer.from(`${SEARCH_USERNAME}:${SEARCH_PASSWORD}`).toString("base64");
    headers.authorization = `Basic ${token}`;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= SEARCH_API_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEARCH_API_TIMEOUT_MS);

    try {
      const response = await fetch(`${SEARCH_API_URL}/search?${params.toString()}`, {
        method: "GET",
        signal: controller.signal,
        headers,
      });

      if (!response.ok) {
        if (response.status >= 500 && attempt < SEARCH_API_RETRIES) {
          await sleep(SEARCH_API_BACKOFF_MS * (attempt + 1));
          continue;
        }
        throw new Error(`Search backend failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        results?: Array<{ title?: string; content?: string; url?: string }>;
      };

      const results = (payload.results ?? [])
        .filter((item) => typeof item.url === "string" && item.url.length > 0)
        .map((item) => ({
          title: item.title?.trim() || "Untitled result",
          description: item.content?.trim() || item.title?.trim() || "No description",
          url: item.url as string,
        }));

      return results;
    } catch (error) {
      lastError = error;
      if (attempt < SEARCH_API_RETRIES) {
        await sleep(SEARCH_API_BACKOFF_MS * (attempt + 1));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Search backend request failed");
}

async function performWebSearch(
  query: string,
  count: number = CONFIG.search.defaultResults,
  safeSearch: "strict" | "moderate" | "off" = CONFIG.search.defaultSafeSearch,
  region?: string,
  skipRateLimitCheck: boolean = false
): Promise<string> {
  if (!skipRateLimitCheck) {
    checkRateLimit();
  }
  const resolvedRegion = resolveSearchRegion(region);
  const searxResults = await performSearxSearch(query, safeSearch, resolvedRegion.resolved);

  if (searxResults.length === 0) {
    return `# Web Search Results
Query: ${query}
Region: ${resolvedRegion.resolved}
No results found.`;
  }

  const results: SearchResult[] = searxResults.slice(0, count);

  const result = formatSearchResults(query, results);
  const regionLine = `Region: ${resolvedRegion.resolved}\n`;
  const noteLine = resolvedRegion.note ? `Note: ${resolvedRegion.note}\n` : "";

  return result.replace(
    `Query: ${query}\n`,
    `Query: ${query}\n${regionLine}${noteLine}`
  );
}

async function performBatchWebSearch(
  queries: string[],
  count: number,
  safeSearch: "strict" | "moderate" | "off",
  region?: string
): Promise<string> {
  checkRateLimit(queries.length);

  const jobs = queries.map(async (query) => {
    try {
      const result = await performWebSearch(
        query,
        count,
        safeSearch,
        region,
        true
      );
      return { query, ok: true as const, result };
    } catch (error) {
      return {
        query,
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const settled = await Promise.all(jobs);
  const success = settled.filter((item) => item.ok);
  const failed = settled.filter((item) => !item.ok);

  const sections = settled
    .map((item) => {
      if (item.ok) {
        return `## Query: ${item.query}\n\n${item.result}`;
      }
      return `## Query: ${item.query}\n\nError: ${item.error}`;
    })
    .join("\n\n---\n\n");

  return `# Batch Web Search Results
Total queries: ${queries.length}
Successful: ${success.length}
Failed: ${failed.length}

${sections}`;
}

async function fetchRawHtml(url: string, timeoutMs: number): Promise<string> {
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

function extractMainHtml(url: string, html: string): {
  title: string;
  html: string;
} {
  const dom = new JSDOM(html, { url });
  const parsed = new Readability(dom.window.document).parse();

  if (parsed?.content) {
    return {
      title: parsed.title ?? "Untitled page",
      html: parsed.content,
    };
  }

  const fallbackTitle =
    dom.window.document.title?.trim() || new URL(url).hostname;
  const fallbackHtml =
    dom.window.document.body?.innerHTML ??
    `<article><p>No readable content extracted.</p></article>`;

  return {
    title: fallbackTitle,
    html: fallbackHtml,
  };
}

async function fetchPageAsMarkdown(
  url: string,
  timeoutMs: number
): Promise<string> {
  const html = await fetchRawHtml(url, timeoutMs);
  const extracted = extractMainHtml(url, html);
  const markdownBody = turndown.turndown(extracted.html).trim();

  const output = `# ${extracted.title}

Source: ${url}

---

${markdownBody}`;

  return output;
}

function createServer(): McpServer {
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

  return server;
}

async function runServer(): Promise<void> {
  const rawPort = process.env.PORT ?? "3000";
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.status(200).json({
      name: CONFIG.server.name,
      version: CONFIG.server.version,
      transport: "streamable-http",
      endpoint: "/mcp",
    });
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: CONFIG.server.name,
      version: CONFIG.server.version,
    });
  });

  app.get("/mcp", (_req, res) => {
    res.status(405).set("Allow", "POST").json({
      error: "Method Not Allowed",
      message: "This server only supports POST requests (stateless mode).",
    });
  });

  app.post(
    "/mcp",
    statelessHandler(createServer, {
      onError: (error: Error) => {
        console.error("[ERROR] MCP request failed:", error);
      },
    })
  );

  app.listen(port, () => {
    console.error(`[INFO] web-search-service started on http://localhost:${port}`);
    console.error(`[INFO] MCP endpoint: POST http://localhost:${port}/mcp`);
  });
}

process.on("uncaughtException", (error) => {
  console.error("[FATAL] Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
  process.exit(1);
});

runServer().catch((error) => {
  console.error("[FATAL] Failed to start server:", error);
  process.exit(1);
});
