import { spawn } from "node:child_process";

const windows = process.platform === "win32";
const command = windows ? "py" : "python3";
const args = windows
  ? ["-3", "scripts/release-audit.py"]
  : ["scripts/release-audit.py"];

const child = spawn(command, args, { stdio: "inherit" });
child.once("error", (error) => {
  console.error(`Could not start ${command}: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
