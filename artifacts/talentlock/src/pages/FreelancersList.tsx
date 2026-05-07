import { useState, useMemo } from "react";
import { useListFreelancers, useGetMe, useToggleSaveFreelancer, useCheckFreelancerSaved, useListSavedFreelancers } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Search, Lock, BadgeCheck, Briefcase, Heart, SlidersHorizontal, X } from "lucide-react";
import { FIELDS_OF_WORK } from "@/lib/fields";
import { useQueryClient } from "@tanstack/react-query";

function SaveButton({ freelancerId }: { freelancerId: number }) {
  const qc = useQueryClient();
  const { data } = useCheckFreelancerSaved(freelancerId);
  const toggle = useToggleSaveFreelancer();
  const saved = data?.saved ?? false;

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await toggle.mutateAsync({ id: freelancerId });
    qc.invalidateQueries({ queryKey: ["/api/freelancers/saved"] });
    qc.invalidateQueries({ queryKey: [`/api/freelancers/${freelancerId}/saved`] });
  };

  return (
    <button
      onClick={handleToggle}
      disabled={toggle.isPending}
      className={`absolute top-4 left-4 z-10 p-1.5 rounded-full transition-all shadow-sm border ${
        saved
          ? "bg-rose-50 border-rose-200 text-rose-500 hover:bg-rose-100"
          : "bg-card border-border text-muted-foreground hover:text-rose-400 hover:border-rose-200 hover:bg-rose-50"
      }`}
      aria-label={saved ? "Remove from shortlist" : "Add to shortlist"}
    >
      <Heart className={`w-3.5 h-3.5 ${saved ? "fill-rose-500" : ""}`} />
    </button>
  );
}

export default function FreelancersList() {
  const { data: user } = useGetMe();
  const [searchTerm, setSearchTerm] = useState("");
  const [fieldFilter, setFieldFilter] = useState<string>("all");
  const [minRate, setMinRate] = useState("");
  const [maxRate, setMaxRate] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const { data: freelancers, isLoading } = useListFreelancers();
  const { data: saved } = useListSavedFreelancers();
  const savedIds = useMemo(() => new Set((saved ?? []).map((f: any) => f.id)), [saved]);

  if (user?.role !== "employer") {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center animate-fade-in">
        <div className="h-16 w-16 bg-muted rounded-2xl flex items-center justify-center mb-6">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-serif font-bold mb-2 text-foreground">Access Restricted</h2>
        <p className="text-muted-foreground font-light max-w-sm">Only verified employers can access the Talent Vault to browse and book professionals.</p>
      </div>
    );
  }

  const filteredFreelancers = (freelancers ?? []).filter(f => {
    if (searchTerm && !f.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !f.fieldOfWork.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !f.skills.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()))) return false;
    if (fieldFilter && fieldFilter !== "all" && f.fieldOfWork !== fieldFilter) return false;
    if (availableOnly && !f.isAvailable) return false;
    if (showSavedOnly && !savedIds.has(f.id)) return false;
    const rate = f.hourlyRate ?? f.dailyRate ?? 0;
    if (minRate && rate < parseFloat(minRate)) return false;
    if (maxRate && rate > parseFloat(maxRate)) return false;
    return true;
  });

  const hasActiveFilters = fieldFilter !== "all" || minRate || maxRate || availableOnly || showSavedOnly;

  const clearFilters = () => {
    setFieldFilter("all"); setMinRate(""); setMaxRate(""); setAvailableOnly(false); setShowSavedOnly(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground">Talent Vault</h1>
          <p className="text-muted-foreground mt-1 font-light max-w-xl">
            Our curated roster of elite, vetted professionals. Ready for exclusive engagements.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(saved?.length ?? 0) > 0 && (
            <button
              onClick={() => setShowSavedOnly(!showSavedOnly)}
              className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${showSavedOnly ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-card border-border text-muted-foreground hover:text-rose-500"}`}
            >
              <Heart className={`h-3.5 w-3.5 ${showSavedOnly ? "fill-rose-500 text-rose-500" : ""}`} />
              Shortlist ({saved?.length ?? 0})
            </button>
          )}
          <Button
            variant="outline"
            size="sm"
            className={`gap-2 h-9 ${hasActiveFilters ? "border-primary text-primary bg-primary/5" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters {hasActiveFilters && `(${[fieldFilter !== "all", minRate, maxRate, availableOnly].filter(Boolean).length})`}
          </Button>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, skill, field..."
              className="pl-9 h-9 bg-card border-border shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {showFilters && (
        <Card className="border-border shadow-sm bg-card animate-fade-in">
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5 min-w-[200px]">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Field of Work</Label>
                <Select value={fieldFilter} onValueChange={setFieldFilter}>
                  <SelectTrigger className="h-9 bg-background text-sm">
                    <SelectValue placeholder="All fields" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="all">All Fields</SelectItem>
                    {FIELDS_OF_WORK.map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Min Rate ($)</Label>
                <Input
                  type="number" placeholder="0" className="h-9 w-28 bg-background text-sm"
                  value={minRate} onChange={e => setMinRate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Max Rate ($)</Label>
                <Input
                  type="number" placeholder="Any" className="h-9 w-28 bg-background text-sm"
                  value={maxRate} onChange={e => setMaxRate(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Switch id="available-toggle" checked={availableOnly} onCheckedChange={setAvailableOnly} />
                <Label htmlFor="available-toggle" className="text-sm font-medium cursor-pointer">Available only</Label>
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="text-muted-foreground h-9 gap-1.5" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" /> Clear all
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{isLoading ? "Loading..." : `${filteredFreelancers.length} professional${filteredFreelancers.length !== 1 ? "s" : ""} found`}</span>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse shadow-sm border-border bg-card">
              <CardHeader className="pb-4">
                <div className="h-6 w-3/4 bg-muted rounded mb-2"></div>
                <div className="h-4 w-1/2 bg-muted rounded"></div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-4 w-1/3 bg-muted rounded"></div>
                <div className="flex gap-2"><div className="h-6 w-16 bg-muted rounded-full"></div><div className="h-6 w-20 bg-muted rounded-full"></div></div>
              </CardContent>
              <CardFooter className="pt-4 border-t border-border"><div className="h-10 w-full bg-muted rounded-md"></div></CardFooter>
            </Card>
          ))}
        </div>
      ) : !filteredFreelancers.length ? (
        <Card className="flex flex-col items-center justify-center py-24 text-center bg-card shadow-sm border-border border-dashed">
          <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mb-6">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-serif font-bold text-foreground">No professionals found</h3>
          <p className="text-muted-foreground mt-2 max-w-sm font-light">Try adjusting your search or filter criteria.</p>
          {(searchTerm || hasActiveFilters) && (
            <Button variant="outline" className="mt-6" onClick={() => { setSearchTerm(""); clearFilters(); }}>Clear All Filters</Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredFreelancers.map((freelancer, index) => (
            <Card
              key={freelancer.id}
              className={`group flex flex-col relative overflow-hidden transition-all duration-300 hover:shadow-lg border-border bg-card animate-fade-in ${!freelancer.isAvailable ? 'opacity-80 grayscale-[0.2]' : ''}`}
              style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
            >
              <SaveButton freelancerId={freelancer.id} />
              {!freelancer.isAvailable ? (
                <div className="absolute top-4 right-4 z-10 flex items-center bg-destructive/10 border border-destructive/20 text-destructive px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm shadow-sm">
                  <Lock className="w-3 h-3 mr-1.5" /> Booked
                </div>
              ) : freelancer.isVerified ? (
                <div className="absolute top-4 right-4 z-10">
                  <div className="flex items-center gap-1.5 bg-primary/5 border border-primary/10 text-primary px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm shadow-sm">
                    <BadgeCheck className="w-3.5 h-3.5" /> Verified
                  </div>
                </div>
              ) : null}
              <CardHeader className="pb-4 pt-10">
                <CardTitle className="text-xl font-serif text-foreground pr-20 leading-tight">{freelancer.name}</CardTitle>
                <CardDescription className="text-primary font-medium text-sm mt-1.5 line-clamp-1">{freelancer.tagline}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-5">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium truncate">{freelancer.fieldOfWork}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {freelancer.skills.slice(0, 4).map((skill, idx) => (
                    <Badge key={idx} variant="secondary" className="bg-secondary/50 text-secondary-foreground hover:bg-secondary font-medium px-2.5 py-0.5 rounded-md border-border/50 transition-colors">
                      {skill}
                    </Badge>
                  ))}
                  {freelancer.skills.length > 4 && (
                    <Badge variant="secondary" className="bg-secondary/50 text-muted-foreground hover:bg-secondary font-medium px-2 py-0.5 rounded-md border-border/50 transition-colors">
                      +{freelancer.skills.length - 4}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t border-border/50">
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold uppercase tracking-widest mb-1">Experience</span>
                    <span className="font-semibold text-foreground">{freelancer.yearsExperience} Years</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold uppercase tracking-widest mb-1">Rate</span>
                    <span className="font-semibold text-foreground">
                      {freelancer.paymentPreference === "hourly" && freelancer.hourlyRate && `$${freelancer.hourlyRate}/hr`}
                      {freelancer.paymentPreference === "daily" && freelancer.dailyRate && `$${freelancer.dailyRate}/day`}
                      {freelancer.paymentPreference === "fixed" && "Fixed Rate"}
                    </span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t border-border pt-4 mt-auto bg-muted/20 gap-2">
                <Button
                  asChild
                  className="flex-1 shadow-sm group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                  variant={freelancer.isAvailable ? "default" : "secondary"}
                >
                  <Link href={`/freelancers/${freelancer.id}`}>
                    {freelancer.isAvailable ? "View & Book" : "View Profile"}
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-primary">
                  <Link href={`/f/${freelancer.id}`} target="_blank">
                    <span className="text-xs">Share</span>
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
