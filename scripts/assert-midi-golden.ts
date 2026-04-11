/**
 * CI / local: re-run midi-to-chart on fixture .mid files and require output to match
 * committed golden JSON (guards importer regressions).
 *
 *   npm run assert-midi-golden
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { validateChart } from "../src/lib/chart/validate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function runMidiToChartStdout(midRelative: string): unknown {
  const script = join(root, "scripts", "midi-to-chart.ts");
  const midPath = join(root, midRelative);
  const out = execFileSync("npx", ["tsx", script, midPath], {
    encoding: "utf8",
    cwd: root,
    maxBuffer: 10 << 20,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

function loadGolden(jsonRelative: string): unknown {
  const p = join(root, jsonRelative);
  return JSON.parse(readFileSync(p, "utf8"));
}

const pairs: readonly [string, string][] = [
  ["static/fixtures/smoke.mid", "static/fixtures/golden-smoke-chart.json"],
  ["static/fixtures/tempo-ramp.mid", "static/fixtures/golden-tempo-ramp-chart.json"],
];

let failed = false;
for (const [mid, golden] of pairs) {
  let actual: unknown;
  try {
    actual = runMidiToChartStdout(mid);
  } catch (e) {
    console.error(`${mid}: failed to run importer —`, e);
    failed = true;
    continue;
  }
  if (!validateChart(actual)) {
    console.error(`${mid}: importer produced invalid chart`);
    failed = true;
    continue;
  }
  const expected = loadGolden(golden);
  if (!validateChart(expected)) {
    console.error(`${golden}: golden file is not a valid chart`);
    failed = true;
    continue;
  }
  if (!isDeepStrictEqual(actual, expected)) {
    console.error(`${mid} ≠ ${golden} (deep compare failed)`);
    console.error("actual:", JSON.stringify(actual, null, 2));
    console.error("golden:", JSON.stringify(expected, null, 2));
    failed = true;
  } else {
    console.error(`${mid}: OK (matches ${golden})`);
  }
}

if (failed) {
  process.exit(1);
}
