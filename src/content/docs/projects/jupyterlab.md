---
title: JupyterLab — 下一代 Jupyter IDE
来源: 'https://github.com/jupyterlab/jupyterlab'
日期: 2026-07-08
分类: editors
难度: 初级
---

## 是什么

JupyterLab 是 Project Jupyter 的下一代工作台：它把 Notebook、终端、文本编辑器、文件浏览器和图表输出放进同一个浏览器界面里。

日常类比：经典 Notebook 像一本活页实验本；JupyterLab 像一张带抽屉的大书桌，左边放文件，中间写代码，右边看目录，下方开终端。

最小例子不是一段库 API，而是启动一个工作台：

```bash
pip install jupyterlab
jupyter lab
```

浏览器打开以后，你看到的不是单个 `.ipynb` 页面，而是一个可以拖动标签页、拆分面板、打开终端的 IDE。它仍然服务于交互式计算，只是把"写一页 Notebook"升级成"管理一整个数据分析现场"。

## 为什么重要

不理解 JupyterLab，下面这些日常场景会一直绕远路：

- Notebook、终端、Markdown、数据文件分散在多个窗口里，切来切去容易跑错目录
- 想把 Notebook、CSV 预览、终端日志并排看，经典 Notebook 很难自然摆出来
- 团队想复用同一套工作区布局，只发一个文件路径还不够，还要保存打开了哪些面板
- 想给数据科学环境加调试器、目录树、语言服务或自定义查看器时，普通 Notebook 插件模型不够像 IDE

它的重要性不在"能跑 Python"，而在"把实验过程周围的工具也组织起来"。对新手来说，这会少掉很多"我刚才在哪个目录跑的"和"这个终端属于哪个项目"的混乱。

## 核心要点

1. **多面板工作区**：JupyterLab 的主区域是可拆分的标签页面板，像把桌面分成多个格子。Notebook 可以和终端、文本文件、图表预览并排，读数据、改代码、看输出不需要来回切页。

2. **工作区会记住状态**：每个 JupyterLab 会话都属于一个 workspace，里面记录打开的文件、标签位置、侧边栏状态。类比：书桌不只是桌子，还会记住你昨天把哪本书摊在哪个角落。

3. **扩展是一等公民**：JupyterLab 本身就是一组扩展拼出来的，第三方扩展可以加菜单、命令、快捷键、文件查看器和设置项。类比：浏览器靠插件长出广告拦截器，JupyterLab 靠扩展长出调试器、目录树和语言服务。

这三个点合在一起，JupyterLab 的定位就清楚了：它不是"更漂亮的 Notebook"，而是面向交互式计算的浏览器 IDE。

## 实践案例

### 案例 1：从正确目录启动一个项目工作台

```bash
cd ~/work/titanic-analysis
jupyter lab --notebook-dir="$PWD" --preferred-dir "$PWD/notebooks"
```

逐部分解释：

- `--notebook-dir` 决定服务器能看到的根目录，别从系统根目录启动，官方文档也提醒这样会增加误改系统文件的风险
- `--preferred-dir` 决定文件浏览器默认先打开哪里，适合把入口放到 `notebooks/`
- 进入界面后，同一个浏览器标签里可以打开 Notebook、`README.md`、CSV 和终端

这个案例解决的是"新手最容易乱的当前目录"问题。JupyterLab 不是替你管理项目结构，但它把文件浏览器和运行环境绑在同一个根目录下，少犯很多路径错误。

### 案例 2：保存并迁移一个工作区布局

```bash
# 导出名为 research 的工作区
jupyter lab workspaces export research > research.json

# 在另一台机器或同一环境里导入
jupyter lab workspaces import research.json
```

逐部分解释：

- `workspaces export research` 会把名为 `research` 的布局导出成 JSON
- 这个 JSON 记录的是界面状态，不是你的数据文件本身
- `workspaces import` 会把布局写回 JupyterLab 的 workspace 存储区

这适合两类人：老师给学生准备相同的课堂布局，或者你把"Notebook + 终端 + 结果图"这套分析现场从一台机器搬到另一台机器。

### 案例 3：排查扩展是不是影响了界面

```bash
jupyter labextension list
jupyter labextension disable my-extension
jupyter labextension enable my-extension
```

逐部分解释：

- `list` 先看当前装了哪些扩展，避免凭感觉猜
- `disable` 会阻止某个扩展的插件运行，但代码仍然在环境里
- `enable` 可以把误关的扩展开回来

官方文档还提醒，旧式 `jupyter labextension install` 安装 source extension 已经不推荐，因为通常要 Node.js 和 rebuild。日常使用优先选 PyPI / conda 分发的 prebuilt extension，排查时再用 `labextension` 管理开关。

## 踩过的坑

1. **`jupyter` 命令找不到**：常见原因是 `pip install --user` 后用户级 `bin` 目录没进 `PATH`，所以 shell 找不到启动器。

2. **从 `/` 或系统盘根目录启动**：JupyterLab 会把这个目录暴露给文件浏览器，新手容易误删或误改不该碰的文件。

3. **用浏览器自带搜索找 Notebook 内容**：Notebook 默认会做窗口化渲染，浏览器不一定能看到完整文档内容，应该优先用 JupyterLab 内置搜索。

4. **把扩展当成普通网页插件乱装**：source extension 往往需要 Node.js 和重新构建 JupyterLab，版本不配时会把启动和前端资源搞复杂。

## 适用 vs 不适用场景

**适用**：

- 数据分析、机器学习实验、教学演示，需要 Notebook 和终端频繁配合
- 想把多个文件、图表、终端并排看，而不是一次只看一个 Notebook
- 团队要保存或分享工作区布局，例如课程、实验室模板、JupyterHub 环境
- 需要扩展能力，比如调试器、语言服务、特殊文件预览器或主题

**不适用**：

- 只想快速跑一个 `.py` 脚本，命令行或轻量编辑器更直接
- 大型软件工程项目需要完整重构、复杂 Git 视图和多语言 IDE 能力，VS Code / JetBrains 更成熟
- 生产服务部署，不应该把 JupyterLab 当 Web 后台或长期运行任务管理器
- 机器内存很小、浏览器很卡时，多面板 UI 反而比经典 Notebook 重

## 历史小故事（可跳过）

- **2014 年前后**：Jupyter 从 IPython Notebook 的经验里长出来，目标是让多语言交互式计算成为开放项目。
- **2018 年左右**：JupyterLab 逐渐成为下一代前端，把 Notebook、终端、编辑器和文件浏览器放进同一个可扩展界面。
- **JupyterLab 3**：prebuilt extension 模型让很多扩展不再需要用户本地 rebuild，安装体验明显变轻。
- **2024 年 5 月 15 日**：JupyterLab 3 结束维护期，官方建议仍在 3.x 的用户升级到 JupyterLab 4。
- **现在**：GitHub 仓库约 15k stars，JupyterLab 由开放社区和 Jupyter Frontends Council 维护，定位仍然是交互式计算的主界面。

## 学到什么

1. **Notebook 只是核心文件，不是完整工作流**：真正的分析现场还包括终端、数据文件、说明文档、图表和环境状态。
2. **workspace 是 JupyterLab 的灵魂**：它把"我打开了什么、怎么摆"变成可保存的状态，而不只是 URL。
3. **扩展模型决定生态上限**：JupyterLab 自己也是扩展集合，所以第三方能力能长进菜单、命令和侧边栏。
4. **交互式计算更像实验室，不像单个编辑器**：JupyterLab 的价值就是把实验器材放在一张桌上。

## 延伸阅读

- 官方仓库：[jupyterlab/jupyterlab](https://github.com/jupyterlab/jupyterlab)
- 官方文档：[JupyterLab Documentation](https://jupyterlab.readthedocs.io/en/stable/)
- 入门启动：[Starting JupyterLab](https://jupyterlab.readthedocs.io/en/stable/getting_started/starting.html)
- 工作区文档：[Workspaces](https://jupyterlab.readthedocs.io/en/stable/user/workspaces.html)
- 扩展文档：[Extensions](https://jupyterlab.readthedocs.io/en/stable/user/extensions.html)
- [[jupyter-notebook]] —— 经典 Notebook 是 JupyterLab 要兼容和升级的基础体验

## 关联

- [[jupyter-notebook]] —— JupyterLab 保留 Notebook 的交互式计算核心，但把周边工具变成 IDE
- [[ipython]] —— Jupyter 生态的历史源头，提供交互式 Python 体验
- [[jupyterhub]] —— 多用户服务器常用 JupyterLab 作为前端入口
- [[vscode]] —— 同样提供 Notebook 和多面板 IDE，但重点更偏通用软件工程
- [[python]] —— JupyterLab 最常见的内核语言，新手通常从 Python Notebook 开始
- [[typescript]] —— JupyterLab 前端和扩展开发大量使用 TypeScript

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
