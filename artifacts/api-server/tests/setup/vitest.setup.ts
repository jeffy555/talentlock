import { loadTestEnv } from "./env";

loadTestEnv();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/talentlock_test";
}
