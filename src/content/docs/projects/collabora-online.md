---
title: Collabora Online — 浏览器里直接编辑 Office 文档的开源后端
来源: CollaboraOnline/online GitHub README
日期: 2026-05-31
子分类: 实时通信
分类: 通信
难度: 中级
provenance: pipeline-v3
---

## 是什么

Collabora Online 是一个**让用户在浏览器里直接打开、编辑、协同改 Word/Excel/PowerPoint 文档的开源后端服务**。日常类比：像一台架在远程机房里的"共用打字机"——多人同时凑在一台机器前敲键盘，每个人面前的小屏幕只是把那台打字机的画面投影过来。

它的前身是 LibreOffice Online。2020 年 Document Foundation 把云端方向交给 Collabora 公司，主仓库迁到 `CollaboraOnline/online`，从此叫 Collabora Online。

服务端跑的就是真正的 LibreOffice 引擎，把当前页面渲染成一块块小图（叫 tile，瓦片），通过 WebSocket 推到浏览器；浏览器只负责把瓦片拼起来画在屏幕上，再把鼠标、键盘事件回传给服务端。

## 为什么重要

不理解 Collabora Online 的设计，下面这些事很难解释：

- 为什么 Nextcloud / ownCloud / Moodle 这种自托管平台敢宣称"在线编辑 Office 文档" —— 它们都把 Collabora 当后端
- 为什么政企内网做"国产化替代"会选这个项目，而不是直接用 Microsoft 365 / Google Docs
- 什么是 **WOPI 协议**，为什么外部网盘只要实现三个 REST 接口就能挂上 Collabora
- 为什么 OnlyOffice 看起来做同一件事，但底层路线完全不同

## 核心要点

Collabora Online 的架构有 **三层**：

1. **coolwsd 主进程**（COOL = Collabora Online Office）：监听 WebSocket，路由请求，管理一堆 kit 子进程。类比：一个前台经理，登记每个进来的客人，把他领到对应的房间。

2. **kit 子进程 = 一个 LibreOffice 实例**：每打开一份文档，coolwsd 就 fork 一个 kit。kit 进程里跑的是真正的 LibreOffice 内核，负责把文档渲染成 tile。类比：每个房间里坐着一个真人秘书，他面前摆着那份文档。

3. **前端 tile 拼图器**：浏览器里跑一段 vanilla JS（不是 React/Vue），借用 Leaflet（地图库）把后端推来的瓦片拼起来——所以你在网页上拖文档时手感和拖地图很像。

协同模型是 **单写者 + 广播**：每份文档同时只跑一个 kit，多用户的输入事件被序列化进同一个 LibreOffice 实例，自然不冲突。这点和 Google Docs 的 OT、Figma 的 CRDT 都不同——简单粗暴但兼容性满分。

## 实践案例

### 案例 1：Nextcloud 用户点开一份 docx 时发生了什么

1. 用户在 Nextcloud 文件列表里双击 `report.docx`
2. Nextcloud 后端通过 **WOPI 协议**告诉 Collabora："这有一份文档，你来开"，并附带一个临时 token
3. Collabora 用 token 调 Nextcloud 的 `GetFile` 接口把 docx 文件拉过来
4. coolwsd fork 一个 kit 进程，kit 里 LibreOffice 打开 docx，渲染第一页成 tile
5. 浏览器收到 tile + 一个 WebSocket 连接，画面就出来了
6. 用户编辑、保存时，Collabora 调 Nextcloud 的 `PutFile` 把新版本写回去

整个过程 Nextcloud 完全不懂 docx 内部结构，它只负责"网盘"这件事。

### 案例 2：WOPI 协议核心三件套

WOPI 是 Microsoft 2012 年定义的协议，本质是**让网盘和 Office 之间用 HTTP 说话**：

```
GET  /wopi/files/{file_id}              → CheckFileInfo（拿文件元信息）
GET  /wopi/files/{file_id}/contents     → GetFile（下载文件）
POST /wopi/files/{file_id}/contents     → PutFile（上传新版本）
```

外部网盘只要实现这三类接口，就能挂上任何兼容 WOPI 的 Office 后端（Collabora、OnlyOffice、Microsoft Office Online Server 都支持）。

### 案例 3：和 OnlyOffice、Google Docs 的路线区别

| 项目 | 渲染方式 | 协同模型 | 部署方式 |
|---|---|---|---|
| Collabora Online | 服务端跑 LibreOffice，推 tile | 单写者 + 广播 | 自托管 |
| OnlyOffice | 前端 JS 自己重写 Office 渲染（Canvas） | OT（操作变换） | 自托管 |
| Google Docs | 前端 + 服务端混合渲染 | OT + 私有协议 | 仅 SaaS |

**Collabora 的取舍**：兼容性满分（直接用 LibreOffice 内核），但服务端很重；适合"反正要自托管，机器富余"的内网场景。

### 案例 4：tile 是怎么从服务端流到浏览器的

打开一份 docx，浏览器初次连上 WebSocket 时，前端会发：

```
tile nviewid=0 part=0 width=256 height=256 tileposx=0 tileposy=0 tilewidth=3840 tileheight=3840
```

意思是"我要第 0 页、左上角那块、256×256 像素的 tile"。kit 进程让 LibreOffice 渲染对应区域，编码成 PNG 推回来。用户滚动文档时，前端按需要新发 tile 请求，已经画过的 tile 走本地缓存。这种"按视口拉数据"的思路和地图分块完全一致——所以前端复用 Leaflet 是顺理成章的选择。

## 踩过的坑

1. **每文档一个 LibreOffice 进程，内存爆炸**：100 个用户同时开文档 = 100 个 LO 实例。生产部署必须配进程池上限和内存限额，否则 OOM。

2. **WOPI 不是协同协议**：它只管"网盘把文档塞进来 / 拿回去"。真正的多人光标、输入合并是 Collabora 内部用 WebSocket 处理的，和 WOPI 无关。新人常把这两层搞混。

3. **WebSocket 反向代理特别坑**：nginx 默认不透传 `Upgrade` header，`proxy_read_timeout` 默认 60 秒会把长连接掐掉。部署文档里有专门一节讲 nginx 配置，照抄就行。

4. **二进制兼容性偶有微差**：服务端 LibreOffice 渲染出的 docx，偶尔会和桌面 Microsoft Word 在字体、嵌入图表上有像素级差异。法律合同等高合规场景需要做 QA。

5. **前端不是现代框架**：用 vanilla JS + Leaflet，看习惯了 React/Vue 的人会有点不适应——但 tile 拼图借地图库是非常合理的选型。

6. **kit 崩了文档就掉线**：因为单写者模型，kit 进程一旦 crash 当前所有连这份文档的用户都会被踢。Collabora 做了快照恢复机制，但用户感受还是会卡一下。

7. **本地字体 vs 上传字体**：服务端 LibreOffice 只认装在服务器上的字体；用户文档里引用的"微软雅黑"如果服务器没装，渲染出来会被替换成 fallback 字体。生产部署需要预先装好常见中文字体。

## 适用 vs 不适用场景

**适用**：

- 自托管网盘想给用户加"在线编辑 Office"的能力（Nextcloud / ownCloud / Seafile）
- 政企内网做合规替代，文档不能出公司机房
- 教育平台（Moodle）让学生在线写作业、老师批改
- 已经有 LibreOffice 兼容性需求的存量场景

**不适用**：

- 想要 Google Docs 那种丝滑实时协同（多光标、字符级合并）—— 用 OnlyOffice 或商业 SaaS
- 服务器资源紧（每文档一个 LO 进程的开销跑不掉）
- 只需要轻量 Markdown / 富文本协同 —— 用 Yjs / Automerge 自建即可
- 完全静态文档预览（不编辑） —— 用 LibreOffice headless 转 PDF 就够

## 历史小故事（可跳过）

- **2011**：LibreOffice 从 OpenOffice 分叉，Document Foundation 接手。
- **2015**：LibreOffice Online 项目启动，目标是把 LibreOffice 搬上浏览器。
- **2020**：Document Foundation 决定把云端方向完全交给商业伙伴 Collabora，主仓库迁到 `CollaboraOnline/online`，社区版叫 Collabora Online Development Edition（CODE）。
- **2021 至今**：Nextcloud 把 Collabora 作为默认 Office 集成方案，安装量进入主流自托管栈。

WOPI 协议本身更早（2012），是 Microsoft 为了让 SharePoint 之外的网盘也能挂 Office Online 而定义的开放协议。Collabora 沿用它，相当于"借敌人的标准让自己的开源方案接得上同样的网盘"。

## 学到什么

1. **服务端渲染 + tile 推流** 是兼容性优先的解法——不用重写 Office 内核，但服务器吃得很重。把"渲染"完整放在服务端，是和 OnlyOffice、Google Docs 路线分叉的关键节点。
2. **WOPI 把"网盘"和"Office"解耦** 成两个独立服务，任何遵守协议的两端都能配对。这种"协议先行"的设计让生态滚得起来——任何写过 REST 的程序员都能给自己的系统接上 Collabora。
3. **协同不一定要 OT/CRDT**：单写者 + 广播也是合法选项，代价是多人同时编辑的体感不如 Google Docs，但实现复杂度低一个数量级。
4. **fork + 商业化** 的开源治理模式：Collabora 把 LibreOffice Online 接走维护，社区版免费、企业版收订阅，养活了一队全职开发者。这是开源基金会和商业公司分工的一个范例。
5. **复用看似无关的库**：前端借 Leaflet 做 tile 拼图、后端借 LibreOffice 做渲染——能复用的就不要自己造，哪怕这个库本来不是为这场景设计的。

## 延伸阅读

- 仓库：[CollaboraOnline/online](https://github.com/CollaboraOnline/online)
- 官方 SDK 文档：[sdk.collaboraonline.com](https://sdk.collaboraonline.com/)
- WOPI 协议规范：[Microsoft Cloud Storage Partner Program](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/)
- Nextcloud 集成介绍：[nextcloud.com/office](https://nextcloud.com/office/)

## 关联

- [[nextcloud]] —— 最常见的 WOPI 客户端，把 Collabora 当默认 Office 后端
- [[onlyoffice]] —— 同赛道竞品，前端 Canvas 路线
- [[libreoffice]] —— Collabora Online 的内核来源，每个 kit 进程跑的就是它
- [[yjs]] —— 协同方向的另一条路（CRDT），和 Collabora 单写者模型形成对照
- [[automerge]] —— 另一种 CRDT 实现，本地优先路线的代表
- [[affine]] —— 同样是文档协作但走 block 树路线，和 Office 兼容路线分道扬镳

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[affine]] —— AFFiNE — 文档和白板共用同一棵 block 树的开源知识库
- [[automerge]] —— Automerge — 让两份 JSON 自动合并的 CRDT 库
- [[yjs]] —— Yjs — 让任何编辑器都能接的协同编辑内核

