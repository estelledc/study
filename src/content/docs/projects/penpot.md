---
title: Penpot — 开源自托管的 Figma 替代
来源: 'https://github.com/penpot/penpot'
日期: 2026-05-30
分类: projects / 设计工具
难度: 中级
---

## 是什么

Penpot 是一个**开源协作设计平台**——你可以把它想成"自己服务器上的 Figma"。日常类比：像把谷歌文档换成自家局域网的 Etherpad，画布上的每一笔仍然多人实时共享，但所有数据都留在自己机房里。

它覆盖 UI 设计、原型、设计系统三大场景。打开浏览器就能画 wireframe、连交互、拉组件库；后端跑在自家 docker compose 里，Postgres 存文件、Redis 转发实时事件、JVM 跑业务逻辑。

技术栈反常规：前端 ClojureScript（编译到浏览器 v8）、后端 Clojure（跑 JVM）、共享层 .cljc 文件**两边都编译**，意味着 shape 数据模型只写一次。MPL-2.0 协议，西班牙 Kaleidos 团队主导。

最小例子——画一个矩形 shape，前端发出的事件结构和后端验证用的 schema 是同一份：

```clojure
;; common/src/app/common/types/shape.cljc
(def shape-attrs
  [:map
   [:id   uuid?]
   [:type [:enum :rect :circle :path :text]]
   [:x    number?]
   [:y    number?]])
```

## 为什么重要

不理解 Penpot，下面这些事很难解释：

- 为什么一个设计工具会用 **Lisp 方言**写——明明 React 已经统治前端
- 为什么"自托管"在 2026 年还是企业的真实诉求——logo / 组件库 / 原型本质是知识产权
- 为什么实时协同选了 **Redis pub/sub** 而不是 P2P CRDT——单 Redis 是瓶颈但工程简单
- 为什么五万星级的项目能保持小团队节奏——共享类型 schema 让前后端少写一倍 DTO

## 核心要点

Penpot 的设计可以拆成 **三个判断**：

1. **前后端共用同一份数据模型**：shape / file / library 的 schema 写在 common/ 的 .cljc 文件里，前后端都编译。类比：餐厅里前台后厨用同一本菜单，不会出现"前台说有但后厨不知道"。这是少 DTO 翻译的根。

2. **实时协同走中心化中继**：每个 file 是一个 Redis topic，任何 ws 节点收到客户端事件都 publish 进去，订阅了同 topic 的其他节点扇出推送。类比：广播电台——主持人说一次，所有调到这个频率的收音机都听见。横扩 ws 节点不需要 sticky session。

3. **设计文件即代码**：每个 shape 都能直接导出 CSS / HTML / SVG。类比：菜谱写好就能直接交厨房开火，不用翻译成"烹饪指导文档"。设计师改完，开发者打开就看到代码。

## 实践案例

### 案例 1：docker compose 自起一台 Penpot

最常见的入口。三个文件搞定：

```bash
curl -o docker-compose.yaml https://raw.githubusercontent.com/penpot/penpot/main/docker/images/docker-compose.yaml
curl -o config.env https://raw.githubusercontent.com/penpot/penpot/main/docker/images/config.env
docker compose -p penpot -f docker-compose.yaml up -d
```

跑起来后访问 `http://localhost:9001`，注册账号、建团队、新建 file 就能画。Postgres 存设计数据，Redis 转发实时光标和 shape 变更。整套服务 4G 内存够。

### 案例 2：维护设计 token 同步给前端

设计师在 Penpot 里建一组颜色 token：`color/primary` / `color/danger`。导出成 JSON：

```json
{
  "color": {
    "primary": { "$value": "#FF6B35", "$type": "color" },
    "danger":  { "$value": "#D62B2B", "$type": "color" }
  }
}
```

前端工程把这份 JSON 喂给 style-dictionary 工具，自动生成 CSS 变量、Tailwind config、iOS swift 常量。设计改色后重新导出，前端构建一次更新，不用人肉抄色号。

### 案例 3：原型 + 代码检查的 handoff

设计师画完一个按钮组件，连好 hover / active 交互。开发者打开同一个 file，切到 "Inspect" 模式：

```css
/* 直接复制走的 CSS */
.button-primary {
  background: #FF6B35;
  border-radius: 8px;
  padding: 12px 24px;
  font-size: 16px;
}
```

不用 Zeplin 中转、不用截图量像素。设计源即代码源——这是 Penpot 卖点最具体的一处。

## 踩过的坑

1. **被 "Figma clone" 误导**：Penpot 是 Lisp 全栈架构，不是简单 React 移植，二开门槛高于预期，需要会 Clojure 才能改核心
2. **自托管硬件被低估**：Postgres + Redis + JVM + Penpot exporter（PDF/SVG 导出服务）起步至少 4G 内存，1G 小机器跑不动
3. **实时协同是中心化中继不是 P2P CRDT**：多节点 ws 横扩没问题但单 Redis 是瓶颈，超 1000 并发设计师需要 Redis cluster
4. **ClojureScript 大文件 hot reload 慢**：source map 在 5MB+ 文件下会卡顿，开发期热重载体验不如 Vite 项目

## 适用 vs 不适用场景

**适用**：

- 企业自托管设计平台，数据合规要求高（金融 / 医疗 / 政府）
- 团队级 design system 集中维护 + token 导出给多端工程
- 反 vendor lock-in 立场，要求开源可审计
- 中等规模团队（10-200 人）协作画 UI / 做原型

**不适用**：

- 个人画板 / 头脑风暴白板（用 Excalidraw 更轻）
- 重度向量插画（用 Inkscape / Affinity Designer）
- 移动端原生 macOS 体验（用 Sketch）
- 想要 Figma 那种生态插件数量（Penpot 插件还在起步）

## 历史小故事（可跳过）

- **2015 年**：西班牙 Kaleidos 团队启动项目，最早叫 "UXBOX"，给内部设计师用
- **2020 年**：改名 Penpot，开放公开 alpha，技术栈定为 Clojure 全栈
- **2021 年**：发布 1.0，进入主流自托管设计工具视野
- **2024 年**：加入 Rust 写的 render-wasm，处理大文件渲染热路径，绕开 JS GC 卡顿
- **2025 年**：加入 MCP server，把设计文件暴露给 LLM 直读，进入"设计 + AI"叙事

五万星级的成长全靠"反 SaaS 锁定"叙事和持续小步快跑的工程节奏。

## 学到什么

1. **共享类型 schema 比文档同步强**：把数据模型写在前后端都能编译的文件里，从根上消灭 DTO 翻译
2. **中心化中继 + pub/sub 是实时协同的工程务实解**：P2P CRDT 漂亮但难调试，Redis topic 路由简单可观测
3. **开源 + 自托管不是政治表态，是企业级现实需求**：知识产权数据放别家保险箱永远是悬剑
4. **小团队也能扛大型协作产品**：选对技术栈（Clojure 全栈）+ 少 DTO 是关键
5. **激进语言选型有时候反而省事**：选 Clojure 看似冒险，实际通过 .cljc 共享省掉的代码量足以抵消招聘成本

## 延伸阅读

- 项目主页：[penpot.app](https://penpot.app/)
- GitHub 源码：[penpot/penpot](https://github.com/penpot/penpot)
- 自托管文档：[help.penpot.app/technical-guide](https://help.penpot.app/technical-guide/getting-started/)
- Clojure 入门：[clojure.org/guides](https://clojure.org/guides/getting_started)
- [[clojure]] —— Penpot 的全栈核心语言
- [[react]] —— 主流前端框架，Penpot 用 ClojureScript 绕开它

## 关联

- [[clojure]] —— 不可变数据 + Lisp 语法，Penpot 全栈基石
- [[lisp]] —— Clojure 是 Lisp 方言，元编程能力强
- [[react]] —— 主流 UI 框架，Penpot 用 rumext（CLJS reagent 风）替代
- [[postgres]] —— 设计文件持久化存储
- [[redis]] —— 实时协同 pub/sub 中继
- [[docker]] —— 自托管入口，docker compose 一键起
- [[websocket]] —— 实时协同传输层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
