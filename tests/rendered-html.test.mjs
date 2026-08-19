import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server routes the root URL into the GoWorkora application", async () => {
  const response = await render();
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location"), "http://localhost");
  assert.equal(location.pathname, "/goworkora/index.html");
  assert.equal(location.searchParams.get("__goworkora_route"), "/");
});

test("the hosted application shell is the branded GoWorkora experience", async () => {
  const html = await readFile(
    new URL("../public/goworkora/index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /<title>GoWorkora — Hire Better\. Work Smarter\.<\/title>/i,
  );
  assert.match(html, /Hire Better\./);
  assert.match(html, /name="application-name" content="GoWorkora"/);
  assert.match(html, /property="og:image" content="\.\/og\.png"/);
  assert.match(html, /href="\.\/icon\.svg"/);
  assert.match(html, /Find Talent/);
  assert.match(html, /Find Work/);
  assert.match(html, /__goworkora_route/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});
