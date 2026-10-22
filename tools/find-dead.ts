// Dead-code detector (cleanup ticket 33, ADR-0012): a deterministic
// import-graph walk that lists provably-dead files and dependencies.
// "Provably-dead" = zero inbound references reachable from the entries.
//
// knip (see knip.json) is the CI-grade detector; this script is the local
// fallback that also runs in memory-tight sandboxes where knip's parser
// cannot allocate. Both must agree — the baseline report this writes is the
// deletion backlog reviewed in tickets 34/35.
//
// Run: npx bun tools/find-dead.ts            (human report)
//      npx bun tools/find-dead.ts --json     (machine report on stdout)

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, relative, dirname, resolve } from 'path';

const ROOT = resolve(import.meta.dir, '..');
const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js'];

const ENTRY_FILES = ['app/layout.tsx', 'app/page.tsx', 'server.js', 'electron/main.cjs', 'electron/preload.js'];
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'electron'];
const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
// Tooling referenced by build/config files rather than imports; binaries used in package.json scripts.
const TOOLING_DEPS = new Set([
  'tailwindcss', '@tailwindcss/postcss', 'autoprefixer', 'postcss', 'postcss-import',
  'tw-animate-css', 'eslint', 'eslint-config-next', '@typescript-eslint/parser',
  '@typescript-eslint/eslint-plugin', 'typescript', 'knip', 'bun', '@types/bun',
  'concurrently', 'cross-env', 'wait-on', 'electron', 'electron-builder',
  '@eslint/eslintrc', 'tw-animate-css', 'react-dom', 'react',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.git' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (SCAN_EXT.test(name)) out.push(p);
  }
  return out;
}

function listProjectFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    const p = join(ROOT, dir);
    if (existsSync(p)) files.push(...walk(p));
  }
  files.push(join(ROOT, 'server.js'));
  return files;
}

const importPatterns = [
  /(?:^|[\s;])import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
  /(?:^|[\s;])import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /(?:^|[^.\w])require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /(?:^|[\s;])export\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
];

function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const specs = new Set<string>();
  for (const re of importPatterns) {
    for (const m of src.matchAll(re)) specs.add(m[1]);
  }
  return [...specs];
}

function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null; // package import
  let base = spec.startsWith('@/')
    ? join(ROOT, spec.slice(2))
    : resolve(dirname(fromFile), spec);
  // extension-aware probing
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function scriptsText(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    return JSON.stringify(pkg.scripts ?? {});
  } catch {
    return '';
  }
}

function listEntries(): string[] {
  const entries = ENTRY_FILES.map((g) => join(ROOT, g)).filter((f) => existsSync(f));
  const apiDir = join(ROOT, 'app', 'api');
  if (existsSync(apiDir)) {
    for (const f of walk(apiDir)) if (f.endsWith('route.ts')) entries.push(f);
  }
  return entries;
}

function main() {
  const files = listProjectFiles();
  const fileSet = new Set(files);
  const entries = listEntries();
  const entrySet = new Set(entries);

  // BFS reachability
  const reached = new Set<string>(entries);
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const spec of importsOf(file)) {
      const target = resolveSpec(file, spec);
      if (target && fileSet.has(target) && !reached.has(target)) {
        reached.add(target);
        queue.push(target);
      }
    }
  }

  // bun test globs test files at runtime — they are entries, never dead.
  const isTest = (f: string) => f.includes('__tests__') || /\.(test|spec)\.[jt]sx?$/.test(f);
  for (const f of files) if (isTest(f)) reached.add(f);
  const deadFiles = files.filter((f) => !reached.has(f)).sort();

  // Dependency usage: any project file (dead or alive — a dep used only by a
  // dead file dies with that file in ticket batches; report deps of LIVE code
  // as the honest "unused dependency" signal) or package.json scripts.
  const scripts = scriptsText();
  const deps: string[] = (() => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    return Object.keys(pkg.dependencies ?? {});
  })();
  const liveFiles = files.filter((f) => reached.has(f));
  const importText = liveFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
  const deadDeps = deps.filter((dep) => {
    if (TOOLING_DEPS.has(dep)) return false;
    if (scripts.includes(`"${dep}"`) || scripts.includes(dep)) return false; // script binaries
    const re = new RegExp(`['"]${dep.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(/|['"])`);
    return !re.test(importText);
  }).sort();

  const report = {
    generatedAt: new Date().toISOString(),
    entries: entries.map((e) => relative(ROOT, e)),
    totalFiles: files.length,
    deadFiles: deadFiles.map((f) => relative(ROOT, f)),
    deadDependencies: deadDeps,
  };

  if (process.argv.includes('--check')) {
    // CI gate mode (ticket 42 / ADR-0012): fail when anything provably dead
    // re-enters the tree. The baseline is zero dead files, zero dead deps.
    const dead = report.deadFiles.length + report.deadDependencies.length;
    if (dead > 0) {
      console.log(JSON.stringify(report, null, 2));
      console.error(`\nDEAD-CODE GATE FAILED: ${report.deadFiles.length} dead file(s), ${report.deadDependencies.length} dead dependency(ies).`);
      process.exit(1);
    }
    console.log(`Dead-code gate: clean — ${report.totalFiles} files reachable, 0 dead files, 0 dead deps.`);
    process.exit(0);
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`# Dead-code baseline — ${report.generatedAt}`);
    console.log(`Entries: ${report.entries.join(', ')}`);
    console.log(`Project files: ${files.length}, reached: ${reached.size}, DEAD: ${deadFiles.length}`);
    console.log(`\n## Dead files (${deadFiles.length})\n`);
    for (const f of report.deadFiles) console.log(`- ${f}`);
    console.log(`\n## Dead dependencies (${deadDeps.length})\n`);
    for (const d of deadDeps) console.log(`- ${d}`);
  }
  process.exit(0);
}

main();
