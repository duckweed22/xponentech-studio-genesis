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
  planTemplate: document.querySelector("#plan-item-template"),
  pricingFeedback: document.querySelector("#pricing-feedback"),
  pricingToggles: [...document.querySelectorAll("[data-pricing-toggle]")],
  pricingPanels: [...document.querySelectorAll("[data-pricing-panel]")],
  pricingActions: [...document.querySelectorAll("[data-plan-action]")]
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

function showPricingFeedback(message) {
  if (!nodes.pricingFeedback) return;
  nodes.pricingFeedback.textContent = message;
  nodes.pricingFeedback.classList.remove("hidden");
}

function setPricingMode(mode) {
  if (!nodes.pricingToggles.length || !nodes.pricingPanels.length) return;

  nodes.pricingToggles.forEach((toggle) => {
    const active = toggle.dataset.pricingToggle === mode;
    toggle.classList.toggle("is-active", active);
    toggle.setAttribute("aria-selected", String(active));
  });

  nodes.pricingPanels.forEach((panel) => {
    const active = panel.dataset.pricingPanel === mode;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
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

function startProgressSimulation(steps, intervalMs = 700, pendingLabel = "Waiting for model response") {
  clearProgressTimers();
  let index = 0;
  setProgress(steps[0]?.value || 0, steps[0]?.label || "Processing");
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
    input: ["Waiting for input", "Upload product images and fill in the brief, then click Analyze Product to begin.", 0],
    analyzing: ["Analyzing product", description || "Using vision and text models to build the full design blueprint.", 1],
    preview: ["Review design plan", description || "Review the design specs and image plan, then generate the final images.", 2],
    generating: ["Generating images", description || "Generating prompts first, then rendering the image set.", 3],
    complete: ["Generation complete", description || "Review each output along with its prompt and final image.", 4]
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
  nodes.designSpecs.textContent = text || "No design specs yet.";
  nodes.designSpecs.classList.toggle("empty-state", !text);
}

function renderProductSummary(text) {
  nodes.productSummary.textContent = text || "No product analysis yet.";
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

    title.value = item.title || `Image ${index + 1}`;
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
  nodes.resultGrid.textContent = "Generated images will appear here.";
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
      <span class="thumb-copy">Click to upload product images</span>
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
        <button type="button" class="thumb-delete" aria-label="Delete image">&times;</button>
      `;
      thumb.querySelector(".thumb-delete").addEventListener("click", (event) => {
        event.stopPropagation();
        state.productImages.splice(index, 1);
        renderUploadGallery();
        showDebug(`Removed 1 product image. ${state.productImages.length} image(s) remaining.`);
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
  showDebug("Analyze Product clicked. Preparing request to /api/analyze ...");
  nodes.analyzeBtn.disabled = true;
  nodes.generateBtn.disabled = true;
  resetResultsPlaceholder();
  setStage("analyzing");
  startProgressSimulation(
    [
      { value: 8, label: "Reading reference images" },
      { value: 28, label: "Extracting product identity" },
      { value: 52, label: "Building unified design specs" },
      { value: 72, label: "Planning image layouts" },
      { value: 84, label: "Assembling analysis results" }
    ],
    700,
    "Waiting for analysis model response"
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
    setProgress(100, "Analysis complete");
    showDebug(`Analysis complete. Blueprint ready in ${((performance.now() - startedAt) / 1000).toFixed(1)}s.`);
    nodes.generateBtn.disabled = false;
  } catch (error) {
    hideProgress();
    showDebug(`Analysis failed: ${error.message}`, "error");
    setStage("input", `Analysis failed: ${error.message}`);
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
  showDebug("Generate Images clicked. Preparing request to /api/generate ...");
  nodes.analyzeBtn.disabled = true;
  nodes.generateBtn.disabled = true;
  setStage("generating");
  nodes.resultGrid.className = "result-grid empty-state";
  nodes.resultGrid.textContent = "Generating prompts and images. Please wait.";
  const count = Math.max(1, options.count);
  const generateSteps = [
    { value: 6, label: "Preparing image blueprint" },
    { value: 14, label: "Writing generation prompts" }
  ];
  for (let index = 0; index < count; index += 1) {
    generateSteps.push({
      value: Math.min(88, 24 + Math.round(((index + 1) / count) * 58)),
      label: `Rendering image ${index + 1}/${count}`
    });
  }
  startProgressSimulation(generateSteps, 900, "Waiting for image model response");

  try {
    const data = await postJson("/api/generate", {
      ...options,
      blueprint: state.blueprint,
      productSummary: state.productSummary,
      productImages: state.productImages.map((item) => item.dataUrl)
    });

    renderResults(data.images);
    setProgress(100, "Generation complete");
    showDebug(`Generation complete. Produced ${data.images.length} image(s) in ${((performance.now() - startedAt) / 1000).toFixed(1)}s.`);
    setStage("complete", `${data.images.length} image(s) generated successfully.`);
  } catch (error) {
    hideProgress();
    showDebug(`Generation failed: ${error.message}`, "error");
    setStage("preview", `Generation failed: ${error.message}`);
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
    showDebug(`Loaded ${newImages.length} product image(s). ${state.productImages.length} image(s) currently queued.`);
  } catch (error) {
    showDebug(`Image read failed: ${error.message}`, "error");
  } finally {
    event.target.value = "";
  }
});

nodes.analyzeBtn.addEventListener("click", handleAnalyze);
nodes.generateBtn.addEventListener("click", handleGenerate);

nodes.pricingToggles.forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const mode = toggle.dataset.pricingToggle;
    setPricingMode(mode);
    showPricingFeedback(
      mode === "subscription"
        ? "This is a display-only subscription section. Buttons are for UI preview only and will not trigger real billing."
        : "This is a display-only credit purchase section. Buttons are for UI preview only and will not trigger real payment."
    );
  });
});

nodes.pricingActions.forEach((button) => {
  button.addEventListener("click", () => {
    const label = button.dataset.planLabel || "Current plan";
    showPricingFeedback(`Opened the preview entry for ${label}. This release keeps pricing as a showcase only and does not process real payments.`);
  });
});

renderUploadGallery();
renderSpecs("");
renderProductSummary("");
resetResultsPlaceholder();
setStage("input");
setPricingMode("subscription");
hideDebug();
