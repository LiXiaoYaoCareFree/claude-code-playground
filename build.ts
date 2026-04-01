import { readdirSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = process.cwd()
const srcRoot = join(root, 'src')
const distDir = join(root, 'dist')

function walk(dir: string, out: string[]) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) {
      walk(p, out)
      continue
    }
    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) out.push(p)
  }
}

function collectFeatures() {
  const files: string[] = []
  walk(srcRoot, files)
  const features = new Set<string>()
  const featureRe = /feature\(\s*['"]([A-Z0-9_]+)['"]\s*\)/g
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    for (const m of content.matchAll(featureRe)) features.add(m[1])
  }
  return [...features].sort()
}

const features = collectFeatures()
const featureDefaults: Record<string, boolean> = Object.fromEntries(features.map((f) => [f, false]))
for (const key of ['BUILTIN_EXPLORE_PLAN_AGENTS', 'TOKEN_BUDGET']) {
  if (key in featureDefaults) featureDefaults[key] = true
}

const define: Record<string, string> = {
  'MACRO.VERSION': JSON.stringify('2.1.88'),
  'MACRO.BUILD_TIME': JSON.stringify(new Date().toISOString()),
  'MACRO.PACKAGE_URL': JSON.stringify('https://registry.npmjs.org/@anthropic-ai/claude-code'),
  'MACRO.NATIVE_PACKAGE_URL': JSON.stringify('https://registry.npmjs.org/@anthropic-ai/claude-code'),
  'MACRO.VERSION_CHANGELOG': JSON.stringify('https://github.com/anthropics/claude-code/releases'),
  'MACRO.ISSUES_EXPLAINER': JSON.stringify('https://github.com/anthropics/claude-code/issues'),
  'MACRO.FEEDBACK_CHANNEL': JSON.stringify('https://github.com/anthropics/claude-code/issues'),
  USER_TYPE: JSON.stringify('external')
}

for (const [flag, enabled] of Object.entries(featureDefaults)) {
  define[flag] = enabled ? 'true' : 'false'
}

const externals = [
  '@anthropic-ai/sandbox-runtime',
  '@anthropic-ai/mcpb',
  '@ant/claude-for-chrome-mcp',
  'modifiers-napi',
  'color-diff-napi',
  'audio-capture-napi',
  'image-processor-napi',
  'url-handler-napi'
]

function resolveJsLikePath(path: string) {
  if (path.endsWith('.js')) {
    const tsPath = path.slice(0, -3) + '.ts'
    if (existsSync(tsPath)) return tsPath
    const tsxPath = path.slice(0, -3) + '.tsx'
    if (existsSync(tsxPath)) return tsxPath
  }
  return path
}

if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true })
mkdirSync(distDir, { recursive: true })

const result = await Bun.build({
  entrypoints: [join(srcRoot, 'entrypoints', 'cli.tsx')],
  outdir: distDir,
  target: 'bun',
  format: 'esm',
  sourcemap: 'external',
  minify: false,
  splitting: false,
  define,
  external: externals,
  plugins: [
    {
      name: 'alias-src',
      setup(build) {
        build.onResolve({ filter: /^src\// }, (args) => {
          const abs = resolve(join(root, args.path))
          return { path: resolveJsLikePath(abs) }
        })
        build.onResolve({ filter: /^\.{1,2}\// }, (args) => {
          if (!args.importer || !args.path.endsWith('.js')) return
          const abs = resolve(dirname(args.importer), args.path)
          return { path: resolveJsLikePath(abs) }
        })
      }
    }
  ],
  banner: '#!/usr/bin/env bun'
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

console.log(`build success: ${result.outputs.length} files`)
