import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useGetMe, useUpsertMe, useCreateFreelancerProfile, useUpsertMyEmployerProfile } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, Building, CheckCircle, FileText, Upload, X, Loader2, ShieldCheck, ShieldX, Mail, ExternalLink, SkipForward } from "lucide-react";
import { FIELDS_OF_WORK } from "@/lib/fields";
import { Badge } from "@/components/ui/badge";
import { ResumeImporter, type ParsedResume } from "@/components/ResumeImporter";

const BASE = import.meta.env.BASE_URL ?? "/";

function getIntendedRole(): "freelancer" | "employer" | null {
  const val = localStorage.getItem("talentlock_intended_role");
  if (val === "freelancer" || val === "employer") return val;
  return null;
}
function clearIntendedRole() {
  localStorage.removeItem("talentlock_intended_role");
}

interface UploadedDoc {
  objectPath: string;
  fileName: string;
  size: number;
}

interface VerifyResult {
  status: string;
  note: string;
  emailSent: boolean;
  emailPreviewUrl?: string | null;
}

async function requestPresignedUrl(fileName: string, contentType: string): Promise<{ uploadURL: string; objectPath: string }> {
  const res = await fetch(`${BASE}api/storage/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, contentType }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  return res.json();
}

async function uploadFileToBucket(file: File): Promise<UploadedDoc> {
  const { uploadURL, objectPath } = await requestPresignedUrl(file.name, file.type || "application/octet-stream");
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!putRes.ok) throw new Error(`Upload failed for ${file.name}`);
  return { objectPath, fileName: file.name, size: file.size };
}

async function callVerifyDocuments(docs: UploadedDoc[], token: string | null): Promise<VerifyResult> {
  const res = await fetch(`${BASE}api/verify/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      documentUrls: docs.map((d) => d.objectPath),
      documentNames: docs.map((d) => d.fileName),
    }),
  });
  if (!res.ok) throw new Error("Verification request failed");
  return res.json();
}

const FREELANCER_DOC_TYPES = [
  { key: "id", label: "Government-issued ID", hint: "Passport, national ID or driver's licence", accept: ".pdf,.jpg,.jpeg,.png" },
  { key: "edu", label: "Education Certificate", hint: "Degree, diploma or relevant certification (optional)", accept: ".pdf,.jpg,.jpeg,.png" },
  { key: "exp", label: "Work Experience / Resume", hint: "Letter of experience or résumé PDF (optional)", accept: ".pdf,.doc,.docx" },
];

const EMPLOYER_DOC_TYPES = [
  { key: "reg", label: "Company Registration", hint: "Certificate of incorporation or business registration", accept: ".pdf,.jpg,.jpeg,.png" },
  { key: "gst", label: "GST / Tax Certificate", hint: "GST, VAT or tax identification document (optional)", accept: ".pdf,.jpg,.jpeg,.png" },
  { key: "id", label: "Employer ID / Authorization Letter", hint: "HR authorization or employer identification (optional)", accept: ".pdf,.jpg,.jpeg,.png" },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();

  const { data: dbUser, isLoading: isLoadingUser, isError: isMeError } = useGetMe();
  const upsertMe = useUpsertMe();
  const createFreelancerProfile = useCreateFreelancerProfile();
  const upsertEmployerProfile = useUpsertMyEmployerProfile();

  const [step, setStep] = useState<"role" | "freelancer-details" | "employer-details" | "docs" | "verifying" | "result">("role");
  const [role, setRole] = useState<"freelancer" | "employer" | null>(null);
  const [autoCreating, setAutoCreating] = useState(false);

  // Freelancer fields
  const [tagline, setTagline] = useState("");
  const [fieldOfWork, setFieldOfWork] = useState("");
  const [skills, setSkills] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [paymentPreference, setPaymentPreference] = useState("hourly");
  const [hourlyRate, setHourlyRate] = useState("");

  const handleResumeParsed = async (data: ParsedResume) => {
    // Fill fields for display
    if (data.tagline) setTagline(data.tagline);
    if (data.fieldOfWork && FIELDS_OF_WORK.includes(data.fieldOfWork)) setFieldOfWork(data.fieldOfWork);
    if (data.skills?.length) setSkills(data.skills.join(", "));
    if (data.yearsExperience) setYearsExperience(String(data.yearsExperience));
    if (data.paymentPreference) setPaymentPreference(data.paymentPreference);
    if (data.hourlyRate) setHourlyRate(String(data.hourlyRate));

    // Auto-create the profile immediately using the parsed data directly
    if (!user) return;
    setAutoCreating(true);
    try {
      await upsertMe.mutateAsync({
        data: {
          role: "freelancer",
          email: user.primaryEmailAddress?.emailAddress || "",
          name: user.fullName || "",
          avatarUrl: user.imageUrl,
        },
      });
      await createFreelancerProfile.mutateAsync({
        data: {
          tagline: data.tagline || "",
          fieldOfWork: FIELDS_OF_WORK.includes(data.fieldOfWork) ? data.fieldOfWork : "Other",
          skills: data.skills?.slice(0, 15) ?? [],
          yearsExperience: data.yearsExperience ?? 0,
          paymentPreference: data.paymentPreference || "hourly",
          hourlyRate: data.hourlyRate ?? null,
          subscriptionPlan: "basic",
        },
      });
      toast({ title: "Profile created!", description: "Your profile was built from your resume. You can refine it anytime from your profile page." });
      setStep("docs");
    } catch {
      toast({ title: "Could not auto-create profile", description: "Your fields are filled in — review them and click Next.", variant: "destructive" });
    } finally {
      setAutoCreating(false);
    }
  };

  // Employer fields
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [description, setDescription] = useState("");

  // Document upload state
  const [docFiles, setDocFiles] = useState<Record<string, File | null>>({});
  const [uploadingKeys, setUploadingKeys] = useState<Set<string>>(new Set());
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const intended = getIntendedRole();
    if (intended) {
      setRole(intended);
      setStep(intended === "freelancer" ? "freelancer-details" : "employer-details");
      clearIntendedRole();
    }
  }, []);

  // Redirect already-onboarded users away from this page
  useEffect(() => {
    if (dbUser && dbUser.role && dbUser.role !== "pending") {
      setLocation("/dashboard");
    }
  }, [dbUser, setLocation]);

  if (isLoadingUser && !isMeError) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (dbUser && dbUser.role && dbUser.role !== "pending") {
    return null;
  }

  const handleRoleSelection = (selectedRole: "freelancer" | "employer") => {
    setRole(selectedRole);
    setStep(selectedRole === "freelancer" ? "freelancer-details" : "employer-details");
  };

  const handleFreelancerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await upsertMe.mutateAsync({
        data: {
          role: "freelancer",
          email: user.primaryEmailAddress?.emailAddress || "",
          name: user.fullName || "",
          avatarUrl: user.imageUrl,
        },
      });
      await createFreelancerProfile.mutateAsync({
        data: {
          tagline,
          fieldOfWork,
          skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
          yearsExperience: parseInt(yearsExperience, 10),
          paymentPreference,
          hourlyRate: hourlyRate ? parseInt(hourlyRate, 10) : null,
          subscriptionPlan: "basic",
        },
      });
      setStep("docs");
    } catch {
      toast({ title: "Error", description: "Could not create profile. Please try again.", variant: "destructive" });
    }
  };

  const handleEmployerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await upsertMe.mutateAsync({
        data: {
          role: "employer",
          email: user.primaryEmailAddress?.emailAddress || "",
          name: user.fullName || "",
          avatarUrl: user.imageUrl,
        },
      });
      await upsertEmployerProfile.mutateAsync({
        data: {
          companyName,
          industry,
          companySize,
          description,
          subscriptionPlan: "basic",
        },
      });
      setStep("docs");
    } catch {
      toast({ title: "Error", description: "Could not create profile. Please try again.", variant: "destructive" });
    }
  };

  const handleFileSelect = async (key: string, file: File) => {
    setDocFiles((prev) => ({ ...prev, [key]: file }));
    setUploadingKeys((prev) => new Set([...prev, key]));
    try {
      const doc = await uploadFileToBucket(file);
      setUploadedDocs((prev) => {
        const filtered = prev.filter((d) => d.fileName !== file.name);
        return [...filtered, doc];
      });
      toast({ title: "File uploaded", description: `${file.name} ready for verification.` });
    } catch {
      toast({ title: "Upload failed", description: `Could not upload ${file.name}.`, variant: "destructive" });
      setDocFiles((prev) => ({ ...prev, [key]: null }));
    } finally {
      setUploadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleRemoveDoc = (key: string) => {
    const file = docFiles[key];
    if (file) {
      setUploadedDocs((prev) => prev.filter((d) => d.fileName !== file.name));
    }
    setDocFiles((prev) => ({ ...prev, [key]: null }));
    if (fileRefs.current[key]) fileRefs.current[key]!.value = "";
  };

  const handleSubmitDocs = async () => {
    if (uploadedDocs.length === 0) {
      toast({ title: "No documents", description: "Please upload at least one document.", variant: "destructive" });
      return;
    }
    setIsVerifying(true);
    setStep("verifying");
    try {
      const token = await user?.getIdToken?.() ?? null;
      const result = await callVerifyDocuments(uploadedDocs, token);
      setVerifyResult(result);
      setStep("result");
    } catch {
      toast({ title: "Verification error", description: "Could not verify documents. Try again or skip.", variant: "destructive" });
      setStep("docs");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSkip = () => {
    toast({ title: "Profile created", description: "Welcome to TalentLock. You can upload documents anytime from your profile." });
    setLocation("/dashboard");
  };

  const docTypes = role === "freelancer" ? FREELANCER_DOC_TYPES : EMPLOYER_DOC_TYPES;
  const uploading = uploadingKeys.size > 0;

  const stepIndex = ["role", "freelancer-details", "employer-details", "docs", "verifying", "result"].indexOf(step);
  const progressStep = stepIndex <= 0 ? 1 : stepIndex <= 2 ? 2 : stepIndex <= 3 ? 3 : 4;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Complete Your Registration</h1>
        <p className="text-muted-foreground mt-2">Just a few steps to set up your TalentLock profile.</p>
      </div>

      {/* ── Account info banner ─────────────────────────────────────────── */}
      {user && step !== "verifying" && step !== "result" && (
        <div className="mb-6 rounded-lg border bg-card px-4 py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full overflow-hidden flex-shrink-0 border" style={{ borderColor: "rgba(201,168,76,0.4)" }}>
            {user.imageUrl ? (
              <img src={user.imageUrl} alt={user.fullName || ""} className="h-9 w-9 object-cover" />
            ) : (
              <div className="h-9 w-9 flex items-center justify-center bg-primary/10 text-primary font-bold text-sm">
                {(user.fullName || "?")[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{user.fullName || "Your Account"}</p>
            <p className="text-xs text-muted-foreground truncate">{user.primaryEmailAddress?.emailAddress}</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#c9a84c" }}>
            Signed in
          </span>
        </div>
      )}

      {/* ── Step indicator ──────────────────────────────────────────────── */}
      {step !== "verifying" && step !== "result" && (
        <div className="mb-8 flex items-center gap-2">
          {[
            { n: 1, label: "Account type" },
            { n: 2, label: "Profile details" },
            { n: 3, label: "Documents" },
          ].map(({ n, label }, i) => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div className="flex items-center gap-2">
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={
                    progressStep > n
                      ? { backgroundColor: "#c9a84c", color: "#0d1f3c" }
                      : progressStep === n
                      ? { backgroundColor: "#0d1f3c", color: "#c9a84c", border: "2px solid #c9a84c" }
                      : { backgroundColor: "transparent", color: "rgba(255,255,255,0.3)", border: "2px solid rgba(255,255,255,0.15)" }
                  }
                >
                  {progressStep > n ? "✓" : n}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${progressStep >= n ? "text-foreground" : "text-muted-foreground"}`}>
                  {label}
                </span>
              </div>
              {i < 2 && (
                <div className="flex-1 h-px mx-2" style={{ backgroundColor: progressStep > n ? "#c9a84c" : "rgba(255,255,255,0.1)" }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Role selection ──────────────────────────────────────────────── */}
      {step === "role" && (
        <>
          <p className="text-center text-sm text-muted-foreground mb-6">Choose your account type to continue</p>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => handleRoleSelection("freelancer")}>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                  <Briefcase className="w-8 h-8 text-primary" />
                </div>
                <CardTitle>I am a Freelancer</CardTitle>
                <CardDescription>I want to find exclusive, verified engagements.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-1 mt-2">
                  <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary shrink-0" /> Build a verified professional profile</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary shrink-0" /> Get matched to exclusive roles via AI</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary shrink-0" /> Sign binding agreements digitally</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => handleRoleSelection("employer")}>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                  <Building className="w-8 h-8 text-primary" />
                </div>
                <CardTitle>I am an Employer</CardTitle>
                <CardDescription>I want to book high-end talent for my projects.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-1 mt-2">
                  <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary shrink-0" /> AI-match talent to your requirements</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary shrink-0" /> Guarantee exclusivity with bookings</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary shrink-0" /> Auto-generate legal agreements</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ── Freelancer details ──────────────────────────────────────────── */}
      {step === "freelancer-details" && (
        <Card className="relative">
          {autoCreating && (
            <div className="absolute inset-0 z-10 rounded-lg flex flex-col items-center justify-center gap-3 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,31,60,0.85)" }}>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-base font-semibold text-foreground">Creating your profile…</p>
              <p className="text-sm text-muted-foreground">AI is building your profile from your resume</p>
            </div>
          )}
          <CardHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Freelancer Profile</CardTitle>
                <CardDescription>Upload your resume to auto-create your profile instantly.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <form onSubmit={handleFreelancerSubmit}>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-dashed border-[#c9a84c]/40 bg-[#c9a84c]/5 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">Auto-create Profile from Resume</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#c9a84c" }}>AI</span>
                </div>
                <p className="text-xs text-muted-foreground">Upload your resume and AI will instantly create your profile and move you to the next step. Or fill the fields below manually.</p>
                <ResumeImporter onParsed={handleResumeParsed} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tagline">Professional Tagline</Label>
                <Input id="tagline" placeholder="e.g. Senior Full-Stack Engineer" value={tagline} onChange={(e) => setTagline(e.target.value)} required />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fieldOfWork">Primary Field</Label>
                  <Select value={fieldOfWork} onValueChange={setFieldOfWork} required>
                    <SelectTrigger id="fieldOfWork">
                      <SelectValue placeholder="Select your primary field" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {FIELDS_OF_WORK.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="yearsExperience">Years of Experience</Label>
                  <Input id="yearsExperience" type="number" min="0" placeholder="e.g. 5" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skills">Skills (comma separated)</Label>
                <Input id="skills" placeholder="React, TypeScript, Node.js" value={skills} onChange={(e) => setSkills(e.target.value)} required />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentPreference">Payment Preference</Label>
                  <Select value={paymentPreference} onValueChange={setPaymentPreference}>
                    <SelectTrigger><SelectValue placeholder="Select preference" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly Rate</SelectItem>
                      <SelectItem value="daily">Daily Rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rate">Rate (USD)</Label>
                  <Input id="rate" type="number" min="0" placeholder="e.g. 150" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} required />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => { setStep("role"); setRole(null); }}>Back</Button>
              <Button type="submit" disabled={upsertMe.isPending || createFreelancerProfile.isPending}>
                {createFreelancerProfile.isPending ? "Saving..." : "Next: Upload Documents →"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {/* ── Employer details ────────────────────────────────────────────── */}
      {step === "employer-details" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Building className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Employer Profile</CardTitle>
                <CardDescription>Tell us about your company and hiring needs.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <form onSubmit={handleEmployerSubmit}>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input id="companyName" placeholder="Acme Inc." value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input id="industry" placeholder="Technology" value={industry} onChange={(e) => setIndustry(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="companySize">Company Size</Label>
                <Select value={companySize} onValueChange={setCompanySize}>
                  <SelectTrigger><SelectValue placeholder="Select company size" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-10">1–10 employees</SelectItem>
                    <SelectItem value="11-50">11–50 employees</SelectItem>
                    <SelectItem value="51-200">51–200 employees</SelectItem>
                    <SelectItem value="201-500">201–500 employees</SelectItem>
                    <SelectItem value="500+">500+ employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Company Description</Label>
                <Textarea id="description" placeholder="Briefly describe what your company does..." value={description} onChange={(e) => setDescription(e.target.value)} required />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => { setStep("role"); setRole(null); }}>Back</Button>
              <Button type="submit" disabled={upsertMe.isPending || upsertEmployerProfile.isPending}>
                {upsertEmployerProfile.isPending ? "Saving..." : "Next: Upload Documents →"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {/* ── Document upload ─────────────────────────────────────────────── */}
      {step === "docs" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Document Verification</CardTitle>
                <CardDescription>
                  Upload verification documents. Our AI will review them instantly and send a confirmation to your email.
                  This step is <strong>optional</strong> — you can skip and submit later from your profile.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>Verified profiles receive a <strong>Verified Badge</strong> and are prioritized in AI matching results.</span>
            </div>

            {docTypes.map((dt) => {
              const file = docFiles[dt.key];
              const isUploading = uploadingKeys.has(dt.key);
              return (
                <div key={dt.key} className="space-y-1">
                  <Label className="flex items-center gap-1.5">
                    {dt.label}
                    {dt.hint.includes("optional") && <span className="text-xs text-muted-foreground font-normal">(optional)</span>}
                  </Label>
                  <p className="text-xs text-muted-foreground">{dt.hint}</p>
                  {file ? (
                    <div className="flex items-center gap-3 rounded-lg border bg-secondary/40 px-3 py-2.5">
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{file.name}</div>
                        <div className="text-xs text-muted-foreground">{formatBytes(file.size)} · {isUploading ? "Uploading..." : "Ready"}</div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => handleRemoveDoc(dt.key)} disabled={isUploading}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-3 cursor-pointer hover:bg-secondary/30 transition-colors"
                      onClick={() => fileRefs.current[dt.key]?.click()}
                    >
                      <Upload className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">Click to upload {dt.label}</span>
                      <input
                        type="file"
                        accept={dt.accept}
                        className="hidden"
                        ref={(el) => { fileRefs.current[dt.key] = el; }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFileSelect(dt.key, f);
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
          <CardFooter className="flex justify-between gap-3">
            <Button type="button" variant="ghost" className="gap-2 text-muted-foreground" onClick={handleSkip}>
              <SkipForward className="h-4 w-4" />Skip for now
            </Button>
            <Button
              onClick={handleSubmitDocs}
              disabled={uploading || uploadedDocs.length === 0}
              className="gap-2"
            >
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin" />Uploading...</> : <><ShieldCheck className="h-4 w-4" />Submit for Verification</>}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* ── Verifying spinner ───────────────────────────────────────────── */}
      {step === "verifying" && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold">AI is reviewing your documents</h2>
              <p className="text-muted-foreground text-sm mt-1">This usually takes just a few seconds…</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Verification result ─────────────────────────────────────────── */}
      {step === "result" && verifyResult && (
        <Card>
          <CardContent className="py-10 space-y-6">
            <div className="flex flex-col items-center gap-3">
              {verifyResult.status === "verified" ? (
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <ShieldCheck className="h-9 w-9 text-green-600" />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                  <ShieldX className="h-9 w-9 text-red-600" />
                </div>
              )}
              <div className="text-center">
                <h2 className="text-xl font-bold">
                  {verifyResult.status === "verified" ? "Documents Verified!" : verifyResult.status === "pending" ? "Under Manual Review" : "Verification Unsuccessful"}
                </h2>
                <Badge className={`mt-2 capitalize ${verifyResult.status === "verified" ? "bg-green-100 text-green-800 border-green-200" : verifyResult.status === "pending" ? "bg-yellow-100 text-yellow-800 border-yellow-200" : "bg-red-100 text-red-800 border-red-200"} border`}>
                  {verifyResult.status}
                </Badge>
              </div>
            </div>

            <div className="rounded-lg bg-secondary/40 border p-4 text-sm">
              <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5">AI Reviewer Notes</div>
              <p className="text-foreground">{verifyResult.note}</p>
            </div>

            {verifyResult.emailSent && (
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold">Confirmation email sent to {user?.primaryEmailAddress?.emailAddress}</p>
                  {verifyResult.emailPreviewUrl && (
                    <a href={verifyResult.emailPreviewUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-blue-700 underline text-xs">
                      <ExternalLink className="h-3 w-3" />Preview email
                    </a>
                  )}
                </div>
              </div>
            )}

            <Button className="w-full" onClick={() => setLocation("/dashboard")}>
              Go to Dashboard →
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
