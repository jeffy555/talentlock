import { Router, type IRouter } from "express";
import { createClerkClient } from "@clerk/express";

const router: IRouter = Router();

// Defaults match seeded Neon profiles (Jefferson Immanuel / LoavesFlash).
// Override via DEMO_EMPLOYER_CLERK_ID / DEMO_FREELANCER_CLERK_ID in .env.
const DEMO_USERS: Record<string, string> = {
  employer: process.env.DEMO_EMPLOYER_CLERK_ID || "user_3DBguOY4TbwT9bxOYc9NcYU5q9a",
  freelancer: process.env.DEMO_FREELANCER_CLERK_ID || "user_3DBiBymDbIiXQnFqyk64WquLsdY",
};

router.post("/demo/sign-in-token", async (req, res) => {
  const demoEnabled =
    process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO_LOGIN === "true";
  if (!demoEnabled) {
    res.status(404).json({ error: "Not found." });
    return;
  }

  const { role } = req.body as { role?: string };

  if (!role || !DEMO_USERS[role]) {
    res.status(400).json({ error: "Invalid role. Must be 'employer' or 'freelancer'." });
    return;
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    res.status(500).json({ error: "Demo login not configured." });
    return;
  }

  try {
    const clerkClient = createClerkClient({ secretKey });
    const token = await clerkClient.signInTokens.createSignInToken({
      userId: DEMO_USERS[role],
      expiresInSeconds: 60,
    });
    res.json({ token: token.token });
  } catch (err) {
    req.log.error({ err }, "Failed to create demo sign-in token");
    res.status(500).json({ error: "Could not generate demo token." });
  }
});

export default router;
