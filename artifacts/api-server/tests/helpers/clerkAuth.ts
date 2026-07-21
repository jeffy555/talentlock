import { createClerkClient } from "@clerk/express";
import { loadTestEnv } from "../setup/env";

const DEMO_FREELANCER = () =>
  process.env.DEMO_FREELANCER_CLERK_ID ?? "user_3DBiBymDbIiXQnFqyk64WquLsdY";
const DEMO_EMPLOYER = () =>
  process.env.DEMO_EMPLOYER_CLERK_ID ?? "user_3DBguOY4TbwT9bxOYc9NcYU5q9a";

export async function clerkToken(clerkUserId: string): Promise<string> {
  loadTestEnv();
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY required for integration tests");
  const clerk = createClerkClient({ secretKey: secret });
  const session = await clerk.sessions.createSession({ userId: clerkUserId });
  const token = await clerk.sessions.getToken(session.id);
  return token.jwt;
}

export async function employerToken(): Promise<string> {
  return clerkToken(DEMO_EMPLOYER());
}

export async function freelancerToken(): Promise<string> {
  return clerkToken(DEMO_FREELANCER());
}

export { DEMO_EMPLOYER, DEMO_FREELANCER };
