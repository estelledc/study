---
title: On Rendering Diffs — 零空白 Diff 渲染技术详解
来源: https://pierre.computer/writing/on-rendering-diffs
日期: 2026-06-13
分类: 数据可视化
子分类: 数据可视化
provenance: pipeline-v3
---

## 是什么

这篇文章讲了 Pierre Computer Company 怎么做一个叫 CodeView 的组件，让你能在浏览器里**秒开任意大小的代码 diff**——不管 diff 是一千行还是七百兆，滚动都不卡、不闪白。

日常类比：想象你在图书馆翻一本十万页的书。普通做法是把你看到的页面一张张贴到眼前，翻快了页面就掉下来（空白区域）。CodeView 的做法是：给你一块永远贴在眼前的玻璃板，书的内容在这块玻璃上"滑动"，玻璃板本身的边框永远不会掉——你看到的永远是有内容的。

## 为什么重要

做代码审查（code review）时，你经常要面对很大的 PR：AI 生成的实现、大量文件改动、超大补丁。普通 diff 工具在遇到大规模代码时会出现三个问题：

1. **渲染慢**——DOM 元素太多，浏览器滚动时卡顿
2. **处理慢**——语法高亮等操作被放大，成千上万次重复
3. **内存爆**——大文件变成 DOM 后占用几百 MB 甚至上 GB 内存

CodeView 的目标很极端：**你应该能直接渲染任意 diff**，不需要等、不需要分批加载。

## 核心概念 1：虚拟化（Virtualization）

虚拟化也叫"窗口化"，核心思想是：**只渲染你看得到的部分，看不见的先不画。**

普通做法是把整个 diff 一次性渲染到 DOM 里。如果有 50 万行，浏览器就得创建 50 万个元素。虚拟化做法是：视口里只显示 30-50 行对应的 DOM 节点，滚动时动态替换。

但这里有个经典难题——**空白问题（blanking）**：

```
浏览器滚动太快 → JavaScript 来不及更新 → 视口里的内容"掉下来" → 露出空白
```

文章介绍了三种虚拟化方案的权衡：

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| 传统虚拟列表 | 创建满高容器，用 absolute 定位显示区域 | 浏览器原生滚动，体验好 | 快速滚动时出现空白 |
| requestAnimationFrame 方案 | 固定容器，用 JS 帧循环更新内容 | 不会空白 | JS 卡住就跟着卡，Safari 还锁 60Hz |
| 自定义滚动 | 完全没有原生滚动条，自己模拟 | 完全可控 | 工作量巨大，要处理各平台差异 |

## 核心概念 2：反向粘滞技术（Inverse Sticky Technique）

这是整篇文章最原创的部分。CodeView 发明了一个叫**反向粘滞**的技术，让上面三种方案的问题都不再是问题。

先说普通 `sticky` 定位：你想让一个目录标题滚动时"粘"在顶部，就设 `position: sticky; top: 0`，标题会吸在容器顶部不动。

反向粘滞的做法正好相反：

```css
/* 反向粘滞核心 CSS */
.inverse-sticky-content {
  position: sticky;
  /* 关键：用负值，让内容区域"粘"在视口边缘 */
  top: calc((contentHeight - viewportHeight) * -1);
  bottom: calc((contentHeight - viewportHeight) * -1);
}
```

怎么理解？画个图：

```
┌────────────────── 浏览器视口 ──────────────────┐
│                                                  │
│  ┌────────── 超大容器（完整高度）────────┐       │
│  │   上面一大块空白区域                  │       │
│  │   （滚动时快速穿过）                   │       │
│  │                                       │       │
│  │  ┌────────────────────────────────┐  │       │
│  │  │   CodeView 渲染的内容区域       │  │       │
│  │  │   ← 滚动时粘在视口边缘不动      │  │       │
│  │  │                               │  │       │
│  │  │                               │  │       │
│  │  └────────────────────────────────┘  │       │
│  │                                       │       │
│  │   下面一大块空白区域                  │       │
│  │   （滚动时快速穿过）                   │       │
│  └──────────────────────────────────────┘       │
│                                                  │
└──────────────────────────────────────────────────┘
```

效果是：**当你快速滚动穿过空白区域时，内容区域粘在视口边缘不会掉下去，所以不会出现空白**。JavaScript 就算落后几帧也没关系——内容还粘在边缘，用户看不到跳变。

```js
// CodeView 中使用反向粘滞的简化逻辑
function useInverseSticky(contentHeight, viewportHeight) {
  // 计算粘性偏移：内容高度减去视口高度，取负值
  const stickyOffset = (contentHeight - viewportHeight) * -1;

  return {
    style: {
      position: 'sticky',
      top: stickyOffset,
      bottom: stickyOffset,
      // 这样内容在滚动过程中会粘在视口顶部或底部
      // 永远不会"滚出"视口范围
    }
  };
}
```

## 核心概念 3：内存管理

除了渲染，文章还详细讲了怎么处理大 diff 的内存问题。

### 分离字符串（Detaching Parsed Strings）

JavaScript 里有个坑：从一个长字符串里取子串，子串可能**仍然引用着原来的大字符串**，不会释放它的内存。

```
原始补丁文件: "line1\nline2\nline3\n... (700MB)"
                  ↓ 解析
需要保留的行:  ["line1", "line2", "line3"]
                  ↓ 问题：子串可能还在引用 700MB 的原始字符串！
内存占用:     2.4 GB（实际只需要 1.15 GB）
```

解决方案：**强制拷贝字符串**，让它脱离原来的大字符串：

```js
// 原始做法 — 危险，可能泄漏内存
function parseDiff(originalPatch) {
  const lines = originalPatch.split('\n');
  return lines.map(line => ({ content: line }));
  // 每个 line 可能还在引用 originalPatch
}

// 优化后 — 拷贝字符串，断掉引用
function parseDiffOptimized(originalPatch) {
  const lines = originalPatch.split('\n');
  return lines.map(line => ({
    content: String(line)  // String() 强制创建独立副本
  }));
  // 现在每个 line 都是独立字符串，原始大串可以被 GC 回收
}
```

效果：Linux 内核 v6→v7 的 diff（700MB 补丁），内存从 2.4GB 降到 1.15GB，解析速度提升 80%。

### DOM 元素池（DOM Element Pooling）

虚拟化了之后，DOM 元素虽然少，但**频繁创建销毁**会触发大量垃圾回收（GC），表现为滚动卡顿。

CodeView 的做法是**池化容器**——把整个 Shadow DOM 壳子复用起来，只清理内容部分：

```
旧做法：
  滚动离开 → 销毁整个元素（包括样式表、SVG 图集）
  滚动进入 → 重新创建整个元素 + 样式表 + SVG 图集
  ❌ 每次都重建，浪费

新做法（池化）：
  滚动离开 → 只清空内容 DOM，保留壳子
  滚动进入 → 复用壳子，只替换内容
  ✅ 样式表、SVG 图集只创建一次
```

```js
// 元素池的简化思路
const elementPool = new Map();

function getOrCreateContainer(key) {
  if (elementPool.has(key)) {
    const container = elementPool.get(key);
    // 复用：清空旧内容
    container.innerHTML = '';
    return container;
  }
  // 新建：创建完整壳子（Shadow DOM + 样式 + SVG）
  const container = createFullShell();
  elementPool.set(key, container);
  return container;
}
```

### 共享 options 状态

每个 File/FileDiff 组件原本都有自己的一份 `options` 对象。当用户切换"分栏/单栏"设置时，CodeView 要给**所有组件**创建新的 spread 对象：

```js
// ❌ 旧做法 — 每个组件各自持有一份 options
// 用户切换设置时，CodeView 遍历所有组件，逐个 spread 新对象
<File options={{ ...newOptions }} />
<FileDiff options={{ ...newOptions }} />
<File options={{ ...newOptions }} />
// ... 上万个组件，每个都要创建新对象
```

改为**单一来源 + 稳定引用 + getter** 模式：

```js
// ✅ 新做法 — CodeView 持有唯一 options，各组件通过 getter 读取
const sharedOptions = {
  // 内部状态
  _splitView: false,
  _lineNumbers: true,

  // 稳定的 getter，返回值始终来自同一份状态
  get splitView() { return this._splitView; },
  get lineNumbers() { return this._lineNumbers; },
};

// 所有组件引用同一个对象，切换时只需改状态，不需要创建新对象
<File options={sharedOptions} />
<FileDiff options={sharedOptions} />
```

## 其他关键技术

### 延迟语法高亮

语法高亮是最耗 CPU 的操作之一。CodeView 不阻塞它：

1. 文件先以纯文本渲染
2. 异步请求 worker 线程做高亮
3. 结果放入 LRU 缓存，回到视口时直接命中

```js
// 高亮可以推迟，不影响代码可读性
// 用户立即看到代码（纯文本），高亮稍后"着色"
codeView.render(diff);           // 先渲染纯文本
workerPool.highlight(diff);      // 异步高亮
codeView.setHighlight(highlighted); // 渐进式增强
```

### 行范围查找优化

从 0 开始逐行遍历查找渲染范围，在超大 hunk（几十万行）时会很慢。优化方案：**缓存位置检查点 + 二分查找**，先找到接近的位置再精确搜索。

## 还没解决的问题

文章也坦诚了一些未完成的挑战：

- **CSS 性能**——复杂 CSS 布局/绘制是虚拟化的最大开销
- **Worker 间序列化**——几万行的高亮数据通过 worker 传输很慢
- **水平滚动**——超长行（如压缩的 JS/CSS）仍然会撑大 DOM

未来计划包括轻量编辑、语义 diff、以及部分工作迁移到服务端。

## 总结

这篇文章的技术核心就一句话：在浏览器的物理限制下，做到"理论上不可能"的零空白 diff 渲染。靠的不是黑科技，而是**对浏览器底层行为的精细利用**——反向粘滞利用了 CSS sticky 的一个很少被注意的特性，字符串拷贝利用了 V8 的子串实现细节，DOM 池化利用了 Shadow DOM 的开销结构。

对零基础的读者来说，记住三个关键词就够了：**虚拟化**（只渲染可见部分）、**反向粘滞**（让内容粘在边缘不掉）、**内存管理**（断掉字符串引用 + 池化 DOM）。
