export function formatCurrency(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${Math.round(amount).toLocaleString()}`;
}

export function formatRate(amount: number): string {
  return `$${Math.round(amount).toLocaleString()}/hr`;
}
