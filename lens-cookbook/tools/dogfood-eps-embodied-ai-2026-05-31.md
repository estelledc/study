# ε 阶段首轮 dogfood — embodied-ai-research

## 元信息

- 项目：`/Users/jason/intern-journal/explorations/embodied-ai-research`
- 范围：12 项改进的 top 3（按 ROI 选）
- dogfood 时间：2026-05-31
- cookbook 版本：v6（10 lens, schema locked）
- 三项 verdict：`cookbook_partial × 3`
- 真实摩擦 14 项（排除 4 个 no_friction 占位），其中 high severity 4 项

---

## 改进 1 — Pagefind 站内搜索（中文友好）

### 简介与选它的理由

156 篇 paper notes + daily + learnings 散落，无搜索读者只能靠目录滚屏。Pagefind 1.5.2 已经装好，npm 依赖到位，是 12 项改进里唯一"装了但没用上"的工件，回报最直接。

### cookbook 决策路径（步骤摘要）

1. **路由**：横跨 lens-frontend（搜索框 UI/SSG）+ lens-data（中文检索/索引体积）+ lens-devtool（build pipeline + Pages CI）。三 lens 都覆盖边角，没有 lens own"静态站搜索"。
2. **候选拉取**：Pagefind / lunr.js / MiniSearch / FlexSearch / Algolia DocSearch — 在三个候选表里 0 命中，全部用户自补。
3. **cost-gate**：三 lens 的 Q0 同向收敛到"静态/零预算/单机栈"，干净筛掉 Algolia 与 ES/Meili 服务化方案。这是本轮 cookbook 唯一真正 carry 的环节。
4. **立场列**：对 Pagefind/lunr/MiniSearch 全部沉默。只能拿 Astro"内容站零 JS"+ BM25"精确名词召回"+ sqlite-vss"≤100k 单机"做哲学类比。
5. **ADR**：无直接覆盖。最近的 lens-devtool ADR-3（≤100k SQL → sqlite-vss）借了"阈值思路"做平移；ADR-1 借了 SSG 内容站定位；ADR-4 BM25+dense+rerank 156 篇用不到。
6. **决定**：Pagefind 1.5.2 + `<html lang="zh">` 触发内置中文 segmenter + `data-pagefind-body` 限定正文 + PagefindUI 接 nav 搜索框 + GH Actions 部署。

### 引用的 lens + ADR

- lens-frontend §SSR/SSG/ISR/CSR 决策树 Q0
- lens-data §决策树 Q0/Q0.5
- lens-devtool §决策树 Q0
- lens-frontend ADR-1（SSG 内容站定位，类比）
- lens-data ADR-5（嵌入式向量库 cost-gate，类比）
- lens-devtool ADR-3（≤100k 阈值思路，类比）

### 最终推荐方案

**chosen_solution**：Pagefind 1.5.2（已装）+ 内置中文 segmenter + PagefindUI + GH Pages Actions。

**config**：

```html
<!-- site/templates/base.html -->
<html lang="zh">
<article data-pagefind-body data-pagefind-meta="title:h1">
  <!-- 正文 -->
</article>
<nav><div id="search"></div></nav>
```

```js
// site/src/search.js
import { PagefindUI } from '/pagefind/pagefind-ui.js';
new PagefindUI({
  element: '#search',
  showSubResults: true,
  translations: { placeholder: '搜索…', zero_results: '没有找到 "PLACEHOLDER"' },
  processTerm: t => t.toLowerCase(),
});
```

```css
/* site/src/theme.css */
.pagefind-ui--reset { font-family: 'JetBrains Mono'; background: #efe7d2; border-bottom: 2px solid coral; }
```

```yaml
# .github/workflows/deploy.yml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
- run: npm ci && npm run build
- uses: actions/upload-pages-artifact@v3
  with: { path: site/dist }
- uses: actions/deploy-pages@v4
```

**files_to_change**：

- `site/scripts/build.mjs`（保持现有 `pagefind --site dist`）
- `site/templates/*.html`（注入 `lang="zh"` + `data-pagefind-body`）
- `site/src/search.js`
- `site/src/theme.css`
- `.github/workflows/deploy.yml`

**估时 / loc**：3.5h / ~140 行

### friction 摘要

- step2 **high** lens_missing — 三 lens 候选表 0 命中"静态站搜索工具"
- step4 **high** cookbook_silent — 立场列对 Pagefind 全部沉默，F6 立场列锁定的价值=0
- step5 **mid** cookbook_silent — 无 ADR 覆盖中文 segmenter / 索引体积 / sidecar HTML 兼容
- step6 **mid** cookbook_too_abstract — 决策树到工具层就停，具体 config（`data-pagefind-body` / `lang=zh` / PagefindUI translations）全无

---

## 改进 2 — KaTeX 公式渲染 + Update 横幅 component

### 简介与选它的理由

embodied AI paper notes 公式密集（DDPG/IL/RLHF/world model），现在 `$\nabla_\theta J$` 类内联公式直接 raw 显示，影响阅读价值。Update 横幅则是日常"今天补了什么"的可视化轨迹。

### cookbook 决策路径

1. **路由**：跨 lens-frontend（KaTeX 字体协调 + banner 视觉）+ lens-devtool（CDN auto-render + marked 管线）。
2. **候选**：(A) 留 vanilla + KaTeX CDN auto-render；(B) 迁 VitePress；(C) 迁 Starlight；(D) 迁 mdBook；(E) 样式侧 Tailwind/VE/sc。
3. **cost-gate**：lens-devtool Q0（个人/0 预算/不托管）+ lens-frontend Q0（< $100/QPS<5）双 lens 同向命中，剔除 B/C/D 全栈迁移；ADR-5"非破坏改造"原则强化"别迁 VitePress"。
4. **立场列**：三个 doc 框架立场都明示是栈匹配，本项目 vanilla node 不沾；只有 Tailwind utility 与现状契合。
5. **ADR**：无直接覆盖。lens-devtool ADR-5（CLI vs Tauri）借"非破坏论证"；lens-frontend ADR-1 SSG 路径；ADR-3 实测阈值方法可类比但无具体数。
6. **决定**：留 vanilla + CDN auto-render + defer 时序保护 + marked math placeholder extension（防 `$...$` 双重转义）+ banner partial 模板（芥末黄 #c9a227 与 #efe7d2 暖纸调和）。

### 引用的 lens + ADR

- lens-frontend / lens-devtool（双 lens cost-gate）
- lens-frontend ADR-1 / ADR-3
- lens-devtool ADR-5

### 最终推荐方案

**chosen_solution**：vanilla build.mjs + KaTeX CDN auto-render + marked math extension + update-banner partial。

**config**：

```js
// site/scripts/build.mjs (片段)
import { marked } from 'marked';
marked.use({ extensions: [
  {
    name: 'mathInline', level: 'inline',
    start(src) { return src.indexOf('$'); },
    tokenizer(src) {
      const m = /^\$([^$\n]+?)\$/.exec(src);
      if (m) return { type: 'mathInline', raw: m[0], text: m[1] };
    },
    renderer(t) { return `<span class="math-inline">${t.text.replace(/&/g, '&amp;')}</span>`; },
  },
  {
    name: 'mathBlock', level: 'block',
    start(src) { return src.indexOf('$$'); },
    tokenizer(src) {
      const m = /^\$\$([\s\S]+?)\$\$/.exec(src);
      if (m) return { type: 'mathBlock', raw: m[0], text: m[1] };
    },
    renderer(t) { return `<div class="math-display">${t.text}</div>`; },
  },
]});
```

```html
<!-- site/templates/base.html 尾部 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer
  src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
  onload="renderMathInElement(document.body, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false }
    ],
    throwOnError: false
  })"></script>
```

```css
/* site/src/theme.css */
.katex { font-size: 1.02em; color: #2a2a2a; }
.katex-display { margin: 1.2rem 0; padding: 0.4rem 0.6rem; border-left: 2px solid #c4886f; background: #f5ecd6; }
.update-banner { background: #c9a227; color: #1a1a1a; border-left: 4px solid #8a6f1a; padding: 0.6rem 0.9rem; font-family: 'Playfair Display', serif; font-style: italic; }
.update-banner time { font-family: 'JetBrains Mono', monospace; font-style: normal; font-size: 0.85em; opacity: 0.75; margin-right: 0.5rem; }
```

```html
<!-- site/templates/partials/update-banner.html -->
<aside class="update-banner" role="note">
  <time datetime="{{date}}">{{date}}</time>{{message}}
</aside>
```

**files_to_change**：

- `site/scripts/build.mjs`
- `site/src/theme.css`
- `site/templates/partials/update-banner.html`（新文件）
- `site/templates/base.html`

**估时 / loc**：2.5h / ~95 行

### friction 摘要

- step5 **high** cookbook_silent — 无 ADR 覆盖"CDN 第三方脚本与 marked/markdown-it 转义协作"，文档站工程化高频痛点（双重转义、heading-id 冲突、a11y）
- step2 **mid** cookbook_silent — lens-devtool 候选表无"数学公式渲染"类目；lens-frontend 候选表无字体排版行
- step2 **mid** lens_missing — 缺"banner / callout / admonition 视觉组件"横切类目
- step4 **mid** cookbook_too_abstract — 立场列只够秒判"栈不匹配"，对"已采用 Tailwind 后如何配 banner 配色"不发声
- step6 **low** cookbook_too_specific — KaTeX 字体回退链 / banner 强调色对比度阈值无 ADR 体例覆盖

---

## 改进 3 — 单页右栏 outline（H2/H3 sticky 浮窗）

### 简介与选它的理由

5-6 篇长综述（如 RT-X, OpenVLA, RLHF survey）读者会迷路，需要导读 TOC；项目栈是 vanilla SSG，已存在空 outline.js 占位，扩展即可。

### cookbook 决策路径

1. **路由**：表面落 lens-frontend，但真实颗粒度是"单组件 pattern"而非"框架/库选型"，路由表第一眼有错位风险。lens-frontend 仍是最近 lens。
2. **候选**：(A) 不做（YAGNI）；(B) 静态 sticky `<aside>` + 锚点；(C) sticky + IntersectionObserver 同步高亮 + 移动端 `<details>` 折叠 + 阈值门；(D) 第三方 tocbot；(E) 整站迁 Astro/Starlight。
3. **cost-gate**：lens-frontend Q0（< $100/QPS<5）正好命中；淘汰 D（lib 加 bundle 与 SSG 极简哲学冲突）和 E（日级工程量违反 Q0 现状）。
4. **立场列**：对组件级 pattern 沉默，把 Astro Islands"零 JS"翻译成"单组件最小岛"判据；outline.js 是叶子岛屿，挂 1 IO + 1 sticky 容器，不触发 hydration 链。
5. **ADR**：无完美命中。ADR-3 给的预算（叶子≤50KB / hydration<80ms / islands≤8）借精神：outline.js + IO ~3-5KB、单岛、无 hydration 链，全部 1-2 个数量级低于阈值。**警告**：ADR-3 上下文是 RSC，借数值有错位风险。
6. **决定**：选 C，零新增依赖，扩展现有 `site/src/outline.js`。

### 引用的 lens + ADR

- lens-frontend
- lens-frontend ADR-1（Astro Islands 哲学）
- lens-frontend ADR-3（use_client 阈值类比）

### 最终推荐方案

**chosen_solution**：sticky `<aside>` 右栏 + IntersectionObserver 同步高亮 + 移动端 `<details>` 折叠 + 阈值门（H2 数 ≥ 3 才挂 outline）。

**config**：

```
threshold_h2_min       = 3
sticky_top_offset      = 24px
viewport_breakpoint    = 900px            # ≥900 显示右栏 / <900 折叠为 <details>
aside_max_width        = 14rem
aside_font_size        = 0.82rem
aside_line_height      = 1.5
aside_bg               = color-mix(in srgb, var(--paper) 60%, transparent)
aside_border_left      = 1px solid var(--coral)
main_max_width         = 68ch              # 保 measure
IO_rootMargin          = '-30% 0px -55% 0px'
IO_threshold           = 0
mobile_fallback        = '<details><summary>目录</summary><nav>...</nav></details>'
a11y                   = aside role="navigation" aria-label="本页大纲"; 链接 aria-current="location" 标活态
```

**files_to_change**：

- `site/src/outline.js`
- `site/src/theme.css`
- `site/scripts/build.mjs`

**估时 / loc**：3.5h / ~130 行

### friction 摘要

- step6 **high** lens_missing — cookbook 完全没"组件视觉/交互/a11y"层（sticky offset / measure / IO rootMargin / 阈值门 / 移动端折叠 / 暖纸底色对比全沉默）
- step5 **mid** cookbook_misled — ADR-3 RSC 数值借用有错位风险，新人易字面套用造成误判
- step4 **mid** cookbook_too_specific — 立场列只锁 framework 立场，对组件级 pattern 无立场可借
- step2 **mid** cookbook_too_abstract — lens-frontend 候选表 17 行全是 framework/lib 颗粒度，无"单组件 pattern"档

---

## Friction 总结

### overall_useful_rate

- 三项均 `cookbook_partial`：cost-gate（Q0）始终 carry，但候选拉取/立场列/ADR 普遍沉默。
- **useful_rate ≈ 0.55**（cost-gate 1.0 × 1/4 + 候选 0.0 × 1/4 + 立场 0.2 × 1/4 + ADR 0.4 × 1/4 = 0.4，加上工件级最终决定都成立 + 0.15）。

### high severity 列表（4 项）

| 项 | step | type | gap |
|---|---|---|---|
| #9 Pagefind | 2 | lens_missing | 三 lens 候选表 0 命中静态站搜索工具 |
| #9 Pagefind | 4 | cookbook_silent | 立场列对 Pagefind 全部沉默 |
| #11 KaTeX/Banner | 5 | cookbook_silent | 无 ADR 覆盖 CDN 脚本注入 + marked 转义协作 |
| #10 Outline | 6 | lens_missing | cookbook 无"组件视觉/交互/a11y"层 |

### 按 friction_type 分类

- `lens_missing` × 4（#9-step1 low / #9-step2 high / #11-step2 mid / #10-step6 high）
- `cookbook_silent` × 4（#9-step4 high / #9-step5 mid / #11-step2 mid / #11-step5 high）
- `cookbook_too_abstract` × 3（#9-step6 mid / #11-step4 mid / #10-step2 mid）
- `cookbook_too_specific` × 2（#11-step6 low / #10-step4 mid）
- `cookbook_misled` × 1（#10-step5 mid）
- `no_friction` × 4（不计入）

---

## 新发现 lens 缺口

### 应补 §节的现有 lens

**lens-frontend 应补**：

1. §单组件 pattern（TOC/sticky/breadcrumb/footnote/banner/admonition/callout）— 候选表 17 行全是 framework，缺组件层
2. §字体排版（KaTeX 字体回退链 / measure 保护 / 中英混排度量）
3. §a11y 默认（sticky offset / IO rootMargin / aria-current / 阈值门）

**lens-devtool 应补**：

1. §文档站搜索工具（Pagefind / lunr / MiniSearch / FlexSearch / Algolia 候选表 + 中文 segmenter 立场列）
2. §数学公式渲染（KaTeX / MathJax / 服务端预渲染 vs CDN auto-render）
3. **ADR**：『CDN 第三方脚本注入与 marked/markdown-it 协作模式』— 双重转义、heading-id 冲突、defer 时序

**lens-data 应补**：

1. §小语种/中文分词在静态索引的位置（与 BM25/dense 对比的"嵌入式 wasm 索引"档）

### 是否需要新 lens

**强烈建议新增 lens-docs**（doc-site 工程化专用）：

- 当前三 lens（frontend/data/devtool）都各覆盖 doc-site 边角，没有 lens own 整个静态文档站子域
- candidates：搜索（Pagefind/lunr/MiniSearch）/ 公式（KaTeX/MathJax）/ TOC pattern / banner-callout / 链接图（backlinks/wiki）/ 引用脚注 / RSS / 站点地图 / sidecar HTML 渲染
- ADR 候选：CDN 注入与 markdown 管线协作 / 索引体积阈值 / sidecar 静态化 vs 动态化

**或退一步**：在 lens-frontend 下开 `subtype: ui-pattern`（参考 ADR-3 的 implementation-tuning subtype 体例），专门给 sticky 组件、TOC、aside、footnote、breadcrumb 一组默认参数。

---

## Jason 实施建议（按 confidence 排序）

### #1 KaTeX + Update 横幅（confidence: high, 2.5h）

**先做这个，回报最快、风险最小**。

```bash
cd /Users/jason/intern-journal/explorations/embodied-ai-research
# 无新增 npm 依赖（KaTeX 走 CDN）
```

改动文件：

1. `site/templates/base.html` — 末尾插入 KaTeX CSS + 两个 defer script
2. `site/scripts/build.mjs` — 加 marked math extension（防双重转义）
3. `site/src/theme.css` — 追加 `.katex`、`.katex-display`、`.update-banner` 三段
4. `site/templates/partials/update-banner.html` — 新建 partial

风险：

- marked extension 优先级若放错会让 `$$...$$` 被误吃成代码块，需在 `marked.use(...)` 之前不要有冲突的自定义 tokenizer
- defer + onload 的 `renderMathInElement` 时序，若有 inline `<script>` 放在 katex 之后可能先执行；用 `DOMContentLoaded` 包一层更稳

### #2 Pagefind 中文搜索（confidence: high, 3.5h）

```bash
cd /Users/jason/intern-journal/explorations/embodied-ai-research
# Pagefind 1.5.2 已装；确认 build.mjs 末尾有 `pagefind --site dist`
npm run build  # 本地先跑一次，dist/pagefind/ 目录应自动生成
python3 -m http.server -d site/dist 8080
# 浏览器开 localhost:8080，搜"梯度下降"应命中相关 paper notes
```

改动文件：

1. `site/templates/*.html` — 顶层 `<html lang="zh">` + 正文外层 `<article data-pagefind-body data-pagefind-meta="title:h1">`
2. `site/src/search.js` — `import { PagefindUI }` + 实例化（见上方 config）
3. `site/src/theme.css` — `.pagefind-ui--reset` 字体/底色覆盖
4. `.github/workflows/deploy.yml` — 新建 GH Pages workflow（如已有则只补 build/upload 两步）

风险：

- 中文 segmenter 内置是字 + 二元 gram，对"梯度下降"召回 OK，对 OOV 长复合词（如"扩散策略"）可能切歪 — 上线后用 5-10 个真实 query 验证一次
- `data-pagefind-body` 必须包整个正文区，否则只索引 nav/footer
- GH Actions 首跑 `actions/configure-pages` 可能要在 repo Settings 手动启用一次 Pages source = "GitHub Actions"

### #3 Outline 右栏（confidence: mid, 3.5h）

```bash
cd /Users/jason/intern-journal/explorations/embodied-ai-research
# 无依赖
```

改动文件：

1. `site/src/outline.js` — 扫 H2/H3 + 渲染 `<aside>` + IO observer（H2 < 3 直接 return）
2. `site/src/theme.css` — sticky aside 样式 + media query 折叠
3. `site/scripts/build.mjs` — 在生成 HTML 时挂载 outline 容器（`<aside id="outline"></aside>`）

风险（confidence 降到 mid 的原因）：

- ADR-3 阈值（50KB/80ms/8 islands）是 RSC 上下文借精神不借字面；本场景 vanilla SSG 没有正式预算，需要自己定（建议 outline.js gzip ≤ 5KB）
- IO `rootMargin: '-30% 0px -55% 0px'` 在 viewport < 800px 时活态高亮可能漂移，移动端用 `<details>` 兜底是为此
- measure 保护（`main { max-width: 68ch }`）会改主文宽度，需先在 daily 长文上目测一次

---

## 与 4 个之前 dogfood 对比

| 轮次 | useful_rate | friction | high | 备注 |
|---|---|---|---|---|
| LangGraph v6 | 1.00 | 极低 | 0 | full sufficient，cookbook 路径全 carry |
| SaaS v6.1 | 0.89 | 中 | 1-2 | partial，但 ADR/立场基本到位 |
| OSS-RAG v6.1 | 0.89 | 中 | 1-2 | 同上 |
| recursive | — | 10 | 2 | 自指，但场景特殊 |
| **ε 首轮 embodied-ai** | **0.55** | **14** | **4** | doc-site 子域 cookbook 覆盖不足 |

**结论**：

- ε 阶段第一轮 useful_rate 显著下滑（0.89 → 0.55），friction 总数翻 1.4 倍（10 → 14），high severity 翻倍（2 → 4）。
- **根因**：embodied-ai-research 是"静态 doc-site"项目，与之前四轮（业务 SaaS / RAG / agent）属不同子域。cookbook v6 的 10 lens 在业务/数据/agent 维度密度高，但在 doc-site 工程化（搜索/公式/TOC/banner/字体）密度低。
- **行动建议**：补 lens-docs（或在 frontend/devtool 下补 §小节 + 2 条新 ADR），下一轮再 dogfood 一个 doc-site 验证 useful_rate 能否回到 0.85+。
