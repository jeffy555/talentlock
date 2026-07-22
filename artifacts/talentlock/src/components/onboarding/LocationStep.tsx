import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Loader2 } from "lucide-react";
import type { Country } from "@workspace/api-client-react";
import { currencyName, currencySymbol } from "@/lib/currencyUtils";

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
  const selected = countries.find((c) => c.code === countryCode);
  const stateRequired = selected?.stateRequired ?? false;
  const canContinue =
    !!countryCode && (!stateRequired || !!stateCode);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Where are you based?
        </CardTitle>
        <CardDescription>
          {role === "freelancer"
            ? "Your location determines the currency shown on your profile and bookings."
            : "Your location sets your display currency for indicative rate conversions."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="country">Country</Label>
          <Select value={countryCode || undefined} onValueChange={onCountryChange}>
            <SelectTrigger id="country">
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {countries.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selected && selected.states.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="state">
              {stateRequired ? "State / Province" : "State / Province (optional)"}
            </Label>
            <Select
              value={stateCode ?? undefined}
              onValueChange={onStateChange}
              disabled={!countryCode}
            >
              <SelectTrigger id="state">
                <SelectValue placeholder={stateRequired ? "Select state" : "Select state (optional)"} />
              </SelectTrigger>
              <SelectContent>
                {selected.states.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selected && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <p className="font-semibold mb-1">
              {role === "freelancer" ? "Your primary currency" : "Your display currency"}
            </p>
            <p className="text-base font-medium">
              {currencySymbol(selected.currencyCode)} {currencyName(selected.currencyCode)} ({selected.currencyCode})
            </p>
            <p className="mt-2 text-blue-700/90">
              {role === "freelancer"
                ? "This is the currency your rate will be shown in across TalentLock."
                : "Freelancer rates will show in their currency with an indicative conversion for your reference."}
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button type="button" onClick={onContinue} disabled={!canContinue || isSubmitting}>
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
