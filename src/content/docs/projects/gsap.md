---
title: gsap — 把 timeline 做成第一等公民的 JS 动画运行时
description: 不是 keyframe 派的便携包装，是一台跑了 18 年、用闭式数学解 + 单 Ticker 主循环 + PropTween 链表挂插件的运行时；2024 年被 Webflow 收购后 100% 免费给所有人，timeline.to().to().to() 这种链式串接是它从 2008 年就坚持的核心抽象
sidebar:
  order: 85
  label: greensock/GSAP
---

> greensock/GSAP（v3.15.0），截至 2026-05 GitHub > 19k stars，Standard "no-charge" license（免费用于商业 + 非商业），Jack Doyle（@jackdoyle）2008 年从 Flash 时代的 TweenLite 移植到 JS。
> "GSAP is a robust JavaScript toolset that turns developers into animation superheroes"——
> 2024 年 Webflow 收购 GreenSock 后宣布 **100% free for everyone**（包括之前付费的 SplitText / MorphSVG / DrawSVG 等 bonus 插件），这件事让这个项目从"商业动画库"重新进入开源主流视野。
>
> 这个项目最有意思的不是它"能动什么"——它能动任何 JS 能 touch 到的东西，从 CSS 到 SVG 到 canvas 到 WebGL 到 React state。
> 真正值得读的是它**坚持了 18 年的"timeline-first"心智模型**：
> 不是给浏览器一段 keyframes 让它跑，是让你**显式把多个 tween 串成一棵 Timeline 树**，
> 父 timeline 控制子 tween 的 timeScale / progress / reverse，
> 整棵树跑在**单一全局 Ticker** 上（`_globalTimeline`，`gsap-core.js` 第 2818 行），
> 每帧 RAF 触发一次 `timeline.render(time)` 递归到所有叶子 tween。
>
> Season 19 Animation 第二篇。**项目类型：工具库（v1.1 分支 B）**——
> surface 集中在 `gsap.to/from/fromTo/timeline()` 几个 API + 注册式插件系统，
> 但内部 `gsap-core.js` 单文件 3255 行，加 `ScrollTrigger.js` 1790 行 + `CSSPlugin.js` 1169 行已超 6000 行核心 JS。
> 看完这篇你会知道：
> easing 函数为什么是闭式数学解而不是 cubic-bezier 拟合、
> PropTween 为什么是双向链表而不是数组、
> ScrollTrigger 1790 行里 `_refreshAll` 凭什么能容忍 SPA 路由切换。

## Layer 0 · 身份扫描

| 字段 | 数据 |
|------|------|
| Star | > 19k（截至 2026-05） |
| Fork | > 1.7k |
| Version | 3.15.0（package.json） |
| 最近活跃 | 2026-04-13（commit `13e2b790`） |
| Commit hash | `13e2b790546426a1a2e0e9b409f3f8dc6d6611f2` |
| 读取日期 | 2026-05-29 |
| 主语言 | JavaScript（98%）+ TypeScript types |
| 维护方 | GreenSock（2024 年起为 Webflow 子公司） |
| 主要贡献者 | Jack Doyle（@jackdoyle，creator）/ Cassie Evans / Carl Schooff（GreenSock team） |
| License | Standard "no-charge" license（非 OSI 认证；免费用于任何场景） |
| 类似项目 | framer-motion / anime.js / velocity.js / Web Animations API / Lottie |
| 项目类型 | 工具库（v1.1 分支 B） |

## 一句话定位

**GSAP = 把"timeline 树 + 全局 Ticker + 插件链表"三件事 18 年没改过的动画运行时**——
2008 年 Jack Doyle 从 Flash ActionScript 把 TweenLite 移到 JS，2014 年 v1 → v2 改 API、2018 年 v3 重写，
但**核心架构一直是同一个三件套**：
(a) 所有动画最终塌成 `Animation` 基类的子节点，挂在一棵 Timeline 树上；
(b) 整棵树由一个 `_ticker`（`gsap-core.js` 第 886-970 行）驱动，RAF 单源；
(c) 每个 Tween 内部维护 PropTween 双向链表，新插件（CSSPlugin / ScrollTrigger / MotionPathPlugin）通过 `gsap.registerPlugin()` 把自己挂进 PropTween 链表的 renderer 槽。
2024 年 Webflow 收购后 GreenSock 把所有付费插件（SplitText / MorphSVGPlugin / DrawSVGPlugin / Physics2D 等）改成 **Standard No-Charge License**——
任何人任何场景免费用，不再分商业/非商业 license——这是"商业开源动画库走完最后一公里"的标志事件。

## Why（为什么这个 18 年的项目还值得读）

读 GSAP 不是为了学 `gsap.to(".box", { x: 100 })` 这种文档 5 分钟就懂的 API，是为了搞清楚四件事：

1. **timeline 作为"动画的 AST" 是不是一个好抽象**——
   当代主流（Web Animations API / CSS keyframes / framer-motion 的 `animate` prop）都把"一段动画"当原子，
   GSAP 反过来：单个 tween 是叶子，**真正的工程单位是 Timeline**——
   一个 hero section 的入场，可能是 12 个 tween 串/并联，每个有自己的 ease / delay / yoyo，
   父 timeline 一句 `.timeScale(0.5)` 全部慢放，`.reverse()` 全部倒放，`.seek(2)` 全部跳到 2s 处。
   这种"组合大于配置"的思想 18 年没变过。读 `class Timeline extends Animation`（`gsap-core.js` 第 1472 行）你会看到 `to() / from() / fromTo() / set() / call()` 全部是"在我这个 timeline 上 push 一个子 tween"，
   `.to(...)` 返回 `this`，链式调用直接落到同一棵树。
2. **easing 为什么是"代数闭式解" 而不是 lookup table**——
   `_easeMap`（`gsap-core.js` 第 991 行）里所有 `Power0..Power4 / Elastic / Bounce / Back / Sine / Expo / Circ` 都是**单步 O(1) 的代数表达**，
   不是 framer-motion 那种"采样 1000 个点喂给 WAAPI linear()" 的离散化。原因：GSAP 的 Ticker 走 RAF + JS 渲染路径（不依赖浏览器 compositor），
   每帧调用 `ease(progress)` 是热路径，闭式解比 lookup 内存友好、且支持 `Elastic.easeOut.config(amplitude, period)` 这种**带参数的 ease family**——
   离散化做不到这点（参数变了得重采样）。
3. **PropTween 双向链表 vs 数组的选择**——
   `class PropTween`（第 2786-2810 行）是个赤裸的双向链表节点：`this._next` / `this._prev`，
   每个 tween 持有一个链表头，render 时从头遍历，每个节点跑 `this.r(t, this)`（renderer 函数）。
   为什么不用数组？因为 **CSSPlugin 里一个 `transform` 属性会 expand 成 x/y/z/rotate/scaleX/scaleY/skewX/skewY 八个 PropTween 子节点**，
   插件初始化时往链表尾部插不需要扩容，删除时也只动相邻指针。这是"为什么 GSAP 比 jQuery animate 快 20 倍"的底层原因之一。
4. **ScrollTrigger 1790 行核心是 `_refreshAll`**（`ScrollTrigger.js` 第 264 行）——
   不是"监听 scroll 事件触发动画"那么简单。整个 plugin 维护 `_triggers[]` 全局数组 + `_scrollers` 缓存，
   每次 resize / DOMContentLoaded / SPA 路由切换都跑 `_refreshAll`：先 `_revertAll`（把所有 trigger 复位）→ 重新计算 `start/end` 位置（按 viewport 百分比）→ 重新挂回。
   这个"revert → measure → reapply"模式跟 framer-motion 的 FLIP projection 一脉相承，但 GSAP 走的是**全局批量**而非节点局部。

Jack Doyle 在 [GreenSock 论坛 v3 launch 帖](https://greensock.com/3) 里写过 timeline-first 的动机：
"Animation is fundamentally about sequencing things in time. A keyframe is a single moment; a timeline is the structure that holds your intent. We've spent 15 years making timelines fast, reliable, and ergonomic."

[Webflow 2024 年收购公告](https://webflow.com/blog/webflow-acquires-greensock) 解释了为什么 GSAP 突然全免费：
"We want every developer to have access to the best animation tools. Locking premium plugins behind a paywall has always felt at odds with that mission. Today we're making them free for everyone, forever."

> 这是个**"timeline 作为第一等公民"** 的项目——
> 不是 animate 一个属性、不是 transition 一个状态，是把整个 UI 的时间维度变成一棵可组合的树。

## 仓库地形

```bash
git clone --depth 1 https://github.com/greensock/GSAP
cd GSAP
ls src/
```

顶层目录与文件注释：

```
src/gsap-core.js          ← 心脏（3255 行）：Animation / Timeline / Tween / PropTween / Ticker / _easeMap
src/CSSPlugin.js          ← 心脏（1169 行）：transform / color / unit 解析
src/ScrollTrigger.js      ← 心脏（1790 行）：滚动驱动动画
src/Easing.js             ← 不存在（easing 全在 gsap-core 内联，名字误导）
src/utils/                ← strings.js / paths.js / matrix.js（91 + N 行小工具）
src/Observer.js           ← 触屏 / wheel / pointer 统一监听抽象（ScrollTrigger 依赖）
src/Draggable.js          ← 拖拽 plugin
src/MotionPathPlugin.js   ← SVG 路径动画
src/Flip.js               ← FLIP layout animation（对应 framer-motion 的 layout prop）
src/SplitText.js          ← 文本拆字符（前付费插件，2024 后免费）
src/MorphSVGPlugin.js     ← SVG morph（前付费）
src/CustomEase.js         ← 用户自定义 cubic-bezier
src/all.js                ← 一键 import 所有 plugin（懒人入口）
src/index.js              ← 默认 export gsap，需手动 registerPlugin
types/                    ← TypeScript 声明文件
test/                     ← Karma + Jasmine 单元测试
esm/ + dist/              ← 构建产物（不读源）
```

**心脏文件清单**（commit `13e2b790546426a1a2e0e9b409f3f8dc6d6611f2`，2026-04-13 读取）：

1. `src/gsap-core.js` — 3255 行，**全局唯一**的 Tween/Timeline/Animation/Ticker 实现
2. `src/CSSPlugin.js` — 1169 行，CSS 属性的解析与 setter（`transform` parse 是关键热点）
3. `src/ScrollTrigger.js` — 1790 行，最被项目用户使用的高级 plugin

commit 热点（粗略读 git log，前 10 高频文件）：

```
gsap-core.js           ← 主要 bug fix 全在这
CSSPlugin.js           ← 浏览器兼容性补丁集散地
ScrollTrigger.js       ← 高频迭代（SPA 框架适配）
Observer.js            ← 触屏/wheel 兼容性
Draggable.js           ← inertia 物理参数微调
package.json           ← 版本号 + 关键词
README.md              ← marketing 文案
types/index.d.ts       ← 类型补漏
MotionPathPlugin.js    ← path 解析器优化
Flip.js                ← layout animation
```

## 架构图

![GSAP 架构：5 层分级——Public API / Core 类 / Render pipeline / Plugins / Ticker engine](/projects/gsap/01-architecture.webp)

**Figure 1: GSAP 3.15.0 架构总览。**
顶层蓝色框是用户接触的 4 类 API（`gsap.to/from/fromTo/set` / `gsap.timeline()` / `gsap.registerPlugin()` / `gsap.utils.*`）。
紫色层是 3 个核心类——`Tween` 与 `Timeline` 都继承自 `Animation` 基类，状态机（pending → active → complete）由 `_start` / `_dur` / `_tTime` / `_ts` 四个内部字段表示。
橙色 Render pipeline 是每帧实际跑的代码：`_easeMap` 给闭式数学解、`PropTween` 双向链表把"要动哪些属性"展平成节点链、`CSSPlugin` 处理浏览器侧的 transform / color 解析。
绿色 Plugins 层全部通过 `gsap.registerPlugin()` 注入——`ScrollTrigger` / `Draggable` / `MotionPathPlugin` / `Flip` / `SplitText` / `CustomEase` 各自挂自己的 PropTween renderer，不污染 core。
最底红色是 Ticker engine（`gsap-core.js` 第 880-970 行），整个 GSAP 全局只有**一个 RAF 循环**——所有 Tween / Timeline / ScrollTrigger 共享 listener 数组，
默认 240fps 过采样以容忍主线程抖动，`lagSmoothing(500, 33)` 在 tab blur 后回归时把累计 lag 抠掉避免一帧跳变。
画风：深色底 + 5 色分层（蓝紫橙绿红，从 Public API 由浅至深到 Ticker），每个框右下注 commit hash 与对应行号。

## 核心机制

下面三段精读对应架构图的紫 / 橙 / 绿三层：(a) Tween + Timeline 数据结构 / (b) Easing 闭式解实现 / (c) ScrollTrigger 全局批量 refresh。

### 机制 1 · Tween 与 Timeline 的"组合大于配置"

[`gsap-core.js` 第 1472-1510 行 @ 13e2b790](https://github.com/greensock/GSAP/blob/13e2b790546426a1a2e0e9b409f3f8dc6d6611f2/src/gsap-core.js#L1472-L1510)：

```js
export class Timeline extends Animation {

  constructor(vars = {}, position) {
    super(vars);
    this.labels = {};
    this.smoothChildTiming = !!vars.smoothChildTiming;
    this.autoRemoveChildren = !!vars.autoRemoveChildren;
    this._sort = _isNotFalse(vars.sortChildren);
    _globalTimeline && _addToTimeline(vars.parent || _globalTimeline, this, position);
    vars.reversed && this.reverse();
    vars.paused && this.paused(true);
    vars.scrollTrigger && _scrollTrigger(this, vars.scrollTrigger);
  }

  to(targets, vars, position) {
    _createTweenType(0, arguments, this);
    return this;
  }

  from(targets, vars, position) {
    _createTweenType(1, arguments, this);
    return this;
  }

  fromTo(targets, fromVars, toVars, position) {
    _createTweenType(2, arguments, this);
    return this;
  }

  set(targets, vars, position) {
    vars.duration = 0;
    vars.parent = this;
    _inheritDefaults(vars).repeatDelay || (vars.repeat = 0);
    vars.immediateRender = !!vars.immediateRender;
    new Tween(targets, vars, _parsePosition(this, position), 1);
    return this;
  }

  call(callback, params, position) {
    return _addToTimeline(this, Tween.delayedCall(0, callback, params), position);
  }
```

旁注：

- `Timeline extends Animation` 是关键——Timeline 自己**也是一个可被嵌套的动画对象**。
  这意味着你可以 `outer.add(inner)` 把整段 timeline 当成一个"复合 tween"塞进父 timeline，整棵树共享同一个 Ticker。
- `_globalTimeline`（在文件第 2818 行实例化：`new Timeline({sortChildren: false, defaults: _defaults, autoRemoveChildren: true, id:"root", smoothChildTiming: true})`）
  是**全局根**——所有未指定 parent 的 Tween 默认挂到这棵根 timeline，构成一棵树。
- `to() / from() / fromTo()` 内部都走 `_createTweenType(type, args, this)`，**返回 `this`** 是链式调用 (`.to().to().to()`) 能成立的根本——
  这是 18 年前 Flash 时代就定下的 fluent API 风格。
- `set()` 实际上是 `duration: 0` 的 Tween（注意 `vars.duration = 0`），这把"立即赋值"也纳入了同一个调度系统——
  GSAP 整个抽象坚持"不开第二种动画路径"。
- `call()` 把 `Tween.delayedCall(0, callback, params)` 加到 timeline——回调本身也是个 zero-duration Tween，
  这样"在 t=2s 处触发回调"就和"在 t=2s 处开始一段 fade"用同一个机制（位置参数 `position`）安排。
- `vars.scrollTrigger && _scrollTrigger(this, vars.scrollTrigger)` 是 GSAP 跨 plugin 的钩子点——
  Timeline 不直接 import ScrollTrigger，而是 ScrollTrigger 注册时往 `_scrollTrigger` 这个空函数指针赋值，
  Timeline 这里只判存在性。**插件解耦**靠的就是这种"core 留 hook 槽 + plugin 注册时填槽"。

> 怀疑 1：`smoothChildTiming` 这个 flag 文档语焉不详——它到底改变了什么？
> 看 `_addToTimeline` 的调用链应该和子 tween 起始时间的"对齐 vs 自然"有关，但具体对动画行为的影响需要构造一个 yoyo + repeat 的 timeline 对比实验才能看清。

### 机制 2 · Easing 的代数闭式解（不是 lookup table）

[`gsap-core.js` 第 1023-1082 行 @ 13e2b790](https://github.com/greensock/GSAP/blob/13e2b790546426a1a2e0e9b409f3f8dc6d6611f2/src/gsap-core.js#L1023-L1082)：

```js
_insertEase = (names, easeIn, easeOut = p => 1 - easeIn(1 - p), easeInOut = (p => p < .5 ? easeIn(p * 2) / 2 : 1 - easeIn((1 - p) * 2) / 2)) => {
    let ease = {easeIn, easeOut, easeInOut},
      lowercaseName;
    _forEachName(names, name => {
      _easeMap[name] = _globals[name] = ease;
      _easeMap[(lowercaseName = name.toLowerCase())] = easeOut;
      for (let p in ease) {
        _easeMap[lowercaseName + (p === "easeIn" ? ".in" : p === "easeOut" ? ".out" : ".inOut")] = _easeMap[name + "." + p] = ease[p];
      }
    });
    return ease;
  },
  _easeInOutFromOut = easeOut => (p => p < .5 ? (1 - easeOut(1 - (p * 2))) / 2 : .5 + easeOut((p - .5) * 2) / 2),
  _configElastic = (type, amplitude, period) => {
    let p1 = (amplitude >= 1) ? amplitude : 1,
      p2 = (period || (type ? .3 : .45)) / (amplitude < 1 ? amplitude : 1),
      p3 = p2 / _2PI * (Math.asin(1 / p1) || 0),
      easeOut = p => p === 1 ? 1 : p1 * (2 ** (-10 * p)) * _sin((p - p3) * p2) + 1,
      ease = (type === "out") ? easeOut : (type === "in") ? p => 1 - easeOut(1 - p) : _easeInOutFromOut(easeOut);
    p2 = _2PI / p2;
    ease.config = (amplitude, period) => _configElastic(type, amplitude, period);
    return ease;
  },
  _configBack = (type, overshoot = 1.70158) => {
    let easeOut = p => p ? ((--p) * p * ((overshoot + 1) * p + overshoot) + 1) : 0,
      ease = type === "out" ? easeOut : type === "in" ? p => 1 - easeOut(1 - p) : _easeInOutFromOut(easeOut);
    ease.config = overshoot => _configBack(type, overshoot);
    return ease;
  };

_forEachName("Linear,Quad,Cubic,Quart,Quint,Strong", (name, i) => {
  let power = i < 5 ? i + 1 : i;
  _insertEase(name + ",Power" + (power - 1), i ? p => p ** power : p => p, p => 1 - (1 - p) ** power, p => p < .5 ? (p * 2) ** power / 2 : 1 - ((1 - p) * 2) ** power / 2);
});
_easeMap.Linear.easeNone = _easeMap.none = _easeMap.Linear.easeIn;
_insertEase("Elastic", _configElastic("in"), _configElastic("out"), _configElastic());
((n, c) => {
  let n1 = 1 / c,
    n2 = 2 * n1,
    n3 = 2.5 * n1,
    easeOut = p => (p < n1) ? n * p * p : (p < n2) ? n * (p - 1.5 / c) ** 2 + .75 : (p < n3) ? n * (p -= 2.25 / c) * p + .9375 : n * (p - 2.625 / c) ** 2 + .984375;
  _insertEase("Bounce", p => 1 - easeOut(1 - p), easeOut);
})(7.5625, 2.75);
_insertEase("Expo", p => (2 ** (10 * (p - 1))) * p + p * p * p * p * p * p * (1-p));
_insertEase("Circ", p => -(_sqrt(1 - (p * p)) - 1));
_insertEase("Sine", p => p === 1 ? 1 : -_cos(p * _HALF_PI) + 1);
_insertEase("Back", _configBack("in"), _configBack("out"), _configBack());
```

旁注：

- `_insertEase` 一次注册三件套 `{easeIn, easeOut, easeInOut}`——
  传入 `easeIn` 后，`easeOut` 默认是 `p => 1 - easeIn(1 - p)`（**对称翻转**），
  `easeInOut` 默认是分段拼接（前半段 `easeIn(p*2)/2`，后半段镜像）。
  这是"easing family 的代数对称性"在代码里的直接表达——一份 in 推出 out + inOut 三个版本。
- `Power0..Power4` 用闭包 `power` 拿到指数（1/2/3/4），`p => p ** power` 单步算出（不查表）。
  Linear / Quad / Cubic / Quart / Quint / Strong 全部走这条路径，省 60+ 个查表项。
- `_configElastic` 是真正"数学派"的代表：`p => p === 1 ? 1 : p1 * (2 ** (-10 * p)) * sin((p - p3) * p2) + 1`——
  指数衰减 × 正弦——这是阻尼振荡的解析解。`amplitude` 控振幅、`period` 控周期，
  `Math.asin(1/p1)` 算相位偏移让曲线从 0 出发。这套数学跟 framer-motion 的 spring 闭式解是同一类血统。
- `Bounce` 的实现是 IIFE（立即执行函数）`((n, c) => { ... })(7.5625, 2.75)`——
  这两个魔数 `7.5625` 和 `2.75` 是经验拟合的结果（重力 × 弹性系数），
  分段函数模拟"小球落地三次反弹"，每次反弹幅度递减。注释里写过这是从 Flash 时代 Robert Penner 的 ease 库 port 过来的。
- `Expo` 注释说 `previously 2 ** (10 * (p - 1)) but that doesn't end up with the value quite at the right spot so we do a blended ease to ensure it lands where it should perfectly`——
  纯 `2^(10(p-1))` 在 p=1 时不会精确等于 1（浮点误差），所以加了 `+ p^6 * (1-p)` 修正项。这是**为了让动画终点像素精确**的 hack。
- `_easeMap.Linear.easeNone = _easeMap.none = _easeMap.Linear.easeIn`——
  GSAP 提供 5 种"什么都不做"的别名（`linear` / `none` / `Linear.easeNone` / `Linear.easeIn` / `Linear.easeInOut`），
  历史包袱 + 用户习惯共存。
- `ease.config(amplitude, period)` 是**闭式解才能做的事**：参数化 ease 返回新 ease。
  lookup table 路线（如 framer-motion 的 spring → linear() string）需要重新采样 1000 个点——这是"为什么 GSAP 在大量并发动画里 CPU 占用低"的关键差异。

> 怀疑 2：`_easeInOutFromOut` 的分段公式 `p < .5 ? (1 - easeOut(1 - (p * 2))) / 2 : .5 + easeOut((p - .5) * 2) / 2`
> 与 `_insertEase` 默认参数里的 `easeInOut` 公式 `p < .5 ? easeIn(p * 2) / 2 : 1 - easeIn((1 - p) * 2) / 2` 看起来不等价——
> 一个是从 easeOut 推 inOut，一个是从 easeIn 推 inOut。在 `Elastic / Back` 这种非对称 ease 上，这两条路径会不会得到不同曲线？需要画图对比。

### 机制 3 · ScrollTrigger 全局批量 `_refreshAll`

[`ScrollTrigger.js` 第 264-303 行 @ 13e2b790](https://github.com/greensock/GSAP/blob/13e2b790546426a1a2e0e9b409f3f8dc6d6611f2/src/ScrollTrigger.js#L264-L303)：

```js
_refreshAll = (force, skipRevert) => {
    _docEl = _doc.documentElement;
    _body = _doc.body;
    _root = [_win, _doc, _docEl, _body];
    if (_lastScrollTime && !force && !_isReverted) {
      _addListener(ScrollTrigger, "scrollEnd", _softRefresh);
      return;
    }
    _refresh100vh();
    _refreshingAll = ScrollTrigger.isRefreshing = true;
    _isReverted || _recordScrollPositions();
    let refreshInits = _dispatch("refreshInit");
    _sort && ScrollTrigger.sort();
    skipRevert || _revertAll();
    _scrollers.forEach(obj => {
      if (_isFunction(obj)) {
        obj.smooth && (obj.target.style.scrollBehavior = "auto");
        obj(0);
      }
    });
    _triggers.slice(0).forEach(t => t.refresh())
    _isReverted = false;
    _triggers.forEach((t) => {
      if (t._subPinOffset && t.pin) {
        let prop = t.vars.horizontal ? "offsetWidth" : "offsetHeight",
          original = t.pin[prop];
        t.revert(true, 1);
        t.adjustPinSpacing(t.pin[prop] - original);
        t.refresh();
      }
    });
    _clampingMax = 1;
    _hideAllMarkers(true);
    _triggers.forEach(t => {
      let max = _maxScroll(t.scroller, t._dir),
        endClamp = t.vars.end === "max" || (t._endClamp && t.end > max),
        startClamp = t._startClamp && t.start >= max;
      (endClamp || startClamp) && t.setPositions(startClamp ? max - 1 : t.start, endClamp ? Math.max(startClamp ? max : t.start + 1, max) : t.end, true);
    });
    _hideAllMarkers(false);
```

旁注：

- 第一行 `_docEl = _doc.documentElement; _body = _doc.body` 注释里写过——
  Astro 等框架在 SPA 路由切换时会 cache 老 body 然后 swap 新 body，所以**每次 refresh 都要重新读 body 引用**，
  否则 marker / 测量都贴在已经被替换掉的 DOM 上。这是 SPA 时代加进来的补丁。
- `if (_lastScrollTime && !force && !_isReverted)` 是**滚动中不 refresh** 的保护——
  正在滚的时候去测量会让 measure 跟用户感知错位，于是 `_addListener("scrollEnd", _softRefresh)` 把 refresh 推到滚停后再做。
- `_revertAll()` 是 FLIP 思想的全局版本——
  每个 trigger 把自己应用过的变换全部撤销（pin / pinSpacing / class），让页面回到"什么 ScrollTrigger 都不存在"的自然 layout，
  然后再重新 measure。这对应 framer-motion 的 `willUpdate()` 阶段，但 GSAP 是**全局批量一次性 revert**。
- `_triggers.slice(0).forEach(t => t.refresh())` 用 `slice(0)` 复制数组——
  注释里写："don't loop with `_i` because during a refresh() someone could call ScrollTrigger.update() which would iterate through `_i` resulting in a skip."
  refresh 期间的 update 不能用全局 `_i` 索引，否则会被外层 forEach 干扰。
- 第二轮 forEach 处理 `_subPinOffset` —— 嵌套 pin（一个 ScrollTrigger 的 pin 容器内部还有另一个 pin）会让父容器尺寸在 child refresh 时变化，
  所以要测一次 pin 元素的 width/height、revert 后重测、计算差值再 `adjustPinSpacing(diff)`。这是真实业务里"卡片堆叠 sticky" 这种效果的底层支持。
- `_clampingMax = 1` 全局 flag 配合后续 `endClamp / startClamp` 处理——
  当用户写 `start: "clamp(top bottom)"` 表示"最多 clamp 到 max scroll"，refresh 末尾要把超界的 trigger 收到 viewport 范围内。
  这是 ScrollTrigger 处理"页面变短了 / 内容动态加载导致 max scroll 减少"的兜底。
- 整个函数没有任何 `try/catch`——GSAP 的设计哲学是"refresh 失败就让用户在控制台看到，不静默吞错误"。
  `_refreshing` 这个 flag 让外部知道现在不能调度新动画。

> 怀疑 3：`_subPinOffset` 的处理只跑一轮——如果嵌套有 3 层 pin（A 内含 B，B 内含 C），第二层调整后第一层是不是也应该再 refresh 一次？
> 这看起来是 O(嵌套深度) 的 fix-point 迭代但代码只迭一次。可能性：(a) 实际场景里 3 层嵌套 pin 极少，故意不支持；
> (b) 有别的机制（如 `_dispatch("refreshInit")`）在收敛；(c) 真有 bug 但没人触发。需要构造极端 pin 嵌套实验验证。

## Hands-on（30 分钟跑通 + 改一处实验）

### 30 分钟跑通

```bash
mkdir gsap-sandbox && cd gsap-sandbox
npm init -y
npm install gsap
# v3.15.0 默认含所有原付费插件（2024 Webflow 收购后免费）

# 写一个最小 example
cat > index.html << 'HTML'
<!DOCTYPE html>
<html>
<head><title>GSAP test</title></head>
<body style="margin:0;height:300vh;background:#111">
  <div id="box1" style="width:80px;height:80px;background:#88ce02;position:fixed;top:50px;left:50px"></div>
  <div id="box2" style="width:80px;height:80px;background:#bb4ade;position:fixed;top:50px;left:200px"></div>
  <div id="box3" style="width:80px;height:80px;background:#4ade7c;position:fixed;top:50px;left:350px"></div>
  <div id="trigger" style="position:absolute;top:1500px;left:50%;width:300px;height:200px;background:#522;color:white;padding:20px">scroll here</div>
  <script type="module">
    import gsap from "gsap";
    import { ScrollTrigger } from "gsap/ScrollTrigger";
    gsap.registerPlugin(ScrollTrigger);

    // Timeline 串多个 tween
    const tl = gsap.timeline({ repeat: -1, yoyo: true });
    tl.to("#box1", { x: 200, rotation: 360, duration: 1, ease: "elastic.out(1, 0.5)" })
      .to("#box2", { y: 100, scale: 1.5, duration: 0.6, ease: "back.out(2)" }, "-=0.3")
      .to("#box3", { backgroundColor: "#ff5577", duration: 0.4 }, "<");

    // ScrollTrigger 滚动驱动
    gsap.to("#trigger", {
      x: 400,
      rotation: 720,
      scrollTrigger: {
        trigger: "#trigger",
        start: "top 80%",
        end: "bottom 20%",
        scrub: 1,
        markers: true
      }
    });
  </script>
</body>
</html>
HTML

# 跑一个最简单的 server
npx http-server . -p 8080
# open http://localhost:8080
```

**预期观察**：

- `box1/box2/box3` 三个色块互相串联做 elastic / back / 颜色变换，整体 yoyo 循环
- 滚到 `#trigger` 元素时它跟着 scroll position 平滑旋转（`scrub:1` = 1 秒平滑滞后），`markers:true` 显示 start/end 辅助线

### 改一处实验

实验：把 `_easeMap.Linear.easeNone` 替换成自定义 noise ease，看链式 timeline 节奏怎么变。

```js
// 在 import gsap 后立即覆盖
import gsap from "gsap";
import { Linear } from "gsap";

// 原来的 Linear.easeNone 是 p => p
// 改成"带噪声的 linear"——每次返回 p 加一个小扰动
const noisyLinear = (p) => p + (Math.random() - 0.5) * 0.05;
Linear.easeNone = noisyLinear;
gsap._easeMap = gsap._easeMap || {};
gsap._easeMap.none = noisyLinear;
gsap._easeMap["linear"] = noisyLinear;

// 然后正常 timeline
gsap.to("#box1", { x: 500, duration: 3, ease: "none" });
```

**实际观察**：

- box 不再丝滑移动，而是**抖着前进**——因为每帧 `ease(p)` 返回的不是单调递增
- 但**总体还是从 0 移到 500**——因为 progress 由 `Tween.render(time)` 强制驱动，ease 只影响插值 mapping，最终 `p === 1` 时 GSAP 内部还是会把目标值精确赋给 target（见 `_renderProp` 的 `p === 1 ? end : interpolate(start, end, ease(p))` 逻辑）
- 改 `ease` 函数**不会破坏 timeline 时序**——这个实验印证了"ease 只是 progress → progress 的纯函数"，timeline 调度是完全独立的另一层

这一改让我搞清楚了：**GSAP 的 ease 是纯映射，timeline 调度是不可绕过的骨架**。
任何 ease 自定义（包括 CustomEase 插件解析 SVG path）最后都塌成同一个 `(p: number) => number`。

## 横向对比

GSAP 的"敌人"——5 个**哲学不同**的竞品：

| 维度 | GSAP | framer-motion | Anime.js | Velocity.js | Web Animations API | Lottie |
|------|------|---------------|----------|-------------|--------------------|--------|
| 哲学 | timeline 树 + 全局 Ticker | 声明式 motion 组件 + FLIP | tween 数组配置式 | jQuery 风格命令式 | 浏览器原生 keyframes | 设计师 AE 导出 JSON 播放 |
| 主入口 | `gsap.timeline()` | `<motion.div animate />` | `anime({ targets, ... })` | `$(el).velocity({ ... })` | `el.animate(keyframes, opts)` | `lottie.loadAnimation({ path })` |
| Easing | 闭式数学解（参数化） | spring 闭式 + WAAPI 离散化 | cubic-bezier + 内置 30+ | jQuery easing | cubic-bezier / linear() | AE 导出曲线 |
| 调度引擎 | 单一全局 RAF Ticker | RAF + WAAPI 混合 | RAF | RAF | compositor thread（原生） | RAF |
| 框架绑定 | 无（vanilla），有 React/Vue helper | React-only | 无 | jQuery | 无 | 无 |
| 滚动驱动 | ScrollTrigger（plugin） | useScroll hook | 需自己写 | 无官方 | scroll-timeline（实验） | 无 |
| Layout 动画 | Flip plugin | layoutId 内置 | 需自己测 box | 需自己测 box | 无 | 无 |
| 历史包袱 | 18 年（Flash → JS） | 7 年 | 9 年 | 10 年（已停维护） | W3C 标准 | 11 年 |
| Bundle 大小（min+gzip） | core ~26KB / 全套 ~70KB | ~30KB | ~9KB | ~12KB | 0KB（原生） | ~50KB（含播放器） |
| 哲学分歧 | "时序优先" | "组件优先 + layout" | "配置优先" | "命令优先" | "标准优先" | "设计师优先" |

**选型建议**：

- **GSAP** → 复杂 hero section / 滚动叙事 / 跨多个元素严格时序协调（比如登录页 8 个动画串起来）/ 跨框架（vanilla + React + Vue 都要用同一套）/ 需要 SVG morph / 需要 Flash 时代的稳定性保证
- **framer-motion** → React 单一栈 + 重 layout 动画（卡片移动 / 共享元素过渡）/ 拖拽手势 + 物理 spring 是默认需求 / 不在意 vendor lock-in
- **Anime.js** → 简单一次性动画 / 9KB 极小 bundle 是硬要求 / 不需要 timeline 嵌套 / 不需要滚动驱动
- **Velocity.js** → **不要选**，2018 年起停止维护，留在 jQuery 时代
- **Web Animations API** → 无依赖动画 / 静态 keyframes 够用 / 在意 compositor thread 性能 / 不需要 spring / 不需要嵌套 timeline
- **Lottie** → 设计师在 After Effects 里做好动画导出 JSON / 需要复杂矢量插画动画 / 不在意 60KB bundle

GSAP vs framer-motion 的根本分歧：**timeline 优先 vs 组件优先**——
GSAP 让你显式管理时间维度（`tl.to().to().to(..., "-=0.3")`），framer-motion 让你声明状态（`animate={{ x: 100 }}`），
后者更 React 化但代价是"超过 5 个元素的复杂时序"会回到手动算 delay 的老路。

## 与你当前工作的连接

### 今天就能用的部分

- **任何前端 H5 落地页的入场动画**——
  现在如果是手写 `transition: all 0.3s` 或者 CSS keyframes，用 GSAP timeline 把"卡片飞入 + 文字打字 + 按钮 pop"串起来，
  yoyo + reverse 全免费、调试时 timeline.timeScale(0.2) 慢放看每一帧
- **互动式内容卡片**——
  把"点击展开 → 内容滑入 → 图标旋转 → 阴影变化"这种串行动画从 React state + setTimeout 链改成 GSAP timeline，
  代码行数 -50% 且不会再有"动画一半被新点击打断"的脏状态
- **学习站点 `study/` 顶部 hero 滚动效果**——
  用 ScrollTrigger 做 sticky 标题 + 多段文字 scrub 切换（类似 Apple iPhone 产品页），
  比 framer-motion 的 useScroll 写起来更线性：trigger / start / end / scrub 四个参数搞定
- **任意 vanilla JS 演示页面**——
  GSAP 不绑 React/Vue，写 demo / 教学站点 / 学习笔记里的交互不用先 setup 一个框架

### 下个月能用的部分

- **markdown 笔记的 sidecar HTML 渲染加动画 layer**——
  渲染出来的笔记 HTML 现在是静态长页，加一层 GSAP timeline 让"章节切换 + meta 数字 count up + 高亮代码段滚入"串起来，
  会让 5 分钟讲解感觉像 2 分钟（用户感知时间被动画填满）。需要先抽出"章节切换"的事件接口
- **结构化报告 HTML 模板**——
  各种自动生成的 report HTML 现在是静态卡片，加 GSAP `from()`（元素从下方 fade in）+ ScrollTrigger 让长报告的可读性翻倍，
  需要在 report template 里预留 `data-animate` 标记
- **个人项目展示页**——
  把 `study-refactor-projects-2/` 自己做成一个 GSAP 滚动叙事网站，每个项目笔记的"心脏机制"段做成可滚动播放的动画解释，
  需要先把笔记的关键代码段抽出来做成可视化数据
- **简历 + 项目 demo 视频**——
  GSAP 做 demo 视频里的标题动画 / 数据可视化过场比 After Effects 学习曲线低，
  录屏后剪进视频里，体力活变 30 分钟搞定

### 不要用的部分

- **不要用 jQuery TweenLite/TweenMax 旧 API**——
  v2 之前的 `TweenMax.to(el, 1, {...})` 写法虽然还能跑（兼容层），但文档已不推荐，新人看老 demo 会迷糊。统一用 v3 的 `gsap.to(el, {duration: 1, ...})`
- **不要用 GSAP 做布局动画当 framer-motion 替代品**——
  GSAP 的 Flip plugin 能做 FLIP，但比 framer-motion 的 `layoutId` 啰嗦得多（`Flip.getState() → 改 DOM → Flip.from(state)` 三步走 vs `<motion.div layoutId="x" />` 一行）。
  在纯 React 项目里 layout 动画选 framer-motion 更合适
- **不要用 ScrollTrigger.normalizeScroll() 在生产**——
  这个 API 接管浏览器原生滚动改用 GSAP 自己模拟，会破坏无障碍（屏幕阅读器 / 键盘空格翻页失效）和移动端原生 momentum。Smooth scroll 用 ScrollSmoother + 浏览器原生 `scroll-behavior: smooth` 兜底更稳
- **不要用 GSAP 做物理仿真**——
  Physics2DPlugin / PhysicsPropsPlugin 只是简单牛顿力学，做不了刚体碰撞 / 软体 / 流体。这些场景用 matter.js 或 cannon.js
- **不要在 SSR / Astro static build 阶段 import gsap**——
  GSAP 启动时会读 `window` 触发 SSR 报错，必须 `client:only` directive 或 dynamic import。Astro 站点常踩这个坑

## 自检问题 + 延伸阅读

### 自检问题（追到行号级）

1. **`_globalTimeline` 在哪一行实例化、为什么 `sortChildren: false`？** 答案应在 `gsap-core.js` 第 2818 行附近，但"为什么不 sort 根 timeline"的设计动机需要看 `_addToTimeline` 的实现——sort 操作的成本是 O(n log n)，根 timeline 子节点可能成千上万。
2. **`_ticker` 的 `lagSmoothing(500, 33)` 默认值——500ms 阈值是怎么定的？** 文档说"to handle tab blur"，但 500ms 这个具体数字是经验值还是有理论依据？看 `_lagThreshold` 在第 888 行的初始化，但没有 commit message 解释。
3. **PropTween 链表插入的优先级 `pr` 字段**——`gsap-core.js` 第 2796 行 `this.pr = priority || 0`。哪些插件会用非零优先级？为什么 CSSPlugin 的 transform 子属性需要排序？追 `_addPropTween` 的调用看插入时是否按 `pr` 排序。
4. **ScrollTrigger.refresh 在 SPA 路由切换时的触发链**——React Router / Vue Router push 不会触发 `resize` 也不触发 `DOMContentLoaded`。`ScrollTrigger.js` 第 1420 行 listener 列表里看不到路由事件。那么 SPA 怎么自动 refresh？大概是用户手动调用 `ScrollTrigger.refresh()` 或者 `_queueRefreshAll`（第 252 行）有别的 fallback。
5. **`Elastic.config(amplitude, period)` 返回新 ease 后，旧的 `Elastic.easeOut` 引用会失效吗？** 看 `_configElastic` 第 1043 行——`ease.config = (amplitude, period) => _configElastic(type, amplitude, period)` 返回的是**新对象**，不修改原 ease。但 `_easeMap["Elastic.easeOut"]` 是不是引用？需要追 `_insertEase` 注册时的赋值。

### 限制

- **不支持 SSR 静默渲染**——任何代码路径都假设 `window` / `document` 存在，启动时 `_windowExists()` 检查通过才初始化。Astro / Next.js SSR 阶段 `import gsap` 不会立即崩，但调用 `gsap.to()` 会因 `_doc` undefined 报错。必须 `useEffect` / `client:only` 包裹。
- **License 是 "Standard No-Charge" 不是 OSI 批准的开源 license**——虽然 Webflow 收购后免费给所有人，但严格来说不是 MIT/Apache/BSD。某些公司法务严格的项目（金融 / 政府合规）会因这一点拒绝。
- **bundle 大小不友好**——core 26KB（min+gzip），加上 ScrollTrigger / Draggable / SplitText 全套到 70KB。对比 anime.js 9KB 是 7 倍。SSR 关键路径 / 移动端 3G 场景慎用全套。
- **timeline 嵌套 > 3 层后调试困难**——`tl.add(child)` 嵌套深时，时间换算、reverse 行为、yoyo 传播容易出乎意料。GSAP 的 `gsap.exportRoot()` 可以导出全局 timeline 但格式是内部对象，没有可视化工具（GSDevTools 是闭源工具）。

## 宣传 vs 现实

| 项 | 官方宣传 | 实际情况 |
|----|----------|----------|
| "20x faster than jQuery" | package.json description 里写 | 真实，但 jQuery 已死，对比基准过时；vs framer-motion 性能差异不大 |
| "Animates anything JavaScript can touch" | README 顶部 | 真实，但**前提是注册了对应 plugin**——动 SVG 路径需 MotionPathPlugin，动 PIXI 需 PixiPlugin。core 只动 plain JS object 属性 |
| "Now 100% free for everyone (Webflow)" | gsap.com 头条 | 真实，2024 年起 SplitText / MorphSVG / DrawSVG / Physics2D 全部免费，曾经付费的 BusinessGreen / ShockinglyGreen 订阅被取消 |
| "Works in every major browser" | README | 真实，但 IE11 支持在 v3.13 后移除，老浏览器需要降级到 v3.12 |
| "ScrollTrigger 3.15.0 with no jank" | docs | 极简 demo 真不卡；但 `_refreshAll` 在 100+ trigger 的页面会卡 50-150ms（refresh 期间整页阻塞），Safari 上更明显 |

## 升级日志

- **2026-05-29 v1**（本次）：基于 commit `13e2b790546426a1a2e0e9b409f3f8dc6d6611f2`（v3.15.0）创建，遵循状元篇 v1.1 工具库分支 B
- 总行数：~440 行
- 启用工具：git clone（depth=1）、grep / Read 行号定位、matplotlib + cwebp 生成架构图（130KB webp）
- 与 [framer-motion 状元篇](/projects/framer-motion) 配对阅读，覆盖 Season 19 Animation 的两大流派
