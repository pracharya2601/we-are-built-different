#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const positional = args.filter((arg) => arg !== "--json");
const root = path.resolve(positional[0] ?? process.cwd());

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".vinext",
  ".wrangler",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);
const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const placeholderIdPattern = /00000000-0000-[0-9a-f]{4}-[0-9a-f]{4}-000000000000/i;

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  try {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
  } catch {
    return null;
  }
}

function readJson(relativePath) {
  const content = read(relativePath);
  if (content === null) {
    return null;
  }

  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function walk(directory, files = []) {
  if (files.length >= 2500) {
    return files;
  }

  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (files.length >= 2500) {
      break;
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name) && entry.name !== ".agents") {
        walk(absolutePath, files);
      }
      continue;
    }

    if (
      entry.isFile() &&
      sourceExtensions.has(path.extname(entry.name)) &&
      fs.statSync(absolutePath).size <= 512_000
    ) {
      files.push(absolutePath);
    }
  }

  return files;
}

function sorted(values) {
  return [...new Set(values)].sort();
}

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Project root is not a directory: ${root}`);
  process.exit(2);
}

const packageJson = readJson("package.json");
const dependencies = {
  ...(packageJson?.dependencies ?? {}),
  ...(packageJson?.devDependencies ?? {}),
};
const scripts = packageJson?.scripts ?? {};
const sourceFiles = walk(root);
const configuredBindingNames = [];
const runtimeEnvReferences = [];
const declaredEnvProperties = [];
let hasCloudflareWorkersImport = false;
let hasPlaceholderResourceId = false;

for (const file of sourceFiles) {
  const content = fs.readFileSync(file, "utf8");
  hasCloudflareWorkersImport ||= content.includes("cloudflare:workers");
  hasPlaceholderResourceId ||= placeholderIdPattern.test(content);

  for (const match of content.matchAll(
    /(?<!process\.)\benv\.([A-Z][A-Z0-9_]*)\b/g,
  )) {
    runtimeEnvReferences.push(match[1]);
  }

  for (const match of content.matchAll(
    /^\s{2,}([A-Z][A-Z0-9_]*)\??:\s*[^;]+;/gm,
  )) {
    declaredEnvProperties.push(match[1]);
  }

  for (const match of content.matchAll(/\bbinding:\s*["']([^"']+)["']/g)) {
    configuredBindingNames.push(match[1]);
  }
}

const envExample = read(".env.example") ?? "";
const environmentNames = sorted(
  [...envExample.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map(
    (match) => match[1],
  ),
);
const wranglerConfigs = [
  "wrangler.jsonc",
  "wrangler.json",
  "wrangler.toml",
].filter(exists);
const localRuntimeConfigs = [
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mts",
  "vite.config.mjs",
].filter(exists);
const migrationDirectories = ["drizzle", "migrations"].filter(exists);
const warnings = [];

if (wranglerConfigs.length === 0) {
  warnings.push(
    "No deployable Wrangler configuration was found; local emulation does not prove remote infrastructure is connected.",
  );
}
if (hasPlaceholderResourceId) {
  warnings.push(
    "A placeholder resource ID was detected; do not use it for remote operations.",
  );
}
if (migrationDirectories.length > 0 && !scripts["db:generate"]) {
  warnings.push(
    "A migration directory exists but package.json has no db:generate command.",
  );
}
if (exists(".openai/hosting.json")) {
  warnings.push(
    ".openai/hosting.json exists; follow the repository's Sites hosting workflow before changing deployment configuration.",
  );
}

const report = {
  projectRoot: root,
  packageName: packageJson?.name ?? null,
  framework: dependencies.vinext
    ? "vinext"
    : dependencies.next
      ? "next"
      : dependencies["@cloudflare/workers-types"]
        ? "cloudflare-worker"
        : "unknown",
  cloudflare: {
    detected:
      Boolean(dependencies.wrangler) ||
      Boolean(dependencies["@cloudflare/vite-plugin"]) ||
      hasCloudflareWorkersImport,
    wranglerVersion: dependencies.wrangler ?? null,
    deployableConfigs: wranglerConfigs,
    localRuntimeConfigs,
    workerEntryCandidates: [
      "worker/index.ts",
      "worker.ts",
      "src/index.ts",
      "src/worker.ts",
    ].filter(exists),
  },
  data: {
    drizzleDetected:
      Boolean(dependencies["drizzle-orm"]) ||
      exists("drizzle.config.ts") ||
      exists("drizzle.config.js"),
    migrationDirectories,
    generationCommand: scripts["db:generate"] ?? null,
  },
  bindings: {
    configuredNames: sorted(configuredBindingNames),
    declaredEnvProperties: sorted(declaredEnvProperties),
    runtimeEnvReferences: sorted(runtimeEnvReferences),
  },
  environmentExampleNames: environmentNames,
  verificationCommands: Object.fromEntries(
    ["typecheck", "test", "lint", "build"]
      .filter((name) => scripts[name])
      .map((name) => [name, scripts[name]]),
  ),
  warnings,
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`Infrastructure audit: ${report.packageName ?? path.basename(root)}`);
console.log(`Project root: ${report.projectRoot}`);
console.log(`Framework: ${report.framework}`);
console.log(
  `Cloudflare: ${report.cloudflare.detected ? "detected" : "not detected"}`,
);
console.log(
  `Deployable config: ${wranglerConfigs.join(", ") || "none"}`,
);
console.log(
  `Local runtime config: ${localRuntimeConfigs.join(", ") || "none"}`,
);
console.log(
  `Worker entry: ${report.cloudflare.workerEntryCandidates.join(", ") || "none"}`,
);
console.log(
  `Configured bindings: ${report.bindings.configuredNames.join(", ") || "none detected"}`,
);
console.log(
  `Declared Env properties: ${report.bindings.declaredEnvProperties.join(", ") || "none detected"}`,
);
console.log(
  `Runtime env references: ${report.bindings.runtimeEnvReferences.join(", ") || "none detected"}`,
);
console.log(
  `Environment example names: ${environmentNames.join(", ") || "none"}`,
);
console.log(
  `Migrations: ${migrationDirectories.join(", ") || "none"}${
    report.data.generationCommand
      ? ` (generate with: ${report.data.generationCommand})`
      : ""
  }`,
);

if (warnings.length === 0) {
  console.log("Warnings: none");
} else {
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}
