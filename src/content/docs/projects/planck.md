---
title: Planck.js — Box2D 纯 JS 移植
来源: 'https://github.com/piqnt/planck.js'
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
难度: 初级
---

## 是什么

**Planck.js** 是由 Ali Shakiba（shakiba）维护的**开源 JavaScript/TypeScript 2D 刚体物理引擎**，MIT 协议，GitHub 仓库 [piqnt/planck.js](https://github.com/piqnt/planck.js) 约 5k+ star。它不是用 Emscripten 把 C++ Box2D「糊」进浏览器，而是**用 JS/TS 重写 Box2D 算法**——碰撞检测、约束求解、关节模型与经典 Box2D 一脉相承，但源码可读、可调试、可 tree-shake，适合在浏览器、Node.js 或混合栈里直接 `import`。

日常类比：把 Planck.js 想成**把 Box2D 裁判手册翻译成白话并搬进浏览器**。原版 Box2D 像一本德文技术规范（`b2World`、`b2BodyDef`、指针与宏）；Planck 保留同一套「世界 → 刚体 → 夹具 → 步进」判球逻辑，却换成 JavaScript 口语（`World`、`createBody({ type: 'dynamic' })`、普通对象字面量）。你仍负责画精灵、播音效、写关卡；Planck 只管「下一帧箱子落哪儿、铰链转多少度」——和 Matter.js 一样属于**程序化动画**后端，但 API 与 Box2D 文档几乎一一对应，读 Erin Catto 的 GDC 讲义或 Box2D 手册时不会迷路。

与 **box2d.js**（WASM/ asm.js 绑定）相比，Planck 的优势是**零 native 依赖、源码即教材**；与 **Matter.js**（原生 JS、自带 Canvas 渲染）相比，Planck 更贴近 Box2D 关节体系（Revolute、Prismatic、Gear…），适合已经熟悉 Box2D 或需要复杂机械约束的项目。MelonJS 等引擎的 `PhysicsAdapter` 也可切换到 Planck，游戏主逻辑不必重写。

```javascript
import { World, Box } from 'planck';

// 最小闭环：建世界 → 地面 + 动态箱 → 模拟若干步
const world = new World({ gravity: { x: 0, y: -10 } });

const ground = world.createBody({ type: 'static', position: { x: 0, y: -10 } });
ground.createFixture({ shape: Box(50, 0.5) });

const box = world.createBody({
  type: 'dynamic',
  position: { x: 0, y: 4 },
});
box.createFixture({ shape: Box(1, 1), density: 1, friction: 0.3 });

for (let i = 0; i < 120; i++) {
  world.step(1 / 60, 8, 3);
}
console.log(box.getPosition()); // 箱子已下落并可能与地面接触
```

上面与官方 [Hello World](https://piqnt.com/planck.js/docs/hello-world) 同构：重力向下、静态地面用 `Box` 薄片、动态体靠 `density` 算质量，循环里 `world.step` 推进仿真。

## 为什么重要

不了解 Planck.js，下面这些事都难以解释：

- 为什么有人坚持「Box2D 系」而不是 Matter——**关节类型、接触回调、连续碰撞**与 C++ Box2D 文档对齐，迁移旧项目或读 GDC 讲义成本更低
- 为什么纯 JS 物理引擎仍值得存在——避免 WASM 包体、跨语言调试和移动端 JIT 冷启动问题；Planck 内部算法与 Box2D 同源，行为可预期
- 为什么物理坐标要用**米**而不是像素——与 Box2D 一样按 MKS 调参；把 800px 宽角色当 800m 会导致堆叠不稳、穿透和「弹飞」
- 为什么 `world.step` 的 `timeStep` 应固定为 1/60 而渲染帧率可变——离散积分在大 dt 下会让高速物体**隧道穿透**（tunneling）；Planck 提供 `setContinuousPhysics` 缓解薄物体穿透
- 为什么 MelonJS、部分 HTML5 工具链列出 planck 适配器——它是浏览器里**可读源码的 Box2D 替身**，教育场景与二次开发友好

## 核心要点

### 1. 物理世界（World）

`World` 是一帧仿真的总容器，持有所有 body、fixture、joint 与自动生成的 contact。每调用一次 `world.step(timeStep, velocityIterations?, positionIterations?)`，内部大致顺序为：

1. **Broad-phase**：动态树（dynamic tree）筛出可能接触的 fixture 对
2. **Narrow-phase**：精确求交，生成接触流形（manifold）
3. **Solver**：对接触约束与关节约束施加冲量，修正速度
4. **Integration**：用新速度更新位姿

类比：粗检测像快递按区域分拣；细检测像逐件称重；求解器像调解员决定两辆车擦碰后各退多少。

Planck **不提供默认渲染器**——与 Matter.js 内置 `Render` 不同。集成方式固定为：游戏循环里 `world.step`，再遍历 body 把 `getPosition()` / `getAngle()` 同步到 Canvas、Pixi、Phaser 或 DOM。

### 2. 刚体（Body）与夹具（Fixture）

| 概念 | 职责 |
|------|------|
| **Body** | 质心位姿、线/角速度；类型 `static` / `kinematic` / `dynamic` |
| **Fixture** | 把 **Shape** 挂在 body 上，带密度、摩擦、弹性、传感器标志 |
| **Shape** | 几何：`Box`、`Circle`、`Edge`、`Polygon` 等；Planck 中 shape **不可变**，创建 fixture 时不会克隆副本 |

创建套路：`world.createBody({ type, position, angle })` → `body.createFixture({ shape, density, friction, restitution })`。

常用 fixture 选项：

| 选项 | 含义 |
|------|------|
| `density` | 密度，与形状面积算质量与转动惯量 |
| `friction` | 库仑摩擦，多在 0～1 |
| `restitution` | 恢复系数，0 = 不弹，1 = 完全弹性 |
| `isSensor` | 传感器：产生接触但不产生碰撞响应，用于拾取、触发区 |

静态体默认 `type: 'static'`，不受力也不被推动；`kinematic` 可由代码设速度驱动平台；`dynamic` 完全受力和约束影响。

### 3. 形状（Shape）工厂

Planck 提供与 Box2D 对应的形状构造器（多为函数或类）：

- `Box(halfWidth, halfHeight)` — 轴对齐矩形（半宽半高）
- `Circle(radius)` — 圆
- `Edge(v1, v2)` — 线段，常用于地面、斜坡
- `Polygon(vertices)` — 凸多边形顶点数组

**Edge** 特别适合无限长地面：用 `createFixture({ shape: Edge({ x: -50, y: 0 }, { x: 50, y: 0 }) })` 搭平台，比巨宽 `Box` 更省且数值更稳。

### 4. 关节（Joint）

关节把两个 body 约束在一起，是 Box2D 系相对 Matter「约束 API」更完整的一环：

| 关节 | 典型用途 |
|------|----------|
| **RevoluteJoint** | 铰链、摆锤、门轴 |
| **PrismaticJoint** | 活塞、滑动门 |
| **DistanceJoint** | 绳、链（固定两锚点距离） |
| **GearJoint** | 齿轮传动 |
| **WheelJoint** | 2D 车辆悬挂 |

创建方式：`world.createJoint(new RevoluteJoint(options, bodyA, bodyB, anchorPoint))`。锚点 `anchorPoint` 是**世界坐标**下的铰链位置；创建前两个 body 应已摆到正确相对位姿。

**注意**：`createJoint` / `destroyBody` 在 `world.step` 执行期间会被**锁定**；若在步进中改场景，用 `world.queueUpdate(fn)` 把修改推迟到步进结束后。

### 5. 事件（World#on / #off）

Planck 在 `World` 上扩展了 Box2D 没有的事件总线：

| 事件 | 时机 |
|------|------|
| `begin-contact` | 两 fixture 开始接触 |
| `end-contact` | 接触结束 |
| `pre-solve` | 求解前，可修改接触冲量 |
| `post-solve` | 求解后，可读冲量做音效/伤害 |

用法：`world.on('begin-contact', (contact) => { ... })`；移除用 `world.off`。适合计分、播放碰撞音、统计连击，而不必手写 broad-phase 查询。

### 6. 查询（Query）

- `world.queryAABB(aabb, callback)` — 矩形区域内有哪些 fixture
- `world.rayCast(start, end, callback)` — 射线检测，用于点击选中、子弹命中

回调里可过滤传感器、按 fixture 返回 fraction 控制「最近命中」或「穿透多段」。

### 7. 与 C++ Box2D 的 API 差异（读旧资料时对照）

| C++ Box2D | Planck.js |
|-----------|-----------|
| `b2World` | `World` |
| `b2BodyDef` + `CreateBody` | `createBody({ ... })` 字面量 |
| `b2FixtureDef` | `createFixture({ ... })` |
| `b2Vec2` | `{ x, y }` 或 `Vec2` |
| `UpperCamelCase` 方法 | `lowerCamelCase`（如 `getPosition`） |
| 无统一事件 | `world.on('begin-contact', ...)` |

文档 [piqnt.com/planck.js/docs](https://piqnt.com/planck.js/docs/) 与 Box2D 手册章节对应，名词常互换使用。

### 8. 单位与步进参数

- **长度**：米（m）；像素显示前自行 `× scale`
- **质量**：千克（kg）；由 `density × 面积` 推导
- **时间**：秒（s）；`world.step(1/60)` 表示 60Hz 物理
- **迭代次数**：`velocityIterations`（默认 8）、`positionIterations`（默认 3）越高越稳但越慢；堆叠关卡可适当提高

`world.setAllowSleeping(true)` 可让静止岛休眠，大场景省 CPU；动态体被唤醒后会重新参与求解。

## 实践案例

### 案例 1：Canvas 自定义循环——落箱与同步绘制

Planck 不带渲染器，典型集成是 `requestAnimationFrame` + 2D Canvas：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Planck.js 最小 Canvas 示例</title>
</head>
<body>
  <canvas id="c" width="800" height="600"></canvas>
  <script type="module">
    import { World, Box } from 'https://esm.sh/planck';

    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    const SCALE = 30; // 30 像素 = 1 米

    const world = new World({ gravity: { x: 0, y: -10 } });

    const ground = world.createBody({ type: 'static', position: { x: 0, y: -1 } });
    ground.createFixture({ shape: Box(20, 0.5), friction: 0.6 });

    const box = world.createBody({ type: 'dynamic', position: { x: 0, y: 5 } });
    box.createFixture({ shape: Box(0.5, 0.5), density: 1, friction: 0.3, restitution: 0.2 });

    function toScreen(v) {
      return { x: 400 + v.x * SCALE, y: 500 - v.y * SCALE };
    }

    function drawBox(body, color) {
      const p = toScreen(body.getPosition());
      const a = body.getAngle();
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(-a);
      ctx.fillStyle = color;
      ctx.fillRect(-0.5 * SCALE, -0.5 * SCALE, 1 * SCALE, 1 * SCALE);
      ctx.restore();
    }

    let last = performance.now();
    function loop(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      world.step(1 / 60, 8, 3);

      ctx.clearRect(0, 0, 800, 600);
      ctx.fillStyle = '#2d3436';
      ctx.fillRect(0, 500 - (-1 + 0.5) * SCALE - 0.5 * SCALE, 800, 0.5 * SCALE * 2);
      drawBox(box, '#3498db');
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  </script>
</body>
</html>
```

**要点**：物理用米、显示用 `SCALE` 映射；Canvas Y 轴向下故 `500 - y * SCALE`；`step` 用固定 1/60 而非可变 `dt`，避免穿透；只画了一个 box，地面用矩形近似，完整项目应遍历 `world.getBodyList()` 绘制所有动态体。

### 案例 2：铰链摆锤 + 碰撞事件

演示 `RevoluteJoint` 与 `begin-contact` 监听：

```javascript
import { World, Box, RevoluteJoint } from 'planck';

const world = new World({ gravity: { x: 0, y: -10 } });

const ground = world.createBody({ type: 'static', position: { x: 0, y: 0 } });
ground.createFixture({ shape: Box(20, 0.5) });

// 铰链锚点（世界坐标）
const anchor = { x: 0, y: 8 };
const pivot = world.createBody({
  type: 'static',
  position: anchor,
});
const pendulum = world.createBody({
  type: 'dynamic',
  position: { x: 0, y: 5 },
});
pendulum.createFixture({ shape: Box(0.25, 2.5), density: 1, friction: 0.1 });

world.createJoint(
  new RevoluteJoint({
    enableLimit: true,
    lowerAngle: -0.8,
    upperAngle: 0.8,
  }, pivot, pendulum, anchor),
);

world.on('begin-contact', (contact) => {
  const fixtureA = contact.getFixtureA();
  const fixtureB = contact.getFixtureB();
  const bodyA = fixtureA.getBody();
  const bodyB = fixtureB.getBody();
  if (bodyA === pendulum || bodyB === pendulum) {
    console.log('摆锤碰到东西了');
  }
});

// 给摆锤初速度
pendulum.setLinearVelocity({ x: 3, y: 0 });

for (let i = 0; i < 300; i++) {
  world.step(1 / 60);
}
```

**要点**：`RevoluteJoint` 第四个参数是**世界坐标**锚点，不是局部 offset；`enableLimit` 限制摆动角度；`setLinearVelocity` 在步进前设置初态；事件在 `step` 内触发，回调里不要 `createJoint`（世界 locked 时用 `queueUpdate`）。

### 案例 3：Testbed 快速试验（官方推荐）

仓库提供 **Testbed** 运行时，适合复现 bug 与学习示例：

```javascript
import { Testbed, World, Box } from 'planck';

const testbed = Testbed.mount();
const world = new World({ gravity: { x: 0, y: -10 } });
testbed.world = world;

const body = world.createBody({ type: 'dynamic', position: { x: 0, y: 4 } });
body.createFixture({ shape: Box(1, 1), density: 1 });

testbed.start(world);
```

访问 [piqnt.com/planck.js](https://piqnt.com/planck.js/) 可在线看数十个官方 demo（Revolute、Car、Rope、Breakable…）。向 GitHub 报 issue 时附带 Testbed 复现代码可显著加快修复。

## 安装与集成

| 方式 | 命令 / 用法 |
|------|-------------|
| npm | `npm install planck` |
| ESM | `import { World, Box } from 'planck'` |
| CDN | `import from 'https://esm.sh/planck'` |
| TypeScript | 包内自带类型定义 |

与打包器（Vite、Webpack、esbuild）兼容；Tree shaking 可只打入用到的关节类。Node.js 中可用于 headless 回归测试（只 `step`、不画图）。

**MelonJS**：v19.5+ 通过 `PhysicsAdapter` 可选 planck，关卡代码尽量只调引擎抽象层，避免直接依赖 Planck 类型。

## 与其它 2D 物理引擎对比

| 引擎 | 实现 | 渲染 | 关节/约束 | 适合场景 |
|------|------|------|-----------|----------|
| **Planck.js** | Box2D 算法 JS 重写 | 无（自绘） | Box2D 全套关节 | 熟悉 Box2D、复杂机械、读 GDC 讲义 |
| **Matter.js** | 原生 JS | 内置 Canvas | Constraint API 较扁平 | 快速 HTML5 demo、教育页 |
| **box2d.js** | WASM C++ | 无 | 与 C++ 一致 | 追求与 C++ 二进制一致的行为 |
| **p2.js** | 原生 JS | 无 | 中等 | 历史项目维护 |

选型口诀：**要 Box2D 文档一字不差跟着做 → Planck；要五分钟出画面 → Matter；要与 C++ 二进制同构 → box2d.js/WASM**。

## 学习路径

1. 读官方 [Hello World](https://piqnt.com/planck.js/docs/hello-world) 与 [Overview](https://piqnt.com/planck.js/docs/)，跑在线 Examples
2. 对照本仓库笔记 [Box2D](box2d.md) 理解 broad-phase、冲量求解、休眠
3. 选一个 Joint 文档（Revolute → Wheel → Gear）做小 demo
4. 用 `queryAABB` / `rayCast` 实现鼠标拖拽或点击发射
5. 读 `CHANGES.md` 了解相对 C++ 的刻意差异（shape 不可变、事件 API）

## 常见坑

| 现象 | 原因 | 处理 |
|------|------|------|
| 物体抖动、堆叠炸开 | 像素当米、质量极大 | 统一 MKS，`SCALE` 只用于显示 |
| 高速穿透薄墙 | `step` 用过大 `timeStep` | 固定 1/60，或提高迭代、开 continuous physics |
| `createJoint` 报错 | 在 `step` 内改世界 | 用 `queueUpdate` |
| 铰链位置怪异 | 锚点用了局部坐标 | 铰链参数用世界坐标，或先 `body.getWorldPoint` |
| 传感器没碰撞感 | `isSensor: true` | 预期行为；用 `begin-contact` 做逻辑 |
| 与 Matter 代码混拷失败 | API 不同 | 按 Body/Fixture/Joint 模型改写，勿假设 `Composite.add` |

## 资源

- 官网与文档：[piqnt.com/planck.js](https://piqnt.com/planck.js/)
- GitHub：[piqnt/planck.js](https://github.com/piqnt/planck.js)
- Discord：[社区邀请链接](https://discord.com/invite/znjh6J7)
- Box2D 原版：[erincatto/box2d](https://github.com/erincatto/box2d)（本仓库 [box2d.md](box2d.md)）
- 同类 JS 笔记：[matter-js.md](matter-js.md)、[cannon-es.md](cannon-es.md)（3D 对照）

## 小结

Planck.js 把 Box2D 的刚体仿真搬进现代 JavaScript：无 WASM、API 口语化、关节与接触模型完整，但不包渲染。零基础上手记住四步：**`World` 设重力 → `createBody` + `createFixture` → 循环 `step` → 读位姿画到屏幕**。复杂玩法靠关节和 `world.on` 事件扩展。读完本文后，建议打开官方 Testbed 里 Revolute 与 Car 示例对照源码走一遍，比死记 API 更快建立「约束即动画」的直觉。
