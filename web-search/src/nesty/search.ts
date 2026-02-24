import {
  readFiltersCache, writeFiltersCache,
  readPostsCache, writePostsCache,
  readActualizedCache, writeActualizedCache,
} from "./cache.js";

const CITIES: Record<string, string> = {
  minsk: "Минск",
  brest: "Брест",
  grodno: "Гродно",
  gomel: "Гомель",
  mogilev: "Могилёв",
  vitebsk: "Витебск",
};

const METRO_CITIES = new Set(["minsk"]);

const API_HEADERS: Record<string, string> = {
  "Origin": "https://nesty.by",
  "Referer": "https://nesty.by/tabs/home",
  "Accept": "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "sec-fetch-dest": "empty",
};

const PAGE_LIMIT = 20;

export interface NestySearchParams {
  city: string;
  rooms?: number[];
  price_min?: number;
  price_max?: number;
  area_min?: number;
  area_max?: number;
  floor_min?: number;
  floor_max?: number;
  district?: string[];
  sub_district?: string[];
  metro?: string[];
  sources?: string[];
  sort?: string;
  page?: number;
}

/** Fields we actually use from /api/posts */
interface NestyPost {
  id: number;
  headline: string | null;
  priceUsd: number;
  storeysCount: number;
  storey: number;
  roomsCount: number;
  areaTotal: number;
  metroStationName: string | null;
  stateDistrictName: string | null;
  streetName: string | null;
  houseNumber: number | string | null;
  publishedAt: string;
  updatedAt: string | null;
  parsedSource: string;
}

/** Fields we actually use from /api/actualized-posts */
interface ActualizedDetail {
  description: string | null;
  parsedSource: string;
  originalUrl: string | null;
}

export interface NestyFilters {
  districts: string[];
  metroStations: string[];
}

interface PostsCacheData {
  totalCount: string;
  posts: NestyPost[];
}

export async function fetchNestySubDistricts(city: string, district: string): Promise<string[]> {
  const cityName = CITIES[city];
  if (!cityName) {
    throw new Error(`Unknown city "${city}". Available: ${Object.keys(CITIES).join(", ")}`);
  }

  const cacheKey = `${city}_sub_${district}`;
  const cached = await readFiltersCache<string[]>(cacheKey);
  if (cached) return cached;

  const url = `https://api.nesty.by/api/posts/filters/${encodeURIComponent(cityName)}/districts`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { ...API_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ districts: [district] }),
  });
  if (!resp.ok) {
    throw new Error(`Nesty sub-districts API error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json() as { subDistricts?: string[] };
  const subDistricts = data.subDistricts ?? [];

  await writeFiltersCache(cacheKey, subDistricts);
  return subDistricts;
}

export async function fetchNestyFilters(city: string): Promise<NestyFilters> {
  const cityName = CITIES[city];
  if (!cityName) {
    throw new Error(`Unknown city "${city}". Available: ${Object.keys(CITIES).join(", ")}`);
  }

  const cached = await readFiltersCache<NestyFilters>(city);
  if (cached) return cached;

  const url = `https://api.nesty.by/api/posts/filters/${encodeURIComponent(cityName)}`;
  const resp = await fetch(url, { headers: API_HEADERS });
  if (!resp.ok) {
    throw new Error(`Nesty filters API error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json() as {
    districts: string[];
    metroStations: string[];
  };

  const filters: NestyFilters = {
    districts: data.districts ?? [],
    metroStations: data.metroStations ?? [],
  };

  await writeFiltersCache(city, filters);
  return filters;
}

export function getCityNames(): Record<string, string> {
  return { ...CITIES };
}

export function getMetroCities(): string[] {
  return [...METRO_CITIES];
}

export async function nestySearch(params: NestySearchParams): Promise<string> {
  const cityName = CITIES[params.city];
  if (!cityName) {
    throw new Error(`Unknown city "${params.city}". Available: ${Object.keys(CITIES).join(", ")}`);
  }

  // Build query params
  const qp = new URLSearchParams();
  qp.set("city", cityName);
  qp.set("page", String(params.page ?? 1));
  qp.set("limit", String(PAGE_LIMIT));

  if (params.sort) {
    qp.set("sortBy", params.sort);
  } else {
    qp.set("sortBy", "date_desc");
  }

  if (params.price_min != null) qp.set("priceFrom", String(params.price_min));
  if (params.price_max != null) qp.set("priceTo", String(params.price_max));
  if (params.area_min != null) qp.set("areaFrom", String(params.area_min));
  if (params.area_max != null) qp.set("areaTo", String(params.area_max));
  if (params.floor_min != null) qp.set("floorFrom", String(params.floor_min));
  if (params.floor_max != null) qp.set("floorTo", String(params.floor_max));

  // Array params need [] suffix — URLSearchParams doesn't support duplicates with brackets,
  // so we build them manually
  let extraParams = "";
  if (params.rooms?.length) {
    extraParams += params.rooms.map((r) => `&rooms[]=${r}`).join("");
  }
  if (params.district?.length) {
    extraParams += params.district.map((d) => `&district[]=${encodeURIComponent(d)}`).join("");
  }
  if (params.metro?.length) {
    extraParams += params.metro.map((m) => `&metro[]=${encodeURIComponent(m)}`).join("");
  }
  if (params.sub_district?.length) {
    extraParams += params.sub_district.map((s) => `&subDistrict[]=${encodeURIComponent(s)}`).join("");
  }
  if (params.sources?.length) {
    extraParams += params.sources.map((s) => `&sources[]=${encodeURIComponent(s)}`).join("");
  }

  const postsUrl = `https://api.nesty.by/api/posts?${qp.toString()}${extraParams}`;

  // --- Список объявлений: кэш 10 мин ---
  let totalCount: string;
  let posts: NestyPost[];

  const postsCached = await readPostsCache<PostsCacheData>(postsUrl);
  if (postsCached) {
    totalCount = postsCached.totalCount;
    posts = postsCached.posts;
  } else {
    const postsResp = await fetch(postsUrl, { headers: API_HEADERS });
    if (!postsResp.ok) {
      throw new Error(`Nesty API error: ${postsResp.status} ${postsResp.statusText}`);
    }
    totalCount = postsResp.headers.get("x-total-count") ?? "?";
    const raw = (await postsResp.json()) as Record<string, unknown>[];
    posts = raw.map((p) => ({
      id: p.id as number,
      headline: (p.headline as string) ?? null,
      priceUsd: p.priceUsd as number,
      storeysCount: p.storeysCount as number,
      storey: p.storey as number,
      roomsCount: p.roomsCount as number,
      areaTotal: p.areaTotal as number,
      metroStationName: (p.metroStationName as string) ?? null,
      stateDistrictName: (p.stateDistrictName as string) ?? null,
      streetName: (p.streetName as string) ?? null,
      houseNumber: (p.houseNumber as number | string) ?? null,
      publishedAt: p.publishedAt as string,
      updatedAt: (p.updatedAt as string) ?? null,
      parsedSource: p.parsedSource as string,
    }));
    await writePostsCache(postsUrl, { totalCount, posts });
  }

  if (posts.length === 0) {
    return `# Аренда квартир — ${cityName} (найдено: 0)\n\nНичего не найдено по заданным критериям.`;
  }

  // --- Детальные карточки: кэш 1 час, запрашиваем только отсутствующие ---
  const actMap = new Map<number, ActualizedDetail>();
  const uncachedIds: number[] = [];

  for (const p of posts) {
    const cached = await readActualizedCache<ActualizedDetail>(p.id);
    if (cached) {
      actMap.set(p.id, cached);
    } else {
      uncachedIds.push(p.id);
    }
  }

  if (uncachedIds.length > 0) {
    const actUrl = `https://api.nesty.by/api/actualized-posts?ids=${uncachedIds.join(",")}`;
    const actResp = await fetch(actUrl, { headers: API_HEADERS });
    if (actResp.ok) {
      const rawAct = (await actResp.json()) as Record<string, unknown>[];
      for (const ap of rawAct) {
        const detail: ActualizedDetail = {
          description: (ap.description as string) ?? null,
          parsedSource: ap.parsedSource as string,
          originalUrl: (ap.originalUrl as string) ?? null,
        };
        await writeActualizedCache(ap.id as number, detail);
        actMap.set(ap.id as number, detail);
      }
    }
  }

  // Format markdown
  const page = params.page ?? 1;
  const lines: string[] = [];
  lines.push(`# Аренда квартир — ${cityName} (найдено: ${totalCount})\n`);

  if (Number(totalCount) > PAGE_LIMIT) {
    const totalPages = Math.ceil(Number(totalCount) / PAGE_LIMIT);
    lines.push(`Страница ${page} из ${totalPages}\n`);
  }

  for (const post of posts) {
    const act = actMap.get(post.id);
    const rooms = post.roomsCount;
    const price = post.priceUsd;
    const area = post.areaTotal ? `${post.areaTotal} м²` : "";
    const floor = post.storey && post.storeysCount
      ? `этаж ${post.storey}/${post.storeysCount}`
      : "";

    const headerParts = [
      `${rooms}к`,
      `${price}$/мес`,
      area,
      floor,
    ].filter(Boolean);
    lines.push(`## ${headerParts.join(" · ")}`);

    // Address line
    const addressParts: string[] = [];
    if (post.streetName && post.houseNumber) {
      addressParts.push(`${post.streetName} ${post.houseNumber}`);
    } else if (post.streetName) {
      addressParts.push(post.streetName);
    }
    if (post.stateDistrictName) {
      addressParts.push(post.stateDistrictName);
    }
    let addressLine = addressParts.join(", ");
    if (post.metroStationName) {
      addressLine += ` | Метро: ${post.metroStationName}`;
    }
    if (addressLine) lines.push(addressLine);

    // Description
    const desc = act?.description || post.headline;
    if (desc) {
      const trimmed = desc.length > 200 ? desc.slice(0, 200) + "…" : desc;
      lines.push(trimmed);
    }

    // Source link
    const source = act?.parsedSource ?? post.parsedSource;
    const originalUrl = act?.originalUrl;
    if (source && originalUrl) {
      lines.push(`Источник: ${source} | ${originalUrl}`);
    } else if (source) {
      lines.push(`Источник: ${source}`);
    }

    // Time
    const time = post.updatedAt || post.publishedAt;
    if (time) lines.push(time);

    lines.push("\n---\n");
  }

  return lines.join("\n");
}
