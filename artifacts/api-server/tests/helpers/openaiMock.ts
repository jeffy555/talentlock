/**
 * OpenAI mock helpers for Phase 4+ AI integration tests.
 * Routes instantiate `new OpenAI()` directly — live calls require OPENAI_API_KEY_TALENTLOCK.
 * Guard-only integration tests avoid OpenAI; use these mocks when adding vi.mock-based suites.
 */
import { vi } from "vitest";

export function mockOpenAICompletion(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

export function stubOpenAIModule(defaultContent = '{"score":80,"decision":"skip","reasons":{"matched":[],"concerns":[],"blockers":[]},"proposedMessage":null}') {
  vi.mock("openai", () => ({
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue(mockOpenAICompletion(defaultContent)),
        },
      };
    },
  }));
}
