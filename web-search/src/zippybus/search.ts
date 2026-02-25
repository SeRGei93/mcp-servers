import { fetchPageAsMarkdown } from "../fetch.js";
import { FETCH_LIMITS } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZippybusSearchParams {
  city: string;
  transport?: string;
  route?: string;
}

// ---------------------------------------------------------------------------
// Available cities (from the /by/ index page)
// ---------------------------------------------------------------------------

const CITY_SLUGS = new Set([
  "baranovichi", "belynichi-region", "borisov", "brest", "byhov",
  "vileyka", "vitebsk", "volkovysk", "glubokoe", "gorki-region",
  "grodno", "dobrush", "zhlobin", "zhodino", "zaslavl",
  "ivanovo", "kobrin", "krichev", "krichev-region",
  "lida", "luninets", "minsk", "mogilev", "molodechno",
  "mstislavskiy-rayon", "myadel", "nesvizh", "novopolotsk",
  "pinsk", "pinsk-region", "polotsk", "postavy",
  "slavgorod-region", "smolevichi", "stolin",
]);

const TRANSPORT_TYPES = new Set([
  "bus", "trolleybus", "tram", "routetaxi",
]);

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

function buildZippybusUrl(params: ZippybusSearchParams): string {
  const city = params.city.toLowerCase();
  if (!CITY_SLUGS.has(city)) {
    const available = [...CITY_SLUGS].sort().join(", ");
    throw new Error(`Unknown city "${params.city}". Available: ${available}`);
  }

  let path = `/by/${city}`;

  if (params.transport) {
    const transport = params.transport.toLowerCase();
    if (!TRANSPORT_TYPES.has(transport)) {
      const available = [...TRANSPORT_TYPES].join(", ");
      throw new Error(`Unknown transport type "${params.transport}". Available: ${available}`);
    }
    path += `/${transport}`;

    if (params.route) {
      path += `/${params.route}`;
    }
  }

  return `https://zippybus.com${path}`;
}

// ---------------------------------------------------------------------------
// Search function
// ---------------------------------------------------------------------------

export async function zippybusSearch(params: ZippybusSearchParams): Promise<string> {
  const url = buildZippybusUrl(params);
  return fetchPageAsMarkdown(url, FETCH_LIMITS.timeoutMs);
}
