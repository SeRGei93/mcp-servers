import { fetchPageAsMarkdown } from "../fetch.js";
import { FETCH_LIMITS } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelaxPlaceType {
  tool: string;
  path: string;
  host: "www.relax.by";
  description: string;
}

export interface RelaxAfishaType {
  tool: string;
  slug: string;
  host: "afisha.relax.by";
  description: string;
}

// ---------------------------------------------------------------------------
// Place types (www.relax.by/cat/...)
// ---------------------------------------------------------------------------

export const RELAX_PLACE_TYPES: RelaxPlaceType[] = [
  { tool: "relax_restaurants", path: "/cat/ent/restorans/", host: "www.relax.by", description: "Search restaurants on relax.by (Belarus). Returns list of restaurants with names, addresses, ratings. Optional city and page." },
  { tool: "relax_cafes", path: "/cat/ent/cafe/", host: "www.relax.by", description: "Search cafes on relax.by (Belarus). Returns list of cafes with names, addresses, ratings. Optional city and page." },
  { tool: "relax_bars", path: "/cat/ent/bar/", host: "www.relax.by", description: "Search bars and pubs on relax.by (Belarus). Returns list of bars with names, addresses, ratings. Optional city and page." },
  { tool: "relax_clubs", path: "/cat/ent/clubs/", host: "www.relax.by", description: "Search nightclubs on relax.by (Belarus). Returns list of clubs with names, addresses, ratings. Optional city and page." },
  { tool: "relax_coffee", path: "/cat/ent/coffee/", host: "www.relax.by", description: "Search coffee shops on relax.by (Belarus). Returns list of coffee shops with names, addresses, ratings. Optional city and page." },
  { tool: "relax_delivery", path: "/cat/ent/dostavka/", host: "www.relax.by", description: "Search food delivery services on relax.by (Belarus). Returns list of delivery services. Optional city and page." },
  { tool: "relax_saunas", path: "/cat/ent/saunas/", host: "www.relax.by", description: "Search saunas and bathhouses on relax.by (Belarus). Returns list of saunas with names, addresses, ratings. Optional city and page." },
  { tool: "relax_hotels", path: "/cat/tourism/hotels/", host: "www.relax.by", description: "Search hotels on relax.by (Belarus). Returns list of hotels with names, addresses, ratings. Optional city and page." },
  { tool: "relax_cottages", path: "/cat/tourism/cottages/", host: "www.relax.by", description: "Search cottages and country estates on relax.by (Belarus). Returns list of cottages with names, addresses, ratings. Optional city and page." },
  { tool: "relax_fitness", path: "/cat/health/fitness/", host: "www.relax.by", description: "Search fitness clubs on relax.by (Belarus). Returns list of fitness clubs with names, addresses, ratings. Optional city and page." },
  { tool: "relax_beauty", path: "/cat/health/beauty/", host: "www.relax.by", description: "Search beauty salons on relax.by (Belarus). Returns list of salons with names, addresses, ratings. Optional city and page." },
  { tool: "relax_pools", path: "/cat/active/pools/", host: "www.relax.by", description: "Search swimming pools on relax.by (Belarus). Returns list of pools with names, addresses, ratings. Optional city and page." },
  { tool: "relax_kids", path: "/cat/kids/entertainment/", host: "www.relax.by", description: "Search kids entertainment on relax.by (Belarus). Returns list of entertainment venues for children. Optional city and page." },
  { tool: "relax_education", path: "/cat/education/foreign-language/", host: "www.relax.by", description: "Search language courses on relax.by (Belarus). Returns list of language schools and courses. Optional city and page." },
];

// ---------------------------------------------------------------------------
// Afisha types (afisha.relax.by/...)
// ---------------------------------------------------------------------------

export const RELAX_AFISHA_TYPES: RelaxAfishaType[] = [
  { tool: "relax_kino", slug: "kino", host: "afisha.relax.by", description: "Search cinema showtimes on afisha.relax.by (Belarus). Returns movie listings with times and venues. Optional city." },
  { tool: "relax_concerts", slug: "conserts", host: "afisha.relax.by", description: "Search concerts on afisha.relax.by (Belarus). Returns upcoming concerts with dates, venues, prices. Optional city." },
  { tool: "relax_theatre", slug: "theatre", host: "afisha.relax.by", description: "Search theatre performances on afisha.relax.by (Belarus). Returns upcoming plays with dates, venues, prices. Optional city." },
  { tool: "relax_events", slug: "event", host: "afisha.relax.by", description: "Search events on afisha.relax.by (Belarus). Returns upcoming events with dates, venues, prices. Optional city." },
  { tool: "relax_expo", slug: "expo", host: "afisha.relax.by", description: "Search exhibitions on afisha.relax.by (Belarus). Returns upcoming exhibitions with dates, venues, prices. Optional city." },
  { tool: "relax_standup", slug: "stand-up", host: "afisha.relax.by", description: "Search stand-up shows on afisha.relax.by (Belarus). Returns upcoming stand-up performances with dates, venues, prices. Optional city." },
  { tool: "relax_quests", slug: "quest", host: "afisha.relax.by", description: "Search quests on afisha.relax.by (Belarus). Returns available quest rooms with prices and descriptions. Optional city." },
];

// ---------------------------------------------------------------------------
// Cities
// ---------------------------------------------------------------------------

export const RELAX_CITIES: Record<string, string> = {
  minsk: "minsk",
  brest: "brest",
  gomel: "gomel",
  grodno: "grodno",
  vitebsk: "vitebsk",
  mogilev: "mogilev",
};

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

function buildPlaceUrl(path: string, params: { city?: string; page?: number }): string {
  const city = params.city?.toLowerCase().trim();
  if (city && !RELAX_CITIES[city]) {
    throw new Error(`Unknown city "${params.city}". Available: ${Object.keys(RELAX_CITIES).join(", ")}`);
  }

  // https://www.relax.by/cat/ent/restorans/minsk/?page=2
  let url = `https://www.relax.by${path}`;
  if (city) {
    url += `${city}/`;
  }
  if (params.page != null && params.page > 1) {
    url += `?page=${params.page}`;
  }
  return url;
}

function buildAfishaUrl(slug: string, params: { city?: string }): string {
  const city = params.city?.toLowerCase().trim();
  if (city && !RELAX_CITIES[city]) {
    throw new Error(`Unknown city "${params.city}". Available: ${Object.keys(RELAX_CITIES).join(", ")}`);
  }

  // https://afisha.relax.by/kino/minsk/
  let url = `https://afisha.relax.by/${slug}/`;
  if (city) {
    url += `${city}/`;
  }
  return url;
}

// ---------------------------------------------------------------------------
// Search functions
// ---------------------------------------------------------------------------

export async function relaxPlaceSearch(
  path: string,
  params: { city?: string; page?: number },
): Promise<string> {
  const url = buildPlaceUrl(path, params);
  return fetchPageAsMarkdown(url, FETCH_LIMITS.timeoutMs);
}

export async function relaxAfishaSearch(
  slug: string,
  params: { city?: string },
): Promise<string> {
  const url = buildAfishaUrl(slug, params);
  return fetchPageAsMarkdown(url, FETCH_LIMITS.timeoutMs);
}
