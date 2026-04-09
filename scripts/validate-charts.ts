/**
 * Validate every JSON chart under static/charts/ (CI + local).
 * Run: npm run validate-charts
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateChart } from "../src/lib/chart/validate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chartsDir = join(root, "static", "charts");

const files = readdirSync(chartsDir).filter((f) => f.endsWith(".json"));
let failed = false;

for (const name of files) {
  const path = join(chartsDir, name);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`${name}: invalid JSON —`, e);
    failed = true;
    continue;
  }
  if (!validateChart(data)) {
    console.error(`${name}: failed validateChart()`);
    failed = true;
  } else {
    console.log(`${name}: OK`);
  }
}

if (failed) {
  process.exit(1);
}
if (files.length === 0) {
  console.error("No JSON files in static/charts/");
  process.exit(1);
}
