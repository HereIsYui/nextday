import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type P1SimulationConfig,
  formatP1SimulationReport,
  runP1Simulation,
} from "@nextday/config-schema";

const configPath = resolve(process.cwd(), process.argv[2] ?? "configs/p1-simulation.json");
const outputJson = process.argv.includes("--json");
const failOnCritical = process.argv.includes("--fail-on-critical");
const rawConfig = readFileSync(configPath, "utf8");
const config = JSON.parse(rawConfig) as P1SimulationConfig;
const report = runP1Simulation(config);

if (outputJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(formatP1SimulationReport(report));
}

if (failOnCritical && report.warnings.some((warning) => warning.severity === "critical")) {
  process.exitCode = 2;
}
