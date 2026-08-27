---
title: Jupyter Notebook — 用 JupyterLab 组件做成的文档中心前端
description: 介绍 Notebook 如何把 Jupyter Server 路由和 NotebookShell 收成一次只开一份文档的界面
来源: https://github.com/jupyter/notebook
日期: 2026-08-27
分类: editors
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/jupyter/notebook
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ffc52152951a52ef4885f12521d7a5f8ebd2f9c1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.6.2
---

## 是什么

Jupyter Notebook 7 是文档中心的浏览器笔记本：一次主要摊开一份 `.ipynb`、一个终端或一个目录树，而不是 [[jupyterlab]] 那样的多面板 IDE。日常类比：JupyterLab 是一张能拆格子的书桌；Notebook 7 更像“一页纸一个浏览器标签”。

固定 7.6.2 的 Python `__version__` 与 `@jupyter-notebook/application` 同为 `7.6.2`。仓库 README 写明：前端基于 JupyterLab 组件，Python 服务基于 Jupyter Server。`@jupyter-notebook/application` 依赖 `@jupyterlab/application ~4.6.3`，与本批绑定的 JupyterLab 4.6.3 对齐。

```bash
pip install notebook
jupyter notebook
```

`JupyterNotebookApp` 把 `/` 默认重定向到 `/tree`。你看到的不是 Classic Notebook v6 的旧前端，而是一个复用 JupyterLab 插件、却换了 `NotebookShell` 的应用。

## 为什么重要

不理解 v7 这条“Lab 组件 + 自己的壳 + 分页面路由”，就解释不了：

- 为什么 v6 / v5 的 Classic 前端扩展不能直接装进 v7
- 为什么同一套 JupyterLab 插件能出现在 Notebook 里，却摆不成多文档 dock
- 为什么打开目录走 `/tree`、打开笔记本走 `/notebooks`、打开普通文件走 `/edit`
- 为什么菜单里“Open JupyterLab”只是 `window.open(.../lab)`，并没有在本页变成 LabShell

## 核心要点

固定 7.6.2 的主链可以拆成五步：

1. **Python 应用是 Jupyter Server 扩展**。`notebook/__init__.py` 登记 `JupyterNotebookApp`。它混入 `NotebookConfigShimMixin`，继承 `LabServerApp`，`name = "notebook"`，`load_other_extensions = True`，并复用 `jupyterlab.commands` 的 app / settings / workspaces 目录。

2. **URL 按资源类型分页面**。`initialize_handlers` 挂上 `/tree(.*)`、`/notebooks(.*)`、`/edit(.*)`、`/consoles/(.*)`、`/terminals/(.*)`。`TreeHandler`：目录渲染 `tree.html`；笔记本 302 到 `/notebooks/...`；其他文件 302 到 `/files/...`。`NotebookHandler` 若发现路径是目录，则 302 回 `/tree`。

3. **浏览器应用是 `NotebookApp`，不是 `JupyterLab`**。它同样继承 `JupyterFrontEnd`，默认壳是 `NotebookShell`。名称写死 `'Jupyter Notebook'`。它会复制一份 `JupyterLab.IInfo`（mime 扩展、disabled/deferred 等），并给 `docRegistry` 挂 `Base64ModelFactory`。

4. **`NotebookShell` 是单主栏布局**。区域只有 `main` / `top` / `menu` / `left` / `right` / `down`，没有 Lab 的 `header` / `bottom`。`_main` 是普通 `Panel`，不是 dock。左右侧栏默认 `hide()`。窗口宽度 `max-width: 760px` 时 `format` 切到 `mobile`。

5. **页面之间用新标签跳，而不是在同一壳里拆格**。`application:open-lab` 打开 `baseUrl + 'lab'`；不在 tree 页时，`application:open-tree` 打开 `baseUrl + 'tree'`。路径打开器默认也是新标签。这就是“文档中心”：一份文档一个前端实例。

## 实践案例

### 案例 1：启动后先落到目录树

```bash
cd ~/work/titanic-analysis
jupyter notebook
# 浏览器默认进 /tree
```

`default_url = Unicode("/tree")`，`file_url_prefix = "/tree"`。目录页由 `TreeHandler` 写出 `tree.html`，并设置 `page_config["treePath"]`。这不是 Classic v6 的 dashboard，而是 Notebook 7 的 tree 前端。

### 案例 2：同一路径在 tree 与 notebook 之间对跳

目录 `notes/` 访问 `/notebooks/notes` 会被 `NotebookHandler` 重定向到 `/tree/notes`。文件 `notes/intro.ipynb` 访问 `/tree/notes/intro.ipynb` 会被 `TreeHandler` 重定向到 `/notebooks/notes/intro.ipynb`。普通文件则去 `/files/...`，编辑页走 `/edit`。

### 案例 3：从 Notebook 打开 JupyterLab

Notebook 应用插件 `@jupyter-notebook/application-extension:pages` 注册：

```ts
app.commands.addCommand('application:open-lab', {
  execute: () => {
    window.open(URLExt.join(baseUrl, 'lab'));
  }
});
```

它假定同进程还挂着 JupyterLab 的 `/lab`。`notebook` 包同时声明 `_jupyter_labextension_paths`，把 `@jupyter-notebook/lab-extension` 贡献给 Lab。本轮未启动服务器，未验证两边是否同时可点。

## 踩过的坑

1. **把 v7 当成“换皮的 Classic v6”**：README 明确 v5/v6 扩展不兼容 v7；v6 维护线在 `6.5.x`，资产改由 `nbclassic` 提供。
2. **以为 `NotebookApp` 就是 `JupyterLab` 换名**：壳、区域和“一份文档一个标签”都不同；若干插件还 `throw`，要求 `app instanceof NotebookApp`。
3. **关掉浏览器标签就当 kernel 停了**：kernel / contents 在 Jupyter Server，不在这个前端仓。本仓只决定页面和壳，不实现 kernel。
4. **在 Notebook 页找 Lab 的多文档 dock**：`NotebookShell._main` 是单 `Panel`，没有 `LabShell` 那套 `multiple-document` dock。
5. **把 Qt Console / `%connect_info` 写进本仓合同**：固定 7.6.2 树里没有这条前端实现；那是别的 Jupyter 组件。

## 适用 vs 不适用场景

**适用**：

- 教学或探索时一次只看一份 `.ipynb`，希望界面比 JupyterLab 轻
- 已经会用 JupyterLab 插件，但想保留文档中心 URL（`/notebooks`、`/tree`）
- 需要从 Notebook 跳到同站点 `/lab`，而不是再装一套无关前端

**不适用**：

- 要把终端、文件树、多个 Notebook 并排——用 [[jupyterlab]]
- 要消除隐藏状态、把笔记本当 `.py`——用 [[marimo]] 或 [[pluto-jl]]
- 还在依赖 Classic v6 前端扩展——应留在 `nbclassic` / 6.5.x，而不是假装 v7 能加载它们
- 需要本页证明 kernel 执行、trust 或 nbconvert——那些不在本仓固定树里

## 固定版本边界

- 本文绑定 `jupyter/notebook@ffc52152951a52ef4885f12521d7a5f8ebd2f9c1`，即 annotated tag `v7.6.2` 剥皮提交。
- `notebook/_version.py` 为 `7.6.2`；`@jupyter-notebook/application` 为 `7.6.2`，依赖 `@jupyterlab/application ~4.6.3`。
- 根 `package.json` 是私有 `@jupyter-notebook/root@0.1.0`；发布身份以 Python / 工作区包版本为准。
- npm `@jupyter-notebook/application@7.6.2` 无 `gitHead`；本页绑 GitHub tag 剥皮提交。
- `page_config` 仍带默认 MathJax 2.7.7 CDN，源码标了 `TODO Remove CDN usage`。
- 本文未安装 `notebook`、未启动 Jupyter Server、未执行 cell、未测 Classic 兼容，状态保持 `UNVERIFIED`。

## 学到什么

1. **Notebook 7 的产品合同是“文档中心页面”**，不是“缩小版 JupyterLab”。
2. **路由比 widget 更先决定你看见什么**：tree / notebooks / edit / consoles / terminals 是不同 HTML 入口。
3. **壳决定扩展能摆在哪**：同样的 JupyterLab 插件，进 `NotebookShell` 就没有多文档 dock。
4. **kernel 不在这个前端仓**：状态混乱要问 Jupyter Server / kernel，不能只重启浏览器标签。

## 应用型自测

1. `new NotebookApp()` 默认壳是 `LabShell` 吗？
2. 对目录路径发 GET `/notebooks/notes`，服务端会渲染笔记本页吗？
3. `application:open-lab` 会把当前页的壳换成 `LabShell` 吗？

检查点：

1. 不是。构造函数默认 `new NotebookShell()`。
2. 不会。`NotebookHandler` 发现目录就 302 到 `/tree/notes`。
3. 不会。它 `window.open(baseUrl + 'lab')`，另开 JupyterLab 页。

## 延伸阅读

- 固定源码：[jupyter/notebook](https://github.com/jupyter/notebook) —— 本文绑定提交 `ffc52152951a52ef4885f12521d7a5f8ebd2f9c1`
- 路由：[notebook/app.py](https://github.com/jupyter/notebook/blob/v7.6.2/notebook/app.py) 的 `TreeHandler` / `NotebookHandler`
- 壳：[packages/application/src/shell.ts](https://github.com/jupyter/notebook/blob/v7.6.2/packages/application/src/shell.ts)
- [[jupyterlab]] —— 提供 4.6.3 组件，并给出多区域对照
- [[voila]] —— 消费 `.ipynb` 但隐藏编辑界面
- [[streamlit]] —— 用脚本重跑，而不是 notebook 页

## 关联

- [[jupyterlab]] —— 同一 4.6.3 组件线上的多面板对照
- [[voila]] —— 把 `.ipynb` 发布成只读输出页
- [[streamlit]] —— 脚本型数据应用，不共用 Notebook 7 的壳
- [[marimo]] —— 反应式 `.py` 笔记本
- [[pluto-jl]] —— Julia 反应式对照
- [[codemirror]] —— v7 编辑体验依赖的 JupyterLab 编辑器栈
- [[observable-framework]] —— 另一种“文档 + 代码 + 输出”
- [[pandas]] —— Notebook 里最常见的表格搭档
- [[matplotlib]] —— 常见的 inline 图形输出

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[altair]] —— Altair — Python 上的 Vega-Lite 绑定
- [[holoviews]] —— HoloViews — 一份声明 ⇄ 多后端自动绘图
- [[jupyterlab]] —— JupyterLab — 下一代 Jupyter IDE
- [[marimo]] —— marimo — 反应式 Python 笔记本
- [[observable-framework]] —— Observable Framework — 编译期跑数据，浏览器只看结果
- [[pluto-jl]] —— Pluto.jl — Julia 反应式笔记本
- [[streamlit]] —— Streamlit — Python 几行写 Web 应用
- [[voila]] —— Voilà — 把 Jupyter Notebook 变成只显示输出的网页
- [[zeppelin]] —— Apache Zeppelin — JVM 多语言笔记本
