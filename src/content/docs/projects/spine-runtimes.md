---
title: Spine Runtimes — 2D 骨骼动画运行时
来源: 'https://github.com/EsotericSoftware/spine-runtimes'
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
难度: 初级
---

## 日常类比：Spine Runtimes 是「木偶戏的提线师」

在 Spine 编辑器里，美术像搭木偶：头、躯干、四肢是**骨头**，贴图是**皮肤**，走路、跳跃是**动作剧本**。导出后得到 JSON（或二进制）和图集——相当于把木偶和剧本装进箱子。

**Spine Runtimes** 就是游戏引擎里的**提线师**：读箱子里的数据，每帧按剧本拉动骨头，把贴图画到屏幕上。你不用在代码里逐帧摆坐标，而是说「播 walk」「接 jump」「上半身举枪、下半身继续走」。

和「导出成一张张精灵图 GIF」不同，骨骼动画只占一份贴图 + 骨骼变换，内存小、可混色、可换装、可程序化改姿势（比如枪口始终瞄准鼠标）。

| 维度 | 数据 |
|---|---|
| GitHub | [EsotericSoftware/spine-runtimes](https://github.com/EsotericSoftware/spine-runtimes) |
| 官方文档 | [Spine Runtimes Guide](http://esotericsoftware.com/spine-runtimes-guide) |
| 默认分支 | `4.2`（须与 Spine 编辑器导出版本一致） |
| 协议 | Spine Runtimes License（集成免费评估；商业分发需留意授权） |
| 语言覆盖 | C++、C#、Java、TypeScript、Haxe、Dart、Swift 等 |
| 引擎集成 | Unity、Unreal、Godot、libGDX、Phaser、PixiJS、Three.js、Flutter 等 |

---

## 是什么

[Spine Runtimes](https://github.com/EsotericSoftware/spine-runtimes) 是 Esoteric Software 维护的**官方运行时库集合**，用来在各类游戏引擎和框架中加载、播放、混合 [Spine](http://esotericsoftware.com/) 导出的 2D 骨骼动画。

工作流分三段：

1. **Spine 编辑器** — 美术绑骨、K 帧、做 Skin 换装、设动画混合时间  
2. **导出资源** — `skeleton.json`（或 `.skel` 二进制）+ `name.atlas` + 若干 `.png` 图集页  
3. **Runtime** — 在游戏循环里 `load → update → apply → render`

仓库按语言/引擎拆目录，例如 `spine-csharp/`、`spine-ts/`、`spine-unity/`、`spine-godot/`、`spine-libgdx/`。`spine-libgdx`（Java）是**参考实现**，编辑器里的行为以它为准，其他语言多为移植。

---

## 为什么重要

不了解 Spine Runtimes，下面几件事很难讲清楚：

- 为什么同一套角色动画能同时跑在 Unity、Godot、H5 小游戏里——**数据格式统一**，只差各引擎的渲染胶水层  
- 为什么「walk 切 jump」可以 0.2 秒淡入淡出而不是硬切——`AnimationState` + `AnimationStateData.setMix()`  
- 为什么骨骼动画比逐帧大图省内存——贴图只上传一次，每帧只改矩阵，不重复存 30 张全身图  
- 为什么 Runtime 版本必须和编辑器版本对齐——`4.2.xx` 导出的 JSON 字段和 `3.8` 运行时解析器对不上会直接崩

---

## 核心概念

### 1. 数据层：SkeletonData — 只读的「角色蓝图」

`SkeletonData` 从 JSON/二进制解析而来，包含骨骼层级、插槽、附件、皮肤、动画定义。**可共享**：一百个敌人可以共用一份 `SkeletonData`，各自实例化 `Skeleton`。

加载典型路径（伪代码，各语言类名一致）：

```
Atlas atlas = load("hero.atlas")
SkeletonJson json = new SkeletonJson(atlas)
SkeletonData data = json.readSkeletonData("hero.json")
Skeleton skeleton = new Skeleton(data)
```

### 2. 骨骼 Bone — 层次变换节点

Bone 组成父子树：父骨旋转，子骨跟着动。每个 Bone 有 local 变换（位置、旋转、缩放）；渲染前需 `skeleton.updateWorldTransform()` 算出 world 矩阵。类比：木偶的肩关节转 30°，整条胳膊跟着转。

### 3. 插槽 Slot 与附件 Attachment

**Slot** 是骨上的「挂钩」，决定画什么、画多深（draw order）。**Attachment** 是挂上去的物件：最常见 `RegionAttachment`（矩形贴图），还有 `MeshAttachment`（变形网格）、`BoundingBoxAttachment`（碰撞框）等。换 Skin 本质是换同一 Slot 上绑定的 Attachment 集合。

### 4. Skin — 换装表

`Skin` 记录「插槽名 → 附件」映射。运行时 `skeleton.setSkin("armor-heavy")` 再 `setSlotsToSetupPose()` 即可换装，无需重新导出动画。

### 5. Animation 与 Timeline — 最低层 API

`Animation` 由多条 `Timeline` 组成，每条 Timeline 改一种属性（某骨的旋转、某 Slot 的颜色等）。直接 `animation.apply(skeleton, lastTime, time, loop, ...)` 可以精确控制，但要自己管时间状态。**大多数项目用更上层的 AnimationState。**

### 6. AnimationState — 日常播放的核心

`AnimationState` 负责：

- 多轨道（track）叠加：track 0 走路，track 1 挥手，高轨道覆盖低轨道同名属性  
- 队列：`addAnimation` 在当前动画结束后播下一个  
- 混合（crossfade）：`AnimationStateData.setMix("walk", "jump", 0.2)`  

**每帧固定三步**（官方文档反复强调）：

```
state.update(delta)           // 推进时间
state.apply(skeleton)         // 把动画姿势写到骨骼
skeleton.updateWorldTransform() // 算世界矩阵 + 约束
render(skeleton)              // 引擎相关：画三角形
```

漏掉 `update()` 再 `apply()` 可能重复触发监听器导致栈溢出；漏掉 `updateWorldTransform()` 则画面停在 setup pose 或局部错乱。

### 7. Atlas 图集 — 贴图打包

运行时通过 `.atlas` 文件知道每个附件在 PNG 大图中的 UV 区域。换图集页 = 额外 GPU bind，所以打包时尽量合并页数。`AtlasAttachmentLoader` 根据附件名查 region，是 JSON 加载的标配搭档。

### 8. spine-ts 模块分层（Web 方向）

TypeScript 生态拆得很细（见 `spine-ts/README.md`）：

| 模块 | 用途 |
|------|------|
| `spine-core` | 解析、骨骼、AnimationState，无渲染 |
| `spine-webgl` / `spine-canvas` | 自带渲染后端 |
| `spine-player` | 网页嵌入播放器，最适合展示页 |
| `spine-phaser-v3/v4`、`spine-pixi-v7/v8` | 挂到具体游戏框架 |

npm 包名均在 `@esotericsoftware` scope 下，版本号与 Spine 编辑器主版本对齐（如 `4.2.*`）。

---

## 代码示例一：AnimationState 走路 / 跳跃（TypeScript 风格）

下面示例展示加载后的**游戏循环内核**，与官方 [Using Spine Runtimes](http://esotericsoftware.com/spine-using-runtimes/) 伪代码一致，可直接迁到 `spine-ts` 或 `spine-csharp`：

```typescript
import * as spine from '@esotericsoftware/spine-core';

// 1. 加载（初始化阶段做一次）
const atlas = new spine.TextureAtlas(atlasText, (path) => loadTexture(path));
const attachmentLoader = new spine.AtlasAttachmentLoader(atlas);
const json = new spine.SkeletonJson(attachmentLoader);
const skeletonData = json.readSkeletonData(jsonText);

const skeleton = new spine.Skeleton(skeletonData);
skeleton.setSkinByName('default');
skeleton.setSlotsToSetupPose();

const stateData = new spine.AnimationStateData(skeletonData);
stateData.setMix('walk', 'jump', 0.2);
stateData.setMix('jump', 'walk', 0.4);

const state = new spine.AnimationState(stateData);
state.setAnimation(0, 'walk', true); // track 0 循环走路

// 2. 每帧（requestAnimationFrame 或引擎 update）
function frame(deltaSeconds: number) {
  state.update(deltaSeconds);
  state.apply(skeleton);
  skeleton.updateWorldTransform(spine.Physics.update);

  // 3. 交给 spine-webgl / Unity / Godot 的 renderer 绘制
  renderer.draw(skeleton);

  if (input.justPressed('Space')) {
    state.setAnimation(0, 'jump', false);
    state.addAnimation(0, 'walk', true, 0); // 跳完自动回走路
  }
}
```

要点：

- `setMix` 在 `AnimationStateData` 上配置，而不是单个动画上  
- `addAnimation` 第四个参数 `delay`：≤0 表示「接在上一个动画时长之后」  
- 输入检测应放在 `apply` 之后或之前均可，但**渲染必须在 `updateWorldTransform` 之后**

---

## 代码示例二：多轨道分层 + 程序化改骨（C# / Unity 通用逻辑）

上半身举枪、下半身继续跑，是 Spine 在动作游戏里的经典用法：track 0 管腿，track 1 管上身。必要时在 `apply` 之后手动改 bone，再第二次 `updateWorldTransform`：

```csharp
// 初始化
var state = new AnimationState(stateData);
state.SetAnimation(0, "run", true);           // 下身/全身基础
state.SetAnimation(1, "aim-upper", true);   // 上身瞄准，覆盖同属性

// 每帧
state.Update(deltaTime);
state.Apply(skeleton);

// 程序化：让武器骨朝向鼠标（在 apply 之后、最终 updateWorldTransform 之前）
Bone weapon = skeleton.FindBone("weapon");
if (weapon != null) {
    float angle = Mathf.Atan2(mouseY - weapon.WorldY, mouseX - weapon.WorldX) * Mathf.Rad2Deg;
    weapon.Rotation = angle;
}

skeleton.UpdateWorldTransform(Skeleton.Physics.Update);
skeletonRenderer.LateUpdate(); // Unity 组件里触发网格提交
```

若需要先读动画算出的 world 旋转再叠加修正，可调用两次 `UpdateWorldTransform`：第一次在 `apply` 后读 world 矩阵，改 local 后再调一次。官方 [Runtime Skeletons](http://esotericsoftware.com/spine-runtime-skeletons) 文档有图解。

---

## 导出与版本对齐清单

从 Spine 编辑器 **Export** 时通常得到：

| 文件 | 内容 |
|------|------|
| `hero.json` 或 `hero.skel` | 骨骼、动画、皮肤、约束 |
| `hero.atlas` | 各附件在图集上的位置、旋转、留白剥离信息 |
| `hero.png`（可多页） | 实际贴图 |

实践建议：

1. **编辑器版本 = Runtime 分支**，例如都用 `4.2.xx`  
2. 生产环境优先 **二进制 `.skel`**，体积小、解析快  
3. 把 `SkeletonData` 当**不可变资源**缓存，角色实例只建 `Skeleton` + `AnimationState`  
4. 集成 Unity 时，`spine-unity` 基于 `spine-csharp`，可用 UPM 从 Git 按 path 引入  
5. 分发给**最终玩家**的商业游戏需遵守 [Spine 授权](https://esotericsoftware.com/spine-purchase)；做 SDK/中间件时要告知下游用户也需授权

---

## 与「精灵图动画」的对比

| 维度 | Spine 骨骼 + Runtime | 传统序列帧 |
|------|---------------------|------------|
| 磁盘 / 内存 | 一份图集 + 骨骼数据 | 每帧一张图，体积线性涨 |
| 动画混合 | `AnimationState` 内置 crossfade | 需手写或额外工具 |
| 运行时换装 | 换 Skin | 通常要另导出多套图 |
| 程序化 | 可改 Bone 后再渲染 | 只能换帧 |
| 集成成本 | 需接 Runtime + 授权 | 任意引擎 `drawImage` 即可 |

---

## 学习路径（零基础）

1. 读 [Spine Runtimes Guide](http://esotericsoftware.com/spine-runtimes-guide) 的 Loading / Applying Animations / Runtime Skeletons 三章  
2. 在 GitHub 打开自己引擎目录下的 `README.md`（如 `spine-unity`、`spine-godot`、`spine-ts`）  
3. 跑官方示例：`spine-ts` 里 `npm install && npm run dev`，浏览器打开 `http://127.0.0.1:8080`  
4. 用 [Spine Examples](https://esotericsoftware.com/spine-examples) 里的 `spineboy` 资源练手导出  
5. 实现最小循环：`load → setAnimation → update/apply/updateWorldTransform → draw`，再加 `setMix` 和第二轨道

---

## 常见坑

- **版本不匹配**：JSON 里多了新字段，旧 Runtime 解析失败 — 升级 Runtime 或重新用对应版本编辑器导出  
- **忘记 `updateWorldTransform`**：画面不跟动画走，或约束（IK、Path）不生效  
- **Atlas 路径错**：`.atlas` 里写的 PNG 相对路径与打包目录不一致，附件全白  
- **缩放忘了**：`SkeletonJson.setScale(0.5)` 影响坐标系，2D 像素游戏要统一编辑器与运行时 scale  
- **Canvas 后端限制**：`spine-canvas` 不支持 mesh、裁剪等高级特性，复杂角色用 `spine-webgl`  
- **一帧多次 `apply` 不调 `update`**：监听器死循环，官方文档明确警告

---

## 和本仓库其他笔记的关系

- 做 **H5 2D 游戏**时可与 [Phaser](/docs/projects/phaser) 对照：`spine-phaser-v4` 把上述循环接到 Phaser Scene 的 `update`  
- 做 **Godot** 项目可看 [godot](/docs/projects/godot) + `spine-godot` 运行时  
- 若只需要网页展示动画、不做完整游戏，优先 `spine-player`，比手写 WebGL 胶水省时间

---

## 小结

Spine Runtimes 不是又一个动画编辑器，而是把 Spine 导出的**骨骼数据**翻译成各引擎能画的**姿势 + 贴图 UV** 的跨平台库。记住一条主线即可：

**`AnimationState.update → apply → Skeleton.updateWorldTransform → 引擎绘制`**

掌握 `SkeletonData` / `Skeleton` / `AnimationState` 三件套，再查对应引擎的 Renderer 封装，就能从零把 Spine 角色跑进自己的项目。
