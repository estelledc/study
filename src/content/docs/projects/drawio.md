---
title: drawio (diagrams.net) — 离线版 Visio
来源: jgraph/drawio GitHub README + diagrams.net 官方文档
日期: 2026-06-01
子分类: 数据可视化
分类: 数据可视化
难度: 入门
provenance: pipeline-v3
---

## 是什么

drawio 是一个**开源的图表编辑器**，可以画 BPMN 业务流程图、UML 类图、网络拓扑图、思维导图、流程图等几十种工程图。日常类比：像一份**离线版的 Visio**——打开浏览器或桌面 app，左边一栏拖形状、中间画布连箭头、右边改属性，画完保存成一个 `.drawio` 文件，没有任何账号注册、没有任何服务器上传。

它的另一个常用品牌名是 **diagrams.net**（2019 年改名），但仓库名和文件后缀仍叫 drawio，两个名字指同一个东西。

底层图引擎是同公司维护的 **mxGraph**——一套 JavaScript 节点-边图形库，处理"形状、连线、自动布局、序列化"这些底层活。drawio 是这个引擎之上加了 UI、形状库、文件读写。

## 为什么重要

不理解 drawio 的位置，你就无法解释这些事：

- 为什么很多团队的架构图还在用 PNG 截图传来传去——他们没听说过 drawio
- 为什么 GitHub / GitLab / Confluence / Notion 都内建或插件支持 `.drawio` 格式
- 为什么"画图工具"市场分两大类：**工程图**（drawio / Visio / Lucidchart）和**创意白板**（Figma / Miro / excalidraw）——drawio 属于前者
- 作为 BPMN / UML 教学起点，drawio 是**门槛最低**的——免费、零安装（浏览器直接用）、形状库齐全

## 核心要点

drawio 把三件事糅在一起：

1. **mxGraph 节点-边模型**：图就是"一些节点 + 一些边"的 XML 树。每个节点有 id、坐标、shape 类型；每条边记 source 和 target。整张图序列化成一段 XML，结构清晰、可 diff、可手改。

2. **形状库（Shape Library）系统**：BPMN、UML、AWS、Azure、网络设备、电路这些专业图形不是写死的代码，而是 stencil（模板）文件。每套 stencil 一个 XML 包，左侧面板按需加载。类比：画画的颜料盒，不同主题换不同盒子。

3. **三形态部署**：浏览器在线版（`app.diagrams.net`）、Electron 桌面 app（Win/Mac/Linux）、自托管 Docker 镜像。三个形态共用同一份核心代码，区别只在外壳和文件读写路径。

## 实践案例

### 案例 1：保存的文件长什么样

新建一个"两个矩形 + 一根箭头"的图，保存成 `demo.drawio`：

```xml
<mxfile host="app.diagrams.net">
  <diagram id="abc" name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="开始" style="rounded=1" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="80" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="3" value="结束" style="rounded=1" vertex="1" parent="1">
          <mxGeometry x="200" y="40" width="80" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="4" edge="1" source="2" target="3" parent="1"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

**逐部分解释**：

- `mxCell` 是统一原子单位——既可以是节点（`vertex="1"`）也可以是边（`edge="1"`）
- `source` 和 `target` 用 id 引用，所以拖动节点时只动坐标不动连线
- 整份就是一段 XML，可以丢进 git，diff 看得清"谁加了一个节点"

### 案例 2：在浏览器里嵌入一个 drawio 编辑器

如果你想在自己的 web 应用里给用户提供画图能力：

```html
<iframe
  id="editor"
  src="https://embed.diagrams.net/?embed=1&proto=json"
  style="width:100%;height:600px"></iframe>

<script>
  const iframe = document.getElementById('editor');
  window.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.event === 'init') {
      iframe.contentWindow.postMessage(
        JSON.stringify({ action: 'load', xml: '<mxfile>...</mxfile>' }),
        '*'
      );
    }
    if (msg.event === 'save') {
      console.log('用户保存的 XML:', msg.xml);
    }
  });
</script>
```

整个嵌入靠 **iframe + postMessage**——drawio 不依赖任何 SDK，只靠浏览器原生跨窗口消息通信。

### 案例 3：用 Docker 自托管一份

对内网团队、不想走公网的场景：

```bash
docker run -it --rm \
  -p 8080:8080 \
  jgraph/drawio
```

浏览器打开 `localhost:8080` 就是完整版编辑器。文件存在用户本地（浏览器 IndexedDB 或下载到磁盘），服务器端**不存数据**——它只是个静态文件托管 + 一些图片导出代理。这也是 drawio 自托管运维成本极低的原因。

## 踩过的坑

1. **保存到 GitHub/Google Drive 要授权**：在线版直接保存到云端需要 OAuth 授权一次。第一次用会被授权弹窗吓到，以为"图被上传到 drawio 服务器"，其实是浏览器直接传给 GitHub/Drive，drawio 服务器不经手。

2. **shape library 太多反而难搜**：几千个 shape 分布在 BPMN、UML、AWS、Azure、Cisco、Citrix 等几十个分类里。新人常找不到想要的形状，只能靠左下角搜索框。建议常用类别勾选"more shapes"。

3. **`.drawio` 嵌入 PNG/SVG 时容易丢源**：drawio 支持把 XML 嵌进 PNG metadata，看起来是图片其实可编辑。但很多协作工具（Slack/微信/邮件附件）会重新压缩 PNG，metadata 被剥离 → 再打开变成不可编辑的纯图。重要图请直接发 `.drawio` 源文件。

4. **Confluence 老插件 vs 新版**：Atlassian 生态有两套 drawio——jgraph 官方插件（功能全、收费）和社区免费分支。装错了会发现"这个图标我们这边打不开"。企业部署前要确认插件版本。

## 适用 vs 不适用场景

**适用**：

- 工程化图表：BPMN 业务流程、UML 类图/时序图、网络拓扑、AWS/Azure 架构图
- 想把图表纳入 git 版本管理（`.drawio` 是文本 XML）
- 自托管/离线/内网环境（不想用 SaaS 画图工具）
- 学 BPMN / UML 的零基础起点（免费 + 形状库齐全）

**不适用**：

- 实时多人协作画板——多人同时改同一张图体验弱（不如 Figma/Miro）
- 创意性白板/手绘风/便签贴——这是 excalidraw 和 Miro 的强项
- 移动端为主——drawio 的触屏体验仍在追赶 Figma
- 想要"AI 自动生成图"——drawio 没原生 AI 功能（社区有第三方插件）

## 历史小故事（可跳过）

- **2005 年**：英国公司 jgraph 发布 mxGraph，最早是 Java Swing 版图形库，给企业做内嵌图表组件赚许可费。
- **2012 年**：基于 mxGraph JS 版做了在线版编辑器 draw.io，免费开放，靠 Confluence 插件和企业服务变现。
- **2019 年**：因 `.io` 域名归属 EU 监管不确定，品牌改名 diagrams.net，但仓库和文件后缀保留 drawio。
- **2020 年**：jgraph 宣布 mxGraph 不再独立维护，所有更新合并到 drawio 主仓库。
- **2024-2026 年**：stars 突破 4 万，成为 Visio / Lucidchart 在开源世界的主力替代。

## 学到什么

1. **图就是节点 + 边的 XML 树**——理解了这个，所有"画图工具"的底层数据结构都通了（mermaid / graphviz / drawio / yEd 都是这套）。

2. **离线优先 + 单文件可移植** 是工程图表的关键设计——可 diff、可 git、可邮件发；SaaS 化反而增加协作摩擦。

3. **shape library 是壁垒**——能画 BPMN/UML/AWS 这类标准图，靠的是几千个 stencil 长年积累。新工具要追上不是写代码难，是补这个图形库难。

4. **嵌入式 SDK 不是必须**——drawio 用 iframe + postMessage 就实现了"在任何 web 应用里嵌入完整编辑器"，启发：浏览器原生能力够用时不必造 SDK。

## 延伸阅读

- 在线版直接用：[app.diagrams.net](https://app.diagrams.net/) —— 不注册、打开即画
- 桌面版下载：[github.com/jgraph/drawio-desktop/releases](https://github.com/jgraph/drawio-desktop/releases)
- 仓库主页：[github.com/jgraph/drawio](https://github.com/jgraph/drawio)
- mxGraph JS 文档（已并入 drawio 仓库）：[jgraph.github.io/mxgraph](https://jgraph.github.io/mxgraph/)
- Embed 协议文档：[drawio embed integration](https://www.drawio.com/doc/faq/embed-mode)
- [[mermaid]] —— 文本驱动的图表语言，与 drawio 形成"代码 vs 拖拽"对照

## 关联

- [[mermaid]] —— 文本驱动画图，drawio 是拖拽驱动，互补
- [[graphviz]] —— 自动布局算法引擎，思路和 drawio 内置布局重合
- [[excalidraw]] —— 同样开源画图，但偏手绘风白板
- [[plantuml]] —— UML 文本生成，和 drawio 拖拽 UML 形成互补
- [[mxgraph]] —— drawio 的图引擎核心
- [[bpmn]] —— drawio 重点支持的标准之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[mermaid]] —— Mermaid — 用文本写图，code review 友好的图表语言

