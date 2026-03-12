import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const envPath = path.join(__dirname, ".env");

function loadEnvFile() {
  if (!existsSync(envPath)) return;
  const raw = requireEnvText(envPath);
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function requireEnvText(filePath) {
  return readFileSync(filePath, "utf8");
}

try {
  loadEnvFile();
} catch (error) {
  console.warn("Failed to load .env file:", error.message);
}

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const ARK_BASE_URL = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const ARK_API_KEY = process.env.ARK_API_KEY || "";
const ARK_TEXT_MODEL = process.env.ARK_TEXT_MODEL || "doubao-1-5-pro-32k-250115";
const ARK_VISION_MODEL = process.env.ARK_VISION_MODEL || "doubao-seed-1-6-vision-250815";
const ARK_IMAGE_MODEL = process.env.ARK_IMAGE_MODEL || "doubao-seedream-4-0-250828";
const MAX_CONCURRENCY = Math.max(1, Number(process.env.MAX_CONCURRENCY || 2));

const ANALYSIS_PROMPT_ZH = `
你是一位世界级电商视觉设计总监和品牌营销专家。

你的任务：
1. 分析上传的产品图片，识别产品类型、材质、结构、颜色、包装、标签、logo、可见文字。
2. 结合用户输入的产品信息、卖点、目标人群、风格要求，制定一套详情组图方案。
3. 为正好 {{image_count}} 张图片制定独立且不重复的设计计划。
4. 输出严格 JSON，不要任何额外解释。

输出格式：
{
  "design_specs": "...",
  "images": [
    {
      "title": "...",
      "description": "...",
      "design_content": "..."
    }
  ]
}

design_specs 必须包含：
- Color System
- Font System
- Visual Language
- Photography Style
- Quality Requirements

每张图片的 design_content 必须包含：
- Design Goal
- Product Presence
- Inset Image Elements
- Composition
- Display Focus / Selling Points
- Background / Decorations
- Text Content
- Atmosphere

约束：
- 必须忠实保留产品本身、包装、标签、logo、产品文字
- 如果用户要求无字，则 Text Content 写 None，Font System 写 无
- design_specs/title/description 使用中文
- design_content 中的文案内容使用 {{target_language_name}}
- 只输出 JSON
`.trim();

const GENERATOR_PROMPT = `
You are an expert image prompt engineer specializing in e-commerce product photography.

Your task:
Generate one production-ready prompt for each planned image.

Requirements:
- Each prompt must be 250-350 words
- Prompts must be written in English
- Any rendered text inside the image must remain in the target language
- Output must be a strict JSON array: [{"prompt":"..."}]

Each prompt must follow this exact order:
1. Subject
2. Composition
3. Background
4. Lighting
5. Color scheme
6. Material details
7. Text layout
8. Inset images
9. Atmosphere
10. Style
11. Quality

Mandatory rule in Subject:
"The subject in this image must be strictly consistent with the product described in the reference analysis."

Hard constraints:
- Do not change the product category
- Do not replace the brand
- Do not invent a different package structure
- Preserve visible logo, label placement, bottle/can/jar shape, cap shape, and dominant product colors from the reference analysis
- If the reference analysis mentions a beverage bottle, the result must still be that beverage bottle
- Never turn the product into an unrelated object, toy, appliance, mug, kettlebell, or abstract shape

Text layout rules:
- Keep only literal display copy
- Strip labels like Main Title:, Subtitle:, 主标题：
- If the plan says no text, leave Text layout empty

Output rules:
- JSON only
- No markdown
- No extra explanation
`.trim();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message, details) {
  json(res, status, {
    error: message,
    details: details || null
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {}

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {}
  }

  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {}
  }

  throw new Error("Unable to parse JSON model response");
}

function normalizeDataUrl(dataUrl) {
  if (!dataUrl) return null;
  if (dataUrl.startsWith("data:")) return dataUrl;
  return `data:image/png;base64,${dataUrl}`;
}

async function callChatCompletion({ model, messages, maxTokens = 4096, temperature = 0.7 }) {
  if (!ARK_API_KEY) {
    throw new Error("Missing ARK_API_KEY. Start the server with ARK_API_KEY=your_key node server.js");
  }

  const response = await fetch(`${ARK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ARK_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `Chat request failed with ${response.status}`);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty chat response");
  }
  return content;
}

async function callImageGeneration({ model, prompt, size, imageUrl }) {
  if (!ARK_API_KEY) {
    throw new Error("Missing ARK_API_KEY. Start the server with ARK_API_KEY=your_key node server.js");
  }

  const body = {
    model: model || ARK_IMAGE_MODEL,
    prompt,
    size
  };

  if (imageUrl) body.image = imageUrl;

  const response = await fetch(`${ARK_BASE_URL}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ARK_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `Image generation failed with ${response.status}`);
  }

  const result = payload?.data?.[0];
  if (!result?.url && !result?.b64_json) {
    throw new Error("Image generation returned no image data");
  }

  return {
    url: result.url || `data:image/png;base64,${result.b64_json}`,
    size: result.size || size,
    usage: payload.usage || null
  };
}

function targetLanguageName(targetLanguage) {
  const map = {
    zh: "中文",
    en: "English",
    ja: "日本語",
    ko: "한국어",
    fr: "Français",
    de: "Deutsch",
    es: "Español"
  };
  return map[targetLanguage] || targetLanguage || "中文";
}

function ratioToSize(ratio, resolution) {
  const bucket = {
    "0.5K": {
      square: "512x512",
      portrait: "512x768",
      landscape: "768x512",
      tall: "512x896",
      wide: "896x512"
    },
    "1K": {
      square: "1024x1024",
      portrait: "1024x1536",
      landscape: "1536x1024",
      tall: "1024x1792",
      wide: "1792x1024"
    },
    "2K": {
      square: "2048x2048",
      portrait: "1536x2048",
      landscape: "2048x1536",
      tall: "1536x2048",
      wide: "2048x1536"
    },
    "4K": {
      square: "2048x2048",
      portrait: "1536x2048",
      landscape: "2048x1536",
      tall: "1536x2048",
      wide: "2048x1536"
    }
  };

  const ratioGroup = {
    "1:1": "square",
    "2:3": "portrait",
    "3:4": "portrait",
    "4:5": "portrait",
    "1:4": "tall",
    "1:8": "tall",
    "3:2": "landscape",
    "4:3": "landscape",
    "5:4": "landscape",
    "16:9": "wide",
    "21:9": "wide",
    "4:1": "wide",
    "8:1": "wide",
    "9:16": "tall"
  };

  return bucket[resolution || "1K"]?.[ratioGroup[ratio] || "square"] || "1024x1024";
}

function createFallbackBlueprint({ brief, count, targetLanguage, productSummary }) {
  const baseSummary = productSummary || "产品主体清晰、包装完整、适合电商详情页呈现";
  const images = Array.from({ length: count }, (_, index) => ({
    title: `详情图 ${index + 1}`,
    description: `围绕核心卖点构建第 ${index + 1} 张场景图`,
    design_content: [
      `Design Goal: 以第 ${index + 1} 个卖点视角强化转化`,
      "Product Presence: 主体产品必须清晰出现，保持真实结构和标签",
      "Inset Image Elements: 如有必要，可加入局部放大或材质细节",
      index === 0 ? "Composition: 居中英雄构图，建立产品识别" : "Composition: 有层次的信息化构图，突出对比和节奏",
      `Display Focus / Selling Points: ${brief || "强调产品卖点、品质感与购买理由"}`,
      "Background / Decorations: 干净商业化背景，少量高质感装饰元素",
      `Text Content: ${targetLanguage === "en" ? "Keep copy concise in English" : "根据卖点补充简洁文案"}`,
      "Atmosphere: 专业、可信、高级、适合电商转化"
    ].join("\n")
  }));

  return {
    design_specs: [
      "Color System: 以产品主色为核心，辅以中性高级色",
      targetLanguage === "en" ? "Font System: Clean Latin sans-serif for marketing copy" : "Font System: 干净现代的电商无衬线字体体系",
      "Visual Language: 高级电商海报风格，信息清晰，结构稳健",
      "Photography Style: 柔和商业布光，清楚展示材质与轮廓",
      `Quality Requirements: 高清、真实、统一，严格保持产品识别信息。Product summary: ${baseSummary}`
    ].join("\n"),
    images
  };
}

async function analyzeProductImage(productImage, brief, targetLanguage) {
  if (!productImage) return null;

  const content = await callChatCompletion({
    model: ARK_VISION_MODEL,
    temperature: 0.2,
    maxTokens: 1800,
    messages: [
      {
        role: "system",
        content: "You are an e-commerce product analyst. Describe only what is visible and useful for accurate commercial image generation."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "请分析这张产品图，输出简洁但信息密度高的中文要点：",
              "1. 产品品类与用途",
              "2. 形状结构与关键部件",
              "3. 材质与表面质感",
              "4. 主色与辅助色",
              "5. 包装、标签、logo、可见文字",
              "6. 必须保留的识别特征",
              "6.1 如果能识别品牌、商品名称、饮料类型、包装类型，请明确写出",
              `7. 结合这段需求补充你认为最重要的还原要求：${brief || "无额外需求"}`,
              `8. 目标语言：${targetLanguageName(targetLanguage)}`,
              "9. 明确指出：生成时绝对不能变更的产品身份信息"
            ].join("\n")
          },
          {
            type: "image_url",
            image_url: {
              url: normalizeDataUrl(productImage)
            }
          }
        ]
      }
    ]
  });

  return content.trim();
}

async function buildBlueprint({ brief, count, targetLanguage, productImage }) {
  let productSummary = null;
  try {
    productSummary = await analyzeProductImage(productImage, brief, targetLanguage);
  } catch (error) {
    if (productImage) {
      throw new Error(`产品图分析失败：${error.message}`);
    }
  }
  const prompt = ANALYSIS_PROMPT_ZH
    .replace("{{image_count}}", String(count))
    .replace("{{target_language_name}}", targetLanguageName(targetLanguage));

  const response = await callChatCompletion({
    model: ARK_TEXT_MODEL,
    temperature: 0.55,
    maxTokens: 4200,
    messages: [
      {
        role: "system",
        content: prompt
      },
      {
        role: "user",
        content: [
          `用户需求：${brief || "未填写"}`,
          `目标生成张数：${count}`,
          `目标语言：${targetLanguageName(targetLanguage)}`,
          `产品图分析：${productSummary || "无产品图分析结果，请根据需求本身规划"}`,
          "关键要求：绝对不要改变产品品类、品牌、包装结构、主色和标签布局。"
        ].join("\n\n")
      }
    ]
  });

  try {
    const parsed = extractJson(response);
    if (!parsed?.design_specs || !Array.isArray(parsed?.images)) {
      throw new Error("Invalid blueprint structure");
    }
    return {
      blueprint: {
        design_specs: parsed.design_specs,
        images: parsed.images.slice(0, count)
      },
      productSummary
    };
  } catch {
    return {
      blueprint: createFallbackBlueprint({ brief, count, targetLanguage, productSummary }),
      productSummary
    };
  }
}

async function buildGenerationPrompts({ blueprint, brief, targetLanguage, productSummary, count }) {
  const response = await callChatCompletion({
    model: ARK_TEXT_MODEL,
    temperature: 0.7,
    maxTokens: 8000,
    messages: [
      {
        role: "system",
        content: GENERATOR_PROMPT
      },
      {
        role: "user",
        content: [
          `Target language for on-image text: ${targetLanguageName(targetLanguage)}`,
          `User brief: ${brief || "N/A"}`,
          `Product reference analysis: ${productSummary || "N/A"}`,
          `Global design specs:\n${blueprint.design_specs}`,
          "Critical identity rule: the generated image must preserve the exact product identity from the reference analysis and must not drift into another product category.",
          `Planned images JSON:\n${JSON.stringify(blueprint.images.slice(0, count), null, 2)}`
        ].join("\n\n")
      }
    ]
  });

  const parsed = extractJson(response);
  if (!Array.isArray(parsed)) {
    throw new Error("Prompt generator did not return an array");
  }
  return parsed.slice(0, count).map((item, index) => ({
    prompt: item.prompt,
    title: blueprint.images[index]?.title || `图片 ${index + 1}`,
    description: blueprint.images[index]?.description || ""
  }));
}

async function runWithConcurrency(items, worker, concurrency = MAX_CONCURRENCY) {
  const results = new Array(items.length);
  let current = 0;

  async function next() {
    const index = current++;
    if (index >= items.length) return;
    results[index] = await worker(items[index], index);
    await next();
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(runners);
  return results;
}

async function handleAnalyze(req, res) {
  try {
    const body = await readJsonBody(req);
    const brief = String(body.brief || "").trim();
    const count = Math.max(1, Math.min(15, Number(body.count || 4)));
    const targetLanguage = String(body.targetLanguage || "zh");
    const productImage = body.productImage || null;

    const result = await buildBlueprint({
      brief,
      count,
      targetLanguage,
      productImage
    });

    json(res, 200, {
      blueprint: result.blueprint,
      productSummary: result.productSummary,
      models: {
        text: ARK_TEXT_MODEL,
        vision: ARK_VISION_MODEL,
        image: ARK_IMAGE_MODEL
      }
    });
  } catch (error) {
    console.error("[/api/analyze]", error);
    sendError(res, 500, error.message);
  }
}

async function handleGenerate(req, res) {
  try {
    const body = await readJsonBody(req);
    const brief = String(body.brief || "").trim();
    const targetLanguage = String(body.targetLanguage || "zh");
    const blueprint = body.blueprint;
    const productSummary = body.productSummary || null;
    const requestedModel = String(body.model || ARK_IMAGE_MODEL);
    const ratio = String(body.ratio || "1:1");
    const resolution = String(body.resolution || "1K");
    const count = Math.max(1, Math.min(15, Number(body.count || blueprint?.images?.length || 4)));

    if (!blueprint?.design_specs || !Array.isArray(blueprint?.images)) {
      return sendError(res, 400, "Missing blueprint data");
    }

    const prompts = await buildGenerationPrompts({
      blueprint,
      brief,
      targetLanguage,
      productSummary,
      count
    });

    const size = ratioToSize(ratio, resolution);
    const images = await runWithConcurrency(
      prompts,
      async (item, index) => {
        const generated = await callImageGeneration({
          model: requestedModel,
          prompt: item.prompt,
          size
        });
        return {
          index,
          title: item.title,
          description: item.description,
          prompt: item.prompt,
          imageUrl: generated.url,
          size: generated.size
        };
      }
    );

    json(res, 200, {
      prompts,
      images,
      models: {
        text: ARK_TEXT_MODEL,
        image: requestedModel
      }
    });
  } catch (error) {
    console.error("[/api/generate]", error);
    sendError(res, 500, error.message);
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  pathname = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, pathname);

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    return json(res, 200, {
      ok: true,
      configured: Boolean(ARK_API_KEY),
      models: {
        text: ARK_TEXT_MODEL,
        vision: ARK_VISION_MODEL,
        image: ARK_IMAGE_MODEL
      }
    });
  }

  if (req.method === "POST" && req.url === "/api/analyze") {
    return handleAnalyze(req, res);
  }

  if (req.method === "POST" && req.url === "/api/generate") {
    return handleGenerate(req, res);
  }

  if (req.method === "GET") {
    return serveStatic(req, res);
  }

  sendError(res, 405, "Method not allowed");
});

if (process.env.NO_SERVER_LISTEN !== "1") {
  server.listen(PORT, HOST, () => {
    console.log(`Studio Genesis clone running on http://${HOST}:${PORT}`);
  });
}

export {
  buildBlueprint,
  buildGenerationPrompts,
  ratioToSize
};
