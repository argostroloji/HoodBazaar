// Production launcher: runs the API and the Telegram bot in one Railway
// service. If either process dies, exit so the platform restarts both.
import { spawn } from "node:child_process";

// Bot reaches the API inside the same container unless API_URL is set
const apiUrl =
  process.env.API_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8787}`;

const procs = [
  ["api", "apps/api/dist/server.js"],
  ["bot", "apps/bot/dist/index.js"],
].map(([name, entry]) => {
  const p = spawn(process.execPath, [entry], {
    stdio: "inherit",
    env: { ...process.env, API_URL: apiUrl },
  });
  p.on("exit", (code) => {
    console.error(`[start-all] ${name} exited with ${code} — shutting down`);
    process.exit(code ?? 1);
  });
  return p;
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    for (const p of procs) p.kill();
    process.exit(0);
  });
}
