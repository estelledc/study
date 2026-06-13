---
title: KiCad — 电子电路 CAD
来源: https://github.com/KiCad/kicad-source-mirror
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
难度: 初级
---

## 是什么

**KiCad** 是一套**免费开源**的电子设计自动化（EDA）软件，源码镜像托管于 [KiCad/kicad-source-mirror](https://github.com/KiCad/kicad-source-mirror)。它用 C++ 编写，跨 Windows、macOS、Linux，核心能力是把「电路想法」变成**可制造的 PCB**——从原理图、元器件封装、双层/多层布线，到 Gerber 钻孔文件与 3D 预览，一条龙完成。CERN 等机构长期参与生态建设，常被称作开源 EDA 的旗舰之一。

日常类比：如果把做一块电路板比作**装修一套房子**，KiCad 的角色接近「建筑 + 水电施工图」全家桶：

- **原理图（Schematic）** 像**户型电路图**——灯开关连哪根线、插座从哪路电来，只关心「谁和谁电气相连」，不管插座贴在墙上还是地上；
- **封装（Footprint）** 像**家具底座的螺丝孔位**——电阻在板子上占多大面积、引脚间距 2.54 mm 还是 0.5 mm，必须和实物一致；
- **PCB 布局（Layout）** 像**现场铺线**——铜箔走线在板子哪一层、过孔钻多大、地平面怎么铺，决定信号能不能稳定工作；
- **Gerber / 钻孔文件** 像**交给工厂的切割图纸**——板厂不看你的 `.kicad_pcb`，只看这些标准格式去蚀刻铜、钻孔。

再打个比方：KiCad 在工具谱系里接近 **Altium / Eagle 的开源替代**。和 [[librecad]]、[[freecad]] 画机械外形不同，KiCad 管的是**电气连接 + 阻抗 + 制造规则**；和 [[openscad]] 用代码挤出 3D 实体也不同，KiCad 的「代码感」更多体现在 **Python 脚本、`kicad-cli` 命令行** 和 **S 表达式网表** 上。

## 为什么重要

零基础想「自己画板子、打样、焊接」，KiCad 有几个现实理由：

- **零授权费、开源**：个人、学校、创业公司不必为 EDA 席位付费；GPL 许可，社区可审计、可贡献
- **完整工作流**：原理图编辑器（Eeschema）、PCB 编辑器（Pcbnew）、符号/封装编辑器、Gerber 查看器、3D 查看器、PCB 计算器、集成 SPICE 仿真——不必拼凑五六个工具
- **库生态大**：官方与社区符号/封装库持续更新；缺件时可从 SnapEDA、厂商 PDF 自建 footprint
- **制造对接成熟**：导出 Gerber + Excellon 钻孔，全球板厂（JLCPCB、PCBWay 等）直接吃；BOM 可 CSV 导出给贴片
- **自动化友好**：`kicad-cli` 适合 CI 里批量出图；`pcbnew` Python API 适合批量改丝印、铺铜、检查

代价也要心里有数：**学习曲线比 Fritzing 陡**；高速、射频、复杂 HDI 需要额外仿真与规则经验；符号与封装必须自己核对，库错误会导致「能画不能焊」。

## 核心要点

### 1. 项目与文件结构

新建项目后，KiCad 通常生成一组关联文件：

| 文件 | 作用 |
| --- | --- |
| `*.kicad_pro` | 项目总控：库表、网类、设计规则入口 |
| `*.kicad_sch` | 原理图（可多页 sheet） |
| `*.kicad_pcb` | PCB 布局与铜箔 |
| `fp-lib-table` / `sym-lib-table` | 封装库、符号库搜索路径 |
| `*.kicad_prl` | 个人本地 UI 状态（常不提交 git） |

类比：`.kicad_pro` 是「工程文件夹索引」，原理图是逻辑合同，PCB 是施工蓝图。

### 2. 符号（Symbol）与封装（Footprint）

- **Symbol**：原理图里的抽象块——引脚名、编号、电气类型（输入/输出/电源），**不管物理尺寸**
- **Footprint**：PCB 上的焊盘与丝印轮廓——必须与实物 datasheet 一致

二者通过 **封装指派（Assign Footprints）** 绑定。KiCad **不会**像某些老工具那样自动「一个元件永远对应一个封装」；每个原理图元件都要显式选好 footprint，否则更新到 PCB 时会报缺件。

### 3. 典型工作流

官方文档（[Getting Started in KiCad 9](https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html)）归纳的主线：

```text
建项目 → 画原理图 → 标注(Annotate) → 指派封装 → ERC
    → 更新到 PCB → 画板框 → 摆放元件 → 布线 → 铺铜 → DRC
    → 导出 Gerber/钻孔 → 下单打样
```

- **ERC（Electrical Rules Check）**：原理图级——电源悬空、引脚类型冲突、未连接输入等
- **DRC（Design Rules Check）**：PCB 级——线距、线宽、过孔、铜皮间隙是否满足工艺

### 4. 网（Net）、网类（Net Class）与铺铜

- **Net**：电气上连在一起的节点，如 `GND`、`+3V3`、`USB_D+`
- **Net Class**：给不同 net 设默认线宽、间隙、过孔尺寸——电源线常比信号线宽
- **Filled Zone（铺铜）**：大面积铜皮，常用于 **GND 平面**，降低回流阻抗、改善 EMC

SparkFun 等教程强调：铺好 GND 后按 `B` 填充（Fill），再跑 DRC，比「一根根地线走线」稳得多。

### 5. 制造输出

板厂需要：

| 输出 | 说明 |
| --- | --- |
| Gerber（每层铜、阻焊、丝印） | 光绘图形 |
| 钻孔文件（Excellon） | 通孔、过孔坐标与直径 |
| 可选：BOM、坐标文件 | SMT 贴片用 |

KiCad 内 **File → Plot** 生成 Gerber；**Generate Drill Files** 生成钻孔。下单前用 **Gerber Viewer** 叠层检查有无断线、镜像错误。

### 6. 与其他工具的关系

| 维度 | KiCad | Fritzing | 商业 Altium |
| --- | --- | --- | --- |
| 定位 | 全功能开源 EDA | 创客面包板友好 | 企业级全流程 |
| 学习曲线 | 中 | 低 | 高 |
| 自动化 | Python + CLI 强 | 弱 | 脚本/插件丰富 |
| 典型用户 | 工程师、Maker、高校 | 教学演示 | 公司量产 |

机械外壳仍常用 [[freecad]] / [[librecad]] 画板框 DXF，再导入 KiCad `Edge.Cuts` 层对齐。

## 代码示例

### 示例 1：`kicad-cli` 批量导出 Gerber（CI / 脚本）

KiCad 8+ 提供 **`kicad-cli`**，适合在终端或 GitHub Actions 里「无 GUI 出生产资料」。无需打开 PCB 编辑器即可从 `.kicad_pcb` 导出 Gerber：

```bash
# 查看 pcb 子命令帮助
kicad-cli pcb --help

# 从 PCB 导出 Gerber 到 gerbers/ 目录（路径因版本略有差异，以 --help 为准）
kicad-cli pcb export gerbers \
  --output gerbers/ \
  my_project.kicad_pcb

# 导出钻孔
kicad-cli pcb export drill \
  --format excellon \
  --output gerbers/ \
  my_project.kicad_pcb

# 导出 BOM（需原理图）
kicad-cli sch export bom \
  --format csv \
  --output bom.csv \
  my_project.kicad_sch
```

**使用场景**：每次 git push 后自动出 Gerber 压缩包，避免「手点 Plot 忘了某一层」；与 [[gitleaks]] 式流水线类似，把易错手工步骤变成可重复命令。

### 示例 2：Python `pcbnew` 批量改丝印可见性

Pcbnew 内置 **Python** 接口（官方示例见源码 `demos/python_scripts_examples/`）。下面脚本加载一块板，隐藏所有元件的 **Value** 丝印、保留 **Reference**（位号），适合量产板面清爽：

```python
#!/usr/bin/env python3
"""批量隐藏 Value、显示 Reference。用法: python hide_values.py board.kicad_pcb"""
import sys
from pcbnew import LoadBoard, SaveBoard

def main(path: str) -> None:
    board = LoadBoard(path)
    for fp in board.GetFootprints():
        ref = fp.Reference()
        val = fp.Value()
        ref.SetVisible(True)
        val.SetVisible(False)
    out = f"mod_{path}"
    SaveBoard(out, board)
    print(f"Saved {out}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: hide_values.py <file.kicad_pcb>")
    main(sys.argv[1])
```

在 KiCad 自带的 **PCB Editor → Tools → Scripting Console** 里也可交互执行 `import pcbnew` 后片段。注意：内部坐标常用纳米（nm），画新走线时用 `pcbnew.FromMM(0.25)` 转线宽更稳妥。

### 示例 3：原理图网表片段（S-expression）

KiCad 原理图/PCB 底层是**文本化 S 表达式**，便于 diff 与工具链处理。网表连接概念上类似：

```lisp
(net (code 1) (name "GND")
  (node (ref "C1") (pin "2"))
  (node (ref "U1") (pin "8"))
  (node (ref "R1") (pin "1")))
(net (code 2) (name "+3V3")
  (node (ref "C1") (pin "1"))
  (node (ref "U1") (pin "7")))
```

读法：`GND` 网络把 `C1` 的 2 脚、`U1` 的 8 脚、`R1` 的 1 脚连在一起。布局时 PCB 编辑器根据此类 net 拉 **ratsnest（鼠线）** 提示你该去哪布线。研究型工具（如论文 [[schgen-pcb]]）可从自然语言生成 `.kicad_sch` 再导出网表，思路与此同源。

## 第一个板子：LED + 电阻（概念步骤）

以「Arduino 排针 + LED + 限流电阻」为例，浓缩零基础路径（细节以你安装的 KiCad 9 菜单为准）：

1. **新建项目** `led_blink`，单位选 **mm**，模板默认即可
2. **原理图**：`A` 放置符号 — 排针 `Conn_01x02`、LED、电阻 `R`；`W` 画线；放置 `GND` / `+5V` 电源符号
3. **标注**：Tools → Annotate，位号 `R1`、`D1`、`J1` 自动编号
4. **封装**：Tools → Assign Footprints — LED 选 `LED_THT:LED_D5.0mm`，电阻 `R_THT:R_Axial_DIN0207`
5. **ERC**：Inspect → Electrical Rules Checker，修掉悬空电源（可加 PWR_FLAG 或正确电源符号）
6. **更新 PCB**：Tools → Update PCB from Schematic（`F8`），元件成簇出现
7. **板框**：选 `Edge.Cuts` 层，画矩形 ~50×30 mm
8. **布局**：先固定排针，再摆 LED/电阻；`X` 开始布线，信号 0.25 mm、电源 0.5 mm 起步
9. **铺铜**：Add Filled Zone → 选 `B.Cu`、网络 `GND` → 闭合多边形 → `B` 填充
10. **DRC**：Inspect → Design Rules Checker，清零错误后再 Plot

快捷键（欧美教程常见）：`A` 放元件、`W` 连线、`X` 布线、`V` 过孔、`B` 铺铜填充、`Ctrl+S` 保存。

## 零基础学习路径

1. **安装**：从 [kicad.org/download](https://www.kicad.org/download/) 装最新稳定版；首次启动确认 **mm** 与 **Design Rules** 默认
2. **跟官方教程**：通读 [Getting Started in KiCad](https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html) 示例工程（含符号库、ERC、Gerber）
3. **做一个「能亮」的简单板**：上面 LED 工程或 SparkFun [Beginner's Guide to KiCad](https://learn.sparkfun.com/tutorials/beginners-guide-to-kicad/all)
4. **搞懂封装**：亲手为一个非标准连接器建 footprint（1:1 按 datasheet 量焊盘）
5. **制造闭环**：导出 Gerber → 用 KiCad Gerber Viewer 自检 → JLCPCB 等平台下单 5 片
6. **自动化**：试 `kicad-cli pcb export gerbers`；写 10 行 Python 改丝印
7. **进阶**：网类/差分对、USB 阻抗、插件 ActionPlugin、SPICE 仿真

## 常见问题

**Q：原理图更新了，PCB 不同步怎么办？**  
A：在 PCB 编辑器 **Update PCB from Schematic**；若仍缺线，检查是否漏指派封装或 ERC 未通过。

**Q：DRC 报 clearance 怎么办？**  
A：拉大走线间距、改 **Board Setup → Design Rules → Constraints**；或移动元件；量产前规则要和板厂工艺（如 6 mil）对齐。

**Q：库里的 footprint 焊不上？**  
A：库错误很常见。对照 datasheet **自己量一次**；3D 模型仅作预览，不能代替焊盘校验。

**Q：和 CircuitPython / [[circuitpython]] 什么关系？**  
A：KiCad 画 **PCB 载体**；固件在 MCU 上跑 CircuitPython。常见组合：KiCad 画 RP2040/ESP32 载板，再插模块开发。

**Q：能只做原理图不打板吗？**  
A：可以。仿真、文档、BOM 报价都可在布局前完成；但开源硬件通常希望闭环到 Gerber。

## 小结

KiCad 是 **GPL 开源的全流程 EDA**：原理图定连接、封装对实物、PCB 定制造、Gerber 交工厂。核心思维是 **符号≠封装、ERC 先于布局、铺铜服务回流、DRC 先于下单**。从零开始：跟官方教程画完一张 LED 板 → 导出 Gerber 打样 → 用 `kicad-cli` 或 Python 把重复劳动脚本化——你就从「会点菜单」进阶到「可维护的硬件工程流」。

## 延伸阅读

- 官方站点：[kicad.org](https://www.kicad.org/)
- 入门文档：[Getting Started in KiCad 9](https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html)
- 命令行：[KiCad CLI](https://docs.kicad.org/master/en/cli/cli.html)
- Python API 概述：[pcbnew scripting](https://dev-docs.kicad.org/en/python/pcbnew/)
- 社区教程：[SparkFun Beginner's Guide to KiCad](https://learn.sparkfun.com/tutorials/beginners-guide-to-kicad/all)
- 源码镜像：[github.com/KiCad/kicad-source-mirror](https://github.com/KiCad/kicad-source-mirror)
- 相关笔记：[[librecad]]（2D 外形）、[[freecad]]（机械结构）、[[circuitpython]]（板上固件）、[[schgen-pcb]]（AI 生成原理图）
