import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Loader2 } from "lucide-react";
import type { Country } from "@workspace/api-client-react";
import { CountryStateFields, isLocationComplete } from "./CountryStateFields";

export interface LocationStepProps {
  role: "freelancer" | "employer";
  countries: Country[];
  countryCode: string;
  stateCode: string | null;
  onCountryChange: (code: string) => void;
  onStateChange: (code: string) => void;
  onContinue: () => void;
  onBack: () => void;
  isSubmitting?: boolean;
}

export function LocationStep({
  role,
  countries,
  countryCode,
  stateCode,
  onCountryChange,
  onStateChange,
  onContinue,
  onBack,
  isSubmitting,
}: LocationStepProps) {
  const canContinue = isLocationComplete(countries, countryCode, stateCode);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Where are you based?
        </CardTitle>
        <CardDescription>
          {role === "freelancer"
            ? "Select your country and state so employers know where you work from."
            : "Select your country and state for your company profile."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CountryStateFields
          countries={countries}
          countryCode={countryCode}
          stateCode={stateCode}
          onCountryChange={onCountryChange}
          onStateChange={onStateChange}
          disabled={countries.length === 0 || isSubmitting}
        />
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button type="button" onClick={onContinue} disabled={!canContinue || countries.length === 0 || isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Continue →"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
