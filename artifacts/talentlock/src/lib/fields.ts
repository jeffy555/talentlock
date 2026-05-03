export const FIELDS_OF_WORK = [
  // Technology
  "Software Engineering",
  "Web Development",
  "Mobile Development",
  "Data Science & Analytics",
  "AI / Machine Learning",
  "Cybersecurity",
  "DevOps & Cloud Infrastructure",
  "UI/UX Design",
  "Game Development",
  "Blockchain & Web3",
  "IT Support & Systems Administration",
  "Database Administration",
  "Network Engineering",
  "Embedded Systems & IoT",

  // Creative & Media
  "Graphic Design",
  "Video Production & Editing",
  "Photography & Videography",
  "Content Writing & Copywriting",
  "Animation & Motion Graphics",
  "Music & Audio Production",
  "Brand & Identity Design",
  "Social Media Management",
  "Illustration & Digital Art",

  // Professional Services
  "Law & Legal Services",
  "Accounting & Finance",
  "Business Consulting",
  "Project Management",
  "Human Resources",
  "Real Estate",
  "Architecture",
  "Financial Planning & Investment",
  "Tax & Audit",
  "Insurance & Risk Management",

  // Healthcare & Science
  "Medicine & Healthcare",
  "Nursing",
  "Pharmacy",
  "Dentistry",
  "Psychology & Counselling",
  "Nutrition & Dietetics",
  "Medical Research",
  "Physiotherapy & Rehabilitation",
  "Public Health",

  // Education & Research
  "Education & Tutoring",
  "Translation & Interpretation",
  "Research & Academia",
  "Training & Development",
  "E-Learning & Curriculum Design",

  // Trades & Construction
  "Plumbing",
  "Electrical Work",
  "HVAC & Refrigeration",
  "Construction & Carpentry",
  "Landscaping & Horticulture",
  "Automotive & Mechanics",
  "Welding & Fabrication",
  "Interior Design & Decoration",
  "Civil Engineering",
  "Structural Engineering",
  "Mechanical Engineering",

  // Marketing & Sales
  "Digital Marketing",
  "SEO & Content Strategy",
  "Public Relations",
  "Sales & Business Development",
  "Market Research & Analysis",
  "Advertising & Media Buying",

  // Logistics & Operations
  "Logistics & Supply Chain",
  "Event Planning & Management",
  "Administrative & Virtual Assistance",
  "Customer Service & Support",
  "Security & Surveillance",
  "Procurement & Purchasing",
] as const;

export type FieldOfWork = (typeof FIELDS_OF_WORK)[number];
