---
title: "planck.js — 纯 JS Box2D 生态"
schema_version: study-v1
来源: https://github.com/piqnt/planck.js
日期: 2026-07-08
分类: graphics
难度: 中级
---

## 是什么

planck.js 是 **Box2D 的纯 JavaScript / TypeScript 移植**：在浏览器里做 2D 刚体物理——重力、碰撞、摩擦、关节——而不必接 WASM 或 C++ 工具链。日常类比：Box2D 像一本英文物理教材；planck 是同一本教材的**中文精译本**——公式和章节结构几乎一一对应，但你可以直接用 npm 装进网页。

你声明世界（World）、刚体（Body）、夹具（Fixture）和关节（Joint），每帧调用 `world.step(dt)`，引擎算出新位置；你再把坐标画到 Canvas / WebGL。它不是动画补间库，而是**按物理规则推演**的求解器。

项目地址：<https://github.com/piqnt/planck.js>（约 5k+ stars，MIT）。文档与在线示例见 <https://piqnt.com/planck.js/>。

## 为什么重要

不理解 planck，下面这些前端物理坑会反复踩：

- 为什么「手写速度 += 重力」在碰撞后总穿墙、抖动
- 为什么同一套参数在 30fps 和 60fps 下手感完全不同
- 为什么想做铰链门、滑轮、传感器触发区，自己写碰撞检测会爆炸
- 为什么团队想要「可复现的 2D 物理」却不想引入 WASM 构建链

planck 把 Erin Catto 的 Box2D 模型搬进 JS，让网页小游戏和教学 demo 能用**同一套刚体语义**。

## 核心要点

1. **世界 + 固定步长**。`planck.World({ gravity: { x: 0, y: -10 } })` 创建世界；每帧 `world.step(1/60)`。类比：节拍器——拍子不稳，乐队（刚体）就会越演越乱。

2. **Body / Fixture 分工**。Body 管质量、速度、位置；Fixture 挂形状（圆、多边形、边）和材料（密度、摩擦、弹性）。类比：人是 Body，盔甲形状是 Fixture——换盔甲不换人。

3. **Joint 与 Contact**。铰链、滑块、距离关节把多个 Body 约束在一起；接触监听器告诉你「谁撞了谁」。传感器 Fixture（`isSensor: true`）只检测接触、不产生推力——适合触发区、得分圈、传送门。

把这三层记成一句话：**World 管时间，Body 管运动，Fixture/Joint 管「长什么样、怎么连」**。

## 实践案例

### 案例 1：地面 + 下落的球

```js
import planck from 'planck';

const world = planck.World({ gravity: { x: 0, y: -10 } });
const ground = world.createBody({ type: 'static' });
ground.createFixture(planck.Edge(planck.Vec2(-20, 0), planck.Vec2(20, 0)));

const ball = world.createBody({
  type: 'dynamic',
  position: planck.Vec2(0, 10),
});
ball.createFixture(planck.Circle(0.5), {
  density: 1,
  restitution: 0.8, // 弹性：越接近 1 越弹
  friction: 0.2,
});

for (let i = 0; i < 120; i++) world.step(1 / 60);
console.log(ball.getPosition().y.toFixed(2));
```

**逐部分解释**：① 静态地面用 Edge；② 动态球挂 Circle Fixture；③ `restitution` 控制弹跳；④ 固定 `1/60` 步进 120 次后读位置——别用真实帧间隔当 `dt`。

### 案例 2：像素坐标 vs 世界单位

```js
const SCALE = 40; // 1 米 = 40 像素
function toScreen(v) {
  return { x: v.x * SCALE + 400, y: 300 - v.y * SCALE };
}
// 渲染时：ctx.arc(toScreen(ball.getPosition()).x, ...)
// 切勿把 body 半径写成 80（像素）却重力仍用 -10（米/秒²）
```

**逐部分解释**：① Box2D/planck 用米制；② 屏幕用像素，必须统一缩放；③ 半径 80「像素当米」会让物体像行星一样重、碰撞爆炸。

### 案例 3：传感器触发（不反推）

```js
const sensor = world.createBody({ type: 'static', position: planck.Vec2(2, 1) });
sensor.createFixture(planck.Box(1, 1), { isSensor: true });

world.on('begin-contact', (contact) => {
  const fa = contact.getFixtureA();
  const fb = contact.getFixtureB();
  if (fa.isSensor() || fb.isSensor()) console.log('进入触发区');
});
```

**逐部分解释**：① `isSensor: true` 只报告接触；② 用 `begin-contact` 做得分区/传送门；③ 普通 Fixture 会互相推开，传感器不会。

## 踩过的坑

1. **混用像素和世界单位**：半径、重力、速度量纲不一致 → 爆炸或「像在蜂蜜里」。
2. **用真实帧 dt 直接 step**：掉帧时 `dt` 变大 → 隧穿；应固定步长 + 余数累积。
3. **销毁 Body 却忘了 Joint**：残留关节引用 → 下一步崩溃或幽灵力。
4. **碰撞过滤掩码（categoryBits / maskBits）配错**：看起来「该撞的不撞」，调试极难。

## 适用 vs 不适用

**适用**：
- Canvas / WebGL 教学 demo、轻量 2D 平台或益智游戏（刚体数大约 < 200）
- 需要与 Box2D 教程/概念一一对照的 JS 项目
- 想避免 WASM 工具链、纯 npm 集成的原型

**不适用**：
- 3D 物理或布料/软体（用其他引擎）
- 上千刚体的大规模场景（JS 单线程吃力，考虑 WASM Box2D / Rapier）
- 对抖动极敏感的竞技同步（需更严的确定性与插值方案）
- 只要补间动画、不要真实碰撞——用普通动画库更简单

## 历史小故事（可跳过）

- **2007 起**：Erin Catto 开源 Box2D（C++），成为 2D 游戏物理事实标准。
- **2010s**：多语言移植涌现；JS 侧需要「能直接读 Box2D 手册」的实现。
- **planck.js**：piqnt 维护的纯 JS 移植，API 刻意贴近 Box2D，方便对照 C++ 教程。
- **同期对照**：[[matter-js]] 更「前端友好、API 自研」；planck 更「Box2D 原教旨」。
- **今天**：仍活跃于浏览器物理 demo；重度性能场景常转向 WASM 方案。

## 学到什么

1. **物理引擎卖的是稳定步进与约束求解**，不是「帮你画图」。
2. **单位制是第一公民**：米与像素混用比写错公式更常见。
3. **Body / Fixture / Joint 三分法**让碰撞形状和运动状态解耦。
4. **传感器 ≠ 碰撞体**：触发逻辑和力学反应用不同 Fixture 表达。

## 延伸阅读

- 官方仓库：<https://github.com/piqnt/planck.js>
- 文档与示例：仓库 `docs` / 在线 demo（按版本查阅）
- Box2D 手册：Erin Catto 的原始概念仍是最好的理论入口
- [[matter-js]] —— 另一条轻量 JS 2D 物理路线
- [[box2d]] —— C++ 原版，对照 API 时最有用

## 关联

- [[box2d]] —— planck 移植的源头，概念与术语几乎一一对应
- [[matter-js]] —— 更前端向的 2D 引擎，API 不追求 Box2D 兼容
- [[rapier]] —— Rust/WASM 高性能物理，规模上去后的常见升级路径
- [[pixi]] —— 常与 planck 搭配：物理算位置，Pixi 负责渲染
- [[phaser]] —— 游戏框架；可用自带物理或外挂 planck/matter
- [[cannon-es]] —— 3D 刚体（浏览器），需求升维时对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

