import { sanitiseSearchQuery } from "./src/lib/searchUtils.ts";
import { calculateCompletenessScore } from "./src/lib/completenessUtils.ts";

const searchCases = [
  ["postgresql docker", sanitiseSearchQuery("postgresql docker")],
  ["xss", sanitiseSearchQuery("<script>alert</script>")],
  ["single", sanitiseSearchQuery("a")],
  ["empty", sanitiseSearchQuery("")],
];

console.log("searchUtils:");
for (const [label, value] of searchCases) {
  console.log(`  ${label}:`, value);
}

const full = calculateCompletenessScore(
  {
    bio: "I am a senior React developer with 8 years of experience building complex applications.",
    skills: ["React", "TypeScript", "Node.js"],
    hourlyRate: "85",
    fieldOfWork: "Software Development",
    isAvailable: true,
  },
  "https://example.com/photo.jpg",
);
const empty = calculateCompletenessScore({});

console.log("completenessUtils:");
console.log("  full:", full);
console.log("  empty:", empty);
