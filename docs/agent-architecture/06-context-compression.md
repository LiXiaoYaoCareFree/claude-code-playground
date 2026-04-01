# 06. 上下文压缩：微压缩 → 自动压缩 → 全量压缩 🗜️

## 🎯 整体架构

当前实现可以映射为三级压缩策略：

1. **微压缩（Microcompact）**：每轮请求前，先做轻量削减。
2. **自动压缩（Autocompact）**：当上下文压力上升时生成摘要化结果。
3. **全量压缩（/compact）**：人工触发，进行更彻底的上下文重构。

## 🔄 运行流程

```mermaid
flowchart TD
  A[进入query循环] --> B[microcompact]
  B --> C[context collapse投影视图]
  C --> D[autocompact]
  D --> E{是否压缩成功}
  E -- 是 --> F[写入摘要与边界]
  E -- 否 --> G[继续原上下文]
  H[/compact命令] --> I[session-memory or full compact]
```

## 🧩 设计要点

- 微压缩先于自动压缩执行，优先尝试低成本减重。
- cached microcompact 仅主线程开启，避免 fork 线程污染全局状态。
- collapse 在 autocompact 前运行，能减少“过早大摘要”带来的信息损失。
- `/compact` 作为人工兜底，适合长会话清理。

## 💻 代码举例

```ts
const microcompactResult = await deps.microcompact(messagesForQuery, toolUseContext, querySource)
messagesForQuery = microcompactResult.messages

const { compactionResult } = await deps.autocompact(
  messagesForQuery,
  toolUseContext,
  compactParams,
  querySource,
  tracking,
  snipTokensFreed,
)
```

```ts
if (feature('CACHED_MICROCOMPACT') && isMainThreadSource(querySource)) {
  return await cachedMicrocompactPath(messages, querySource)
}
```

## 🛠 持续更新

- 新增压缩触发条件时补充阈值说明。
- 压缩失败恢复路径变更时同步更新。
- 对“压缩质量 vs 上下文长度”策略保留版本记录。
