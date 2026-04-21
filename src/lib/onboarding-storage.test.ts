import { beforeEach, describe, expect, it } from "vitest";
import {
  dismissOnboarding,
  getOnboardingSnapshot,
  markOnboardingStepCompleted,
  resetOnboarding,
} from "./onboarding-storage";

describe("onboarding-storage", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: globalThis,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem(key: string) {
          return store.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          store.set(key, value);
        },
        removeItem(key: string) {
          store.delete(key);
        },
        clear() {
          store.clear();
        },
      },
    });
  });

  it("marks onboarding complete after settings, library, and practice are visited", () => {
    expect(getOnboardingSnapshot().remainingSteps).toEqual(["settings", "library", "practice"]);
    markOnboardingStepCompleted("settings");
    markOnboardingStepCompleted("library");
    const final = markOnboardingStepCompleted("practice");
    expect(final.completed).toBe(true);
    expect(final.hidden).toBe(true);
    expect(final.remainingSteps).toEqual([]);
  });

  it("hides onboarding after dismissal", () => {
    const dismissed = dismissOnboarding();
    expect(dismissed.hidden).toBe(true);
    expect(dismissed.dismissedAt).not.toBeNull();
  });

  it("supports reset after a completed step", () => {
    expect(getOnboardingSnapshot().remainingSteps).toEqual(["settings", "library", "practice"]);
    markOnboardingStepCompleted("settings");
    const reset = resetOnboarding();
    expect(reset.hidden).toBe(false);
    expect(reset.completed).toBe(false);
    expect(reset.remainingSteps).toEqual(["settings", "library", "practice"]);
  });
});
