---
title: Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
来源: https://github.com/biomejs/biome
日期: 2026-05-29
分类: 前端工具链
难度: 中级
---

## 是什么

Biome 是**用 Rust 重写的 JavaScript / TypeScript 工具链**，把 ESLint（找代码问题）、Prettier（统一代码格式）、import sorter（整理 import 顺序）三件事**塞进同一个二进制**。日常类比：以前你家厨房有 4 个独立小电器（榨汁机、搅拌机、料理机、研磨杯），现在变成一台多功能料理机——少占空间、共享马达、洗一次就行。

你只要写一行：

```bash
npx @biomejs/biome check ./src
```

一个命令同时做：扫语法错、按规则格式化、排好 import 顺序、给出诊断报告——**速度比 ESLint + Prettier 跑一遍快 25-100 倍**。截至 2026-05，v2.4.16，450+ 条规则，24.8k stars。

## 为什么重要

不理解 Biome 的设计选择，下面这些事都没法解释：

- 为什么 ESLint + Prettier 已经存在 10 年，还能被一个新工具一战打穿
- 为什么"性能优势"不是核心卖点——**真正的杠杆是"共享一份 AST"**
- 为什么 Biome 故意限制插件生态——这不是功能缺失，是判断
- 为什么 Vite 团队另起炉灶做 oxlint 而不是直接用 Biome——同流派的工具是怎么分流的

## 核心要点

Biome 的设计选择可以拆成 **三条**：

1. **一份 AST，多个 pass 共享**：源码只 parse 一次，linter / formatter / import sorter 全部读同一棵语法树。类比：开会做会议纪要，一个人记，所有人共用，而不是 4 个人各自做笔记。

2. **配置统一**：一个 `biome.json` 替代 `.eslintrc` + `.prettierrc` + `.eslintignore` + `.prettierignore` 四件套。类比：把 4 张分散的卡塞进一张身份证。

3. **故意不追求 100% 兼容**：97% 兼容 Prettier 输出，450+ 条规则覆盖 ESLint 高价值部分。剩下的 3% / 自定义规则要么改写、要么放弃。类比：搬家时只带 90% 常用物品，省下的搬运成本远超那 10%。

这三条加起来叫 **"整合优于单点"** 的判断——是一种产品哲学，不是单纯的技术胜利。

## 实践案例

### 案例 1：5 分钟跑通

```bash
mkdir biome-demo && cd biome-demo
npm init -y
npm install --save-dev --save-exact @biomejs/biome
npx @biomejs/biome init                  # 生成 biome.json
echo 'const x=1;var y=2' > demo.js
npx @biomejs/biome check --write demo.js
cat demo.js
# const x = 1;
# const y = 2;
```

**逐部分解释**：

- `init` 生成默认配置（`biome.json`，约 10 行）
- `check --write` 一次跑完 lint + format + auto-fix
- `var y` 被自动改成 `const y`（noVar 规则的 unsafe fix）
- 整个过程**没装 ESLint、没装 Prettier、没装任何 plugin**

### 案例 2：lineWidth 改一处看字节差

`biome.json` 里把 `"lineWidth": 80` 改成 `"lineWidth": 120`，对同一份长对象字面量跑 format：

```js
// lineWidth: 80（容不下 → 整个对象 break）
const obj = {
  foo: 1, bar: 2,
  baz: [1, 2, 3 /* ... */],
  nested: { a: 1, b: 2 },
};

// lineWidth: 120（同一对象塞回一行）
const obj = { foo: 1, bar: 2, baz: [1, 2, 3 /* ... */], nested: { a: 1, b: 2 } };
```

输出在两个稳定状态间切换——**没有"换 3 个字段、保留 2 个不换"的中间态**。这是 Wadler 1998 paper 的 group atom 性质（见 [[wadler-prettier]]）。

### 案例 3：CI 里替代 ESLint + Prettier

旧 CI：

```yaml
- run: npx eslint .             # ~8 秒
- run: npx prettier --check .   # ~3 秒
```

换成：

```yaml
- run: npx biome ci .           # ~0.5 秒（同等规模 1000 文件 TS 项目）
```

`biome ci` 是给 CI 优化的子命令——只读、不写、错误码 1 退出。**整体 lint 阶段从 11 秒缩到 1 秒以内**。

## 踩过的坑

1. **97% 兼容不是 100%**：那 3% 集中在 JSX、TS decorators、object literal 边界场景——下游工具如果硬吃 Prettier 输出，迁移会炸。
2. **复杂 ESLint 自定义规则没等价**：内部 lint 规则 / 复杂 plugin 要重写，迁移成本可能 > 性能收益。
3. **plugin 系统故意被限制**：只支持 GritQL pattern 匹配，不支持任意 Rust plugin——**这不是 bug 是判断**，但被卡过的人会觉得是缺失。
4. **默认配置不一定合团队**：`lineWidth: 80` / `indentStyle: tab` 大概率你会想改，别以为"零配置开箱即用"等于"什么都不用动"。

## 适用 vs 不适用场景

**适用**：

- 新项目起步——30 分钟搭好、一个文件配置完
- 已有 ESLint + Prettier 项目想加速——可双跑过渡
- pre-commit hook（`lint-staged + biome check`）替换原 ESLint hook
- CI 里把 lint job 从 30 秒缩到 1 秒以下

**不适用**：

- 重度依赖 ESLint 自定义规则的大型项目——迁移成本太高
- 必须 100% Prettier 兼容（下游工具吃 Prettier 输出格式）——3% 差异可能炸
- 需要写 plugin 深度扩展核心——Biome 故意限制
- 只想要"更快的 Prettier"不要 lint——用 dprint 更纯粹

## 历史小故事（可跳过）

- **2017 年**：前 Babel 作者发起 **Rome** 项目——目标是做完整 web toolchain（含 bundler）。野心过大，进展缓慢。
- **2022 年**：Rome 团队组建公司，宣布用 Rust 全量重写。
- **2023 年 8 月**：公司倒闭。社区 fork 出 **Biome**，由 maintainer 群体接管。
- **2024 年**：Biome 1.0 发布——只做 lint + format + import sort，**砍掉 bundler 等一半野心**。
- **2026 年 5 月**：v2.4.16，Vercel / Astro / Tailwind 等都在用。

→ 知道这个背景才理解：Biome 不是凭空冒出，是一群人从废墟里把可保留的部分抢救出来。**砍野心是它活下来的关键**。

## 学到什么

- **设计胜过性能**：Biome 真正的杠杆不是 Rust，是"一份 AST + 一个配置"——这是产品判断，不是技术优势
- **整合优于单点最强**：dprint 在 format 单点更纯粹，oxlint 在 lint 单点更快，但 Biome 把两者合一拿到了 80% 用户
- **故意限制 = 设计**：不开放任意 plugin、不追求 100% 兼容——这些"限制"换来的是迭代速度和体验一致性
- **救活项目的关键是砍野心**：Rome 想做完整 toolchain 死了，Biome 砍到 lint+format 活了

## 延伸阅读

- [Biome 官方文档](https://biomejs.dev) —— 最新规则列表、配置参考、迁移指南
- [Wadler 1998 — A Prettier Printer](https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf) —— Biome formatter IR 的理论根
- [Biome blog](https://biomejs.dev/blog/) —— Rome 倒闭 → Biome 重生的项目治理演化
- [oxlint 源码](https://github.com/oxc-project/oxc) —— 同代竞品（只做 lint）的设计差异
- [[wadler-prettier]] —— Wadler 论文的零基础解读

## 关联

- [[wadler-prettier]] —— Biome formatter IR 直接来自这篇 paper（group / soft_line_break / atom 性质）
- [[esbuild]] —— 同样用编译型语言（Go）重写 JS 工具链，思路并行
- [[swc]] —— Rust 写的 JS 编译器，和 Biome 同流派但分工不同（swc 做 transform，biome 做 lint+format）
- [[vite]] —— 现代前端构建，常和 Biome 搭配做 lint job
- [[turborepo]] —— monorepo 缓存工具，Biome 在 monorepo 场景里更省时间
- [[hindley-milner]] —— Biome 不做类型检查（交给 tsc），但类型推导是相邻领域

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ast-grep]] —— ast-grep — 按语法树搜代码、改代码的命令行工具
- [[changesets]] —— changesets — 让每个 PR 自带版本号 bump 声明
- [[dust]] —— dust — du 的可视化替代，按目录大小排树状条形图
- [[gh]] —— gh — GitHub 官方命令行
- [[glab]] —— glab — GitLab 官方命令行
- [[just]] —— just — 把 make 拆成两半，只留 ‘命令编排’ 那一半
- [[lighthouse]] —— Lighthouse — Google 出品的网页质量审计工具
- [[lightningcss]] —— lightningcss — 用 Rust 把 CSS 工具链一遍跑完的编译器
- [[nanostores]] —— nanostores — 不到 1 KB 的"框架无关"状态库
- [[oxc]] —— oxc — Rust 写一整套 JS/TS 工具链的勇气
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[rspack]] —— rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
- [[sd]] —— sd — 直觉语法的 sed 替代品（Rust 写的 find-and-replace）
- [[shadcn-ui]] —— shadcn/ui — 把 React 组件从 npm 包变成"源码 + CLI 协议"
- [[sharp]] —— sharp — 让 Node.js 处理图像快到不像 JS
- [[shfmt]] —— shfmt — Shell 脚本的 gofmt（用 Go 写的统一格式化器）
- [[stylex]] —— StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
- [[task]] —— Task — 用 YAML 写一份跨平台的 ‘项目命令清单’
- [[volta]] —— Volta — cd 进项目就自动换 Node 版本的工具链管理器
- [[vscodium]] —— VSCodium — 去微软遥测的 VS Code 干净构建
- [[xh]] —— xh — HTTPie 的 Rust 重写版
