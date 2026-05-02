import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateJobRequirement } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

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

      toast({ title: "Requirement Posted", description: "Your job requirement is now live." });
      setLocation(`/jobs/${job.id}`);
    } catch (error) {
      toast({ title: "Error", description: "Could not post requirement.", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild className="rounded-full">
          <Link href="/jobs">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Post Requirement</h1>
          <p className="text-muted-foreground mt-1">Define your needs to find the perfect match.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Role Details</CardTitle>
            <CardDescription>Be as specific as possible to attract the right talent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Role Title</Label>
              <Input id="title" placeholder="e.g. Senior Smart Contract Auditor" value={title} onChange={e => setTitle(e.target.value)} required />
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fieldOfWork">Field of Work</Label>
                <Input id="fieldOfWork" placeholder="e.g. Web3 Security" value={fieldOfWork} onChange={e => setFieldOfWork(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minExperience">Min. Years of Experience</Label>
                <Input id="minExperience" type="number" min="0" placeholder="e.g. 5" value={minExperience} onChange={e => setMinExperience(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" placeholder="Describe the responsibilities, goals, and expectations..." rows={6} value={description} onChange={e => setDescription(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="skills">Required Skills (comma separated)</Label>
              <Input id="skills" placeholder="Solidity, Rust, Security Auditing" value={skills} onChange={e => setSkills(e.target.value)} required />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paymentType">Payment Type</Label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="fixed">Fixed Project</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget">Budget (USD)</Label>
                <Input id="budget" type="number" min="0" placeholder="e.g. 10000" value={budget} onChange={e => setBudget(e.target.value)} />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Expected Start Date</Label>
                <Input id="startDate" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">Expected End Date</Label>
                <Input id="endDate" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t border-border pt-6 mt-6">
            <Button variant="outline" asChild type="button">
              <Link href="/jobs">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createJob.isPending}>
              {createJob.isPending ? "Posting..." : "Post Requirement"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
