---
title: DragonBones — 国产开源骨骼动画
来源: 'https://github.com/DragonBones/DragonBonesCPP'
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
难度: 初级
---

## 是什么

**DragonBones**（龙骨）是一套**国产、开源、MIT 协议**的 **2D 骨骼动画**方案：美术在编辑器里给角色「绑骨」，程序在运行时只播放骨骼变换数据，而不是逐帧换整张图。日常类比：传统逐帧动画像翻**连环画**——每一页都是完整人物；骨骼动画像**提线木偶**——头、躯干、四肢是几块贴图，关节转动就能摆出走路、攻击、受伤等动作，贴图数量少得多，动作却更顺滑。

DragonBones 把链路拆成两半：

| 角色 | 做什么 |
|------|--------|
| **创作端** | [LoongBones](http://www.loongbones.app/) / DragonBones Pro 等编辑器：时间轴打关键帧、IK、网格变形、换装 |
| **运行时** | 各语言 Runtime 解析导出的 JSON + 图集，在 PixiJS、Phaser、Cocos、Egret、Cocos2d-x、SFML 等引擎里渲染 |

GitHub 上 Runtime 按语言分仓：[DragonBonesJS](https://github.com/DragonBones/DragonBonesJS)（TypeScript，约 1.4k star）、[DragonBonesCPP](https://github.com/DragonBones/DragonBonesCPP)（C++，约 430 star）、[DragonBonesCSharp](https://github.com/DragonBones/DragonBonesCSharp) 等。公共核心在 `DragonBones/` 目录，引擎适配层只负责「把骨骼画到屏幕上」。C++ 仓 README 明确推荐用 **DragonBones Pro / LoongBones** 制作资源，再接入 Cocos2d-x 或 SFML。

零基础可以记住一句话：**编辑器产出数据，Factory 解析数据，Armature 在屏幕上动。**

## 为什么重要

不了解 DragonBones，下面几件事很难讲清楚：

- 为什么 2D 手游角色能**一张图集、多套动作**，包体却比 GIF 逐帧小——骨骼只存关节矩阵和少量关键帧，不存每帧整图
- 为什么**换装、换武器**常是一行代码换 Slot 贴图，而不是重做动画——贴图挂在 Slot 上，骨骼树不变
- 为什么国内 H5、小游戏、Cocos 生态里常看到 `.json` + `_tex.png` 资源对——那是 DragonBones 标准导出格式
- 它和 **Spine** 同属骨骼动画赛道，但 DragonBones 起源更早扎根国内引擎（白鹭 Egret、Cocos 系列），文档与社区以中文为主，对国产技术栈更友好

和「引擎自带精灵帧动画」相比：帧动画适合特效、UI 图标；**可交互角色**（跑、跳、受击、换装）更适合骨骼。和 Live2D 相比：DragonBones 偏**游戏侧** 2D 骨骼，不是面向直播的精细面部变形。

## 核心概念

### 1. 骨骼（Bone）——关节

Bone 是逻辑上的**关节节点**，负责平移、旋转、缩放。子骨骼跟随父骨骼变换，形成树形层级。类比：木偶的「上臂」转一下，「前臂」和「手」会一起跟着动（除非你在代码里单独改子骨）。

### 2. 插槽（Slot）——挂贴图的位置

Slot 挂在 Bone 上，**显示层**贴图（Display）挂在 Slot 里。一个 Slot 可切换不同贴图（换装），也可挂子 Armature（嵌套动画）。Bone 管「怎么动」，Slot 管「显示哪张皮」。

### 3. 骨架（Armature）——完整角色容器

**Armature** 是运行时核心对象：包含一棵 Bone 树、若干 Slot、一个 **Animation** 播放器。官方文档写得很直白：*Armature is the core of the skeleton animation system.* 你在舞台上看到的「一个会动的角色」，通常就是一个 Armature 实例（在 Pixi 里常叫 `armatureDisplay`）。

### 4. 工厂（Factory）——解析与实例化

**BaseFactory / PixiFactory / CocosFactory** 负责：

1. `parseDragonBonesData` — 读入 `*_ske.json`（骨骼与动画数据）
2. `parseTextureAtlasData` — 读入 `*_tex.json` + 图集 PNG
3. `buildArmatureDisplay` — 按 armature 名称创建可显示实例

数据解析后会**缓存在 Factory** 里，同一套资源不必重复 parse。类比：Factory 是「木偶图纸档案室」，build 是从档案里按名字取出一套木偶。

### 5. 动画数据与 AnimationState

- **DragonBonesData**：一份文件可含多个 Armature、多套 Animation
- **Animation**：播放器，提供 `play(name, playTimes)`、`fadeIn`、`stop` 等
- **AnimationState**：某次播放的状态（当前时间、是否循环、混合权重）

`playTimes`：`-1` 表示用编辑器里配置的循环次数，`0` 表示无限循环（Cocos Creator 文档与 JS Runtime 行为一致）。

### 6. WorldClock — 统一推进时间

所有实现 `IAnimatable` 的对象（Armature、WorldClock 子节点）可挂到 **WorldClock**，由它统一 `advanceTime(delta)`。多角色同屏时，一个时钟推进比每个 Armature 自己算时间更稳。Pixi 集成里常在 ticker 里调 `dragonBones.PixiFactory.advanceTime(delta)`。

### 7. 导出资源长什么样

典型导出（JSON 管线）：

```
hero_ske.json    # 骨骼层级、动画时间轴、事件帧
hero_tex.json    # 图集子图坐标
hero_tex.png     # 合图
```

编辑器还可导出 Egret MovieClip 等格式；现代 Web 项目以 **JSON + 单张/多张纹理** 为主。

## 最小可运行示例（PixiJS + TypeScript）

下列模式与 [DragonBonesJS Pixi 分支](https://github.com/DragonBones/DragonBonesJS/tree/master/Pixi) 及社区包 [pixi-dragonbones-runtime](https://github.com/h1ve2/pixi-dragonbones-runtime) 一致：先 parse，再 build，再 play。

```ts
import * as PIXI from 'pixi.js';
import { PixiFactory } from 'pixi-dragonbones-runtime';

const app = new PIXI.Application({ width: 800, height: 600 });
document.body.appendChild(app.view as HTMLCanvasElement);

// 假设资源已由 Loader / AssetPack 加载为 JSON 对象或别名
const factory = PixiFactory.factory;

factory.parseDragonBonesData('hero_ske.json');
factory.parseTextureAtlasData('hero_tex.json', 'hero_tex.png');

// 第二个参数是 armature 名称，与编辑器里一致
const armatureDisplay = factory.buildArmatureDisplay('Hero');

armatureDisplay.animation.play('run', 0); // 0 = 无限循环
armatureDisplay.x = 400;
armatureDisplay.y = 500;

app.stage.addChild(armatureDisplay);

// 每帧推进骨骼时间（也可在 app.ticker 里调用）
app.ticker.add((delta) => {
  PixiFactory.advanceTime(delta / 60);
});
```

要点：

- **parse 只做一次**，多个角色可共用一个 Factory 缓存
- `buildArmatureDisplay` 返回的是引擎 Display 对象，能直接 `addChild`
- 别忘了 **advanceTime**，否则动画不会帧进

## 示例二：事件监听与运行时改骨（换装思路）

游戏逻辑常要在动画**播完切状态**、或在**攻击帧**生成子弹。DragonBones 通过事件派发（与引擎桥接后可能是 DOM / Cocos 事件）：

```ts
import { PixiFactory } from 'pixi-dragonbones-runtime';

const factory = PixiFactory.factory;
factory.parseDragonBonesData(skeData);
factory.parseTextureAtlasData(texData, texImage);

const display = factory.buildArmatureDisplay('Knight');
display.animation.play('attack', 1); // 播一次

// 事件名与 DragonBones 常量一致（具体以你所用 Runtime 导出为准）
display.addDBEventListener('complete', () => {
  display.animation.play('idle', 0);
});

display.addDBEventListener('frameEvent', (event) => {
  if (event.name === 'hit') {
    spawnDamageCollider();
  }
});

// 运行时换武器：换 Slot 上的显示对象，而不是重做动画
const armature = display.armature;
const slot = armature.getSlot('weapon');
if (slot) {
  const newDisplay = factory.getTextureDisplay('sword_fire');
  slot.setDisplay(newDisplay);
}
```

这里体现骨骼动画的两项工程优势：

1. **动画与逻辑解耦** — `frameEvent` 在编辑器时间轴上打点，程序只响应名字
2. **换装不换骨** — 同一套 `attack` 动画，换 Slot 贴图即可换武器外观

## C++ / Cocos2d-x 侧在做什么

你指定的来源仓 [DragonBonesCPP](https://github.com/DragonBones/DragonBonesCPP) 把**同一套 DragonBones 公共库**接到 Cocos2d-x、SFML。流程与 JS 相同，只是 Factory 和 Display 换成 C++ 引擎节点。概念映射不变：

| 概念 | JS (Pixi) | C++ (Cocos2d-x 集成) |
|------|-----------|----------------------|
| 工厂 | `PixiFactory.factory` | `dragonBones::CCFactory` 等 |
| 显示对象 | `buildArmatureDisplay` | `CCArmatureDisplayNode` / 封装节点 |
| 播动画 | `animation.play(name, times)` | `getAnimation()->play(...)` / `gotoAndPlay` |

Cocos Creator 里则提供 **ArmatureDisplay** 组件：在属性检查器绑定 `DragonBonesAsset`，脚本里 `armatureDisplay.playAnimation('run', -1)`，并监听 `dragonBones.EventObject.COMPLETE` 等事件——本质仍是 Armature + Animation，只是编辑器帮你挂了资源引用。

## 创作端工作流（零基础路线）

1. **安装 LoongBones / DragonBones Pro**，导入 PSD 分层或单图
2. 为部件 **绑定骨骼**，在时间轴上打关键帧（走路、待机、攻击）
3. 需要时在时间轴加 **帧事件**（如 `footstep`、`hit`）
4. **导出** JSON + 纹理图集，把三件套放进游戏 `assets/`
5. 在目标引擎按 Runtime 文档 **parse → build → play → advanceTime**
6. 用预览检查与游戏里是否一致（锚点、缩放、像素比）

官方在线 Demo 合集：[DragonBones/Demos](https://github.com/DragonBones/Demos)。

## 与 Spine、逐帧动画怎么选

| 维度 | DragonBones | Spine | 逐帧精灵表 |
|------|-------------|-------|------------|
| 开源协议 | MIT Runtime | 编辑器收费、Runtime 需授权 | 无绑定 |
| 国内资料 / Egret·Cocos 集成 | 强 | 中等 | 通用 |
| 网格变形、IK | 支持 | 支持 | 不支持 |
| 学习曲线 | 编辑器 + Runtime 两套 | 类似 | 最低 |
| 适合 | 2D 手游角色、H5 小游戏 | 同上，国际项目多 | 特效、简单 NPC |

若项目已用 **Phaser 3.12+**，可用 [DragonBonesJS/Phaser](https://github.com/DragonBones/DragonBonesJS/tree/master/Phaser) 适配层；注意社区 README 曾标注 mesh、包围盒等能力与 Phaser 版本相关，接入前先看对应分支说明。

## 常见问题

**动画不播放，画面停在第一帧**  
多半是没调 `advanceTime`，或 `play` 的动画名与 JSON 里不一致（区分大小写）。

**parse 多次导致内存涨**  
同一 `ske` / `tex` 应只 parse 一次；换角色用多次 `buildArmatureDisplay`。

**角色模糊或抖动**  
检查图集是否开启多余缩放；PIXI 里注意 `resolution` 与纹理过滤；骨骼锚点是否在编辑器里对齐。

**和 Spine 资源能否互导**  
编辑器曾支持部分导入 Spine/Cocos 数据，但生产环境建议**选定一条管线**，不要混用运行时。

**DragonBones Pro 与开源 Runtime 关系**  
编辑器负责产出；Runtime 负责播放。Runtime MIT 开源，可商用；编辑器产品以官网许可为准。

## 延伸学习

- C++ Runtime：[DragonBones/DragonBonesCPP](https://github.com/DragonBones/DragonBonesCPP)
- JS/TS Runtime：[DragonBones/DragonBonesJS](https://github.com/DragonBones/DragonBonesJS)
- 官网与 LoongBones：[loongbones.app](http://www.loongbones.app/)
- Pixi 现代集成：[pixi-dragonbones-runtime 文档](https://h1ve2.github.io/pixi-dragonbones-runtime/guide/)
- 性能向 Demo：[dragonbones.github.io/demo](https://dragonbones.github.io/demo/)

## 小结

DragonBones 把 2D 角色动画从「逐帧画图」变成「骨骼驱动贴图」：美术在 LoongBones 里绑骨、打时间轴；程序用 **Factory 解析 JSON 与图集**，用 **Armature** 显示角色，用 **Animation.play** 切换动作，用 **Slot / Bone API** 做换装与物理挂点。作为**国产开源**骨骼方案，它与 Cocos、Egret、Pixi 等生态结合紧密；理解 Bone、Slot、Armature、Factory 四条概念，就能在任意语言 Runtime 里举一反三。
