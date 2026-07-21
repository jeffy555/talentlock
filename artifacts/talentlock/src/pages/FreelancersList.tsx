import { useState, useMemo, useEffect } from "react";
import { useDebounce } from "use-debounce";
import { format } from "date-fns";
import {
  useListFreelancers,
  useGetMe,
  useGetMySubscription,
  useGetTeam,
  useListSavedFreelancers,
  useListTeamShortlist,
  useAddTeamShortlist,
  useRemoveTeamShortlist,
  getListTeamShortlistQueryKey,
  type FreelancerProfile,
  type TeamShortlistItem,
  type WatchlistItem,
} from "@workspace/api-client-react";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Search, Lock, Briefcase, Heart, SlidersHorizontal, X, Star, Clock } from "lucide-react";
import { FIELDS_OF_WORK } from "@/lib/fields";
import { useQueryClient } from "@tanstack/react-query";
import VerificationBadge from "@/components/VerificationBadge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { resolveVerificationLevel } from "@/lib/verification";
import { DatePicker } from "@/components/ui/date-picker";
import { formatNextAvailable, nextAvailableColour, toApiDateString } from "@/lib/availabilityUtils";
import { formatRate, profileDefaultRateType } from "@/lib/rateFormatUtils";
import { EDUCATION_TYPE_LABELS } from "@/components/onboarding/TeachingDetailsSection";
import { cn } from "@/lib/utils";
import type { ProfessionCategory } from "@workspace/api-client-react";
import { GraduationCap } from "lucide-react";
import { WatchlistToggleButton } from "@/components/watchlist/WatchlistToggleButton";
import { WatchlistNotesEditor } from "@/components/watchlist/WatchlistNotesEditor";

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-sm px-3 py-1.5 rounded-full border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-secondary text-secondary-foreground border-border hover:border-primary/30",
      )}
    >
      {children}
    </button>
  );
}

type VaultView = "search" | "watchlist" | "team-shortlist";

function TeamSaveButton({
  freelancerId,
  shortlisted,
}: {
  freelancerId: number;
  shortlisted: boolean;
}) {
  const qc = useQueryClient();
  const add = useAddTeamShortlist();
  const remove = useRemoveTeamShortlist();
  const pending = add.isPending || remove.isPending;

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (shortlisted) {
      await remove.mutateAsync({ freelancerId });
    } else {
      await add.mutateAsync({ data: { freelancerId } });
    }
    qc.invalidateQueries({ queryKey: getListTeamShortlistQueryKey() });
  };

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      className={`absolute top-4 left-4 z-10 p-1.5 rounded-full transition-all shadow-sm border ${
        shortlisted
          ? "bg-rose-50 border-rose-200 text-rose-500 hover:bg-rose-100"
          : "bg-card border-border text-muted-foreground hover:text-rose-400 hover:border-rose-200 hover:bg-rose-50"
      }`}
      aria-label={shortlisted ? "Remove from team shortlist" : "Add to team shortlist"}
    >
      <Heart className={`w-3.5 h-3.5 ${shortlisted ? "fill-rose-500" : ""}`} />
    </button>
  );
}

function FreelancerCard({
  freelancer,
  index,
  useTeamShortlist,
  teamShortlisted,
  addedByLabel,
  onRemove,
  vaultHidden,
  watchlistNotes,
}: {
  freelancer: FreelancerProfile;
  index: number;
  useTeamShortlist: boolean;
  teamShortlisted?: boolean;
  addedByLabel?: string;
  onRemove?: () => void;
  vaultHidden?: boolean;
  watchlistNotes?: string | null;
}) {
  const verificationLevel = resolveVerificationLevel(freelancer as { verificationLevel?: string; isVerified?: boolean });

  return (
    <Card
      className={`group flex flex-col relative overflow-hidden transition-all duration-300 hover:shadow-lg border-border bg-card animate-fade-in ${!freelancer.isAvailable ? "opacity-80 grayscale-[0.2]" : ""}`}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
    >
      {useTeamShortlist ? (
        <TeamSaveButton freelancerId={freelancer.id} shortlisted={!!teamShortlisted} />
      ) : (
        <WatchlistToggleButton freelancerId={freelancer.id} />
      )}
      {!freelancer.isAvailable ? (
        <div className="absolute top-4 right-4 z-10 flex items-center bg-destructive/10 border border-destructive/20 text-destructive px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm shadow-sm">
          <Lock className="w-3 h-3 mr-1.5" /> Booked
        </div>
      ) : (
        <div className="absolute top-4 right-4 z-10">
          <VerificationBadge level={verificationLevel} size="sm" showTooltip />
        </div>
      )}
      <CardHeader className="pb-4 pt-10">
        <div className="flex items-center gap-2 flex-wrap pr-20">
          <CardTitle className="text-xl font-serif text-foreground leading-tight">{freelancer.name}</CardTitle>
          {freelancer.professionCategory === "education" && freelancer.educationProfessionType && (
            <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
              <GraduationCap className="h-3 w-3" />
              {EDUCATION_TYPE_LABELS[freelancer.educationProfessionType]}
            </span>
          )}
        </div>
        <CardDescription className="text-primary font-medium text-sm mt-1.5 line-clamp-1">{freelancer.tagline}</CardDescription>
        {vaultHidden && (
          <Badge variant="outline" className="text-xs text-muted-foreground w-fit mt-1.5">
            No longer in Talent Vault
          </Badge>
        )}
        {freelancer.expiringCredential && (
          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 border border-amber-200 w-fit mt-1.5">
            <Clock className="h-3 w-3" />
            Expiring Soon
          </span>
        )}
        {freelancer.averageRating != null && (freelancer.reviewCount ?? 0) > 0 && (
          <span className="inline-flex items-center gap-0.5 text-xs text-slate-600 mt-1.5">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {Number(freelancer.averageRating).toFixed(1)}
          </span>
        )}
        <span className={`text-xs font-medium mt-1.5 block ${nextAvailableColour((freelancer as { nextAvailableDate?: string | null }).nextAvailableDate)}`}>
          {formatNextAvailable((freelancer as { nextAvailableDate?: string | null }).nextAvailableDate)}
        </span>
        {addedByLabel && (
          <span className="text-xs text-muted-foreground mt-2 block">{addedByLabel}</span>
        )}
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
              {freelancer.paymentPreference === "hourly" && freelancer.hourlyRate != null
                ? formatRate(Number(freelancer.hourlyRate), profileDefaultRateType(freelancer.professionCategory))
                : null}
              {freelancer.paymentPreference === "daily" && freelancer.dailyRate != null
                ? formatRate(Number(freelancer.dailyRate), "per_day")
                : null}
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
        {onRemove ? (
          <Button variant="outline" size="sm" onClick={onRemove}>
            Remove
          </Button>
        ) : (
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-primary">
            <Link href={`/f/${freelancer.id}`} target="_blank">
              <span className="text-xs">Share</span>
            </Link>
          </Button>
        )}
      </CardFooter>
      {watchlistNotes !== undefined && (
        <WatchlistNotesEditor freelancerId={freelancer.id} initialNotes={watchlistNotes} />
      )}
    </Card>
  );
}

export default function FreelancersList() {
  const qc = useQueryClient();
  const search = useSearch();
  const { data: user } = useGetMe();
  const { data: subscription } = useGetMySubscription({ query: { enabled: !!user } as any });
  const isEnterprise = subscription?.plan?.id === "employer_enterprise";
  const { data: teamData } = useGetTeam({
    query: { enabled: !!user && isEnterprise, retry: false } as any,
  });
  const isTeamMember = isEnterprise && !!teamData;

  const initialView = ((): VaultView => {
    const params = new URLSearchParams(search);
    const view = params.get("view");
    if (view === "watchlist" && !isTeamMember) return "watchlist";
    if (view === "team-shortlist" && isTeamMember) return "team-shortlist";
    return "search";
  })();

  const [vaultView, setVaultView] = useState<VaultView>(initialView);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery] = useDebounce(searchQuery, 400);
  const [fieldFilter, setFieldFilter] = useState<string>("all");
  const [minRate, setMinRate] = useState("");
  const [maxRate, setMaxRate] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [availableFromDate, setAvailableFromDate] = useState<Date | undefined>();
  const [professionCategoryFilter, setProfessionCategoryFilter] = useState<ProfessionCategory | undefined>(undefined);
  const [teachingSubject, setTeachingSubject] = useState("");

  const listParams = {
    ...(verifiedOnly ? { verified: true } : {}),
    ...(availableFromDate ? { availableFrom: toApiDateString(availableFromDate) } : {}),
    ...(debouncedQuery ? { q: debouncedQuery } : {}),
    ...(professionCategoryFilter ? { professionCategory: professionCategoryFilter } : {}),
    ...(professionCategoryFilter === "education" && teachingSubject ? { teachingSubject } : {}),
  };
  const { data: freelancers, isLoading } = useListFreelancers(listParams, {
    query: { enabled: vaultView === "search" } as any,
  });
  const { data: saved, isLoading: watchlistLoading } = useListSavedFreelancers({
    query: { enabled: !isTeamMember } as any,
  });
  const { data: teamShortlist, isLoading: teamShortlistLoading } = useListTeamShortlist({
    query: { enabled: isTeamMember } as any,
  });
  const removeFromTeamShortlist = useRemoveTeamShortlist();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const view = params.get("view");
    if (view === "watchlist" && !isTeamMember) setVaultView("watchlist");
    else if (view === "team-shortlist" && isTeamMember) setVaultView("team-shortlist");
    else if (!view) setVaultView("search");
  }, [search, isTeamMember]);

  const teamShortlistIds = useMemo(
    () => new Set((teamShortlist ?? []).map((item) => item.freelancer.id)),
    [teamShortlist],
  );

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

  const filteredFreelancers = (freelancers ?? []).filter((f) => {
    if (fieldFilter && fieldFilter !== "all" && f.fieldOfWork !== fieldFilter) return false;
    if (availableOnly && !f.isAvailable) return false;
    const rate = f.hourlyRate ?? f.dailyRate ?? 0;
    if (minRate && rate < parseFloat(minRate)) return false;
    if (maxRate && rate > parseFloat(maxRate)) return false;
    return true;
  });

  const hasActiveFilters = fieldFilter !== "all" || minRate || maxRate || availableOnly || verifiedOnly || availableFromDate || debouncedQuery || professionCategoryFilter || teachingSubject;

  const clearFilters = () => {
    setFieldFilter("all"); setMinRate(""); setMaxRate(""); setAvailableOnly(false); setVerifiedOnly(false); setAvailableFromDate(undefined); setSearchQuery(""); setProfessionCategoryFilter(undefined); setTeachingSubject("");
  };

  const watchlistCount = saved?.length ?? 0;
  const shortlistCount = isTeamMember ? (teamShortlist?.length ?? 0) : watchlistCount;

  const formatAddedBy = (item: TeamShortlistItem) => {
    const name = item.addedByUserId === user?.id ? "you" : item.addedByName;
    return `Added by ${name} · ${format(new Date(item.addedAt), "MMM d")}`;
  };

  const handleRemoveFromTeamShortlist = async (freelancerId: number) => {
    await removeFromTeamShortlist.mutateAsync({ freelancerId });
    qc.invalidateQueries({ queryKey: getListTeamShortlistQueryKey() });
  };

  const showSearchPanel = vaultView === "search";
  const showWatchlistPanel = !isTeamMember && vaultView === "watchlist";
  const showTeamShortlistPanel = isTeamMember && vaultView === "team-shortlist";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight text-foreground">Talent Vault</h1>
          <p className="text-muted-foreground mt-2 font-light max-w-xl">
            Browse verified professionals ready for exclusive engagements.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isTeamMember ? (
            <div className="flex items-center rounded-lg border border-border overflow-hidden" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={vaultView === "search"}
                onClick={() => setVaultView("search")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${vaultView === "search" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
              >
                Search results
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={vaultView === "team-shortlist"}
                onClick={() => setVaultView("team-shortlist")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${vaultView === "team-shortlist" ? "bg-rose-50 text-rose-600 border-l border-border" : "bg-card text-muted-foreground hover:text-rose-500 border-l border-border"}`}
              >
                Team Shortlist ({shortlistCount})
              </button>
            </div>
          ) : (
            <div className="flex items-center rounded-lg border border-border overflow-hidden" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={vaultView === "search"}
                onClick={() => setVaultView("search")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${vaultView === "search" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
              >
                Search results
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={vaultView === "watchlist"}
                onClick={() => setVaultView("watchlist")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${vaultView === "watchlist" ? "bg-rose-50 text-rose-600 border-l border-border" : "bg-card text-muted-foreground hover:text-rose-500 border-l border-border"}`}
              >
                Watchlist ({watchlistCount})
              </button>
            </div>
          )}
          {showSearchPanel && (
            <Button
              variant="outline"
              size="sm"
              className={`gap-2 h-9 ${hasActiveFilters ? "border-primary text-primary bg-primary/5" : ""}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters {hasActiveFilters && `(${[fieldFilter !== "all", minRate, maxRate, availableOnly, verifiedOnly, availableFromDate].filter(Boolean).length})`}
            </Button>
          )}
        </div>
      </div>

      {showSearchPanel && (
        <>
          <div className="flex gap-2 mb-3">
            <FilterChip active={professionCategoryFilter === undefined} onClick={() => setProfessionCategoryFilter(undefined)}>
              All
            </FilterChip>
            <FilterChip active={professionCategoryFilter === "technology"} onClick={() => setProfessionCategoryFilter("technology")}>
              Technology
            </FilterChip>
            <FilterChip active={professionCategoryFilter === "education"} onClick={() => setProfessionCategoryFilter("education")}>
              Education
            </FilterChip>
          </div>
          {professionCategoryFilter === "education" && (
            <div className="mb-3">
              <Input
                placeholder="Filter by subject (e.g. Mathematics)"
                value={teachingSubject}
                onChange={(e) => setTeachingSubject(e.target.value)}
                className="max-w-xs"
              />
            </div>
          )}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search freelancers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-slate-200 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {debouncedQuery && (
            <p className="text-xs text-muted-foreground -mt-2 mb-2">
              Showing results for &ldquo;{debouncedQuery}&rdquo;{" "}
              <button type="button" className="underline hover:text-foreground" onClick={() => setSearchQuery("")}>×</button>
            </p>
          )}

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
                        {FIELDS_OF_WORK.map((f) => (
                          <SelectItem key={f} value={f}>{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Min Rate ($)</Label>
                    <Input
                      type="number" placeholder="0" className="h-9 w-28 bg-background text-sm"
                      value={minRate} onChange={(e) => setMinRate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Max Rate ($)</Label>
                    <Input
                      type="number" placeholder="Any" className="h-9 w-28 bg-background text-sm"
                      value={maxRate} onChange={(e) => setMaxRate(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <Switch id="available-toggle" checked={availableOnly} onCheckedChange={setAvailableOnly} />
                    <Label htmlFor="available-toggle" className="text-sm font-medium cursor-pointer">Available only</Label>
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <Switch id="verified-toggle" checked={verifiedOnly} onCheckedChange={setVerifiedOnly} />
                    <Label htmlFor="verified-toggle" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                      Verified only
                      <VerificationBadge level="fully_verified" size="sm" />
                    </Label>
                  </div>
                  <div className="space-y-1.5 min-w-[200px]">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Available from</Label>
                    <DatePicker
                      value={availableFromDate}
                      onChange={setAvailableFromDate}
                      placeholder="Pick a date..."
                    />
                    {availableFromDate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => setAvailableFromDate(undefined)}
                      >
                        Clear
                      </Button>
                    )}
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
            <Empty className="border border-dashed border-border bg-card py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search className="text-muted-foreground" />
                </EmptyMedia>
                <EmptyTitle className="font-serif">No talent matched</EmptyTitle>
                <EmptyDescription>
                  Try adjusting filters or keyword search. Profiles below 60% completeness stay hidden.
                </EmptyDescription>
              </EmptyHeader>
              {(searchQuery || hasActiveFilters) && (
                <EmptyContent>
                  <Button variant="outline" onClick={() => { setSearchQuery(""); clearFilters(); }}>
                    Clear All Filters
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredFreelancers.map((freelancer, index) => (
                <FreelancerCard
                  key={freelancer.id}
                  freelancer={freelancer}
                  index={index}
                  useTeamShortlist={isTeamMember}
                  teamShortlisted={teamShortlistIds.has(freelancer.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showWatchlistPanel && (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {watchlistLoading
                ? "Loading..."
                : `${watchlistCount} professional${watchlistCount !== 1 ? "s" : ""} on your watchlist`}
            </span>
          </div>

          {watchlistLoading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse shadow-sm border-border bg-card h-64" />
              ))}
            </div>
          ) : !(saved?.length) ? (
            <Card className="flex flex-col items-center justify-center py-24 text-center bg-card shadow-sm border-border border-dashed">
              <Heart className="h-10 w-10 text-muted-foreground mb-4" />
              <h3 className="text-xl font-serif font-bold text-foreground">No one on your watchlist yet</h3>
              <p className="text-muted-foreground mt-2 max-w-sm font-light">
                Save freelancers from search results to track them here and get notified when their availability or rate changes.
              </p>
              <Button variant="outline" className="mt-6" onClick={() => setVaultView("search")}>
                Browse search results
              </Button>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {(saved ?? []).map((item: WatchlistItem, index) => (
                <FreelancerCard
                  key={item.id}
                  freelancer={item.freelancer}
                  index={index}
                  useTeamShortlist={false}
                  vaultHidden={(item.freelancer.completenessScore ?? 0) < 60}
                  watchlistNotes={item.notes}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showTeamShortlistPanel && (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {teamShortlistLoading
                ? "Loading..."
                : `${teamShortlist?.length ?? 0} shortlisted professional${(teamShortlist?.length ?? 0) !== 1 ? "s" : ""}`}
            </span>
          </div>

          {teamShortlistLoading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse shadow-sm border-border bg-card h-64" />
              ))}
            </div>
          ) : !(teamShortlist?.length) ? (
            <Card className="flex flex-col items-center justify-center py-24 text-center bg-card shadow-sm border-border border-dashed">
              <Heart className="h-10 w-10 text-muted-foreground mb-4" />
              <h3 className="text-xl font-serif font-bold text-foreground">No team shortlist yet</h3>
              <p className="text-muted-foreground mt-2 max-w-sm font-light">
                Use the heart icon on search results to add freelancers to your shared team shortlist.
              </p>
              <Button variant="outline" className="mt-6" onClick={() => setVaultView("search")}>
                Browse search results
              </Button>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {(teamShortlist ?? []).map((item, index) => (
                <FreelancerCard
                  key={item.id}
                  freelancer={item.freelancer}
                  index={index}
                  useTeamShortlist
                  teamShortlisted
                  addedByLabel={formatAddedBy(item)}
                  onRemove={() => handleRemoveFromTeamShortlist(item.freelancer.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
