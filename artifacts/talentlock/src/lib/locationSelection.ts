import type { Country } from "@workspace/api-client-react";
import { formatLocationLabel } from "@/components/onboarding/CountryStateFields";

/** Best-effort reverse of formatLocationLabel for loading saved rule location strings. */
export function parseLocationSelection(
  countries: Country[],
  location: string | null | undefined,
): { countryCode: string; stateCode: string | null } {
  if (!location?.trim()) {
    return { countryCode: "", stateCode: null };
  }

  const trimmed = location.trim();

  for (const country of countries) {
    for (const state of country.states) {
      if (formatLocationLabel(countries, country.code, state.code) === trimmed) {
        return { countryCode: country.code, stateCode: state.code };
      }
    }
    if (formatLocationLabel(countries, country.code, null) === trimmed || country.name === trimmed) {
      return { countryCode: country.code, stateCode: null };
    }
  }

  const lower = trimmed.toLowerCase();
  for (const country of countries) {
    const countryHit =
      lower.includes(country.name.toLowerCase()) ||
      lower === country.code.toLowerCase();
    if (!countryHit) continue;
    const state = country.states.find(
      (item) =>
        lower.includes(item.name.toLowerCase()) ||
        lower.includes(item.code.toLowerCase()),
    );
    return { countryCode: country.code, stateCode: state?.code ?? null };
  }

  return { countryCode: "", stateCode: null };
}
