import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { createRequire } from "node:module";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import multer from "multer";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_TALENTLOCK });

const require = createRequire(import.meta.url);
// pdf-parse v2 and mammoth are CJS-only — loaded via require to avoid ESM bundling issues
const { PDFParse } = require("pdf-parse") as { PDFParse: new (opts: { url: string }) => { getText: () => Promise<{ text: string }> } };
const _mammothMod = require("mammoth");
const mammoth = (_mammothMod.default ?? _mammothMod) as { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> };

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/plain",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, DOCX, DOC, or TXT files are accepted."));
    }
  },
});

const FIELDS_OF_WORK = [
  "Software Engineering", "Web Development", "Mobile Development",
  "Data Science & Analytics", "AI / Machine Learning", "Cybersecurity",
  "DevOps & Cloud Infrastructure", "UI/UX Design", "Game Development",
  "Blockchain & Web3", "IT Support & Systems Administration",
  "Database Administration", "Network Engineering", "Embedded Systems & IoT",
  "Graphic Design", "Video Production & Editing", "Photography & Videography",
  "Content Writing & Copywriting", "Animation & Motion Graphics",
  "Music & Audio Production", "Brand & Identity Design",
  "Social Media Management", "Illustration & Digital Art",
  "Law & Legal Services", "Accounting & Finance", "Business Consulting",
  "Project Management", "Human Resources", "Real Estate", "Architecture",
  "Financial Planning & Investment", "Tax & Audit", "Insurance & Risk Management",
  "Medicine & Healthcare", "Nursing", "Pharmacy", "Dentistry",
  "Psychology & Counselling", "Nutrition & Dietetics", "Medical Research",
  "Physiotherapy & Rehabilitation", "Public Health",
  "Teaching & Education", "Research & Academia",
  "Engineering (Civil/Mechanical/Electrical)", "Manufacturing & Quality Assurance",
  "Sales & Business Development", "Marketing & Advertising",
  "Event Planning & Management", "Translation & Interpretation",
  "Customer Support", "Virtual Assistance", "Supply Chain & Logistics", "Other",
];

async function extractText(file: Express.Multer.File): Promise<string> {
  const mime = file.mimetype;
  if (mime === "application/pdf") {
    const tmp = join(tmpdir(), `resume-${Date.now()}.pdf`);
    try {
      writeFileSync(tmp, file.buffer);
      const parser = new PDFParse({ url: `file://${tmp}` });
      const result = await parser.getText();
      return result.text;
    } finally {
      try { unlinkSync(tmp); } catch { /* ignore cleanup errors */ }
    }
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword"
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }
  // plain text
  return file.buffer.toString("utf-8");
}

router.post(
  "/freelancers/parse-resume",
  (req, res, next) => {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  },
  upload.single("resume"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded. Please attach a PDF, DOCX, or TXT resume." });
      return;
    }

    let text: string;
    try {
      text = await extractText(req.file);
    } catch (err) {
      req.log.error({ err }, "Failed to extract text from resume");
      res.status(422).json({ error: "Could not read the file. Make sure it is a valid PDF or DOCX." });
      return;
    }

    if (text.trim().length < 100) {
      res.status(422).json({
        error: "The uploaded file appears to be empty or too short to be a resume. Please upload a complete resume.",
      });
      return;
    }

    const systemPrompt = `You are an expert resume parser. Extract structured professional profile information from the resume text provided.
Return a valid JSON object with EXACTLY these fields:
{
  "isValidResume": boolean,
  "invalidReason": string | null,
  "tagline": string,
  "fieldOfWork": string,
  "skills": string[],
  "yearsExperience": number,
  "paymentPreference": "hourly" | "daily",
  "hourlyRate": number | null,
  "bio": string,
  "resumeAnalysis": {
    "workExperience": [
      {
        "company": string,
        "role": string,
        "startDate": string,
        "endDate": string,
        "highlights": string[]
      }
    ],
    "education": [
      {
        "institution": string,
        "degree": string,
        "year": string
      }
    ],
    "certifications": string[],
    "languages": string[]
  }
}

Valid fieldOfWork values (pick the single best match):
${FIELDS_OF_WORK.join(", ")}

Rules:
- If the document is NOT a professional resume/CV, set isValidResume to false.
- Skills must be concrete (e.g. "React", "Python", "Project Management") — not vague adjectives.
- workExperience: extract ALL jobs, ordered most recent first. highlights should be 2-4 key bullet points per role.
- education: extract ALL degrees/diplomas.
- certifications: list any professional certifications or courses mentioned.
- languages: list any human languages mentioned (e.g. "English", "French").
- Return ONLY the JSON object, no markdown, no explanation.`;

    let parsed: any;
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Parse this resume:\n\n${text.slice(0, 12000)}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1000,
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      parsed = JSON.parse(raw);
    } catch (err) {
      req.log.error({ err }, "OpenAI resume parse failed");
      res.status(500).json({ error: "AI parsing failed. Please try again or fill the form manually." });
      return;
    }

    if (!parsed.isValidResume) {
      res.status(422).json({
        error: parsed.invalidReason
          ? `Invalid resume: ${parsed.invalidReason}`
          : "The uploaded file does not appear to be a professional resume. Please upload a valid CV or resume.",
      });
      return;
    }

    const ra = parsed.resumeAnalysis;
    const resumeAnalysis = {
      workExperience: Array.isArray(ra?.workExperience) ? ra.workExperience : [],
      education: Array.isArray(ra?.education) ? ra.education : [],
      certifications: Array.isArray(ra?.certifications) ? ra.certifications : [],
      languages: Array.isArray(ra?.languages) ? ra.languages : [],
    };

    res.json({
      tagline: parsed.tagline ?? "",
      fieldOfWork: FIELDS_OF_WORK.includes(parsed.fieldOfWork) ? parsed.fieldOfWork : "Other",
      skills: Array.isArray(parsed.skills) ? parsed.skills.slice(0, 15) : [],
      yearsExperience: typeof parsed.yearsExperience === "number" ? Math.min(Math.max(0, Math.round(parsed.yearsExperience)), 50) : 0,
      paymentPreference: parsed.paymentPreference === "daily" ? "daily" : "hourly",
      hourlyRate: typeof parsed.hourlyRate === "number" ? parsed.hourlyRate : null,
      bio: parsed.bio ?? "",
      resumeAnalysis,
    });
  },
);

export default router;
