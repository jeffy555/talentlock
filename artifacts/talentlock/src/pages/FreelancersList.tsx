import { useState } from "react";
import { useListFreelancers, useGetMe } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Lock, MapPin, BadgeCheck, Briefcase } from "lucide-react";

export default function FreelancersList() {
  const { data: user } = useGetMe();
  const [searchTerm, setSearchTerm] = useState("");
  
  const { data: freelancers, isLoading } = useListFreelancers();

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

  const filteredFreelancers = freelancers?.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.fieldOfWork.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.skills.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground">Talent Vault</h1>
          <p className="text-muted-foreground mt-1 font-light max-w-xl">
            Our curated roster of elite, vetted professionals. Ready for exclusive engagements.
          </p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name, skill, or field..." 
            className="pl-9 h-10 bg-card border-border shadow-sm focus-visible:ring-primary"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
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
                <div className="flex gap-2">
                  <div className="h-6 w-16 bg-muted rounded-full"></div>
                  <div className="h-6 w-20 bg-muted rounded-full"></div>
                  <div className="h-6 w-14 bg-muted rounded-full"></div>
                </div>
              </CardContent>
              <CardFooter className="pt-4 border-t border-border">
                <div className="h-10 w-full bg-muted rounded-md"></div>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : !filteredFreelancers || filteredFreelancers.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-24 text-center bg-card shadow-sm border-border border-dashed">
          <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mb-6">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-serif font-bold text-foreground">No professionals found</h3>
          <p className="text-muted-foreground mt-2 max-w-sm font-light">
            Try adjusting your search criteria to find the right talent for your engagement.
          </p>
          {searchTerm && (
            <Button variant="outline" className="mt-6" onClick={() => setSearchTerm("")}>
              Clear Search
            </Button>
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
              {!freelancer.isAvailable && (
                <div className="absolute top-4 right-4 z-10 flex items-center bg-destructive/10 border border-destructive/20 text-destructive px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm shadow-sm">
                  <Lock className="w-3 h-3 mr-1.5" /> Booked
                </div>
              )}
              {freelancer.isVerified && freelancer.isAvailable && (
                <div className="absolute top-4 right-4 z-10">
                  <div className="flex items-center gap-1.5 bg-primary/5 border border-primary/10 text-primary px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm shadow-sm">
                    <BadgeCheck className="w-3.5 h-3.5" /> Verified
                  </div>
                </div>
              )}
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-serif text-foreground pr-24 leading-tight">{freelancer.name}</CardTitle>
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
              <CardFooter className="border-t border-border pt-4 mt-auto bg-muted/20">
                <Button 
                  asChild 
                  className="w-full shadow-sm group-hover:bg-primary group-hover:text-primary-foreground transition-colors" 
                  variant={freelancer.isAvailable ? "default" : "secondary"}
                >
                  <Link href={`/freelancers/${freelancer.id}`}>
                    {freelancer.isAvailable ? "View & Book" : "View Profile"}
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
