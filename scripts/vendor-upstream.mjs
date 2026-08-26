import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "opencode-original");
const upstreamMd = path.join(root, "UPSTREAM.md");
const repo = "https://github.com/anomalyco/opencode.git";

const args = process.argv.slice(2);
const refIdx = args.indexOf("--ref");
const ref = refIdx !== -1 ? args[refIdx + 1] : undefined;
const applyPatches = args.includes("--apply-patches");
let freshClone = false;

function git(cwd, ...argv) {
  return execFileSync("git", argv, { cwd, stdio: "pipe" }).toString();
}

function readPinnedSha() {
  if (!fs.existsSync(upstreamMd)) return undefined;
  const line = fs.readFileSync(upstreamMd, "utf8").match(/^pinned_sha:\s*([0-9a-f]{40})\s*$/m);
  return line?.[1];
}

function gitOrNull(cwd, ...argv) {
  try {
    return git(cwd, ...argv);
  } catch {
    return null;
  }
}

if (!fs.existsSync(path.join(target, ".git"))) {
  console.log(`Cloning ${repo} -> ${path.relative(root, target)}`);
  execFileSync("git", ["clone", "--filter=blob:none", repo, target], { stdio: "inherit" });
  freshClone = true;
}

let sha;
if (ref) {
  // Prefer a locally-resolvable ref (works for SHAs and already-fetched branches).
  sha = gitOrNull(target, "rev-parse", `${ref}^{commit}`)?.trim();
  if (!sha) {
    git(target, "fetch", "origin", ref);
    sha = git(target, "rev-parse", "FETCH_HEAD^{commit}").trim();
  }
} else {
  sha = readPinnedSha();
  if (!sha && freshClone) {
    // First run without --ref: pin whatever default branch origin gave us.
    sha = git(target, "rev-parse", "HEAD").trim();
  }
  if (!sha) {
    // Existing checkout but no UPSTREAM.md: resolve the remote default branch.
    const headRef = gitOrNull(target, "symbolic-ref", "refs/remotes/origin/HEAD")?.trim();
    const defaultBranch = headRef ? headRef.replace("refs/remotes/origin/", "") : undefined;
    if (!defaultBranch) {
      throw new Error("Cannot determine upstream default branch. Re-run with --ref <branch-or-sha>.");
    }
    git(target, "fetch", "origin", defaultBranch);
    sha = git(target, "rev-parse", `origin/${defaultBranch}`).trim();
  }
}
console.log(`Pinning upstream to ${sha}`);
// Local checkout when possible; fetch only if the object is missing.
if (!gitOrNull(target, "cat-file", "-e", `${sha}^{commit}`)) {
  git(target, "fetch", "origin", sha);
}
git(target, "checkout", "--detach", "--force", sha);

// The vendored app imports upstream-only deps (e.g. @sentry/solid); install them
// once per clean checkout so both tsc and Vite can resolve everything.
// Upstream is a Bun workspace (catalog:/bun.lock): honor its packageManager field
// and provision that exact Bun via npx; fall back to npm otherwise.
const skipInstall = args.includes("--skip-install");
const installStamp = path.join(target, "node_modules", ".vendor-install-ok");
if (!skipInstall && !fs.existsSync(installStamp)) {
  console.log("Installing upstream dependencies (one-time per clean checkout)...");
  const pkg = JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf8"));
  const pm = typeof pkg.packageManager === "string" ? pkg.packageManager : "";
  const bunVersion = pm.startsWith("bun@") ? pm.slice(4).split("+")[0] : undefined;
  const cmd = bunVersion ? "npx" : "npm";
  // --ignore-scripts: we only need module resolution for tsc/Vite. Native
  // postinstalls (e.g. tree-sitter-* node-gyp builds) are desktop/TUI-only.
  const argv = bunVersion
    ? ["-y", "-p", `bun@${bunVersion}`, "bun", "install", "--ignore-scripts"]
    : ["install", "--no-audit", "--no-fund", "--ignore-scripts"];
  execFileSync(cmd, argv, {
    cwd: target,
    stdio: "inherit",
    // Windows needs a shell to resolve npm.cmd/npx.cmd (Node >=18.20 blocks .cmd spawns).
    shell: process.platform === "win32",
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
  });
  fs.writeFileSync(installStamp, `${new Date().toISOString()}\n`);
}

const date = git(target, "show", "-s", "--format=%cs", sha).trim();
fs.writeFileSync(
  upstreamMd,
  [
    `pinned_sha: ${sha}`,
    `pinned_ref_date: ${date}`,
    "",
    "# Upstream: https://github.com/anomalyco/opencode",
    "# Bump with: node scripts/vendor-upstream.mjs --ref <branch-or-sha> --apply-patches",
    "# Skip dep install with --skip-install.",
    "",
  ].join("\n"),
);
console.log(`Wrote ${path.relative(root, upstreamMd)}`);

const patchesDir = path.join(root, "patches");
if (applyPatches && fs.existsSync(patchesDir)) {
  const patches = fs
    .readdirSync(patchesDir)
    .filter((name) => name.endsWith(".patch"))
    .sort();
  for (const name of patches) {
    const file = path.join(patchesDir, name);
    git(target, "apply", "--check", file); // throws with diff details on conflict
    git(target, "apply", file);
    console.log(`Applied patches/${name}`);
  }
}
console.log("Vendor complete. Run: npm run build");
