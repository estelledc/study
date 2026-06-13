---
title: "Lottie — 把设计师的 After Effects 动画变成一份 JSON，跨端直接播放"
来源: 'https://github.com/airbnb/lottie-web'
日期: 2026-06-13
分类: 数据可视化
子分类: 动画
难度: 初级
provenance: pipeline-v3
---

## 是什么

Lottie 是一个**跨平台动画播放库**，由 Airbnb 开源。它做的事情用一句话说：设计师在 After Effects 里做的动画，导出成一份 JSON 文件，然后 web / iOS / Android 各端都能用同一份 JSON 直接播放。

日常类比：音乐盒。你不需要懂作曲——旋律已经被编码在滚筒的凸点上。你只要上发条，音乐盒就自己播放。Lottie 的 After Effects 就是"作曲"，Bodymovin 插件就是"把旋律刻到滚筒上"（导出 JSON），Lottie 播放器就是音乐盒本身。

技术上说，After Effects 工程本质上就是"图层 + 关键帧"的结构化数据——哪个图层在第几帧移动到哪个位置、透明度变成多少、形状路径是怎样。Bodymovin 插件把这些数据序列化成 JSON，Lottie 运行时读取 JSON、按帧做插值计算、驱动浏览器或原生渲染。

最简使用方式（web 端）：

```js
lottie.loadAnimation({
  container: document.getElementById('container'),
  renderer: 'svg',
  loop: true,
  autoplay: true,
  path: 'animation.json'
});
```

## 为什么重要

不理解 Lottie，下面这些事都没法解释：

- 为什么同一份动画文件能在 iOS App、Android App、网页上跑出一样的效果——背后是一份 JSON spec 三套渲染实现
- 为什么 GIF 2MB 的 loading 动画换成 Lottie 只要 50KB——矢量描述 vs 逐帧位图
- 为什么设计师说"这个动画我做了"而工程师不需要对着 AE 手写 CSS keyframes——Bodymovin 自动翻译成机器可读的 JSON
- 为什么 Duolingo、Uber、Airbnb 的 App 里那些丝滑动画不用视频格式——因为他们用的是 Lottie 的矢量渲染，放大不糊

## 核心要点

Lottie 的工作流程可以拆成三个阶段：

1. **设计师创作（After Effects）**：设计师用 AE 做出动画——图层、形状、关键帧、贝塞尔缓动曲线。这一步跟 Lottie 无关，是纯设计工作。类比：作曲家写谱子。

2. **导出为 JSON（Bodymovin 插件）**：设计师装一个免费的 Bodymovin 插件，点"导出"，AE 工程就被翻译成一份 JSON 文件。这份 JSON 里有什么？帧率（`fr`）、起止帧（`ip`/`op`）、尺寸（`w`/`h`）、每个图层的类型（`ty`）和变换关键帧（`ks`）。类比：把五线谱翻译成音乐盒滚筒上的凸点——所有信息都在，只是换了种编码。

3. **各端播放（Lottie 运行时）**：web 端用 lottie-web（230KB），iOS 用 lottie-ios，Android 用 lottie-android。三套实现读取同一份 JSON，按帧做插值计算，驱动各自的渲染后端（SVG/Canvas/Core Animation）。类比：同一个滚筒放进不同的音乐盒都能播放——因为"协议"（凸点位置）是统一的。

关键洞察：**Lottie 本质上不是一个动画库，是一个跨平台动画协议**。真正的产品是那份 JSON schema——它定义了图层、关键帧、缓动曲线的标准表示法。各端的 player 只是协议的"翻译器"。

## 实践案例

### 案例 1：多端统一开屏动画

场景：App 的开屏动画需要在 iOS、Android、Web 三端完全一致。

```js
// Web 端
lottie.loadAnimation({
  container: document.getElementById('splash'),
  renderer: 'svg',
  loop: false,
  autoplay: true,
  path: '/animations/splash.json'
});
```

```swift
// iOS 端
let animationView = LottieAnimationView(name: "splash")
animationView.play { finished in
  // 动画播完，进入主界面
}
```

同一份 `splash.json`，两个平台各写 3 行代码。设计师在 AE 里改一版 → 重新导出 JSON → 三端同时更新。不需要工程师对着新设计稿手写 CSS。

### 案例 2：用 Lottie 替换页面里的 GIF loading 动画

```js
// 之前：一个 1.5MB 的 loading.gif
// 之后：一个 35KB 的 loading.json + 230KB lottie runtime

const anim = lottie.loadAnimation({
  container: document.getElementById('loading'),
  renderer: 'canvas',   // loading 不需要交互，用 canvas 更快
  loop: true,
  autoplay: true,
  path: '/animations/loading.json'
});

// 数据加载完成后停止
fetchData().then(() => {
  anim.destroy();
  document.getElementById('loading').remove();
});
```

矢量不糊、体积是 GIF 的 1/5、还能在加载完成时平滑停止——GIF 做不到"停在某一帧"。

### 案例 3：性能优化——多动画场景选 Canvas + lottie_light

```js
// 页面有 5 个装饰动画 + 无需交互 → 选 Canvas renderer
const anims = ['deco1', 'deco2', 'deco3', 'deco4', 'deco5'].map((id, i) => {
  return lottie.loadAnimation({
    container: document.getElementById(id),
    renderer: 'canvas',
    loop: true,
    autoplay: true,
    path: `/animations/${id}.json`,
    rendererSettings: {
      clearCanvas: true,
      progressiveLoad: false,
      hideOnTransparent: true
    }
  });
});
```

五个动画共享一个 `requestAnimationFrame` 循环（Lottie 的 AnimationManager 做了这个优化），Canvas 渲染不触发 DOM reflow。引入 `lottie_light.js`（130KB，只含 SVG renderer 的那一版不适合这里——Canvas renderer 需要完整版）。

## 踩过的坑

1. **JSON 体积比你想象的大**：一个带 50 层的 AE 工程导出可能 500KB+。虽然比 GIF 小，但加上运行时 230KB，单页只放一个 Lottie 动画时 ROI 可能为负——页面有 3+ 个动画才开始划算。

2. **不是所有 AE 特效都支持**：motion blur、粒子系统、3D 光照——Bodymovin 导出时这些会静默丢失，JSON 里根本没有对应字段。设计师需要知道"能用什么、不能用什么"的白名单。

3. **表达式跨端行为不一致**：AE 的表达式语言（如 `wiggle()`、`loopOut()`）在 lottie-web 里有一个 JS 解释器实现，但这个实现是"尽力而为"级别——复杂表达式在 iOS/Android/web 三端结果可能不同。规则：能在导出前 bake 成关键帧就 bake。

4. **SVG vs Canvas 选择纠结**：SVG 的每个图层是真实 DOM 节点，可加事件、可被屏读器读取，但 100+ 图层时会掉帧；Canvas 只有一个 `<canvas>` 元素，渲染快但对无障碍完全不可见。经验法则：30 层以下用 SVG，100+ 层用 Canvas，中间地带实测决定。

## 适用 vs 不适用场景

**适用**：
- 设计师用 After Effects 产出动画，需要多端（web + iOS + Android）一致交付
- 开屏动画、loading 转场、空状态插图——这些"预录好、只需播放"的场景
- 页面有 3+ 个装饰性动画，用一份运行时摊薄成本
- 需要矢量缩放（Retina 屏不糊）、运行时控制（pause/seek/调速）

**不适用**：
- 简单的 hover/press 微交互——CSS transition 零依赖，Lottie 230KB 过重
- 需要状态机的交互动画（hover → 展开 → 点击 → 关闭）——选 Rive 或 framer-motion variants
- 实时数据驱动的动画（如股票走势图动画）——Lottie 是预录动画，不是实时渲染引擎
- 复杂 3D 场景（光照、阴影、z-buffer）——选 three.js，Lottie 的 3D 只是 CSS 3D transform 模拟

## 历史小故事（可跳过）

- **2015 年**：Airbnb 设计师 Hernan Torrisi 受不了"设计师做动画 → 工程师手写 CSS 复刻"的流程，写了 bodymovin 插件——把 AE 工程导出为 JSON，再写一个 JS 播放器读取它。最初只是内部工具。
- **2017 年**：Airbnb Design 正式以 "Lottie" 品牌发布，一并开源 lottie-web、lottie-ios、lottie-android 三个仓库。名字来自电影《Loving Vincent》的动画师 Lottie Reiniger——世界上第一位女性动画导演。
- **2020 年前后**：LottieFiles 社区崛起，提供海量免费 Lottie 动画模板，设计师不再需要从零画。Lottie 格式本身也进化到 v5.x，加了表达式支持。
- **2022 年后**：官方维护明显放缓，bus factor = 1（Hernan Torrisi 独立维护）。但生态已成熟——31.9k GitHub stars，被无数 App 使用，格式本身已趋于稳定。

## 学到什么

1. **设计师和工程师之间的"协议层"是最高杠杆的设计决策**——Lottie 的真正发明不是播放器代码，而是那份 JSON schema。它让两个角色各自在自己的工具里工作，中间用一份机器可读的契约握手。
2. **矢量 + 关键帧比逐帧位图高效一个数量级**——这是 Lottie 比 GIF 小 5-10 倍的根本原因。同样的道理也适用于 SVG vs PNG、字体 vs 文字图片。
3. **同一份接口、多套实现是跨平台项目最稳的架构**——lottie-web 的 SVG/Canvas/HTML 三套渲染器共享 buildItem + renderFrame 接口，这是它敢说"跨端一致"的底气。
4. **开源项目的 bus factor 是真实的维护风险**——Lottie 功能强大但 2022 年后只剩一人维护，PR 响应慢。生产使用要锁版本。

## 延伸阅读

- Lottie 官方文档：[airbnb.io/lottie](https://airbnb.io/lottie/)——包含 web/iOS/Android 三端 API
- LottieFiles 动画市场：[lottiefiles.com](https://lottiefiles.com/)——海量免费动画，可在线编辑颜色/速度后下载
- Bodymovin 插件文档：[github.com/airbnb/lottie-web](https://github.com/airbnb/lottie-web) 的 Wiki——导出白名单（哪些 AE 特性支持、哪些不支持）
- [[framer-motion]] —— React 生态的声明式动画库，适合组件级交互动画（Lottie 是预录动画，两者互补）
- [[gsap]] —— 时间轴驱动的命令式动画库，适合复杂序列编排（Lottie 是设计师产出，GSAP 是工程师手写）
- [[threejs]] —— 真 3D 渲染，Lottie 的 `ddd: 1` 只是 CSS 3D transform 模拟

## 关联

- [[framer-motion]] —— React 声明式动画，与 Lottie 互补：framer-motion 做交互，Lottie 做预录
- [[gsap]] —— 工程师手写时间轴动画，Lottie 是设计师画好导出，同一个场景不同路径
- [[react]] —— Lottie 在 React 项目中最常用，通常封装成一个 `<LottiePlayer>` 组件
- [[ffmpeg]] —— 如果你把 Lottie 动画转成视频做降级方案，ffmpeg 是核心工具
- [[threejs]] —— Lottie 的 3D 能力很弱，需要真 3D 场景时选 three.js

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[accompanist]] —— Accompanist — Jetpack Compose 的「补丁工具箱」
- [[anime]] —— anime.js — 一行 JS 让网页元素按时间线动起来
- [[cocos2d-x]] —— Cocos2d-x — 一份 C++ 代码把 2D 手游跑遍 iOS / Android
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[defold]] —— Defold — King 出品 Lua 引擎，移动优先 + 一键跨平台打包
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[framer-motion]] —— Framer Motion — React 声明式动画
- [[gsap]] —— GSAP — GreenSock 高性能动画
- [[motion-one]] —— Motion One — 把动画交给浏览器自己跑
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
- [[react]] —— React UI 组件库
- [[threejs]] —— three.js — Web 3D 事实标准

