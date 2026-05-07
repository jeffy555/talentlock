import { useParams } from "wouter";
import { useGetPublicFreelancerProfile } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BadgeCheck, Briefcase, Building2, DollarSign, ExternalLink, GraduationCap, Globe, Lock, Star, Award, Calendar } from "lucide-react";
import { format } from "date-fns";

function StarDisplay({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < Math.round(rating) ? "text-gold fill-gold" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function TimelineDot({ isFirst }: { isFirst?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="h-3 w-3 rounded-full border-2 flex-shrink-0 mt-1"
        style={{ borderColor: "#c9a84c", backgroundColor: isFirst ? "#c9a84c" : "transparent" }}
      />
    </div>
  );
}

export default function PublicProfile() {
  const { id } = useParams<{ id: string }>();
  const { data: profile, isLoading } = useGetPublicFreelancerProfile(parseInt(id!), {
    query: { enabled: !!id },
  } as any);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-16 space-y-8 animate-pulse">
          <div className="h-12 w-1/2 bg-muted rounded"></div>
          <div className="h-6 w-1/3 bg-muted rounded"></div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
              <div className="h-48 bg-muted rounded-xl"></div>
            </div>
            <div className="h-48 bg-muted rounded-xl"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-serif font-bold text-foreground">Profile Not Found</h2>
          <p className="text-muted-foreground">This freelancer's public profile does not exist.</p>
        </div>
      </div>
    );
  }

  const ra = (profile as any).resumeAnalysis as {
    workExperience: { company: string; role: string; startDate: string; endDate: string; highlights: string[] }[];
    education: { institution: string; degree: string; year: string }[];
    certifications: string[];
    languages: string[];
  } | null | undefined;

  const hasWorkExp = ra?.workExperience && ra.workExperience.length > 0;
  const hasEducation = ra?.education && ra.education.length > 0;
  const hasCerts = ra?.certifications && ra.certifications.length > 0;
  const hasLanguages = ra?.languages && ra.languages.length > 0;
  const hasResumeData = hasWorkExp || hasEducation || hasCerts || hasLanguages;

  return (
    <div className="min-h-screen bg-background">
      {/* Header bar */}
      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
              <svg className="h-4 w-4 text-gold" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
              </svg>
            </div>
            <span className="font-serif font-bold text-foreground text-sm">TalentLock</span>
          </div>
          <a href="/sign-in" className="text-sm font-medium text-primary hover:underline">
            Sign in to book →
          </a>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-12 space-y-10 animate-fade-in">
        {/* Hero */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground">{profile.name}</h1>
                {profile.isVerified && (
                  <div className="bg-primary/5 border border-primary/10 text-primary px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                    <BadgeCheck className="w-3.5 h-3.5" /> Verified
                  </div>
                )}
              </div>
              <p className="text-lg font-medium text-primary">{profile.tagline}</p>
            </div>
            <div className="flex-shrink-0">
              {profile.isAvailable ? (
                <div className="inline-flex items-center bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest">
                  <BadgeCheck className="w-3.5 h-3.5 mr-2" /> Available
                </div>
              ) : (
                <div className="inline-flex items-center bg-destructive/10 border border-destructive/20 text-destructive px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest">
                  <Lock className="w-3.5 h-3.5 mr-2" /> Currently Booked
                </div>
              )}
            </div>
          </div>

          {profile.averageRating && (
            <div className="flex items-center gap-3">
              <StarDisplay rating={profile.averageRating} />
              <span className="font-semibold text-foreground">{profile.averageRating.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">({profile.totalReviews} review{profile.totalReviews !== 1 ? "s" : ""})</span>
            </div>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-3 py-4 border-y border-border/50 text-sm">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              {profile.fieldOfWork}
            </div>
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Star className="h-4 w-4 text-muted-foreground" />
              {profile.yearsExperience} Years Experience
            </div>
            <div className="flex items-center gap-2 text-foreground font-medium">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              {profile.paymentPreference === "hourly" && profile.hourlyRate && `$${profile.hourlyRate}/hr`}
              {profile.paymentPreference === "daily" && profile.dailyRate && `$${profile.dailyRate}/day`}
              {profile.paymentPreference === "fixed" && "Fixed Rate"}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-10">
          <div className="md:col-span-2 space-y-10">

            {profile.bio && (
              <section className="space-y-3">
                <h2 className="font-serif text-2xl font-semibold text-foreground">About</h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
              </section>
            )}

            {/* ── Work Experience (from resume AI scan) ── */}
            {hasWorkExp && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h2 className="font-serif text-2xl font-semibold text-foreground">Work Experience</h2>
                </div>
                <div className="relative pl-6 space-y-8">
                  {/* Vertical timeline line */}
                  <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
                  {ra!.workExperience.map((job, i) => (
                    <div key={i} className="relative flex gap-4">
                      <TimelineDot isFirst={i === 0} />
                      <div className="flex-1 pb-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                          <h3 className="font-semibold text-foreground text-base">{job.role}</h3>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
                            <Calendar className="h-3 w-3" />
                            <span>{job.startDate} – {job.endDate}</span>
                          </div>
                        </div>
                        <p className="text-sm font-medium text-primary mb-2">{job.company}</p>
                        {job.highlights.length > 0 && (
                          <ul className="space-y-1">
                            {job.highlights.map((h, j) => (
                              <li key={j} className="flex gap-2 text-sm text-muted-foreground">
                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/50 flex-shrink-0" />
                                <span>{h}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Education ── */}
            {hasEducation && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-primary" />
                  <h2 className="font-serif text-2xl font-semibold text-foreground">Education</h2>
                </div>
                <div className="space-y-3">
                  {ra!.education.map((edu, i) => (
                    <div key={i} className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border bg-card">
                      <div>
                        <p className="font-semibold text-foreground">{edu.degree}</p>
                        <p className="text-sm text-primary mt-0.5">{edu.institution}</p>
                      </div>
                      {edu.year && (
                        <span className="text-xs text-muted-foreground bg-secondary/50 px-2.5 py-1 rounded-full flex-shrink-0">{edu.year}</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Certifications & Languages row ── */}
            {(hasCerts || hasLanguages) && (
              <div className="grid sm:grid-cols-2 gap-6">
                {hasCerts && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-primary" />
                      <h2 className="font-serif text-xl font-semibold text-foreground">Certifications</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ra!.certifications.map((cert, i) => (
                        <Badge key={i} className="text-xs font-medium" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.3)" }}>
                          {cert}
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}
                {hasLanguages && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-5 w-5 text-primary" />
                      <h2 className="font-serif text-xl font-semibold text-foreground">Languages</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ra!.languages.map((lang, i) => (
                        <Badge key={i} variant="secondary" className="text-xs font-medium">{lang}</Badge>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            <section className="space-y-3">
              <h2 className="font-serif text-2xl font-semibold text-foreground">Skills</h2>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill, i) => (
                  <Badge key={i} variant="secondary" className="px-3 py-1 bg-secondary/50 font-medium border-border/50 text-sm">
                    {skill}
                  </Badge>
                ))}
              </div>
            </section>

            {profile.availabilityNote && (
              <section className="rounded-xl border border-border bg-card p-5 space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Availability Note</p>
                <p className="text-sm text-foreground">{profile.availabilityNote}</p>
                {profile.availableFrom && (
                  <p className="text-xs text-muted-foreground">Available from: {format(new Date(profile.availableFrom), "MMM d, yyyy")}</p>
                )}
              </section>
            )}

            {profile.portfolio.length > 0 && (
              <section className="space-y-4">
                <h2 className="font-serif text-2xl font-semibold text-foreground">Portfolio</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {profile.portfolio.map((item) => (
                    <Card key={item.id} className="border-border shadow-sm hover:shadow-md transition-shadow">
                      {item.imageUrl && (
                        <div className="aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
                          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-foreground leading-tight">{item.title}</h3>
                          {item.url && (
                            <a href={item.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary flex-shrink-0">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                        {item.description && <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>}
                        {item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.tags.map((t, i) => <Badge key={i} variant="outline" className="text-xs px-2 py-0">{t}</Badge>)}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {profile.reviews.length > 0 && (
              <section className="space-y-4">
                <h2 className="font-serif text-2xl font-semibold text-foreground">Reviews</h2>
                <div className="space-y-4">
                  {profile.reviews.map((review) => (
                    <Card key={review.id} className="border-border shadow-sm bg-card">
                      <CardContent className="p-5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <StarDisplay rating={review.rating} />
                          <span className="text-xs text-muted-foreground">{format(new Date(review.createdAt), "MMM d, yyyy")}</span>
                        </div>
                        {review.title && <p className="font-semibold text-foreground">{review.title}</p>}
                        {review.content && <p className="text-sm text-muted-foreground leading-relaxed">{review.content}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar CTA */}
          <div className="space-y-6">
            <Card className="shadow-lg border-primary/20 overflow-hidden sticky top-8">
              <div className="h-1.5 w-full bg-gold"></div>
              <CardHeader className="pb-4 bg-primary/5">
                <CardTitle className="font-serif text-xl">Work with {profile.name.split(" ")[0]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="text-sm space-y-2">
                  {profile.hourlyRate && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Hourly rate</span>
                      <span className="font-bold text-foreground">${profile.hourlyRate}/hr</span>
                    </div>
                  )}
                  {profile.dailyRate && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Daily rate</span>
                      <span className="font-bold text-foreground">${profile.dailyRate}/day</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Status</span>
                    <span className={`font-bold text-sm ${profile.isAvailable ? "text-green-600" : "text-destructive"}`}>
                      {profile.isAvailable ? "Available" : "Booked"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Experience</span>
                    <span className="font-bold text-foreground">{profile.yearsExperience} yrs</span>
                  </div>
                </div>

                {hasResumeData && (
                  <div className="pt-2 border-t border-border space-y-1.5 text-xs text-muted-foreground">
                    {hasWorkExp && (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <span>{ra!.workExperience.length} position{ra!.workExperience.length > 1 ? "s" : ""} verified from resume</span>
                      </div>
                    )}
                    {hasEducation && (
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <span>{ra!.education[0].degree}, {ra!.education[0].institution}</span>
                      </div>
                    )}
                    {hasCerts && (
                      <div className="flex items-center gap-2">
                        <Award className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <span>{ra!.certifications.length} certification{ra!.certifications.length > 1 ? "s" : ""}</span>
                      </div>
                    )}
                  </div>
                )}

                <a
                  href="/sign-in"
                  className="block w-full text-center bg-primary text-primary-foreground font-semibold py-2.5 rounded-lg shadow hover:bg-primary/90 transition-colors text-sm"
                >
                  Sign in to Book
                </a>
                <p className="text-center text-xs text-muted-foreground font-light">Secure exclusive engagements on TalentLock</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
