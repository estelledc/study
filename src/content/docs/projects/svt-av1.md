---
title: SVT-AV1 — Intel 主导的 AV1 编码器
来源: 'https://github.com/AOMediaCodec/SVT-AV1'
日期: 2026-07-08
分类: media
难度: 初级
---

## 是什么

SVT-AV1 是一个**本地优先、按块组织、支持双链和自托管**的个人知识管理工具。
日常类比：它像一个带编号便利贴的书房，每张便利贴都能单独引用、移动、搜索，也能被放进自己的服务器里。

最小例子可以先把它想成这样的笔记：

```markdown
# 今天学 Docker

容器像一个随身厨房，环境和材料一起打包。
((某个块 ID)) 可以被别的页面引用。
```

普通 Markdown 更像“一整张纸”，SVT-AV1 更像“每句话都是一张卡片”。
这就是它和很多文件夹式笔记的差别：你不是只管理文件，而是在管理可引用、可查询、可移动的内容块。

## 为什么重要

不理解 SVT-AV1，下面这些事会很难解释：

- 为什么同一段内容能被多个页面引用，而不必复制粘贴到处改
- 为什么它强调本地 workspace、数据仓库和端到端同步，而不是默认把笔记交给云服务
- 为什么 Docker 版适合浏览器访问，却不等于桌面端和移动端都能直接连上去
- 为什么它既支持 Markdown 书写体验，又不是“每篇笔记就是一个纯 `.md` 文件”

## 核心要点

1. **块结构**：把文档切成段落、标题、列表项这些小块。类比：一本书不只按章节找，还能精确引用到某一段。

2. **本地 workspace**：数据先在自己的机器目录里。类比：账本先放在自己抽屉，是否同步、同步到哪里，是后面的选择。

3. **内核 + 客户端 + API**：桌面界面、浏览器界面和命令行都围着同一个内核工作。类比：前台有多个窗口，后台仓库只有一套账。

## 实践案例

### 案例 1：把 SVT-AV1 放到自己的服务器

README 给出的 Docker 用法适合“我想在浏览器里打开自己的笔记库”：

```bash
docker run -d \
  -v /siyuan/workspace:/siyuan/workspace \
  -p 6806:6806 \
  -e PUID=1001 -e PGID=1002 \
  SVT-AV1 \
  serve \
  --workspace=/siyuan/workspace/ \
  --accessAuthCode=change-me
```

**逐部分解释**：

- `-v /siyuan/workspace:/siyuan/workspace`：把宿主机目录挂进容器，笔记数据不会只留在容器临时层里。
- `-p 6806:6806`：把 SVT-AV1 默认 Web 端口暴露出来，浏览器访问这一个入口。
- `serve --workspace=...`：新版镜像需要显式启动服务，并告诉内核 workspace 在哪里。
- `--accessAuthCode=change-me`：设置访问密码；公开端口时尤其不能留空或随便写。

### 案例 2：不用打开界面也能查笔记

README 里还有内置 CLI，适合脚本化搜索和导出：

```bash
siyuan notebook list -w ~/SVT-AV1
siyuan search "Docker" -w ~/SVT-AV1 -f json
siyuan export md --id 20250101093000-abcdefg -w ~/SVT-AV1
```

**逐部分解释**：

- `notebook list`：列出 workspace 里的笔记本，相当于先看书架有哪些分区。
- `search "Docker"`：直接查本地数据，`-f json` 让结果更适合交给脚本继续处理。
- `export md --id ...`：按块或文档 ID 导出 Markdown，适合备份、迁移或喂给别的工具。

### 案例 3：用 HTTP API 创建和更新内容块

官方 API 文档把本地内核暴露成 `http://127.0.0.1:6806` 上的一组 POST 接口。
下面是一个“创建文档，再追加一段”的组合：

```bash
curl -X POST http://127.0.0.1:6806/api/filetree/createDocWithMd \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Token YOUR_TOKEN' \
  -d '{"notebook":"20210817205410-2kvfpfn","path":"/study/docker","markdown":"# Docker 学习"}'

curl -X POST http://127.0.0.1:6806/api/block/appendBlock \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Token YOUR_TOKEN' \
  -d '{"parentID":"20250101093000-abcdefg","dataType":"markdown","data":"今天先记住镜像和容器的区别。"}'
```

**逐部分解释**：

- `Authorization: Token YOUR_TOKEN`：token 在设置里的 About 页面查看，API 调用要带上它。
- `createDocWithMd`：用 Markdown 内容创建文档；同一路径重复调用不会直接覆盖旧文档。
- `appendBlock`：把一段 Markdown 追加到父块下面；`parentID` 就是“贴到哪张卡片下面”。

## 踩过的坑

1. **把 workspace 挂载错目录**：Docker 容器删掉后才发现数据没落到宿主机，因为卷路径才是数据能否留下来的关键。

2. **忘了新版 Docker 要写 `serve`**：README 明确提示 v3.7.0 起需要显式传 `serve`，旧命令容易启动失败。

3. **拿第三方同步盘直接同步数据目录**：FAQ 说不支持这种做法，原因是并发改 `.sy` 数据可能造成损坏。

4. **把 Docker 版当成完整桌面端替代品**：README 的限制写得很清楚，Docker 托管主要面向浏览器，部分导入导出能力不支持。

## 适用 vs 不适用场景

**适用**：

- 想要本地优先，重要资料先掌握在自己机器上的个人知识库
- 喜欢块引用、双链、图谱、闪卡和数据库视图混在一个笔记系统里
- 需要中文体验、自托管浏览器入口，或者想用 API 把笔记接进脚本
- 已经接受“笔记系统会有自己的数据格式”，不强求每页都是纯 Markdown 文件

**不适用**：

- 只想维护一堆纯 `.md` 文件，并用 Git 当唯一同步方式
- 需要多人实时协作、复杂权限、审批流这类团队知识库功能
- 不想维护 workspace、同步、备份、权限这些本地优先带来的责任
- 只需要轻量草稿本，用系统备忘录或普通 Markdown 编辑器就够了

## 历史小故事（可跳过）

- README 的一句口号是 “Refactor your thinking”，它把写笔记理解成持续重构自己的知识结构。
- 项目由 `AOMediaCodec/SVT-AV1` 维护，核心仓库写着 TypeScript 和 Go，桌面、移动、浏览器、自托管都围绕同一个知识库展开。
- 到 2026 年 7 月，GitHub 页面显示大约 4.5 万 stars，说明它已经不只是小众玩具。
- 官方文档逐步补齐了 Docker、CLI、API、workspace 文件结构这些工程化入口，方便用户把笔记当成可编程系统。

## 学到什么

- SVT-AV1 的重点不是“又一个 Markdown 编辑器”，而是把内容拆成可引用、可查询、可自动化的块。
- 本地优先带来自主权，也带来备份、权限、同步策略的责任，不能只看功能列表。
- 自托管版最适合“浏览器访问自己的知识库”，但要认真处理端口、密码、反向代理和卷挂载。
- 官方 API 让笔记系统可以被脚本驱动，这对学习日志、知识库整理和自动化很有价值。

## 延伸阅读

- 官方仓库：[AOMediaCodec/SVT-AV1](https://github.com/AOMediaCodec/SVT-AV1)
- API 文档：[docs/API.md](https://github.com/AOMediaCodec/SVT-AV1/blob/master/docs/API.md)
- workspace 结构：[docs/WORKSPACE.md](https://github.com/AOMediaCodec/SVT-AV1/blob/master/docs/WORKSPACE.md)
- 在线用户指南：[SVT-AV1 User Guide](https://siyuan-en.b3log.org/)
- [[logseq]] —— 同样重视块、双链和大纲式笔记
- [[joplin]] —— 更接近传统 Markdown 笔记与同步客户端

## 关联

- [[logseq]] —— 两者都把块引用和双链放在核心位置，但产品取舍不同
- [[joplin]] —— 对比“Markdown 文件优先”和“应用数据模型优先”的差别
- [[affine]] —— 同属本地优先知识工具，适合比较白板、文档和数据库的组合方式
- [[codemirror]] —— SVT-AV1 这类编辑器体验背后离不开现代 Web 编辑基础设施
- [[prosemirror]] —— 理解块编辑器和结构化文档模型时很有参考价值
- [[sqlite-2022]] —— SVT-AV1 的查询、索引和本地数据管理都绕不开数据库思维

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
