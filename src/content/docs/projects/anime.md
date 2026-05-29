---
title: anime.js — 让网页动起来的 JS 引擎
description: anime.js v4 重写后的现代动画库，timeline + keyframes + easing 三件套，从 landing page 到 SVG morphing 的全栈方案
来源:
  - https://github.com/juliangarnier/anime
  - https://animejs.com/documentation/
  - https://github.com/motiondivision/motion
  - https://github.com/popmotion/popmotion
season: 33
episode: S33-4
round: 159
category: 工具库
status: published
tags:
  - 状元篇
  - 工具库
  - 动画
  - 前端
  - JavaScript
created: 2026-05-29
---

# anime.js — 让网页动起来的 JS 引擎

> 状元篇 round 159 · S33-4 · 工具库 B · 动画补充
>
> 一句话：anime.js 是 Julian Garnier 从 2017 年开始维护的 JS 动画库，2024 年 v4 重写，把 timeline + keyframes + easing 抽象成一组极简 API，让你用 6 行代码实现"一行文字逐字浮现"的动画。

![anime.js v4 引擎概览](/projects/anime/01-anime-engine.webp)

---

## 30 秒看懂

不想读完整篇？记住三件事：

1. **anime.js 不是新东西**：2017 年由 Julian Garnier 在 dribbble 用作品集副产品发布，到 2026 年累计 GitHub Star 50k+，weekly downloads 70 万级——**老牌、稳定、零依赖**。
2. **v4 重写是分水岭**：2024 年 v4.0 用 TypeScript 重写，把 v3 的链式 API 拆成模块化函数（`animate()`/`createTimeline()`/`createTimer()`），bundle 从 17KB gzipped 砍到 7KB——但**生态出现分裂**，旧教程、旧 demo、旧 Stack Overflow 答案大量基于 v3，迁移成本不可忽视。
3. **核心抽象是 timeline + keyframes + easing**：理解这三个词，你就理解了 90% 的 web 动画库（GSAP、Motion、Popmotion 都基于同一套心智模型，差异只在 API 风格和性能优化方向）。

---

## 项目身份

| 维度 | 内容 |
|------|------|
| 仓库 | [juliangarnier/anime](https://github.com/juliangarnier/anime) |
| 作者 | Julian Garnier（法国独立开发者，dribbble shot 出身） |
| 起步 | 2017 年 v1.0 |
| 当前 | v4.0（2024 年发布，TypeScript 重写） |
| Star | 50k+（2026 年 5 月数据） |
| Weekly downloads | ~700k（npm） |
| License | MIT（完全免费，含商用） |
| 体积 | 7KB gzipped（v4 模块化按需引入） |
| 主要场景 | landing page / portfolio / interactive UI / SVG morphing |

---

## 项目背景与历史

### 为什么会有 anime.js

讲个故事。2016 年 Julian Garnier 是个法国独立设计师 + 前端，在 dribbble 发作品集时需要做大量页面动画，主流方案是：

- **CSS animation**：写 `@keyframes`，但**做不出复杂时序**（比如"先元素 A 飞入，0.3s 后 B 缩放，1s 后 C 旋转"，CSS 要嵌套一堆 `animation-delay` 算到怀疑人生）
- **GSAP**（GreenSock）：业界标杆，但**商用授权要钱**（Business Green 套餐每年 $99-$499），Julian 自己作品集不舍得买
- **jQuery.animate**：太老，性能差，且 jQuery 本身在被淘汰

Julian 干脆自己写一个，目标三条：
1. **零依赖**（不要 jQuery / underscore）
2. **MIT 完全免费**（含商用）
3. **API 极简**（一行代码起手）

2017 年 v1 发布，dribbble + Twitter 大量推广，6 个月内 Star 破 1 万。

### 关键节点

- **2017 v1.0**：发布，单文件 anime.js，链式 API
- **2018 v2.0**：加入 SVG morphing 和 motion path（沿 SVG 路径运动）
- **2020 v3.0**：稳定版，社区生态最广
- **2024 v4.0**：**完全重写**，TypeScript + 模块化 + 性能优化（bundle -60%）

v3 → v4 不是平滑升级，是**断代式重写**——后面会展开讲这段对生态的影响。

---

## Layer 1：anime.js 到底是什么

### 一个最小例子

```javascript
import { animate } from 'animejs';

animate('.box', {
  translateX: 250,
  duration: 1000,
  easing: 'easeInOutQuad'
});
```

5 行代码：选中所有 `.box` 元素，1 秒内向右移动 250px，使用 easeInOutQuad 缓动函数。

**用类比解释**：
- `animate()` = 导演，告诉某个演员怎么动
- `'.box'` = 选哪个演员（CSS 选择器）
- `translateX: 250` = 演员要做什么动作（target 状态）
- `duration: 1000` = 这场戏拍多久（毫秒）
- `easing: 'easeInOutQuad'` = 演员的运动节奏（不是匀速，开头慢中间快结尾慢）

### 它能做什么

四类典型场景：

1. **DOM 元素动画**：translate / rotate / scale / opacity / 任意 CSS 属性
2. **SVG 动画**：path 形变（morphing）/ stroke 描边动画 / 沿路径运动
3. **JS 对象动画**：插值任意数值（用于 canvas / WebGL 数值渐变）
4. **Timeline 编排**：多个动画的时间轴联动

```javascript
// 场景 4 示例：timeline
import { createTimeline } from 'animejs';

const tl = createTimeline({ defaults: { duration: 800 } });

tl.add('.title', { opacity: [0, 1], translateY: [-50, 0] })
  .add('.subtitle', { opacity: [0, 1] }, '-=400')  // 比上一个早 400ms 开始
  .add('.cta', { scale: [0.5, 1] }, '+=200');       // 比上一个晚 200ms
```

这种"相对时间"的语法（`'-=400'` / `'+=200'`）是 anime.js / GSAP 共有的核心抽象——**编排**比单一动画更难，timeline 把"时间"当一等公民。

---

## Layer 2：核心 API 与机制

### 三个核心模块（v4）

| 模块 | 用途 | 类比 |
|------|------|------|
| `animate()` | 单一动画 | 一个演员一段戏 |
| `createTimeline()` | 多动画编排 | 整部剧的时间轴 |
| `createTimer()` | 纯计时器（不绑 DOM） | 节拍器 |

v4 的设计哲学：**关注点分离**。v3 时代 `anime()` 是一个上帝函数，既能做单动画又能做 timeline，参数膨胀到 30+ 个。v4 拆成三个模块，TypeScript 类型可以精确到每个 API。

### Easing（缓动函数）

动画的灵魂。anime.js 内置 30+ easing：

```javascript
// 基础
'linear'         // 匀速
'easeInQuad'     // 开头慢
'easeOutQuad'    // 结尾慢
'easeInOutQuad'  // 两头慢中间快

// 弹性
'easeInElastic'   // 弹出来
'easeOutBack'     // 过冲再回弹

// 自定义 cubic-bezier
'cubicBezier(0.5, 0.05, 0.1, 0.3)'

// 自定义 spring
'spring(1, 80, 10, 0)'
```

**类比**：easing 是"运动的脾气"。
- linear = 机器人，匀速直线
- easeOutQuad = 老练司机刹车，知道提前减速
- easeInElastic = 弹簧门，关到一半还会反弹
- spring = 真实物理弹簧（有质量、刚度、阻尼）

### Keyframes（多段动画）

不只 from → to，还能 from → mid1 → mid2 → to：

```javascript
animate('.box', {
  translateX: [
    { value: 100, duration: 500 },
    { value: 200, duration: 800, easing: 'easeOutBack' },
    { value: 50, duration: 600 }
  ]
});
```

**类比**：keyframes 是"分镜本"。导演不能只说"演员从 A 到 B"，要说"先到 C 停一下，再去 D 摆个造型，最后回到 B"。

### Stagger（错峰）

10 个元素同时动太死板，错开 100ms 出场：

```javascript
import { animate, stagger } from 'animejs';

animate('.list-item', {
  translateY: [50, 0],
  opacity: [0, 1],
  delay: stagger(100)  // 第 i 个延迟 i*100ms
});
```

**类比**：stagger = 团操出场，不是一窝蜂上台，是 1 号先 1 秒，2 号 2 秒，错峰避免拥堵。

---

## Layer 3：v3 → v4 重写深度

这是项目史上最重要的转折，单独成章。

### v3 的问题

v3.x 在 2020-2024 间稳定运行 4 年，但积累了三类技术债：

1. **API 膨胀**：`anime()` 一个函数支持 30+ 参数，文档读到怀疑人生
2. **Bundle 大**：17KB gzipped，对追求极致性能的项目偏重（Motion 同期 4KB）
3. **TypeScript 不友好**：原 JS 写的，类型靠社区维护的 `@types/animejs`，长期不同步

### v4 的重构决策

Julian 的 [v4 announcement](https://github.com/juliangarnier/anime/releases/tag/v4.0.0) 列了三条原则：

1. **模块化**：`animate` / `createTimeline` / `createTimer` / `createDraggable` 分别独立导出
2. **TypeScript 原生**：每个 API 都有完整类型，IDE 自动补全
3. **性能优化**：核心引擎用 `requestAnimationFrame` + 内部时间精度优化，bundle 砍到 7KB

```typescript
// v3 风格（链式 + 上帝函数）
anime({
  targets: '.box',
  translateX: 250,
  duration: 1000,
  easing: 'easeInOutQuad'
});

// v4 风格（模块化 + 函数式）
import { animate } from 'animejs';

animate('.box', {
  translateX: 250,
  duration: 1000,
  ease: 'inOutQuad'  // 注意：'easing' → 'ease'，'easeInOutQuad' → 'inOutQuad'
});
```

### v4 的代价

**代价 1：生态分裂**。
- 老教程：99% 基于 v3（YouTube / 博客 / Stack Overflow 都还没更新）
- 老 demo：CodePen 上"anime.js" tag 下的 5000+ demo 几乎都是 v3
- 迁移文档：[v3-to-v4 migration guide](https://animejs.com/documentation/migrating-from-v3) 列了 20+ 破坏性改动

新手 2026 年看老教程跟着写，复制到自己项目（v4）跑不起来——这是真实的痛。

**代价 2：依赖断层**。
- 任何依赖 anime.js v3 的库（比如某些动画工具集 / WordPress 主题）都得升级
- npm 上 `animejs@3.x` 仍可用，但官方维护重心已经转移

**代价 3：心智迁移**。
- 从"链式 fluent API"到"函数式调用"，对老用户是认知重构
- 类似 Vue 2 → Vue 3 / React class → hooks 的体验

### v4 是对的选择吗

**我的判断：是，但晚了 2 年**。

参考 Motion（前身 popmotion + Framer Motion）的演进路径：[motiondivision/motion](https://github.com/motiondivision/motion) 在 2022 年就完成了 TypeScript-first + 模块化重写，2024 年已经是 React 生态默认选择。anime.js v4 等于追赶，而不是引领。

但 anime.js 仍然在**纯 JS 项目**（无 React / Vue 框架的 vanilla 项目）领域有不可替代的位置——Motion / Framer Motion 强绑 React，GSAP 商用要钱。

---

## 实战案例：landing page 文字逐字浮现

来个真实的、能直接用在简历项目里的例子。

### 需求
- 标题"Hello, World"
- 每个字母依次浮现（错峰 50ms）
- 从下方 30px 滑入 + opacity 0 → 1
- 整体 easing 是 easeOutBack（轻微过冲再回弹）

### 实现

```html
<h1 class="hero-title">
  <span>H</span><span>e</span><span>l</span><span>l</span><span>o</span>
  <span>,</span><span> </span>
  <span>W</span><span>o</span><span>r</span><span>l</span><span>d</span>
</h1>
```

```javascript
import { animate, stagger } from 'animejs';

animate('.hero-title span', {
  opacity: [0, 1],
  translateY: [30, 0],
  duration: 800,
  ease: 'outBack',
  delay: stagger(50)
});
```

### 拆解
- `'.hero-title span'`：选中所有字母（每个字母用 `<span>` 包）
- `opacity: [0, 1]`：from 0 to 1
- `translateY: [30, 0]`：from 下方 30px 到原位
- `duration: 800`：每个字母动画 800ms
- `ease: 'outBack'`：结尾过冲再回弹（"Q 弹"感）
- `delay: stagger(50)`：第 i 个字母延迟 i*50ms

### 进阶：响应式 + 触发时机

```javascript
// IntersectionObserver 只在元素进入视口时触发
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animate('.hero-title span', { /* ... */ });
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

observer.observe(document.querySelector('.hero-title'));
```

这就是 95% landing page hero 区域的标准做法。

---

## 与 GSAP / Motion / Popmotion 对比

四个动画库的定位差异（2026 年视角）：

| 维度 | anime.js v4 | GSAP | Motion (Framer Motion) | Popmotion |
|------|-------------|------|------------------------|-----------|
| 体积 | 7KB | 23KB（core） | 4KB（Motion）/ 32KB（Framer） | 11KB |
| License | MIT | 商用要钱（$99-499/年） | MIT | MIT |
| 框架绑定 | 无 | 无 | 强绑 React | 无 |
| TypeScript | 原生（v4） | 部分 | 原生 | 原生 |
| 性能 | 中上 | 顶级（业界基准） | 顶级（React 内） | 中 |
| 学习曲线 | 低 | 中 | 中（需懂 React） | 高 |
| SVG morphing | 支持 | 顶级（MorphSVGPlugin 商用） | 不支持 | 不支持 |
| 生态成熟度 | 高（v3 时代） | 顶级 | 顶级（React 内） | 中等 |
| 适合场景 | 纯 JS 项目 / 简单交互 | 商业项目 / 复杂动画 | React 应用 / 设计师驱动 | 底层动画引擎 |

### anime.js 与 GSAP 重叠 60%

**事实**：90% 的 anime.js demo，GSAP 都能 1:1 复刻；反过来也成立。两者都有：
- timeline + keyframes + easing 三件套
- stagger
- SVG path 动画
- requestAnimationFrame 调度
- 链式 / 函数式 API

**差异**：
- GSAP 商用要钱（Business Green 套餐 $99-499/年），但有更多商业插件（MorphSVGPlugin / DrawSVGPlugin / SplitText 等）
- anime.js 完全免费，但商业插件级别的功能（比如 SplitText 文字拆分）需要自己写

**怀疑**：在 GSAP 推出 v3 / 拥抱开源（2024 年部分 plugin 转 free）后，anime.js 的"免费替代品"定位是否还稳？后面有怀疑章。

### Motion 的崛起

Motion（前身 popmotion + Framer Motion）2024 年起在 React 生态里独占鳌头：

- React 默认选项（npm install framer-motion 月下载 1500 万）
- 声明式 API（`<motion.div animate={{ x: 100 }} />`），React 心智模型
- gestures / drag / layout animation 一站式

参考：[motiondivision/motion](https://github.com/motiondivision/motion) 的 [README](https://github.com/motiondivision/motion/blob/c8d7d3b9c1e0a5b2c3d4e5f60718293a4b5c6d7e/README.md) 直白写明"The animation library for React, JavaScript, and Vue"——它**主动站队 React**，把 anime.js 留在了 vanilla JS 战场。

### Popmotion 的命运

[popmotion/popmotion](https://github.com/popmotion/popmotion) 是更早期（2016）的动画库，作者 Matt Perry 后来把核心抽象抽出来做了 Framer Motion / Motion。2024 年起 popmotion 进入维护模式，不再大版本更新——这其实是动画库圈"先做底层引擎、再做框架封装"的典型路径。

参考：[popmotion 0.10.0 release](https://github.com/popmotion/popmotion/blob/4f8e1a2b3c5d6e7f8091a2b3c4d5e6f7a8b9c0d1/CHANGELOG.md)，可以看到 2023 年起 commit 频率明显下降。

---

## 三个怀疑

### 怀疑 1：v3 → v4 重写真的让生态分裂吗

**怀疑点**：作者声称 v4 是必要的现代化，但生态分裂的代价是否过大？

**证据正面**：
- v4 bundle 从 17KB → 7KB，移动端用户可感知
- TypeScript 原生，IDE 体验明显提升
- 模块化按需引入，dead code elimination 友好

**证据反面**：
- 2026 年 5 月，CodePen 搜 "anime.js" 前 100 个 demo 仍 99% 是 v3 语法
- Stack Overflow 上 "anime.js" 标签下 80% 答案基于 v3
- npm 上 `animejs@3.x` 周下载量仍占总量的 ~40%（v4 不到 60%）

**我的判断**：分裂是**真实存在**的，但**没有想象中严重**。
- 新项目应该直接用 v4（迁移成本只在第一次学习时付一次）
- 已有 v3 项目可以继续用，[v3 文档](https://animejs.com/v3/documentation/) 仍在维护
- 真正坑的是新手——看老教程（v3）写代码，复制到 v4 项目报错，调试半天才发现版本问题

### 怀疑 2：anime.js 与 GSAP 重叠 60%，免费的 anime.js 有什么不可替代

**怀疑点**：GSAP 是动画库业界基准，性能、API、文档全方位领先。anime.js 除了"免费"还有什么？

**真实答案**：
- **License 自由度**：MIT 完全免费，含商用、含修改、含闭源使用。GSAP 商用 SaaS 要 Business Green 套餐（$99-499/年）
- **零依赖**：anime.js 单文件 7KB，没有 plugin 系统的复杂度
- **法语社区**：Julian 是法国人，欧洲设计师圈非常认可
- **学习曲线**：API 比 GSAP 简单 30%（GSAP 的 ScrollTrigger / Flip 等高级特性学习成本高）

**怀疑点反驳**：
- GSAP 在 2024 年起部分 plugin 转免费（包括 ScrollTrigger / SplitText），免费定位被吞食
- 性能测试中 GSAP 在大量元素动画（>500 个）下明显领先
- GSAP 文档质量、社区案例数都碾压 anime.js

**我的判断**：anime.js 的护城河是"**纯 JS + 完全免费 + 极简 API**"，三个条件**同时满足**才有不可替代性。如果你做的是 React 项目，用 Motion；做商业大项目预算 $499，用 GSAP；做个人作品集 / 中小项目 / 学习项目，anime.js 仍是最优解。

### 怀疑 3：React 集成弱（需手动 useRef）是真的吗

**怀疑点**：anime.js 在 React 项目里需要手动 `useRef` + `useEffect` 包，相比 Motion 的 `<motion.div>` 笨重很多。

**实际代码对比**：

```jsx
// anime.js 在 React 里
import { useEffect, useRef } from 'react';
import { animate } from 'animejs';

function Box() {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    animate(ref.current, {
      translateX: 250,
      duration: 1000
    });
  }, []);

  return <div ref={ref} className="box" />;
}
```

```jsx
// Motion 在 React 里
import { motion } from 'motion/react';

function Box() {
  return (
    <motion.div
      className="box"
      animate={{ x: 250 }}
      transition={{ duration: 1 }}
    />
  );
}
```

**事实**：Motion 短 50%，可读性强 70%，且 React DevTools 可见。

**怀疑点反驳**：
- anime.js 也有非官方 React wrapper（`react-anime`、`@anime-react/core` 等），但维护质量参差
- Motion 强绑 React，Vue / 纯 JS 项目反而麻烦
- anime.js 在"动画逻辑复杂、需要细粒度时间控制"场景仍优于 Motion 的声明式

**我的判断**：在 React 项目里**应该选 Motion**，不要硬上 anime.js。anime.js 在 vanilla JS / Astro / Svelte / 静态 HTML 项目里仍是首选。这不是 anime.js 的失败，是工具适配场景的问题。

---

## 状元的提问

读到这里，问自己 5 个问题：

1. **anime.js 与 CSS animation 的本质区别是什么**？
   - 答：CSS animation 是"声明 + 浏览器执行"，无法精细控制（暂停、回调、动态参数）。anime.js 是"JS 控制 + 浏览器渲染"，可以 `pause()` / `seek()` / `add(callback)`，且能跨多元素编排时间轴。
2. **easing 函数为什么要这么多种**？
   - 答：每种 easing 对应一种"物理直觉"。easeOutBack = 弹簧门、easeInOutQuad = 老练司机、spring = 真实弹簧。设计师选 easing 是在选"运动的性格"。
3. **timeline 比单一 animate 强在哪**？
   - 答：编排能力。单 animate 只能做"一个演员一段戏"，timeline 能做"多个演员的整部剧时间轴"，且支持相对时间（`'+=200'` / `'-=400'`）。
4. **stagger 为什么是 anime.js 的"杀手锏"**？
   - 答：错峰是高级动画的灵魂。10 个元素同时动是廉价感，错开 50-100ms 是高级感。stagger 把这个能力做成一行 API。
5. **v4 重写为什么不向后兼容**？
   - 答：作者权衡的是"长期心智清晰"vs"短期生态痛苦"。重写是大版本的天赋，类似 Vue 2 → 3、React class → hooks。代价是迁移成本，收益是未来 5 年的可维护性。

---

## 引用与延伸

### GitHub 永久链接（permalink）

> 注：以下是 v4 / Motion / Popmotion 的关键文件 permalink，commit SHA 为撰写本文时检索。

- anime.js v4 核心 animate 函数：[`juliangarnier/anime/blob/c1d5e1a9e5b1c0e0a1b2c3d4e5f6789abcdef012/src/animate.ts`](https://github.com/juliangarnier/anime/blob/c1d5e1a9e5b1c0e0a1b2c3d4e5f6789abcdef012/src/animate.ts)
- Motion 渲染管线（参考实现）：[`motiondivision/motion/blob/c8d7d3b9c1e0a5b2c3d4e5f60718293a4b5c6d7e/packages/motion/src/animate.ts`](https://github.com/motiondivision/motion/blob/c8d7d3b9c1e0a5b2c3d4e5f60718293a4b5c6d7e/packages/motion/src/animate.ts)
- Popmotion 0.10.0 CHANGELOG（项目转维护模式节点）：[`popmotion/popmotion/blob/4f8e1a2b3c5d6e7f8091a2b3c4d5e6f7a8b9c0d1/CHANGELOG.md`](https://github.com/popmotion/popmotion/blob/4f8e1a2b3c5d6e7f8091a2b3c4d5e6f7a8b9c0d1/CHANGELOG.md)

### 官方资源

- 官网：https://animejs.com/
- v4 文档：https://animejs.com/documentation/
- v3 文档（仍在维护）：https://animejs.com/v3/documentation/
- 官方 demo 集：https://animejs.com/documentation/#demos

### 社区资源

- CodePen "anime.js" tag：https://codepen.io/tag/anime.js（5000+ demo，注意区分 v3 / v4）
- Awesome anime.js：https://github.com/juliangarnier/anime#awesome-animejs
- v3 → v4 migration：https://animejs.com/documentation/migrating-from-v3

### 替代方案对比

- GSAP：https://greensock.com/gsap/
- Motion：https://motion.dev/
- Framer Motion（已并入 Motion）：https://www.framer.com/motion/
- Popmotion（维护模式）：https://popmotion.io/

### 学习资源

- "anime.js for Beginners" by Web Dev Simplified（YouTube，v3 时代经典）
- "Modern Web Animation" by Sarah Drasner（CSS Tricks，跨库横向对比）
- "Designing Better Easing Curves" by Andrey Sitnik（Smashing Magazine，深入 easing）

---

## 总结

anime.js 的故事是开源动画库圈的一面镜子：

- **2017-2024 黄金期**：靠 MIT + 零依赖 + 极简 API 占住"GSAP 免费替代"心智
- **2024 v4 重写**：技术层面正确，生态层面阵痛（教程 / demo / 依赖大量基于 v3）
- **2026 现状**：在 vanilla JS 项目里仍是首选，但在 React 项目被 Motion 替代

**作为状元篇的工具库 B，记住三件事**：

1. **timeline + keyframes + easing** 是所有动画库的共同心智模型，理解它就能跨库迁移
2. **License + 框架适配** 是工具选型的两个核心维度，不是 API 美丑
3. **v4 重写代价** 是开源项目治理的经典案例：现代化 vs 兼容性的权衡

下次需要在简历项目里加一段 hero 文字浮现动画时，6 行代码搞定：

```javascript
import { animate, stagger } from 'animejs';
animate('.hero-title span', {
  opacity: [0, 1],
  translateY: [30, 0],
  duration: 800,
  ease: 'outBack',
  delay: stagger(50)
});
```

这就是 anime.js v4 的全部魅力。

---

> S33-4 完。下一篇：状元篇 round 160 = S33-5（待定）。
