---
title: nodegui — 用 Node.js 写原生桌面窗口
来源: 'https://github.com/nodegui/nodegui'
日期: 2026-07-09
分类: mobile
难度: 中级
---

## 是什么

日常类比：你会用厨房里的菜谱语言，但现在要开一家真正的餐厅。NodeGui 就像把“会写 JavaScript”的厨师带进专业厨房，让他继续用熟悉的 JS 和 CSS，却端出操作系统原生的桌面窗口。

NodeGui 是一个用 Node.js 绑定 Qt 的桌面应用框架。你写的是 JavaScript，创建出来的是 Qt 原生 widget，不是浏览器里的 DOM，也不是把网页塞进 webview。

它解决的问题很直接：前端或 Node.js 开发者想做 Windows、macOS、Linux 桌面工具，但又不想随应用带一个完整 Chromium。NodeGui 选择复用 Qt 的成熟控件，再给它套一层 JS API 和类 CSS 样式。

虽然这个项目在仓库介绍里已经写到 Qt6，很多旧文档和 FAQ 仍围绕 Qt5、Qode、Node 16 展开。学习时可以把它理解成“Qt 生态 + Node.js”的路线，不要把具体版本当成永远不变的事实。

## 为什么重要

- 它解释了“JavaScript 桌面应用”不只有 Electron 一条路：NodeGui 走的是原生控件路线。
- 它让你看到跨平台 UI 的另一种取舍：少带一个浏览器，换来更多 Qt 构建和版本兼容问题。
- 它把 CSS-like 样式、Flexbox、Node 模块生态放到桌面软件里，适合做内部工具和轻量 GUI。
- 它有约 9k stars，体量不算巨无霸，但足够展示“JS + 原生桌面”的工程边界。

## 核心要点

1. **不是 webview，而是 Qt widget**

   类比：Electron 像在店里放一台完整平板显示网页，NodeGui 像直接请木匠做柜台。NodeGui 的 `QMainWindow`、`QLabel`、`QPushButton` 都是 Qt 控件的 JS 包装，所以内存和空闲 CPU 通常比 Chromium 壳轻。

2. **样式像 CSS，但规则来自 Qt**

   类比：两座城市都说中文，但路牌和交通规则不完全一样。NodeGui 能写 `color`、`padding`、`#id:hover`，也支持 FlexLayout；但属性全集、选择器细节、`qproperty-*` 都要按 Qt Style Sheet 来理解。

3. **开发体验像 Node 项目，发布体验像原生项目**

   类比：你在前台点咖啡很简单，后厨机器却要保养。写代码时是 `package.json`、`npm install`、`require("@nodegui/nodegui")`；装依赖和打包时却会碰到 Qt 二进制、CMake、平台工具链、Node 版本这些原生世界的问题。

## 实践案例

### 案例 1：跑起一个最小原生窗口

```bash
git clone https://github.com/sedwards2009/nodegui-simple-starter.git
cd nodegui-simple-starter
npm install
npm run build
npm run run
```

最小窗口代码可以这样理解：

```js
const { QMainWindow } = require("@nodegui/nodegui");

const win = new QMainWindow();
win.setWindowTitle("Hello NodeGui");
win.resize(320, 180);
win.show();

global.win = win;
```

逐部分解释：

- `QMainWindow` 是 Qt 主窗口的 JS 包装，不是浏览器窗口。
- `show()` 之后操作系统会显示一个真正桌面窗口。
- `global.win = win` 不是装饰，FAQ 明确提到窗口变量被垃圾回收后，窗口可能消失。

### 案例 2：做一个带 CSS 样式的面板

```js
const { FlexLayout, QLabel, QPushButton, QWidget, QMainWindow } = require("@nodegui/nodegui");
const root = new QWidget();
root.setObjectName("root");
root.setLayout(new FlexLayout());
const title = new QLabel();
title.setObjectName("title");
title.setText("今日任务");
const button = new QPushButton();
button.setText("完成一个番茄钟");
button.addEventListener("clicked", () => title.setText("已完成 1 个番茄钟"));
root.layout.addWidget(title);
root.layout.addWidget(button);
root.setStyleSheet(`
  #root { flex: 1; padding: 16px; background-color: #202124; }
  #title { color: white; font-size: 18px; margin-bottom: 12px; }
  QPushButton { padding: 8px; }
`);
const win = new QMainWindow();
win.setCentralWidget(root);
win.show();
global.win = win;
```

逐部分解释：

- `setObjectName("root")` 类似给 HTML 元素设置 `id`，样式表靠它选中控件。
- `FlexLayout` 借助 Yoga 提供 Flexbox 思路，但布局对象仍然挂在 Qt widget 上。
- `clicked` 是原生按钮事件，回调跑在 NodeGui 的 JS 层。

### 案例 3：给 Node 脚本套一个桌面壳

```js
const fs = require("fs");
const { QLabel, QPushButton, QMainWindow, QWidget, FlexLayout } = require("@nodegui/nodegui");
const root = new QWidget();
root.setLayout(new FlexLayout());
const label = new QLabel();
label.setText("还没读取文件");
const button = new QPushButton();
button.setText("读取 notes/today.txt");
button.addEventListener("clicked", () => {
  const text = fs.readFileSync("notes/today.txt", "utf8");
  label.setText(text.slice(0, 80));
});
root.layout.addWidget(button);
root.layout.addWidget(label);
const win = new QMainWindow();
win.setCentralWidget(root);
win.show();
global.win = win;
```

逐部分解释：

- `fs.readFileSync` 是普通 Node API，NodeGui 应用不是浏览器环境。
- 这种姿势适合把已有 CLI、批处理、日志查看器、文件转换器加上 GUI。
- 如果任务很重，真实项目要把耗时逻辑拆出去，别让点击事件把界面卡住。

## 踩过的坑

1. **安装卡在 Minimal Qt setup**：依赖安装会下载 Qt 组件，网络失败时要用 `QT_LINK_MIRROR` 或自备 `QT_INSTALL_DIR`。
2. **文档版本容易混淆**：README 写 Qt6，旧教程常写 Qt5、Qode、Node 16，照抄前要先看当前 package 要求。
3. **窗口突然消失**：窗口、tray、顶层 widget 没有长期引用时会被 JS 垃圾回收，所以示例里常写 `global.win = win`。
4. **把它当浏览器 CSS**：NodeGui 没有 DOM，CSS 属性和选择器受 Qt Style Sheet 限制，复杂网页布局不能直接搬。

## 适用 vs 不适用场景

**适用**：

- 内部工具、运维面板、日志查看器、文件处理器，需要一个轻量桌面壳。
- 团队熟悉 Node.js，希望复用 npm 模块和现有 JS 脚本。
- 对空闲内存、启动体积、原生控件观感比对 Web 生态完整性更敏感。
- 想学习跨平台 UI 框架如何把一套 API 映射到多平台控件。

**不适用**：

- 需要完整浏览器能力、复杂 DOM、Canvas/WebGL 或直接复用 Web 页面。
- 团队完全不想处理 Qt、CMake、原生依赖、平台构建差异。
- 需要最活跃、最稳的商业桌面生态，Electron/Tauri/Flutter 资料会更多。
- 移动端 App；NodeGui 做桌面，不是 iOS/Android UI 框架。

## 历史小故事（可跳过）

- **2019 前后**：NodeGui 以“用 JavaScript 写高性能原生桌面应用”进入 JS 社区视野。
- **早期路线**：项目通过 Qode 和 Qt5 系列把 Node 运行时与 Qt 控件绑定起来。
- **生态扩展**：官方 README 指向 React NodeGUI、Vue NodeGUI、Svelte NodeGUI，说明它想承接前端组件模型。
- **当前状态**：README 已强调 Qt6、Node API 支持和 TypeScript 体验，但旧文档仍保留不少 Qt5 时代痕迹。
- **长期启发**：它不是 Electron 杀手，更像一条提醒：桌面 UI 可以共享业务语言，不一定共享浏览器内核。

## 学到什么

1. **跨平台不等于 Web 化**：NodeGui 证明 JS 也能驱动原生控件，关键是绑定层把调用翻译给 Qt。
2. **少带 Chromium 有代价**：内存更轻，但你要接受 Qt 安装、原生构建和 API 覆盖不完整。
3. **CSS-like 只是入口**：真正排查样式问题时，要回到 Qt Style Sheet、objectName、pseudo state 和 qproperty。
4. **桌面工具最重要的是边界清楚**：UI 层收集输入，Node 层处理文件和网络，耗时任务要避免阻塞界面。

## 延伸阅读

- 官方仓库：[nodegui/nodegui](https://github.com/nodegui/nodegui)
- 官方文档：[NodeGui 首页](https://docs.nodegui.org/)
- 入门教程：[Getting started](https://docs.nodegui.org/docs/guides/getting-started)
- 样式说明：[Styling](https://docs.nodegui.org/docs/guides/styling)
- 布局说明：[Layout](https://docs.nodegui.org/docs/guides/layout)
- 示例仓库：[nodegui/examples](https://github.com/nodegui/examples)

## 关联

- [[node-js]] —— NodeGui 的业务逻辑仍然运行在 Node.js 世界里。
- [[react-native]] —— 同样把声明式和 Flex 思路映射到原生控件，但目标平台不同。
- [[flutter]] —— 另一条跨平台 UI 路线，选择自绘而不是直接包 Qt widget。
- [[handbrake]] —— 同样体现“核心逻辑 + 原生 GUI”的桌面工具分层。
- [[vscode]] —— Electron 桌面应用代表，方便对比 webview 路线的体积和生态。
- [[marktext]] —— 桌面 Markdown 工具，对比可看清 Web 技术栈和原生控件路线差异。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
