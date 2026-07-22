import { eq } from "drizzle-orm";
import type { Logger } from "pino";

import {
  db as defaultDb,
  exchangeRateCacheTable,
  type ExchangeRateSnapshot,
} from "@workspace/db";

type DB = typeof defaultDb;
type Log = Pick<Logger, "info" | "warn" | "error">;

export const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  INR: 83.5,
  AUD: 1.52,
  CAD: 1.36,
  AED: 3.67,
  SGD: 1.35,
  NGN: 1550,
  ZAR: 18.5,
};

function cacheIdForToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function fetchRatesFromApi(): Promise<Record<string, number>> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) {
    throw new Error(`Exchange rate API returned ${res.status}`);
  }
  const body = (await res.json()) as { rates?: Record<string, number> };
  if (!body.rates || typeof body.rates !== "object") {
    throw new Error("Exchange rate API returned invalid payload");
  }
  return body.rates;
}

function snapshotFromRates(
  rates: Record<string, number>,
  source: ExchangeRateSnapshot["source"],
): ExchangeRateSnapshot {
  return {
    baseCurrency: "USD",
    rates,
    fetchedAt: new Date().toISOString(),
    source,
  };
}

export async function getOrFetchExchangeRates(
  dbClient: DB,
  log?: Log,
): Promise<ExchangeRateSnapshot> {
  const id = cacheIdForToday();
  const [cached] = await dbClient
    .select()
    .from(exchangeRateCacheTable)
    .where(eq(exchangeRateCacheTable.id, id))
    .limit(1);

  if (cached) {
    return {
      baseCurrency: "USD",
      rates: cached.rates,
      fetchedAt: cached.fetchedAt.toISOString(),
      source: "cache",
    };
  }

  try {
    const rates = await fetchRatesFromApi();
    const fetchedAt = new Date();
    await dbClient
      .insert(exchangeRateCacheTable)
      .values({
        id,
        baseCurrency: "USD",
        rates,
        fetchedAt,
        source: "api",
      })
      .onConflictDoUpdate({
        target: exchangeRateCacheTable.id,
        set: {
          rates,
          fetchedAt,
          source: "api",
        },
      });
    return {
      baseCurrency: "USD",
      rates,
      fetchedAt: fetchedAt.toISOString(),
      source: "api",
    };
  } catch (err) {
    log?.warn({ err }, "exchange rate API fetch failed — using fallback rates");
    return snapshotFromRates(FALLBACK_RATES, "fallback");
  }
}

export { convertAmount } from "./countryData";
