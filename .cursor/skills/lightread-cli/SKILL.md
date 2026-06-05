---
name: lightread-cli
description: Use LightRead CLI (`lr`) for academic paper search, web reading, library management, notes, memos, citation formatting, daily paper workflows, and paper graph analysis. Apply when the user asks to use `lr`, search papers, read a web page, import or inspect LightRead resources, manage notes or memories, build or inspect paper graphs, or format citations.
---

# LightRead CLI Skill

> 当前 URL 使用 `skills.md`，只是为了方便通过浏览器或 `curl` 读取。真正安装到 Agent 系统时，应把本文件内容保存为 `lightread-cli/SKILL.md`，并放到对应平台的 skills 目录，或通过该平台的 Skill 导入入口导入。

## 何时使用

当用户要做以下事情时，优先考虑 `lr`：

- 搜索论文、筛选高引论文、导出 BibTeX
- 读取网页正文并转成 Markdown 或纯文本
- 查看、导入、搜索、移动、下载 LightRead 资料库资源
- 管理文件夹、标签、笔记、记忆
- 构建或查看论文关系图谱任务
- 打开 LightRead Web 页面、获取每日推荐、格式化引用

## 安装

```bash
# 全局安装（推荐优先用 Bun，国内网络通常更省事）
bun add -g lightread-cli

# 其他方式（任选其一）
yarn global add lightread-cli
# 或
npm install -g lightread-cli

# 验证
lr --version
```

## 安装到常见 Agent 系统

将本文件内容保存为目录 `lightread-cli/` 下的 `SKILL.md`，再按当前 Agent 系统放到正确位置：

- Cursor 项目级：`.cursor/skills/lightread-cli/SKILL.md`
- Cursor 全局：`~/.cursor/skills/lightread-cli/SKILL.md`
- Claude Code 项目级：`.claude/skills/lightread-cli/SKILL.md`
- Claude Code 全局：`~/.claude/skills/lightread-cli/SKILL.md`
- OpenClaw workspace：`/skills/lightread-cli/SKILL.md`
- OpenClaw 本机共享：`~/.openclaw/skills/lightread-cli/SKILL.md`
- Antigravity workspace：`.agent/skills/lightread-cli/SKILL.md`
- Antigravity 全局：`~/.gemini/antigravity/skills/lightread-cli/SKILL.md`
- Manus 桌面端：先创建本地目录 `lightread-cli/SKILL.md`，然后在 Skills 页面使用 `Upload a skill` 上传该文件夹、`.zip` 或 `.skill`；也可以通过 `Import from GitHub` 导入。Manus 不要求你手动写入固定隐藏目录

安装完成后，再在对应 Agent 中使用该 Skill；若平台支持自动触发，可让模型自行判断何时加载；若平台主要通过 slash 命令使用，则可手动调用 `lightread-cli`。

### 源码本地安装（开发环境）

```bash
yarn install
yarn build
bun install -g .

lr --version
```

## 认证

推荐先登录，再校验状态：

```bash
lr auth login
lr auth status --verify --format json
```

如果已经在 LightRead 网页端创建了 CLI API Key，也可以直接设置：

```bash
lr auth key set <your-api-key>
lr auth status --verify --format json
```

也支持环境变量：

```bash
export LR_API_KEY=lr_xxx
```

## Agent 工作规则

1. 自动化或脚本场景，优先显式加 `--format json`。
2. 很多命令会把进度、提示、警告打印到 `stderr`，真正可解析结果在 `stdout`。
3. 需要最终完成态时，优先使用 `--wait` 或 `watch`，不要只拿到“任务已创建”就停止。
4. 搜索论文时，英文关键词通常比中文更稳定。
5. 删除、覆盖、移动等有副作用的命令，只有在用户意图明确时才加 `-y`。
6. `lr open` 默认会打开系统浏览器；如果只需要 URL，必须加 `--no-browser`。
7. `lr library download`、`lr read -o`、`lr web fetch --out`、`lr completion --install` 会打开浏览器、写文件或修改 shell 配置，执行前要明确目标。
8. 不要编造不存在的子命令；以当前 CLI 实际实现为准。

## 全局输出约定

### 默认输出格式

- 大多数基于 `BaseCommand` 的命令，在终端 TTY 中默认输出 `table`
- 当 `stdout` 不是 TTY（例如管道或重定向）时，默认输出 `json`
- 为了稳定，Agent 仍然建议显式加 `--format json`

### 常见输出格式

| 格式 | 含义 |
|------|------|
| `json` | 结构化结果，最适合 Agent 和脚本 |
| `table` | 终端表格，适合人工阅读 |
| `csv` | 方便导出到表格工具 |
| `md` | Markdown 展示结果 |
| `bibtex` | 论文引用条目 |
| `plain` | 纯文本摘要式输出 |

### 最适合默认 JSON 的命令

- `lr auth status --verify`
- `lr search ...`
- `lr library ls/search/semantic-search/grep/info/storage/tree/graph`
- `lr note list/read/create`
- `lr memo list/search/add`
- `lr checkin status`
- `lr papers today/dates`
- `lr graph search/build/show/list`
- `lr cite format`
- `lr read <url> --format json`
- `lr web fetch ... --format json`

### 长时间阻塞命令

- `lr agent`
- `lr agent --interactive`
- `lr library import <url>`（URL 解析本身带轮询）
- `lr library import <url> --wait`
- `lr graph build <openalex-id> --wait`
- `lr graph watch <task-id>`

## 命令说明

### `lr auth`

`lr auth login [--email ... --password ...]`  
输出：人类可读登录结果、复用或新建 API Key 的信息；无 `json` 输出；可能进入交互式选择。  
适用：首次配置认证，或要重新登录。

`lr auth status [--verify] --format json`  
输出：JSON 对象，通常包含 `configured`、`api_key`（脱敏预览）、`server`；加 `--verify` 后还会带账户、积分、订阅等校验信息。  
适用：Agent 判断 CLI 当前是否可用时的首选命令。

`lr auth key set <key>`  
输出：设置成功的文本提示。  
适用：用户已经有 `lr_xxx` Key，只想写入本地配置。

`lr auth key list`  
输出：人类可读的 Key 列表；无结构化 JSON。  
适用：人工检查已有 Key，不适合作为 Agent 的默认解析入口。

`lr auth logout`  
输出：清除本地认证后的文本提示。

### `lr search`

`lr search "<query>" --format json`  
输出：论文数组。每项通常包含 `title`、`authors`、`year`、`abstract`、`url`、`source`，并在可用时包含 `citationCount`、`venue`、`categories`、`publishedDate`、`isOpenAccess`。  
说明：默认是联合搜索 `scholar,arxiv`；非 JSON 时进度和统计会写到 `stderr`。

`lr search scholar "<query>" --format json`  
输出：同样是论文数组，但更适合精确做年份、引用数、venue、open access 等过滤。  
适用：查经典论文、高引综述、特定会议论文。

`lr search arxiv "<query>" --format json`  
输出：论文数组，更偏最新预印本；适合配合 `--start-date`、`--end-date`、`--keywords`、`--only-first-version`。  
适用：查最新 AI/ML 进展。

`lr search ... --format bibtex`  
输出：纯 BibTeX 文本块，适合直接重定向到 `.bib` 文件。

### `lr agent`

`lr agent "<research question>"`  
输出：默认是流式自然语言回答；进度写到 `stderr`，正文写到 `stdout`。  
适用：需要 Agent 自己决定搜索路径、做综合分析。

`lr agent "<research question>" --format json`  
输出：最终只在 `stdout` 输出一个 JSON 对象：`{ "query": "...", "reply": "..." }`。  
适用：脚本化消费最终回答。

`lr agent --interactive`  
输出：TTY 交互式会话；会一直阻塞，直到输入 `exit` 或 `quit`。  
适用：人工多轮探索；不适合作为无人值守的默认路径。

### `lr read`

`lr read <url>`  
输出：默认输出 Markdown 文本；`stderr` 会打印标题、字符数、是否截断等状态。  
适用：把网页正文抓取为适合继续总结或保存的 Markdown。

`lr read <url> --format plain`  
输出：纯文本正文，去掉 Markdown 语法。

`lr read <url> --format json`  
输出：`WebReadResult` 风格 JSON，对象通常包含 `url`、`title`、`content`、`valid`、`truncated`、`char_count`，失败时可能有 `error`。  
适用：Agent 要进一步解析页面内容时。

`lr read <url> -o article.md`  
行为：不再把正文写到 `stdout`，而是写入文件，并在 `stderr` 打印保存路径。

### `lr web fetch`

`lr web fetch <url1> <url2> --format json`  
输出：JSON 对象，形如 `{ ok, results }`；`results` 是抓取结果数组，每项通常包含 `url`、`title`、`markdown`、`success`，失败时带 `error`。  
适用：批量抓网页并交给 Agent 后续处理。

`lr web fetch <url> --out ./output`  
行为：把每个 URL 的结果保存为一个 `.md` 文件；`stdout` 打印成功或失败日志。  
适用：批量落盘。

### `lr library`

`lr library ls --format json`  
输出：资源数组。每项通常包含 `resource_id`、`title`、`resource_type`、`process_ok`、`created_at`，并可能带 `folder_id`、`folder_path`、`url`、`file_size`、`tags`、`meta`。  
适用：列出资源库事实数据。

`lr library tree --format json`  
输出：文件夹树结构，节点通常包含 `folder_id`、`name`、`parent_id`、`children`、`resource_count`。  
适用：想知道资料库层级结构时。

`lr library search "<query>" --format json`  
输出：资源数组，偏关键词/标题/文本命中。

`lr library semantic-search "<question>" --format json`  
输出：语义检索命中列表，通常包含资源信息、匹配片段、相似度分数等。  
适用：自然语言找资料。

`lr library grep "<regex>" --format json`  
输出：正则全文匹配结果列表，适合精确找术语、公式名、作者名等。

`lr library info <resource-id> --format json`  
输出：单个资源的完整详情对象。  
适用：拿某个资源的精确信息。

`lr library import ./paper.pdf`  
输出：成功时返回导入结果；如果是 `--format json`，通常是带 `ok`、资源信息或导入状态的结构化对象。  
适用：上传本地文件。

`lr library import <url>`  
输出：URL 解析过程会阻塞轮询一段时间，然后输出解析/导入结果。  
说明：这一步已经不是“瞬时提交任务”，而是会等待 URL 解析结果出来。

`lr library import <url> --wait`  
输出：除了 URL 解析，还会继续等待资源处理到最终状态，再输出结果。  
适用：需要拿到可继续使用的最终资源。

`lr library mv <resource-id> --to <folder-id>`  
输出：移动成功的文本提示。

`lr library rm <resource-id> -y`  
输出：删除成功的文本提示；不加 `-y` 时可能有确认交互。

`lr library download <resource-id>`  
行为：下载原始文件到本地；`stdout`/`stderr` 打印保存过程和落盘路径。  
适用：需要把资源下载到本机。

`lr library storage --format json`  
输出：存储用量对象，通常包含 `used_bytes`、`total_bytes`、`file_count`。

`lr library graph --format json`  
输出：资源库图谱数据；可按 `folder`、`tag`、`conversation` 等模式聚合。

`lr library tag ls --format json`  
输出：标签数组，通常包含 `tag_id`、`name`、`color`、`usage_count`。

`lr library tag add <resource-id> <tag>`  
输出：添加标签成功的文本提示。

`lr library tag rm <resource-id> <tag-id>`  
输出：移除标签成功的文本提示。

### `lr folder`

`lr folder create "<name>" [--parent <folder-id>] --format json`  
输出：新建文件夹结果，通常包含 `folder_id`、`name`、`parent_id` 等。

`lr folder rename <folder-id> "<new-name>"`  
输出：重命名成功的文本提示。

`lr folder delete <folder-id> -y`  
输出：删除成功的文本提示；不加 `-y` 时可能要求确认。

### `lr note`

当前 `note` 命令族以 `list`、`read`、`create`、`update`、`delete` 为准。

`lr note list --format json`  
输出：笔记数组。每项通常包含 `note_id`、`title`、`note_type`、`created_at`、`updated_at`，可选带 `source_resource_id`。

`lr note read <note-id>`  
输出：默认是笔记正文；`--format json` 时输出带 `content` 的完整笔记对象。

`lr note create "<title>" --content "<text>" --format json`  
输出：新建结果，通常包含 `note_id`、标题、类型等。

`cat notes.md | lr note create "导入笔记" --from-stdin --format json`  
输出：同样是新建结果，但正文来自标准输入。

`lr note update <note-id> --title "..."`  
输出：更新成功的文本提示。

`lr note update <note-id> --content "..."`  
输出：更新成功的文本提示。

`lr note delete <note-id> -y`  
输出：删除成功的文本提示。

### `lr memo`

`lr memo list --format json`  
输出：记忆数组。每项通常包含 `memory_id`、`content`、`created_at`。

`lr memo search "<query>" --format json`  
输出：语义搜索命中数组；每项通常比列表结果多 `score` 字段。  
适用：在已有长期记忆里找相关结论。

`lr memo add "<content>" --format json`  
输出：创建任务结果，通常会返回 `task_id` 或等价的异步处理信息。  
说明：添加记忆往往是异步向量化，不一定是同步完成。

### `lr checkin`

`lr checkin status --format json`  
输出：签到状态对象。

`lr checkin do --format json`  
输出：签到结果对象，常见字段包括 `success`、`already_checked_in` 以及奖励信息。

### `lr open`

`lr open <id>`  
行为：默认拼接 Web URL 并调用系统浏览器打开；成功时输出“已在浏览器中打开”和 URL。

`lr open <task-id> --type paper`  
行为：打开学术写作任务页面。

`lr open <id> --no-browser`  
输出：只输出最终 URL，不打开浏览器。  
适用：Agent 只需要返回链接给用户。

### `lr papers`

`lr papers today --format json`  
输出：当日推荐论文数组，论文项通常包含 `title`、`abstract`、`authors`、`year`、`recommendation_reason`、`score`、`url`、`date`。

`lr papers today --date 2025-01-15 --format json`  
输出：指定日期的推荐结果。

`lr papers today --format md`  
输出：适合直接展示的 Markdown 推荐列表。

`lr papers dates --format json`  
输出：有推荐数据的日期列表。

### `lr graph`

`lr graph search "<query>" --format json`  
输出：种子论文候选列表，常用于先拿到 `openalex_id`。

`lr graph build <openalex-id> --format json`  
输出：图谱任务创建结果，通常包含 `task_id`、状态和种子论文信息。  
适用：先创建，稍后再看。

`lr graph build <openalex-id> --wait --format json`  
输出：阻塞等待图谱构建完成，再返回最终图谱结果或完整任务详情。  
适用：需要一次拿到最终结果。

`lr graph watch <task-id>`  
输出：持续轮询直到任务完成、失败或取消。

`lr graph show <task-id> --format json`  
输出：图谱详情；非 JSON 时默认打印摘要和 Top 节点列表。

`lr graph list --format json`  
输出：图谱任务数组。

`lr graph delete <task-id> -y`  
输出：删除任务成功的文本提示。

### `lr cite`

`lr cite format <resource-id> --style apa --format json`  
输出：引用格式化结果对象。

`lr cite format <resource-id> --style bibtex`  
输出：纯引用字符串；如果样式是 `bibtex`，就是可直接保存的 BibTeX 文本。

### `lr config`

`lr config list`  
输出：当前配置的表格；没有 JSON 模式。  
适用：人工查看配置。

`lr config get <key>`  
输出：某个配置值，未设置时输出 `(未设置)`。

`lr config set <key> <value>`  
输出：设置成功的文本提示。  
说明：当前主要用于 `server`、`format`、`lang`。

### `lr completion`

`lr completion`  
输出：shell completion 脚本文本。

`lr completion --install`  
行为：把 completion 配置写入 shell 配置文件。  
说明：这是会修改本地环境的命令，不应在未确认时自动执行。

### `lr help`

`lr help`  
输出：顶层帮助文本。

`lr help <command>`  
输出：指定命令的帮助文本。  
适用：用户只想看某个命令的 flags 和示例时。

## 推荐工作流

### 论文检索

```bash
lr search "RLHF" --source scholar,arxiv --limit 10 --format json
```

### 读取网页正文

```bash
lr read "https://example.com/article" --format json
```

### 导入并等待资料可用

```bash
lr library import "https://arxiv.org/abs/1706.03762" --wait --format json
```

### 获取 URL 而不是打开浏览器

```bash
lr open <resource-id> --no-browser
```

---

> 更多 CLI 文档与帮助页：https://lightingread.cn/help#cli
