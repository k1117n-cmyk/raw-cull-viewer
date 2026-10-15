import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rootArg = process.argv[2] || process.cwd();
const rootDir = path.resolve(rootArg);
const port = Number(process.env.PORT || 5173);

const cacheDir = path.join(rootDir, ".viewer-cache");
const fallbackTrashDir = path.join(rootDir, "trash");

const supportedExts = new Set([
  ".nef",
  ".nrw",
  ".arw",
  ".cr2",
  ".cr3",
  ".raf",
  ".rw2",
  ".orf",
  ".pef",
  ".dng",
  ".raw",
  ".sr2",
  ".srw",
  ".x3f",
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
]);

const mimeByExt = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".heic", "image/heic"],
  [".heif", "image/heif"],
]);

let lastDeleted = null;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function sendHtml(res, status, body) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isInsideRoot(filePath) {
  const relative = path.relative(rootDir, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveSafe(relativeFile) {
  if (!relativeFile || relativeFile.includes("\0")) {
    throw new Error("Invalid file");
  }
  const absolute = path.resolve(rootDir, relativeFile);
  if (!isInsideRoot(absolute)) {
    throw new Error("File is outside the selected folder");
  }
  return absolute;
}

function resolveFolderSafe(relativeFolder = "") {
  if (relativeFolder.includes("\0")) {
    throw new Error("Invalid folder");
  }
  const absolute = path.resolve(rootDir, relativeFolder || ".");
  if (!isInsideRoot(absolute)) {
    throw new Error("Folder is outside the selected root");
  }
  return absolute;
}

function toRelative(absolute) {
  return path.relative(rootDir, absolute);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function macTrashDirFor(filePath) {
  const parts = path.resolve(filePath).split(path.sep).filter(Boolean);
  const uid = typeof process.getuid === "function" ? process.getuid() : os.userInfo().uid;

  if (parts[0] === "Volumes" && parts[1]) {
    return path.join(path.sep, "Volumes", parts[1], ".Trashes", String(uid));
  }

  return path.join(os.homedir(), ".Trash");
}

async function listFiles(dir = rootDir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".viewer-") || entry.name === "trash") continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolute)));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!supportedExts.has(ext)) continue;

    const stat = await fs.stat(absolute);
    files.push({
      name: entry.name,
      path: toRelative(absolute),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      ext: ext.slice(1).toUpperCase(),
    });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

async function listFolders(dir = rootDir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const folders = [];
  let count = 0;

  for (const entry of entries) {
    if (entry.name.startsWith(".viewer-") || entry.name === "trash") continue;
    const absolute = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const child = await listFolders(absolute);
      count += child.count;
      folders.push(...child.folders);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (supportedExts.has(ext)) {
      count += 1;
    }
  }

  const relative = toRelative(dir);
  if (relative && count > 0) {
    folders.unshift({
      path: relative,
      name: relative,
      count,
    });
  }

  return { count, folders };
}

function previewBaseName(filePath, stat) {
  const source = `v900-ifd0-orientation:${filePath}:${stat.size}:${stat.mtimeMs}`;
  return createHash("sha1").update(source).digest("hex");
}

async function makePreviewWithSips(input, output) {
  await execFileAsync("/usr/bin/sips", ["-s", "format", "jpeg", "-Z", "900", input, "--out", output], {
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
}

async function readOrientation(input) {
  for (const tag of ["-IFD0:Orientation", "-Orientation"]) {
    try {
      const { stdout } = await execFileAsync("exiftool", ["-s3", tag, input], {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      });
      if (stdout.trim()) return stdout.trim();
    } catch {
      // Try the next orientation tag.
    }
  }
  return "";
}

function rotationArgsForOrientation(orientation) {
  if (orientation.includes("Rotate 270 CW")) return ["-rotate", "-90"];
  if (orientation.includes("Rotate 90 CW")) return ["-rotate", "90"];
  if (orientation.includes("Rotate 180")) return ["-rotate", "180"];
  return [];
}

async function makePreviewWithExiftool(input, output) {
  const tags = ["-JpgFromRaw", "-OtherImage", "-PreviewImage"];
  let lastError;
  const orientation = await readOrientation(input);

  for (const tag of tags) {
    const extracted = `${output}.extracted`;
    try {
      const { stdout } = await execFileAsync("exiftool", ["-b", tag, input], {
        encoding: "buffer",
        timeout: 30000,
        maxBuffer: 150 * 1024 * 1024,
      });

      if (stdout.length > 1024) {
        await fs.writeFile(extracted, stdout);
        await makePreviewWithMagick(extracted, output, orientation);
        await fs.rm(extracted, { force: true });
        return;
      }
    } catch (error) {
      await fs.rm(extracted, { force: true });
      lastError = error;
    }
  }

  throw lastError || new Error("ExifTool did not find an embedded preview");
}

async function makePreviewWithMagick(input, output, orientation = "") {
  await execFileAsync("magick", [
    input,
    "-auto-orient",
    ...rotationArgsForOrientation(orientation),
    "-resize",
    "900x900>",
    "-quality",
    "88",
    output,
  ], {
    timeout: 45000,
    maxBuffer: 1024 * 1024,
  });
}

async function makePreviewWithQuickLook(input, output) {
  const tempDir = path.join(cacheDir, `ql-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tempDir, { recursive: true });
  try {
    await execFileAsync("/usr/bin/qlmanage", ["-t", "-s", "900", "-o", tempDir, input], {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    const generated = await fs.readdir(tempDir);
    const candidate = generated.find((name) => /\.(png|jpg|jpeg)$/i.test(name));
    if (!candidate) throw new Error("Quick Look did not create a preview");
    await fs.copyFile(path.join(tempDir, candidate), output);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function previewFor(relativeFile) {
  const absolute = resolveSafe(relativeFile);

  await fs.mkdir(cacheDir, { recursive: true });
  const stat = await fs.stat(absolute);
  const jpgPreview = path.join(cacheDir, `${previewBaseName(absolute, stat)}.jpg`);

  if (!(await fileExists(jpgPreview))) {
    const attempts = [
      () => makePreviewWithExiftool(absolute, jpgPreview),
      () => makePreviewWithSips(absolute, jpgPreview),
      () => makePreviewWithQuickLook(absolute, jpgPreview),
      () => makePreviewWithMagick(absolute, jpgPreview),
    ];

    let lastError;
    for (const attempt of attempts) {
      try {
        await attempt();
        if (await fileExists(jpgPreview)) break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!(await fileExists(jpgPreview))) {
      throw lastError || new Error("Could not generate preview");
    }
  }

  return { path: jpgPreview, mime: "image/jpeg", relative: path.relative(cacheDir, jpgPreview) };
}

async function ensurePreview(relativeFile) {
  const preview = await previewFor(relativeFile);
  if (!preview.path.startsWith(cacheDir)) {
    return `/api/preview?file=${encodeURIComponent(relativeFile)}`;
  }
  return `/api/cache/${encodeURIComponent(preview.relative)}`;
}

async function previewData(relativeFile) {
  const preview = await previewFor(relativeFile);
  const data = await fs.readFile(preview.path);
  return {
    mime: preview.mime,
    dataUrl: `data:${preview.mime};base64,${data.toString("base64")}`,
  };
}

async function moveToTrash(relativeFile) {
  const absolute = resolveSafe(relativeFile);
  let trashDir = macTrashDirFor(absolute);

  try {
    await fs.mkdir(trashDir, { recursive: true });
  } catch {
    trashDir = fallbackTrashDir;
    await fs.mkdir(trashDir, { recursive: true });
  }

  const parsed = path.parse(absolute);
  let target = path.join(trashDir, parsed.base);
  let suffix = 1;
  while (await fileExists(target)) {
    target = path.join(trashDir, `${parsed.name}-${suffix}${parsed.ext}`);
    suffix += 1;
  }

  await fs.rename(absolute, target);
  lastDeleted = { from: absolute, to: target };
  return { deleted: toRelative(absolute), movedTo: toRelative(target) };
}

async function undoDelete() {
  if (!lastDeleted) throw new Error("Nothing to undo");
  if (await fileExists(lastDeleted.from)) throw new Error("Original path already exists");
  await fs.rename(lastDeleted.to, lastDeleted.from);
  const restored = toRelative(lastDeleted.from);
  lastDeleted = null;
  return { restored };
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const absolute = path.resolve(__dirname, "public", `.${requested}`);
  const publicDir = path.resolve(__dirname, "public");
  const relative = path.relative(publicDir, absolute);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    sendError(res, 403, "Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) {
      sendError(res, 404, "Not found");
      return;
    }
    const ext = path.extname(absolute).toLowerCase();
    res.writeHead(200, {
      "content-type": mimeByExt.get(ext) || "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(absolute).pipe(res);
  } catch {
    sendError(res, 404, "Not found");
  }
}

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname === "/api/files") {
      const folder = url.searchParams.get("folder") || "";
      const folderDir = resolveFolderSafe(folder);
      const stat = await fs.stat(folderDir);
      if (!stat.isDirectory()) {
        sendError(res, 400, "Not a folder");
        return;
      }
      sendJson(res, 200, { root: rootDir, folder, files: await listFiles(folderDir) });
      return;
    }

    if (url.pathname === "/api/folders") {
      const result = await listFolders();
      sendJson(res, 200, {
        root: rootDir,
        folders: [
          { path: "", name: "All folders", count: result.count },
          ...result.folders.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true })),
        ],
      });
      return;
    }

    if (url.pathname === "/api/preview") {
      const file = url.searchParams.get("file");
      const preview = await previewFor(file);
      res.writeHead(200, {
        "content-type": preview.mime,
        "cache-control": "no-store",
      });
      createReadStream(preview.path).pipe(res);
      return;
    }

    if (url.pathname === "/api/preview-url") {
      const file = url.searchParams.get("file");
      sendJson(res, 200, { url: await ensurePreview(file) });
      return;
    }

    if (url.pathname === "/api/preview-frame") {
      const file = url.searchParams.get("file");
      const imageUrl = await ensurePreview(file);
      sendHtml(
        res,
        200,
        `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #0b0b0b;
      }
      body {
        display: grid;
        place-items: center;
      }
      img {
        display: block;
        width: 100vw;
        height: 100vh;
        object-fit: contain;
      }
    </style>
  </head>
  <body>
    <img src="${escapeHtml(imageUrl)}" alt="">
  </body>
</html>`,
      );
      return;
    }

    if (url.pathname === "/api/preview-data") {
      const file = url.searchParams.get("file");
      sendJson(res, 200, await previewData(file));
      return;
    }

    if (url.pathname.startsWith("/api/cache/")) {
      const name = decodeURIComponent(url.pathname.slice("/api/cache/".length));
      if (!/^[a-f0-9]{40}\.jpg$/i.test(name)) {
        sendError(res, 404, "Not found");
        return;
      }
      const absolute = path.join(cacheDir, name);
      if (!(await fileExists(absolute))) {
        sendError(res, 404, "Not found");
        return;
      }
      res.writeHead(200, {
        "content-type": "image/jpeg",
        "cache-control": "no-store",
      });
      createReadStream(absolute).pipe(res);
      return;
    }

    if (url.pathname === "/api/delete" && req.method === "POST") {
      const body = await readJson(req);
      sendJson(res, 200, await moveToTrash(body.file));
      return;
    }

    if (url.pathname === "/api/undo" && req.method === "POST") {
      sendJson(res, 200, await undoDelete());
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    sendError(res, 500, error.message || "Unexpected error");
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

try {
  const rootStat = await fs.stat(rootDir);
  if (!rootStat.isDirectory()) {
    console.error(`Not a folder: ${rootDir}`);
    process.exit(1);
  }
} catch {
  console.error(`Folder does not exist: ${rootDir}`);
  console.error(`Usage: npm start -- "/path/to/your/raw-folder"`);
  process.exit(1);
}

const server = http.createServer(router);

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Try: PORT=${port + 1} npm start -- "${rootDir}"`);
  } else {
    console.error(error.message);
  }
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`RAW Cull Viewer`);
  console.log(`Folder: ${rootDir}`);
  console.log(`Open:   http://127.0.0.1:${port}`);
});
