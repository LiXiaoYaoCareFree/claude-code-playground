# Claude Code 记忆系统与上下文压缩集成指南

## 概述

本文档详细分析 Claude Code 2.1.88 中的记忆系统（Memory System）和上下文压缩系统（Context Compression），提供可集成到其他项目的核心架构、接口设计和实现建议。

## 一、记忆系统（Memory System）

### 1.1 四层架构设计

记忆系统采用分层优先级设计，从低到高加载：

| 层级 | 路径示例 | 说明 | 优先级 |
|------|----------|------|--------|
| **Managed** | `/etc/claude-code/CLAUDE.md` | 系统级全局指令（所有用户） | 最低 |
| **User** | `~/.claude/CLAUDE.md` | 用户私有全局指令（所有项目） | 中低 |
| **Project** | `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md` | 项目级指令（提交到代码库） | 中高 |
| **Local** | `CLAUDE.local.md` | 项目私有指令（不提交到代码库） | 最高 |

**加载规则**：
- 从当前工作目录向上遍历到根目录
- 离当前目录越近的文件优先级越高（后加载的覆盖先加载的）
- 支持 `.claude/rules/` 子目录中的条件规则文件

### 1.2 核心数据结构

```typescript
// 记忆文件类型
type MemoryType = 
  | 'Managed'    // 系统管理
  | 'User'       // 用户全局
  | 'Project'    // 项目级
  | 'Local'      // 项目私有
  | 'AutoMem'    // 自动记忆（实验性）
  | 'TeamMem';   // 团队记忆（实验性）

// 记忆文件信息
interface MemoryFileInfo {
  path: string;           // 文件绝对路径
  type: MemoryType;       // 文件类型
  content: string;        // 文件内容（已处理）
  parent?: string;        // 包含此文件的父文件路径（@include）
  globs?: string[];       // 条件规则的glob模式
  contentDiffersFromDisk?: boolean;  // 内容是否与磁盘不同（如去除了HTML注释）
  rawContent?: string;    // 原始磁盘内容（当contentDiffersFromDisk为true时）
}
```

### 1.3 核心函数与流程

#### `getMemoryFiles()` - 收集所有记忆文件
**位置**: `src/utils/claudemd.ts`
**功能**：
1. 按四层顺序遍历目录结构
2. 处理每个记忆文件（包括 `@include` 解析）
3. 应用条件规则过滤
4. 防止循环引用（最大深度5）

```typescript
async function getMemoryFiles(forceIncludeExternal: boolean = false): Promise<MemoryFileInfo[]>;
```

#### `processMemoryFile()` - 处理单个记忆文件
**功能**：
1. 读取文件内容
2. 解析 frontmatter（提取 `paths:` 字段用于条件规则）
3. 处理 `@include` 指令
4. 移除HTML注释（`<!-- ... -->`）
5. 处理特殊文件类型（AutoMem/TeamMem）

```typescript
async function processMemoryFile(
  filePath: string,
  type: MemoryType,
  processedPaths: Set<string>,
  includeExternal: boolean,
  depth: number = 0,
  parent?: string
): Promise<MemoryFileInfo[]>;
```

#### `getClaudeMds()` - 生成系统提示文本
**功能**：将 `MemoryFileInfo[]` 转换为可注入系统提示的格式化文本

```typescript
function getClaudeMds(
  memoryFiles: MemoryFileInfo[],
  filter?: (type: MemoryType) => boolean
): string;
```

**输出格式**：
```
Codebase and user instructions are shown below. Be sure to adhere to these instructions...

Contents of /path/to/CLAUDE.md (project instructions, checked into the codebase):

[文件内容]

Contents of /path/to/.claude/rules/frontend.md (project instructions, checked into the codebase):

[文件内容]
```

### 1.4 高级特性

#### 1.4.1 @include 指令
支持在文本节点中引用其他文件：
- `@path` - 相对当前文件目录
- `@./relative/path` - 相对路径
- `@~/home/path` - 用户主目录
- `@/absolute/path` - 绝对路径

**限制**：
- 仅支持文本文件扩展名（`.md`, `.txt`, `.js`, `.ts`, `.py` 等）
- 最大递归深度：5
- 防止循环引用

#### 1.4.2 条件规则
`.claude/rules/*.md` 文件可包含 frontmatter 定义适用路径：

```markdown
---
paths: src/**/*.ts, tests/**/*.ts
---
# 仅对TypeScript文件生效的规则
...
```

使用 `ignore()` 库进行glob模式匹配。

#### 1.4.3 排除配置
通过 `claudeMdExcludes` 设置排除特定路径：
```json
{
  "claudeMdExcludes": ["**/node_modules/**", "**/.git/**", "/tmp/**"]
}
```

#### 1.4.4 外部引用检测
默认禁止加载项目目录外的文件，需要用户显式批准。

### 1.5 集成接口

```typescript
// 核心API
export async function getMemoryFiles(): Promise<MemoryFileInfo[]>;
export function getClaudeMds(files: MemoryFileInfo[]): string;
export async function processMemoryFile(...): Promise<MemoryFileInfo[]>;

// 工具函数
export function isMemoryFilePath(filePath: string): boolean;
export function getLargeMemoryFiles(files: MemoryFileInfo[]): MemoryFileInfo[];
export function hasExternalClaudeMdIncludes(files: MemoryFileInfo[]): boolean;

// 缓存管理
export function clearMemoryFileCaches(): void;
export function resetGetMemoryFilesCache(reason?: InstructionsLoadReason): void;
```

## 二、上下文压缩系统（Context Compression）

### 2.1 三级压缩策略

| 级别 | 触发条件 | 动作 | 目标 |
|------|----------|------|------|
| **微压缩 (Microcompact)** | 每轮请求前 | 清理旧的工具结果 | 轻量级维护，避免缓存失效 |
| **自动压缩 (Autocompact)** | 令牌使用超过阈值 | 生成对话摘要 | 防止上下文溢出 |
| **全量压缩 (/compact)** | 用户手动触发 | 完整重构上下文 | 深度清理与重构 |

### 2.2 微压缩（Microcompact）

#### 2.2.1 缓存编辑（Cached Microcompact）
**目标**：删除旧工具结果而不使服务器端缓存前缀失效。

**适用条件**：
- 仅主线程（`querySource.startsWith('repl_main_thread')`）
- 支持缓存编辑的模型（如Claude 3.5 Sonnet）
- 工具结果数量超过 `triggerThreshold`（默认10）

**流程**：
1. 注册工具结果到状态跟踪器
2. 当工具数量超过阈值时，计算需要删除的最旧工具
3. 保留最近的 `keepRecent` 个工具（默认5）
4. 生成 `cache_edits` 块供API层使用

**可压缩工具**：
- `FILE_READ_TOOL_NAME`
- `SHELL_TOOL_NAMES`
- `GREP_TOOL_NAME`
- `GLOB_TOOL_NAME`
- `WEB_SEARCH_TOOL_NAME`
- `WEB_FETCH_TOOL_NAME`
- `FILE_EDIT_TOOL_NAME`
- `FILE_WRITE_TOOL_NAME`

#### 2.2.2 时间触发压缩
当上次助手消息时间超过 `gapThresholdMinutes`（默认30分钟）时：
1. 认为服务器缓存已失效
2. 内容清理旧的工具结果（保留最近N个）
3. 替换为 `[Old tool result content cleared]`

### 2.3 自动压缩（Autocompact）

#### 2.3.1 触发阈值计算
```typescript
// 有效上下文窗口 = 模型上下文窗口 - 输出保留空间
function getEffectiveContextWindowSize(model: string): number {
  const contextWindow = getContextWindowForModel(model);
  const reservedForSummary = Math.min(getMaxOutputTokensForModel(model), 20000);
  return contextWindow - reservedForSummary;
}

// 自动压缩阈值 = 有效窗口 - 缓冲区（默认13K）
function getAutoCompactThreshold(model: string): number {
  return getEffectiveContextWindowSize(model) - AUTOCOMPACT_BUFFER_TOKENS;
}

// 检查是否需要压缩
async function shouldAutoCompact(
  messages: Message[],
  model: string,
  querySource?: QuerySource,
  snipTokensFreed: number = 0
): boolean {
  const tokenCount = tokenCountWithEstimation(messages) - snipTokensFreed;
  const threshold = getAutoCompactThreshold(model);
  return tokenCount >= threshold;
}
```

#### 2.3.2 压缩流程
1. **优先尝试会话内存压缩**（实验特性）
2. **调用核心压缩函数**：
   ```typescript
   const compactionResult = await compactConversation(
     messages,
     toolUseContext,
     cacheSafeParams,
     true,                    // suppressUserQuestions（自动压缩不询问用户）
     undefined,               // customInstructions
     true,                    // isAutoCompact
     recompactionInfo         // 重新压缩信息
   );
   ```
3. **后处理**：
   - 重置会话内存ID
   - 运行清理函数
   - 更新缓存检测基线

#### 2.3.3 保护机制
- **连续失败断路器**：3次失败后停止尝试
- **上下文折叠兼容**：在Context Collapse模式下禁用自动压缩
- **来源过滤**：跳过 `session_memory`, `compact`, `marble_origami` 等特殊来源

### 2.4 全量压缩（/compact命令）

用户手动触发，支持：
- 自定义压缩指令
- 交互式确认（除非使用 `--yes`）
- 完整上下文重构

### 2.5 核心数据结构

```typescript
// 微压缩结果
interface MicrocompactResult {
  messages: Message[];
  compactionInfo?: {
    pendingCacheEdits?: {
      trigger: 'auto';
      deletedToolIds: string[];
      baselineCacheDeletedTokens: number;
    };
  };
}

// 自动压缩跟踪状态
interface AutoCompactTrackingState {
  compacted: boolean;           // 本轮是否已压缩
  turnCounter: number;          // 轮次计数器
  turnId: string;               // 唯一轮次ID
  consecutiveFailures?: number; // 连续失败次数
}

// 压缩结果
interface CompactionResult {
  messages: Message[];          // 压缩后的消息
  summary: string;              // 生成的摘要
  metadata: {
    tokensBefore: number;
    tokensAfter: number;
    model: string;
    // ...其他元数据
  };
}
```

### 2.6 集成接口

```typescript
// 微压缩
export async function microcompactMessages(
  messages: Message[],
  toolUseContext?: ToolUseContext,
  querySource?: QuerySource
): Promise<MicrocompactResult>;

// 自动压缩
export async function autoCompactIfNeeded(
  messages: Message[],
  toolUseContext: ToolUseContext,
  cacheSafeParams: CacheSafeParams,
  querySource?: QuerySource,
  tracking?: AutoCompactTrackingState,
  snipTokensFreed?: number
): Promise<{
  wasCompacted: boolean;
  compactionResult?: CompactionResult;
  consecutiveFailures?: number;
}>;

// 核心压缩
export async function compactConversation(
  messages: Message[],
  toolUseContext: ToolUseContext,
  cacheSafeParams: CacheSafeParams,
  suppressUserQuestions: boolean,
  customInstructions: string | undefined,
  isAutoCompact: boolean,
  recompactionInfo?: RecompactionInfo
): Promise<CompactionResult>;
```

## 三、系统集成指南

### 3.1 记忆系统集成步骤

#### 步骤1：实现文件收集器
```typescript
class MemorySystem {
  private async collectMemoryFiles(cwd: string): Promise<MemoryFileInfo[]> {
    // 1. 定义四层目录查找顺序
    const layers = ['managed', 'user', 'project', 'local'];
    
    // 2. 从cwd向上遍历到根目录
    const dirs = [];
    let currentDir = cwd;
    while (currentDir !== parse(currentDir).root) {
      dirs.push(currentDir);
      currentDir = dirname(currentDir);
    }
    
    // 3. 按优先级收集文件
    const files: MemoryFileInfo[] = [];
    
    // 4. 处理每个目录中的记忆文件
    for (const dir of dirs.reverse()) {
      // 检查 CLAUDE.md, .claude/CLAUDE.md, .claude/rules/*.md, CLAUDE.local.md
    }
    
    return files;
  }
}
```

#### 步骤2：实现@include解析器
```typescript
function parseIncludeDirectives(content: string, baseDir: string): string[] {
  // 使用marked库解析Markdown
  const lexer = new Lexer({ gfm: false });
  const tokens = lexer.lex(content);
  
  const includes: string[] = [];
  // 遍历tokens，在text节点中查找@path模式
  // 支持 @path, @./path, @~/path, @/path
  // 解析后转换为绝对路径
  
  return includes;
}
```

#### 步骤3：实现条件规则引擎
```typescript
function matchesConditionalRule(
  filePath: string,
  ruleGlobs: string[],
  baseDir: string
): boolean {
  const relativePath = relative(baseDir, filePath);
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return false;
  }
  
  const ig = ignore().add(ruleGlobs);
  return ig.ignores(relativePath);
}
```

#### 步骤4：添加缓存机制
```typescript
import memoize from 'lodash-es/memoize.js';

const getMemoryFiles = memoize(
  async (forceIncludeExternal: boolean = false): Promise<MemoryFileInfo[]> => {
    // 实际收集逻辑
  },
  // 自定义缓存键
  (forceIncludeExternal) => `${process.cwd()}:${forceIncludeExternal}`
);

// 清理缓存
function invalidateMemoryCache(): void {
  getMemoryFiles.cache?.clear?.();
}
```

### 3.2 压缩系统集成步骤

#### 步骤1：实现令牌计数
```typescript
function estimateTokenCount(messages: Message[]): number {
  let count = 0;
  
  for (const message of messages) {
    if (message.type === 'user' || message.type === 'assistant') {
      for (const block of message.content) {
        if (block.type === 'text') {
          count += roughTokenEstimate(block.text);
        } else if (block.type === 'tool_result') {
          count += estimateToolResultTokens(block);
        }
        // 处理其他块类型...
      }
    }
  }
  
  // 添加填充（保守估计）
  return Math.ceil(count * 1.33);
}
```

#### 步骤2：实现阈值管理
```typescript
class CompressionManager {
  private readonly AUTOCOMPACT_BUFFER = 13000;
  private readonly WARNING_BUFFER = 20000;
  private readonly MANUAL_BUFFER = 3000;
  
  constructor(private model: string, private contextWindow: number) {}
  
  getAutoCompactThreshold(): number {
    const effectiveWindow = this.contextWindow - this.getReservedOutputTokens();
    return effectiveWindow - this.AUTOCOMPACT_BUFFER;
  }
  
  shouldAutoCompact(currentTokens: number): {
    shouldCompact: boolean;
    percentLeft: number;
    isWarning: boolean;
    isCritical: boolean;
  } {
    const threshold = this.getAutoCompactThreshold();
    const warningThreshold = threshold - this.WARNING_BUFFER;
    const criticalThreshold = this.contextWindow - this.MANUAL_BUFFER;
    
    return {
      shouldCompact: currentTokens >= threshold,
      percentLeft: Math.max(0, Math.round(((threshold - currentTokens) / threshold) * 100)),
      isWarning: currentTokens >= warningThreshold,
      isCritical: currentTokens >= criticalThreshold,
    };
  }
}
```

#### 步骤3：实现微压缩策略
```typescript
class MicrocompactEngine {
  private toolResults = new Map<string, { timestamp: number; toolId: string }>();
  private readonly KEEP_RECENT = 5;
  private readonly TRIGGER_THRESHOLD = 10;
  
  registerToolResult(toolUseId: string, timestamp: number): void {
    this.toolResults.set(toolUseId, { timestamp, toolId: toolUseId });
  }
  
  getToolsToCompact(): string[] {
    if (this.toolResults.size <= this.TRIGGER_THRESHOLD) {
      return [];
    }
    
    // 按时间排序，保留最近的KEEP_RECENT个
    const sorted = Array.from(this.toolResults.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp);
    
    const toKeep = sorted.slice(0, this.KEEP_RECENT).map(([id]) => id);
    const toCompact = sorted.slice(this.KEEP_RECENT).map(([id]) => id);
    
    return toCompact;
  }
  
  applyCompaction(messages: Message[], toolsToCompact: string[]): Message[] {
    // 修改消息中的工具结果内容
    return messages.map(msg => {
      if (msg.type !== 'user') return msg;
      
      const newContent = msg.content.map(block => {
        if (block.type === 'tool_result' && toolsToCompact.includes(block.tool_use_id)) {
          return {
            ...block,
            content: '[Compacted tool result]',
          };
        }
        return block;
      });
      
      return { ...msg, content: newContent };
    });
  }
}
```

#### 步骤4：实现摘要生成
```typescript
async function generateConversationSummary(
  messages: Message[],
  model: string,
  systemPrompt: string
): Promise<{ summary: string; retainedMessages: Message[] }> {
  // 1. 选择要保留的关键消息（最近的工具使用、用户消息等）
  const retained = selectCriticalMessages(messages);
  
  // 2. 构建压缩提示
  const compressionPrompt = buildCompressionPrompt(messages, retained);
  
  // 3. 调用模型生成摘要
  const summary = await callModel({
    model,
    system: systemPrompt,
    messages: compressionPrompt,
    maxTokens: 20000,
  });
  
  // 4. 构建新的消息数组
  const newMessages = [
    // 可选：添加边界消息指示压缩发生
    createBoundaryMessage('Context compacted'),
    // 添加摘要消息
    createUserMessage(`Previous conversation summarized:\n\n${summary}`),
    // 添加保留的消息
    ...retained,
  ];
  
  return { summary, retainedMessages: newMessages };
}
```

### 3.3 配置常量参考

```typescript
// 记忆系统配置
const MEMORY_CONFIG = {
  MAX_MEMORY_CHARACTER_COUNT: 40000,  // 单个记忆文件最大字符数
  MAX_INCLUDE_DEPTH: 5,               // @include 最大递归深度
  TEXT_FILE_EXTENSIONS: new Set([     // 允许的文本文件扩展名
    '.md', '.txt', '.json', '.yaml', '.yml',
    '.js', '.ts', '.tsx', '.jsx',
    '.py', '.rb', '.go', '.rs', '.java',
    // ... 其他文本格式
  ]),
};

// 压缩系统配置
const COMPRESSION_CONFIG = {
  // 缓冲区大小（tokens）
  AUTOCOMPACT_BUFFER: 13000,
  WARNING_BUFFER: 20000,
  MANUAL_BUFFER: 3000,
  ERROR_BUFFER: 20000,
  
  // 微压缩配置
  MICROCOMPACT: {
    TRIGGER_THRESHOLD: 10,      // 触发压缩的工具数量
    KEEP_RECENT: 5,             // 保留最近的工具数量
    GAP_THRESHOLD_MINUTES: 30,  // 时间触发阈值
    MAX_CONSECUTIVE_FAILURES: 3, // 最大连续失败次数
  },
  
  // 输出保留
  MAX_OUTPUT_TOKENS_FOR_SUMMARY: 20000,
  
  // 模型特定配置
  MODEL_CONTEXT_WINDOWS: {
    'claude-3-5-sonnet-20241022': 200000,
    'claude-3-opus-20240229': 200000,
    'claude-3-haiku-20240307': 200000,
    'claude-2.1': 200000,
    // ... 其他模型
  },
};
```

## 四、核心文件映射

### 4.1 记忆系统文件
| 文件路径 | 主要功能 | 关键导出 |
|----------|----------|----------|
| `src/utils/claudemd.ts` | 记忆文件收集与处理 | `getMemoryFiles`, `getClaudeMds`, `processMemoryFile` |
| `src/context.ts` | 上下文构建 | `getUserContext`, `getSystemContext` |
| `src/memdir/` | 自动记忆系统 | `AutoMem` 相关功能 |
| `src/utils/frontmatterParser.ts` | Frontmatter解析 | `parseFrontmatter`, `splitPathInFrontmatter` |

### 4.2 压缩系统文件
| 文件路径 | 主要功能 | 关键导出 |
|----------|----------|----------|
| `src/services/compact/microCompact.ts` | 微压缩实现 | `microcompactMessages`, `estimateMessageTokens` |
| `src/services/compact/autoCompact.ts` | 自动压缩逻辑 | `autoCompactIfNeeded`, `shouldAutoCompact` |
| `src/services/compact/compact.ts` | 核心压缩函数 | `compactConversation` |
| `src/services/compact/sessionMemoryCompact.ts` | 会话内存压缩 | `trySessionMemoryCompaction` |
| `src/services/compact/cachedMicrocompact.ts` | 缓存编辑微压缩 | Cached MC 状态管理 |

### 4.3 工具与实用函数
| 文件路径 | 主要功能 |
|----------|----------|
| `src/utils/tokens.ts` | 令牌计数与估计 |
| `src/utils/analyzeContext.ts` | 上下文分析 |
| `src/utils/messages.ts` | 消息处理工具 |
| `src/utils/fileStateCache.ts` | 文件状态缓存 |

## 五、最佳实践与注意事项

### 5.1 记忆系统最佳实践

1. **合理组织记忆文件**：
   - 全局配置放在 `~/.claude/CLAUDE.md`
   - 项目通用规则放在 `CLAUDE.md`
   - 特定文件类型规则放在 `.claude/rules/` 子目录
   - 临时/本地配置放在 `CLAUDE.local.md`

2. **有效使用@include**：
   - 将通用规则提取到共享文件
   - 避免深层嵌套（最大深度5）
   - 使用绝对路径引用系统级配置

3. **条件规则优化**：
   - 为不同文件类型创建特定规则
   - 使用精确的glob模式减少误匹配
   - 定期审查规则文件大小

### 5.2 压缩系统最佳实践

1. **阈值调优**：
   - 根据模型能力调整缓冲区大小
   - 监控实际使用模式调整触发阈值
   - 考虑用户工作习惯设置时间触发阈值

2. **状态管理**：
   - 实现稳健的失败处理机制
   - 跟踪压缩历史避免循环压缩
   - 提供用户透明的压缩通知

3. **性能优化**：
   - 缓存令牌计数结果
   - 批量处理工具结果清理
   - 异步执行压缩操作

### 5.3 集成注意事项

1. **兼容性考虑**：
   - 检查目标平台的API支持情况
   - 提供降级方案（如缓存编辑不可用时）
   - 支持配置禁用特定功能

2. **错误处理**：
   - 文件系统错误（权限、不存在等）
   - API调用失败（网络、配额等）
   - 无效输入处理

3. **用户体验**：
   - 提供清晰的压缩指示
   - 允许用户控制压缩行为
   - 提供压缩历史查看功能

## 六、扩展与定制

### 6.1 自定义记忆源
```typescript
interface CustomMemorySource {
  name: string;
  priority: number; // 0-100，决定加载顺序
  getFiles(): Promise<MemoryFileInfo[]>;
  shouldInclude?(filePath: string): boolean;
}

class PluginMemorySystem {
  private sources: CustomMemorySource[] = [];
  
  registerSource(source: CustomMemorySource): void {
    this.sources.push(source);
    this.sources.sort((a, b) => a.priority - b.priority);
  }
  
  async getAllFiles(): Promise<MemoryFileInfo[]> {
    const allFiles: MemoryFileInfo[] = [];
    
    for (const source of this.sources) {
      const files = await source.getFiles();
      allFiles.push(...files);
    }
    
    return allFiles;
  }
}
```

### 6.2 自定义压缩策略
```typescript
interface CompressionStrategy {
  name: string;
  priority: number;
  
  shouldCompress(
    messages: Message[],
    tokenCount: number,
    contextWindow: number
  ): boolean;
  
  executeCompression(
    messages: Message[],
    context: CompressionContext
  ): Promise<CompressionResult>;
}

class AdaptiveCompressionEngine {
  private strategies: CompressionStrategy[] = [];
  
  async compactIfNeeded(messages: Message[]): Promise<Message[]> {
    const tokenCount = estimateTokenCount(messages);
    const contextWindow = getContextWindow();
    
    for (const strategy of this.strategies.sort((a, b) => b.priority - a.priority)) {
      if (strategy.shouldCompress(messages, tokenCount, contextWindow)) {
        return await strategy.executeCompression(messages, {
          tokenCount,
          contextWindow,
          // ... 其他上下文
        });
      }
    }
    
    return messages;
  }
}
```

## 总结

Claude Code 的记忆系统和上下文压缩系统体现了以下设计原则：

1. **渐进式处理**：从轻量级微压缩到完整摘要生成
2. **优先级分层**：记忆文件按层次组织，高优先级覆盖低优先级
3. **条件加载**：基于路径匹配的动态规则应用
4. **状态感知**：跟踪工具使用、压缩历史等状态
5. **用户可控**：提供手动触发和配置选项

集成到其他项目时，建议：
- 先实现核心功能，再添加高级特性
- 提供充分的配置选项
- 实现稳健的错误处理和降级方案
- 考虑性能影响，特别是文件系统操作

这些系统共同工作，为AI助手提供了持久的记忆能力和高效的上下文管理，是构建复杂AI应用的重要基础设施。