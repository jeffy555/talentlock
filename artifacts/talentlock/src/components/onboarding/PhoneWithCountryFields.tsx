import { useEffect, useMemo, useState } from "react";
import type { Country } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  composeContactPhone,
  splitContactPhone,
} from "@/lib/contactValidation";

interface PhoneWithCountryFieldsProps {
  countries: Country[];
  /** Full E.164-style phone (+dial + national). */
  value: string;
  onChange: (e164Phone: string) => void;
  /** Preferred country when value is empty. */
  defaultCountryCode?: string;
  disabled?: boolean;
  id?: string;
  required?: boolean;
}

export function PhoneWithCountryFields({
  countries,
  value,
  onChange,
  defaultCountryCode = "IN",
  disabled = false,
  id = "phone",
  required = true,
}: PhoneWithCountryFieldsProps) {
  const dialByCountry = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of countries) {
      if (c.dialCode) map[c.code] = c.dialCode;
    }
    return map;
  }, [countries]);

  const [phoneCountry, setPhoneCountry] = useState(defaultCountryCode);
  const [national, setNational] = useState("");

  useEffect(() => {
    if (!countries.length) return;
    const split = splitContactPhone(value, dialByCountry);
    if (split.countryCode) {
      setPhoneCountry(split.countryCode);
      setNational(split.national);
      return;
    }
    const fallback =
      countries.find((c) => c.code === defaultCountryCode)?.code
      ?? countries[0]?.code
      ?? "IN";
    setPhoneCountry(fallback);
    if (split.national) setNational(split.national);
  }, [value, countries, dialByCountry, defaultCountryCode]);

  const selected = countries.find((c) => c.code === phoneCountry) ?? countries[0];
  const dial = selected?.dialCode ?? dialByCountry[phoneCountry] ?? "";

  const emit = (nextCountry: string, nextNational: string) => {
    const next = countries.find((c) => c.code === nextCountry);
    const nextDial = next?.dialCode ?? "";
    onChange(composeContactPhone(nextDial, nextNational));
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        Phone {required ? <span className="text-destructive">*</span> : null}
      </Label>
      <div className="grid grid-cols-[minmax(7.5rem,9rem)_1fr] gap-2">
        <Select
          value={countries.some((c) => c.code === phoneCountry) ? phoneCountry : undefined}
          onValueChange={(code) => {
            setPhoneCountry(code);
            emit(code, national);
          }}
          disabled={disabled || countries.length === 0}
        >
          <SelectTrigger aria-label="Country calling code">
            <SelectValue placeholder="Code" />
          </SelectTrigger>
          <SelectContent>
            {countries.map((country) => (
              <SelectItem key={country.code} value={country.code}>
                +{country.dialCode} {country.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          required={required}
          disabled={disabled}
          value={national}
          onChange={(e) => {
            const nextNational = e.target.value.replace(/[^\d\s-]/g, "");
            setNational(nextNational);
            emit(phoneCountry, nextNational);
          }}
          placeholder="98765 43210"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Country code + national number. Saved as {dial ? `+${dial}` : "+…"}…
      </p>
    </div>
  );
}
