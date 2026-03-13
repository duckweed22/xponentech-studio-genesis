import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join("");
}

function safeFileName(input, fallback) {
  const normalized = String(input || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return normalized || fallback;
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.promises.writeFile(outputPath, buffer);
}

async function waitForStageText(page, text, timeout = 240000) {
  await page.waitForFunction(
    (expected) => {
      const node = document.querySelector("#stage-title");
      return node && node.textContent && node.textContent.includes(expected);
    },
    text,
    { timeout }
  );
}

async function readStageSnapshot(page) {
  return page.evaluate(() => ({
    stageTitle: document.querySelector("#stage-title")?.textContent?.trim() || "",
    stageDesc: document.querySelector("#stage-desc")?.textContent?.trim() || "",
    debug: document.querySelector("#debug-banner")?.textContent?.trim() || "",
    progress: document.querySelector("#progress-value")?.textContent?.trim() || ""
  }));
}

async function collectResultImages(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".result-card")].map((card, index) => ({
      index,
      title: card.querySelector("strong")?.textContent?.trim() || `image-${index + 1}`,
      imageUrl: card.querySelector("img")?.getAttribute("src") || ""
    }))
  );
}

async function main() {
  const url = getArg("url", "https://xponentech.zeabur.app/");
  const imagePath = getArg("image");
  const brief = getArg("brief", "");
  const targetLanguage = getArg("targetLanguage", "中文");
  const ratio = getArg("ratio", "4:5 竖版");
  const resolution = getArg("resolution", "2K 高清");
  const count = getArg("count", "6 张");
  const headless = getArg("headless", "false") !== "false";
  const outputDir = getArg(
    "outputDir",
    path.join(process.env.HOME || process.cwd(), "Desktop", `XponenTech-outputs-${formatTimestamp()}`)
  );

  if (!imagePath) {
    throw new Error("Missing --image=/absolute/path/to/file");
  }

  const absoluteImagePath = path.resolve(imagePath);
  if (!fs.existsSync(absoluteImagePath)) {
    throw new Error(`Image file not found: ${absoluteImagePath}`);
  }

  const browser = await chromium.launch({ headless, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  try {
    console.log(`[1/6] Open ${url}`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });

    console.log(`[2/6] Upload ${absoluteImagePath}`);
    await page.setInputFiles("#product-image", absoluteImagePath);
    console.log("[3/6] Fill form");
    if (brief) {
      await page.fill("#brief", brief);
    }
    await page.selectOption("#target-language", { label: targetLanguage });
    await page.selectOption("#ratio", { label: ratio });
    await page.selectOption("#resolution", { label: resolution });
    await page.selectOption("#count", { label: count });

    console.log("[4/6] Analyze");
    await page.click("#analyze-btn");
    await waitForStageText(page, "设计规划预览", 180000);
    console.log("[5/6] Analysis complete");

    await sleep(1200);
    console.log("[6/6] Generate");
    await page.click("#generate-btn");
    await waitForStageText(page, "生成完成", 600000);

    const resultCount = await page.locator(".result-card").count();
    const resultImages = await collectResultImages(page);
    await fs.promises.mkdir(outputDir, { recursive: true });
    for (const item of resultImages) {
      if (!item.imageUrl) continue;
      const fileName = `${String(item.index + 1).padStart(2, "0")}-${safeFileName(item.title, `image-${item.index + 1}`)}.png`;
      await downloadFile(item.imageUrl, path.join(outputDir, fileName));
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          url,
          imagePath: absoluteImagePath,
          resultCount,
          outputDir
        },
        null,
        2
      )
    );
  } catch (error) {
    const snapshot = await readStageSnapshot(page).catch(() => ({}));
    const screenshotPath = path.join(__dirname, "..", "playwright-last-error.png");
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: error.message,
          snapshot,
          screenshotPath
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

export { main };
