---
title: JupyterLab — 用插件拼出多区域工作台的 Jupyter 前端
description: 介绍 JupyterLab 如何用 Lumino 应用、LabShell 分区和延迟插件组成可恢复的浏览器工作台
来源: https://github.com/jupyterlab/jupyterlab
日期: 2026-08-27
分类: editors
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/jupyterlab/jupyterlab
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e7255a9334c12ad8f9cb15db27584215fab5ece2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.6.3
---

## 是什么

JupyterLab 是 Project Jupyter 的可扩展浏览器工作台。日常类比：经典 Notebook 像一本只摊一页的实验本；JupyterLab 像一张能拆格子的书桌，Notebook、终端、文件树和预览可以并排摆。

固定 4.6.3 里，Python 包 `jupyterlab` 的 `__version__` 与 `@jupyterlab/application` 同为 `4.6.3`。`LabApp` 是挂在 Jupyter Server 上的 `LabServerApp`，默认把 `/` 重定向到 `/lab`。浏览器里真正的应用是 `JupyterLab`：它继承 `JupyterFrontEnd`，再继承 Lumino `Application`，默认壳是 `LabShell`。

```bash
pip install jupyterlab
jupyter lab --notebook-dir="$PWD"
```

`--notebook-dir` 在 `labapp.py` 里别名到 `ServerApp.root_dir`，决定服务器能看见的根目录，不是前端自己的另一套路径。

## 为什么重要

不理解固定 4.6.3 的壳、插件和恢复顺序，下面这些现象会对不上：

- 为什么同一个浏览器标签里能同时开 Notebook、终端和 CSV，而 [[jupyter-notebook]] 默认一次只摊一份文档
- 为什么关掉标签再打开，布局还能回来——恢复靠 `LayoutRestorer`，不是“浏览器记住了标签页”
- 为什么有的扩展装完立刻出现，有的要等 `shell.restored` 之后才激活
- 为什么 `--core-mode` 看起来像“干净的 JupyterLab”，却把第三方扩展关掉

## 核心机制与架构流程

固定源码把一次启动拆成五步：

1. **Python 侧先选出运行模式**。`LabApp` 文档写明三种：`core-mode` 只用 Python 包装里的 JS 资产且禁用第三方扩展；`dev-mode` 走源码仓 `dev_mode`（页面顶上有红条，需要 `pip install -e .`）；默认 app 模式按 `JUPYTERLAB_DIR` / `--app-dir` 组扩展。`load_other_extensions = True`，所以它会带上同进程里其他 server extension。

2. **浏览器里实例化一个 `JupyterLab`**。构造函数默认 `new LabShell()`，并建 `ServiceManager`；`standby` 在 `!info.isConnected` 或页面隐藏时暂停轮询。`docRegistry` 先挂上 `Base64ModelFactory`，再按需注册 mime 渲染插件。

3. **插件是 Lumino `IPlugin`**。每条有 `id`、`autoStart`、`requires` / `optional` / `provides`。`IInfo.disabled` / `deferred` 用模式匹配插件 id。壳恢复后，`activateDeferredPlugins()` 才跑延迟插件；`allPluginsActivated` 要等这些 Promise 都 settle。

4. **`LabShell.add(widget, area)` 按区域分发**。合法区域是 `main` / `header` / `top` / `menu` / `left` / `right` / `bottom` / `down`。`main` 进 dock；`left`/`right` 是侧栏；`down` 是底部标签栈。用户布局按 `multiple-document` 与 `single-document` 两套 `IUserLayout` 分开记。

5. **布局恢复有固定生命周期**。`LayoutRestorer` 先 `fetch` 键 `layout-restorer:data`；各插件在应用 `started` 前登记 tracker；然后命令重建 widget；最后 `shell.restoreLayout`。这一步完成后，`JupyterLab.restored` 才 resolve。工作区文件本身在 `JUPYTERLAB_WORKSPACES_DIR`（默认配置目录下的 `/lab/workspaces`）。

## 实践案例

### 案例 1：从项目根目录启动，并看清三种模式

```bash
cd ~/work/titanic-analysis
jupyter lab --notebook-dir="$PWD"
# 对照：jupyter lab --core-mode
# 源码开发：jupyter lab --dev-mode --watch
```

`--notebook-dir` 只改服务器根。`--core-mode` 不加载第三方扩展；`--dev-mode` 才用未发布的本地 JS 包。`jupyter lab path` 打印 app / user-settings / workspaces 三个目录。

### 案例 2：导出再导入一个 workspace

```bash
jupyter lab workspaces export research > research.json
jupyter lab workspaces import research.json
jupyter lab workspaces list
```

`LabApp.subcommands` 里 `workspace` 与 `workspaces` 指向同一个 `LabWorkspaceApp`，子命令只有 `export` / `import` / `list`。导出的是界面状态，不是数据文件。`WorkspacesModel.create(id)` 会 `save({ metadata: { id }, data: {} })`。

### 案例 3：只开关扩展，不走源码 rebuild

```bash
jupyter labextension list
jupyter labextension disable my-extension
jupyter labextension enable my-extension
```

`labextensions.py` 仍提供 list / disable / enable / lock。`jupyter labextension build` 已标 deprecated，改走 `jupyter-builder build`。日常优先装 PyPI 分发的 prebuilt（federated）扩展；source extension 仍要进 app 目录再 `jupyter lab build`。

## 踩过的坑

1. **把 `--notebook-dir` 当成前端“当前文件夹”**：它是 `ServerApp.root_dir`。从 `/` 启动会把整个文件系统暴露给文件浏览器。
2. **以为 `registerPlugin` 立刻等于界面出现**：`deferred` 匹配到的插件要等 `shell.restored` 之后才 `activatePlugin`。
3. **把 `single-document` 理解成另一个应用**：它只是 `LabShell.mode` 切到 dock 的单文档布局，用户布局键仍在同一套 shell 里。
4. **`--collaborative` 还当开关用**：`LabApp` 写明它已 deprecated，真正协作要另装 `jupyter_collaboration`，该旗标计划在 v5 删掉。
5. **把构建体积或启动耗时写进结论**：固定源码提到 Rspack minify 与低内存构建，本轮未安装依赖、未 `jupyter lab build`、未测性能。

## 适用 vs 不适用场景

**适用**：

- 需要把 Notebook、终端、文件和预览放在同一浏览器工作台
- 要用 JupyterLab 插件模型加调试器、语言服务或自定义查看器
- 课程或实验室需要导出/导入 workspace 布局
- 能接受 Jupyter Server + 浏览器作为交互式计算入口

**不适用**：

- 只要一份 `.ipynb` 的文档中心体验——[[jupyter-notebook]] 的 `NotebookShell` 更贴
- 需要反应式、文件即 `.py` 的笔记本——看 [[marimo]]
- 大型软件工程要完整 Git / 重构工作流——[[vscode]] 更成熟
- 不能接受“静态阅读前端源码 ≠ 已跑通 kernel / 扩展安装”

## 固定版本边界

- 本文绑定 `jupyterlab/jupyterlab@e7255a9334c12ad8f9cb15db27584215fab5ece2`，即 annotated tag `v4.6.3` 剥皮提交。
- Python `jupyterlab/_version.py` 为 `VersionInfo(4, 6, 3, "final", 0)`；`@jupyterlab/application` / `@jupyterlab/workspaces` 为 `4.6.3`，`@jupyterlab/services` 为 `7.6.3`。
- npm 上 `@jupyterlab/application@4.6.3` 无 `gitHead`；本页绑的是 GitHub tag 剥皮提交，不是 npm 发布树。
- `LabApp` 默认 `extension_manager = "pypi"`；`readonly` 只能看不能装。
- 本文未安装 JupyterLab、未启动 Tornado、未跑 Galata / 上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **JupyterLab 是“Lumino 应用 + 分区壳 + 插件图”**，不是更漂亮的单页 Notebook。
2. **恢复顺序是合同**：先 fetch 布局，再让插件登记，最后 `restored`。
3. **core / dev / app 三种模式决定扩展从哪来**，不是同一套静态文件换皮肤。
4. **workspace 存的是壳状态**，不替你版本化数据或 kernel。

## 应用型自测

1. `JupyterLab` 构造之后、`shell.restored` 完成之前，`deferred` 插件会不会已经被 `activatePlugin`？
2. `shell.add(widget, 'header')` 会把 widget 放进主 dock 吗？
3. `jupyter lab --core-mode` 会加载第三方 federated 扩展吗？

检查点：

1. 不会。`lab.ts` 在 `this.shell.restored.then(...)` 里才调用 `activateDeferredPlugins()`。
2. 不会。`header` 走 `_addToHeaderArea`；主 dock 只接 `main`。
3. 不会。`LabApp` 写明 core mode 禁用第三方扩展，只用 Python 包内 JS 资产。

## 延伸阅读

- 固定源码：[jupyterlab/jupyterlab](https://github.com/jupyterlab/jupyterlab) —— 本文绑定提交 `e7255a9334c12ad8f9cb15db27584215fab5ece2`
- 启动与模式：[labapp.py](https://github.com/jupyterlab/jupyterlab/blob/v4.6.3/jupyterlab/labapp.py) 中 `LabApp` 文档字符串
- 壳分区：[packages/application/src/shell.ts](https://github.com/jupyterlab/jupyterlab/blob/v4.6.3/packages/application/src/shell.ts) 的 `ILabShell.Area`
- [[jupyter-notebook]] —— 同一 JupyterLab 包版本上的文档中心壳

## 关联

- [[jupyter-notebook]] —— 复用 `@jupyterlab/application ~4.6.3`，但壳是单文档 `NotebookShell`
- [[vscode]] —— 同样是多面板 IDE，但不是 Jupyter 插件图
- [[marimo]] —— 反应式 `.py` 笔记本，不走 JupyterLab 壳
- [[zeppelin]] —— JVM 数据平台笔记本，不是 Lumino 前端
- [[codemirror]] —— JupyterLab 编辑器栈里常见的编辑器内核

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[marimo]] —— marimo — 反应式 Python 笔记本
- [[zeppelin]] —— Apache Zeppelin — JVM 多语言笔记本
