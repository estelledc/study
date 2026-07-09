---
title: KiCad — 电子电路 CAD
来源: 'https://github.com/KiCad/kicad-source-mirror'
日期: 2026-07-09
分类: graphics
难度: 初级
---

## 是什么

KiCad 是一套**开源电子设计自动化工具**：从原理图、PCB 走线、制造文件到 3D 预览，都放在同一个项目里管理。

日常类比：它像一间电子硬件厨房。原理图是菜谱，PCB 是摆盘，Gerber / 钻孔文件是交给工厂的订单，3D 预览则是在下锅前先看成品会不会塞进外壳。

最小命令例子：

```bash
kicad-cli sch export pdf --output out/schematic.pdf demo.kicad_sch
```

这行命令把 KiCad 原理图导成 PDF。你平时可以在 GUI 里画图，也可以用 `kicad-cli` 把检查、导出和评审放进脚本或 CI。

KiCad 的官方定位是免费、跨平台、专业可用的 EDA 套件。它不是只画线的画图软件，而是让“电路逻辑”和“实际板子”互相校验的一整条流水线。

## 为什么重要

不理解 KiCad，下面这些事会很难解释：

- 为什么做硬件不能只把元件接起来，还要把符号、封装、走线、孔位和工厂文件全都对上
- 为什么开源硬件项目常强调“用开源工具打开”，因为闭源 EDA 许可证会挡住协作和复现
- 为什么一块 PCB 下单前要跑 ERC / DRC，不然错误可能等到板子寄回来才暴露
- 为什么 3D 预览不是花哨功能，而是提前发现连接器高度、外壳干涉和器件方向的低成本办法

## 核心要点

KiCad 的核心可以拆成三件事：

1. **项目把文件绑在一起**。类比：做一道菜不能只留照片，还要留菜谱、食材清单和采购单。`.kicad_pro` 会把原理图、PCB、库表和规则放进同一个上下文，单独打开某个文件容易丢设置。

2. **原理图和 PCB 双向约束**。类比：建筑图纸和施工现场要互相核对。原理图告诉 PCB 哪些引脚必须连接，PCB 的走线和封装又会反过来暴露“图上没说清”的工程问题。

3. **输出面向制造，而不是只面向屏幕**。类比：漂亮海报不能直接拿去开模。KiCad 最终要生成 Gerber、钻孔、装配位置、BOM、STEP 等文件，让制造、采购和结构设计都能接上。

这也是它和普通绘图工具的差异：KiCad 关心的是“这块板能不能被正确生产”，不只是“屏幕上看起来像电路”。

## 实践案例

### 案例 1：官方入门项目里检查原理图

真实场景：官方 Getting Started 教程让新手先建 `getting-started` 项目，画 LED、限流电阻和连接线。画完后不要急着进 PCB，先做电气规则检查和可读输出。

```bash
kicad-cli sch erc --output reports/erc.rpt getting-started.kicad_sch
kicad-cli sch export pdf --output out/schematic.pdf getting-started.kicad_sch
kicad-cli sch export bom --output out/bom.csv getting-started.kicad_sch
```

逐部分解释：

- `sch erc` 检查原理图层面的错误，比如电源脚没连、输出脚互相打架
- `sch export pdf` 把图纸导出来，方便 mentor、同事或未来的你快速审一遍
- `sch export bom` 生成物料清单，让“图上用了什么元件”变成可采购的数据

这个案例的重点不是命令本身，而是流程顺序：先把电路逻辑确认干净，再进入板子布局。

### 案例 2：把 PCB 交给工厂前自动打包

真实场景：教程后半段会从原理图同步到 PCB，放置封装、画板框、走线、铺铜，最后生成制造输出。这个阶段最怕“看起来画完了”，但工厂文件少层或 DRC 还有错误。

```bash
kicad-cli pcb drc --refill-zones --exit-code-violations \
  --format json --output reports/drc.json board.kicad_pcb
kicad-cli pcb export gerbers --output fab/gerbers board.kicad_pcb
kicad-cli pcb export drill --format excellon --output fab/drill board.kicad_pcb
```

逐部分解释：

- `pcb drc` 是板级体检，检查间距、未连线、板框、过孔和规则冲突
- `--refill-zones` 先重铺铜皮，避免旧铜皮状态骗过检查
- `export gerbers` 输出每个铜层、阻焊层、丝印层和板框等制造图层
- `export drill` 输出孔位文件，工厂靠它知道哪里要钻通孔或安装孔

这类命令适合放进 release 脚本：每次下单前跑同一套动作，减少“手点漏一步”的风险。

### 案例 3：用 3D 和 STEP 做结构协同

真实场景：KiCad 官方文档强调 3D Viewer 可以检查 PCB 外观。做外壳、面板或连接器位置时，还要把板子导出给 FreeCAD、机械同事或外壳设计流程。

```bash
kicad-cli pcb export step --output out/enclosure-check.step board.kicad_pcb
kicad-cli pcb export 3dpdf --output out/review-3d.pdf board.kicad_pcb
kicad-cli pcb export position --output out/positions.csv board.kicad_pcb
```

逐部分解释：

- `export step` 生成结构 CAD 常用的 3D 模型，用来检查板子能不能装进外壳
- `export 3dpdf` 方便非 KiCad 用户直接旋转查看板子，不必安装完整工具链
- `export position` 给贴片装配或人工核对器件方向时使用

这个案例说明 KiCad 的价值不止在电路设计：它把电气设计、结构设计和制造协作接到同一份项目源头。

## 踩过的坑

1. **只保存 `.kicad_pcb` 不保存项目文件夹**：很多库表、规则和备份在项目目录里，单文件迁移容易缺上下文。

2. **符号和封装以为是一回事**：符号负责原理图语义，封装负责真实焊盘尺寸，二者匹配错会导致板子装不上元件。

3. **DRC 前忘记重铺铜区**：铺铜区域不会永远自动反映最新走线，旧状态可能让错误看起来不存在。

4. **把 3D 模型当制造真相**：3D 好看不代表焊盘、孔径、层叠和工厂规则都正确，制造仍要看 Gerber、钻孔和 DRC。

## 适用 vs 不适用场景

**适用**：

- 开源硬件、创客项目、课程项目和初创团队，希望别人能无许可证门槛打开设计
- 从原理图到 PCB 到制造文件都想放进一个项目里管理的电路设计
- 需要 ERC / DRC、3D 预览、BOM、Gerber、STEP 等完整输出的板级设计
- 希望用命令行自动导出评审文件、制造包或检查报告的团队流程

**不适用**：

- 只想画一张概念电路图，不需要真实封装、走线和制造输出
- 公司流程强绑定某个商业 EDA、专有库、仿真模型和审签系统
- 高速射频、复杂约束驱动布局等场景，如果团队已经有成熟专用工具链
- 完全不愿意理解基础电子概念；KiCad 可以降低软件门槛，但不能替代电路常识

## 历史小故事（可跳过）

- **1992 年**：Jean-Pierre Charras 首次发布 KiCad，最早就是一组配合使用的电子设计程序。
- **2010 年代**：便宜 PCB 制造和开源硬件兴起，让 KiCad 从爱好者工具逐渐进入更复杂项目。
- **2013 年后**：CERN 开始持续投入 KiCad 生态，目标是让开放硬件拥有可用的开放 EDA 工具。
- **今天**：GitHub 上的 `kicad-source-mirror` 是活跃开发分支镜像，真正开发托管在 GitLab；GitHub PR 不作为主要协作入口。
- **2026 年**：CERN 还开放了自己的 KiCad 元件库，进一步补齐“工具开源但元件资料难复用”的短板。

## 学到什么

- KiCad 的核心不是“画板子”，而是让电路逻辑、物理布局和制造输出保持一致。
- 原理图、封装、走线、规则检查是同一条链；链上任一环偷懒，错误都会在后面放大。
- 开源 EDA 的价值在协作和长期可复现：项目文件、库、脚本和导出物都能一起进版本管理。
- 命令行让硬件设计更像软件工程：检查、导出、评审和发版可以被重复执行。

## 延伸阅读

- 官方仓库：[KiCad/kicad-source-mirror](https://github.com/KiCad/kicad-source-mirror)
- 官方入门教程：[Getting Started in KiCad](https://docs.kicad.org/8.0/en/getting_started_in_kicad/getting_started_in_kicad.html)
- 命令行手册：[KiCad CLI Reference](https://docs.kicad.org/10.0/en/cli/cli.html)
- 项目介绍：[About KiCad](https://www.kicad.org/about/kicad/)
- CERN 资料：[CERN’s KiCad component library now open source](https://home.cern/cerns-kicad-component-library-now-open-source/)
- [[schgen-pcb]] —— 从文本或规则生成 PCB 的另一种自动化思路

## 关联

- [[freecad]] —— KiCad 导出的 STEP 常进入 FreeCAD 做外壳和机械检查
- [[openscad]] —— 同样把硬件设计变成可复现文件，但 OpenSCAD 偏参数化结构件
- [[librecad]] —— LibreCAD 处理 2D 工程图，KiCad 处理电子板级设计
- [[grbl]] —— GRBL 控制 CNC 制造，KiCad 的板框、钻孔和制造文件处在更前一环
- [[arduino-cli]] —— Arduino 项目常需要自制扩展板，KiCad 负责把电路落成 PCB
- [[blender]] —— Blender 偏视觉资产，KiCad 的 3D 预览偏工程装配检查

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
