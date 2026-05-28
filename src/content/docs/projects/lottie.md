---
title: lottie-web — 把设计师的 AE 工程变成跨端可渲染 JSON 的播放器
description: 不是动画库，是 AE 到浏览器的协议层；bodymovin 插件把 After Effects 关键帧序列化成 JSON spec，AnimationItem 在主循环里按帧驱动 SVG/Canvas/HTML 三套渲染器
sidebar:
  order: 86
  label: airbnb/lottie-web
---

> airbnb/lottie-web（commit `bede03d25d232826e0c9dca1733d542d8a7754fb`，最近一次 master 提交 2024-11-19），截至 2026-05 GitHub > 31.9k stars / 2.9k forks / MIT。
> Hernan Torrisi（@hernantorrisi）2015 年从 Airbnb 内部出品，初衷是"设计师做的 AE 动画为什么不能直接放进 app"。
> 同生态的 [airbnb/lottie-ios](https://github.com/airbnb/lottie-ios)（Swift / 26k+ stars）和 [airbnb/lottie-android](https://github.com/airbnb/lottie-android)（Kotlin / 35k+ stars）共用同一份 JSON spec，这是 Lottie 真正的核心资产。

## 项目类型 self-classify

**分支 B · 工具库**——player 包就是一个 small-surface API（`lottie.loadAnimation()` + `play/pause/goToAndStop/...`），核心 800 行 `AnimationItem.js` 是绝对心脏。底线 400 行 / Figure ≥ 1 / permalink ≥ 3 / 怀疑 ≥ 3，按 v1 工具库走。

## Layer 0 · 身份扫描

| 项目 | 信息 |
|---|---|
| Repo | [airbnb/lottie-web](https://github.com/airbnb/lottie-web) |
| Stars / Forks | 31.9k / 2.9k |
| 最近活跃 | 2024-11-19（commit `bede03d`）—— 维护节奏从 2022 起明显放缓 |
| 主要语言 | JavaScript（99.9%）—— 古典 ES5 prototype，没有 TS |
| 维护方 | Airbnb Open Source；主贡献者 @hernantorrisi（创始人，独占早期 commit） |
| License | MIT |
| 当前版本 | v5.13.0（2024-11） |
| 类似项目 | [framer-motion](/study/projects/framer-motion/) / [GSAP](/study/projects/gsap/) / Rive / SVG SMIL / CSS animation |
| Bus factor | 1（@hernantorrisi 独立维护，需警惕） |
| 读时日期 | 2026-05-29 |

## Layer 1 · Why（为什么这东西存在）

如果 lottie 不存在，2015 年的世界长这样：设计师在 After Effects 里做了一段开屏动画，要给到 web / iOS / Android 三个端。可选项只有：

1. 导出为 GIF —— 256 色限制、文件大小是矢量版本的 5-10 倍、不能控制播放进度
2. 导出为 video —— 没有透明背景、解码代价重、放大就糊
3. 让前端工程师对着 AE 文件用 CSS keyframes "复刻" —— 复杂动画基本做不到，做到了也 mentor review 不过

Lottie 的核心 insight：**AE 工程本质上就是一份"图层 + 关键帧"的结构化数据**，那为什么不直接把它序列化成 JSON，让运行时按帧渲染？这样设计师不用学代码、工程师不用看 AE，中间有一份机器可读的契约。

> 引用作者 manifesto：[Introducing Lottie](https://airbnb.design/introducing-lottie/)（Airbnb Design 2017）—— "Lottie loads animations and vectors exported in the bodymovin JSON format. Bodymovin includes a JavaScript player that can render the animations on the web."

转译成我自己的话：**Lottie 不是一个动画库，是一个跨平台动画协议**。lottie-web 是这个协议的 web 实现，lottie-ios / lottie-android 是同一份 JSON 的另两个实现。**真正的产品是那份 schema**。

## Layer 2 · 仓库地形

```
lottie-web/
  player/js/                    ← 心脏目录，所有运行时逻辑
    animation/
      AnimationItem.js          ← 单个动画实例的核心 player（809 行）
      AnimationManager.js       ← 全局 RAF 循环 + 多动画注册中心（248 行）
    renderers/
      SVGRendererBase.js        ← SVG 渲染后端（255 行）
      CanvasRendererBase.js     ← Canvas 渲染后端（317 行）
      HybridRendererBase.js     ← SVG + HTML 混合（3D 元素）
    elements/
      svgElements/              ← SVG 子元素：Shape / Text / Mask / ...
      canvasElements/           ← Canvas 子元素，与 SVG 镜像
      htmlElements/             ← HTML 渲染（用于 3D / video）
      ShapeElement.js           ← 矢量形状（path / fill / stroke / trim）
    utils/
      animationFramePolyFill.js ← RAF polyfill（25 行 / IE 时代遗物）
      DataManager.js            ← JSON 加载 + 预处理
      expressions/              ← AE 表达式语言的 JS 解释器
      shapes/                   ← bezier / trim path / pooled 几何工具
    main.js                     ← public API 入口（lottie.loadAnimation 等）
  build/player/                 ← 构建产物（lottie.js / lottie_light.js / ...）
  test/                         ← Jest + 部分浏览器集成测试
  demo/                         ← 60+ 个 .json 示例动画（手工调）
```

**心脏文件清单**（commit `bede03d`）：

1. [`player/js/animation/AnimationItem.js`](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/animation/AnimationItem.js) —— 单 instance 主类（809 行）
2. [`player/js/animation/AnimationManager.js`](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/animation/AnimationManager.js) —— 全局 RAF 循环（248 行）
3. [`player/js/renderers/SVGRendererBase.js`](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/renderers/SVGRendererBase.js) —— SVG 渲染基类（255 行）

热点 commit 验证：

```bash
git log --format='' --name-only | sort | uniq -c | sort -rn | head -10
# 预期 player/js/animation/AnimationItem.js 出现在 top 5
# player/js/utils/expressions/ 路径多个文件聚合也很热（AE 表达式 = 大量 patch）
```

![Lottie 工作流架构](/study/projects/lottie/01-workflow.webp)

**Figure 1**：Lottie 工作流——设计师在 After Effects 做动画 → bodymovin 插件导出 JSON spec（含图层 / 形状 / 关键帧 / 资源引用）→ HTTP 加载或 inline 注入 → 四套 player（lottie-web 用 JS 渲染 SVG/Canvas/HTML，lottie-ios 用 Swift 写 CALayer/Metal，lottie-android 用 Kotlin 写 Canvas/View，lottie-react-native 桥接到 native）。底部对比框说明为什么不直接用 GIF/video/CSS——矢量、透明、JSON 后处理能力、多端一致是 Lottie 的四个差异点。画风：浅灰底 + 单色描边方块 + 黑色箭头（GraphViz 风），刻意不用渐变，让结构关系压过装饰。

## Layer 3 · 核心机制

> 三段独立小节，每段 ≥ 20 行真实代码 + 旁注 + 怀疑。

### (a) JSON spec 结构 —— 协议先于代码

打开任意一份 demo JSON（[`demo/bodymovin/data.json`](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/demo/bodymovin/data.json)），顶层结构非常稳定：

```json
{
  "v": "4.0.0",
  "fr": 30,
  "ip": 0,
  "op": 103,
  "w": 1820,
  "h": 275,
  "layers": [
    {
      "ddd": 0,
      "ind": 0,
      "ty": 0,
      "nm": "N",
      "refId": "comp_1",
      "ks": { "p": {...}, "s": {...}, "r": {...}, "o": {...}, "a": {...} },
      "w": 250,
      "h": 275,
      "ip": 0,
      "op": 6300,
      "st": 0
    }
  ],
  "assets": [ ... ]
}
```

**字段旁注（5 个）**：

- `v` = bodymovin schema 版本，运行时按这个分支兼容老导出
- `fr` = frame rate（帧率），`ip` / `op` = in point / out point（起止帧），`w` / `h` = composition 尺寸——这五个字段足以重放整个时间轴
- `layers[].ty`（type）= 图层类型：`0` precomp / `1` solid / `2` image / `3` null / `4` shape / `5` text / `6` audio / `13` camera。是整个渲染分发的总开关——`buildItem` 看 `ty` 选 element class
- `ks` = "kinematic state"：`p` position、`s` scale、`r` rotation、`o` opacity、`a` anchor。每个字段要么是常量 `{a:0, k:[100,100]}` 要么是关键帧序列 `{a:1, k:[{t:0, s:[0,0], e:[100,100]}, ...]}`——`a` 是 "animated" flag
- `refId` = 指向 `assets[]` 里的资源（图片或 precomp）；`assets` 里再嵌 `layers`，递归构成场景图

> 这意味着 lottie-web 的渲染本质上是**树遍历 + 关键帧插值**，不是新发明的图形 API。所有矢量渲染能力来自浏览器自己的 SVG / Canvas2D，lottie 只是把 JSON 翻译成 setAttribute / drawPath 调用。

**怀疑 1（schema 漂移风险）**：`v` 字段语义不是严格 semver。bodymovin 插件每次升级如果加了新的 `ty` 类型或 `ks` 字段，旧版本 lottie-web 会不会静默忽略？还是 fail loud？追到 [`DataManager.js`](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/utils/DataManager.js) 看 `completeData` 实现。

### (b) AnimationItem 主循环 + RAF —— 单循环驱动多实例

整个 player 的"心脏"在 `AnimationManager.js` 的 `resume` 函数里（[L100-L112](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/animation/AnimationManager.js#L100-L112)）：

```javascript
function resume(nowTime) {
  var elapsedTime = nowTime - initTime;
  var i;
  for (i = 0; i < len; i += 1) {
    registeredAnimations[i].animation.advanceTime(elapsedTime);
  }
  initTime = nowTime;
  if (playingAnimationsNum && !_isFrozen) {
    window.requestAnimationFrame(resume);
  } else {
    _stopped = true;
  }
}

function first(nowTime) {
  initTime = nowTime;
  window.requestAnimationFrame(resume);
}
```

每个 `AnimationItem` 拿到 `elapsedTime` 后调 `advanceTime`（[L492-L538](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/animation/AnimationItem.js#L492-L538)）：

```javascript
AnimationItem.prototype.advanceTime = function (value) {
  if (this.isPaused === true || this.isLoaded === false) {
    return;
  }
  var nextValue = this.currentRawFrame + value * this.frameModifier;
  var _isComplete = false;
  if (nextValue >= this.totalFrames - 1 && this.frameModifier > 0) {
    if (!this.loop || this.playCount === this.loop) {
      if (!this.checkSegments(nextValue > this.totalFrames ? nextValue % this.totalFrames : 0)) {
        _isComplete = true;
        nextValue = this.totalFrames - 1;
      }
    } else if (nextValue >= this.totalFrames) {
      this.playCount += 1;
      if (!this.checkSegments(nextValue % this.totalFrames)) {
        this.setCurrentRawFrameValue(nextValue % this.totalFrames);
        this._completedLoop = true;
        this.trigger('loopComplete');
      }
    } else {
      this.setCurrentRawFrameValue(nextValue);
    }
  } else if (nextValue < 0) {
    /* 反向播放分支，省略 */
  } else {
    this.setCurrentRawFrameValue(nextValue);
  }
  if (_isComplete) {
    this.setCurrentRawFrameValue(nextValue);
    this.pause();
    this.trigger('complete');
  }
};
```

`setCurrentRawFrameValue` 内部最终调用 `gotoFrame`（[L369-L378](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/animation/AnimationItem.js#L369-L378)）：

```javascript
AnimationItem.prototype.gotoFrame = function () {
  this.currentFrame = this.isSubframeEnabled ? this.currentRawFrame : ~~this.currentRawFrame;
  if (this.timeCompleted !== this.totalFrames && this.currentFrame > this.timeCompleted) {
    this.currentFrame = this.timeCompleted;
  }
  this.trigger('enterFrame');
  this.renderFrame();
  this.trigger('drawnFrame');
};
```

**机制旁注（6 条）**：

- **单 RAF 多 instance**：所有页面上的 lottie 动画共享一个 `requestAnimationFrame(resume)` 循环。这是性能关键——10 个 lottie 动画不会触发 10 个 RAF，节省 scheduling 开销。和 GSAP 的"single Ticker"是同样的思路
- **frameModifier = playSpeed × playDirection × frameRate / 1000**：用毫秒进的 `elapsedTime` 通过这个因子换算成"前进多少帧"。改 `setSpeed` 实际只是改 `frameModifier`
- **`~~this.currentRawFrame`** 是 ES5 时代取整 trick，等价 `Math.floor` 但快，`isSubframeEnabled` 决定是否做这个截断（subframe 渲染让动画更平滑但代价高）
- **loop 判定写在 advanceTime 里而不是 trigger 里**：因为要在同一帧内决定是 wrap 还是 stop，避免一帧延迟。`_completedLoop` flag 防止 loopComplete 事件重复触发
- **`checkSegments`** 处理 `playSegments([5, 50])` 这种"只播片段"的需求：到末尾时如果还有未播 segment 就 wrap 进下一段，否则触发 complete
- **frozen / idle 状态机**：tab 切到后台时浏览器会暂停 RAF，`activate()` 在 visibility 恢复后重新挂 RAF。`_idle` 是 lottie 自己的 state（区别于 `isPaused`），用于事件订阅者知道动画"还活着但暂时不画"

> 怀疑 2（subframe 性能代价）：`isSubframeEnabled` 默认 false 还是 true？在 60fps 屏幕上 subframe 是否真的视觉差异？追到 [`utils/common.js getSubframeEnabled`](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/utils/common.js)，看默认值和 subframe 开启时的渲染负担。

**关于 `animationFramePolyFill.js`**（[全文 25 行](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/utils/animationFramePolyFill.js)）：

```javascript
(function () {
  var lastTime = 0;
  var vendors = ['ms', 'moz', 'webkit', 'o'];
  for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
    window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
  }
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = function (callback) {
      var currTime = new Date().getTime();
      var timeToCall = Math.max(0, 16 - (currTime - lastTime));
      var id = setTimeout(function () { callback(currTime + timeToCall); }, timeToCall);
      lastTime = currTime + timeToCall;
      return id;
    };
  }
  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function (id) { clearTimeout(id); };
  }
}());
```

这是 IE9 时代的 polyfill。25 行，逻辑：枚举 4 个 vendor 前缀，都没有就退化到 `setTimeout(16ms)` 模拟 60fps。今天这文件其实可以删（IE 已经 EOL），但 lottie-web 保留是因为可能跑在嵌入式 webview / 老电视浏览器里。**这是一个项目"年龄痕迹"的好例子——能看到代码考古层。**

### (c) Renderer 抽象 —— 三套后端共享 buildItem / renderFrame 协议

`AnimationItem` 不直接画图，它持有一个 `renderer`（[AnimationItem L76-L80](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/animation/AnimationItem.js#L76-L80)）：

```javascript
const RendererClass = getRenderer(animType);
this.renderer = new RendererClass(this, params.rendererSettings);
this.imagePreloader.setCacheType(animType, this.renderer.globalData.defs);
this.renderer.setProjectInterface(this.projectInterface);
this.animType = animType;
```

`animType` 来自 `params.renderer`，三选一：`svg`（默认）/ `canvas` / `html`。三个 renderer 实现同一份接口，看 SVGRendererBase 的 `renderFrame`（[L193-L225](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/renderers/SVGRendererBase.js#L193-L225)）：

```javascript
SVGRendererBase.prototype.renderFrame = function (num) {
  if (this.renderedFrame === num || this.destroyed) {
    return;
  }
  if (num === null) {
    num = this.renderedFrame;
  } else {
    this.renderedFrame = num;
  }
  this.globalData.frameNum = num;
  this.globalData.frameId += 1;
  this.globalData.projectInterface.currentFrame = num;
  this.globalData._mdf = false;
  var i;
  var len = this.layers.length;
  if (!this.completeLayers) {
    this.checkLayers(num);
  }
  for (i = len - 1; i >= 0; i -= 1) {
    if (this.completeLayers || this.elements[i]) {
      this.elements[i].prepareFrame(num - this.layers[i].st);
    }
  }
  if (this.globalData._mdf) {
    for (i = 0; i < len; i += 1) {
      if (this.completeLayers || this.elements[i]) {
        this.elements[i].renderFrame();
      }
    }
  }
};
```

CanvasRendererBase 的 `renderFrame`（[L249-L283](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/renderers/CanvasRendererBase.js#L249-L283)）做几乎一样的两遍循环：先 `prepareFrame` 收集脏标记，再 `renderFrame` 提交。**同一份协议，两套后端实现**。

**架构旁注（7 条）**：

- **两遍循环（prepare → render）**：第一遍 `prepareFrame` 沿层级遍历，每个 element 算自己的关键帧插值并设置 `_mdf`（modified）flag；第二遍只有 `globalData._mdf === true` 才真正提交渲染——纯粹的脏区检查优化
- **倒序 prepareFrame**：`for (i = len - 1; i >= 0; i--)` 从底层到顶层 prepare，因为父子图层 inherit transform 时父先准备好；正序 renderFrame 是因为 SVG 子节点 append 顺序就是绘制顺序
- **同一接口三套实现是组合而非继承**：`renderers/SVGRenderer.js` / `CanvasRenderer.js` / `HybridRenderer.js` 都通过 [`renderersManager.registerRenderer`](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/renderers/renderersManager.js) 注册，按字符串查找。这让 build 时可以剔除不需要的 renderer（`lottie_light.js` 只含 SVG renderer）
- **HTML renderer = SVG + HTML 混合**：当 JSON 里有 3D 图层（`ddd: 1`）或 `<video>` 元素时启用，HTML 处理 3D transform、SVG 处理矢量
- **buildItem 决定 element class**：[SVGRendererBase L142](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/renderers/SVGRendererBase.js#L142) 调 `createItem(this.layers[pos])`，里面 switch `ty` 字段——`ty: 4` → `SVGShapeElement`，`ty: 5` → `SVGTextElement` 等
- **matte（蒙版）跨层依赖**：[L152-L166](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/renderers/SVGRendererBase.js#L152-L166) 当某个 layer 是 matte target（`tt` 字段），需要查找 matte source layer，可能 source 还没 build 出来 → 入 `pendingElements` 队列等下次 `checkPendingElements` 处理
- **bytecode 风格**：lottie-web 的 element 体系本质上是把 JSON spec 当作 bytecode、renderer 当作 VM。这是它能 1:1 移植到 iOS / Android 的根本原因——只要每个端实现同一套 element interface，JSON 就能跨端运行

> 怀疑 3（renderer 切换代价 / Canvas vs SVG 选型）：实际项目里 SVG 还是 Canvas 更快？仓库里有没有 benchmark？我猜：layer < 30 用 SVG（DOM 复用 + 浏览器层级合成），layer > 100 用 Canvas（避免 reflow）。但这是猜，需要追 [issue #2096](https://github.com/airbnb/lottie-web/issues/2096) 这种讨论帖验证。

## Layer 4 · 改一处（Hands-on 实验）

30 分钟跑通：

```bash
mkdir lottie-test && cd lottie-test
npm init -y
npm install lottie-web

# 下载 demo 动画
curl -o data.json https://raw.githubusercontent.com/airbnb/lottie-web/bede03d25d232826e0c9dca1733d542d8a7754fb/demo/bodymovin/data.json

# index.html
cat > index.html <<'HTML'
<!DOCTYPE html>
<html><body>
<div id="lottie" style="width:600px;height:200px;background:#222"></div>
<button onclick="anim.pause()">Pause</button>
<button onclick="anim.play()">Play</button>
<input type="range" min="0" max="103" oninput="anim.goToAndStop(this.value, true)">
<script src="node_modules/lottie-web/build/player/lottie.js"></script>
<script>
const anim = lottie.loadAnimation({
  container: document.getElementById('lottie'),
  renderer: 'svg',
  loop: true,
  autoplay: true,
  path: 'data.json'
});
window.anim = anim;
anim.addEventListener('enterFrame', () => {
  console.log('frame', anim.currentFrame.toFixed(1));
});
</script>
</body></html>
HTML

npx http-server .
# 浏览器打开 localhost:8080
```

**改一处实验**：把 `renderer: 'svg'` 改成 `renderer: 'canvas'`，重载页面：

| 观察项 | SVG | Canvas |
|---|---|---|
| DOM 元素数 | `#lottie` 下 100+ `<g>`/`<path>` | 仅 1 个 `<canvas>` |
| 浏览器 reflow | 每帧触发 attribute 修改 | 完全不触发 layout |
| 文字选择 / 可访问性 | text 可被屏读器读取 | canvas 内容对 a11y 不可见 |
| CSS hover / 单层交互 | 可以对单个 `<path>` 加事件 | 必须在 lottie 外层 div 上拦事件 |

**结论**：Canvas renderer 适合"动画就是一段视频不需要交互"的场景，SVG 适合"动画里有按钮 / 文字要点"的场景。这是 lottie-web 让你**显式选**的本质原因——浏览器没有"既快又能交互"的免费午餐。

还可以改 `loop: true` → `loop: 3`（限制循环次数），看 `complete` 事件何时触发：第 4 次循环开始前 `advanceTime` 内 `playCount === this.loop` 走 complete 分支，触发 pause + complete event。

## Layer 5 · 横向对比

### vs Framer Motion / vs GSAP / vs SVG SMIL / vs CSS animation / vs Rive

| 维度 | lottie-web | [framer-motion](/study/projects/framer-motion/) | [GSAP](/study/projects/gsap/) | SVG SMIL | CSS animation | Rive |
|---|---|---|---|---|---|---|
| 动画来源 | AE 设计稿 → JSON | 工程师写 JSX 配置 | 工程师写 timeline 链 | 工程师写 SMIL XML | 工程师写 CSS keyframes | Rive 编辑器 → .riv binary |
| 是否需设计师 | **是**（核心场景）| 否 | 否 | 否 | 否 | 是 |
| 跨端复用 | iOS / Android / RN / web 一份 JSON | 仅 web | 仅 web（GSAP for Flutter 是另一份码）| 仅 web | 仅 web | iOS / Android / web / Unity |
| 文件大小 | 10-100 KB JSON | 0（运行时生成）| 0（运行时生成）| ~10-50 KB SVG | < 1KB CSS | 5-50 KB binary |
| 运行时大小 | 230 KB lottie.js（light 130 KB）| 90 KB framer-motion | 70 KB gsap-core | 0（浏览器内置）| 0 | 100 KB rive-js |
| 矢量缩放 | 是 | 是（用 transform）| 是 | 是 | 否（CSS 限定 transform）| 是 |
| 交互 / state machine | 有限（marker / segments）| 强（手势 + variant）| 强（timeline event）| 弱 | 弱 | 强（state machine 是 Rive 第一公民） |
| 编程模型 | 命令式 player API | 声明式 `<motion.div>` | 命令式 timeline DSL | 声明式 XML | 声明式 CSS | 命令式 + state machine |
| 主要用户 | 设计师导出 + 前端集成 | React 开发者 | 全栈 + 游戏化前端 | 几乎没人用 | 所有前端 | 互动动画 + 游戏 |
| 维护活跃度 | 放缓（2022 后慢）| 活跃 | 活跃 | 已死 | N/A | 活跃 |

**选型建议**：

- **设计师产出 → 多端发布**：选 lottie，没有竞品（这是它的护城河）
- **React 应用内部组件级动画 + 手势**：选 framer-motion，开发体验最好
- **复杂时间轴 / 滚动联动 / SVG morphing**：选 GSAP，它的 timeline 模型和插件生态最深
- **小图标 hover / loading dot**：CSS animation，0 依赖
- **互动 product onboarding 含 state**：选 Rive，state machine 是 Lottie 的弱项
- **需要在 native app 跑同款动画**：lottie 最稳，Rive 次之

> 哲学差异：framer-motion / GSAP / CSS 都是"工程师定义动画行为"，lottie 是"设计师定义动画结果，工程师只触发"。这是为什么 lottie 是个**协议项目**而不是 API 项目。

## Layer 6 · 与当前工作的连接

### 今天就能用

- 项目里所有"开屏 / 空状态 / loading 转场"动画，从 GIF 换成 lottie：体积砍 10x、矢量不糊、能 pause/seek 做交互
- code review 时如果看到同事用 CSS keyframes 写超过 30 行的复杂动画，提醒"这种该交给设计师在 AE 做 + lottie 出"
- 性能预算紧的页面（首屏首屏关键路径），改用 `lottie_light.js`（130 KB → 节省 100 KB）+ Canvas renderer + 关闭 subframe
- 多端 app 项目（iOS + Android + web）需要"开屏动画三端一致"——对 PM 解释为什么 lottie 是唯一选项，避免被推回到"三端各做一份"

### 下个月能用

- 调研把项目里设计稿协作工具（Figma → 静态图）升级为 Figma → AE → lottie 的 pipeline，让设计交付里包含动画
- 给团队做一次"lottie 选型决策树" share：什么动画该 lottie / 什么该 framer-motion / 什么该 CSS——让选型不再凭直觉
- lottie 的 JSON 是**可后处理**的：写个脚本批量改色、缩放、抽帧（删掉中间关键帧 → 文件减小）。这是 GIF / video 完全做不到的能力，纳入资产 pipeline
- 实验把 lottie animation 嵌入 product tour / onboarding：用 segment marker 切片复用同一份 JSON

### 不要用的部分

- **不要把 lottie 当通用动画引擎**：组件级 hover / press 动画用 framer-motion 或 CSS，lottie 启动开销 + 230 KB 运行时不值
- **不要写 AE 表达式（expressions）**：lottie-web 的 [expressions/](https://github.com/airbnb/lottie-web/tree/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/utils/expressions) 实现是个 JS 解释器，跨端兼容性差、bug 多、调试困难；表达式应该在导出前 bake 成关键帧
- **不要依赖未文档化的 Lottie spec 字段**：bodymovin 插件升级会加新 `ty` / 新 `ks` 字段，老 lottie-web 静默忽略——产线动画有概率"忽然不动了"，定 lottie-web 版本和 bodymovin 插件版本要绑定
- **不要做 lottie animation 实时数据驱动（如进度条数字）**：lottie 是预录动画，实时数据请用 SVG / Canvas + framer-motion / GSAP；硬塞 lottie marker 同步只会写出脆弱代码

## Layer 7 · 自检 + 延伸阅读

**自检（4 个我目前答不上来的具体问题）**：

1. `animationFramePolyFill.js` 在今天的浏览器里还有任何代码路径会触发 `setTimeout` 兜底吗？追到 build 输出，看 dead code elimination 是否消掉这块
2. `_mdf` 脏标记如何向上冒泡？子 element 的 transform 修改如何让父 layer 知道"需要重画"？追 [`elements/helpers/`](https://github.com/airbnb/lottie-web/tree/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/elements/helpers) 里 hierarchy/transform helper
3. lottie-web Canvas renderer 是怎么处理 trim path（沿路径裁切动画）的？SVG 有原生 `<path stroke-dasharray>`，Canvas 必须重计算 path 子段——找 [`utils/shapes/TrimModifier.js`](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/utils/shapes/TrimModifier.js) 实现
4. 同一份 JSON 在 lottie-web / lottie-ios / lottie-android 的渲染**像素级一致**吗？哪些字段三端可能不一致？mask blend mode 在 Canvas 上是 `globalCompositeOperation`，iOS 是 CALayer mask，渲染是否完全等价——找官方 conformance test suite

**接下来读哪 3 个文件**：

| 顺序 | 文件 | 解决什么问题 |
|---|---|---|
| 1 | [`player/js/utils/DataManager.js`](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/utils/DataManager.js) | JSON 加载 + 兼容老版本 schema 的策略，理解 `v` 字段实际怎么用 |
| 2 | [`player/js/elements/svgElements/SVGShapeElement.js`](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/elements/svgElements/SVGShapeElement.js) | 矢量形状渲染入口，看 path / fill / stroke / trim modifier 链怎么组合 |
| 3 | [`player/js/utils/expressions/Expressions.js`](https://github.com/airbnb/lottie-web/blob/bede03d25d232826e0c9dca1733d542d8a7754fb/player/js/utils/expressions/Expressions.js) | AE 表达式语言 → JS 解释器，工程量最大也最 dirty 的部分（看下边界条件） |

## 限制（不能 / 不该期待 lottie 做的事）

1. **没有 state machine**：lottie segments / markers 是手动切片，没有 Rive 那种"hover → 跳到 state X"的声明式状态机。要做交互动画请选 Rive 或 framer-motion variants
2. **expressions 实现脆弱**：AE 里写过 wiggle()、loopOut() 的设计师，导出后到 lottie-web 里有概率行为不一致或 silently 失效——能在 AE 里 bake 成关键帧就 bake
3. **3D 不是真 3D**：`ddd: 1` 用 CSS 3D transform 模拟，没有真正 z-buffer / lighting / shading，复杂 3D 动画请用 three.js
4. **运行时 230 KB 不是小数**：移动端弱网 + 单页只有 1 个 lottie 动画时，可能 ROI 为负；考虑用 lottie_light（130 KB）+ 只引 SVG renderer
5. **bus factor = 1**：维护节奏 2022 后明显放缓，PR 等待时间长。要用就锁版本，别期待社区修你的 issue
6. **不适合 50+ 复杂图层 + 高 fps**：mobile 低端机在 SVG renderer 下 100+ layer 会掉帧，Canvas 也只是缓解。这种场景应该把动画切成多个 lottie，按需挂载

## 附录 · 宣传 vs 现实

| 宣传 | 现实 |
|---|---|
| "Render After Effects animations natively" | 不是 native 渲染，是 JSON 翻译成 SVG/Canvas 调用——AE 里的 motion blur / particles / many effects 不支持，导出会 silently 丢失 |
| "Tiny size compared to GIF" | JSON 比 GIF 小，但加上 230 KB 运行时常常反而更大；只有页面里有 ≥ 3 个 lottie 时才划算 |
| "Pixel-perfect across platforms" | 矢量大体一致，但 mask / matte / blend mode 在三端实现细节不同，复杂动画需要逐端测 |
| "Just works" | 设计师必须用对 bodymovin 插件版本 + 不能用某些 AE 特性 + 导出前要 bake expression——前置约束很多 |

---

升级日期：2026-05-29 · 总行数：≈ 470 · 启用工具：lottie-web v5.13 + bodymovin AE plugin + Chrome DevTools Performance · 状元篇 v1.1 工具库分支 B · commit `bede03d25d232826e0c9dca1733d542d8a7754fb`
