import { fetchPageAsMarkdown } from "../fetch.js";
import { FETCH_LIMITS } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Med103DoctorType {
  tool: string;
  specialty: string;
  description: string;
}

export interface Med103ClinicType {
  tool: string;
  path: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Cities
// ---------------------------------------------------------------------------

export const MED103_CITIES: Record<string, string> = {
  minsk: "minsk",
  brest: "brest",
  gomel: "gomel",
  grodno: "grodno",
  vitebsk: "vitebsk",
  mogilev: "mogilev",
  baranovichi: "baranovichi",
};

// ---------------------------------------------------------------------------
// Doctor types (22 tools — one per specialty)
// ---------------------------------------------------------------------------

export const MED103_DOCTOR_TYPES: Med103DoctorType[] = [
  { tool: "103by_oftalmolog", specialty: "oftalmolog", description: "Search ophthalmologists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_lor", specialty: "lor", description: "Search ENT doctors (otolaryngologists) on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_nevrolog", specialty: "nevrolog", description: "Search neurologists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_triholog", specialty: "triholog", description: "Search trichologists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_psihoterapevt", specialty: "psihoterapevt", description: "Search psychotherapists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_dermatolog", specialty: "dermatolog", description: "Search dermatologists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_ginekolog", specialty: "ginekolog", description: "Search gynecologists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_kardiolog", specialty: "kardiolog", description: "Search cardiologists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_ortoped", specialty: "ortoped", description: "Search orthopedists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_mammolog", specialty: "mammolog", description: "Search mammologists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_revmatolog", specialty: "revmatolog", description: "Search rheumatologists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_endokrinolog", specialty: "endokrinolog", description: "Search endocrinologists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_pediatr", specialty: "pediatr", description: "Search pediatricians on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_gastroenterolog", specialty: "gastroenterolog", description: "Search gastroenterologists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_allergolog", specialty: "allergolog", description: "Search allergists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_proktolog", specialty: "proktolog", description: "Search proctologists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_pulmonolog", specialty: "pulmonolog", description: "Search pulmonologists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_terapevt", specialty: "terapevt", description: "Search general practitioners (therapists) on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_urolog", specialty: "urolog", description: "Search urologists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_hirurg", specialty: "hirurg", description: "Search surgeons on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_kosmetolog", specialty: "kosmetolog", description: "Search cosmetologists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
  { tool: "103by_stomatolog", specialty: "stomatolog-terapevt", description: "Search dentists on 103.by (Belarus). Returns list of doctors with names, clinics, ratings, prices. Optional city and page." },
];

// ---------------------------------------------------------------------------
// Clinic types (4 tools)
// ---------------------------------------------------------------------------

export const MED103_CLINIC_TYPES: Med103ClinicType[] = [
  { tool: "103by_med_centers", path: "/cat/med/medicinskie-centry/", description: "Search medical centers on 103.by (Belarus). Returns list of clinics with names, addresses, ratings. Optional city and page." },
  { tool: "103by_stomatologii", path: "/cat/med/stomatologii/", description: "Search dental clinics on 103.by (Belarus). Returns list of dental clinics with names, addresses, ratings. Optional city and page." },
  { tool: "103by_bolnitsy", path: "/cat/med/bolnitsy/", description: "Search hospitals on 103.by (Belarus). Returns list of hospitals with names, addresses, ratings. Optional city and page." },
  { tool: "103by_polikliniki", path: "/cat/med/polikliniki/", description: "Search polyclinics on 103.by (Belarus). Returns list of polyclinics with names, addresses, ratings. Optional city and page." },
];

// ---------------------------------------------------------------------------
// Sort orders for doctor listings
// ---------------------------------------------------------------------------

export const MED103_SORT_ORDERS = ["reviews", "rating", "prices", "work_experience"] as const;
export type Med103SortOrder = typeof MED103_SORT_ORDERS[number];

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

function appendQueryParams(url: string, params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, v]) => v);
  if (entries.length === 0) return url;
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

function buildDoctorUrl(specialty: string, params: { city?: string; page?: number; sort_order?: string }): string {
  const city = params.city?.toLowerCase().trim();
  if (city && !MED103_CITIES[city]) {
    throw new Error(`Unknown city "${params.city}". Available: ${Object.keys(MED103_CITIES).join(", ")}`);
  }

  // https://www.103.by/doctor/oftalmolog/minsk/?sort_order=rating&page=2
  let url = `https://www.103.by/doctor/${specialty}/`;
  if (city) {
    url += `${city}/`;
  }
  const qp: Record<string, string> = {};
  if (params.sort_order) qp.sort_order = params.sort_order;
  if (params.page != null && params.page > 1) qp.page = String(params.page);
  return appendQueryParams(url, qp);
}

function buildClinicUrl(path: string, params: { city?: string; page?: number }): string {
  const city = params.city?.toLowerCase().trim();
  if (city && !MED103_CITIES[city]) {
    throw new Error(`Unknown city "${params.city}". Available: ${Object.keys(MED103_CITIES).join(", ")}`);
  }

  // https://www.103.by/cat/med/medicinskie-centry/minsk/?page=2
  let url = `https://www.103.by${path}`;
  if (city) {
    url += `${city}/`;
  }
  if (params.page != null && params.page > 1) {
    url += `?page=${params.page}`;
  }
  return url;
}

function buildServiceUrl(service: string, params: { city?: string }): string {
  const city = params.city?.toLowerCase().trim();
  if (city && !MED103_CITIES[city]) {
    throw new Error(`Unknown city "${params.city}". Available: ${Object.keys(MED103_CITIES).join(", ")}`);
  }

  // https://www.103.by/list/mrt/minsk/
  let url = `https://www.103.by/list/${service}/`;
  if (city) {
    url += `${city}/`;
  }
  return url;
}

function buildPharmacyUrl(medicine: string): string {
  // https://apteka.103.by/search/?q=парацетамол
  return `https://apteka.103.by/search/?q=${encodeURIComponent(medicine)}`;
}

// ---------------------------------------------------------------------------
// Search functions
// ---------------------------------------------------------------------------

export async function med103DoctorSearch(
  specialty: string,
  params: { city?: string; page?: number; sort_order?: string },
): Promise<string> {
  const url = buildDoctorUrl(specialty, params);
  return fetchPageAsMarkdown(url, FETCH_LIMITS.timeoutMs);
}

export async function med103ClinicSearch(
  path: string,
  params: { city?: string; page?: number },
): Promise<string> {
  const url = buildClinicUrl(path, params);
  return fetchPageAsMarkdown(url, FETCH_LIMITS.timeoutMs);
}

export async function med103ServiceSearch(
  service: string,
  params: { city?: string },
): Promise<string> {
  const url = buildServiceUrl(service, params);
  return fetchPageAsMarkdown(url, FETCH_LIMITS.timeoutMs);
}

export async function med103PharmacySearch(
  medicine: string,
): Promise<string> {
  const url = buildPharmacyUrl(medicine);
  return fetchPageAsMarkdown(url, FETCH_LIMITS.timeoutMs);
}
