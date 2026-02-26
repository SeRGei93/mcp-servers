export interface SearchResult {
  title: string;
  description: string;
  url: string;
}

export interface RateLimit {
  perSecond: number;
  perMonth: number;
}

export interface RequestCount {
  second: number;
  month: number;
  lastReset: number;
  monthStart: number;
}

export interface ResolvedRegion {
  requested: string;
  resolved: string;
  note?: string;
}
