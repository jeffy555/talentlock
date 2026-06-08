#!/usr/bin/env node
/** Phase 3 static frontend checks from spec/ReviewRatings/validation.md */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
let fail = 0;
function ok(id, msg) { pass++; console.log(`✅ ${id} — ${msg}`); }
function bad(id, msg) { fail++; console.log(`❌ ${id} — ${msg}`); }

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function mustExist(rel) {
  if (!existsSync(join(ROOT, rel))) {
    bad("V3-files", `missing ${rel}`);
    return "";
  }
  return read(rel);
}

const starRating = mustExist("artifacts/talentlock/src/components/StarRating.tsx");
const reviewCard = mustExist("artifacts/talentlock/src/components/ReviewCard.tsx");
const reviewList = mustExist("artifacts/talentlock/src/components/ReviewList.tsx");
const reviewPrompt = mustExist("artifacts/talentlock/src/components/ReviewPrompt.tsx");
const reviewStorage = mustExist("artifacts/talentlock/src/lib/reviewPromptStorage.ts");
const bookingDetail = mustExist("artifacts/talentlock/src/pages/BookingDetail.tsx");
const freelancerDetail = mustExist("artifacts/talentlock/src/pages/FreelancerDetail.tsx");
const publicProfile = mustExist("artifacts/talentlock/src/pages/PublicProfile.tsx");
const freelancersList = mustExist("artifacts/talentlock/src/pages/FreelancersList.tsx");
const profile = mustExist("artifacts/talentlock/src/pages/Profile.tsx");
const dashboard = mustExist("artifacts/talentlock/src/pages/Dashboard.tsx");

if (starRating.includes("interactive") || starRating.includes("onChange")) ok("V3.1", "StarRating supports interactive mode");
else bad("V3.1", "StarRating missing interactive props");

if (starRating.includes("readOnly") || starRating.includes("readonly")) ok("V3.2", "StarRating supports read-only mode");
else bad("V3.2", "StarRating missing read-only mode");

if (freelancerDetail.includes("No reviews yet") || reviewList.includes("No reviews yet")) ok("V3.3", "no-reviews empty state present");
else bad("V3.3", "no-reviews empty state missing");

if (reviewPrompt.includes("Skip for now") && reviewPrompt.includes("Submit Review")) ok("V3.4", "ReviewPrompt has skip/submit actions");
else bad("V3.4", "ReviewPrompt actions missing");

if (bookingDetail.includes("ReviewPrompt") && bookingDetail.includes("ReviewCard")) ok("V3.5", "BookingDetail integrates prompt + card");
else bad("V3.5", "BookingDetail review flow missing");

if (reviewStorage.includes("sessionStorage")) ok("V3.6", "dismiss uses sessionStorage");
else bad("V3.6", "dismiss storage not sessionStorage");

if (reviewCard.includes("employerDisplayName") && !reviewCard.includes("email")) ok("V3.7", "ReviewCard shows display name not email");
else bad("V3.7", "ReviewCard employer display");

if (reviewCard.includes("Freelancer") && reviewCard.includes("reply")) ok("V3.7b", "ReviewCard reply block");
else bad("V3.7b", "ReviewCard reply block missing");

if (freelancerDetail.includes("ReviewList")) ok("V3.8", "FreelancerDetail has ReviewList");
else bad("V3.8", "FreelancerDetail ReviewList missing");

if (publicProfile.includes("ReviewList") && publicProfile.includes("StarRating")) ok("V3.9", "PublicProfile shows rating + reviews");
else bad("V3.9", "PublicProfile review section missing");

if (freelancersList.includes("reviewCount") || freelancersList.includes("averageRating") || freelancersList.includes("⭐")) ok("V3.10", "FreelancersList rating badge");
else bad("V3.10", "FreelancersList rating badge missing");

if (profile.includes("Reviews Received") && (profile.includes("useReplyToReview") || profile.includes("showReplyInput"))) ok("V3.11", "Profile reviews received + reply");
else bad("V3.11", "Profile reviews section missing");

if (dashboard.includes("Leave a review") || dashboard.includes("Write Review")) ok("V3.12", "Dashboard review prompts");
else bad("V3.12", "Dashboard review prompts missing");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
