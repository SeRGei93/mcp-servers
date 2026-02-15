import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
} from "./config.js";
import { performBatchWebSearch, performWebSearch } from "./search.js";
import { fetchPageAsMarkdown } from "./fetch.js";
import {
  searchNews,
  formatFeedSectionsToMarkdown,
} from "./parsers/index.js";

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
        const markdown = formatFeedSectionsToMarkdown(sections);
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
