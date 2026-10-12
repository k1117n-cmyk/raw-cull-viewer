const state = {
  root: "",
  folders: [],
  folderIndex: 0,
  files: [],
  index: 0,
  loadingToken: 0,
  livePreview: null,
};

const previewVersion = "19";

const els = {
  root: document.querySelector("#root"),
  folderSelect: document.querySelector("#folderSelect"),
  counter: document.querySelector("#counter"),
  filename: document.querySelector("#filename"),
  details: document.querySelector("#details"),
  stage: document.querySelector("#stage"),
  preview: document.querySelector("#preview"),
  empty: document.querySelector("#empty"),
  debugLink: document.querySelector("#debugLink"),
  strip: document.querySelector("#strip"),
  prev: document.querySelector("#prev"),
  next: document.querySelector("#next"),
  reload: document.querySelector("#reload"),
  delete: document.querySelector("#delete"),
  undo: document.querySelector("#undo"),
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function currentFile() {
  return state.files[state.index];
}

function currentFolder() {
  return state.folders[state.folderIndex]?.path || "";
}

function setMessage(message) {
  els.preview.style.display = "none";
  els.preview.removeAttribute("src");
  els.stage.style.backgroundImage = "";
  if (state.livePreview) {
    state.livePreview.remove();
    state.livePreview = null;
  }
  els.debugLink.style.display = "none";
  els.empty.style.display = "block";
  els.empty.textContent = message;
}

function showPreview(url) {
  if (!state.livePreview) {
    state.livePreview = document.createElement("iframe");
    state.livePreview.title = "Preview";
    state.livePreview.setAttribute(
      "style",
      [
        "position:absolute",
        "inset:0",
        "display:block",
        "width:100%",
        "height:100%",
        "max-width:none",
        "max-height:none",
        "border:0",
        "background:#0b0b0b",
        "z-index:1",
      ].join(";"),
    );
    els.stage.prepend(state.livePreview);
  }
  state.livePreview.src = url;
  els.stage.style.backgroundImage = "";
  els.preview.style.display = "none";
  els.preview.removeAttribute("src");
  els.debugLink.href = url;
  els.debugLink.textContent = url.startsWith("data:") ? "data-url preview" : url;
  els.debugLink.style.display = "block";
  els.details.textContent = url.startsWith("data:") ? `JPEG data loaded (${Math.round(url.length / 1024)} KB)` : url;
  els.empty.style.display = "none";
}

window.addEventListener("error", (event) => {
  setMessage(`JavaScript error: ${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  setMessage(`JavaScript error: ${event.reason?.message || event.reason}`);
});

function updateMeta() {
  const file = currentFile();
  els.root.textContent = state.root || "-";
  els.counter.textContent = state.files.length ? `${state.index + 1} / ${state.files.length}` : "0 / 0";
  els.filename.textContent = file?.name || "-";
  els.details.textContent = file ? `${file.ext} · ${formatBytes(file.size)}` : "-";
  els.prev.disabled = state.index <= 0;
  els.next.disabled = state.index >= state.files.length - 1;
  els.delete.disabled = !file;
}

function renderFolderSelect() {
  els.folderSelect.textContent = "";
  for (const [index, folder] of state.folders.entries()) {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${folder.name} (${folder.count})`;
    els.folderSelect.append(option);
  }
  els.folderSelect.value = String(state.folderIndex);
}

function renderStrip() {
  els.strip.textContent = "";
  for (const [index, file] of state.files.entries()) {
    const row = document.createElement("button");
    row.className = `row${index === state.index ? " active" : ""}`;
    row.type = "button";
    row.dataset.index = String(index);
    row.innerHTML = `
      <span class="row-index">${String(index + 1).padStart(3, "0")}</span>
      <span class="row-name"></span>
      <span class="row-ext">${file.ext}</span>
    `;
    row.querySelector(".row-name").textContent = file.name;
    row.addEventListener("click", () => show(index));
    els.strip.append(row);
  }
}

async function loadFolders() {
  const response = await fetch("/api/folders", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "フォルダ一覧を取得できませんでした");
  state.root = data.root;
  state.folders = data.folders;
  if (state.folderIndex === 0 && state.folders.length > 1) {
    state.folderIndex = 1;
  } else {
    state.folderIndex = Math.min(state.folderIndex, Math.max(state.folders.length - 1, 0));
  }
  renderFolderSelect();
}

async function loadFiles(keepPath) {
  setMessage("画像フォルダを読み込み中");
  const folder = currentFolder();
  const response = await fetch(`/api/files?folder=${encodeURIComponent(folder)}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "ファイル一覧を取得できませんでした");

  state.root = data.root;
  state.files = data.files;
  const keepIndex = keepPath ? state.files.findIndex((file) => file.path === keepPath) : -1;
  state.index = keepIndex >= 0 ? keepIndex : Math.min(state.index, Math.max(state.files.length - 1, 0));
  renderStrip();
  updateMeta();
  if (state.files.length) {
    await show(state.index);
  } else {
    setMessage("表示できる画像がありません");
  }
}

async function selectFolder(index) {
  if (!state.folders.length) return;
  state.folderIndex = Math.max(0, Math.min(index, state.folders.length - 1));
  state.index = 0;
  renderFolderSelect();
  await loadFiles();
  els.folderSelect.blur();
}

function stepFolder(delta) {
  selectFolder(state.folderIndex + delta).catch((error) => setMessage(error.message));
}

async function show(index) {
  if (!state.files.length) {
    updateMeta();
    setMessage("表示できる画像がありません");
    return;
  }

  state.index = Math.max(0, Math.min(index, state.files.length - 1));
  const file = currentFile();
  const token = ++state.loadingToken;
  updateMeta();
  renderStrip();
  setMessage("プレビュー生成中");

  const url = `/api/preview-url?file=${encodeURIComponent(file.path)}&t=${encodeURIComponent(file.mtimeMs)}&v=${previewVersion}`;

  try {
    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `${response.status} ${response.statusText}`);
    }
    if (token !== state.loadingToken) return;
    const imageUrl = `${data.url}?v=${previewVersion}&_=${Date.now()}`;
    showPreview(imageUrl);
  } catch (error) {
    if (token !== state.loadingToken) return;
    setMessage(error.message || `プレビューを生成できませんでした: ${file.name}`);
  }
}

function step(delta) {
  if (!state.files.length) return;
  show(state.index + delta);
}

async function deleteCurrent() {
  const file = currentFile();
  if (!file) return;

  const response = await fetch("/api/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ file: file.path }),
  });
  const data = await response.json();
  if (!response.ok) {
    setMessage(data.error || "削除できませんでした");
    return;
  }

  state.files.splice(state.index, 1);
  state.index = Math.min(state.index, Math.max(state.files.length - 1, 0));
  renderStrip();
  updateMeta();
  show(state.index);
}

async function undo() {
  const response = await fetch("/api/undo", { method: "POST" });
  const data = await response.json();
  if (!response.ok) {
    setMessage(data.error || "取り消せませんでした");
    return;
  }
  await loadFolders();
  await loadFiles(data.restored);
}

els.prev.addEventListener("click", () => step(-1));
els.next.addEventListener("click", () => step(1));
els.reload.addEventListener("click", () => loadFiles(currentFile()?.path).catch((error) => setMessage(error.message)));
els.delete.addEventListener("click", deleteCurrent);
els.undo.addEventListener("click", undo);
els.folderSelect.addEventListener("change", () => selectFolder(Number(els.folderSelect.value)));

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === "ArrowLeft") step(-1);
  if (event.key === "ArrowRight") step(1);
  if (event.key.toLowerCase() === "k") step(-1);
  if (event.key.toLowerCase() === "j") step(1);
  if (event.key === "[" || event.code === "BracketLeft") stepFolder(-1);
  if (event.key === "]" || event.code === "BracketRight") stepFolder(1);
  if (event.key.toLowerCase() === "d") deleteCurrent();
  if (event.key.toLowerCase() === "u") undo();
  if (event.key.toLowerCase() === "r") loadFiles(currentFile()?.path).catch((error) => setMessage(error.message));
});

loadFolders()
  .then(() => loadFiles())
  .catch((error) => setMessage(error.message));
