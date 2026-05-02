import { useState } from "react";
import { useListFreelancers, useGetMe } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Star, Lock } from "lucide-react";

export default function FreelancersList() {
  const { data: user } = useGetMe();
  const [searchTerm, setSearchTerm] = useState("");
  
  const { data: freelancers, isLoading } = useListFreelancers();

  if (user?.role !== "employer") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">Only employers can browse the talent pool.</p>
      </div>
    );
  }

  const filteredFreelancers = freelancers?.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.fieldOfWork.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.skills.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Talent Vault</h1>
          <p className="text-muted-foreground mt-1">
            Browse our exclusive, vetted network of highly skilled professionals.
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name, skill, or field..." 
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-[40vh] items-center justify-center"><div className="animate-pulse flex flex-col items-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div><p className="mt-4 text-muted-foreground">Loading talent...</p></div></div>
      ) : !filteredFreelancers || filteredFreelancers.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center bg-secondary/20">
          <Search className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No professionals found</h3>
          <p className="text-muted-foreground mt-2 max-w-sm">
            Try adjusting your search criteria to find the right talent.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredFreelancers.map((freelancer) => (
            <Card key={freelancer.id} className={`flex flex-col relative overflow-hidden transition-all hover:shadow-md ${!freelancer.isAvailable ? 'opacity-80' : ''}`}>
              {!freelancer.isAvailable && (
                <div className="absolute top-4 right-4 z-10 flex items-center bg-destructive/10 text-destructive px-2 py-1 rounded-md text-xs font-semibold">
                  <Lock className="w-3 h-3 mr-1" /> Booked
                </div>
              )}
              {freelancer.isVerified && freelancer.isAvailable && (
                <div className="absolute top-4 right-4 z-10">
                  <Badge variant="default" className="bg-primary text-primary-foreground">Verified</Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-xl">{freelancer.name}</CardTitle>
                <CardDescription className="text-primary font-medium">{freelancer.tagline}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <div className="text-sm font-medium">{freelancer.fieldOfWork}</div>
                <div className="flex flex-wrap gap-2">
                  {freelancer.skills.slice(0, 4).map((skill, idx) => (
                    <Badge key={idx} variant="outline" className="bg-secondary/50 text-xs">{skill}</Badge>
                  ))}
                  {freelancer.skills.length > 4 && (
                    <Badge variant="outline" className="bg-secondary/50 text-xs">+{freelancer.skills.length - 4}</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm pt-2">
                  <div>
                    <span className="text-muted-foreground block text-xs mb-1">Experience</span>
                    <span className="font-medium">{freelancer.yearsExperience} Years</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs mb-1">Rate</span>
                    <span className="font-medium">${freelancer.hourlyRate}/hr</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t border-border pt-4 mt-auto">
                <Button asChild className="w-full" variant={freelancer.isAvailable ? "default" : "secondary"}>
                  <Link href={`/freelancers/${freelancer.id}`}>View Profile</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
