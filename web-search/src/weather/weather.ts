import { extractGismeteoContent } from "../parsers/gismeteo.js";
import { fetchHtmlWithBrowser } from "../browser.js";
import { FETCH_LIMITS } from "../config.js";

export interface City {
  name: string;
  path: string;
}

export const CITIES: Record<string, City> = {
  // Областные центры
  minsk:        { name: "Минск",        path: "/weather-minsk-4248/" },
  gomel:        { name: "Гомель",       path: "/weather-gomel-4918/" },
  grodno:       { name: "Гродно",       path: "/weather-grodno-4243/" },
  brest:        { name: "Брест",        path: "/weather-brest-4912/" },
  vitebsk:      { name: "Витебск",      path: "/weather-vitebsk-4218/" },
  mogilev:      { name: "Могилёв",      path: "/weather-mogilev-4251/" },
  // Крупные города
  bobruisk:     { name: "Бобруйск",     path: "/weather-bobruysk-4064/" },
  baranovichi:  { name: "Барановичи",   path: "/weather-baranovichi-4263/" },
  borisov:      { name: "Борисов",      path: "/weather-borisov-4235/" },
  pinsk:        { name: "Пинск",        path: "/weather-pinsk-4914/" },
  orsha:        { name: "Орша",         path: "/weather-orsha-4236/" },
  mozyr:        { name: "Мозырь",       path: "/weather-mozyr-4916/" },
  soligorsk:    { name: "Солигорск",    path: "/weather-soligorsk-11817/" },
  novopolotsk:  { name: "Новополоцк",   path: "/weather-novopolotsk-11026/" },
  lida:         { name: "Лида",         path: "/weather-lida-4244/" },
  molodechno:   { name: "Молодечно",    path: "/weather-molodechno-11818/" },
  polotsk:      { name: "Полоцк",       path: "/weather-polotsk-4215/" },
  zhlobin:      { name: "Жлобин",       path: "/weather-zhlobin-4267/" },
  svetlogorsk:  { name: "Светлогорск",  path: "/weather-svetlogorsk-11807/" },
  rechitsa:     { name: "Речица",       path: "/weather-rechytsa-11808/" },
  slutsk:       { name: "Слуцк",        path: "/weather-slutsk-4266/" },
  zhodino:      { name: "Жодино",       path: "/weather-zhodino-11949/" },
  kalinkovichi: { name: "Калинковичи",  path: "/weather-kalinkovichi-11015/" },
};

export interface Period {
  name: string;
  suffix: string;
}

export const PERIODS: Record<string, Period> = {
  today:    { name: "Сегодня",    suffix: "" },
  tomorrow: { name: "Завтра",     suffix: "tomorrow/" },
  "3-days": { name: "3 дня",      suffix: "3-days/" },
  weekend:  { name: "Выходные",   suffix: "weekend/" },
  "10-days":{ name: "10 дней",    suffix: "10-days/" },
};

const BASE_URL = "https://www.gismeteo.by";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  data: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function fetchWeather(slug: string, periodSlug: string): Promise<string> {
  const city = CITIES[slug];
  if (!city) {
    throw new Error(`Unknown city: ${slug}. Available: ${Object.keys(CITIES).join(", ")}`);
  }

  const period = PERIODS[periodSlug];
  if (!period) {
    throw new Error(`Unknown period: ${periodSlug}. Available: ${Object.keys(PERIODS).join(", ")}`);
  }

  const cacheKey = `${slug}:${periodSlug}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const url = `${BASE_URL}${city.path}${period.suffix}`;
  const html = await fetchHtmlWithBrowser(url, FETCH_LIMITS.timeoutMs);
  const result = extractGismeteoContent(html);

  if (!result) {
    throw new Error(`Failed to parse weather data for ${city.name} (${period.name})`);
  }

  const data = `# ${result.title}\n\n${result.text}`;
  cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });

  return data;
}
