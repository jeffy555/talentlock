import type { Express } from "express";
import type TestAgent from "supertest/lib/agent";
import { loadTestEnv } from "../setup/env";

let appInstance: Express | null = null;

export async function getApp(): Promise<Express> {
  if (!appInstance) {
    loadTestEnv();
    const mod = await import("../../src/app");
    appInstance = mod.default;
  }
  return appInstance;
}

export async function getAgent(): Promise<TestAgent> {
  const app = await getApp();
  const { default: request } = await import("supertest");
  return request(app);
}
