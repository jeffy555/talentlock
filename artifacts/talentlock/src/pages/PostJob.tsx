import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useCreateJobRequirement } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Briefcase, Calendar, DollarSign, Target } from "lucide-react";
import { format } from "date-fns";
import { FIELDS_OF_WORK } from "@/lib/fields";

export default function PostJob() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createJob = useCreateJobRequirement();

  const [title, setTitle] = useState("");
  const [fieldOfWork, setFieldOfWork] = useState("");
  const [description, setDescription] = useState("");
  const [skills, setSkills] = useState("");
  const [minExperience, setMinExperience] = useState("");
  const [paymentType, setPaymentType] = useState("hourly");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!endDate) {
      toast({ title: "Validation Error", description: "Please provide an end date.", variant: "destructive" });
      return;
    }

    try {
      const job = await createJob.mutateAsync({
        data: {
          title,
          fieldOfWork,
          description,
          requiredSkills: skills.split(",").map(s => s.trim()).filter(Boolean),
          minExperience: parseInt(minExperience, 10) || 0,
          paymentType,
          budget: budget ? parseInt(budget, 10) : null,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
        }
      });

      toast({ title: "Requirement Posted", description: "Your job requirement is now live. AI matching has begun." });
      setLocation(`/jobs/${job.id}`);
    } catch (error) {
      toast({ title: "Error", description: "Could not post requirement. Please check your inputs.", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
          <Link href="/jobs"><ArrowLeft className="h-4 w-4 mr-2" />Back to Jobs</Link>
        </Button>
      </div>
      
      <div className="border-b border-border/50 pb-6">
        <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground">Post Requirement</h1>
        <p className="text-lg text-muted-foreground mt-2 font-light max-w-2xl">
          Define your exact needs. Our AI will match this profile against our vetted network to surface elite candidates.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <Card className="shadow-sm border-border bg-card overflow-hidden">
          <div className="h-1.5 w-full bg-primary"></div>
          <CardHeader className="pb-6 border-b border-border/30 bg-muted/10">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-primary/20">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="font-serif text-xl">Role Overview</CardTitle>
                <CardDescription>The core description of who you need.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-8 pt-8">
            <div className="space-y-2.5">
              <Label htmlFor="title" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Role Title</Label>
              <Input 
                id="title" 
                placeholder="e.g. Senior Smart Contract Security Auditor" 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                className="h-12 text-base bg-secondary/20 border-border focus-visible:ring-primary shadow-sm"
                required 
                autoFocus
              />
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-2.5">
                <Label htmlFor="fieldOfWork" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Domain</Label>
                <Select value={fieldOfWork} onValueChange={setFieldOfWork} required>
                  <SelectTrigger id="fieldOfWork" className="h-12 bg-secondary/20 shadow-sm border-border">
                    <SelectValue placeholder="Select primary field" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {FIELDS_OF_WORK.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="minExperience" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Min. Years Experience</Label>
                <Input 
                  id="minExperience" 
                  type="number" 
                  min="0" 
                  placeholder="e.g. 5" 
                  value={minExperience} 
                  onChange={e => setMinExperience(e.target.value)} 
                  className="h-12 bg-secondary/20 shadow-sm border-border"
                  required 
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="description" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Detailed Description</Label>
              <Textarea 
                id="description" 
                placeholder="Describe the project goals, responsibilities, and specific deliverables. Be comprehensive — our AI uses this to match candidates accurately..." 
                rows={8} 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                className="bg-secondary/20 resize-y min-h-[150px] shadow-sm border-border leading-relaxed"
                required 
              />
            </div>

            <div className="space-y-2.5 border-t border-border/50 pt-8">
              <Label htmlFor="skills" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Required Skills <span className="text-[10px] font-medium opacity-70 lowercase ml-1">(comma separated)</span></Label>
              <Input 
                id="skills" 
                placeholder="e.g. Rust, Solidity, Zero-Knowledge Proofs, System Architecture" 
                value={skills} 
                onChange={e => setSkills(e.target.value)} 
                className="h-12 bg-secondary/20 shadow-sm border-border"
                required 
              />
              <p className="text-xs text-muted-foreground mt-2 font-light">Specific skills improve AI matching accuracy significantly.</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Engagement Structure */}
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="pb-4 border-b border-border/30">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="font-serif text-lg">Compensation</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2.5">
                <Label htmlFor="paymentType" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Structure</Label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger className="h-11 bg-secondary/20 shadow-sm border-border">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly Rate</SelectItem>
                    <SelectItem value="daily">Daily Rate</SelectItem>
                    <SelectItem value="fixed">Fixed Project Fee</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="budget" className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex justify-between">
                  Budget (USD) <span className="font-normal opacity-70 lowercase">optional</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                  <Input 
                    id="budget" 
                    type="number" 
                    min="0" 
                    placeholder="e.g. 15000" 
                    value={budget} 
                    onChange={e => setBudget(e.target.value)}
                    className="h-11 pl-8 bg-secondary/20 shadow-sm border-border"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="pb-4 border-b border-border/30">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="font-serif text-lg">Timeline</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2.5">
                <Label htmlFor="startDate" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Estimated Start</Label>
                <Input 
                  id="startDate" 
                  type="date" 
                  value={startDate} 
                  onChange={e => setStartDate(e.target.value)} 
                  className="h-11 bg-secondary/20 shadow-sm border-border"
                  required 
                />
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="endDate" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Estimated End</Label>
                <Input 
                  id="endDate" 
                  type="date" 
                  value={endDate} 
                  onChange={e => setEndDate(e.target.value)} 
                  className="h-11 bg-secondary/20 shadow-sm border-border"
                  required 
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-4 pt-6 border-t border-border">
          <Button variant="outline" asChild type="button" className="h-12 px-8 font-semibold shadow-sm hover:bg-secondary">
            <Link href="/jobs">Cancel</Link>
          </Button>
          <Button type="submit" className="h-12 px-10 font-semibold shadow bg-primary text-primary-foreground hover:bg-primary/90" disabled={createJob.isPending}>
            {createJob.isPending ? "Posting Requirement..." : "Post Requirement"}
          </Button>
        </div>
      </form>
    </div>
  );
}
