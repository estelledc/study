---
title: glslify — Browserify 风格 GLSL 模块
来源: 'https://github.com/glslify/glslify'
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
---

## 是什么

glslify 是一套给 **GLSL 着色器** 用的 **Node.js 风格模块系统**——让你像 `require('lodash')` 那样，在着色器里 `require('glsl-noise')`，构建时把依赖打包成一段完整的 GLSL 字符串。日常类比：

> 写 JavaScript 时，你不会把 lodash 的源码整份复制进项目，而是 `npm install` 后 `import`；写 WebGL 着色器时，过去只能把噪声函数、光照模型整段粘贴进 `.glsl` 文件，改一处要搜遍全文。glslify 把 **Browserify 那套「模块 + 打包 + transform」** 搬到了 GPU 代码上。

GLSL（OpenGL Shading Language）是运行在 GPU 上的着色器语言，控制每个顶点怎么变换、每个像素什么颜色。WebGL 应用最终要把着色器源码字符串传给 `gl.shaderSource()`——glslify 在 **构建阶段** 解析 `#pragma glslify` 指令、解析 npm 依赖、重命名符号避免冲突，输出可直接编译的字符串。它与具体 WebGL 框架无关：regl、Three.js 自定义 ShaderMaterial、自研引擎都能用，只要你能传入 shader source。

项目由 stack.gl 生态孵化（Hugh Kennedy、Matt DesLauriers 等），MIT 协议，npm 周下载量约 70 万+，是 Browserify 时代的标准 GLSL 打包方案；现代项目也可通过 **glslify-loader**（Webpack）、**glslify-babel**（Babel 插件）或 **vite-plugin-glslify** 等接入 Vite/Rollup 管线。

## 为什么重要

不理解 glslify，下面这些事情都没法解释：

- 为什么 Shadertoy 上几百行的噪声函数，在 stack.gl 项目里只是一行 `#pragma glslify: noise = require('glsl-noise/simplex/3d')`
- 为什么多个 `.glsl` 文件都定义了 `main()` 或同名函数，打包后却不报「重复定义」——glslify 会自动 **重命名（suffix）** 符号
- 为什么 Browserify 项目里 `require('glslify')` 能在打包时把 GLSL 内联成 JS 字符串，而运行时浏览器根本不需要文件系统
- 为什么 npm 上有一整类 `glsl-*` 包（fog、film grain、easing、Cook-Torrance 光照），可以像 JS 库一样版本管理和复用

## 核心概念

### 1. `#pragma glslify` —— 着色器里的 import/export

GLSL 本身没有 ES Module。glslify 用 **编译期指令** 模拟 Node 模块：

| 指令 | 作用 | 类比 |
|------|------|------|
| `#pragma glslify: name = require('pkg/path')` | 从 npm 或相对路径引入符号 | `const name = require('pkg')` |
| `#pragma glslify: export(symbol)` | 把函数/struct/uniform 暴露给引用方 | `module.exports = symbol` |
| `#pragma glslify: require('pkg', a=b, ...)` | 把本地符号 **绑定** 到依赖模块的占位符 | 依赖注入 |

构建完成后，所有 `require` 会被 **内联**，重复符号会加 `_1_0` 这类后缀，避免链接冲突。

### 2. 三种使用入口

- **Node / CLI**：`glslify index.glsl -o out.glsl`，或 `glslify.file('./shader.glsl')` 得到字符串
- **Browserify transform**：`-t glslify`，在 JS 里 `require('glslify')` 调用时在 bundle 阶段替换为字符串
- **Tagged template**：`glslify\`...\`` ES6 标签模板，在 JS 里直接写 GLSL 片段

输出始终是 **单个 GLSL 源字符串**（顶部常带 `#define GLSLIFY 1`），交给 WebGL 编译即可。

### 3. glslify-deps 与 glslify-bundle

内部管线分两步，概念上类似 Browserify 的 `module-deps` + `bundle`：

1. **glslify-deps**：从入口 `.glsl` 或 inline 字符串出发，递归解析 `#pragma glslify`，构建依赖图
2. **glslify-bundle**：按拓扑顺序合并文件，应用 rename，输出最终源码

你可以在服务端只跑 deps 做依赖分析，在浏览器端再 bundle——适合大型可视化应用的拆分部署。

### 4. Source Transforms（着色器版 Babel 插件）

受 Browserify transform 启发，可在 **构建时** 改写 GLSL 语法，分三类：

- **Local**：只对当前包内文件生效（如 `glslify-hex` 把 `#ff0000` 转成 `vec3`）
- **Global**：对所有依赖生效
- **Post**：对整个 bundle 完成后做一次（如全着色器优化）

在 `package.json` 里配置：

```json
{
  "glslify": {
    "transform": [
      "glslify-hex",
      ["glslify-optimize", { "mangle": true }]
    ]
  }
}
```

### 5. npm 上的 GLSL 包约定

- 包名通常以 `glsl-` 开头
- 入口文件是 `index.glsl` 而不是 `index.js`
- 解析算法与 Node 相同：从着色器所在目录的 `node_modules` 向上查找

stack.gl 维护的 [Shader Components 列表](http://stack.gl/packages/) 是选库的起点。

## 实践案例

### 案例 1：从 npm 引入 Simplex 噪声（最小片段着色器）

安装社区模块：

```bash
npm install glslify glsl-noise
```

**shader.glsl**（片段着色器入口）：

```glsl
#pragma glslify: noise = require('glsl-noise/simplex/3d')

precision mediump float;
varying vec3 vpos;

void main() {
  float n = noise(vpos * 25.0);
  gl_FragColor = vec4(vec3(n), 1.0);
}
```

**index.js**（Node 或 Browserify 入口）：

```javascript
const glslify = require('glslify')

// 方式 A：读文件
const frag = glslify.file('./shader.glsl')

// 方式 B：标签模板（适合短 shader）
const fragInline = glslify`
  #pragma glslify: noise = require('glsl-noise/simplex/3d')
  precision mediump float;
  varying vec3 vpos;
  void main() {
    gl_FragColor = vec4(vec3(noise(vpos * 25.0)), 1.0);
  }
`

console.log(frag.slice(0, 80))  // "#define GLSLIFY 1\n\n..."
```

**逐部分解释**：`#pragma glslify: noise = require(...)` 声明「我要把包里的噪声函数 import 成本地名 `noise`」。构建时 glslify 会把 `glsl-noise` 里对应文件的函数体插入，并把内部函数名改成 `snoise_1_2` 这类唯一名。你在 JS 里拿到的 `frag` 已经是 **展开后的完整 GLSL**，直接 `gl.shaderSource(shader, frag)` 即可。

Browserify 打包：

```bash
browserify -t glslify index.js -o bundle.js
```

### 案例 2：export 自定义模块 + 跨模块引用绑定

把可复用的「上半球光照」抽成模块。

**lighting.glsl**（导出）：

```glsl
float topDot(vec3 normal) {
  return max(dot(vec3(0.0, 1.0, 0.0), normal), 0.0);
}

#pragma glslify: export(topDot)
```

**main.frag**（消费）：

```glsl
#pragma glslify: topDot = require('./lighting.glsl')

precision mediump float;
varying vec3 vNormal;

void main() {
  float shade = topDot(normalize(vNormal));
  gl_FragColor = vec4(vec3(shade), 1.0);
}
```

**带占位符的 require**（高级）：若模块 `accumulator.glsl` 里用到了未定义的 `N` 和 `map`，可在 require 时 **注入本地符号**：

```glsl
const int M = 500;
float add(float a, float b) { return a + b; }

#pragma glslify: sum500 = require('./accumulator.glsl', N=M, map=add)
```

这类似函数式编程里的 **高阶参数**：同一份 `accumulator.glsl` 可实例化成「500 元素求和」或「17 元素求积」，只需换 `N` 和 `map`。

### 案例 3：与 regl 组合（现代 WebGL 常见写法）

glslify 只负责 **字符串**；绘制仍由 WebGL 封装库完成：

```javascript
const regl = require('regl')()
const glslify = require('glslify')

const draw = regl({
  frag: glslify`
    #pragma glslify: grain = require('glsl-film-grain')
    precision mediump float;
    uniform float time;
    varying vec2 vUv;
    void main() {
      vec3 col = vec3(vUv, 0.5);
      col += grain(vUv * 800.0, time) * 0.08;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
  vert: `
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
      vUv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0, 1);
    }
  `,
  attributes: {
    position: [[-1,-1], [3,-1], [-1,3]]
  },
  uniforms: {
    time: ({ tick }) => tick * 0.05
  },
  count: 3
})

regl.frame(() => draw())
```

**要点**：`frag` 字段在 bundle 阶段已被 glslify 展开；运行时 regl 只做编译与绘制。film grain、noise、fog 等效果都以 npm 模块形式叠加，主着色器保持可读。

## 构建工具对照

| 工具链 | 接入方式 |
|--------|----------|
| Browserify | `-t glslify` 或 `package.json` → `browserify.transform` |
| Webpack | [glslify-loader](https://github.com/stackgl/glslify-loader) |
| Babel | [glslify-babel](https://github.com/stackgl/glslify-babel) 插件；若 Babel 把 import 转成 require 导致静态分析失败，可配合 `babel-plugin-import-to-require` |
| 直接 require `.glsl` | [glslify-bare](https://github.com/jnordberg/glslify-bare) transform，比扫描全项目的 glslify 更快，但不能 per-file transform 选项 |
| Vite / Rollup | 社区 `vite-plugin-glslify`、`rollup-plugin-glslify` 等 |

在线试验可打开 [glslb.in](http://glslb.in/)——带 glslify 支持的 fragment shader 沙盒，类似 Shadertoy。

## 踩过的坑

1. **pragma 必须在构建时可见**：若在运行时拼接 `#pragma glslify` 字符串，打包器无法静态分析，require 不会展开。Shader 源码要在构建阶段确定（或走 glslify CLI 预编译）。

2. **Babel 与静态分析冲突**：ES6 `import glsl from 'glslify!...'` 经 Babel 转译后，glslify 可能找不到调用点。官方建议用 tagged template、`glslify.file()`，或 `babel-plugin-import-to-require` 映射。

3. **符号重命名后的调试**：内联后函数名带 `_1_0` 后缀，GPU 调试器里栈 trace 可读性变差。开发时可先用 CLI 输出 `output.glsl` 人工阅读，再切回 bundle 流程。

4. **WebGL1 vs WebGL2 语法**：社区 `glsl-*` 模块多数面向 GLSL ES 1.0（WebGL1）。在 WebGL2 项目里要确认模块是否使用 `texture`/`in`/`out` 等新关键字，必要时 fork 或写 local transform。

5. **与 Three.js ShaderChunk 两套体系**：Three.js 自带 `#include <...>` 预处理器，和 glslify 的 `#pragma` 不互通。在 ShaderMaterial 里用 glslify 通常指 **构建期** 生成字符串再赋给 `fragmentShader`，不要混用两种 include 语法。

## 适用 vs 不适用场景

**适用**：

- stack.gl / regl / 自研 WebGL 引擎，需要组合大量社区着色器 snippet
- 科学可视化、生成艺术、广告落地页等 **自定义 GLSL** 项目
- 希望噪声、光照、后处理与 JS 依赖一样 **版本锁定、可审计**
- Browserify 或 Webpack 老项目维护着色器资产

**不适用**：

- 纯 Three.js 标准材质、不写自定义 shader → 直接用引擎内置即可
- 已全面使用 **WGSL / WebGPU** 新栈 → glslify 仅服务 GLSL
- 运行时动态生成大量不同 shader 拓扑（依赖图每帧都变）→ 构建期 bundle 帮不上忙，需自研或 GPU 字符串缓存策略
- 团队零 Node 构建、只有 CDN `<script>` → 需预编译 GLSL 为静态字符串文件

## 历史小故事（可跳过）

- **2012 年**：Hugh Kennedy 在 stack.gl 工作中提出「GLSL 也需要 require」；glslify 首个版本与 Browserify transform 同时出现，哲学直接继承 substack 的模块化 JS 运动。
- **2013–2016 年**：Matt DesLauriers 撰文 [*Modular and Versioned GLSL*](http://mattdesl.svbtle.com/glslify)，`glsl-noise`、`glsl-film-grain` 等包爆发；WebGL Insights 一书专章介绍 glslify。
- **2016 年**：glslify v5 引入 tagged template API；glslify-deps / glslify-bundle 拆分，架构对齐 Browserify 的 deps + bundle。
- **2017+**：Webpack loader、Babel 插件、glslb.in 沙盒出现；Plotly、Make Me Pulse 等商业项目在生产环境使用。
- **2020 年代**：Vite 成为默认 bundler，社区 loader 延续 glslify 语义；核心仓库更新放缓，但 npm 下载量仍高——说明 **着色器模块化** 需求稳定，工具链随 bundler 变迁而适配。

## 学到什么

1. **把熟悉的设计模式搬到新语言**：Browserify 的 module-deps + transform 思想移植到 GLSL，降低了 GPU 代码复用门槛——好的架构往往可以跨领域复用
2. **构建期内联 vs 运行时加载**：着色器几乎不变，适合在 build time 做依赖解析和符号重命名，运行时零开销
3. **符号重命名是链接器的核心工作**：多个模块合并成单文件，必须解决命名冲突；理解 glslify 输出里的 `_1_0` 后缀，就理解了链接器在做什么
4. **小模块生态比大框架更长寿**：`glsl-noise` 这类单功能包十年仍在用，说明图形学里「可组合 snippet」比「全能引擎」更抗时间

## 延伸阅读

- 官方仓库：[glslify/glslify](https://github.com/glslify/glslify)（API、CLI、transform 完整说明）
- 概念文章：[Modular and Versioned GLSL](http://mattdesl.svbtle.com/glslify)（Matt DesLauriers）
- 包索引：[stack.gl Shader Components](http://stack.gl/packages/)
- 在线沙盒：[glslb.in](http://glslb.in/)
- 依赖.walk：[glslify-deps](https://www.npmjs.com/package/glslify-deps)
- Webpack：[glslify-loader](https://github.com/stackgl/glslify-loader)

## 关联

- [[regl]] —— stack.gl 核心渲染库，frag/vert 字符串常与 glslify 配合
- [[webpack]] —— 通过 glslify-loader 接入现代或 legacy 前端构建
- [[esbuild]] —— 若只用 esbuild 打包 JS，需单独步骤处理 GLSL（esbuild 无原生 glslify transform）
- [[three-js]] —— 自定义 ShaderMaterial 可消费 glslify 产出的字符串
- [[d3]] —— 数据可视化上层；WebGL 层可用 glslify 管理着色器模块
- [[luma-gl]] —— vis.gl 生态的 WebGL 抽象，部分项目仍沿用 glslify 资产管理 shader

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

