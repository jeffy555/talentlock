import { useState, useRef } from "react";
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
import { BadgeCheck, Building, User, Shield, Upload, FileText, X, Loader2, ShieldCheck, ShieldX, Mail, ExternalLink, RefreshCw } from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";

interface UploadedDoc { objectPath: string; fileName: string; size: number; }
interface VerifyResult { status: string; note: string; emailSent: boolean; emailPreviewUrl?: string | null; }

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function requestPresignedUrl(fileName: string, contentType: string) {
  const res = await fetch(`${BASE}api/storage/uploads/request-url`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, contentType }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  return res.json() as Promise<{ uploadURL: string; objectPath: string }>;
}

async function uploadFileToBucket(file: File): Promise<UploadedDoc> {
  const { uploadURL, objectPath } = await requestPresignedUrl(file.name, file.type || "application/octet-stream");
  const putRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  if (!putRes.ok) throw new Error(`Upload failed for ${file.name}`);
  return { objectPath, fileName: file.name, size: file.size };
}

const FREELANCER_DOC_TYPES = [
  { key: "id", label: "Government-issued ID", hint: "Passport, national ID or driver's licence", accept: ".pdf,.jpg,.jpeg,.png" },
  { key: "edu", label: "Education Certificate", hint: "Degree, diploma or relevant certification", accept: ".pdf,.jpg,.jpeg,.png" },
  { key: "exp", label: "Work Experience / Resume", hint: "Letter of experience or résumé PDF", accept: ".pdf,.doc,.docx" },
];
const EMPLOYER_DOC_TYPES = [
  { key: "reg", label: "Company Registration", hint: "Certificate of incorporation or business registration", accept: ".pdf,.jpg,.jpeg,.png" },
  { key: "gst", label: "GST / Tax Certificate", hint: "GST, VAT or tax identification document", accept: ".pdf,.jpg,.jpeg,.png" },
  { key: "id", label: "Employer Authorization Letter", hint: "HR authorization or employer identification", accept: ".pdf,.jpg,.jpeg,.png" },
];

function VerificationPanel({ role, verificationStatus, verificationNote, documentNames, onReVerify }: {
  role: string;
  verificationStatus?: string | null;
  verificationNote?: string | null;
  documentNames?: string[] | null;
  onReVerify: (result: VerifyResult) => void;
}) {
  const { user } = useUser();
  const { toast } = useToast();
  const [docFiles, setDocFiles] = useState<Record<string, File | null>>({});
  const [uploadingKeys, setUploadingKeys] = useState<Set<string>>(new Set());
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const status = verificationStatus ?? "unverified";
  const docTypes = role === "freelancer" ? FREELANCER_DOC_TYPES : EMPLOYER_DOC_TYPES;
  const uploading = uploadingKeys.size > 0;

  const handleFileSelect = async (key: string, file: File) => {
    setDocFiles((prev) => ({ ...prev, [key]: file }));
    setUploadingKeys((prev) => new Set([...prev, key]));
    try {
      const doc = await uploadFileToBucket(file);
      setUploadedDocs((prev) => [...prev.filter((d) => d.fileName !== file.name), doc]);
      toast({ title: "File uploaded", description: `${file.name} ready for verification.` });
    } catch {
      toast({ title: "Upload failed", description: `Could not upload ${file.name}.`, variant: "destructive" });
      setDocFiles((prev) => ({ ...prev, [key]: null }));
    } finally {
      setUploadingKeys((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const handleRemoveDoc = (key: string) => {
    const file = docFiles[key];
    if (file) setUploadedDocs((prev) => prev.filter((d) => d.fileName !== file.name));
    setDocFiles((prev) => ({ ...prev, [key]: null }));
    if (fileRefs.current[key]) fileRefs.current[key]!.value = "";
  };

  const handleSubmitDocs = async () => {
    if (uploadedDocs.length === 0) {
      toast({ title: "No documents", description: "Please upload at least one document.", variant: "destructive" }); return;
    }
    setIsVerifying(true);
    try {
      const token = await user?.getIdToken?.() ?? null;
      const res = await fetch(`${BASE}api/verify/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ documentUrls: uploadedDocs.map((d) => d.objectPath), documentNames: uploadedDocs.map((d) => d.fileName) }),
      });
      if (!res.ok) throw new Error("Verification failed");
      const result: VerifyResult = await res.json();
      setVerifyResult(result);
      onReVerify(result);
      setShowUploadPanel(false);
    } catch {
      toast({ title: "Verification error", description: "Could not verify documents. Please try again.", variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  };

  const displayResult = verifyResult;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />Document Verification
          <Badge className={`ml-auto capitalize text-xs border ${
            status === "verified" ? "bg-green-100 text-green-800 border-green-200"
            : status === "rejected" ? "bg-red-100 text-red-800 border-red-200"
            : status === "pending" ? "bg-yellow-100 text-yellow-800 border-yellow-200"
            : "bg-secondary text-muted-foreground border-border"
          }`}>
            {status === "verified" ? "✓ Verified" : status === "rejected" ? "✗ Rejected" : status === "pending" ? "Under Review" : "Unverified"}
          </Badge>
        </CardTitle>
        <CardDescription>
          {status === "verified"
            ? "Your documents have been AI-reviewed and your profile is verified."
            : status === "rejected"
            ? "Verification was unsuccessful. Please re-upload corrected documents."
            : "Upload documents to get a Verified badge and priority in AI matching."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing docs summary */}
        {documentNames && documentNames.length > 0 && !showUploadPanel && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Submitted Documents</div>
            {documentNames.map((name, i) => (
              <div key={i} className="flex items-center gap-2 text-sm rounded bg-secondary/40 px-3 py-2">
                <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="truncate">{name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Reviewer note */}
        {verificationNote && !showUploadPanel && (
          <div className="rounded-lg bg-secondary/40 border p-3 text-sm">
            <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">AI Reviewer Notes</div>
            <p className="text-foreground">{verificationNote}</p>
          </div>
        )}

        {/* Post-verification result */}
        {displayResult && (
          <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${displayResult.status === "verified" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
            {displayResult.status === "verified" ? <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" /> : <ShieldX className="h-4 w-4 mt-0.5 flex-shrink-0" />}
            <div className="flex-1">
              <p className="font-semibold">{displayResult.status === "verified" ? "Documents verified!" : "Verification unsuccessful"}</p>
              <p className="mt-0.5">{displayResult.note}</p>
              {displayResult.emailSent && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="text-xs">Confirmation email sent</span>
                  {displayResult.emailPreviewUrl && (
                    <a href={displayResult.emailPreviewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline text-xs">
                      <ExternalLink className="h-3 w-3" />Preview
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upload panel */}
        {showUploadPanel && (
          <div className="space-y-3 border rounded-lg p-4">
            <div className="text-sm font-medium">Upload Documents</div>
            {docTypes.map((dt) => {
              const file = docFiles[dt.key];
              const isUploading = uploadingKeys.has(dt.key);
              return (
                <div key={dt.key} className="space-y-1">
                  <Label className="text-xs">{dt.label}</Label>
                  {file ? (
                    <div className="flex items-center gap-2 rounded border bg-secondary/40 px-3 py-2">
                      {isUploading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" /> : <FileText className="h-4 w-4 text-primary flex-shrink-0" />}
                      <span className="flex-1 text-sm truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveDoc(dt.key)} disabled={isUploading}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded border border-dashed px-3 py-2 cursor-pointer hover:bg-secondary/30 transition-colors" onClick={() => fileRefs.current[dt.key]?.click()}>
                      <Upload className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">Upload {dt.label}</span>
                      <input type="file" accept={dt.accept} className="hidden" ref={(el) => { fileRefs.current[dt.key] = el; }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(dt.key, f); }} />
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowUploadPanel(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSubmitDocs} disabled={uploading || uploadedDocs.length === 0 || isVerifying} className="gap-1.5">
                {isVerifying ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Verifying…</> : <><ShieldCheck className="h-3.5 w-3.5" />Submit for Verification</>}
              </Button>
            </div>
          </div>
        )}

        {!showUploadPanel && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { setShowUploadPanel(true); setVerifyResult(null); }}>
            <RefreshCw className="h-4 w-4" />
            {status === "unverified" ? "Upload Documents" : "Re-submit Documents"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

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

  const fp = freelancerProfile as typeof freelancerProfile & { verificationStatus?: string; verificationNote?: string; documentNames?: string[] };
  const ep = employerProfile as typeof employerProfile & { verificationStatus?: string; verificationNote?: string; documentNames?: string[] };

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
          bio: bio || undefined, tagline: tagline || undefined,
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
        data: { companyName, industry, companySize: companySize || undefined, description: description || undefined, website: website || undefined, subscriptionPlan: employerProfile?.subscriptionPlan ?? "basic" },
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
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge className="capitalize">{dbUser?.role ?? "pending"}</Badge>
                {(fp?.isVerified || ep?.isVerified) && (
                  <Badge className="bg-green-100 text-green-800 border border-green-200 flex items-center gap-1">
                    <BadgeCheck className="h-3 w-3" />Verified
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Verification panel */}
      {isFreelancer && freelancerProfile && (
        <VerificationPanel
          role="freelancer"
          verificationStatus={fp?.verificationStatus}
          verificationNote={fp?.verificationNote}
          documentNames={fp?.documentNames}
          onReVerify={() => refetchFreelancer()}
        />
      )}
      {isEmployer && employerProfile && (
        <VerificationPanel
          role="employer"
          verificationStatus={ep?.verificationStatus}
          verificationNote={ep?.verificationNote}
          documentNames={ep?.documentNames}
          onReVerify={() => refetchEmployer()}
        />
      )}

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
