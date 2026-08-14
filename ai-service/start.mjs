import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const command = isWindows ? "powershell" : "bash";
const args = isWindows
  ? ["-ExecutionPolicy", "Bypass", "-File", "./ai-service/start.ps1"]
  : ["./ai-service/start.sh"];

const child = spawn(command, args, {
  env: process.env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Unable to start the MarkScan AI service: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`MarkScan AI service stopped by signal ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
