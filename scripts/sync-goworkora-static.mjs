import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(repositoryRoot, "public/goworkora");
const artifactRoot = resolve(repositoryRoot, "github-pages-dist");
const checkOnly = process.argv.includes("--check");

async function fileDigests(root) {
  const digests = new Map();

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const contents = await readFile(absolutePath);
      const path = relative(root, absolutePath);
      digests.set(
        path,
        createHash("sha256").update(contents).digest("hex"),
      );
    }
  }

  await visit(root);
  return digests;
}

async function verifySynchronization() {
  const [sourceFiles, artifactFiles] = await Promise.all([
    fileDigests(sourceRoot),
    fileDigests(artifactRoot),
  ]);
  const mismatches = [];
  const paths = new Set([...sourceFiles.keys(), ...artifactFiles.keys()]);

  for (const path of [...paths].sort()) {
    if (!sourceFiles.has(path)) {
      mismatches.push(`extra artifact file: ${path}`);
    } else if (!artifactFiles.has(path)) {
      mismatches.push(`missing artifact file: ${path}`);
    } else if (sourceFiles.get(path) !== artifactFiles.get(path)) {
      mismatches.push(`content differs: ${path}`);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `GoWorkora static source and Pages artifact are out of sync:\n${mismatches.join("\n")}`,
    );
  }

  console.log(
    `GoWorkora static source and Pages artifact match (${sourceFiles.size} files).`,
  );
}

if (checkOnly) {
  await verifySynchronization();
} else {
  await rm(artifactRoot, { force: true, recursive: true });
  await mkdir(artifactRoot, { recursive: true });
  await cp(sourceRoot, artifactRoot, { recursive: true });
  await verifySynchronization();
}
