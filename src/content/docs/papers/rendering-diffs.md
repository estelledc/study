---
title: On Rendering Diffs — 浏览器里渲染代码 diff 为何比看起来难得多
来源: 'Amadeus Pierre, "On Rendering Diffs", Pierre Computer Company, 2026-05-29 — https://pierre.computer/writing/on-rendering-diffs'
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
---

## 从日常类比开始：红笔批改 vs 整本教材

想象你在批改学生作文。三五处修改，用红笔圈一圈、写几句评语，几分钟就能看完——这就是**小 PR**：diff 就是「改了什么」，浏览器把几屏文字画出来就行。

但如果老师拿到的是**整本教材的修订版**：上千页、每页都有脚注、目录、批注、双栏对照、语法高亮（名词标蓝、动词标绿）……你不可能把整本书一次性摊开在桌上。合理做法是：**只展开当前正在看的那几页**，翻页时再换页；批注和高亮可以稍后再补。

代码 review 里的 diff 渲染，本质上就是这套「**只渲染看得见的页** + **别在翻页时露出空白** + **别因为高亮把 CPU 拖死**」。Pierre Computer Company 在文章 *On Rendering Diffs* 里记录了他们从 `@pierre/diffs` 的 `File` / `FileDiff`，到 **`CodeView`** 这一「以虚拟化为第一原则」的组件的演进——目标是一句听起来不可能的话：

> **You should be able to just render any diff.**（你应该能「直接渲染任意 diff」。）

不是物理上无限大，而是：Bun 的 Zig→Rust 重写、Node.js 的 V8 大更新、甚至 Linux v6→v7 这种 **700MB+ patch** 都不该让 review 界面垮掉。

---

## 是什么

**On Rendering Diffs** 不是学术论文，而是一篇**工程实践长文**，作者 Amadeus Pierre 来自 Pierre Computer Company。他们开源/商业化的 **`@pierre/diffs`** 包提供可嵌入产品的 diff 渲染；**`CodeView`** 则是管理「整次 review 表面」（多文件、大 diff）的虚拟化优先组件。

文章把「在浏览器里画 diff」拆成三类成本，并逐层给出解法：

| 类别 | 典型症状 | 文章中的对策 |
|------|----------|--------------|
| **Rendering（渲染）** | DOM 节点爆炸、滚动卡顿、快速拖动滚动条出现**空白（blanking）** | 虚拟化 / windowing；**Inverse Sticky Technique** |
| **Processing（处理）** | 语法高亮、diff 解析在 main thread 上 × 文件数 | Worker 线程 + **延迟高亮**；checkpoint + 二分查找行范围 |
| **Memory（内存）** | 解析大 patch 后 JS 引擎仍持有巨型母串；GC 停顿 | **Detach 子串**；DOM 池化；**共享 options** 而非每文件一份配置 |

文中还提到 GitHub、GitLab Rapid Diffs 等工业界同类方向——diff 渲染往往不是产品本身，而是 review 工作流、Agent 输出、CI 周围的**基础设施**。

---

## 为什么 diff「看起来简单」却极难

表面上是「文本 + 红绿行」，但**合格的 review UI** 还要：

- 语法高亮（Shiki 等）→ 处理时间与 DOM 膨胀
- 行号、统一/分栏布局、换行模式、主题
- 评论、annotation → 布局与虚拟化 scroll anchoring 冲突
- **规模放大**：单文件便宜的操作，× 几千文件就变成 O(n×m)

他们第一版简单 virtualizer「只渲染视口附近」有效，但仍有：

- 高内存
- 快速滚动时的 **virtualization blanking**
- 大 hunk（数十万行）从 0 开始线性扫描找可见行范围 → **路径级慢**

`CodeView` 的设计哲学是：**渲染、内存、处理是同一问题的三个面**，不能各打各的补丁。

---

## 核心概念

### 1. Virtualization / Windowing（虚拟化 / 窗口化）

只把**视口附近**的内容放进 DOM；滚出屏幕的节点移除或回收。收益：更少 layout/paint、更低 heap。代价：要**估计或测量**每项高度，并与滚动位置同步。

常见三种路线（文章对比）：

1. **真实 scroll 容器 + 绝对定位可见项** — 滚动原生、无障碍好，但 JS 可能跟不上 → blanking
2. **`position: sticky/fixed` + rAF 更新内容** — 不会 blank，但滚动可能 hitch；Safari 上 rAF 仍 cap 60Hz
3. **完全模拟滚动** — 避开浏览器 scroll 高度限制，但要自己重做滚动手感与 a11y

### 2. Inverse Sticky Technique（反向 sticky）

Pierre 的折中：**保留原生滚动**，又尽量**不出现空白**。

普通 sticky：节标题滚到顶时「粘」在视口顶部。  
**Inverse sticky**：虚拟化内容块的**底边**在向下滚过视口时粘住底边；向上滚时**顶边**粘住顶边。JS 若落后，用户看到的是「内容块贴边停住」，而不是滚进空白区域。

关键 CSS 思路（`top` 与 `bottom` 使用同一公式）：

```css
/* contentHeight = 虚拟内容总高度，viewportHeight = 可视区域高度 */
.sticky-viewport-chunk {
  position: sticky;
  top: calc((var(--content-height) - var(--viewport-height)) * -1);
  bottom: calc((var(--content-height) - var(--viewport-height)) * -1);
}
```

外层仍是**全高 scroll 区域**（浏览器原生滚动条），内层只挂载一块「当前窗口」的 DOM。

### 3. 布局估算与行范围渲染

第一遍布局可以很便宜：

```text
文件高度 ≈ lineHeight × totalLines
diff 高度 ≈ lineHeight × splitLineCount + hunks.length × hunkSeparatorHeight
```

`CodeView` 先算「哪些文件该进 DOM」，再在文件内部算「哪些**行**该渲染」。旧实现从第 0 行扫到大 hunk 末尾——大 diff 上灾难性。改进：**position→line checkpoint 缓存 + 二分**，先跳到接近的起点再细搜。

渲染后对比 DOM **实测高度**与估算，存 delta，供 scroll anchoring 修正。

### 4. Scroll Anchoring（滚动锚定）

浏览器内置 `overflow-anchor` 在虚拟列表里常失效（挂载 DOM 总在变）。`CodeView` 显式 `overflow-anchor: none`，自己锚定：

1. 找当前**第一条完全可见**的行/文件
2. 记录其 **viewport offset** 为 anchor
3. 提交新 DOM 范围
4. 若 anchor 偏移变了 → **调整 scrollTop** 补回

这样展开 hunk、换行、改主题时，眼睛看到的代码不会「跳飞」。

### 5. 内存：Detach、池化、共享配置

- **Detach parsed strings**：V8 等引擎里，`substring` 可能仍引用巨型母串。解析 700MB patch 后只留行内容，若不 **copy/detach**，heap 仍占满原串。Linux v6→v7 案例：内存 **2.4GB → 1.15GB**，解析时间降约 **80%**。
- **DOM pooling**：虚拟化频繁 mount/unmount → GC 压力。复用带 Shadow DOM、样式表、SVG atlas 的**外壳**，只清空内部行 DOM。
- **Shared options**：原先每个 `File`/`FileDiff` 各持一份 `options`；上万实例时改主题要 spread 全体对象。改为 `CodeView` 持有一份 truth，子项通过 **getter 读共享状态**。

### 6. Deferred Syntax Highlighting（延迟语法高亮）

Shiki 在 worker 池跑；**先 plain text 立即可读**，再高亮回填。LRU 缓存 + `prime` API 预温。目标：高亮**增强**体验，不**阻塞**首屏。

---

## 代码示例 1：最小窗口虚拟化（理解 blanking 从哪来）

下面 TypeScript 片段演示「估算总高 + 只渲染 `[start, end)` 行」——与 Pierre 第一版 simple virtualizer 同类思路；**没有** inverse sticky，快速 scroll 仍可能 blank：

```typescript
type Line = { text: string; kind: "context" | "add" | "del" };

function renderDiffWindow(
  lines: Line[],
  scrollTop: number,
  viewportHeight: number,
  lineHeight: number,
  overscan = 8,
) {
  const totalHeight = lines.length * lineHeight;
  const firstVisible = Math.floor(scrollTop / lineHeight);
  const visibleCount = Math.ceil(viewportHeight / lineHeight);
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(lines.length, firstVisible + visibleCount + overscan);

  return {
    totalHeight,
    offsetY: start * lineHeight,
    slice: lines.slice(start, end).map((line, i) => ({
      index: start + i,
      ...line,
    })),
  };
}

// 用法：scroll 事件里更新 slice，把 slice 映射成 DOM；
// 容器 style.height = `${totalHeight}px`，内容块 translateY(offsetY)
```

**要点**：`overscan` 越大 blank 越少，但 DOM 越多——性能 trade-off。Inverse sticky 解决的是「JS 一时跟不上时用户仍看到旧内容贴边」，而不是无限增大 overscan。

---

## 代码示例 2：Scroll anchoring 伪代码

虚拟列表在替换 DOM 前后保持「用户正在看的那一行」不动：

```typescript
interface Anchor {
  lineIndex: number;
  offsetInViewport: number; // 该行顶相对视口顶的 px
}

function captureAnchor(
  scrollTop: number,
  lineHeight: number,
  viewportHeight: number,
): Anchor {
  const lineIndex = Math.floor(scrollTop / lineHeight);
  const lineTop = lineIndex * lineHeight;
  return {
    lineIndex,
    offsetInViewport: lineTop - scrollTop,
  };
}

function restoreScroll(
  anchor: Anchor,
  lineHeight: number,
  measuredLineTop: number, // 布局变化后该行新的文档坐标
): number {
  // 新的 scrollTop 应使 anchor 行回到相同 viewport 偏移
  return measuredLineTop - anchor.offsetInViewport;
}

// 更新流程：
// const anchor = captureAnchor(el.scrollTop, LH, el.clientHeight);
// patchDom(newRange);
// const newTop = measureLineTop(anchor.lineIndex);
// el.scrollTop = restoreScroll(anchor, LH, newTop);
```

这与 Pierre 描述的「找 first fully visible line → commit DOM → reconcile height → 修正 scrollTop」一致；也是 GitHub diff 优化、TanStack Virtual 等场景里的常见模式。

---

## 代码示例 3：Checkpoint + 二分找行范围（大 hunk）

当单个 hunk 有 **30 万行** 时，从 0 扫描找 `scrollTop` 对应行是 O(n)。checkpoint 把「文档位置 → 行号」稀疏采样，二分缩小起点：

```typescript
type Checkpoint = { docOffset: number; lineIndex: number };

function findLineAtOffset(
  checkpoints: Checkpoint[],
  targetOffset: number,
  lineHeight: number,
  totalLines: number,
): number {
  // 1. 在 checkpoints 上二分，找到 <= targetOffset 的最大 checkpoint
  let lo = 0;
  let hi = checkpoints.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (checkpoints[mid].docOffset <= targetOffset) lo = mid;
    else hi = mid - 1;
  }
  const startLine = checkpoints[lo].lineIndex;
  const startOffset = checkpoints[lo].docOffset;
  // 2. 从 startLine 线性微调（区间已很小）
  const remaining = targetOffset - startOffset;
  return Math.min(totalLines - 1, startLine + Math.floor(remaining / lineHeight));
}
```

`CodeView` 在 file/diff 级别做类似事，避免「大 review = 大 PR × 大文件 × 大 hunk」时的路径级卡顿。

---

## 与业界其他路线的对照

| 方案 | 思路 | 与 Pierre 文的呼应 |
|------|------|-------------------|
| **GitHub diff v2** | 每行组件从 8–13 个减到 2；TanStack Virtual；Map O(1) 查 comment | 同样：**少 DOM、只渲染可见、状态别绑在每行上** |
| **GitLab Rapid Diffs** | 服务端 ViewComponent 渲染 HTML，客户端只挂载 + 流式加载 | 把「首屏可见 diff」从 JS 构建 DOM 的最短路径挪到 SSR/stream |
| **octorus 等 TUI** | 可见区 slice + string interning (Rodeo) + 先 plain 后高亮 | 与 deferred highlighting、内存 detach 同构 |

Pierre 选择**浏览器内**做重活（Shadow DOM、Shiki worker），并承认仍有短板：CSS layout/paint 在激进滚动时占主导；超大行（minified JS）未做水平虚拟化；worker 与 main thread 间序列化大文件高亮结果仍贵——未来可能更多 **server-side streaming**。

---

## 产品启示（零基础也能带走的结论）

1. **Diff 不是「textarea + 颜色」** — 规模、交互、评论、主题一叠加就是系统问题。
2. **虚拟化要选「滚动语义」** — native scroll、a11y、WebKit/Tauri 目标都会影响架构；Inverse sticky 是「防 blank」的 CSS 层技巧，不是银弹（Safari 极端滚动仍可能 compositing 掉队）。
3. **先可读，再漂亮** — deferred highlighting 是 perceived performance 的经典手法。
4. **JS 字符串与 DOM 都有隐藏成本** — detach、pool、共享 config 往往比「再写一个 virtualizer」更能救大 diff。
5. **若你在做 Agent / 大 PR review** — diff 渲染应像 Pierre 说的：**产品围绕 review 建，而不是每个团队从零造轮子**。

---

## 延伸阅读

- 原文：[On Rendering Diffs](https://pierre.computer/writing/on-rendering-diffs)
- 包与文档：npm `@pierre/diffs`， playground [DiffsHub](https://diffshub.com)（GitHub URL 中 `github` 换 `diffshub` 可试大 PR）
- GitHub Engineering：[The uphill climb of making diff lines performant](https://github.blog/engineering/architecture-optimization/the-uphill-climb-of-making-diff-lines-performant/)
- GitLab：[Rapid Diffs](https://docs.gitlab.com/development/fe_guide/rapid_diffs/)

---

## 自测清单

- [ ] 能用自己的话解释：为什么「只渲染视口」仍可能出现 blanking？
- [ ] Inverse sticky 和普通 sticky 在「粘哪条边」上有什么不同？
- [ ] 大 patch 解析后为什么要 detach 子串？
- [ ] 虚拟列表为什么要自己做 scroll anchoring？
- [ ] 延迟语法高亮改善的是「真实耗时」还是「感知耗时」？
