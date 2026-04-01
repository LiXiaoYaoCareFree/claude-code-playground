# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a source recovery of Claude Code 2.1.88, the official CLI for Claude. It's a TypeScript/React (Ink) TUI built with Bun, featuring an interactive agent loop, tool use, and Vim keybindings.

## Common Development Tasks

### Setup & Recovery
```bash
# Install Bun (if needed)
curl -LO https://github.com/oven-sh/bun/releases/latest/download/bun-darwin-aarch64.zip
unzip bun-darwin-aarch64.zip -d /tmp/bun && sudo cp /tmp/bun/bun-darwin-aarch64/bun /usr/local/bin/bun

# Install dependencies
bun install

# Apply recovery patches (creates stubs for private packages)
bun run setup:recovery
```

### Build
```bash
# Build the CLI (entrypoint: src/entrypoints/cli.tsx)
bun run build
# Output: dist/cli.js
```

### Run & Test
```bash
# Verify build
bun dist/cli.js --version
bun dist/cli.js --help
bun dist/cli.js
```

## Architecture

### Core Components
- **Entrypoint**: `src/entrypoints/cli.tsx` – fast‑path dispatcher for `--version`, `--daemon-worker`, `--claude-in-chrome-mcp`, etc.
- **Main Loop**: `src/main.js` – full CLI after flag detection.
- **Agent System**: `src/query.ts` (not present but referenced) – agent loop with tool execution and context compression.
- **TUI Framework**: `src/ink/` – custom Ink implementation for terminal UI (components, layout, rendering).
- **Vim Bindings**: `src/vim/` – motions, operators, text objects, and transition states.
- **Assistant**: `src/assistant/` – session history and related utilities.
- **Upstream Proxy**: `src/upstreamproxy/` – relay for external connections.
- **Bridge Mode**: `src/bridge/` – remote control feature.
- **Daemon**: `src/daemon/` – long‑running supervisor.

### Build System
- **Builder**: `build.ts` – uses `Bun.build` with feature‑flag detection (`feature('NAME')` macros).
- **Feature Flags**: Collected from source via regex; defaults defined in `build.ts`. Flags control inclusion of internal‑only code paths (e.g., `DAEMON`, `BRIDGE_MODE`, `BYOC_ENVIRONMENT_RUNNER`).
- **Macros**: `MACRO.VERSION`, `MACRO.BUILD_TIME` etc. are injected at build time via `define`.
- **External Stubs**: `scripts/setup-recovery.mjs` creates stub packages for private dependencies (`@ant/claude-for-chrome-mcp`, `@anthropic-ai/mcpb`, `@anthropic-ai/sandbox-runtime`, `color-diff-napi`, `modifiers-napi`).

### Key Patterns
- **Fast‑path loading**: Dynamic imports avoid loading full CLI for simple flags (`--version`, `--dump-system-prompt`).
- **System Prompt Caching**: `src/constants/prompts.js` (not present) – layered caching with static/dynamic boundary and hash‑based invalidation.
- **Tool Use**: Tools are defined in `src/tools/` (not present) and integrated via the agent loop.
- **Context Compression**: Messages are compressed when exceeding token limits (reference in docs/agent-architecture/).
- **Memory System**: Persistent file‑based memory at `~/.claude/projects/…/memory/` (see `src/utils/memory.js` if present).

## Code Style & Configuration

- **TypeScript**: `tsconfig.json` targets `ESNext` with `react-jsx`, `baseUrl: "."`, path alias `"src/*": ["src/*"]`.
- **No linting/test suite** in this recovery snapshot.
- **Imports**: Use ES modules (`import`/`export`); some internal modules use `.js` extension for TypeScript files (resolved by build plugin `alias-src`).

## Important Notes

- **Private Packages**: The recovery script stubs out internal Anthropic packages. Real functionality for sandboxing, MCP, etc. is unavailable.
- **Feature Gates**: Many code paths are guarded by `feature()` flags. Check `build.ts` for which flags are enabled (default: `BUILTIN_EXPLORE_PLAN_AGENTS`, `TOKEN_BUDGET` are `true`; others `false`).
- **External Build**: The `USER_TYPE` macro is set to `"external"`, which may disable certain internal‑only features.
- **Commander Patch**: `scripts/setup-recovery.mjs` patches `commander`’s short‑flag regex to allow flags like `-d2e`.

## Documentation

- `docs/agent-architecture/` contains detailed design notes on the agent loop, tool sandbox, sub‑agent design, task graph, system prompt, context compression, memory system, background jobs, and skills/MCP.
- `README.md` covers setup and recovery steps.

## Working with the Code

- To add a new feature flag, use `feature('FLAG_NAME')` in source; it will be auto‑detected by `build.ts` and default to `false`.
- To add a new fast‑path in `cli.tsx`, follow the pattern: check `args[0]`, `profileCheckpoint`, dynamic import, early `return`.
- The Ink TUI uses a custom reconciler (`src/ink/reconciler.ts`) and layout engine (Yoga). Components are in `src/ink/components/`.
- Vim bindings are implemented as a state machine in `src/vim/transitions.ts`.
