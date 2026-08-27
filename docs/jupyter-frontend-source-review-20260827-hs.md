# Jupyter frontend source review (writer HS)

> 用途：记录 JupyterLab、Jupyter Notebook 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：HS
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未启动 Jupyter Server，未运行上游 test、Galata、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## JupyterLab

- canonical source：`https://github.com/jupyterlab/jupyterlab`
- revision：`e7255a9334c12ad8f9cb15db27584215fab5ece2`
- package：Python `jupyterlab==4.6.3`（源码 tag `v4.6.3`）；`@jupyterlab/application@4.6.3`
- inspected：
  - `jupyterlab/_version.py`
  - `jupyterlab/__init__.py`
  - `jupyterlab/labapp.py`（`LabApp` 模式、aliases、subcommands、`default_url`）
  - `jupyterlab/labextensions.py`（list / disable / enable；`build` deprecated）
  - `jupyterlab/federated_labextensions.py`
  - `packages/application/package.json`
  - `packages/application/src/lab.ts`
  - `packages/application/src/frontend.ts`
  - `packages/application/src/shell.ts`（`ILabShell.Area`、`add`、`mode`）
  - `packages/application/src/layoutrestorer.ts`
  - `packages/workspaces/src/model.ts`
  - `packages/services/package.json`
- observed：
  - annotated tag `v4.6.3` peels to `e7255a9334c12ad8f9cb15db27584215fab5ece2`; Python `VersionInfo(4, 6, 3, "final", 0)` matches `@jupyterlab/application` `4.6.3`;
  - `LabApp` is a `LabServerApp` with `default_url=/lab`, `load_other_extensions=True`;
  - `--notebook-dir` aliases `ServerApp.root_dir`; `--core-mode` disables third-party extensions; `--dev-mode` uses unpublished `dev_mode` assets;
  - `JupyterLab` extends `JupyterFrontEnd` / Lumino `Application`, default shell `LabShell`, default `ServiceManager` with standby;
  - deferred plugins activate only after `shell.restored`;
  - shell areas are `main|header|top|menu|left|right|bottom|down`; user layout is stored per `multiple-document` and `single-document`;
  - layout restorer fetches `layout-restorer:data` and restores after app `started`;
  - workspace CLI is `jupyter lab workspaces {export,import,list}`;
  - npm `@jupyterlab/application@4.6.3` has no `gitHead`; this review binds the reachable GitHub tag peel.
- provenance split：
  - GitHub release `v4.6.3` publish commit lists many per-package tarball hashes;
  - this page does not bind those npm tarball trees, only the source tag peel.

## Jupyter Notebook

- canonical source：`https://github.com/jupyter/notebook`
- revision：`ffc52152951a52ef4885f12521d7a5f8ebd2f9c1`
- package：Python `notebook==7.6.2`（源码 tag `v7.6.2`）；`@jupyter-notebook/application@7.6.2`
- inspected：
  - `README.md`
  - `notebook/_version.py`
  - `notebook/__init__.py`
  - `notebook/app.py`（`JupyterNotebookApp`、handlers、`default_url`）
  - `packages/application/package.json`
  - `packages/application/src/app.ts`
  - `packages/application/src/shell.ts`
  - `packages/application-extension/src/index.ts`（`application:open-lab` / `open-tree`）
  - root `package.json` resolutions / `@jupyterlab/buildutils ~4.6.3`
- observed：
  - annotated tag `v7.6.2` peels to `ffc52152951a52ef4885f12521d7a5f8ebd2f9c1`; Python and application package versions match;
  - `@jupyter-notebook/application` depends on `@jupyterlab/application ~4.6.3`;
  - `JupyterNotebookApp` is a `LabServerApp` with `default_url=/tree` and JupyterLab command helpers for app/settings/workspaces dirs;
  - handlers split `/tree`, `/notebooks`, `/edit`, `/consoles`, `/terminals`; directory/notebook paths redirect across tree and notebooks;
  - `NotebookApp` extends `JupyterFrontEnd` with `NotebookShell`, not `LabShell`;
  - `NotebookShell` areas are `main|top|menu|left|right|down`; main is a single `Panel`; side panels start hidden;
  - `application:open-lab` opens `/lab` in a new window;
  - README states Classic v6 extensions are incompatible with v7;
  - npm `@jupyter-notebook/application@7.6.2` has no `gitHead`; this review binds the reachable GitHub tag peel.
