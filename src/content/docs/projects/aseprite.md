---
title: Aseprite — 像素艺术 / 动画编辑器
来源: 'https://github.com/aseprite/aseprite'
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
难度: 初级
---

## 日常类比：Aseprite 是「翻页动画本 + 透明胶片叠印台」

小时候在课本角落画小人，快速翻动纸边让小人「跑起来」——每一页是一个**瞬间姿势**，连起来就是动画。Aseprite 就是把这套玩法数字化、专业化：

- **画布（Sprite）** → 那本横格动画本，固定宽高（如 32×32、64×64）
- **帧（Frame）** → 动画本里的每一页，可单独设停留时间（0.1 秒 = 10 FPS 的一格）
- **图层（Layer）** → 盖在某一页上的透明胶片：底层画背景，中层画身体，顶层画武器/特效
- **单元格（Cel）** → 「某图层在某帧上实际画了什么」——没有 Cel 的格就是空白
- **洋葱皮（Onion Skin）** → 作画时半透明叠出前后几帧轮廓，像描摹前一页的铅笔印
- **标签（Tag）** → 在时间轴上给一段帧起名（`Walk`、`Attack`），一个文件里可装多套动作

和 [[gimp]] 修大图、[[krita]] 画插画不同，Aseprite 专攻**低分辨率、硬边像素、逐帧动画**——像素完美描边、索引色板、精灵表导出都是为独立游戏与复古美术量身定做。源码在 [aseprite/aseprite](https://github.com/aseprite/aseprite) 公开（约 36k stars），但官方二进制采用 EULA 许可；纯开源替代可看 [LibreSprite](https://github.com/LibreSprite/LibreSprite)。

| 维度 | 说明 |
|---|---|
| 官网 / 文档 | [aseprite.org](https://www.aseprite.org/) · [脚本 API](https://www.aseprite.org/api/) |
| 平台 | Windows、macOS、Linux（Steam / 官网购买） |
| 原生格式 | `.ase` / `.aseprite` |
| 典型导出 | PNG 序列、GIF、精灵表 PNG + JSON、CLI 批处理 |
| 脚本 | Lua（v1.2.10+），可写插件与自动化 |

---

## 解决什么问题

像素风游戏角色通常需要：**同一角色走路、跳跃、攻击多套动画**，且运行时只加载一张**纹理图集（sprite sheet）**以节省 Draw Call。手绘在 Photoshop 里也能做，但缺少：

1. **帧级时间轴**：每帧独立时长、循环区间、预览播放
2. **像素工具链**：Pixel Perfect 铅笔、Shading 墨水、RotSprite 旋转少糊边
3. **游戏向导出**：带帧矩形、时长、标签的 JSON 元数据
4. **批处理**：改完 `.aseprite` 后一条 CLI 重新烘出 `@2x` 图集

一句话：**Aseprite 画像素动画，引擎读图集跑逻辑**——和 [[tiled]] 画关卡、Godot/Phaser 跑碰撞是同一分工。

---

## 核心概念

### 1. Sprite（精灵文档）

一个 Sprite 有固定 `width × height`、一种**色彩模式**（RGBA / Indexed 最多 256 色 / Grayscale），以及若干帧与图层。`.aseprite` 是工程文件，保留图层、标签、切片（Slice）、调色板——类似 PSD，但面向动画。

### 2. Layer（图层）与 Layer Group

图层自下而上叠放；**组（Group）** 可嵌套，方便把「头发 / 身体 / 武器」打包。特殊类型：

| 类型 | 作用 |
|---|---|
| **普通图像层** | 每帧可有独立 Cel，支持透明 |
| **背景层** | 索引色模式下不可透明，通常铺底色 |
| **参考层（Reference）** | 导入参考图、rotoscoping，不参与导出 |
| **Tilemap 层** | 用瓦片块拼场景（与 [[tiled]] 思路相近，偏单图块动画） |

混合模式（Multiply、Screen 等）与不透明度（0–255）按层生效。

### 3. Frame、Cel 与 Duration

- **Frame**：时间轴上的一格，从 1 开始编号
- **Cel**：`Layer × Frame` 交点上的图像实例，可有偏移（position）
- **Duration**：该帧显示秒数；总动画时长 = 各帧 duration 之和

复制帧（`sprite:newFrame()`）会复制所有图层的 Cel，适合「只改手臂」式增量动画。

### 4. 色彩模式与调色板

| 模式 | 场景 |
|---|---|
| **RGBA** | 现代游戏、带半透明特效 |
| **Indexed** | 复古主机风、严格色数限制；调色板可整体替换做「皮肤变体」 |
| **Grayscale** | 灰度草图或法线贴图草稿 |

索引色导出精灵表时常配合 **ordered dithering** 从 RGB 量化，CLI 用 `--dithering-algorithm ordered` 控制。

### 5. Onion Skin 与预览

洋葱皮显示当前帧前后若干帧的半透明 ghost，可调红/蓝模式区分前帧与后帧。预览窗口支持 Forward / Reverse / Ping-pong 循环——做走路循环时 ping-pong 能立刻发现「脚是否落地对齐」。

### 6. Tags（帧标签）

在时间轴上选中连续帧 → 右键 **New Tag**，命名如 `idle`、`run`。导出时可 `--tag "run"` 只烘跑步段，或 `--split-tags` 按标签拆成多个 GIF。JSON 元数据里含 `frameTags: [{ name, from, to }]`，运行时按名播放状态机。

### 7. Slices（切片）

在图像上框选命名区域（如 `cursor`、`button_normal`），导出 UI 精灵或 `--slice` 裁切。适合同一文件里放多枚图标。

### 8. 精灵表（Sprite Sheet）

把多帧（或多图层、多文件）排进一张 PNG，配套 JSON 记录每帧 `frame: { x, y, w, h }`、`duration`、`sourceSize`。布局算法：`horizontal`、`packed`（省空白）、固定 `1024×1024` 等。游戏引擎（Godot AnimatedSprite2D、Phaser、Raylib 等）读 JSON 即可。

---

## 零基础上手流程

1. **新建**：File → New，设 32×32 或角色实际尺寸，选 RGBA 或 Indexed  
2. **画第一帧**：铅笔（`B`）开启 **Pixel-perfect**；调色板窗口管理色板  
3. **加帧**：时间轴 `Alt+N` 或点击 New Frame，洋葱皮对照前一帧改像素  
4. **分层**：身体一层、装备一层；隐藏层不参与默认导出  
5. **打标签**：选中走路所有帧 → Tag `walk`  
6. **导出**：File → Export Sprite Sheet，或 CLI 批处理（见下）  
7. **进引擎**：把 `sheet.png` + `sheet.json` 丢进 [[godot]] / [[phaser]] / [[raylib]] 动画组件

快捷键备忘：`Space` 播放预览、`Tab` 全屏画布、`Ctrl+Shift+E` 导出、`[` `]` 切帧。

---

## 代码示例

### 示例 1：Lua 脚本——批量生成行走循环并标帧时长

Aseprite 内置 **File → Scripts → Open Scripts Folder**，`.lua` 文件可 GUI 运行，也可 `aseprite -b --script walk.lua` 批处理。下面脚本新建 32×32 精灵、画 4 帧色块模拟走路、统一每帧 0.08 秒：

```lua
-- walk_cycle.lua：生成 4 帧占位行走循环
local sprite = Sprite(32, 32, ColorMode.RGB)
local colors = {
  Color{ r=80, g=160, b=255 },
  Color{ r=80, g=140, b=230 },
  Color{ r=80, g=160, b=255 },
  Color{ r=100, g=180, b=255 },
}

for i = 1, #colors do
  if i > 1 then
    sprite:newFrame()
  end
  app.activeFrame = sprite.frames[i]
  app.activeSprite = sprite
    -- 每帧画一个水平偏移的矩形，模拟重心左右移
  local offset = (i - 1) * 2
  app.useTool{
    tool = 'filled_rectangle',
    color = colors[i],
    brush = Brush(1),
    points = { Point(8 + offset, 12), Point(24 + offset, 28) }
  }
  sprite.frames[i].duration = 0.08
end

-- 给帧范围打 Tag，方便 CLI --tag 导出
app.command.NewTag{
  fromFrame = 1,
  toFrame = #sprite.frames,
  name = 'walk',
  aniDir = 'forward'
}

print(string.format('Created %d-frame walk cycle', #sprite.frames))
```

要点：`app.useTool` 模拟用户笔触；`sprite:newFrame()` 复制上一帧所有 Cel 再改；Tag 与引擎状态机名称对齐可减少手写 JSON。

### 示例 2：CLI 导出精灵表 + JSON（进游戏管线）

改完 `hero.aseprite` 后，在 CI 或本地 `Makefile` 里一条命令重新烘图集：

```bash
#!/usr/bin/env bash
# export-hero.sh — 从 Aseprite 工程导出 packed 精灵表
ASEPRITE="${ASEPRITE:-/Applications/Aseprite.app/Contents/MacOS/aseprite}"

"$ASEPRITE" -b \
  --ignore-empty \
  --trim \
  --sheet-pack \
  --sheet-type packed \
  --border-padding 1 \
  --shape-padding 1 \
  --extrude \
  --tag "walk" \
  --list-tags \
  --data "dist/hero-walk.json" \
  --format json-hash \
  --sheet "dist/hero-walk.png" \
  "assets/hero.aseprite"
```

`json-hash` 输出大致结构（引擎按 `frames` 字典加载）：

```json
{
  "frames": {
    "hero.aseprite 0": {
      "frame": { "x": 1, "y": 1, "w": 30, "h": 30 },
      "duration": 80,
      "sourceSize": { "w": 32, "h": 32 }
    }
  },
  "meta": {
    "frameTags": [{ "name": "walk", "from": 0, "to": 3 }],
    "size": { "w": 128, "h": 32 }
  }
}
```

`duration` 单位为毫秒；`--extrude` 在图集里复制边缘 1px，减轻线性过滤时的缝隙线（bleeding）。多分辨率可链式 `--scale 2` 再 `--save-as`。

### 示例 3（补充）：带对话框的用户脚本骨架

交互式工具用 `Dialog` 收集参数，适合团队内小插件：

```lua
local dlg = Dialog{ title = "批量改帧长" }
dlg:number{ id = "fps", label = "FPS", text = "12", decimals = 0 }
dlg:button{ id = "ok", text = "Apply" }
dlg:button{ id = "cancel", text = "Cancel" }
dlg:show()

if dlg.data.ok and app.activeSprite then
  local dur = 1.0 / dlg.data.fps
  for _, frame in ipairs(app.activeSprite.frames) do
    frame.duration = dur
  end
end
```

---

## 与游戏引擎的衔接

| 引擎 / 工具 | 典型用法 |
|---|---|
| **Godot 4** | 导入 PNG 序列或配合 JSON；AnimatedSprite2D / SpriteFrames |
| **Phaser 3** | `this.load.atlas('hero', 'sheet.png', 'sheet.json')` |
| **Unity** | 第三方 Aseprite 导入器，或 CLI 出图集后当 Texture2D |
| **LÖVE / [[love2d]]** | `anim8` 等库读精灵表网格或 JSON |
| **[[tiled]]** | 图块集 PNG 常在 Aseprite 里画好再导入 Tiled |
| **[[piskel]]** | 浏览器轻量替代；复杂时间轴与 CLI 仍以 Aseprite 为准 |

命名约定：图层名、Tag 名、导出文件名与代码里状态机枚举一致（如 `PLAYER_RUN` ↔ tag `run`），比死记帧号更易维护。

---

## 许可与生态说明

- **源码**：GitHub 可阅可编译，整体受 [EULA](https://github.com/aseprite/aseprite/blob/main/EULA.txt) 约束，并非整仓 MIT  
- **购买**：Steam 或官网；教育场景可申请教育许可  
- **社区**：[community.aseprite.org](https://community.aseprite.org/)、Discord、大量 Lua 插件（[aseprite-community](https://github.com/aseprite/aseprite-community)）  
- **纯 OSS 分叉**：LibreSprite 适合无法接受 EULA 的发行场景，功能略滞后

---

## 常见坑与建议

1. **忘记 Pixel-perfect**：斜线用普通铅笔会出脏像素；开启 Pixel Perfect 或用手动 Bresenham  
2. **索引色透明色**：Indexed 模式「透明」是调色板中的一个索引，导出 GIF 时与引擎约定一致  
3. **图集缝隙**：GPU 线性过滤时在图集加 `--extrude` 或引擎里用 Nearest  
4. **隐藏层被导出**：默认忽略隐藏层；需要时用 `--all-layers`  
5. **帧 0 vs 1**：脚本 API 帧号从 **1** 开始；JSON `from`/`to` 常为 **0** 起，对接时别混  
6. **大图分辨率**：角色源文件按逻辑像素画（如 32×32），缩放用 `--scale` 生成 `@2x`，勿在画布上直接画 128×128 再缩小  
7. **版本控制**：`.aseprite` 是二进制，Git 用 LFS 或只提交导出 PNG/JSON；合并冲突靠「一人改一角色」分工

---

## 延伸学习

- 官方：[Timeline 文档](https://www.aseprite.org/docs/timeline/)、[Sprite Sheet](https://www.aseprite.org/docs/sprite-sheet/)、[CLI](https://www.aseprite.org/docs/cli/)、[Scripting](https://www.aseprite.org/docs/scripting/)  
- API 仓库：[aseprite/api](https://github.com/aseprite/api)  
- 练习：8×8 或 16×16 单色行走循环 → 加一帧攻击 Tag → CLI 导出 → 在 [[phaser]] 或 Godot 里播放  
- 相关笔记：[[gimp]]（通用位图）、[[tiled]]（关卡）、[[piskel]]（Web 像素）、[[dragonbones]] / [[spine-runtimes]]（骨骼 2D 另一路线）

---

## 小结

Aseprite 把「翻页小人」升级为可版本管理、可脚本化、可进 CI 的像素动画生产工具：**图层管组合，帧管时间，Tag 管语义，CLI 管导出**。零基础先画清一个 4 帧循环并成功导出一张 `sheet.png` + JSON，比死记快捷键更能建立直觉；之后无论是独立游戏角色还是 UI 像素图标，都在同一套时间轴思维里扩展。
