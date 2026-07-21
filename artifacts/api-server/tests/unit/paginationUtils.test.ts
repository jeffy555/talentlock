import { describe, expect, it } from "vitest";
import { paginatedResponse, parsePagination } from "../../src/lib/paginationUtils";

describe("parsePagination", () => {
  it("defaults to page 1 and pageSize 20", () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20, offset: 0 });
  });

  it("caps pageSize at 100", () => {
    expect(parsePagination({ pageSize: 500 }).pageSize).toBe(100);
  });

  it("floors page at 1", () => {
    expect(parsePagination({ page: 0 }).page).toBe(1);
  });
});

describe("paginatedResponse", () => {
  it("computes totalPages", () => {
    const res = paginatedResponse([1, 2], 45, 2, 20);
    expect(res).toEqual({
      data: [1, 2],
      total: 45,
      page: 2,
      pageSize: 20,
      totalPages: 3,
    });
  });

  it("minimum totalPages is 1 when empty", () => {
    expect(paginatedResponse([], 0, 1, 20).totalPages).toBe(1);
  });
});
