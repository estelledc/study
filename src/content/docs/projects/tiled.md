---
title: Tiled Map Editor — 通用 2D 关卡编辑
来源: 'https://github.com/mapeditor/tiled'
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
难度: 初级
---

## 日常类比：Tiled 是「游戏关卡的 Photoshop + 建筑蓝图」

你玩平台跳跃或 RPG 时，草地、砖块、水面、宝箱、出生点，看起来是程序员一行行写出来的——实际上多半是**美术或关卡设计师在格子上「刷」出来的**。Tiled 就是那间专门刷关卡的工坊。

日常类比可以这样理解：

- **瓦片（Tile）** → 乐高底板上的单块砖，32×32 或 16×16 一格，重复拼出大地图  
- **图块集（Tileset）** → 一整张「砖块色卡」PNG，切成很多小格，供你选用  
- **图层（Layer）** → 透明胶片叠在一起：底层铺地形，中层放装饰，上层放碰撞或前景  
- **对象层（Object Layer）** → 贴在蓝图上的便利贴：「玩家从这里出生」「这道门通向 B 关」「这块区域触发对话」——不必对齐格子，可旋转、缩放  
- **TMX 文件** → 导出的「关卡说明书」，游戏引擎读它就知道画什么、放什么

Tiled 由 Thorbjørn Lindeijer 从 2008 年起维护，[mapeditor/tiled](https://github.com/mapeditor/tiled) 在 GitHub 上开源（GPL/商业双许可），被 Phaser、Godot、Unity、LÖVE、Flame、libGDX 等大量引擎直接支持。它的价值不在「再发明一个地图格式」，而在于：**把关卡制作从程序员手里还给设计师**，并且用开放、可扩展的 TMX/TSX 格式把数据和引擎解耦。

| 维度 | 说明 |
|---|---|
| 官网 / 文档 | [mapeditor.org](https://www.mapeditor.org/) · [doc.mapeditor.org](https://doc.mapeditor.org/) |
| 协议 | GPL v2（编辑器）；地图数据 TMX 无版权限制 |
| 平台 | Windows、macOS、Linux |
| 输出 | `.tmx`（地图）、`.tsx`（图块集）、JSON 导出、各引擎插件 |
| 典型用户 | 独立开发者、2D 手游、Roguelike、塔防、教育类小游戏 |

---

## 解决什么问题

手写二维数组 `level[y][x] = 3` 在 10×10 演示里还行；一旦地图变成 200×100、要分前景/背景/碰撞、还要标出生点和机关，**改一个草地方块就要在代码里找坐标**——既慢又容易和美术不同步。

Tiled 解决的是 **2D 关卡内容生产流水线**：

1. **可视化编辑**：笔刷、填充、地形笔刷（Terrain Brush）、图章（Stamp）批量铺砖  
2. **分层组织**：地形、装饰、碰撞、对象分图层，渲染顺序即图层顺序  
3. **语义标注**：瓦片、图层、对象都可挂自定义属性（`collides: true`、`hp: 50`）  
4. **引擎无关**：导出 TMX/JSON，运行时由 Phaser、Godot 等加载，关卡迭代不必重新编译游戏

一句话：**Tiled 画地图，引擎跑逻辑**——和用 Figma 画界面、用 React 写交互是同一分工。

---

## 核心概念

### 1. 地图（Map）与方向（Orientation）

一张地图有尺寸（宽×高，单位是**格数**）、瓦片大小（如 32×32 像素）、以及**投影方向**：

| 方向 | 典型游戏 |
|---|---|
| Orthogonal（正交） | 大多数平台跳跃、RPG、塔防 |
| Isometric（等距） | 模拟经营、部分 RPG |
| Hexagonal（六边形） | 战棋、文明类 |
| Staggered Isometric / Hex | 交错排列的等距或六边形 |

新建地图时可选「无限地图」（Infinite），适合大型开放世界式横向卷轴；小关卡用固定尺寸即可。这些选项之后都可改，第一次不必纠结完美。

### 2. 图块集（Tileset）与全局 ID（GID）

图块集可以是一张**大图**（image collection）或多张**散图**。每个瓦片在图块集中有本地 ID；在整张地图里则使用**全局 ID（GID）**。

重要约定（TMX 格式）：

- **GID = 0** 表示「这一格没有瓦片」  
- 多个图块集时，第二个图块集的 ID 接在第一个后面（例如两套各 8 块：1–8 与 9–16）  
- GID 高位可能编码翻转标志（水平/垂直/对角翻转），引擎加载时会解码

建议：**图块集存成独立 `.tsx` 文件**，不要嵌进每张地图——碰撞形状、地形规则、动画帧可在图块集里维护一次，所有地图共享。

### 3. 图层类型

Tiled 支持四类图层（可嵌套在 Group Layer 里当文件夹用）：

| 类型 | 作用 |
|---|---|
| **Tile Layer** | 二维瓦片阵列，适合大面积重复地形 |
| **Object Layer** | 矩形、椭圆、点、折线、多边形、瓦片对象；可脱离网格放置 |
| **Image Layer** | 单张前景/背景图，功能较简单 |
| **Group Layer** | 组织图层树，可整体偏移、调透明度 |

对象层里的 **Class**（旧版 UI 叫 Type）可定义类型名和显示颜色；**对象引用属性**（`type: object`）能在编辑器里画箭头连接「开关 → 门」，方便关卡逻辑编排。

### 4. 属性（Properties）与碰撞

几乎所有元素都能挂 **key/value 属性**，类型包括 string、int、float、bool、color、file、object 等。常见用法：

- 在瓦片上设 `collides: true`，运行时按属性生成碰撞体  
- 在对象上设 `script: open_chest.lua`  
- 在地图级设 `music: forest_theme.ogg`

**Tile Collision Editor** 可为单个瓦片绘制碰撞多边形，比「用一整格矩形」更精细（例如斜坡、半格平台）。

### 5. 地形笔刷（Terrain）与动画

**Terrain Brush**（由早期 Wang 瓦片演化而来）让相邻草地/泥土/水面自动选过渡块，大幅减少手动画边界。  
**Tile Animation** 可在图块集里为帧序列设帧时长，Tiled 预览循环播放；引擎需自行实现动画 tick。

### 6. 导出与引擎集成

- 原生 **TMX / TSX**（XML）可读性高，适合自研解析或 CI  
- **File → Export As** 可出 JSON，Phaser 等直接 `load.tilemapTiledJSON`  
- Godot 4：`TileMapLayer` 可直接导入 `.tmx`  
- 插件系统支持 JavaScript 扩展导出格式（如 GameMaker `.yy`）

---

## 代码示例

### 示例 1：Phaser 3 加载 Tiled 导出的 JSON 地图

在 Tiled 中画好地图后，用 **File → Export As → JSON** 得到 `level1.json`，并保证图块集 PNG 路径正确。Phaser 侧：

```js
import Phaser from 'phaser';

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  physics: { default: 'arcade', arcade: { gravity: { y: 400 } } },
  scene: { preload, create },
};

new Phaser.Game(config);

function preload() {
  this.load.image('tiles', 'assets/tilesets/platformer.png');
  this.load.tilemapTiledJSON('map', 'assets/maps/level1.json');
  this.load.spritesheet('player', 'assets/player.png', {
    frameWidth: 32,
    frameHeight: 32,
  });
}

function create() {
  const map = this.make.tilemap({ key: 'map' });
  const tileset = map.addTilesetImage('platformer', 'tiles');
  const groundLayer = map.createLayer('Ground', tileset, 0, 0);
  const decorLayer = map.createLayer('Decor', tileset, 0, 0);

  // 在 Tiled 里给瓦片加了自定义属性 collides=true 的，批量开启碰撞
  groundLayer.setCollisionByProperty({ collides: true });

  this.player = this.physics.add.sprite(64, 64, 'player');
  this.physics.add.collider(this.player, groundLayer);

  // 读取对象层里的出生点（Tiled 里对象名 spawn）
  const spawn = map.findObject('Objects', (obj) => obj.name === 'spawn');
  if (spawn) {
    this.player.setPosition(spawn.x, spawn.y);
  }

  decorLayer.setDepth(1);
  this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
  this.cameras.main.startFollow(this.player);
}
```

要点：`createLayer` 的图层名必须与 Tiled 里 **完全一致**；`setCollisionByProperty` 依赖你在图块或瓦片上预先设好的属性，而不是在代码里硬编码瓦片编号。

### 示例 2：用 Python 解析 TMX 提取碰撞格（无引擎依赖）

适合自研引擎、工具链或服务器校验关卡。TMX 是 XML，可用标准库读取：

```python
#!/usr/bin/env python3
"""从 TMX 提取带 collides 属性的瓦片坐标，输出为简单 JSON。"""

import json
import xml.etree.ElementTree as ET
from pathlib import Path

def parse_tmx_collision(tmx_path: str) -> list[dict]:
    root = ET.parse(tmx_path).getroot()
    tile_collides: dict[int, bool] = {}

    # 1. 读图块集里「按瓦片 ID」定义的属性
    for ts in root.findall('tileset'):
        first_gid = int(ts.get('firstgid', 1))
        for tile in ts.findall('tile'):
            local_id = int(tile.get('id'))
            gid = first_gid + local_id
            for prop in tile.findall("properties/property"):
                if prop.get('name') == 'collides' and prop.get('value') == 'true':
                    tile_collides[gid] = True

    solids: list[dict] = []
    # 2. 遍历每个瓦片层
    for layer in root.findall('layer'):
        name = layer.get('name', 'layer')
        data = layer.find('data')
        if data is None or data.get('encoding') != 'csv':
            continue
        width = int(layer.get('width'))
        gids = [int(x) for x in data.text.split(',') if x.strip()]
        for index, gid in enumerate(gids):
            if gid == 0:
                continue
            # 去掉 Tiled 翻转标志位（高三位）
            real_gid = gid & 0x1FFFFFFF
            if tile_collides.get(real_gid):
                x = index % width
                y = index // width
                solids.append({'layer': name, 'x': x, 'y': y, 'gid': real_gid})
    return solids

if __name__ == '__main__':
    path = Path('assets/maps/level1.tmx')
    result = parse_tmx_collision(path)
    print(json.dumps(result, indent=2))
    print(f'# {len(result)} solid cells')
```

这段脚本体现了 TMX 的核心思路：**渲染数据（GID 网格）与游戏语义（属性）写在同一文件**，工具链可以只提取自己需要的部分。

---

## 推荐工作流（零基础第一次上手）

1. **安装**：[mapeditor.org](https://www.mapeditor.org/) 下载对应平台安装包，或通过包管理器（如 `brew install --cask tiled`）。  
2. **建工程**：File → New → New Project，把 `maps/`、`tilesets/` 加进 Project 视图。  
3. **建图块集**：New Tileset → 选 PNG → 设 Tile size（与美术切图一致）→ 保存为 `.tsx`。  
4. **建地图**：New Map → Orthogonal → 32×32 → 保存 `level1.tmx`。  
5. **画关卡**：用 Stamp Brush（`B`）从图块集选块涂抹；`R` 矩形选区复制图章；对象层（`O`）放出生点、敌人区域。  
6. **标属性**：选中瓦片或对象 → 属性面板添加 `collides`、`type` 等。  
7. **导出 / 联调**：按目标引擎选 TMX 或 JSON，在游戏里加载验证碰撞与图层深度。

快捷键备忘：`Ctrl+Z` 撤销、`B` 笔刷、`E` 橡皮、`F` 填充、`T` 对象层插入瓦片对象、`Ctrl+S` 保存。

---

## 与常见引擎的对应关系

| 引擎 / 框架 | 加载方式 |
|---|---|
| **Godot 4** | 导入 `.tmx` 为 TileMapLayer；对象层 → 场景节点需插件或自解析 |
| **Phaser 3** | `load.tilemapTiledJSON` + `createLayer` |
| **LÖVE** | 社区库 `STI`（Simple Tiled Implementation）解析 TMX |
| **Flame** | `flame_tiled` 包的 `TiledComponent` |
| **Unity** | 官方或第三方 Tiled Importer（如 SuperTiled2Unity） |
| **libGDX** | `TmxMapLoader` |

引擎各不相同，但都吃同一套概念：**图层名、图块集名、GID、对象名、自定义属性**——在 Tiled 里命名规范比背 API 更重要。

---

## 常见坑与建议

1. **图块集路径**：移动 PNG 后 TMX 里相对路径断裂；用 Project 视图统一管理，提交 Git 时保持目录结构。  
2. **GID 与翻转位**：自己写解析器时记得 `gid & 0x1FFFFFFF`，否则碰撞格会错位。  
3. **嵌入 vs 外部图块集**：多地图共享同一套砖，务必用外部 `.tsx`；单张实验图可临时嵌入。  
4. **对象坐标**：对象层坐标是**像素**，瓦片层是**格**；混用时注意 `y` 轴与引擎是否一致（部分引擎原点在左上）。  
5. **Class 改名**：Tiled 1.9 起「Type」改叫「Class」，老教程看到 `type` 时对照文档即可。  
6. **大地图性能**：超大单层瓦片层在弱设备上绘制昂贵；可拆多个 Tile Layer 或按区块导出。

---

## 延伸学习

- 官方手册：[Introduction](https://doc.mapeditor.org/en/stable/manual/introduction/)、[Layers](https://doc.mapeditor.org/en/stable/manual/layers/)、[TMX Format](https://doc.mapeditor.org/en/stable/reference/tmx-map-format/)  
- 视频：[GamesFromScratch Tiled 系列](https://www.youtube.com/results?search_query=GamesFromScratch+Tiled)  
- 示例资源：安装目录 `examples/` 下的 `tmw_desert_spacing.png` 等  
- 与本仓库其他笔记：Phaser / Godot / Flame / LÖVE 条目中的 Tilemap 章节可与本文对照阅读

---

## 小结

Tiled 不是游戏引擎，而是**关卡数据的 IDE**：瓦片负责「长什么样」，图层负责「叠放顺序」，对象与属性负责「玩起来什么意思」。学会 Tiled，等于学会把关卡从代码里剥离成可版本管理、可协作编辑的资产文件——这是 2D 游戏开发里投入产出比最高的技能之一。
