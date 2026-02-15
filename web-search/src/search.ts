import type { SearchResult, ResolvedRegion } from "./types.js";
import {
  CONFIG,
  DEFAULT_REGION,
  DEFAULT_SEARCH_LANGUAGE,
  REGION_ALIASES,
  REGION_TO_LANGUAGE,
  SEARCH_API_BACKOFF_MS,
  SEARCH_API_RETRIES,
  SEARCH_API_TIMEOUT_MS,
  SEARCH_API_URL,
  SEARCH_CATEGORIES,
  SEARCH_ENGINES,
  SEARCH_PASSWORD,
  SEARCH_USERNAME,
} from "./config.js";
import { checkRateLimit } from "./rateLimit.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

export function resolveSearchRegion(region?: string): ResolvedRegion {
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
  const safeSearchLevel =
    safeSearch === "strict" ? "2" : safeSearch === "off" ? "0" : "1";

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
    const token = Buffer.from(
      `${SEARCH_USERNAME}:${SEARCH_PASSWORD}`
    ).toString("base64");
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
          description:
            item.content?.trim() || item.title?.trim() || "No description",
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

  throw lastError instanceof Error
    ? lastError
    : new Error("Search backend request failed");
}

export async function performWebSearch(
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
  const searxResults = await performSearxSearch(
    query,
    safeSearch,
    resolvedRegion.resolved
  );

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

export async function performBatchWebSearch(
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
