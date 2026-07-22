import { useGetExchangeRates, type ExchangeRates } from "@workspace/api-client-react";

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  AUD: "A$",
  CAD: "C$",
  AED: "د.إ",
  SGD: "S$",
  NGN: "₦",
  ZAR: "R",
};

export const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  INR: "Indian Rupee",
  AUD: "Australian Dollar",
  CAD: "Canadian Dollar",
  AED: "UAE Dirham",
  SGD: "Singapore Dollar",
  NGN: "Nigerian Naira",
  ZAR: "South African Rand",
};

export function currencySymbol(code: string): string {
  if (code.length !== 3) return code;
  return CURRENCY_SYMBOLS[code] ?? code;
}

export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  IN: "India",
  DE: "Germany",
  AU: "Australia",
  CA: "Canada",
  AE: "United Arab Emirates",
  SG: "Singapore",
  NG: "Nigeria",
  ZA: "South Africa",
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

export function currencyName(code: string): string {
  return CURRENCY_NAMES[code] ?? code;
}

export function convertForDisplay(
  amount: number,
  fromCode: string,
  toCode: string,
  rates: Record<string, number> | undefined | null,
): number | null {
  if (fromCode === toCode) return amount;
  if (!rates) return null;
  const fromRate = rates[fromCode];
  const toRate = rates[toCode];
  if (!fromRate || !toRate) return null;
  const usd = amount / fromRate;
  return usd * toRate;
}

export function useExchangeRates() {
  return useGetExchangeRates({
    query: {
      staleTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
    } as any,
  });
}

export type { ExchangeRates };
