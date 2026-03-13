import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
  }
}

function resolveModulePath() {
  return path.join(projectRoot, "node_modules", "playwright");
}

function playwrightInstalled() {
  return fs.existsSync(resolveModulePath());
}

function chromeInstalled() {
  return fs.existsSync("/Applications/Google Chrome.app");
}

function playwrightBrowserInstalled() {
  const cacheHome = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.HOME || "", "Library", "Caches", "ms-playwright");
  if (!cacheHome || !fs.existsSync(cacheHome)) return false;
  return fs.readdirSync(cacheHome).some((name) => name.startsWith("chromium-"));
}

async function main() {
  if (!playwrightInstalled()) {
    console.log("[bootstrap] Installing npm dependencies...");
    run("npm", ["install"]);
  }

  if (!chromeInstalled() && !playwrightBrowserInstalled()) {
    console.log("[bootstrap] Installing Playwright Chromium...");
    run("npx", ["playwright", "install", "chromium"]);
  }

  const runnerUrl = pathToFileURL(path.join(projectRoot, "scripts", "run-workflow.mjs")).href;
  const runner = await import(runnerUrl);
  await runner.main();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
