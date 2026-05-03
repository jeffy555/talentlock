import { Router, type IRouter } from "express";
import { createClerkClient } from "@clerk/express";

const router: IRouter = Router();

const DEMO_USERS: Record<string, string> = {
  employer: "user_3DCjDCio53BNo5NfE5Cp1rm2Vo4",
  freelancer: "user_3DCjDTWarCQhCgJy5n3EjJOck2N",
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
