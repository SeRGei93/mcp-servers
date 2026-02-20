import { fetchPageAsMarkdown, fetchRawHtml } from "../fetch.js";
import { FETCH_LIMITS } from "../config.js";
import { parseAvByModels, type AvByBrand, type AvByModel } from "./cars-avby.js";
import { readAvbyCache, writeAvbyCache } from "./cache.js";

async function getModels(brand: string): Promise<AvByModel[]> {
  const cacheKey = `models_${brand}`;
  const cached = await readAvbyCache<AvByModel[]>(cacheKey);
  if (cached) return cached;
  const html = await fetchRawHtml(
    `https://cars.av.by/${encodeURIComponent(brand)}`,
    FETCH_LIMITS.timeoutMs,
  );
  const models = parseAvByModels(html);
  await writeAvbyCache(cacheKey, models);
  return models;
}

/** Label → ID maps for enum filters */
const ENGINE_TYPE: Record<string, number> = {
  "petrol": 1, "petrol-lpg": 2, "petrol-cng": 3,
  "hybrid": 4, "diesel": 5, "diesel-hybrid": 6, "electric": 7,
};

const TRANSMISSION_TYPE: Record<string, number> = {
  "automatic": 1, "manual": 2, "robot": 3, "cvt": 4,
};

const BODY_TYPE: Record<string, number> = {
  "suv-3d": 23, "suv": 6, "suv-5d": 6,
  "cabriolet": 7, "coupe": 1, "liftback": 26,
  "minivan": 4, "pickup": 8, "roadster": 18,
  "sedan": 5, "wagon": 2,
  "hatchback-3d": 24, "hatchback": 3, "hatchback-5d": 3,
};

const DRIVE_TYPE: Record<string, number> = {
  "fwd": 1, "front": 1,
  "rwd": 2, "rear": 2,
  "awd-part": 3, "part-time-awd": 3,
  "awd": 4, "full-time-awd": 4,
};

const CONDITION: Record<string, number> = {
  "new": 5, "used": 2, "damaged": 3, "parts": 4,
};

const COLOR: Record<string, number> = {
  "white": 1, "burgundy": 2, "yellow": 3, "green": 4,
  "brown": 5, "red": 6, "orange": 7,
  "silver": 8, "grey": 9, "blue": 10,
  "purple": 11, "black": 12,
};

const REGION: Record<string, number> = {
  "brest": 1001, "vitebsk": 1002, "gomel": 1003,
  "grodno": 1004, "minsk": 1005, "mogilev": 1006,
};

function resolveEnum(
  value: string,
  map: Record<string, number>,
  filterName: string,
): number {
  const key = value.toLowerCase().trim();
  const id = map[key];
  if (id != null) return id;
  const available = Object.keys(map).join(", ");
  throw new Error(`Unknown ${filterName} "${value}". Available: ${available}`);
}

function resolveEnumArray(
  values: string[],
  map: Record<string, number>,
  filterName: string,
  paramName: string,
): string[] {
  return values.map((v, i) => {
    const id = resolveEnum(v, map, filterName);
    return `${paramName}[${i}]=${id}`;
  });
}

export interface AvBySearchParams {
  brand: string;
  model?: string;
  year_min?: number;
  year_max?: number;
  price_usd_min?: number;
  price_usd_max?: number;
  mileage_km_max?: number;
  engine_type?: string;
  transmission?: string;
  body_type?: string;
  drive_type?: string;
  condition?: string;
  color?: string;
  region?: string;
  sort?: number;
  page?: number;
}

export async function avbySearch(
  params: AvBySearchParams,
  brands: AvByBrand[],
): Promise<string> {
  // Resolve brand slug → id
  const brandEntry = brands.find((b) => b.slug === params.brand);
  if (!brandEntry) {
    throw new Error(`Brand "${params.brand}" not found. Use brands from the resource list.`);
  }

  const urlParts: string[] = [`brands[0][brand]=${brandEntry.id}`];

  // Resolve model name → id
  if (params.model) {
    const models = await getModels(params.brand);
    const modelEntry = models.find(
      (m) => m.name.toLowerCase() === params.model!.toLowerCase(),
    );
    if (!modelEntry) {
      const available = models.map((m) => m.name).join(", ");
      throw new Error(`Model "${params.model}" not found for ${brandEntry.name}. Available: ${available}`);
    }
    urlParts.push(`brands[0][model]=${modelEntry.id}`);
  }

  // Range filters
  if (params.year_min != null) urlParts.push(`year[min]=${params.year_min}`);
  if (params.year_max != null) urlParts.push(`year[max]=${params.year_max}`);
  if (params.price_usd_min != null) urlParts.push(`price_usd[min]=${params.price_usd_min}`);
  if (params.price_usd_max != null) urlParts.push(`price_usd[max]=${params.price_usd_max}`);
  if (params.mileage_km_max != null) urlParts.push(`mileage_km[max]=${params.mileage_km_max}`);

  // Enum filters
  if (params.engine_type) {
    urlParts.push(...resolveEnumArray([params.engine_type], ENGINE_TYPE, "engine_type", "engine_type"));
  }
  if (params.transmission) {
    urlParts.push(...resolveEnumArray([params.transmission], TRANSMISSION_TYPE, "transmission", "transmission_type"));
  }
  if (params.body_type) {
    urlParts.push(...resolveEnumArray([params.body_type], BODY_TYPE, "body_type", "body_type"));
  }
  if (params.drive_type) {
    urlParts.push(...resolveEnumArray([params.drive_type], DRIVE_TYPE, "drive_type", "drive_type"));
  }
  if (params.condition) {
    urlParts.push(...resolveEnumArray([params.condition], CONDITION, "condition", "condition"));
  }
  if (params.color) {
    urlParts.push(...resolveEnumArray([params.color], COLOR, "color", "color"));
  }
  if (params.region) {
    urlParts.push(...resolveEnumArray([params.region], REGION, "region", "place_region"));
  }

  if (params.sort != null) urlParts.push(`sort=${params.sort}`);
  if (params.page != null) urlParts.push(`page=${params.page}`);

  const url = `https://cars.av.by/filter?${urlParts.join("&")}`;

  return fetchPageAsMarkdown(url, FETCH_LIMITS.timeoutMs);
}
