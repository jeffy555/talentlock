import { currencySymbol } from "./currencyUtils";

export function formatCurrency(amount: number, currencyCode = "USD"): string {
  const symbol = currencySymbol(currencyCode);
  if (amount >= 1000) return `${symbol}${(amount / 1000).toFixed(1)}k`;
  return `${symbol}${Math.round(amount).toLocaleString()}`;
}

export function formatRate(amount: number, currencyCode = "USD"): string {
  const symbol = currencySymbol(currencyCode);
  return `${symbol}${Math.round(amount).toLocaleString()}/hr`;
}
