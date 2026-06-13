---
title: Rive — 交互动画运行时
来源: https://github.com/rive-app/rive-runtime
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
难度: 初级
---

## 日常类比：Rive Runtime 是「可编程的皮影戏放映机」

在 Rive 编辑器里，设计师像搭皮影：角色、按钮、图标是**画板（Artboard）**，走路、悬停、点击是**状态机剧本**，导出后得到一个 `.riv` 文件——相当于把整套皮影和机关装进一只木箱。

**Rive Runtime**（本仓库核心是 C++ 的 [rive-runtime](https://github.com/rive-app/rive-runtime)）就是各平台上的**放映机 + 提线师**：读 `.riv`，每帧根据用户点击、滑动或你代码里设的开关，决定播哪段动画、怎么混合过渡，再用矢量渲染器画到屏幕。和「导出成 GIF / 视频」不同，动画仍是**实时矢量**，可响应输入、可改参数、体积极小。

| 维度 | 数据 |
|------|------|
| 核心 Runtime | [rive-app/rive-runtime](https://github.com/rive-app/rive-runtime)（C++，MIT） |
| Web 封装 | [@rive-app/canvas](https://github.com/rive-app/rive-wasm)、[@rive-app/react-canvas](https://github.com/rive-app/rive-react) |
| 官方文档 | [Rive Runtimes](https://rive.app/docs/runtimes/getting-started) |
| 文件格式 | `.riv`（二进制，编辑器导出） |
| 渲染后端 | Metal、Vulkan、D3D11/12、OpenGL/WebGL、WebGPU |
| 平台 | Web、iOS、Android、Flutter、Unity、Unreal、React Native 等 |

---

## 是什么

[Rive](https://rive.app) 是一条**端到端**流水线：编辑器里做矢量交互动画 → 导出 `.riv` → 各语言 Runtime 加载播放。`rive-runtime` 是底层 C++ 库，负责：

- 解析 `.riv`，构建 **Artboard**（场景图：形状、骨骼、嵌套画板等）
- 驱动 **线性动画（Linear Animation）** 或 **状态机（State Machine）**
- 通过抽象 **Renderer** 接口，把矢量路径交给 GPU 渲染器（PLS 路径渲染）

上层还有 `rive-wasm`（Web）、`rive-react`、`rive-flutter` 等，本质都是对同一套 C++ 核心的绑定。设计师在编辑器里连好的「悬停变亮、按下弹跳」，Runtime 里用**状态机输入**接住，不必在代码里逐帧 K 帧。

工作流三段：

1. **Rive Editor** — 画矢量、绑状态机、设输入（Bool / Number / Trigger）、布局  
2. **导出 `.riv`** — 单文件打包资源与逻辑  
3. **Runtime 循环** — `load → advance → apply → draw`，可选监听指针与状态变化

---

## 为什么重要

不懂 Rive Runtime，下面几件事很难讲清楚：

- 为什么同一个加载按钮动画能同时跑在 React 官网、Flutter App 和游戏里——**`.riv` 格式统一**，只差各平台 Renderer 胶水  
- 为什么交互动画不必写成几百行 GSAP——**状态机在编辑器里可视化连线**，代码只改几个输入值  
- 为什么矢量动画在 4K 屏上不糊——每帧 GPU 重绘路径，不是放大位图  
- 为什么 Lottie 常做「播完即走」，Rive 更偏「长期挂在 UI 里响应用户」——状态机 + 命中测试是为一等公民设计的  

和 [GSAP](/docs/projects/gsap)（命令式补间）、[Spine Runtimes](/docs/projects/spine-runtimes)（游戏骨骼 2D）相比，Rive 更强调**设计工具与 Runtime 行为一致**：编辑器里预览的交互，就是线上跑的交互。

---

## 核心概念

### 1. File 与 Artboard — 文件与画板

`.riv` 加载后得到 `File` 对象，内含一个或多个 **Artboard**（类似 Figma 的一页画板）。Runtime 区分：

- **源 Artboard（source）** — 只读蓝图，不能直接动画  
- **ArtboardInstance** — 通过 `artboard->instance()` 克隆出的可动画实例  

类比：源画板是印刷模版，实例是你舞台上真正在动的那一个；多个按钮可以 `instance()` 同一份数据，各自独立状态。

### 2. Scene：统一的播放接口

无论是线性动画还是状态机，运行时都通过 **`Scene`** 抽象统一接口，典型每帧调用：

```
scene->advance(deltaSeconds);
scene->apply();           // 或由 advanceAndApply 合并
artboard->draw(renderer);
```

`LinearAnimationInstance` 与 `StateMachineInstance` 都继承 `Scene`，所以游戏主循环可以同一套写法切换模式。

### 3. Linear Animation — 时间轴动画

**LinearAnimation** 是数据：帧率、时长、循环模式、关键帧表。  
**LinearAnimationInstance** 是播放状态：当前时间、方向、是否播完。

适合片头、一次性过渡、不需要复杂分支的场景。代码里指定动画名即可 `play('idle')`。

### 4. State Machine — 交互动画的大脑

**State Machine** 是 Rive 交互的核心（多数 UI 图标、按钮用这个）：

- **State（状态）** — 每个状态绑定一段或多段动画  
- **Transition（过渡）** — 条件满足时混合切换到下一状态  
- **Input（输入）** — 代码与设计的桥梁，三种类型：  
  - **Boolean** — `input.value = true/false`（如 `isHover`）  
  - **Number** — `input.value = 0.5`（如进度、音量）  
  - **Trigger** — `input.fire()` 一次性脉冲（如 `onClick`）  
- **Listener** — 编辑器里配置的点击/拖拽区域，Runtime 做命中测试后触发过渡  

每帧 `StateMachineInstance::advanceAndApply(dt)` 会：评估过渡条件 → 混合进出状态动画 → 更新画板属性。

### 5. Renderer — 与引擎无关的绘制 API

C++ 层 `Renderer` 是纯虚接口：`drawPath`、`drawImage`、`clipPath` 等。  
生产环境默认 **RiveRenderer + RenderContext**（PLS 矢量 GPU 路径），支持 Metal / Vulkan / D3D / WebGL / WebGPU。  
你也可以实现自定义 `Renderer` 接到 Skia、引擎自有 2D 管线（高级集成）。

### 6. 平台 Runtime 分层

```
Rive Editor → .riv
       ↓
rive-runtime (C++)  ← 解析、动画求解、Renderer 抽象
       ↓
rive-wasm / rive-ios / rive-android / rive-flutter …
       ↓
@rive-app/react-canvas、游戏引擎插件 …
```

Web 上 JS 通过 WASM 调 C++；React 的 `useRive` 只是对 WASM Runtime 的薄封装。

### 7. Data Binding（ViewModel）— 可选的数据驱动

较新版本支持 **ViewModel**：把状态机输入绑定到命名属性，Runtime 可 `autoBind` 或用手动 hook 同步业务数据（如股票数值、表单校验状态），减少逐个 `getNumber('price')` 的胶水代码。

### 8. 嵌套画板 Nested Artboard

一个 Artboard 可嵌入另一个 Artboard 的实例，并驱动其内部状态机。适合「角色手里的道具」「弹窗里的子动画」模块化复用。

---

## 代码示例一：React — 状态机 + 悬停与点击（Web）

安装：

```bash
npm install @rive-app/react-canvas
```

典型交互按钮：状态机里有 `isHovered`（Bool）和 `onClick`（Trigger）：

```tsx
import { useRive, useStateMachineInput } from '@rive-app/react-canvas';

export function RiveIconButton() {
  const { rive, RiveComponent } = useRive({
    src: '/icons/send.riv',
    stateMachines: 'ButtonState',
    autoplay: true,
  });

  const isHovered = useStateMachineInput(rive, 'ButtonState', 'isHovered');
  const onClick = useStateMachineInput(rive, 'ButtonState', 'onClick');

  return (
    <button
      type="button"
      aria-label="发送"
      onMouseEnter={() => isHovered && (isHovered.value = true)}
      onMouseLeave={() => isHovered && (isHovered.value = false)}
      onClick={() => onClick?.fire()}
    >
      <RiveComponent style={{ width: 48, height: 48 }} />
    </button>
  );
}
```

要点：

- `useRive` 返回的 `rive` 在文件加载完成前为 `null`，`useStateMachineInput` 也会是 `null`，赋值前要判断  
- **Bool/Number** 改 `.value`；**Trigger** 调 `.fire()`，没有持久「开/关」  
- `RiveComponent` 必须渲染到 DOM，内部会挂 canvas 并处理高清屏缩放  
- 状态机名称、输入名称必须与编辑器里**完全一致**（区分大小写）

把业务状态同步进动画（例如提交中 / 成功）：

```tsx
const loading = useStateMachineInput(rive, 'ButtonState', 'loading');
const success = useStateMachineInput(rive, 'ButtonState', 'success');

useEffect(() => {
  if (loading) loading.value = isSubmitting;
}, [isSubmitting, loading]);

useEffect(() => {
  if (success) success.value = isSuccess;
}, [isSuccess, success]);
```

---

## 代码示例二：Vanilla JS — 线性动画与手动控制循环

不依赖 React 时，直接用 `@rive-app/canvas`（或旧称 rive-js）。下面展示：**加载文件 → 播线性动画 → 按钮暂停/继续**：

```javascript
import { Rive, Layout, Fit, Alignment } from '@rive-app/canvas';

const canvas = document.getElementById('rive-canvas');

const rive = new Rive({
  src: '/animations/mascot.riv',
  canvas,
  autoplay: true,
  animations: 'wave',           // 线性动画名；用状态机时改 stateMachines
  layout: new Layout({
    fit: Fit.Contain,
    alignment: Alignment.Center,
  }),
  onLoad: () => {
    rive.resizeDrawingSurfaceToCanvas();
  },
});

document.getElementById('pause').addEventListener('click', () => {
  rive.pause();
});

document.getElementById('play').addEventListener('click', () => {
  rive.play('wave');
});
```

若需要**低层 API**（同一 canvas 多个 artboard、自管 `requestAnimationFrame`），可走 rive-wasm 的底层示例：自己 `load` → `ArtboardInstance` → `advanceAndApply` → `draw`。游戏引擎集成通常在这一层挂钩。

监听状态机变化（调试或埋点）：

```javascript
const rive = new Rive({
  src: '/ui/toggle.riv',
  canvas,
  stateMachines: 'ToggleSM',
  autoplay: true,
  onStateChange: (event) => {
    console.log('entered state:', event.data[0]);
  },
});
```

---

## C++ Runtime 视角：最小心智模型

读 `rive-runtime` 源码或写原生集成时，记住这条链：

```
File::import(rivBytes)
  → Artboard* (source)
  → artboard->instance() → ArtboardInstance
  → stateMachine->instance() → StateMachineInstance (extends Scene)
  → each frame: smi->advanceAndApply(dt)
  → artboard->draw(renderer)
```

`StateMachineInstance` 还处理 `pointerDown/Move/Up`，遍历 `HitComponent` 做命中测试，触发 Listener。异步多线程场景可用 `CommandQueue` / `CommandServer` 把加载与 advance 放到渲染线程（见 runtime 文档 Advanced Topics）。

构建 C++ 库（Mac 为主，社区也支持 Windows/Linux）：

```bash
cd rive-runtime
./build.sh          # debug
./build.sh release  # release
```

测试：`cd tests/unit_tests && ./test.sh`。依赖 premake5、较新的 clang（向量 builtins）。

---

## 与 Lottie / Spine / GSAP 的对比

| 维度 | Rive Runtime | Lottie | Spine | GSAP |
|------|--------------|--------|-------|------|
| 源文件 | `.riv` 二进制 | `.json` / `.lottie` | `.json` + 图集 | 无单一资产，代码为主 |
| 交互模型 | 状态机为一等公民 | 有限（bodymovin 表达式） | 动画混合 + 事件 | 完全代码驱动 |
| 渲染 | 内置高性能矢量 GPU | 多依赖 SVG/Canvas 实现 | 引擎贴图网格 | 改 DOM/CSS 属性 |
| 设计工具 | Rive Editor（同厂） | After Effects 插件 | Spine Editor | 无官方视觉状态机 |
| 典型场景 | App UI、可点击图标、游戏 HUD | 轻量展示动画 | 2D 游戏角色 | 营销页、时间轴编排 |

---

## 学习路径（零基础）

1. 在 [Rive Editor](https://editor.rive.app) 打开官方示例，看 **State Machine** 面板如何连线和命名 Input  
2. 读 [Getting Started (Web)](https://rive.app/docs/runtimes/web/web-js) 跑通第一个 canvas  
3. React 项目装 `@rive-app/react-canvas`，用 `useRive` + `useStateMachineInput` 做悬停按钮  
4. 需要游戏引擎时查对应 [Runtime Overview](https://rive.app/docs/runtimes/getting-started)（Flutter / Unity / Unreal）  
5. 要改底层或贡献代码：clone `rive-runtime`，读 `include/rive/file.hpp`、`state_machine_instance.hpp`、`renderer.hpp`

---

## 常见坑

- **动画名 / 状态机名 / 输入名写错** — 静默失败或 Input 一直是 `null`，先在编辑器 Export 预览里核对字符串  
- **忘记等 `onLoad` 或 `rive` 非空** — 过早 `fire()` 或改 `value` 无效  
- **Canvas 尺寸为 0** — 父容器没高度时动画不可见；React 里给 `RiveComponent` 明确 `width/height` 或 flex 布局  
- **Retina 模糊** — Web 需在 resize 后调 `resizeDrawingSurfaceToCanvas()`  
- **混用 `animations` 与 `stateMachines` 参数** — 同一次 `useRive` 里分清播线性动画还是状态机  
- **版本不匹配** — `@rive-app/react-canvas`  major 升级常伴随 WASM 破坏性变更，按 [Migration](https://rive.app/docs/runtimes/web/migrating-from-rive-js) 文档升级  
- **C++ 集成** — Renderer 后端要与平台 GPU API 对齐；无 GPU 时只能走 Skia 等备用路径，性能特征不同  

---

## 和本仓库其他笔记的关系

- 网页时间轴补间、滚动叙事可看 [GSAP](/docs/projects/gsap)  
- 2D 游戏骨骼管线对照 [Spine Runtimes](/docs/projects/spine-runtimes)  
- Flutter 技术栈下 Rive 官方编辑器本身也用 Flutter 重写，可与 [Flutter 生态](/docs/projects/flutterfire) 项目一并规划  
- 做 E2E 时若页面含 Rive canvas，测试工具需等待 canvas 绘制完成，可参考 [Playwright](/docs/projects/playwright) 的 auto-wait 思路  

---

## 小结

Rive Runtime 不是「又一个 GIF 播放器」，而是加载 `.riv`、用**状态机**响应输入、用**矢量渲染器**上屏的跨平台引擎。日常开发记住两条线即可：

**产品集成（Web/React）**：`useRive` 加载 → `useStateMachineInput` 改输入 → 渲染 `RiveComponent`  

**底层（C++/游戏）**：`File` → `ArtboardInstance` → `StateMachineInstance::advanceAndApply` → `draw(Renderer)`  

设计师在编辑器里定义的交互边界，由 Runtime 忠实执行；你的代码主要负责**何时改 Bool、何时 fire Trigger、何时监听状态变化**——剩下的混合与绘制交给 `rive-runtime`。
