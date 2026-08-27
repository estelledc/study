# CLI banner source review (writer EU)

> 用途：记录 `figlet` 与 `gradient-string` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-eu` 标记 2026-08-27 平行 writer EU，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL EU
- evidence：GitHub metadata、npm provenance 与固定提交静态源码 / 测试阅读
- not executed：未安装两仓依赖，未运行 figlet CLI / vitest，未向终端打印，未测颜色级、宽度或性能
- worktrees：本机 `research-worktrees/figlet` 与 `research-worktrees/gradient-string`（gitignored），不进入 Git
- slugs：`figlet`（npm / 笔记同名；canonical 仓是 `patorjk/figlet.js`）、`gradient-string`

## figlet

- canonical source：`https://github.com/patorjk/figlet.js`
- tag：`v1.11.4`
- revision：`b95c2f03ccbc7e2a23e9fd030e8378c2d3b9dd0e`
- package：`figlet@1.11.4`（MIT）
- npm gitHead：与 revision / tag 一致
- engines：`node >= 17.0.0`；`"type": "module"`
- also observed：默认分支 `main` 在该 tag 上；未绑定后继提交
- inspected：
  - `package.json`
  - `src/figlet.ts`
  - `src/node-figlet.ts`
  - `src/figlet-types.ts`
  - `src/renamed-fonts.js`
  - `bin/index.js`
  - `README.md`
  - `test/figlet.test.ts`（只读，未跑）
- observed：
  - 核心模块是浏览器 FIGdriver：`loadFont` 默认 `fetch(\`${fontPath}/${name}.flf\`)`，`fetchFontIfMissing` 默认 true，`fontPath` 默认 `./fonts`，`textSync` 在字体未入缓存时抛错；
  - Node 入口覆盖 `loadFont` / `loadFontSync` / `fonts` 为 `fs` 读 `../fonts/`；`fonts()` 扫 `.flf`，浏览器 `fonts()` 返回静态 `fontList`；
  - `parseFont` 读 `flf2a` 头：hardBlank、height、baseline、maxLength、oldLayout、numCommentLines、printDirection、fullLayout；必含码位 32–126 与 196/214/220/228/246/252/223；附加码禁止 `-1`，范围 `[-2147483648, 2147483647]`；
  - 生成链：`generateFigTextLines` 按 `charCode` 取字形 → 水平 smush → 多行再 `smushVerticalFigLines`；`LAYOUT` 为 FULL_WIDTH=0 / FITTING=1 / SMUSHING=2 / CONTROLLED_SMUSHING=3；
  - `text()` 是 Promise，字符串参数当字体名；默认字体 `Standard`；`printDirection === 1` 先反转输入；hardblank 默认替换为空格；库默认 `width: -1`（不换行）；
  - CLI（commander）默认字体 `Standard`、宽度 `80`，先 `loadFont` 再 `textSync`；
  - 唯一切字体重映射：`ANSI-Compact` → `ANSI Compact`。

## gradient-string

- canonical source：`https://github.com/bokub/gradient-string`
- tag：`3.0.0`
- revision：`ca0c941216029e6a36d76a0cbebc0dca50355f54`
- package：`gradient-string@3.0.0`（MIT）
- npm gitHead：与 revision / tag 一致
- engines：`node >= 14`；`"type": "module"`
- dependencies：`chalk@^5.3.0`、`tinygradient@^1.1.5`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/index.spec.ts`
  - `README.md`
  - `examples/demo.js`
- observed：
  - 推荐入口是 `gradient(colors[], options?)`；零参数抛 `Missing gradient colors`；单个非数组参数抛 `Expected an array of colors`；单色数组交给 tinygradient 后抛 `Invalid number of stops (< 2)`；
  - 默认 `interpolation: 'rgb'`、`hsvSpin: 'short'`；v2 变参与 `gradient.alias` 仍可用但标 deprecated；
  - `applyGradient` 用非空白字符数（下限为 stop 数）向 tinygradient 取色，空白不消耗颜色；每个可见字符包一层 `chalk.hex`；
  - `multiline` 按**最长行的字符长度**（含空格）取色，每行 `colors.slice(0)` 后**每个字符含空格都 shift 一色**，因此列对齐；
  - 13 个 named export：`atlas` / `cristal` / `teen` / `mind` / `morning` / `vice` / `passion` / `fruit` / `instagram` / `retro` / `summer` / `rainbow` / `pastel`；`rainbow` 是 `#ff0000`→`#ff0100` + HSV long，不是手写光谱表。
