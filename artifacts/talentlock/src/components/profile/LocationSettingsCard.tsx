import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { useListCountries, usePatchMyLocation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { currencyName, currencySymbol } from "@/lib/currencyUtils";

interface LocationSettingsCardProps {
  countryCode: string;
  stateCode: string | null;
  currencyCode: string;
  role: "freelancer" | "employer";
  onUpdated: () => void;
}

export function LocationSettingsCard({
  countryCode: initialCountry,
  stateCode: initialState,
  currencyCode,
  role,
  onUpdated,
}: LocationSettingsCardProps) {
  const { toast } = useToast();
  const { data: countriesData } = useListCountries();
  const patchLocation = usePatchMyLocation();

  const [countryCode, setCountryCode] = useState(initialCountry);
  const [stateCode, setStateCode] = useState<string | null>(initialState);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setCountryCode(initialCountry);
    setStateCode(initialState);
  }, [initialCountry, initialState]);

  const selected = countriesData?.countries.find((c) => c.code === countryCode);
  const stateRequired = selected?.stateRequired ?? false;
  const dirty =
    countryCode !== initialCountry || (stateCode ?? null) !== (initialState ?? null);

  const handleSave = async () => {
    try {
      await patchLocation.mutateAsync({
        data: {
          countryCode,
          stateCode: stateCode ?? null,
        },
      });
      toast({ title: "Location updated", description: "Your country and display currency have been saved." });
      setConfirmOpen(false);
      onUpdated();
    } catch {
      toast({ title: "Could not update location", variant: "destructive" });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            Location &amp; Currency
          </CardTitle>
          <CardDescription>
            {role === "freelancer"
              ? "Your country sets the currency shown on your profile and bookings."
              : "Your country sets your display currency for indicative rate conversions."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Country</Label>
            <Select
              value={countryCode}
              onValueChange={(code) => {
                setCountryCode(code);
                setStateCode(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(countriesData?.countries ?? []).map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && selected.states.length > 0 && (
            <div className="space-y-2">
              <Label>{stateRequired ? "State / Province" : "State / Province (optional)"}</Label>
              <Select value={stateCode ?? undefined} onValueChange={setStateCode}>
                <SelectTrigger>
                  <SelectValue placeholder={stateRequired ? "Select state" : "Optional"} />
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

          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Current currency: {currencySymbol(currencyCode)} {currencyName(currencyCode)} ({currencyCode})
            {dirty && selected && (
              <p className="mt-1 text-blue-700">
                After save: {currencySymbol(selected.currencyCode)} {currencyName(selected.currencyCode)} ({selected.currencyCode})
              </p>
            )}
          </div>

          <Button
            type="button"
            disabled={!dirty || (stateRequired && !stateCode) || patchLocation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            Save location
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update your location?</DialogTitle>
            <DialogDescription>
              Changing your country updates your {role === "freelancer" ? "primary" : "display"} currency.
              Existing bookings keep their original currency — only new bookings and rate displays will use the new currency.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={patchLocation.isPending}>
              {patchLocation.isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
