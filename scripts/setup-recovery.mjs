import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = process.cwd()

function ensureFile(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function ensureStubPackage(name, code) {
  const dir = join(root, 'node_modules', ...name.split('/'))
  ensureFile(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '0.0.0-stub',
        type: 'module',
        main: 'index.js'
      },
      null,
      2
    ) + '\n'
  )
  ensureFile(join(dir, 'index.js'), code.trim() + '\n')
}

ensureStubPackage(
  '@ant/claude-for-chrome-mcp',
  `
export const BROWSER_TOOLS = []
export function createClaudeForChromeMcpServer() {
  return { async start() {}, async close() {} }
}
`
)

ensureStubPackage(
  '@anthropic-ai/mcpb',
  `
export const McpbManifestSchema = {
  parse(value) { return value },
  safeParse(value) { return { success: true, data: value } }
}
export async function getMcpConfigForManifest() {
  return { mcpServers: {} }
}
`
)

ensureStubPackage(
  '@anthropic-ai/sandbox-runtime',
  `
export class SandboxViolationStore {
  add() {}
  clear() {}
  getViolations() { return [] }
}

export class SandboxManager {
  static isSupportedPlatform() { return true }
  static checkDependencies() { return { errors: [], warnings: [] } }
  static wrapWithSandbox(command, args = [], options = {}) { return { command, args, options } }
  static async initialize() {}
  static updateConfig() {}
  static async reset() {}
  static getFsReadConfig() { return null }
  static getFsWriteConfig() { return null }
  static getNetworkRestrictionConfig() { return null }
  static getIgnoreViolations() { return [] }
  static getAllowUnixSockets() { return true }
  static getAllowLocalBinding() { return true }
  static getEnableWeakerNestedSandbox() { return false }
  static getProxyPort() { return undefined }
  static getSocksProxyPort() { return undefined }
  static getLinuxHttpSocketPath() { return undefined }
  static getLinuxSocksSocketPath() { return undefined }
  static async waitForNetworkInitialization() {}
  static getSandboxViolationStore() { return new SandboxViolationStore() }
  static annotateStderrWithSandboxFailures(stderr) { return stderr }
  static cleanupAfterCommand() {}
  async initialize() {}
  async destroy() {}
}

export const SandboxRuntimeConfigSchema = {
  parse(value) { return value },
  safeParse(value) { return { success: true, data: value } }
}
`
)

ensureStubPackage(
  'color-diff-napi',
  `
export class ColorDiff {
  constructor() {}
  render() { return null }
}
export class ColorFile {
  constructor() {}
  render() { return null }
}
export function getSyntaxTheme() { return null }
`
)

ensureStubPackage(
  'modifiers-napi',
  `
export function getModifierState() { return {} }
`
)

const commanderPath = join(root, 'node_modules', 'commander', 'lib', 'option.js')
let commander = readFileSync(commanderPath, 'utf8')
commander = commander.replace(
  'const shortFlagExp = /^-[^-]$/;',
  'const shortFlagExp = /^-[^-]+$/;'
)
commander = commander.replace(
  'if (/^-[^-][^-]/.test(unsupportedFlag))',
  'if (/^-[^-][^-]/.test(unsupportedFlag) && !shortFlagExp.test(unsupportedFlag))'
)
writeFileSync(commanderPath, commander)

console.log('recovery setup complete')
