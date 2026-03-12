const state = {
  productImage: null,
  blueprint: null,
  productSummary: "",
  stage: "input"
};

const nodes = {
  fileInput: document.querySelector("#product-image"),
  uploadCopy: document.querySelector("#upload-copy"),
  productPreview: document.querySelector("#product-preview"),
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
  stageNodes: [...document.querySelectorAll(".stage-node")],
  planTemplate: document.querySelector("#plan-item-template")
};

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
      <div class="result-meta">
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.description || "")}</p>
        <div class="prompt-box">${escapeHtml(item.prompt || "")}</div>
      </div>
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
  showDebug("已点击“分析产品”，准备请求 /api/analyze ...");
  nodes.analyzeBtn.disabled = true;
  nodes.generateBtn.disabled = true;
  resetResultsPlaceholder();
  setStage("analyzing");

  try {
    const data = await postJson("/api/analyze", {
      ...options,
      productImage: state.productImage
    });

    state.blueprint = data.blueprint;
    state.productSummary = data.productSummary || "";

    renderSpecs(data.blueprint.design_specs);
    renderProductSummary(state.productSummary);
    renderPlanList(data.blueprint.images);
    setStage("preview");
    showDebug("分析成功，已生成蓝图。");
    nodes.generateBtn.disabled = false;
  } catch (error) {
    showDebug(`分析失败：${error.message}`, "error");
    setStage("input", `分析失败：${error.message}`);
  } finally {
    nodes.analyzeBtn.disabled = false;
  }
}

async function handleGenerate() {
  if (!state.blueprint) return;

  const options = collectOptions();
  showDebug("已点击“确认生成”，准备请求 /api/generate ...");
  nodes.analyzeBtn.disabled = true;
  nodes.generateBtn.disabled = true;
  setStage("generating");
  nodes.resultGrid.className = "result-grid empty-state";
  nodes.resultGrid.textContent = "正在生成 prompts 与图片，请稍候。";

  try {
    const data = await postJson("/api/generate", {
      ...options,
      blueprint: state.blueprint,
      productSummary: state.productSummary
    });

    renderResults(data.images);
    showDebug(`生成完成，共 ${data.images.length} 张。`);
    setStage("complete", `已完成 ${data.images.length} 张图片生成。`);
  } catch (error) {
    showDebug(`生成失败：${error.message}`, "error");
    setStage("preview", `生成失败：${error.message}`);
    resetResultsPlaceholder();
  } finally {
    nodes.analyzeBtn.disabled = false;
    nodes.generateBtn.disabled = false;
  }
}

nodes.fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  state.productImage = await fileToDataUrl(file);
  nodes.productPreview.src = state.productImage;
  nodes.productPreview.classList.remove("hidden");
  nodes.uploadCopy.classList.add("hidden");
  nodes.uploadCopy.textContent = file.name;
  showDebug(`已载入产品图：${file.name}`);
});

nodes.analyzeBtn.addEventListener("click", handleAnalyze);
nodes.generateBtn.addEventListener("click", handleGenerate);

setStage("input");
