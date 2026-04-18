import { describe, expect, it } from "vitest";
import { centsFromHz, midiNoteName, midiNoteToHz, readingFromMicPitch } from "./chromatic";

describe("chromatic tuner", () => {
  it("midiNoteToHz uses A4 = 440", () => {
    expect(midiNoteToHz(69)).toBeCloseTo(440, 5);
    expect(midiNoteToHz(60)).toBeCloseTo(261.6255653, 4);
  });

  it("centsFromHz is ~0 at match", () => {
    expect(centsFromHz(440, 440)).toBeCloseTo(0, 5);
  });

  it("centsFromHz detects sharp", () => {
    expect(centsFromHz(450, 440)).toBeGreaterThan(30);
  });

  it("readingFromMicPitch", () => {
    const target = midiNoteToHz(64, 440);
    const r = readingFromMicPitch(64, target, 0.9, 440);
    expect(r.label).toBe("E4");
    expect(r.cents).toBeCloseTo(0, 1);
    expect(r.confidence).toBe(0.9);
  });

  it("midiNoteName wraps octaves", () => {
    expect(midiNoteName(60)).toBe("C4");
    expect(midiNoteName(0)).toBe("C-1");
  });
});
