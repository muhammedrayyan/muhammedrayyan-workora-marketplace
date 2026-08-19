#!/usr/bin/env node

import { closeSync, openSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2] ?? "status";
const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "3001", 10);
const pidPath = `/tmp/goworkora-${port}.pid`;
const logPath = `/tmp/goworkora-${port}.log`;
const serverScript = resolve(repositoryRoot, "scripts/serve-goworkora.mjs");

function probe(timeoutMs = 800) {
  return new Promise((resolveProbe) => {
    const socket = createConnection({ host, port });
    const finish = (ready) => {
      socket.destroy();
      resolveProbe(ready);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function storedPid() {
  try {
    const value = Number.parseInt((await readFile(pidPath, "utf8")).trim(), 10);
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function processExists(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function status() {
  const ready = await probe();
  const pid = await storedPid();
  console.log(JSON.stringify({
    ready,
    url: `http://${host}:${port}`,
    pid: processExists(pid) ? pid : null,
    logPath,
  }, null, 2));
  return ready;
}

async function start() {
  if (await probe()) {
    console.log(`GoWorkora is already running at http://${host}:${port}`);
    return;
  }

  const oldPid = await storedPid();
  if (oldPid && !processExists(oldPid)) await rm(pidPath, { force: true });

  const logDescriptor = openSync(logPath, "a");
  const child = spawn(process.execPath, [serverScript], {
    cwd: repositoryRoot,
    detached: true,
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
    },
    stdio: ["ignore", logDescriptor, logDescriptor],
  });
  child.unref();
  closeSync(logDescriptor);
  await writeFile(pidPath, `${child.pid}\n`, { mode: 0o600 });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    if (await probe()) {
      console.log(`GoWorkora is running in the background at http://${host}:${port}`);
      console.log(`Server PID: ${child.pid}`);
      console.log(`Server log: ${logPath}`);
      return;
    }
    if (!processExists(child.pid)) break;
  }

  const details = await readFile(logPath, "utf8").catch(() => "");
  throw new Error(
    `GoWorkora did not start. Review ${logPath}.\n${details.slice(-2000)}`,
  );
}

async function stop() {
  const pid = await storedPid();
  if (!pid || !processExists(pid)) {
    await rm(pidPath, { force: true });
    console.log("GoWorkora background server is not running.");
    return;
  }
  process.kill(pid, "SIGTERM");
  await rm(pidPath, { force: true });
  console.log(`Stopped GoWorkora background server ${pid}.`);
}

if (!["start", "status", "stop"].includes(action)) {
  throw new Error("Usage: manage-goworkora-server.mjs <start|status|stop>");
}

if (action === "start") await start();
if (action === "status") {
  const ready = await status();
  if (!ready) process.exitCode = 1;
}
if (action === "stop") await stop();
