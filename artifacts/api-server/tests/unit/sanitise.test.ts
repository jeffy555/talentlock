import { describe, expect, it } from "vitest";
import { sanitiseRichText, sanitiseText } from "../../src/lib/sanitise";

describe("sanitiseText", () => {
  it("returns empty string for null/undefined", () => {
    expect(sanitiseText(null)).toBe("");
    expect(sanitiseText(undefined)).toBe("");
  });

  it("strips HTML tags from plain-text fields", () => {
    expect(sanitiseText("<script>alert(1)</script>Hello")).toBe("Hello");
    expect(sanitiseText("<b>bold</b> text")).toBe("bold text");
  });

  it("trims whitespace", () => {
    expect(sanitiseText("  hello  ")).toBe("hello");
  });
});

describe("sanitiseRichText", () => {
  it("allows basic formatting tags", () => {
    const input = '<b>bold</b> and <a href="https://example.com">link</a>';
    expect(sanitiseRichText(input)).toContain("<b>bold</b>");
    expect(sanitiseRichText(input)).toContain('href="https://example.com"');
  });

  it("removes script tags", () => {
    expect(sanitiseRichText("<script>x</script><i>ok</i>")).toBe("<i>ok</i>");
  });
});
