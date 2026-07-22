export interface CountryState {
  code: string;
  name: string;
}

export interface CountryOption {
  code: string;
  name: string;
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;
  stateRequired: boolean;
  states: CountryState[];
}

const CURRENCY_META: Record<string, { name: string; symbol: string }> = {
  USD: { name: "US Dollar", symbol: "$" },
  GBP: { name: "British Pound", symbol: "£" },
  INR: { name: "Indian Rupee", symbol: "₹" },
  EUR: { name: "Euro", symbol: "€" },
  AUD: { name: "Australian Dollar", symbol: "A$" },
  CAD: { name: "Canadian Dollar", symbol: "C$" },
  AED: { name: "UAE Dirham", symbol: "AED" },
  SGD: { name: "Singapore Dollar", symbol: "S$" },
  NGN: { name: "Nigerian Naira", symbol: "₦" },
  ZAR: { name: "South African Rand", symbol: "R" },
};

/** ISO country → ISO 4217 currency (Phase 1 supported countries only). */
export const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  IN: "INR",
  DE: "EUR",
  AU: "AUD",
  CA: "CAD",
  AE: "AED",
  SG: "SGD",
  NG: "NGN",
  ZA: "ZAR",
};

const RAW_COUNTRIES: Array<{
  code: string;
  name: string;
  stateRequired: boolean;
  states: CountryState[];
}> = [
  {
    code: "US",
    name: "United States",
    stateRequired: true,
    states: [
      { code: "CA", name: "California" },
      { code: "NY", name: "New York" },
      { code: "TX", name: "Texas" },
      { code: "FL", name: "Florida" },
      { code: "WA", name: "Washington" },
      { code: "IL", name: "Illinois" },
      { code: "MA", name: "Massachusetts" },
      { code: "CO", name: "Colorado" },
    ],
  },
  {
    code: "GB",
    name: "United Kingdom",
    stateRequired: true,
    states: [
      { code: "ENG", name: "England" },
      { code: "SCT", name: "Scotland" },
      { code: "WLS", name: "Wales" },
      { code: "NIR", name: "Northern Ireland" },
    ],
  },
  {
    code: "IN",
    name: "India",
    stateRequired: true,
    states: [
      { code: "MH", name: "Maharashtra" },
      { code: "KA", name: "Karnataka" },
      { code: "DL", name: "Delhi" },
      { code: "TN", name: "Tamil Nadu" },
      { code: "GJ", name: "Gujarat" },
      { code: "WB", name: "West Bengal" },
      { code: "TS", name: "Telangana" },
      { code: "RJ", name: "Rajasthan" },
    ],
  },
  {
    code: "DE",
    name: "Germany",
    stateRequired: true,
    states: [
      { code: "BY", name: "Bavaria" },
      { code: "BE", name: "Berlin" },
      { code: "NW", name: "North Rhine-Westphalia" },
      { code: "BW", name: "Baden-Württemberg" },
      { code: "HE", name: "Hesse" },
      { code: "HH", name: "Hamburg" },
    ],
  },
  {
    code: "AU",
    name: "Australia",
    stateRequired: true,
    states: [
      { code: "NSW", name: "New South Wales" },
      { code: "VIC", name: "Victoria" },
      { code: "QLD", name: "Queensland" },
      { code: "WA", name: "Western Australia" },
      { code: "SA", name: "South Australia" },
    ],
  },
  {
    code: "CA",
    name: "Canada",
    stateRequired: true,
    states: [
      { code: "ON", name: "Ontario" },
      { code: "BC", name: "British Columbia" },
      { code: "AB", name: "Alberta" },
      { code: "QC", name: "Quebec" },
    ],
  },
  {
    code: "AE",
    name: "United Arab Emirates",
    stateRequired: false,
    states: [
      { code: "DXB", name: "Dubai" },
      { code: "AUH", name: "Abu Dhabi" },
    ],
  },
  {
    code: "SG",
    name: "Singapore",
    stateRequired: false,
    states: [],
  },
  {
    code: "NG",
    name: "Nigeria",
    stateRequired: true,
    states: [
      { code: "LA", name: "Lagos" },
      { code: "AB", name: "Abuja" },
      { code: "RV", name: "Rivers" },
    ],
  },
  {
    code: "ZA",
    name: "South Africa",
    stateRequired: true,
    states: [
      { code: "GP", name: "Gauteng" },
      { code: "WC", name: "Western Cape" },
      { code: "KZN", name: "KwaZulu-Natal" },
    ],
  },
];

function buildCountryOption(raw: (typeof RAW_COUNTRIES)[number]): CountryOption {
  const currencyCode = COUNTRY_CURRENCY_MAP[raw.code] ?? "USD";
  const meta = CURRENCY_META[currencyCode] ?? CURRENCY_META.USD;
  return {
    code: raw.code,
    name: raw.name,
    currencyCode,
    currencyName: meta.name,
    currencySymbol: meta.symbol,
    stateRequired: raw.stateRequired,
    states: raw.states,
  };
}

export const COUNTRY_DATA: CountryOption[] = RAW_COUNTRIES.map(buildCountryOption);

export function isSupportedCountry(countryCode: string): boolean {
  return countryCode in COUNTRY_CURRENCY_MAP;
}

export function deriveCurrency(countryCode: string): string {
  return COUNTRY_CURRENCY_MAP[countryCode] ?? "USD";
}

export function currencySymbol(code: string): string {
  return CURRENCY_META[code]?.symbol ?? code;
}

export function currencyName(code: string): string {
  return CURRENCY_META[code]?.name ?? code;
}

export function countryName(countryCode: string): string {
  return COUNTRY_DATA.find((c) => c.code === countryCode)?.name ?? countryCode;
}

export function getCountryByCode(countryCode: string): CountryOption | undefined {
  return COUNTRY_DATA.find((c) => c.code === countryCode);
}

export function validateLocationInput(
  countryCode: string,
  stateCode: string | null | undefined,
): { ok: true; currencyCode: string } | { ok: false; error: string } {
  const country = getCountryByCode(countryCode);
  if (!country) {
    return { ok: false, error: "Unsupported country" };
  }
  if (country.stateRequired && !stateCode) {
    return { ok: false, error: "State or region is required for this country" };
  }
  if (stateCode && country.states.length > 0) {
    const valid = country.states.some((s) => s.code === stateCode);
    if (!valid) {
      return { ok: false, error: "Invalid state for selected country" };
    }
  }
  return { ok: true, currencyCode: country.currencyCode };
}

export function buildRateDisplay(
  booking: { rate: string | null; paymentType: string; currencyCode: string },
): string {
  const amount = booking.rate ?? "0";
  const code = booking.currencyCode ?? "USD";
  const name = currencyName(code);
  const symbol = currencySymbol(code);
  if (booking.paymentType === "hourly") return `${symbol}${amount} (${name}) per hour`;
  if (booking.paymentType === "daily") return `${symbol}${amount} (${name}) per day`;
  return `${symbol}${amount} (${name}) fixed price`;
}

export function convertAmount(
  amount: number,
  fromCode: string,
  toCode: string,
  rates: Record<string, number>,
): number | null {
  if (fromCode === toCode) return amount;
  const fromRate = rates[fromCode];
  const toRate = rates[toCode];
  if (!fromRate || !toRate) return null;
  const usd = amount / fromRate;
  return usd * toRate;
}
