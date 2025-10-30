#!/usr/bin/env node

/**
 * Start script for Fly.io deployment
 * Ensures the server listens on 0.0.0.0 with the correct port
 */
import { spawn } from "child_process";
import process from "process";

const port = process.env.PORT || "3000";
const host = process.env.HOST || "0.0.0.0";

const args = [
  "./build/server/index.js",
  "--host",
  host,
  "--port",
  port,
];

console.log(`Starting remix-serve on ${host}:${port}`);

const child = spawn("npx", ["remix-serve", ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: port,
    HOST: host,
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGTERM", () => {
  child.kill("SIGTERM");
});

process.on("SIGINT", () => {
  child.kill("SIGINT");
});

