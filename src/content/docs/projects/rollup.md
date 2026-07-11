---
title: Rollup — ESM 优先的打包器
来源: https://github.com/rollup/rollup
日期: 2026-05-29
分类: 构建工具
难度: 中级
---

## 是什么

Rollup 是一个 JavaScript **打包器**（bundler）——把分散在很多文件里的代码合并成一个发布产物。日常类比：你写一本书用了 30 个 markdown 文件分章节，出版前要把它们合并成一份 PDF。Rollup 就干这事，但还会顺手做一件更厉害的：**砍掉没人引用的章节**——这叫 **tree-shaking**。

类比："整理书架时把重复的书拿掉，只留真正有人借过的"。你 import 了 lodash 的一个 `debounce`，Rollup 知道你只用了这个，就只把 `debounce` 打进产物，剩下 600 个 lodash 函数全部丢掉。

它最大的舞台是「发 npm 库」：React / Vue / Three.js / d3 这些大型库的构建工具都是 Rollup。它**不太适合**做 SPA 应用（那是 webpack / Vite 的活），擅长把库精雕成最小最干净的发布形态。

## 为什么重要

不理解 Rollup，下面这些事都没法解释：

- 为什么 **tree-shaking** 成了 JS 工具链的通用术语——Rich Harris 2015 年用 Rollup 在 JS 社区把这个说法推开（术语本身更早见于 Lisp/Dart 等）
- 为什么 webpack 2 才开始跟 ESM unused export，webpack 4 又靠 `sideEffects` 把 shake 做稳——Rollup 从一开始就按「只打包用到的活代码」设计
- 为什么 Vite production build 相对慢——生产构建底层调的是 Rollup（JS 实现，精度优先）
- 为什么 React / Vue 这些「库」的产物比 webpack SPA 干净那么多——库要扁平可 shake，应用要 chunk/缓存，思路不同

简单说：你用任何现代 JS 库，几乎都吃了 Rollup 的产物；你用 Vite 部署，build 阶段也是 Rollup。

## 核心要点

Rollup 干活的过程可以拆成 **三步**：

1. **静态分析**：读 `import` / `export` 语法。ES module 的厉害之处在于「编译期就能知道谁 import 了谁」——不像 CommonJS 的 `require()` 是运行时调用、可以包在 if 里、可以拼接路径。Rollup 利用这个静态性，构出一张完整的依赖图。

2. **Tree-shaking**：从入口（你指定的 `index.js`）出发，沿依赖图标记每个被「真正用到」的 export。没人用到的 export 直接不输出。类比：扫描一棵树，只留有人在上面走过的枝丫，其他全部锯掉。

3. **Plugin 钩子**：Rollup 自己只懂 ESM。其他东西（TypeScript / CSS / JSON / CommonJS 模块）全靠 plugin 转成 ESM 喂给它。Plugin 写起来是三个核心钩子：`resolveId`（解析路径）、`load`（读文件）、`transform`（改源码）。

## 实践案例

### 案例 1：最小可用的 rollup.config.js

```js
// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.ts',          // 入口文件
  output: {
    file: 'dist/index.mjs',       // 输出位置
    format: 'esm',                // 输出格式
  },
  plugins: [
    nodeResolve(),                // 找 node_modules 里的依赖
    typescript(),                 // .ts → .js
  ],
};
```

**逐部分解释**：

- `input` 是你的入口文件——Rollup 从这里开始追依赖
- `output.format: 'esm'` 让产物保留 `import` / `export` 语法（适合现代环境）。其他选项有 `cjs`（老 Node）、`umd`（同时兼容浏览器和 Node）、`iife`（直接 `<script>` 引用）
- `plugins` 顺序会影响 `resolveId` / `load` / `transform` 谁先接手：裸模块名（如 `lodash`）要靠 `nodeResolve` 参与解析；和 `typescript` 的先后以官方示例与实测为准，不要死记「必须谁在前」

### 案例 2：写一个最小 plugin（10 行）

```js
// 把 .json 文件转成 ESM export
export default function jsonPlugin() {
  return {
    name: 'json',
    transform(code, id) {                    // 钩子：每个文件读完后触发
      if (!id.endsWith('.json')) return null;  // 只管 .json
      const data = JSON.parse(code);
      return `export default ${JSON.stringify(data)};`;
    },
  };
}
```

`return null` 表示「这个 plugin 不处理此文件，传给下一个」。这就是 plugin 链——链式串接，每个 plugin 改一次。

### 案例 3：tree-shaking 体积对比

```js
// 不 tree-shake 友好的写法
import _ from 'lodash';                 // 全包，~70KB
const fn = _.debounce(handler, 300);

// tree-shake 友好的写法
import { debounce } from 'lodash-es';   // 只含 debounce + 它的依赖，~3KB
const fn = debounce(handler, 300);
```

差别：`lodash` 是 CommonJS 包，Rollup 没法静态分析它的内部结构，整包打进产物。`lodash-es` 是 ESM 版本，Rollup 能精确切下你用到的部分。这就是为什么很多大库都同时维护 `xxx` + `xxx-es` 两个 npm 包。

## 踩过的坑

1. **CommonJS 默认不能 tree-shake**：Rollup 内部只懂 ESM。CJS 包必须先用 `@rollup/plugin-commonjs` 转换。但这个 plugin 是 best-effort——遇到动态 require、条件 require、`module.exports = function() {}` 等动态形态可能转换失败。CJS 重的项目慎选 Rollup。

2. **`sideEffects: false` 配错会砍掉副作用代码**：在 `package.json` 写 `"sideEffects": false` 等于告诉 Rollup「我这包没副作用，shake 吧」。但如果你有 `import './styles.css'`（CSS 也是副作用），Rollup 会把整行丢掉，产物里就没 CSS 了。修法：写成 `"sideEffects": ["*.css"]` 列出例外。

3. **`output.format` 选错发布的库装不上**：`format: 'esm'` 只能在支持 ESM 的环境用（现代 Node、浏览器原生）。老 Node + 老 webpack 项目要 `cjs`。库作者通常**两份都发**——`dist/index.mjs` + `dist/index.cjs`，配套 `package.json` 的 `exports` 字段告诉 Node 该用哪个。

4. **多 entry 共享 chunk 配置易混乱**：当 `input` 是多个文件、且某些模块被多个入口引用时，Rollup 会自动拆出 shared chunk。但 chunk 的命名、依赖顺序、是否 inline 等细节要靠 `output.manualChunks` 手动指定。新手在这里容易输出一堆 `chunk-XXXX.js` 文件名乱七八糟。

## 适用 vs 不适用场景

**适用**：
- 发 npm 库（库作者首选）——产物扁平、tree-shake 干净、ESM 优先；入口少、体积敏感时收益最大
- 单文件构建工具（CLI 工具的 bundle 阶段）
- monorepo 里的 library 子项目（配合 Vite 做 application）

**不适用**：
- SPA / 大型应用——没内置 dev server / HMR，配套生态不如 webpack / Vite
- CommonJS 模块为主的老项目——@rollup/plugin-commonjs 兼容性边界多
- 需要复杂 code splitting + cache 优化的浏览器应用——webpack 的 splitChunks 更成熟

## 历史小故事（可跳过）

- **2015 年**：Svelte 创始人 Rich Harris 发布 Rollup，并写「Tree-shaking versus dead code elimination」，在 JS 社区推广 **tree-shaking**（术语更早有，他把它讲成「只打进活代码」）
- **2017–2018 年**：webpack 2 已能做 ESM unused export 检测；webpack 4 再用 `sideEffects` + scope hoisting 等把 shake 做稳。库场景仍多选 Rollup
- **2020-2021 年**：Vite 选 Rollup 做 production build——dev 用 esbuild 求快，生产要精度仍靠 Rollup
- **2021 年**：Rich Harris 加入 Vercel，Rollup 维护转向 Lukas Taegert-Atkinson 团队
- **2024-2026 年**：VoidZero 启动 **Rolldown**——Rust 重写、API 兼容 Rollup，目标替换 Vite 底下的 JS Rollup

## 学到什么

1. **ESM 静态结构是 tree-shaking 的根**——CommonJS 的 `require()` 是运行时调用，编译器没法在编译期推可达性。这就是为什么 Rollup 把「ESM-first」当做核心架构而非 marketing 话术
2. **plugin 钩子设计反映了构建流程的关键节点**——`resolveId` / `load` / `transform` 三件套对应「找文件 / 读文件 / 改文件」，是任何 bundler 的最低骨架
3. **library 和 application 是两种世界观**——library 要扁平、单文件、tree-shake 友好；application 要 chunk / cache / runtime patch。Rollup 选了前者，webpack 选了后者
4. **`sideEffects` 字段是 npm 生态的隐形 convention**——发库时漏写，下游 bundler 就 shake 不动你；写错，CSS 等副作用文件被砍。这是踩坑高发区
5. **理论 → 工程 → 替换**：JS 侧 tree-shaking 经 Rollup 工程化 → webpack 跟进完善 → 2024 年起用 Rust（Rolldown）重写。大约每五年换一代实现

## 延伸阅读

- 官方教程：[Rollup Tutorial](https://rollupjs.org/tutorial/)（30 分钟跑通 Hello World library）
- 概念出处：[Rich Harris — Tree-shaking versus dead code elimination](https://medium.com/@Rich_Harris/tree-shaking-versus-dead-code-elimination-d3765df85c80)
- 实战练习：自己写一个 50 行 npm library，配 `package.json` 的 `exports` / `sideEffects`，跑 `npm pack` 看产物
- 进阶：读 `@rollup/plugin-typescript` 源码（约 300 行），是最简的真实 plugin 范例
- [[webpack]] —— Rollup 的「另一极」：application 打包的标杆
- [[vite]] —— Rollup 的「上层包装」：dev 用 esbuild，build 用 Rollup

## 关联

- [[webpack]] —— 与 Rollup 形成 application vs library 的两极
- [[vite]] —— 把 Rollup 装在底下做 production build，是 Rollup 在 application 场景的解
- [[esbuild]] —— 与 Rollup 形成「速度 vs 精度」的对比
- [[vue]] —— 内核构建用 Rollup，是「ESM-first 库」的典型用户

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[esbuild]] —— esbuild — 用 Go 写的极速 JS bundler
- [[nx]] —— Nx — 一个仓库装几十个项目时帮你少跑活的工具
- [[oclif]] —— oclif — 给 50+ 命令的 CLI 一套"目录即路由"的框架
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
- [[swc]] —— SWC — Rust 写的 TS/JS 编译器
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[webpack]] —— webpack 模块打包
