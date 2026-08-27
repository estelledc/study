# Altair + Bokeh source review (writer FO)

> 用途：记录 `altair` 与 `bokeh` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fo` 标记 2026-08-27 平行 writer FO，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub annotated-tag peel、PyPI 版本号对照、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未渲染 Vega-Lite / BokehJS，未启动 Bokeh Server，未跑上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`（gitignored），blob-filtered + sparse 浅克隆，不进入 Git
- slugs：`altair`、`bokeh`

## Altair

- canonical source：`https://github.com/vega/altair`
- tag：`v6.2.2`（annotated；tag object `317b0b44d8d191fd3354ca0a6e92193f5be0169c`）
- revision：`a9765713566095349cb1cfbbe85d6ad258c84245`
- package：`altair`，Hatch + versioningit 动态版本；PyPI latest `6.2.2`（2026-06-23）
- license：BSD-3-Clause（`LICENSE`）
- requires-python：`>=3.10`
- hard dependencies：`jinja2`、`jsonschema>=3.0`、`packaging`、`narwhals>=2.4.0`（`typing_extensions` 仅 Python < 3.15）；`pandas` 在 `all` extra，不是硬依赖
- inspected：
  - `pyproject.toml`
  - `altair/__init__.py`
  - `altair/vegalite/v6/__init__.py`
  - `altair/vegalite/v6/api.py`
  - `altair/vegalite/v6/data.py`
  - `altair/vegalite/v6/display.py`
  - `altair/vegalite/v6/schema/__init__.py`
  - `altair/vegalite/v6/schema/channels.py`（`_EncodingMixin.encode`）
  - `altair/utils/core.py`（`parse_shorthand`）
  - `altair/utils/data.py`（`MaxRowsError` / `limit_rows`）
  - `altair/utils/save.py`
  - `altair/utils/html.py`
  - `tests/vegalite/v6/test_data.py`
- observed：
  - 公开 API 从 `altair.vegalite.v6` 再导出；`SCHEMA_VERSION = "v6.4.1"`，`VEGALITE_VERSION` 去 `v` 前缀，`VEGA_VERSION = "6"`，`VEGAEMBED_VERSION = "7"`，MIME `application/vnd.vegalite.v6.json`；
  - `Chart` 继承 `TopLevelMixin` + `_EncodingMixin` + `MarkMethodMixin` + `TopLevelUnitSpec`；`mark_*` / `encode` / `transform_*` 只改 Python 对象，不画图；
  - `encode()` 深拷贝已有 `encoding` 再 `dict.update`：后续调用合并通道，同名通道被后写覆盖；
  - `parse_shorthand("name")` 只有 `field`；带 DataFrame 才推断 type；`:N/:O/:Q/:T` 映射 nominal / ordinal / quantitative / temporal；
  - `interactive()` 调用 `add_params(selection_interval(..., bind="scales", encodings=["x","y"]))`；`add_selection` 自 5.0.0 起弃用；
  - `+` → `layer`，`&` → `vconcat`，`|` → `hconcat`（已是 `ConcatChart` 时走 `concat`）；
  - 默认 data transformer `max_rows=5000`；超限抛 `MaxRowsError`，错误文案推荐 `alt.data_transformers.enable("vegafusion")`；已注册 `default` / `json` / `csv` / `vegafusion`；
  - `save()` 支持 `html` / `png` / `svg` / `pdf` / `json` / `vega`；非 vegafusion 路径会临时切回 default 并 `disable_max_rows`；HTML 默认模板从 `cdn.jsdelivr.net/npm` 拉 Vega 运行时，`inline=True` 才内嵌。
- provenance note：
  - GitHub latest release 与 PyPI `altair==6.2.2` 同号；
  - annotated tag peel 到 commit `a9765713...`（"fix: Include layered concat views in selection params (#4069)"）；
  - 本审查绑定该 tag 提交，不绑定 weekly 标签。

## Bokeh

- canonical source：`https://github.com/bokeh/bokeh`
- tag：`3.10.0`（annotated；tag object `ec5a0faac97acf5339698fcee5845fa1d2afd7cf`）
- revision：`c215fd3105bf6a52aed95beb92db9eaf22c90523`
- package：`bokeh`，setuptools-git-versioning 动态版本；PyPI latest `3.10.0`（2026-08-18）
- license：BSD-3-Clause
- requires-python：`>=3.12`
- hard dependencies：`jinja2>=2.9`、`narwhals>=1.13`、`numpy>=1.16`、`packaging>=16.8`、`pillow>=7.1.0`、`pyyaml>=3.10`、`tornado>=6.2`（非 emscripten）、`xyzservices>=2021.09.1`
- also observed：`4.0.0.dev2` → `3cb7e5b665e94fe9a9027f486631435fa4e6a2cf`（prerelease，未绑定）；默认分支 `branch-4.0`
- inspected：
  - `pyproject.toml`
  - `src/bokeh/__init__.py`
  - `src/bokeh/plotting/_figure.py`
  - `src/bokeh/plotting/glyph_api.py`
  - `src/bokeh/models/sources.py`
  - `src/bokeh/models/plots.py`
  - `src/bokeh/model/model.py`
  - `src/bokeh/io/showing.py`
  - `src/bokeh/io/output.py`
  - `src/bokeh/io/state.py`
  - `src/bokeh/io/doc.py`
  - `src/bokeh/command/subcommands/serve.py`
  - `src/bokeh/server/tornado.py`
  - `src/bokeh/server/server.py`
  - `src/bokeh/resources.py`
  - `src/bokeh/settings.py`
  - `src/bokeh/core/property/wrappers.py`
- observed：
  - `figure` 是 `Plot` + `GlyphAPI`；未指定 tools 时用 `DEFAULT_TOOLS = "pan,wheel_zoom,auto_box_zoom,save,reset,help"`；
  - `circle()` 仍在：带 `size` 时自 3.4.0 起弃用并转 `scatter`；否则走 `Circle` glyph（`radius`）；`scatter` 默认 `marker="circle"`；
  - `ColumnDataSource` 假设列等长；构造时不等长走 `BokehUserWarning`，`.length` 在多长度时抛 `RuntimeError`；`stream()` 要求补齐全部已有列且本次追加等长，`rollover` 从列头截断；
  - `output_file` 与 `output_notebook` 互相不清除：可同时激活；`show()` 先走 notebook hook，再在 `state.file` 存在或尚未展示时写 HTML；`output_file` 默认 Resources mode `cdn`；
  - `bokeh serve` 默认端口 `5006`（`BOKEH_DEFAULT_SERVER_PORT`）；进程是 Tornado `BokehTornado`；`curdoc().add_root` 把模型树挂进 Document；
  - `Model` 经 `Serializer` / `ObjectRefRep` 序列化；`on_change` 是 Python 属性回调，`js_on_change` 是前端回调；
  - `Plot.output_backend` 默认 `"canvas"`；样本数据已拆到可选包 `bokeh_sampledata`。
- provenance note：
  - GitHub 无 Releases 列表条目，但 annotated tag `3.10.0` 与 PyPI `bokeh==3.10.0` 同日（2026-08-18）；
  - peel 到 commit `c215fd31...`（"Deployment updates for release 3.10.0"）；
  - 本审查绑定该稳定 tag，不绑定 `4.0.0.dev*`。
