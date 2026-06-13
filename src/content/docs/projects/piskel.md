---
title: Piskel — Web 像素艺术编辑器
来源: 'https://github.com/piskelapp/piskel'
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
难度: 初级
---

## 日常类比：Piskel 是「浏览器里的翻页动画本」

小时候在作业本角落画小人，一页一个姿势，快速翻动纸边让人物「跑起来」——Piskel 就是把这套玩法搬进浏览器：

- **画布（Canvas）** → 固定大小的方格纸（常见 16×16、32×32、64×64），每个格子是一粒可着色的像素
- **帧（Frame）** → 动画本里的每一页；底部时间轴可增删、复制、调顺序
- **图层（Layer）** → 盖在同一页上的透明胶片：底层画阴影，中层画身体，顶层画武器
- **洋葱皮（Onion Skin）** → 作画时半透明叠出前后几帧轮廓，像描摹前一页的铅笔印
- **调色板（Palette）** → 颜料盒里只放项目允许的几种颜色，复古 Game Boy 风常用 4 色

和 [[aseprite]] 这类桌面专业工具相比，Piskel 的定位是**零安装、打开即画**：访问 [piskelapp.com](https://www.piskelapp.com/) 或下载离线版，几分钟内就能导出 GIF 或精灵表给 [[phaser]]、[[godot]]、[[love2d]] 使用。源码在 [piskelapp/piskel](https://github.com/piskelapp/piskel)（Apache 2.0，约 12k stars），由 Google 工程师 Julian Descottes 发起，纯 JavaScript + HTML + CSS 构建。

| 维度 | 说明 |
|---|---|
| 在线版 | [piskelapp.com](https://www.piskelapp.com/) |
| 儿童版 | [Piskel For Kids](https://www.piskelapp.com/piskel-for-kids)（去社交、简化界面） |
| 原生工程格式 | `.piskel`（JSON + Base64 PNG 帧数据） |
| 典型导出 | 动画 GIF、单帧 PNG、ZIP 帧序列、横向/网格精灵表 PNG、C 数组 |
| 离线版 | Windows / macOS / Linux 桌面应用（见 [Wiki: Desktop applications](https://github.com/piskelapp/piskel/wiki/Desktop-applications)） |
| 嵌入 | [piskel-embed](https://github.com/piskelapp/piskel-embed) 演示 iframe 集成 |

---

## 解决什么问题

独立游戏、网页小游戏、教学场景里常需要**低分辨率角色动画**，但很多人不想先学 Photoshop 或购买 [[aseprite]]。Piskel 填补的缺口是：

1. **零门槛**：无需账号即可在浏览器作画（登录后可存云端画廊）
2. **动画优先**：帧时间轴、实时预览、可调 FPS（默认常 12 FPS）
3. **游戏向导出**：一张 PNG 精灵表 + 已知帧宽即可接入引擎
4. **开源可自托管**：可 fork 后内嵌到自己的教育平台或关卡编辑器

一句话：**Piskel 画像素动画，引擎读精灵表跑逻辑**——和 [[tiled]] 画关卡、[[aseprite]] 做重度时间轴是同一分工里的「轻量 Web 路线」。

---

## 核心概念

### 1. 像素网格与画布尺寸

Piskel 工作在**离散像素网格**上，不是矢量。创建项目时选定 `width × height`（如 32×32）；之后可用 **RESIZE** 扩展画布，但已有像素不会自动重采样——这是像素艺术的常态，改尺寸前要心里有数。

**缩放预览**（1× / 最佳倍数 / 全屏）只影响显示，不改变真实分辨率。导出给游戏时永远按原始像素尺寸计算。

### 2. 帧（Frame）与时间轴

时间轴在编辑器底部：每格是一帧，可设置播放延迟。预览区实时播放，边画边看「走路是否顺」。

常用操作：

| 操作 | 作用 |
|---|---|
| 复制帧 | 上一格姿势微调，适合走路循环 |
| 洋葱皮 | 显示前后帧 ghost，对齐脚落地 |
| FPS 滑块 | 全局播放速度；导出 GIF 时影响帧间隔 |

### 3. 图层（Layer）

多图层自下而上合成。每层有独立不透明度（0–1），可隐藏、重命名、合并。复杂角色可把「身体 / 头发 / 武器」拆开，换武器时只改顶层。

**Move 工具** 可勾选「应用到所有图层 / 所有帧」，批量平移整段动画——修对齐时很省事。

### 4. 绘图工具链

| 工具 | 快捷键 | 要点 |
|---|---|---|
| Pen | P | 单像素描边；配合 Mirror 画对称角色 |
| Eraser | E | 擦成透明 |
| Paint bucket | B | 同色填充；可限定当前层或全帧 |
| Rectangle / Circle | R / C | Shift 保持 1:1 比例 |
| Stroke | L | Shift 画直线 |
| Lighten / Darken | U | 快速明暗过渡，像素画阴影常用 |
| Dithering | T | 有序抖动，模拟更多「视觉色」 |
| Color picker | O | 从画布吸色 |
| 选区（矩形/套索/形状） | S / H / Z | 可跨层跨帧复制粘贴 |

### 5. 调色板（Palettes）

右侧 **Palettes** 面板管理项目色板；可从当前画面提取颜色，或导入预设（如 Game Boy 四色）。限制色数能强迫保持复古一致感，也方便后续在引擎里做**调色板换肤**（整图索引色替换）。

### 6. 导入与导出

**IMPORT** 支持：静态图、动画 GIF、已有 `.piskel` 工程。GIF 会拆成多帧导入时间轴。

**EXPORT** 主要模式：

| 模式 | 用途 |
|---|---|
| GIF | 社交分享、原型演示 |
| PNG（单帧 / 全动画合并） | 静态资源或预览 |
| ZIP（每帧一张 PNG） | 导入 Aseprite、批处理 |
| Spritesheet PNG | **游戏引擎最常用**：多帧横排或网格排列 |
| C 数组 | 嵌入式 / 单片机 demo |

精灵表导出时可设**每行帧数**、**间距（spacing）**、是否带**元数据 JSON**（部分版本/分支支持帧矩形信息）。

### 7. `.piskel` 文件格式

`.piskel` 本质是 JSON 文本，各层各帧以 **Base64 编码的 PNG** 嵌在 `layers` 数组里（每层又是一个 JSON 字符串）。结构示意：

```json
{
  "modelVersion": 1,
  "piskel": {
    "name": "hero_run",
    "description": "32x32 run cycle",
    "fps": 12,
    "width": 32,
    "height": 32,
    "layers": [
      "{\"name\":\"Layer 1\",\"opacity\":1,\"frameCount\":4,\"chunks\":[{\"layout\":[[0,1,2,3]],\"base64PNG\":\"data:image/png;base64,iVBORw0KGgo...\"}]}"
    ]
  }
}
```

`layers` 里每一项是**字符串化的 JSON**——解析时要 `JSON.parse` 两次。这种设计方便在浏览器里用 `FileReader` 直接读写，也方便版本迁移（`modelVersion` 字段）。

### 8. 技术栈与架构注记

- 渲染依赖 HTML5 **Canvas**；图层合成、导入导出历史上大量通过 Canvas API 完成
- 依赖库包括 [gif.js](https://jnordberg.github.io/gif.js/)（Web Worker 编 GIF）、[jszip](https://stuk.github.io/jszip/)（ZIP 导出）、[supergif](https://github.com/buzzfeed/libgif-js)（GIF 导入）等
- 2026 年起上游在推进 **Vite + TypeScript + ES modules** 现代化（见 [Issue #1246](https://github.com/piskelapp/piskel/issues/1246)），并讨论减少「以 Canvas 为数据源」以避免 Brave 等浏览器的 canvas 指纹扰动导致色差（[Issue #1245](https://github.com/piskelapp/piskel/issues/1245)）

### 9. 浏览器与平台限制

| 环境 | 支持情况 |
|---|---|
| Chrome / Firefox / Edge（最新桌面版） | 推荐 |
| Brave | 需关闭 canvas 指纹保护，否则颜色可能偏移 |
| 手机 / 平板 | **官方不支持**（UI 为桌面横屏设计） |
| 离线桌面版 | 支持，适合教室无网环境 |

---

## 代码示例

### 示例 1：用 Node 解析 `.piskel` 并列出帧信息

在 CI 或资源管线里，可先解析工程再决定如何烘精灵表：

```js
// parse-piskel.mjs — 读取 .piskel，打印每层每帧布局
import { readFileSync } from 'node:fs';

function loadPiskel(path) {
  const root = JSON.parse(readFileSync(path, 'utf8'));
  const meta = root.piskel;
  const layers = meta.layers.map((layerStr) => JSON.parse(layerStr));
  return { meta, layers };
}

const { meta, layers } = loadPiskel('./hero_run.piskel');
console.log(`${meta.name}: ${meta.width}x${meta.height} @ ${meta.fps} FPS`);
for (const layer of layers) {
  console.log(`  layer "${layer.name}" opacity=${layer.opacity} frames=${layer.frameCount}`);
  for (const chunk of layer.chunks) {
  // layout 是二维数组，标出 chunk 内帧索引
    console.log('    layout:', chunk.layout);
  }
}
```

输出可用于校验：帧数是否与游戏状态机一致、层名是否符合约定。

### 示例 2：在 Phaser 3 中加载 Piskel 导出的横向精灵表

在 Piskel 里 **EXPORT → PNG Spritesheet**，假设 4 帧跑步、每帧 32×32、横向一排：

```js
// main.js — Phaser 3 播放 Piskel 导出的精灵表
const config = {
  type: Phaser.AUTO,
  width: 320,
  height: 180,
  scene: { preload, create },
};

new Phaser.Game(config);

function preload() {
  // 128x32 = 4 帧 x 32px 宽
  this.load.spritesheet('hero-run', 'assets/hero_run_sheet.png', {
    frameWidth: 32,
    frameHeight: 32,
  });
}

function create() {
  this.anims.create({
    key: 'run',
    frames: this.anims.generateFrameNumbers('hero-run', { start: 0, end: 3 }),
    frameRate: 12, // 与 Piskel 里设置的 FPS 对齐
    repeat: -1,
  });
  this.add.sprite(160, 90, 'hero-run').play('run');
}
```

要点：**`frameWidth` / `frameHeight` 必须等于 Piskel 单帧尺寸**；`frameRate` 与导出前预览 FPS 一致，否则动画快慢会飘。

### 示例 3：iframe 嵌入自托管 Piskel（piskel-embed 思路）

若要在自己的关卡编辑器里内嵌像素画板，可自托管构建产物并用 iframe 通信。[piskel-embed](https://github.com/piskelapp/piskel-embed) 演示了加载/保存精灵的集成方式：

```html
<!-- editor.html — 父页面嵌入 Piskel -->
<iframe
  id="piskel-frame"
  src="https://your-cdn.example.com/piskel/index.html"
  width="100%"
  height="720"
  allow="clipboard-read; clipboard-write"
></iframe>
<script>
  const frame = document.getElementById('piskel-frame');

  // 子页面加载完成后，可通过 postMessage 触发「打开 .piskel」或「导出」
  // 具体消息格式取决于你 fork 的 Piskel 版本；上游以 UserEvent 服务桥接
  frame.addEventListener('load', () => {
    frame.contentWindow.postMessage(
      { type: 'piskel.load', name: 'level_tile.piskel' },
      'https://your-cdn.example.com'
    );
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== 'https://your-cdn.example.com') return;
    if (event.data.type === 'piskel.saved') {
      console.log('用户保存了精灵:', event.data.payload);
    }
  });
</script>
```

生产环境务必：**同源或白名单 postMessage**、HTTPS、明确 CSP。儿童产品可改用官方 **Piskel For Kids** 构建，减少画廊与社交干扰。

---

## 与 Aseprite / Tiled 的分工

| 工具 | 强项 | 弱项 |
|---|---|---|
| **Piskel** | 浏览器即开、GIF/精灵表导出快、教学友好 | 无 CLI 批处理、复杂标签/脚本弱于 Aseprite |
| **[[aseprite]]** | 时间轴标签、Lua 脚本、CLI 烘图、索引色工作流 | 需安装/购买（官方二进制） |
| **[[tiled]]** | 瓦片地图、碰撞层、对象层 | 不负责角色帧动画 |

典型流水线：**Piskel 画角色动画 → 导出精灵表 → Phaser/Godot 加载**；**Tiled 画关卡 → 引擎读 TMJ/TSX**。

---

## 上手路径（零基础）

1. 打开 [piskelapp.com](https://www.piskelapp.com/)，选 **Create Sprite**，画布设 **32×32**
2. 用 **Pen (P)** 画第一帧站立姿势；时间轴点 **Add new frame** 画走路第 2 帧
3. 开启 **Onion Skin (Alt+O)**，对齐脚的位置
4. 复制帧微调，做 4–6 帧循环；右侧调 **12 FPS** 预览
5. **EXPORT → PNG** 选 Spritesheet，记下每行帧数
6. 在 [[phaser]] 或 [[godot]] 教程里加载同尺寸 `frameWidth`/`hframes` 验证

进阶：多图层拆身体部件、**Dithering** 画渐变阴影、导入 GIF 改既有素材、下载桌面离线版在无网课堂使用。

---

## 常见问题

**Q：导出精灵表后游戏里动画闪烁或裁切？**  
A：检查导出 spacing 是否为 0；`frameWidth` 是否与 Piskel 画布宽一致；PNG 是否被后续工具误压缩（应用近邻缩放）。

**Q：Brave 里颜色变了？**  
A：关闭 Shields 的 fingerprinting，或换 Firefox/Chrome，参见 [Wiki: canvas fingerprinting](https://github.com/piskelapp/piskel/wiki/About-canvas%E2%80%90based-browser-fingerprinting-and-Brave-browser)。

**Q：能否命令行批处理？**  
A：官方无头 CLI；可自写脚本解析 `.piskel` 用 `sharp`/`canvas` 烘图，或导出 ZIP 帧后用 ImageMagick `montage` 拼表。

**Q：和 [[aseprite]] 工程互转？**  
A：经 **PNG 序列 ZIP** 中转最稳：Piskel 导出 ZIP → Aseprite 导入为精灵；反向亦然。直接 `.piskel` ↔ `.aseprite` 无官方一键工具。

---

## 延伸阅读

- 仓库 README 与 [Wiki](https://github.com/piskelapp/piskel/wiki)
- 文件格式说明：[Piskel canvas（ArchiveTeam）](http://fileformats.archiveteam.org/wiki/Piskel_canvas)
- 现代化路线图：[Piskel modernization #1246](https://github.com/piskelapp/piskel/issues/1246)
- 社区 MCP 封装（AI 驱动作画实验）：[piskel-mcp-server](https://github.com/yafeiaa/piskel-mcp-server)
- 相关笔记：[[aseprite]]、[[tiled]]、[[phaser]]、[[godot]]、[[love2d]]、[[gimp]]
