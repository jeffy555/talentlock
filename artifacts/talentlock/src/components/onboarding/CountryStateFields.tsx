import type { Country } from "@workspace/api-client-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function formatLocationLabel(
  countries: Country[],
  countryCode: string,
  stateCode: string | null | undefined,
): string {
  const country = countries.find((item) => item.code === countryCode);
  if (!country) return "";
  const state = country.states.find((item) => item.code === stateCode);
  return [state?.name, country.name].filter(Boolean).join(", ");
}

export function isLocationComplete(
  countries: Country[],
  countryCode: string,
  stateCode: string | null | undefined,
): boolean {
  const country = countries.find((item) => item.code === countryCode);
  return Boolean(country && (!country.stateRequired || stateCode));
}

interface CountryStateFieldsProps {
  countries: Country[];
  countryCode: string;
  stateCode: string | null;
  onCountryChange: (countryCode: string) => void;
  onStateChange: (stateCode: string | null) => void;
  disabled?: boolean;
}

export function CountryStateFields({
  countries,
  countryCode,
  stateCode,
  onCountryChange,
  onStateChange,
  disabled = false,
}: CountryStateFieldsProps) {
  const selected = countries.find((country) => country.code === countryCode);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Country</Label>
        <Select
          value={countryCode || undefined}
          onValueChange={(code) => {
            onCountryChange(code);
            onStateChange(null);
          }}
          disabled={disabled || countries.length === 0}
        >
          <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
          <SelectContent>
            {countries.map((country) => (
              <SelectItem key={country.code} value={country.code}>{country.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selected?.states.length ? (
        <div className="space-y-2">
          <Label>{selected.stateRequired ? "State / Province" : "State / Province (optional)"}</Label>
          <Select value={stateCode ?? undefined} onValueChange={onStateChange} disabled={disabled}>
            <SelectTrigger>
              <SelectValue placeholder={selected.stateRequired ? "Select state" : "Optional"} />
            </SelectTrigger>
            <SelectContent>
              {selected.states.map((state) => (
                <SelectItem key={state.code} value={state.code}>{state.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
