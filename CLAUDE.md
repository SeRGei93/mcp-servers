## Architecture

### Two MCP Servers

**web-search-mcp** (port 3000) — 4 MCP tools:
- `web_search` — single query via SearXNG
- `web_search_batch` — parallel multi-query
- `fetch_url` — fetch page, clean HTML, return markdown/clean HTML
- `search_news` — news feed aggregation from Belarusian news sites

**mcp-memory** (port 3001) — knowledge graph with JSONL persistence. Based on Anthropic's official memory server, adapted for HTTP transport.

Both use `express` + `express-mcp-handler` for stateless HTTP MCP at `POST /mcp`.

### Infrastructure (Docker Compose)

```
Cursor/Client → web-search-mcp (3000) → SearXNG (8080) → Redis (6379)
             → mcp-memory (3001)
```

SearXNG is a self-hosted meta-search engine proxying Google, Yandex, etc.

### Parser System (`web-search/src/parsers/`)

Two categories of parsers, both using JSDOM for DOM manipulation:

**Feed parsers** — implement `NewsParser` interface (`domains: string[]`, `parse(html, baseUrl): NewsItem[]`). Registered in `PARSER_REGISTRY` map by domain. Used by `search_news` tool.
- `onliner.ts`, `tochka.ts`, `smartpress.ts`

**Page parsers** — standalone `isXxxUrl()` / `extractXxxContent()` function pairs. Dispatched in `fetch.ts` via if-else chain. Used by `fetch_url` tool.
- `catalog-onliner.ts`, `shop-product.ts`, `gismeteo.ts`, `yandex-pogoda.ts`, `realt.ts`, `av-by.ts`

**Article parsers** — `isXxxArticleUrl()` / `parseXxxArticle()` pairs returning `NewsArticle`. Dispatched in `fetch.ts` before page parsers.
- `onliner-article.ts`, `tochka-article.ts`, `smartpress-article.ts`

Unrecognized URLs go through generic `cleanHtml()` which strips junk selectors and returns cleaned HTML.

### Fetch Pipeline (`web-search/src/fetch.ts`)

`fetchPageAsMarkdown(url, timeoutMs)` dispatch order:
1. Check fetch cache → return if hit
2. Article parsers (onliner, tochka, smartpress, realt) → markdown via `fetchNewsArticle`
3. Fetch raw HTML
4. Specialized page parsers (catalog, shop, weather, realt objects, av-by)
5. Generic `cleanHtml()` fallback (strips junk selectors, preserves JSON-LD)
6. Write to fetch cache

### Caching

- **News cache**: file-based in `.cache/news/`, 30min TTL, keyed by site name
- **Fetch cache**: file-based in `.cache/fetch/`, 10min TTL, keyed by URL hash, cleanup every 5min

### Configuration

All runtime config via environment variables — see `web-search/src/config.ts`. Key vars:
- `SEARXNG_URL`, `SEARXNG_ENGINES`, `SEARXNG_TIMEOUT_MS`, `SEARXNG_RETRIES`
- `RATE_LIMIT_PER_SECOND`, `RATE_LIMIT_PER_MONTH`
- `NEWS_CACHE_DIR`, `FETCH_CACHE_DIR`, `FETCH_CACHE_TTL_MS`

### Key Patterns

- ESM modules throughout (`"type": "module"`, Node16 module resolution)
- Zod v4 for all MCP tool input validation
- `@modelcontextprotocol/sdk` McpServer with `registerTool()` for tool definitions
- Rate limiting is in-memory with per-second and per-month counters (`rateLimit.ts`)
- Parsers return `{ title: string, html: string }` or `{ title: string, text: string }` — the `html` variant contains cleaned HTML (not markdown)

## Adding a New Parser

1. Create `web-search/src/parsers/<site>.ts` with URL detection function and extraction function
2. For feed parsers: implement `NewsParser` interface, register in `parsers/index.ts` via `registerParser()`
3. For page parsers: add `isXxxUrl()` / `extractXxxContent()` and wire into the if-else chain in `fetch.ts`
4. For article parsers: add `isXxxArticleUrl()` / `parseXxxArticle()`, export from `parsers/index.ts`, add to `fetchNewsArticle()` dispatch
