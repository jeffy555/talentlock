import { useState } from "react";
import {
  useGetMe, useUpsertMe, useGetMyFreelancerProfile, useUpdateMyFreelancerProfile,
  useGetMyEmployerProfile, useUpsertMyEmployerProfile,
} from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BadgeCheck, Building, User, Shield } from "lucide-react";

export default function Profile() {
  const { user: clerkUser } = useUser();
  const { toast } = useToast();
  const { data: dbUser, refetch: refetchUser } = useGetMe();
  const upsertMe = useUpsertMe();

  const isFreelancer = dbUser?.role === "freelancer";
  const isEmployer = dbUser?.role === "employer";

  const { data: freelancerProfile, refetch: refetchFreelancer } = useGetMyFreelancerProfile({ query: { enabled: isFreelancer } as any });
  const { data: employerProfile, refetch: refetchEmployer } = useGetMyEmployerProfile({ query: { enabled: isEmployer } as any });

  const updateFreelancer = useUpdateMyFreelancerProfile();
  const upsertEmployer = useUpsertMyEmployerProfile();

  const [bio, setBio] = useState(freelancerProfile?.bio ?? "");
  const [tagline, setTagline] = useState(freelancerProfile?.tagline ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(freelancerProfile?.portfolioUrl ?? "");
  const [hourlyRate, setHourlyRate] = useState(String(freelancerProfile?.hourlyRate ?? ""));
  const [skills, setSkills] = useState(freelancerProfile?.skills?.join(", ") ?? "");

  const [companyName, setCompanyName] = useState(employerProfile?.companyName ?? "");
  const [industry, setIndustry] = useState(employerProfile?.industry ?? "");
  const [companySize, setCompanySize] = useState(employerProfile?.companySize ?? "");
  const [description, setDescription] = useState(employerProfile?.description ?? "");
  const [website, setWebsite] = useState(employerProfile?.website ?? "");

  const handleSaveFreelancer = async () => {
    try {
      await updateFreelancer.mutateAsync({
        data: {
          bio: bio || undefined,
          tagline: tagline || undefined,
          portfolioUrl: portfolioUrl || undefined,
          hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
          skills: skills ? skills.split(",").map(s => s.trim()).filter(Boolean) : undefined,
        },
      });
      toast({ title: "Profile updated", description: "Your freelancer profile has been saved." });
      refetchFreelancer();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const handleSaveEmployer = async () => {
    try {
      await upsertEmployer.mutateAsync({
        data: {
          companyName,
          industry,
          companySize: companySize || undefined,
          description: description || undefined,
          website: website || undefined,
          subscriptionPlan: employerProfile?.subscriptionPlan ?? "basic",
        },
      });
      toast({ title: "Profile updated", description: "Your company profile has been saved." });
      refetchEmployer();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your account and professional details.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Account</CardTitle>
          <CardDescription>Your TalentLock identity, powered by Clerk.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-md bg-secondary/30">
            {clerkUser?.imageUrl && (
              <img src={clerkUser.imageUrl} alt="Avatar" className="h-14 w-14 rounded-full border border-border" />
            )}
            <div>
              <div className="font-semibold text-lg">{dbUser?.name ?? clerkUser?.fullName}</div>
              <div className="text-sm text-muted-foreground">{clerkUser?.primaryEmailAddress?.emailAddress}</div>
              <Badge className="mt-1 capitalize">{dbUser?.role ?? "pending"}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {isFreelancer && freelancerProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />Freelancer Profile
              {freelancerProfile.isVerified && <BadgeCheck className="h-5 w-5 text-primary" />}
            </CardTitle>
            <CardDescription>Your public profile visible to employers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Professional Tagline</Label>
              <Input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="e.g. Senior React Developer · 8 Years Experience" />
            </div>
            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea rows={4} value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell employers about your background and expertise..." />
            </div>
            <div className="space-y-2">
              <Label>Skills (comma separated)</Label>
              <Input value={skills} onChange={e => setSkills(e.target.value)} placeholder="React, TypeScript, Node.js, PostgreSQL" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hourly Rate ($)</Label>
                <Input type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="150" />
              </div>
              <div className="space-y-2">
                <Label>Portfolio URL</Label>
                <Input type="url" value={portfolioUrl} onChange={e => setPortfolioUrl(e.target.value)} placeholder="https://yourportfolio.com" />
              </div>
            </div>
            <Button onClick={handleSaveFreelancer} disabled={updateFreelancer.isPending}>
              {updateFreelancer.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>
      )}

      {isEmployer && employerProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building className="h-5 w-5" />Company Profile</CardTitle>
            <CardDescription>Your organization's information shown to freelancers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Technology, Finance" />
              </div>
              <div className="space-y-2">
                <Label>Company Size</Label>
                <Select value={companySize} onValueChange={setCompanySize}>
                  <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-10">1-10 employees</SelectItem>
                    <SelectItem value="11-50">11-50 employees</SelectItem>
                    <SelectItem value="51-200">51-200 employees</SelectItem>
                    <SelectItem value="201-1000">201-1000 employees</SelectItem>
                    <SelectItem value="1000+">1000+ employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Company Description</Label>
              <Textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourcompany.com" />
            </div>
            <Button onClick={handleSaveEmployer} disabled={upsertEmployer.isPending}>
              {upsertEmployer.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
