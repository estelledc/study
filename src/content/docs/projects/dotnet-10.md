---
title: .NET 10 发布详解 — 零基础学习笔记
来源: https://devblogs.microsoft.com/dotnet/announcing-dotnet-10/
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
provenance: pipeline-v3
---

# .NET 10 发布详解 — 零基础学习笔记

## 什么是 .NET？先从一个厨房比喻说起

想象你要做一道菜，但每次都要自己造锅、自己磨刀、自己种菜。这太麻烦了。

.NET 就是帮你做好这一切的"预制厨房"。程序员不用从零开始写每一行代码，而是直接使用 .NET 提供的"调料包"（类库）、"灶台"（运行环境）和"菜谱"（开发工具），快速做出各种程序：网站、手机 App、桌面软件、AI 系统，全都行。

- **.NET** 是一个免费的、开源的开发平台，由微软维护
- **C#** 是 .NET 最常用的编程语言（类似写菜谱的步骤说明）
- 每次发布新版本（如 .NET 10），性能更快、更安全、功能更多

## .NET 10 是什么？

2025 年 11 月 11 日，微软正式发布了 .NET 10。这是微软最强大、最智能、最高效的一个版本。它有几个重要特点：

1. **长期支持（LTS）**：微软承诺支持 3 年，直到 2028 年 11 月 10 日。这意味着你可以放心在生产环境中使用，不用担心很快就不被支持了。
2. **速度更快**：官方称这是"历史上最快的 .NET 版本"。
3. **AI 深度集成**：从简单 AI 调用到多智能体系统，一站式支持。
4. **跨平台**：Windows、macOS、Linux 都能运行。

## 核心概念一：性能提升 — "更快的灶台"

### 比喻

想象以前的 .NET 是一个普通燃气灶，.NET 10 换成了"专业级火力灶台"。同样的菜，现在几分钟就出锅了，而且火候更稳定（内存占用更少）。

### 具体改进

- **JIT 编译器增强**：编译器把代码翻译成机器能懂的指令时，变得更加聪明，生成的代码更精简
- **AVX10.2 支持**：让 CPU 的向量计算单元发挥更大威力，特别适合处理大量数据的场景
- **内存管理优化**：垃圾回收（GC）暂停时间减少了 8-20%（GC 是自动清理不用的内存的"清洁工"）
- **NativeAOT 改进**：编译后的程序体积更小、启动更快

### 代码示例 1：C# 14 的"字段支持属性"

这是 .NET 10 带来新语言 C# 14 的一个核心特性。以前你要写一个属性（比如名字），需要手动写一个"备份变量"（ backing field ）。现在编译器自动生成，你只需写一行：

```csharp
// C# 14 的字段支持属性 — 编译器自动管理备份变量
public string Name
{
    get => field;
    set => field = value?.Trim() ?? string.Empty;
}
```

**逐行解释：**
- `get => field;` — 当别人读取 Name 时，返回备份变量 `field` 的值
- `set => field = value?.Trim() ?? string.Empty;` — 当别人设置 Name 时，先去掉首尾空格（Trim），如果值是 null，就变成空字符串

**日常类比：** 就像你有一个"姓名登记本"，以前你要自己准备一个"草稿本"来存放临时名字，现在编译器帮你准备了草稿本，你只管读写就行。

## 核心概念二：AI 多智能体系统 — "一群厨师一起做菜"

### 比喻

以前的 AI 调用就像一个厨师，你说什么他做什么。.NET 10 引入了"多智能体系统"——像一支厨师团队：有人负责写，有人负责审，有人负责装盘。各司其职，效率更高。

### 具体改进

- **Microsoft Agent Framework**：把 Semantic Kernel 和 AutoGen 合并为一个统一的 AI 开发框架
- **Workflow 模式**：顺序执行、并行执行、任务传递、群聊协作
- **MCP（模型上下文协议）**：让 AI 能安全地访问数据库、API、文件等外部资源
- **Microsoft.Extensions.AI**：一套统一接口，换一个 AI 提供商（如 OpenAI、Azure、Ollama）不用改代码

### 代码示例 2：用 .NET 10 创建 AI 多智能体工作流

```csharp
// 创建一个"写作"AI 智能体
AIAgent writer = new ChatClientAgent(
    chatClient,
    new ChatClientAgentOptions
    {
        Name = "Writer",
        Instructions = "Write engaging, creative stories."
    });

// 再创建一个"编辑"AI 智能体
AIAgent editor = new ChatClientAgent(chatClient, /* 其他配置 */);

// 把它们串成一条流水线：先写，再编
Workflow workflow = AgentWorkflowBuilder.BuildSequential(writer, editor);

// 把这个流水线变成一个可以被调用的智能体
AIAgent workflowAgent = await workflow.AsAgentAsync();

// 使用这个工作流智能体
var result = await workflowAgent.GenerateResponseAsync("请写一篇关于秋天的故事");
```

**逐行解释：**
- 前两行：创建两个 AI 智能体，一个叫 Writer（写作），一个叫 Editor（编辑）
- `Instructions` 参数就是给 AI 的"任务说明书"
- 第四行：`BuildSequential` 把两个智能体串成流水线——Writer 先输出，Editor 接着处理
- 第六行：把流水线变成一个可以被外部调用的"统一智能体"
- 最后一行：传入提示词，拿到最终结果（Writer 写的内容经过 Editor 的润色）

**日常类比：** 就像餐厅里，服务员接到订单后，先交给厨师做菜，再交给摆盘师美化，最后端给顾客。每一步都有专人负责，质量更高。

## 核心概念三：Blazor 状态持久化 — "记住你的购物车"

### 比喻

你逛超市时，如果走到一半网络断了，购物车里东西全没了，是不是很崩溃？.NET 10 的 Blazor 改进了这个问题——现在即使网络断了，再连上时购物车还在。

### 具体改进

- **声明式状态持久化**：用一个 `[PersistentState]` 标记就能保存状态
- **电路状态持久化**：网络断开时自动保存，重连后恢复
- **暂停和恢复电路**：不活跃的用户自动释放服务器资源

## 核心概念四：实体框架 Core 10 — "更聪明的数据仓库"

### 比喻

如果你的应用要存很多数据（比如用户信息、订单），EF Core 就是帮你管理仓库的"智能管家"。.NET 10 的管家学会了"AI 向量搜索"——不仅能精确查找，还能理解模糊的意思。

### 具体改进

- **向量搜索支持**：支持 SQL Server 2025 的 `vector` 类型，适合 AI 语义搜索
- **JSON 数据类型**：SQL Server 2025 的原生 JSON 类型，性能更高
- **复杂类型映射**：把嵌套对象映射到单个 JSON 列，查询更方便

### 代码示例 3：EF Core 10 的批量 JSON 更新

```csharp
// 批量更新博客文章中的"阅读量"字段（存储在 JSON 列中）
await context.Blogs.ExecuteUpdateAsync(s =>
    s.SetProperty(b => b.Details.Views, b => b.Details.Views + 1));
```

**逐行解释：**
- `ExecuteUpdateAsync` — 异步批量更新，不用先查出来再改再保存
- `SetProperty` — 指定要更新的属性
- `b => b.Details.Views + 1` — 把每条博客的 Views（浏览量）加 1
- 不需要加载整个文档，直接在数据库层面更新 JSON 字段

## 其他值得关注的改进

### C# 14 的其他亮点

| 特性 | 说明 | 类比 |
|------|------|------|
| `?.=` 空条件赋值 | `name?.= defaultValue` | 如果没值就自动填默认值 |
| 扩展属性/方法 | 可以给不属于自己的类型添加成员 | 给别人的书写"便签批注" |
| `Span<T>` 隐式转换 | 高性能内存操作更方便 | 不用搬箱子，直接看内容 |
| 部分属性和构造函数 | 把一个大文件拆成多个部分写 | 一本书分章节写 |

### ASP.NET Core 改进

- **自动内存池回收**：长运行的应用不再堆积无用内存
- **Passkey 支持**：密码登录变成生物识别（Face ID / 指纹）
- **服务器发送事件（SSE）**：一条连接实时推送数据（像推送通知）

### 工具改进

- **Visual Studio 2026**：AI 深度集成，智能调试、自适应粘贴、AI 性能分析器
- **dotnet CLI**：控制台应用直接生成容器镜像，不用写 Dockerfile
- **NuGet 安全增强**：默认审计传递依赖，自动发现漏洞包

## 总结：一句话记住 .NET 10

> .NET 10 是"史上最快"的 .NET，AI 深度集成，C# 14 让代码更简洁，长期支持到 2028 年。

## 关键数字

| 项目 | 数字 |
|------|------|
| NuGet 包数量 | 超过 47.8 万个 |
| NuGet 下载次数 | 超过 8000 亿次 |
| LTS 支持期限 | 3 年（到 2028 年 11 月 10 日） |
| 垃圾回收加速 | 8-20% |
| 最新 C# 版本 | C# 14 |
| 最新 F# 版本 | F# 10 |
| ASP.NET Core 版本 | ASP.NET Core 10 |
| EF Core 版本 | EF Core 10 |
| .NET MAUI 版本 | .NET MAUI 10 |
| Aspire 版本 | Aspire 13 |
| Visual Studio 版本 | Visual Studio 2026 |

## 下一步

- 访问 [.NET 10 官方下载页](https://get.dot.net/10) 安装
- 访问 [.NET Conf 2025](https://www.dotnetconf.net) 观看大会视频
- 访问 [C# 14 文档](https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-14) 深入学习
- 访问 [AI in .NET 文档](https://learn.microsoft.com/dotnet/ai/) 了解 AI 集成

## 学习回顾

本文从日常类比出发，介绍了 .NET 10 的四个核心概念：

1. **性能提升** — "更快的灶台"：JIT 编译器、内存管理、向量计算
2. **AI 多智能体** — "一群厨师"：Agent Framework、Workflow 模式、MCP 协议
3. **Blazor 状态持久化** — "记住购物车"：声明式标记、网络恢复
4. **EF Core 向量搜索** — "智能管家"：向量搜索、JSON 映射、批量更新

每个概念都配有代码示例和逐行解释，帮助你从零基础理解 .NET 10 的核心变化。
