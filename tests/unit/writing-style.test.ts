import { describe, expect, it } from "vitest";
import {
  analyzeText,
  classifyTone,
  computeComplexityScore,
  countSyllables,
} from "@/server/plugins/ports/writing-analyzer";

describe("writing style port", () => {
  it("computes readability and structural metrics", () => {
    const metrics = analyzeText(
      "This is a thoughtful paragraph about writing. It uses several complete sentences to express a clear idea. Does it stay readable while remaining detailed?",
    );

    expect(metrics.wordCount).toBeGreaterThan(10);
    expect(metrics.sentenceCount).toBeGreaterThanOrEqual(2);
    expect(metrics.readingEase).toBeGreaterThan(0);
    expect(metrics.avgSentenceLength).toBeGreaterThan(0);
  });

  it("classifies technical language when code-like signals are present", () => {
    const tone = classifyTone(
      "The API returns JSON and the TypeScript parser validates the schema. Use async functions and React components to render the result.",
      ["The", "API", "returns", "JSON", "and", "the", "TypeScript", "parser", "validates", "the", "schema"],
      14,
      5.5,
      1.8,
    );

    expect(tone).toBe("technical");
  });

  it("counts syllables with common English patterns", () => {
    expect(countSyllables("writing")).toBeGreaterThanOrEqual(2);
    expect(countSyllables("code")).toBeGreaterThanOrEqual(1);
    expect(countSyllables("beautiful")).toBeGreaterThanOrEqual(3);
  });

  it("caps the complexity score inside a 0-100 range", () => {
    const score = computeComplexityScore(12, 22, 5.4, 0.52);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
