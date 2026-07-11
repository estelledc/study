---
title: fx — JSON 的交互式查看器（jq 的 TUI 表亲）
来源: https://github.com/antonmedv/fx
日期: 2026-05-30
分类: CLI
难度: 入门
---

## 是什么

fx 是 Anton Medvedev 在 2018 年发布、2022 年用 Go 重写的**终端交互式 JSON 查看器**。日常类比：

- **[[jq]]**：JSON 的 sed/awk —— 一条命令吐出过滤后的结果，**不交互**
- **fx**：JSON 的 less + 文件树 —— 在终端里**打开**一个大 JSON，方向键展开/折叠，斜杠搜索，`e`/`E` 全开全关
- **[[btop]] : top/htop = fx : jq** —— 都是给原本一次性输出的命令行工具加一层"可以点、可以滚、可以折"的 TUI 皮

最小例子：

```bash
curl -s https://api.github.com/repos/antonmedv/fx | fx
```

fx 立刻打开一个全屏 TUI：可折叠的 JSON 树，方向键导航，`e` 展开全部，`/` 搜索，`q` 退出。无参数时它就是 JSON 版的 less。

## 为什么重要

fx 在 19k+ stars 的位置不是偶然，原因有几层：

- **大 JSON 时代缺个交互入口**：API 响应、kubectl、AWS CLI 输出动辄 100KB ~ 几 MB，jq 一行命令打出来全是滚动屏幕的瀑布；fx 让你**先折叠看结构、再展开看细节**，认知负担直接降一档
- **和 [[jq]] / [[yq]] 是搭档不是替代**：jq/yq 是管道里的 filter，fx 是终点的 viewer —— 三者关系类似 grep + less 的关系，没有 fx 时人们用 `jq . | less`，但 less 不懂 JSON 结构
- **零配置上手**：`brew install fx` → `cat x.json | fx`，5 秒学会，比学 jq 的 DSL 门槛低 10 倍 —— 是 jq 的"前置入口工具"
- **单 Go 二进制 + 跨平台** —— 老版 Node.js 的发行包袱在 2022 重写后甩掉

如果说 [[jq]] 是从无到有造了"shell 里处理 JSON"这个场景，fx 是把这个场景**人性化** —— 让不会 jq 的人也能先看清 JSON 长什么样。

## 核心要点

fx 的心智模型可以拆成 **三层**：

1. **TUI viewer（默认模式）**：把 JSON 当文件树渲染。方向键 / `h` `l` 折叠展开，`e` 展开全部，`E` 全部折叠，`/` 搜索，`g/G` 跳到首尾，**空格是翻页不是折叠** —— 键位大体抄 vim/less，但空格语义不同，别按错。

2. **dig 路径（按 `.`）+ JS 管道（CLI 参数）**：TUI 里按 `.` 进入 dig，用模糊补全跳到某个 JSON 路径；真正做变换时，在命令行写 **JavaScript** 表达式（Go 版内嵌 goja），例如 `fx 'x.users.map(u => u.email)'`。它不是 jq DSL，也不是"按 . 打开 jq REPL"。

3. **管道模式（无 TTY 时）**：输出被重定向（`fx ... > out.json`）时自动切非交互，行为接近 pretty-print。脚本里能当 JSON 美化器用，不会卡在全屏 TUI。

三层叠加：调试时当 viewer，探索路径用 dig，批量变换用 JS 表达式；和 [[jq]] 仍是搭档——fx 看结构，jq 跑批。

## 实践案例

### 案例 1：打开一个大 API 响应

```bash
gh api repos/antonmedv/fx | fx
```

打开后是可折叠的 JSON 树。方向键浏览，看到 `owner` 是个对象，按 `l` 或 → 展开，再看到 `permissions`，再展开 —— 全程不需要写任何表达式。这是 fx 替代 `jq . | less` 的标准用法。

### 案例 2：和 [[jq]] 互补 —— fx 当前置探索器

实际工作流是这样：

```bash
# 第一步：先用 fx 探索结构
kubectl get pods -o json | fx

# 第二步：心里有数后，写 jq 一行抓字段
kubectl get pods -o json | jq '.items[] | {name: .metadata.name, status: .status.phase}'
```

fx 解决"我不知道这个 JSON 长什么样"的问题，jq 解决"我已经知道结构、要批量提字段"的问题。**先 fx 后 jq** 是最高效的组合。

### 案例 3：和 [[yq]] 联动看 K8s YAML

yq 把 YAML 转 JSON 后灌给 fx 交互浏览：

```bash
yq -o=json deployment.yaml | fx
```

K8s 的 manifest 嵌套深，YAML 直接读眼花，转成 JSON 用 fx 的折叠树看更清楚。这是 yq 文档里推荐的 debugging 模式之一。

### 案例 4：dig 跳路径 + CLI 用 JS 抽字段

```bash
# TUI：打开后按 . 进入 dig，输入 users → emails 之类路径，Tab 补全跳转
cat huge-config.json | fx

# 非交互：用 JavaScript 表达式抽字段（不是 jq 的 | map）
cat huge-config.json | fx 'x.users.map(u => u.email)'
```

跟做顺序：先 fx 打开看清结构 → dig 确认路径 → 再把同一路径写成 JS 表达式塞进管道。需要 jq 批处理时，把思路翻译成 jq 语法另跑。

### 案例 5：和 [[fzf]] / [[ripgrep]] 搭管道

```bash
rg --json "password" logs/ | fx
```

`rg --json` 输出换行分隔的 JSON 事件；fx 按多文档加载，方向键在条目间切换。适合审查日志里敏感字段命中，而不是替代 jq 做字段抽取。

## 踩过的坑

1. **同名工具混淆**：GitHub 上至少有 3 个叫 `fx` 的工具 —— Anton Medvedev 的这个 JSON viewer、一个前端 effects 库、一个 functional extensions 库。**认准 `antonmedv/fx`** —— Homebrew `brew install fx` 默认就是它，但 npm 上其他同名包多到要小心。

2. **Node 版和 Go 版并存**：2018-2022 是 Node.js 写的（npm 安装），2022 后官方主推 Go 版（brew/binary）。两版**功能基本一致但启动速度差 10 倍**（Go 二进制冷启 30ms，Node 版要起 V8 引擎要 200ms+）。建议直接装 Go 版。

3. **没 TTY 自动退化**：在 CI 或者输出被重定向时，fx 检测到没 TTY 就不进 TUI，行为变成 `jq .` —— 这点设计合理但**会让"为什么我看不到 UI"的初学者困惑半天**。检查 `tty -s` 状态。

4. **JS 表达式模式有安全风险**：fx 支持用 JS 函数当 filter（`fx 'x => x.users.length'`）。这意味着 **JSON 文件里的内容如果跟你的 filter 拼起来形成 JS 注入面**，理论上能跑任意代码。处理不可信 JSON 时尽量用 jq 模式或只读 viewer。

5. **大文件仍然一次性加载**：默认把整个 JSON 读进内存才开始渲染。打开 5GB JSON 会卡几秒甚至 OOM —— 流式打开要看 ndjson 模式或外部预处理（jq `--stream` 切片后再 fx）。

## 适用 vs 不适用场景

**适用**：
- 探索陌生 JSON 结构（API 响应、kubectl 输出、配置文件）
- 确认 JSON 路径后再写 jq/JS 批处理（先 dig 后管道）
- ndjson / `rg --json` 日志逐条交互查看
- 临时 pretty-print（管道末端 `... | fx` 在脚本里也能用）
- 教学场景 —— 比直接啃 jq DSL 友好，新人 5 分钟会浏览

**不适用**：
- CI/CD 自动化里抽字段 → 用 [[jq]]，无 TUI 开销
- YAML 直接处理 → 用 [[yq]]（先 yq 转 JSON 再 fx 也行，但多一步）
- 多 GB 流式处理 → fx 不擅长，用 jq `--stream`
- 需要 schema 校验 → 用 jsonschema / ajv
- 远程服务器无 TTY → 用 `jq . | less` 替代

## 历史小故事（可跳过）

- **2018**：Anton Medvedev 在 GitHub 发布 fx 1.0，Node.js 写的，配一个 30 秒的 GIF 演示 `cat data.json | fx`。HN 首页爆，第一周就 5k stars。
- **2019-2021**：稳定迭代，加 themes、搜索、JS 表达式 filter，10k+ stars。
- **2022**：官方宣布**完全用 Go 重写**，理由是单二进制、启动快、不依赖 Node runtime。Node 版仍可用但进入维护模式。
- **2023**：进入 Homebrew、apt、scoop、nix 默认仓库，K8s 圈口口相传"调试 JSON 用 fx"。
- **2024-2026**：19k+ stars，是 jq 之后最常被推荐的 JSON 工具；Anton 开始做 fx Pro（带 schema 推断的付费版）。

## 学到什么

1. **给老 CLI 加 TUI 是一个反复出现的成功 pattern** —— top → htop → btop，jq → fx，git → lazygit，docker → lazydocker。每个 CLI 工具都值得问一句"它的 TUI 在哪"。

2. **先看清结构再写表达式** —— jq/JS 难在"不知道 JSON 长什么样"；fx 的折叠树 + dig 把反馈环缩短到按键级，写管道之前先对齐路径。

3. **同生态做"探索版 + 批量版"组合** —— fx 不替代 jq：TUI 探索用 fx，稳定批处理仍用 jq。互补定位比正面竞争健康。

4. **Node → Go 的重写代价值不值** —— 2022 重写后用户从 npm 迁到 brew 经历了一次小阵痛，但启动速度从 200ms 降到 30ms，长期收益远大于一次性迁移成本。这是工具类项目"语言换跑道"的成功案例。

## 延伸阅读

- 官方站：[fx.wtf](https://fx.wtf)（一页文档全在这，5 分钟看完）
- GitHub README：[antonmedv/fx](https://github.com/antonmedv/fx)（GIF 演示直观）
- 作者博客：[medv.io](https://medv.io)（Anton 写的 fx 设计反思和重写故事）
- 同类对比：[jless](https://github.com/PaulJuliusMartinez/jless)（Rust 写的 fx 对手，键位更 vim）

## 关联

- [[jq]] —— 心智模型同源；fx 是 jq 的 TUI 前置入口，先 fx 探索再 jq 批量
- [[yq]] —— `yq -o=json | fx` 是看复杂 K8s manifest 的标准管道
- [[btop]] —— 同属"给老 CLI 加 TUI"的设计模式
- [[fzf]] —— ripgrep + jq + fzf + fx 是 DevOps 的 JSON 探索四件套
- [[ripgrep]] —— `rg --json | fx` 把搜索结果交互化
- [[claude-code]] —— Claude Code 在调试 API 响应时常推荐先 fx 探索再写 jq 表达式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[btop]] —— btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
- [[claude-code]] —— Claude Code — Anthropic 终端编程助手
- [[curlie]] —— curlie — curl 的能力 + HTTPie 的语法
- [[dasel]] —— dasel — 一把刀同时切 JSON / YAML / TOML / XML / CSV
- [[fzf]] —— fzf — 命令行模糊查找
- [[gron]] —— gron — 把 JSON 拍平成 grep 能吃的赋值行
- [[httpie]] —— HTTPie — curl 的人话版本
- [[jc]] —— jc — 把 100+ Unix 命令的输出一键 JSON 化
- [[jq]] —— jq — JSON 的 sed/awk
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep

