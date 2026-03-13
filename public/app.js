const MAX_UPLOADS = 6;

const state = {
  productImages: [],
  blueprint: null,
  productSummary: "",
  stage: "input"
};

const nodes = {
  fileInput: document.querySelector("#product-image"),
  uploadGallery: document.querySelector("#upload-gallery"),
  uploadCount: document.querySelector("#upload-count"),
  brief: document.querySelector("#brief"),
  targetLanguage: document.querySelector("#target-language"),
  model: document.querySelector("#model"),
  count: document.querySelector("#count"),
  ratio: document.querySelector("#ratio"),
  resolution: document.querySelector("#resolution"),
  turbo: document.querySelector("#turbo"),
  analyzeBtn: document.querySelector("#analyze-btn"),
  generateBtn: document.querySelector("#generate-btn"),
  designSpecs: document.querySelector("#design-specs"),
  productSummary: document.querySelector("#product-summary"),
  planList: document.querySelector("#plan-list"),
  resultGrid: document.querySelector("#result-grid"),
  stageTitle: document.querySelector("#stage-title"),
  stageDesc: document.querySelector("#stage-desc"),
  debugBanner: document.querySelector("#debug-banner"),
  progressPanel: document.querySelector("#progress-panel"),
  progressLabel: document.querySelector("#progress-label"),
  progressValue: document.querySelector("#progress-value"),
  progressFill: document.querySelector("#progress-fill"),
  stageNodes: [...document.querySelectorAll(".stage-node")],
  planTemplate: document.querySelector("#plan-item-template")
};

let progressTimer = null;
let progressTailTimer = null;

function showDebug(message, type = "info") {
  nodes.debugBanner.textContent = message;
  nodes.debugBanner.classList.remove("hidden", "is-error", "is-info");
  nodes.debugBanner.classList.add(type === "error" ? "is-error" : "is-info");
}

function hideDebug() {
  nodes.debugBanner.textContent = "";
  nodes.debugBanner.classList.add("hidden");
  nodes.debugBanner.classList.remove("is-error", "is-info");
}

function setProgress(progress, label, options = {}) {
  const { pending = false } = options;
  const value = Math.max(0, Math.min(100, Math.round(progress)));
  if (label) nodes.progressLabel.textContent = label;
  nodes.progressValue.textContent = `${value}%`;
  nodes.progressFill.style.width = `${value}%`;
  nodes.progressPanel.classList.remove("hidden");
  nodes.progressPanel.classList.toggle("is-pending", pending);
  nodes.progressFill.classList.toggle("is-pending", pending);
}

function clearProgressTimers() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  if (progressTailTimer) {
    clearInterval(progressTailTimer);
    progressTailTimer = null;
  }
}

function startProgressTail(startValue, maxValue, label, intervalMs) {
  let current = startValue;
  setProgress(current, label, { pending: true });
  progressTailTimer = setInterval(() => {
    if (current >= maxValue) {
      clearInterval(progressTailTimer);
      progressTailTimer = null;
      return;
    }
    current += current < maxValue - 2 ? 1 : 0.4;
    setProgress(current, label, { pending: true });
  }, intervalMs);
}

function hideProgress() {
  clearProgressTimers();
  nodes.progressPanel.classList.add("hidden");
  nodes.progressFill.style.width = "0%";
  nodes.progressValue.textContent = "0%";
  nodes.progressPanel.classList.remove("is-pending");
  nodes.progressFill.classList.remove("is-pending");
}

function startProgressSimulation(steps, intervalMs = 700, pendingLabel = "等待模型返回") {
  clearProgressTimers();
  let index = 0;
  setProgress(steps[0]?.value || 0, steps[0]?.label || "处理中");
  progressTimer = setInterval(() => {
    index += 1;
    if (index >= steps.length) {
      clearInterval(progressTimer);
      progressTimer = null;
      const lastValue = steps.at(-1)?.value || 90;
      startProgressTail(lastValue, 98, pendingLabel, 1800);
      return;
    }
    setProgress(steps[index].value, steps[index].label);
  }, intervalMs);
}

function setStage(stage, description) {
  state.stage = stage;
  const labels = {
    input: ["等待输入", "上传产品图并填写要求后，点击“分析产品”开始。", 0],
    analyzing: ["分析产品中", description || "正在调用视觉与文本模型生成整体设计蓝图。", 1],
    preview: ["设计规划预览", description || "请确认设计规范和图片规划，然后生成图片。", 2],
    generating: ["正在生成图片", description || "先生成 prompts，再由模型批量出图。", 3],
    complete: ["生成完成", description || "可以查看每张图的 prompt 和输出结果。", 4]
  };
  const [title, desc, activeIndex] = labels[stage];
  nodes.stageTitle.textContent = title;
  nodes.stageDesc.textContent = desc;
  nodes.stageNodes.forEach((node, index) => {
    node.classList.toggle("active", index <= activeIndex);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function collectOptions() {
  return {
    brief: nodes.brief.value.trim(),
    targetLanguage: nodes.targetLanguage.value,
    model: nodes.model.value,
    count: Number(nodes.count.value),
    ratio: nodes.ratio.value,
    resolution: nodes.resolution.value,
    turbo: nodes.turbo.checked
  };
}

function renderSpecs(text) {
  nodes.designSpecs.textContent = text || "暂无设计规范";
  nodes.designSpecs.classList.toggle("empty-state", !text);
}

function renderProductSummary(text) {
  nodes.productSummary.textContent = text || "暂无产品分析";
  nodes.productSummary.classList.toggle("empty-state", !text);
}

function renderPlanList(images) {
  nodes.planList.innerHTML = "";
  nodes.planList.classList.remove("empty-state");
  images.forEach((item, index) => {
    const fragment = nodes.planTemplate.content.cloneNode(true);
    const wrapper = fragment.querySelector(".plan-item");
    const title = fragment.querySelector(".plan-title");
    const desc = fragment.querySelector(".plan-desc");
    const content = fragment.querySelector(".plan-content");

    title.value = item.title || `图片 ${index + 1}`;
    desc.value = item.description || "";
    content.value = item.design_content || "";

    title.addEventListener("input", () => {
      state.blueprint.images[index].title = title.value;
    });
    desc.addEventListener("input", () => {
      state.blueprint.images[index].description = desc.value;
    });
    content.addEventListener("input", () => {
      state.blueprint.images[index].design_content = content.value;
    });

    nodes.planList.appendChild(wrapper);
  });
}

function renderResults(items) {
  nodes.resultGrid.innerHTML = "";
  nodes.resultGrid.classList.remove("empty-state");
  nodes.resultGrid.classList.add("has-results");

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "result-card";
    card.innerHTML = `
      <img src="${item.imageUrl}" alt="${escapeHtml(item.title)}" />
    `;
    nodes.resultGrid.appendChild(card);
  });
}

function resetResultsPlaceholder() {
  nodes.resultGrid.className = "result-grid empty-state";
  nodes.resultGrid.textContent = "生成图片后会显示在这里。";
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function updateUploadCount() {
  nodes.uploadCount.textContent = `${state.productImages.length}/${MAX_UPLOADS}`;
}

function triggerFilePicker() {
  if (state.productImages.length >= MAX_UPLOADS) return;
  nodes.fileInput.click();
}

function renderUploadGallery() {
  nodes.uploadGallery.innerHTML = "";

  if (state.productImages.length === 0) {
    const empty = document.createElement("button");
    empty.type = "button";
    empty.className = "upload-thumb upload-thumb-picker upload-thumb-large";
    empty.innerHTML = `
      <span class="plus-sign">+</span>
      <span class="thumb-copy">点击上传产品图</span>
    `;
    empty.addEventListener("click", triggerFilePicker);
    nodes.uploadGallery.appendChild(empty);
  } else {
    state.productImages.forEach((image, index) => {
      const thumb = document.createElement("div");
      thumb.className = "upload-thumb upload-thumb-active";
      thumb.innerHTML = `
        <img class="product-preview" src="${image.dataUrl}" alt="${escapeHtml(image.name)}" />
        <span class="thumb-index">${index + 1}</span>
        <button type="button" class="thumb-delete" aria-label="删除图片">×</button>
      `;
      thumb.querySelector(".thumb-delete").addEventListener("click", (event) => {
        event.stopPropagation();
        state.productImages.splice(index, 1);
        renderUploadGallery();
        showDebug(`已删除 1 张产品图，当前共 ${state.productImages.length} 张。`);
      });
      nodes.uploadGallery.appendChild(thumb);
    });

    if (state.productImages.length < MAX_UPLOADS) {
      const addMore = document.createElement("button");
      addMore.type = "button";
      addMore.className = "upload-thumb upload-thumb-picker upload-thumb-empty";
      addMore.innerHTML = `<span class="plus-sign">+</span>`;
      addMore.addEventListener("click", triggerFilePicker);
      nodes.uploadGallery.appendChild(addMore);
    }
  }

  updateUploadCount();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

async function handleAnalyze() {
  const options = collectOptions();
  const startedAt = performance.now();
  showDebug("已点击“分析产品”，准备请求 /api/analyze ...");
  nodes.analyzeBtn.disabled = true;
  nodes.generateBtn.disabled = true;
  resetResultsPlaceholder();
  setStage("analyzing");
  startProgressSimulation(
    [
      { value: 8, label: "读取参考图" },
      { value: 28, label: "提取产品关键信息" },
      { value: 52, label: "生成统一设计规范" },
      { value: 72, label: "规划详情图结构" },
      { value: 84, label: "整理分析结果" }
    ],
    700,
    "等待分析模型返回"
  );

  try {
    const data = await postJson("/api/analyze", {
      ...options,
      productImages: state.productImages.map((item) => item.dataUrl)
    });

    state.blueprint = data.blueprint;
    state.productSummary = data.productSummary || "";

    renderSpecs(data.blueprint.design_specs);
    renderProductSummary(state.productSummary);
    renderPlanList(data.blueprint.images);
    setStage("preview");
    setProgress(100, "分析完成");
    showDebug(`分析成功，已生成蓝图，用时 ${((performance.now() - startedAt) / 1000).toFixed(1)}s。`);
    nodes.generateBtn.disabled = false;
  } catch (error) {
    hideProgress();
    showDebug(`分析失败：${error.message}`, "error");
    setStage("input", `分析失败：${error.message}`);
  } finally {
    if (state.stage === "preview") {
      setTimeout(hideProgress, 600);
    }
    nodes.analyzeBtn.disabled = false;
  }
}

async function handleGenerate() {
  if (!state.blueprint) return;

  const options = collectOptions();
  const startedAt = performance.now();
  showDebug("已点击“确认生成”，准备请求 /api/generate ...");
  nodes.analyzeBtn.disabled = true;
  nodes.generateBtn.disabled = true;
  setStage("generating");
  nodes.resultGrid.className = "result-grid empty-state";
  nodes.resultGrid.textContent = "正在生成 prompts 与图片，请稍候。";
  const count = Math.max(1, options.count);
  const generateSteps = [
    { value: 6, label: "整理图片蓝图" },
    { value: 14, label: "编写生成提示词" }
  ];
  for (let index = 0; index < count; index += 1) {
    generateSteps.push({
      value: Math.min(88, 24 + Math.round(((index + 1) / count) * 58)),
      label: `生成第 ${index + 1}/${count} 张图片`
    });
  }
  startProgressSimulation(generateSteps, 900, "等待图片模型返回");

  try {
    const data = await postJson("/api/generate", {
      ...options,
      blueprint: state.blueprint,
      productSummary: state.productSummary,
      productImages: state.productImages.map((item) => item.dataUrl)
    });

    renderResults(data.images);
    setProgress(100, "生成完成");
    showDebug(`生成完成，共 ${data.images.length} 张，用时 ${((performance.now() - startedAt) / 1000).toFixed(1)}s。`);
    setStage("complete", `已完成 ${data.images.length} 张图片生成。`);
  } catch (error) {
    hideProgress();
    showDebug(`生成失败：${error.message}`, "error");
    setStage("preview", `生成失败：${error.message}`);
    resetResultsPlaceholder();
  } finally {
    if (state.stage === "complete") {
      setTimeout(hideProgress, 600);
    }
    nodes.analyzeBtn.disabled = false;
    nodes.generateBtn.disabled = false;
  }
}

nodes.fileInput.addEventListener("change", async (event) => {
  const files = [...(event.target.files || [])].slice(0, MAX_UPLOADS - state.productImages.length);
  if (!files.length) return;

  try {
    const newImages = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        dataUrl: await fileToDataUrl(file)
      }))
    );
    state.productImages.push(...newImages);
    renderUploadGallery();
    showDebug(`已载入 ${newImages.length} 张产品图，当前共 ${state.productImages.length} 张。`);
  } catch (error) {
    showDebug(`图片读取失败：${error.message}`, "error");
  } finally {
    event.target.value = "";
  }
});

nodes.analyzeBtn.addEventListener("click", handleAnalyze);
nodes.generateBtn.addEventListener("click", handleGenerate);

renderUploadGallery();
renderSpecs("");
renderProductSummary("");
resetResultsPlaceholder();
setStage("input");
hideDebug();
