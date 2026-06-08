import { useState, useRef, useEffect } from "react";
import {
  useGetMe, useUpdateMyFreelancerProfile,
  useGetMyEmployerProfile, useUpsertMyEmployerProfile,
  useListMyPortfolio, useCreatePortfolioItem, useUpdatePortfolioItem, useDeletePortfolioItem,
  useGetMyFreelancerProfile, usePatchNotificationPreferences,
} from "@workspace/api-client-react";
import { CompletenessBanner } from "@/components/CompletenessBanner";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building, User, Upload, X, Loader2, ExternalLink, Plus, Pencil, Trash2, Globe, Calendar, Image, PenLine, CheckCircle2 } from "lucide-react";
import { ResumeImporter, type ParsedResume } from "@/components/ResumeImporter";
import VerificationSection from "@/components/VerificationSection";
import { AvailabilityManager } from "@/components/availability/AvailabilityManager";
import VerificationBadge from "@/components/VerificationBadge";
import StarRating from "@/components/StarRating";
import ReviewList from "@/components/ReviewList";
import DeleteAccountSection from "@/components/DeleteAccountSection";
import { resolveVerificationLevel } from "@/lib/verification";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL ?? "/";

async function requestPresignedUrl(fileName: string, contentType: string) {
  const res = await fetch(`${BASE}api/storage/uploads/request-url`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, contentType }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  return res.json() as Promise<{ uploadURL: string; objectPath: string }>;
}

interface PortfolioFormState {
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  tags: string;
}

function PortfolioSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: items, refetch } = useListMyPortfolio();
  const createItem = useCreatePortfolioItem();
  const updateItem = useUpdatePortfolioItem();
  const deleteItem = useDeletePortfolioItem();

  const emptyForm: PortfolioFormState = { title: "", description: "", url: "", imageUrl: "", tags: "" };
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<PortfolioFormState>(emptyForm);
  const [deleting, setDeleting] = useState<number | null>(null);

  const openCreate = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (item: any) => {
    setEditId(item.id);
    setForm({ title: item.title, description: item.description ?? "", url: item.url ?? "", imageUrl: item.imageUrl ?? "", tags: item.tags?.join(", ") ?? "" });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    const payload = {
      title: form.title,
      ...(form.description ? { description: form.description } : {}),
      ...(form.url ? { url: form.url } : {}),
      ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
      tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    };
    try {
      if (editId != null) {
        await updateItem.mutateAsync({ id: editId, data: payload });
        toast({ title: "Portfolio item updated" });
      } else {
        await createItem.mutateAsync({ data: payload });
        toast({ title: "Portfolio item added" });
      }
      refetch();
      setOpen(false);
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await deleteItem.mutateAsync({ id });
      toast({ title: "Item removed" });
      refetch();
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const isPending = createItem.isPending || updateItem.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Image className="h-4 w-4" />Portfolio</CardTitle>
            <CardDescription className="mt-1">Showcase your work samples and past projects.</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {items && items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item: any) => (
              <div key={item.id} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-secondary/10 hover:border-primary/20 transition-colors group">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} className="w-14 h-14 rounded-lg object-cover border border-border flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 border border-border">
                    <Image className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground truncate">{item.title}</span>
                    {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="h-3.5 w-3.5" /></a>}
                  </div>
                  {item.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>}
                  {item.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {item.tags.map((t: string, i: number) => <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">{t}</Badge>)}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item.id)} disabled={deleting === item.id}>
                    {deleting === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center border border-dashed border-border rounded-xl">
            <Image className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No portfolio items yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add projects to showcase your work to employers.</p>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="font-serif text-xl">{editId ? "Edit Portfolio Item" : "Add Portfolio Item"}</DialogTitle>
            <DialogDescription>Share a project or work sample with employers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Title *</Label>
              <Input placeholder="e.g. E-commerce Platform Redesign" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex justify-between">Description <span className="font-normal opacity-60 lowercase">optional</span></Label>
              <Textarea className="resize-none h-20" placeholder="What did you build and what was the outcome?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" />Project URL <span className="font-normal opacity-60 lowercase">opt.</span></Label>
                <Input type="url" placeholder="https://..." value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Image className="h-3 w-3" />Image URL <span className="font-normal opacity-60 lowercase">opt.</span></Label>
                <Input type="url" placeholder="https://..." value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex justify-between">Tags <span className="font-normal opacity-60 lowercase">comma-separated, optional</span></Label>
              <Input placeholder="React, TypeScript, Figma" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="border-t pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isPending || !form.title.trim()}>
              {isPending ? "Saving..." : editId ? "Update Item" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SignatureCard() {
  const { data: me, refetch } = useGetMe();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const storedPath = (me as any)?.signatureImageUrl as string | null | undefined;
  const storedSigUrl = storedPath ? `${BASE}api/storage${storedPath}` : null;

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please upload an image file (PNG or JPG)", variant: "destructive" }); return;
    }
    setUploading(true);
    try {
      const { uploadURL, objectPath } = await requestPresignedUrl(file.name, file.type);
      const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("Upload failed");
      await fetch(`${BASE}api/users/me/signature`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureImageUrl: objectPath }),
      });
      toast({ title: "Signature saved", description: "Your signature is ready to use on agreements." });
      refetch();
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await fetch(`${BASE}api/users/me/signature`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureImageUrl: null }),
      });
      toast({ title: "Signature removed" });
      refetch();
    } catch {
      toast({ title: "Failed to remove signature", variant: "destructive" });
    } finally {
      setClearing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PenLine className="h-4 w-4" />My Signature
        </CardTitle>
        <CardDescription>
          Upload your handwritten signature. It will appear on agreements you sign and can be reused across all engagements.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {storedSigUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-green-700 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5" />Signature stored
            </div>
            <div className="border rounded-xl p-4 bg-white flex items-center justify-center min-h-[100px]">
              <img src={storedSigUrl} alt="Your stored signature" className="max-h-20 max-w-full object-contain" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading || clearing}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                Replace
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClear} disabled={clearing || uploading} className="text-destructive hover:text-destructive">
                {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <X className="h-3.5 w-3.5 mr-1.5" />}
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:bg-secondary/20 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
            )}
            <p className="text-sm font-semibold text-foreground">{uploading ? "Uploading…" : "Upload Signature Image"}</p>
            <p className="text-xs text-muted-foreground mt-1">PNG or JPG · White background recommended · Max 5 MB</p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
        />
        <p className="text-xs text-muted-foreground">
          Sign on white paper, photograph or scan it, then upload. Your signature will appear on all agreements you execute on TalentLock.
        </p>
      </CardContent>
    </Card>
  );
}

export default function Profile() {
  const { user: clerkUser } = useUser();
  const { toast } = useToast();
  const { data: dbUser, refetch: refetchUser } = useGetMe();

  const isFreelancer = dbUser?.role === "freelancer";
  const isEmployer = dbUser?.role === "employer";

  const { data: freelancerProfile, refetch: refetchFreelancer } = useGetMyFreelancerProfile({ query: { enabled: isFreelancer } as any });
  const { data: employerProfile, refetch: refetchEmployer } = useGetMyEmployerProfile({ query: { enabled: isEmployer } as any });

  const updateFreelancer = useUpdateMyFreelancerProfile();
  const upsertEmployer = useUpsertMyEmployerProfile();
  const patchNotificationPrefs = usePatchNotificationPreferences();

  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(
    () => (dbUser as { emailNotificationsEnabled?: boolean } | undefined)?.emailNotificationsEnabled ?? true,
  );
  const [prefsError, setPrefsError] = useState<string | null>(null);

  const handleEmailToggle = async (checked: boolean) => {
    setEmailNotificationsEnabled(checked);
    setPrefsError(null);
    try {
      await patchNotificationPrefs.mutateAsync({ data: { emailNotificationsEnabled: checked } });
      toast({ title: "Notification preferences updated." });
      refetchUser();
    } catch {
      setEmailNotificationsEnabled(!checked);
      setPrefsError("Failed to save preferences.");
      toast({ title: "Failed to save preferences.", variant: "destructive" });
    }
  };

  const fp = freelancerProfile as typeof freelancerProfile & { availableFrom?: string | null; availabilityNote?: string | null; verificationLevel?: string };

  const [bio, setBio] = useState(freelancerProfile?.bio ?? "");
  const [tagline, setTagline] = useState(freelancerProfile?.tagline ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(freelancerProfile?.portfolioUrl ?? "");
  const [hourlyRate, setHourlyRate] = useState(String(freelancerProfile?.hourlyRate ?? ""));
  const [skills, setSkills] = useState(freelancerProfile?.skills?.join(", ") ?? "");
  const [isAvailable, setIsAvailable] = useState(freelancerProfile?.isAvailable ?? true);
  const [availableFrom, setAvailableFrom] = useState(fp?.availableFrom ? fp.availableFrom.substring(0, 10) : "");
  const [availabilityNote, setAvailabilityNote] = useState(fp?.availabilityNote ?? "");

  const [companyName, setCompanyName] = useState(employerProfile?.companyName ?? "");
  const [industry, setIndustry] = useState(employerProfile?.industry ?? "");
  const [companySize, setCompanySize] = useState(employerProfile?.companySize ?? "");
  const [description, setDescription] = useState(employerProfile?.description ?? "");
  const [website, setWebsite] = useState(employerProfile?.website ?? "");

  const handleResumeParsed = (data: ParsedResume) => {
    if (data.tagline) setTagline(data.tagline);
    if (data.bio) setBio(data.bio);
    if (data.skills?.length) setSkills(data.skills.join(", "));
    if (data.hourlyRate) setHourlyRate(String(data.hourlyRate));
  };

  const handleSaveFreelancer = async () => {
    try {
      await updateFreelancer.mutateAsync({
        data: {
          bio: bio || undefined, tagline: tagline || undefined,
          portfolioUrl: portfolioUrl || undefined,
          hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
          skills: skills ? skills.split(",").map(s => s.trim()).filter(Boolean) : undefined,
          isAvailable,
          availableFrom: availableFrom ? new Date(availableFrom).toISOString() : undefined,
          availabilityNote: availabilityNote || undefined,
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
        data: { companyName, industry, companySize: companySize || undefined, description: description || undefined, website: website || undefined, subscriptionPlan: employerProfile?.subscriptionPlan ?? "basic" },
      });
      toast({ title: "Profile updated", description: "Your company profile has been saved." });
      refetchEmployer();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const verificationLevel = freelancerProfile
    ? resolveVerificationLevel(freelancerProfile as { verificationLevel?: string; isVerified?: boolean })
    : "unverified";

  useEffect(() => {
    if (dbUser && "emailNotificationsEnabled" in dbUser) {
      setEmailNotificationsEnabled(dbUser.emailNotificationsEnabled);
    }
  }, [dbUser?.emailNotificationsEnabled]);

  const completenessScore = freelancerProfile?.completenessScore ?? 0;
  const hasAvatar = !!(dbUser?.avatarUrl || clerkUser?.imageUrl);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
          <p className="text-muted-foreground mt-1">Manage your account and professional details.</p>
        </div>
        {isFreelancer && freelancerProfile && (
          <a
            href={`/f/${freelancerProfile.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 transition-colors shrink-0"
          >
            Preview public profile
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {isFreelancer && freelancerProfile && (
        <CompletenessBanner
          score={completenessScore}
          profile={freelancerProfile}
          hasAvatar={hasAvatar}
        />
      )}

      <Card id="account">
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
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge className="capitalize">{dbUser?.role ?? "pending"}</Badge>
                {isFreelancer && freelancerProfile && (
                  <VerificationBadge level={verificationLevel} size="sm" />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between py-4">
            <div>
              <p className="text-sm font-medium text-slate-800">Email notifications</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Receive email alerts for bookings, agreements, meetings, and other platform activity.
              </p>
              {prefsError && <p className="text-xs text-destructive mt-1">{prefsError}</p>}
            </div>
            <Switch
              checked={emailNotificationsEnabled}
              onCheckedChange={handleEmailToggle}
              disabled={patchNotificationPrefs.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {isFreelancer && freelancerProfile && (
        <>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Freelancer Profile
              <VerificationBadge level={verificationLevel} size="sm" />
            </CardTitle>
            <CardDescription>Your public profile visible to employers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed border-[#c9a84c]/40 bg-[#c9a84c]/5 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Update profile from Resume</p>
                <p className="text-xs text-muted-foreground mt-0.5">AI will extract your tagline, bio, skills and rate from your CV.</p>
              </div>
              <ResumeImporter onParsed={handleResumeParsed} compact />
            </div>
            <div className="space-y-2">
              <Label>Professional Tagline</Label>
              <Input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="e.g. Senior React Developer · 8 Years Experience" />
            </div>
            <div className="space-y-2" id="bio">
              <Label>Bio</Label>
              <Textarea rows={4} value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell employers about your background and expertise..." />
            </div>
            <div className="space-y-2" id="skills">
              <Label>Skills (comma separated)</Label>
              <Input value={skills} onChange={e => setSkills(e.target.value)} placeholder="React, TypeScript, Node.js, PostgreSQL" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" id="rate">
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

        <SignatureCard />
        <VerificationSection />
        <Card id="availability">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />Availability
            </CardTitle>
            <CardDescription>
              Quick controls and calendar blocks for when you are open to new engagements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="available-toggle" className="text-sm font-medium">
                Available for work
              </Label>
              <div className="flex items-center gap-2">
                <Switch id="available-toggle" checked={isAvailable} onCheckedChange={setIsAvailable} />
                <span className="text-sm font-medium">
                  {isAvailable ? <span className="text-green-700">Available</span> : <span className="text-muted-foreground">Unavailable</span>}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex justify-between">
                  Available from <span className="font-normal opacity-60 lowercase">optional</span>
                </Label>
                <Input type="date" value={availableFrom} onChange={e => setAvailableFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex justify-between">
                  Availability note <span className="font-normal opacity-60 lowercase">optional</span>
                </Label>
                <Input
                  placeholder="e.g. Available for contracts up to 3 months"
                  value={availabilityNote}
                  onChange={e => setAvailabilityNote(e.target.value)}
                />
              </div>
            </div>
            <div className="pt-4 border-t border-border/50">
              <AvailabilityManager />
            </div>
            <Button onClick={handleSaveFreelancer} disabled={updateFreelancer.isPending} variant="outline" size="sm">
              {updateFreelancer.isPending ? "Saving..." : "Save availability settings"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Reviews Received</CardTitle>
            <CardDescription>Feedback from employers on completed engagements.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <StarRating
              value={freelancerProfile.averageRating ?? null}
              count={freelancerProfile.reviewCount ?? 0}
              readonly
              size="md"
            />
            <ReviewList
              freelancerId={(freelancerProfile as { id: number }).id}
              showReplyInput
            />
          </CardContent>
        </Card>
        <PortfolioSection />
        </>
      )}

      {isEmployer && employerProfile && (
        <>
        <SignatureCard />
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
        </>
      )}

      {dbUser && <DeleteAccountSection />}
    </div>
  );
}
