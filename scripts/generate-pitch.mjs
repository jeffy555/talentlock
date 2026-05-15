import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { writeFileSync } from 'fs';

const doc = new Document({
  styles: {
    paragraphStyles: [
      {
        id: "Normal",
        name: "Normal",
        run: { font: "Calibri", size: 24 },
      },
    ],
  },
  sections: [{
    properties: {},
    children: [
      new Paragraph({
        children: [new TextRun({ text: "TalentLock", bold: true, size: 56, font: "Calibri" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "The Platform That Ends the Freelance Trust Gap", italics: true, size: 30, font: "Calibri", color: "4F46E5" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
      }),

      new Paragraph({
        children: [new TextRun({ text: "Hiring a freelancer today means posting on a crowded marketplace, sifting through hundreds of profiles, negotiating over email, writing your own contract, hoping they don't take another project mid-way through, and chasing signatures across PDF attachments. It's broken — and everybody knows it.", font: "Calibri", size: 24 })],
        spacing: { after: 160 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "TalentLock fixes all of it in one place.", bold: true, font: "Calibri", size: 24 })],
        spacing: { after: 400 },
      }),

      new Paragraph({
        children: [new TextRun({ text: "Find the Right Person, Instantly", bold: true, size: 28, font: "Calibri", color: "1E1B4B" })],
        spacing: { before: 240, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "Employers don't browse — they describe. TalentLock's AI matching engine reads your job requirements and surfaces the freelancers most likely to succeed on your specific project. No guesswork, no keyword filtering, no wasted hours reviewing mismatched applications. Just the right talent, fast.", font: "Calibri", size: 24 })],
        spacing: { after: 320 },
      }),

      new Paragraph({
        children: [new TextRun({ text: "Lock Them In — For Real", bold: true, size: 28, font: "Calibri", color: "1E1B4B" })],
        spacing: { before: 240, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "Once you find your match, you book them exclusively. TalentLock marks that freelancer as unavailable to other employers for the duration of your engagement. No poaching. No double-booking. No last-minute dropouts because someone offered them more money. That's the lock — and it's a genuine competitive advantage for employers who need reliable, committed talent.", font: "Calibri", size: 24 })],
        spacing: { after: 320 },
      }),

      new Paragraph({
        children: [new TextRun({ text: "Legal Protection, Already Done", bold: true, size: 28, font: "Calibri", color: "1E1B4B" })],
        spacing: { before: 240, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "Every booking triggers an AI-generated legal contract — a full, professionally structured agreement covering scope of work, payment terms, IP ownership, confidentiality, non-solicitation, dispute resolution, and more. Terms dynamically scale to the length of the engagement. Both parties sign digitally within the platform. No lawyers, no back-and-forth, no risk of working on a handshake.", font: "Calibri", size: 24 })],
        spacing: { after: 320 },
      }),

      new Paragraph({
        children: [new TextRun({ text: "Freelancers Win Too", bold: true, size: 28, font: "Calibri", color: "1E1B4B" })],
        spacing: { before: 240, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "For talent, TalentLock is a career platform, not just a job board. Upload your resume and AI extracts your full work history, education, certifications, and skills — displayed beautifully on a shareable public profile. Build your portfolio, set your availability, and when an employer books you exclusively, you get the recognition that comes with it: a verified engagement badge that signals your value in the market.", font: "Calibri", size: 24 })],
        spacing: { after: 320 },
      }),

      new Paragraph({
        children: [new TextRun({ text: "Everything in One Dashboard", bold: true, size: 28, font: "Calibri", color: "1E1B4B" })],
        spacing: { before: 240, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "Both sides get a powerful command center. Employers track spend, active bookings, and milestone progress. Freelancers track earnings, agreements, and upcoming engagements. Analytics charts show performance over time. Nothing lives in a spreadsheet or an inbox — it all lives in TalentLock.", font: "Calibri", size: 24 })],
        spacing: { after: 320 },
      }),

      new Paragraph({
        children: [new TextRun({ text: "Built to Scale", bold: true, size: 28, font: "Calibri", color: "1E1B4B" })],
        spacing: { before: 240, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "Subscription plans grow with the business. Freelancers start free. Employers scale from $49 to $199/month as their hiring volume grows, with enterprise pricing for high-volume teams. The revenue model is already live, already gated, and ready to generate recurring income from day one.", font: "Calibri", size: 24 })],
        spacing: { after: 320 },
      }),

      new Paragraph({
        children: [new TextRun({ text: "The Bottom Line", bold: true, size: 28, font: "Calibri", color: "1E1B4B" })],
        spacing: { before: 240, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "TalentLock compresses what used to take weeks — sourcing, vetting, contracting, signing, managing — into a single structured workflow that protects everyone involved. It's not another job board. It's the infrastructure layer that professional freelance hiring has always needed.", font: "Calibri", size: 24 })],
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "The talent market is worth hundreds of billions of dollars. TalentLock is the platform built to own a piece of it.", bold: true, font: "Calibri", size: 24 })],
        spacing: { after: 600 },
      }),

      new Paragraph({
        children: [new TextRun({ text: "talent-lock.replit.app", bold: true, size: 24, font: "Calibri", color: "4F46E5" })],
        alignment: AlignmentType.CENTER,
      }),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync('TalentLock_Pitch.docx', buffer);
console.log('Done:', buffer.length, 'bytes written to TalentLock_Pitch.docx');
