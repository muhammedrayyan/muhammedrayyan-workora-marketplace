import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = resolve(repositoryRoot, "github-pages-dist");
const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "3001", 10);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".webp", "image/webp"],
]);

function sendError(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(message);
}

async function resolveRequestPath(pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const requestedPath = resolve(siteRoot, `.${decodedPath}`);

  if (requestedPath !== siteRoot && !requestedPath.startsWith(`${siteRoot}${sep}`)) {
    return { forbidden: true };
  }

  if (decodedPath === "/" || !extname(decodedPath)) {
    return { filePath: resolve(siteRoot, "index.html"), isHtml: true };
  }

  try {
    const fileStats = await stat(requestedPath);
    if (fileStats.isFile()) {
      return { filePath: requestedPath, isHtml: extname(requestedPath) === ".html" };
    }
  } catch {
    return { notFound: true };
  }

  return { notFound: true };
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendError(response, 405, "Method not allowed");
    return;
  }

  let resolvedPath;
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || host}`);
    resolvedPath = await resolveRequestPath(requestUrl.pathname);
  } catch {
    sendError(response, 400, "Bad request");
    return;
  }

  if (resolvedPath.forbidden) {
    sendError(response, 403, "Forbidden");
    return;
  }

  if (resolvedPath.notFound) {
    sendError(response, 404, "Not found");
    return;
  }

  const extension = extname(resolvedPath.filePath);
  response.writeHead(200, {
    "Cache-Control": resolvedPath.isHtml ? "no-store" : "no-cache",
    "Content-Type": contentTypes.get(extension) || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(resolvedPath.filePath)
    .on("error", () => sendError(response, 500, "Unable to read file"))
    .pipe(response);
});

server.listen(port, host, () => {
  console.log(`GoWorkora is running at http://${host}:${port}`);
});

function shutDown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
