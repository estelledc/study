---
title: lottie-web — 把 AE 动画变成网页可播放的 JSON
description: "介绍 lottie-web 如何把 After Effects 动画导出为 JSON 并在浏览器中播放。"
来源: 'https://github.com/airbnb/lottie-web'
日期: 2026-05-29
分类: 动画
难度: 初级
---

## 是什么

lottie-web 是一个**在网页里播放 After Effects 动画的 JavaScript 播放器**。设计师用 AE 做动画，再用 bodymovin 插件导出一份 JSON，前端用 lottie-web 把这份 JSON 画成 SVG、Canvas 或 HTML。

日常类比：它像一台会读乐谱的自动钢琴。AE 工程是音乐家的演奏，bodymovin 把演奏写成乐谱，lottie-web 在浏览器里按乐谱一拍一拍弹出来。

所以 Lottie 不只是"一个动画库"。更准确地说，它是一种**动画交付格式 + 播放器生态**：同一份 JSON 可以给 Web、iOS、Android 等平台各自的播放器使用。

最小用法长这样：

```js
const anim = lottie.loadAnimation({
  container: document.querySelector("#logo"),
  renderer: "svg",
  loop: true,
  autoplay: true,
  path: "/animations/logo.json",
});
```

## 为什么重要

不理解 lottie-web，下面这些事会很难解释：

- 为什么很多 app 的开屏、空状态、loading 动效不再交 GIF，而是交一份 `.json` 文件。
- 为什么设计师可以在 AE 里做复杂时间线，工程师不用照着一帧帧重写 CSS keyframes。
- 为什么同一段品牌动画能同时放到 Web、iOS、Android，核心不是代码相同，而是**中间格式相同**。
- 为什么 Lottie 有时比 GIF 小很多，但有时又因为播放器本身变重：省的是素材体积，不一定省运行时代码。

## 核心要点

1. **JSON 是乐谱**：Lottie JSON 记录帧率、尺寸、图层、关键帧、形状、文字和图片资源。类比：乐谱不发出声音，但它规定了每个音什么时候出现、持续多久、用什么力度。

2. **播放器是乐手**：lottie-web 读取 JSON 后，每一帧计算当前位置、透明度、旋转、路径形状，再交给 SVG 或 Canvas 画出来。类比：同一份谱子，小提琴和钢琴都能演，但音色和限制不同。

3. **工作流比 API 更关键**：它解决的是"设计师交付动画"这件事，而不是替代所有动画代码。类比：快递单统一了包裹信息，仓库和配送车才能协作；Lottie JSON 统一了动画信息，设计和工程才能协作。

## 实践案例

### 案例 1：网页里播放一个 loading 动画

```html
<div id="loading" style="width:160px;height:160px"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.13.0/lottie.min.js"></script>
<script>
const loading = lottie.loadAnimation({
  container: document.getElementById("loading"),
  renderer: "svg",
  loop: true,
  autoplay: true,
  path: "/loading.json",
});
</script>
```

逐部分解释：
- `container` 是舞台，lottie-web 会往这里插入 SVG 或 Canvas。
- `renderer: "svg"` 表示用 DOM 里的 `<svg>` 节点画，清晰、可缩放，也便于调试。
- `path` 指向 bodymovin 导出的 JSON 文件，不是视频文件。
- 返回的 `loading` 是动画实例，后面可以 `pause()`、`play()`、`destroy()`。

### 案例 2：用进度条控制动画帧

```html
<input id="seek" type="range" min="0" max="100" value="0" />
<script>
seek.addEventListener("input", () => {
  const frame = Number(seek.value);
  loading.goToAndStop(frame, true);
});
</script>
```

逐部分解释：
- `goToAndStop(value, true)` 的第二个参数表示 `value` 是帧号，不是秒数。
- 拖到第 40 帧，播放器就计算第 40 帧所有图层的状态，然后停在那里。
- 这就是 Lottie 比 GIF 强的地方：GIF 只能播放，Lottie 可以暂停、跳帧、分段播放。

### 案例 3：切换 SVG 和 Canvas renderer

```js
lottie.loadAnimation({
  container: document.querySelector("#hero"),
  renderer: "canvas",
  loop: 3,
  autoplay: true,
  path: "/hero.json",
});
```

逐部分解释：
- `renderer: "canvas"` 只留下一个 `<canvas>`，适合图层很多、无需单层交互的动画。
- `loop: 3` 表示循环 3 次后停止，不是只能传布尔值。
- 如果动画里的文字需要被复制、屏幕阅读器读取，SVG 通常比 Canvas 更合适。
- 如果页面里同时挂很多复杂动画，Canvas 可能更稳，但仍要实测低端机。

## 踩过的坑

1. **把 Lottie 当视频用**：只想播一次开屏可以，但如果要实时改数字、图表或进度，应该用 SVG/Canvas 自己画，原因是 Lottie 更像预录时间线。

2. **AE 特效不是全支持**：motion blur、粒子、复杂表达式、视频和音频等能力可能导出后失效，原因是 JSON 播放器只实现了 AE 的一部分。

3. **没锁 bodymovin 和播放器版本**：设计师插件升级后可能导出新字段，旧播放器不一定认识，原因是格式和运行时是两条发布线。

4. **忘记销毁实例**：SPA 页面切换后动画还挂着 RAF 或资源，原因是 `loadAnimation` 创建了真实运行时对象，离开页面要 `anim.destroy()`。

## 适用 vs 不适用场景

**适用**：

- 开屏、空状态、loading、成功反馈、品牌插画这类线性或半线性的动效。
- 设计师已经在 AE 里完成时间线，工程团队只负责接入和触发。
- 同一份动效要给 Web、iOS、Android 多端复用。
- 需要比 GIF 更清晰、更可控，并且愿意接受一个播放器运行时。

**不适用**：

- hover、drag、layout transition 这类组件级交互动画 → 用 [[framer-motion]] 或 CSS。
- 多段精细编排、滚动联动、复杂时间轴 → 用 [[gsap]] 更合适。
- 带状态机的互动角色或仪表盘 → 看 [[rive]]。
- 大量粒子、3D、物理碰撞或游戏场景 → 用 [[threejs]]、[[pixi]] 或游戏引擎。

## 历史小故事（可跳过）

- **2015 年前后**：设计师在 AE 做动效，工程师常见交付物是 GIF、视频，或者一堆需要手工复刻的关键帧。
- **2017 年**：Lottie 对外被广泛介绍，核心口号是让设计师创建并交付动画，不再让工程师痛苦复刻。
- **后来几年**：Web、iOS、Android、React Native 等播放器围绕同一份 JSON 生态成长，Lottie 变成跨端动效交付的默认选项之一。
- **2022 年以后**：lottie-web 维护节奏明显放缓，但项目仍有大量存量使用；生产环境更应该锁版本、做回归测试。

## 学到什么

- Lottie 的真正价值不是"动画更炫"，而是把设计稿变成机器可读、跨端可播放的格式。
- JSON 里保存的是图层和关键帧，播放器每帧做插值和渲染，所以它能暂停、跳帧、分段。
- SVG、Canvas、HTML renderer 没有绝对优劣；选择取决于图层数量、交互需求、可访问性和性能预算。
- 用 Lottie 等于引入一条设计工程流水线：AE 约束、导出版本、播放器版本、低端机性能都要一起管。

## 延伸阅读

- 官方仓库：[airbnb/lottie-web](https://github.com/airbnb/lottie-web) —— Web 播放器、bodymovin 插件和 README 示例。
- 官方文档：[Lottie Docs](https://airbnb.io/lottie/) —— API、导出说明、FAQ 和示例入口。
- 介绍文章：[Introducing Lottie](https://airbnb.design/introducing-lottie/) —— 了解这个项目最初想解决的设计交付问题。
- AE 导出说明：[bodymovin / lottie wiki](https://github.com/airbnb/lottie-web/wiki) —— 查支持哪些 AE 特性。
- [[framer-motion]] —— React 组件级动画，对照 Lottie 的素材播放边界。
- [[gsap]] —— 时间轴和滚动动画，对照 Lottie 的设计稿交付边界。

## 关联

- [[framer-motion]] —— 工程师在 React 里声明组件状态，Lottie 更偏设计师导出的时间线。
- [[gsap]] —— GSAP 擅长命令式编排，Lottie 擅长播放已设计好的动效素材。
- [[rive]] —— Rive 把状态机和数据绑定放进动画文件，补上 Lottie 交互弱的地方。
- [[svg]] —— lottie-web 默认常用 SVG renderer，矢量缩放和 DOM 可调试性都来自它。
- [[canvas]] —— Canvas renderer 适合复杂图层但牺牲单个元素的 DOM 交互。
- [[react]] —— React 项目里常用 wrapper 接 Lottie，同时要处理组件卸载时的销毁。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
