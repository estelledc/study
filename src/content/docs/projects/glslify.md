---
title: glslify — 给 GLSL 用的 npm 模块系统
来源: https://github.com/glslify/glslify
日期: 2026-07-10
分类: graphics
难度: 中级
---

## 是什么

glslify 是一套**让 GLSL shader 也能像 JavaScript 一样 `require` 别人写好的小模块**的工具。日常类比：以前写 fragment shader 像手抄菜谱——噪声、雾效、光照公式全塞进一个大文件；glslify 像外卖平台，你点一份 `glsl-noise`，它帮你把依赖拼进最终那份 shader 字符串。

它来自 stack.gl 生态，提供 CLI、Node API，以及 Browserify transform。你在 GLSL 里写：

```glsl
#pragma glslify: noise = require('glsl-noise/simplex/3d')
```

构建时 glslify 会去 `node_modules` 找模块、展开源码、给符号改名防冲突，最后吐出**一整段可交给 WebGL 的 GLSL 字符串**。

## 为什么重要

不理解 glslify，下面这些事很难解释：

- 为什么 WebGL 时代有人能把噪声、雾、PBR 高光拆成 npm 包反复复用，而不是每个项目复制粘贴
- 为什么 stack.gl / regl 教程里 shader 常常长得像 JS：`require`、tagged template、构建期打包
- 为什么 Plotly 等可视化产品能把复杂着色器拆成可维护模块，而不是一个 2000 行 `.frag`
- 为什么"shader 也能模块化"和 Browserify / Webpack 是同一类工程问题

## 核心要点

glslify 的核心可以拆成 **三件事**：

1. **`#pragma glslify` 导入/导出**：在 GLSL 里用 pragma 声明 `require` 和 `export`。类比：在菜谱页眉写"借用隔壁的剁椒酱配方"，打包时自动抄进来。

2. **构建期拼成单文件**：glslify 不在 GPU 上跑模块系统；它在 Node/打包器里把依赖树展平，输出一个字符串。类比：印刷前把分册装订成一本，读者（GPU）只看到最终书。

3. **自动改名防冲突**：多个模块都有 `mod289` 这类内部函数时，glslify 会加后缀避免重名。类比：两家店都叫"招牌酱"，合订本里改成"招牌酱_A / 招牌酱_B"。

## 实践案例

### 案例 1：tagged template 拉一份噪声

```js
const glsl = require('glslify')
const src = glsl`
  #pragma glslify: noise = require('glsl-noise/simplex/3d')
  precision mediump float;
  varying vec3 vpos;
  void main () {
    gl_FragColor = vec4(noise(vpos * 25.0), 1.0);
  }
`
// src 已是展开后的完整 GLSL 字符串，可交给 WebGL / regl
```

**逐部分解释**：`glsl\`...\`` 是构建期宏；`#pragma glslify: noise = require(...)` 把 npm 包里的函数绑到本地名 `noise`；输出里原来的内部符号会被改名，但你调用的仍是 `noise(...)`。

### 案例 2：CLI 把 `.glsl` 编成单文件

```bash
npm install -g glslify
npm install glsl-noise
glslify index.glsl -o output.glsl
```

`index.glsl`：

```glsl
#pragma glslify: snoise = require(glsl-noise/simplex/2d)
void main() {
  float b = snoise(gl_FragCoord.xy * 0.01);
  gl_FragColor = vec4(vec3(b), 1.0);
}
```

**逐部分解释**：CLI 读入口文件 → 解析 pragma → 解析 node 风格路径 → 写出无依赖的 `output.glsl`。适合先看展开结果，再接到任意接受字符串的 WebGL 封装。

### 案例 3：自己导出一个可复用函数

`top-dot.glsl`：

```glsl
float topDot(vec3 normal) {
  return dot(vec3(0.0, 1.0, 0.0), normal);
}
#pragma glslify: export(topDot)
```

别处导入：

```glsl
#pragma glslify: topDot = require(./top-dot.glsl)
void main() {
  float lit = topDot(normalize(vNormal));
  gl_FragColor = vec4(vec3(lit), 1.0);
}
```

**逐部分解释**：`export` 声明模块对外暴露的符号；`require(./...)` 用相对路径；也可以在 require 时传参绑定本地名（高级用法，见官方 accumulator 示例）。这就是"shader 组件库"的最小闭环。

## 踩过的坑

1. **以为运行时还能动态 require**：glslify 是构建期工具；浏览器里没有活的 GLSL 模块加载器，改依赖要重新打包。

2. **和 Babel/ESM 搅在一起会静默坏掉**：若 Babel 先把 `import` 拧成难分析的 CommonJS，tagged template 可能抽不出来；要用 glslify-babel 或固定 CommonJS 写法。

3. **本地 transform 作用域搞错**：`package.json` 里的 `glslify.transform` 默认只作用于本包；依赖包里的文件不会自动吃你的 hex 颜色 transform。

4. **符号改名后难对源码调试**：展开后的函数名带后缀，GPU 报错行号对不上你手写的小文件——出问题先看 `-o` 展开结果。

## 适用 vs 不适用场景

**适用**：
- 用 npm 复用噪声、雾、光照、hash blur 等 shader 小组件
- 和 Browserify / [[webpack]]（glslify-loader）/ regl 工作流集成
- 需要把多文件 GLSL 收成单字符串交给任意 WebGL 封装

**不适用**：
- 只要在网页里快速试一段 fragment——用 [[glsl-canvas]] 或 Shadertoy 更轻
- 完整 3D 引擎材质系统——用 [[threejs]] 的 ShaderMaterial / NodeMaterial
- 现代纯 ESM + Vite 项目且不想接旧 transform——要另找 vite 插件或手写拼接
- 需要运行时热插拔远程 shader 模块——glslify 解决的是构建期，不是 CDN 动态加载

## 历史小故事（可跳过）

- **2013 前后**：Browserify 让前端习惯 `require` 一切；WebGL 社区开始想"shader 能不能也这样"。
- **stack.gl 时代**：glslify 成为生态核心，配合 regl、shader-school，把 GLSL 组件推上 npm。
- **之后**：Webpack loader、Babel plugin、glslb.in 沙箱相继出现；Plotly 等产品线也用它管复杂着色器。
- **今天**：生态偏"稳定老工具"——新项目未必默认选用，但模块化思路仍影响后来的 shader 管线设计。

## 学到什么

1. **GPU 不需要模块系统，人需要**：模块化发生在构建期，运行时仍是一整段 GLSL。
2. **pragma 是给打包器看的注释协议**：GPU 驱动忽略它；glslify 靠它发现依赖边。
3. **改名是模块化的隐藏成本**：能防冲突，也会让调试变难——展开输出是你的朋友。
4. **小而专的工具能养活生态**：glslify 不管场景图，只管"把 GLSL 依赖装进字符串"。

## 延伸阅读

- 仓库：[glslify/glslify](https://github.com/glslify/glslify)
- 文章：[Modular and Versioned GLSL](http://mattdesl.svbtle.com/glslify)（mattdesl）
- 包列表：[stack.gl packages](http://stack.gl/packages/)（Shader Components）
- 沙箱：[glslb.in](http://glslb.in/)（内置 glslify）
- [[owens-2007-gpgpu-survey]] —— 早期"把计算塞进 shader"的背景
- [[deering-1988-triangle-processor]] —— 可编程图形管线更早的硬件脉络

## 关联

- [[glsl-canvas]] —— 浏览器里快速跑 fragment；glslify 负责构建期模块拼装
- [[regl]] —— 常与 glslify 同属 stack.gl 工作流，命令式 WebGL 封装
- [[twgl]] —— 减 WebGL 样板，但不提供 GLSL npm 模块图
- [[picogl]] —— 更底层的 WebGL2 封装，可接收 glslify 输出的字符串
- [[threejs]] —— 完整引擎；自定义 shader 时也可先用 glslify 预打包再塞进材质
- [[webpack]] —— 可用 glslify-loader 接入打包管线
- [[shader-park]] —— 另一条"用更高层语言生成 shader"的路线，对照模块化思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
