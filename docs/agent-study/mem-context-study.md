我想了解这个项目的记忆系统和上下文压缩部分的核心内容，接入到我的项目当中去，请你把这部分的核心代码和 
逻辑转进行讲解，，我可以接入到我自己的项目当中                                                         
                                                                                                       
  Searched for 8 patterns, read 6 files, listed 1 directory (ctrl+o to expand)                         
                                                                                 
⏺ 根据你的需求，我将Claude                                                                             
  Code中的记忆系统和上下文压缩系统的核心架构与逻辑梳理如下，便于你理解并集成到自己的项目中。           
                                                                                          
  一、记忆系统（Memory System）🧠                                                                      
                                                                                                       
  1. 四层架构                                                                                          
                                                                                                       
  记忆文件按优先级从低到高加载，优先级高的文件会覆盖优先级低的文件：                                   
                                                                                                       
  ┌─────────┬──────────────────────────────────────────────────┬────────────────────────────────┐      
  │  层级   │                     路径示例                     │              说明              │      
  ├─────────┼──────────────────────────────────────────────────┼────────────────────────────────┤      
  │ Managed │ /etc/claude-code/CLAUDE.md                       │ 系统级全局指令（所有用户）     │      
  ├─────────┼──────────────────────────────────────────────────┼────────────────────────────────┤
  │ User    │ ~/.claude/CLAUDE.md                              │ 用户私有全局指令（所有项目）   │      
  ├─────────┼──────────────────────────────────────────────────┼────────────────────────────────┤
  │ Project │ CLAUDE.md, .claude/CLAUDE.md, .claude/rules/*.md │ 项目级指令（提交到代码库）     │      
  ├─────────┼──────────────────────────────────────────────────┼────────────────────────────────┤      
  │ Local   │ CLAUDE.local.md                                  │ 项目私有指令（不提交到代码库） │      
  └─────────┴──────────────────────────────────────────────────┴────────────────────────────────┘      
                                                                                                       
  加载顺序：从当前目录向上遍历到根目录，离当前目录越近的文件优先级越高。
                                                                                                       
  2. 核心函数与流程                      
                                                                                                       
  getMemoryFiles() (src/utils/claudemd.ts)
  - 按四层顺序收集所有记忆文件                                                                         
  - 处理 @include 指令（支持 @path, @./relative, @~/home, @/absolute）
  - 防止循环引用（最大深度5）                                                                          
  - 支持条件规则（通过 frontmatter paths: 字段匹配特定文件路径）
                                                                                                       
  getClaudeMds() (src/utils/claudemd.ts) 
  - 将 MemoryFileInfo[] 拼接为最终注入系统提示的文本                                                   
  - 格式：Contents of <文件路径> (<类型说明>):\n\n<文件内容>                                           
  - 顶部添加提示：Codebase and user instructions are shown below. Be sure to adhere to these           
  instructions...                                                                                      
                                                                                                       
  getUserContext() (src/context.ts)                                                                    
  - 调用 getClaudeMds(filterInjectedMemoryFiles(await getMemoryFiles()))                               
  - 与 currentDate 一起作为用户上下文注入                                                              
                                                                                                       
  3. 关键特性                                                                                          
                                                                                                       
  - @include 指令：在文本节点中识别 @path 语法，解析并递归加载                                         
  - 条件规则：.claude/rules/*.md 文件可包含 frontmatter paths:                                         
  字段（glob模式），仅当目标文件路径匹配时才加载                                                       
  - 排除模式：通过 claudeMdExcludes 设置排除特定路径                                                   
  - 外部引用检测：警告或阻止加载项目目录外的文件                                                       
  - 自动记忆：AutoMem 和 TeamMem 特性提供跨会话持久化记忆                                              
                                         
  4. 可集成接口                                                                                        
                                                                                                       
  // 核心类型                                                                                          
  type MemoryType = 'Managed' | 'User' | 'Project' | 'Local' | 'AutoMem' | 'TeamMem';                  
                                                                                                       
  interface MemoryFileInfo {                                                                           
    path: string;                                                                                      
    type: MemoryType;                                                                                  
    content: string;                                                                                   
    parent?: string;        // 包含此文件的父文件路径                                                  
    globs?: string[];       // 条件规则的glob模式                                                      
  }                                                                                                    
                                                                                                       
  // 核心函数                                                                                          
  async function getMemoryFiles(): Promise<MemoryFileInfo[]>;      // 收集所有记忆文件                 
  function getClaudeMds(files: MemoryFileInfo[]): string;          // 生成提示文本                     
  async function processMemoryFile(path, type): MemoryFileInfo[];  // 处理单个文件（含@include）       
                                                                                                       
  二、上下文压缩系统（Context Compression）🗜️                                                           
                                                                                                       
  1. 三级压缩策略                                                                                      
                                                                                                       
  ┌───────────────┬───────────────────────────────────────┬───────────────────────────────────────┐    
  │     级别      │               触发条件                │                 动作                  │    
  ├───────────────┼───────────────────────────────────────┼───────────────────────────────────────┤ 
  │ 微压缩 (Micro │ 每轮请求前                            │ 清理旧的工具结果，使用缓存编辑（cache │    
  │ compact)      │                                       │ d microcompact）或时间触发            │ 
  ├───────────────┼───────────────────────────────────────┼───────────────────────────────────────┤    
  │ 自动压缩      │ 令牌使用超过阈值（默认：有效上下文窗  │ 调用模型生成摘要，替换历史消息        │
  │ (Autocompact) │ 口 - 13K tokens）                     │                                       │    
  ├───────────────┼───────────────────────────────────────┼───────────────────────────────────────┤    
  │ 全量压缩      │ 用户手动触发                          │ 完整上下文重构                        │
  │ (/compact)    │                                       │                                       │    
  └───────────────┴───────────────────────────────────────┴───────────────────────────────────────┘
                                                                                                       
  2. 微压缩（Microcompact）                                                                            
                                    
  目标：轻量级清理，避免无效缓存前缀重写。                                                             
                                                                                                       
  核心逻辑 (src/services/compact/microCompact.ts)：
  - 缓存编辑 (Cached MC)：通过 cache_edits API 删除工具结果而不使缓存失效                              
    - 跟踪已注册的工具结果                                               
    - 当数量超过 triggerThreshold 时，删除最旧的部分（保留 keepRecent 个）                             
    - 仅限主线程，支持特定模型                                            
  - 时间触发：当上次助手消息超过 gapThresholdMinutes（默认30分钟）时，内容清理旧工具结果               
  - 可压缩工具：文件读写、Shell、Grep、Glob、Web搜索等工具的结果                        
                                                                                                       
  3. 自动压缩（Autocompact）                                                                           
                                                                                                       
  触发条件 (src/services/compact/autoCompact.ts)：                                                     
  // 阈值计算                                                                                          
  function getAutoCompactThreshold(model: string): number {                                            
    const effectiveWindow = getEffectiveContextWindowSize(model);  // 模型上下文窗口 - 输出保留        
    return effectiveWindow - AUTOCOMPACT_BUFFER_TOKENS;  // 默认13K缓冲区                              
  }                                                                                                    
                                                                                                       
  // 检查是否需要压缩                                                                                  
  async function shouldAutoCompact(messages, model, querySource): boolean {                            
    const tokenCount = tokenCountWithEstimation(messages);                                             
    const threshold = getAutoCompactThreshold(model);                                                  
    return tokenCount >= threshold;                                                                    
  }                                                                                                    
                                                                                                       
  压缩流程：                                                                                           
  1. 优先尝试会话内存压缩（实验特性）                                                                  
  2. 调用 compactConversation() (src/services/compact/compact.ts)：                                    
    - 使用专用系统提示让模型总结对话历史                                                               
    - 保留最近的重要消息（工具使用、用户消息等）                                                       
    - 生成摘要并替换历史消息                                                                           
  3. 重置相关状态（会话内存ID、缓存检测基线）                                                          
                                                                                                       
  保护机制：                                                                                           
  - 连续失败断路器（默认3次失败后停止尝试）                                                            
  - 上下文折叠（Context Collapse）模式下禁用自动压缩                                                   
  - 特定查询来源（session_memory, compact, marble_origami）跳过                                        
                                                                                                       
  4. 全量压缩（/compact命令）                                                                          
                                                                                                       
  手动触发的完整压缩，流程与自动压缩类似，但：                                                         
  - 允许用户提供自定义指令                                                                             
  - 不抑制用户确认（除非设置 --yes）                                                                   
  - 调用相同的 compactConversation() 核心                                                              
                                                                                                       
  5. 可集成接口                                                                                        
                                         
  // 微压缩                                                                                            
  interface MicrocompactResult {                                                                       
    messages: Message[];                    // 可能被修改的消息                                        
    compactionInfo?: {                                                                                 
      pendingCacheEdits?: PendingCacheEdits; // 缓存编辑信息                                           
    };                                                                                                 
  }                                                                                                    
                                                                                                       
  async function microcompactMessages(messages, toolUseContext, querySource): MicrocompactResult;      
                                                                                                       
  // 自动压缩                                                                                          
  interface AutoCompactTrackingState {                                                                 
    compacted: boolean;           // 本轮是否已压缩                                                    
    turnCounter: number;          // 轮次计数器                                                        
    consecutiveFailures?: number; // 连续失败次数
  }                                                                                                    
                                                                                                       
  async function autoCompactIfNeeded(                                                                  
    messages,                                                                                          
    toolUseContext,                                                                                    
    cacheSafeParams,                                                                                   
    querySource,                                                                                       
    tracking,                                                                                          
    snipTokensFreed                                                                                    
  ): Promise<{                                                                                         
    wasCompacted: boolean;                                                                             
    compactionResult?: CompactionResult;                                                               
    consecutiveFailures?: number;                                                                      
  }>;                                                                                                  
                                                                                                       
  // 核心压缩函数                                                                                      
  async function compactConversation(                                                                  
    messages,                                                                                          
    toolUseContext,                                                                                    
    cacheSafeParams,                                                                                   
    suppressUserQuestions,  // 是否抑制用户确认                                                        
    customInstructions,     // 自定义压缩指令
    isAutoCompact,          // 是否为自动压缩                                                          
    recompactionInfo        // 重新压缩信息                                                            
  ): Promise<CompactionResult>;                                                                        
                                                                                                       
  三、集成建议                                                                                         
                                                                                                       
  记忆系统集成                                                                                         
                                                                                                       
  1. 实现文件收集器：仿照 getMemoryFiles 遍历目录，支持四层优先级                                      
  2. 支持@include指令：使用Markdown解析器提取 @path 引用                                               
  3. 条件规则引擎：集成 ignore 库匹配glob模式
  4. 缓存机制：使用 memoize 缓存文件读取结果，支持动态失效                                             
                                         
  压缩系统集成                                                                                         
                                                                                                       
  1. 令牌计数：实现 tokenCountWithEstimation 估计消息令牌使用                                          
  2. 阈值管理：根据模型上下文窗口设置合理的缓冲区（如13K）                                             
  3. 微压缩策略：对于支持缓存编辑的API，实现工具结果跟踪与清理                                         
  4. 摘要生成：设计系统提示让模型有效总结历史对话，保留关键信息                                        
  5. 状态管理：跟踪压缩状态，防止循环压缩和连续失败
                                                                                                       
  关键配置项                                                                                           
                                                                                                       
  // 记忆系统                                                                                          
  const MAX_MEMORY_CHARACTER_COUNT = 40000;  // 单个记忆文件最大字符数                                 
  const MAX_INCLUDE_DEPTH = 5;               // @include 最大递归深度                                  
                                                                                                       
  // 压缩系统                                                                                          
  const AUTOCOMPACT_BUFFER_TOKENS = 13000;   // 自动压缩缓冲区                                         
  const WARNING_THRESHOLD_BUFFER_TOKENS = 20000;  // 警告阈值缓冲区                                    
  const MANUAL_COMPACT_BUFFER_TOKENS = 3000; // 手动压缩缓冲区                                         
  const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3; // 最大连续失败次数                                  
                                                                                                       
  四、核心文件参考                                                                                     
                                                                                                       
  ┌──────────────────────────────────────────────┬──────────────────────────────────────────┐          
  │                     文件                     │                   功能                   │          
  ├──────────────────────────────────────────────┼──────────────────────────────────────────┤          
  │ src/utils/claudemd.ts                        │ 记忆文件收集、@include解析、条件规则处理 │          
  ├──────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ src/context.ts                               │ 用户上下文构建，调用记忆系统             │          
  ├──────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ src/services/compact/microCompact.ts         │ 微压缩实现（缓存编辑+时间触发）          │          
  ├──────────────────────────────────────────────┼──────────────────────────────────────────┤          
  │ src/services/compact/autoCompact.ts          │ 自动压缩触发逻辑与阈值计算               │          
  ├──────────────────────────────────────────────┼──────────────────────────────────────────┤          
  │ src/services/compact/compact.ts              │ 核心压缩函数 compactConversation         │          
  ├──────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ src/services/compact/sessionMemoryCompact.ts │ 会话内存压缩实验特性                     │          
  └──────────────────────────────────────────────┴──────────────────────────────────────────┘
                                                                                                       
  这些系统体现了渐进式压缩理念：优先低成本清理（微压缩），必要时生成摘要（自动压缩），用户可随时手动干
  预（全量压缩）。记忆系统则通过分层优先级和条件加载实现灵活的指令管理。    