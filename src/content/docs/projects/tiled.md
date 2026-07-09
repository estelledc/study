---
title: Tiled Map Editor — 通用 2D 关卡编辑
来源: 'https://github.com/mapeditor/tiled'
日期: 2026-07-09
分类: graphics
难度: 初级
---

## 是什么

Tiled Map Editor 是一个**给 2D 游戏画地图、标机关、再导出给程序读取**的通用关卡编辑器。

日常类比：做密室逃脱时，设计师会先画一张平面图，标出墙、门、钥匙、出生点和陷阱；Tiled 就像这张平面图的电子版本，而且它能把图纸保存成机器能读的清单。

它解决的问题不是“怎么把像素画漂亮”，而是“地图内容怎么标准化交给游戏引擎”。地面用 Tile Layer，出生点和碰撞盒用 Object Layer，多个层可以用 Group 组织，额外规则放进 Custom Properties。

它的核心价值是：Tile/Object/Group 标准化 2D 地图格式，几乎所有 2D 引擎都能读；GitHub 上约 ~11k stars，说明它已经是很多 2D 工作流里的默认公共语言。

## 为什么重要

不理解 Tiled，下面这些事都很难解释：

- 为什么美术画完地图后，程序不该再手写几百个坐标
- 为什么 Phaser、Godot、Unity、LÖVE、libGDX 都有 Tiled 相关导入方案
- 为什么同一张地图可以同时包含地砖、物件、碰撞区、剧情触发点和自定义属性
- 为什么“地图文件能打开”不等于“游戏里能正确渲染”——编辑器只负责数据，运行时还要解释数据

## 核心要点

1. **Tile Layer 是格子账本**：类比便利店货架，每个格子只记“这里放第几号商品”。Tiled 的地砖层用 GID 记录 tile 编号，渲染器再去 tileset 图片里切出真正像素。

2. **Object Layer 是便签纸**：类比在地图上贴“这里出生”“这里会扣血”“这扇门连到哪个开关”。对象可以是点、矩形、多边形、折线、文字或 tile object，并且每个对象都能带自定义属性。

3. **格式是契约，不是引擎**：类比菜单只写菜名和价格，不负责做菜。Tiled 输出 TMX、JSON、Lua、CSV 等格式，真正的碰撞、寻路、相机、动画播放，要由你的游戏代码或引擎插件实现。

差异点也在这里：普通绘图工具只产图片，很多引擎内置编辑器绑定自己的运行时；Tiled 更像中立地图格式，适合想在多个 2D 技术栈之间保持资产可迁移的人。

## 实践案例

### 案例 1：把可视化地图导出成 JSON 资产

一个常见流程是：在 Tiled 里画 `maps/level1.tmx`，构建时导出 `dist/level1.json`，游戏只读取导出的 JSON。

```bash
mkdir -p maps dist
tiled --export-map maps/level1.tmx dist/level1.json
```

**逐部分解释**：

- `maps/level1.tmx` 是编辑器源文件，适合继续打开修改
- `dist/level1.json` 是运行时资产，适合交给网页、移动端或自研引擎读取
- `--export-map` 让导出进入脚本流程，避免每次发布前靠人手点菜单

如果在 Linux CI 上无界面运行，官方文档提醒 Tiled 仍需要图形环境，可以包一层：

```bash
xvfb-run tiled --export-map maps/level1.tmx dist/level1.json
```

这就是第一种真实使用姿势：**关卡编辑器在本地，导出命令在构建流水线**。

### 案例 2：用对象层表达玩法信息

假设你在 Tiled 里建一个 Object Layer，叫 `logic`，里面放出生点、碰撞盒和宝箱。

```json
{
  "name": "logic",
  "type": "objectgroup",
  "objects": [
    { "name": "spawn", "type": "player", "x": 64, "y": 96 },
    { "name": "wall", "type": "collision", "x": 0, "y": 128, "width": 320, "height": 32 },
    { "name": "chest", "type": "item", "x": 192, "y": 96,
      "properties": [{ "name": "loot", "type": "string", "value": "key" }] }
  ]
}
```

**逐部分解释**：

- `objectgroup` 表示这一层不是地砖，而是一组带坐标的玩法对象
- `spawn` 是点位，程序可以把玩家初始位置放到这里
- `collision` 是矩形区域，程序可以把它转成物理世界里的墙
- `properties` 是自定义字段，`loot=key` 让宝箱不再靠代码硬编码内容

调试时可以直接筛对象层：

```bash
jq '.layers[] | select(.type=="objectgroup") | .objects[] | {name,type,x,y}' dist/level1.json
```

这就是第二种真实使用姿势：**让地图文件承载玩法标注，而不是把坐标散落在源码里**。

### 案例 3：在 Phaser 里加载 Tiled 地图

Web 2D 游戏常用 Phaser 读取 Tiled 导出的 JSON，再绑定 tileset 图片。

```bash
npm install phaser
```

```ts
import Phaser from "phaser";

export class LevelScene extends Phaser.Scene {
  preload() {
    this.load.tilemapTiledJSON("level1", "/assets/level1.json");
    this.load.image("dungeon", "/assets/dungeon.png");
  }

  create() {
    const map = this.make.tilemap({ key: "level1" });
    const tiles = map.addTilesetImage("dungeon", "dungeon");
    map.createLayer("ground", tiles!, 0, 0);

    const spawn = map.findObject("logic", o => o.name === "spawn");
    this.add.circle(spawn!.x!, spawn!.y!, 6, 0xff0000);
  }
}
```

**逐部分解释**：

- `tilemapTiledJSON` 读取 Tiled 导出的地图结构
- `addTilesetImage` 把地图里的 tileset 名称和真实图片绑定
- `createLayer("ground")` 只渲染名为 `ground` 的 tile layer
- `findObject("logic")` 从对象层拿出生点，说明对象层能直接参与玩法逻辑

这就是第三种真实使用姿势：**让引擎渲染地砖，让游戏代码消费对象层**。

## 踩过的坑

1. **GID 不是图片下标**：Tiled 的全局 tile ID 会叠加 tileset 起始值和翻转标记，直接拿它当数组下标会错位。

2. **对象坐标和地砖坐标不是同一种单位**：Tile Layer 通常按格子存，Object Layer 通常按像素存，混用时要明确是否乘以 `tilewidth` / `tileheight`。

3. **无限地图会变成 chunks**：开启 Infinite Map 后，tile 数据不再是一整块二维数组，读取器必须按 chunk 合并。

4. **编辑器保存成功不代表引擎支持所有特性**：比如 group layer、custom class、zstd 压缩、对象引用，很多运行时插件只支持其中一部分。

## 适用 vs 不适用场景

**适用**：

- 2D RPG、平台跳跃、俯视角冒险、解谜游戏，需要大量手工关卡
- 关卡里既有地砖，又有出生点、碰撞区、触发器、NPC、宝箱等玩法对象
- 团队想让美术或策划直接编辑地图，而不是让程序反复改坐标
- 自研引擎想复用成熟地图格式，不想从零设计关卡编辑器

**不适用**：

- 地图完全程序生成，运行时不需要人工编辑器
- 游戏是纯 3D 场景，关卡核心是 mesh、光照、导航网格和材质系统
- 项目强依赖某个引擎内置场景系统，并且不会迁移到其他 2D 栈
- 只需要一张背景图，没有碰撞、触发器和多层地图语义

## 历史小故事（可跳过）

- **2000 年代**：2D 独立游戏常见痛点是“地图能画，但格式各写各的”，Tiled 把重点放在通用 tile map 上。
- **2010 年代**：TMX 和 JSON 逐渐被各种语言库、游戏框架和引擎插件支持，Tiled 从工具变成生态接口。
- **Tiled 1.4 起**：Project 概念让资源目录、命令、属性类型更容易一起管理，适合稍大的游戏项目。
- **Tiled 1.9 起**：Class 属性变成更通用的数据建模方式，地图、层、对象、tileset 都能更一致地挂业务字段。
- **今天**：它仍然保持“编辑器中立、格式开放”的路线，靠导出器和插件接入不同引擎。

## 学到什么

- 2D 地图不是一张图，而是一组可解释的数据层：tile、object、image、group 各有职责
- Tiled 的强项是把关卡内容标准化，弱项是它不会替你实现运行时逻辑
- 自定义属性是从“画地图”走向“做关卡数据”的关键一步
- 选 Tiled 前要先确认目标引擎支持哪些格式和特性，避免编辑器里做得出来、游戏里读不出来

## 延伸阅读

- 官方仓库：[mapeditor/tiled](https://github.com/mapeditor/tiled)
- 官方入门：[Introduction](https://doc.mapeditor.org/en/stable/manual/introduction/)
- JSON 格式参考：[JSON Map Format](https://doc.mapeditor.org/en/stable/reference/json-map-format/)
- 自定义属性：[Custom Properties](https://doc.mapeditor.org/en/stable/manual/custom-properties/)
- 引擎支持列表：[Libraries and Frameworks](https://doc.mapeditor.org/en/stable/reference/support-for-tmx-maps/)
- [[phaser]] —— Web 2D 游戏里常见的 Tiled JSON 消费方

## 关联

- [[phaser]] —— Phaser 可以直接加载 Tiled JSON，把 tile layer 渲染到 Web Canvas / WebGL
- [[godot]] —— Godot 4 有 Tiled 导出和导入路线，适合比较编辑器内置 TileMap 与外部 Tiled 工作流
- [[unity]] —— Unity 可借助导入器消费 TMX，用来理解通用地图格式如何进入商业引擎
- [[pixi]] —— Pixi 只管渲染，Tiled 负责地图数据，两者组合能做轻量 Web 2D 场景
- [[bevy]] —— Bevy 插件生态里有 Tiled 支持，体现 ECS 世界如何消费关卡数据
- [[love2d]] —— LÖVE 常配合 Lua Tiled loader，适合学习简单 2D 运行时如何读地图
- [[cocos2d-x]] —— Cocos 系列长期支持 TMX，是 Tiled 格式被引擎吸收的典型例子

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
