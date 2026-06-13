---
title: Biome - Web 项目的"超级管家"工具链
来源: https://github.com/biomejs/biome
日期: 2026-06-13
分类: 后端 API
子分类: 前端框架
provenance: pipeline-v3
---

# Biome - Web 项目的"超级管家"工具链

## 一个类比

想象你写了一篇文章，交给两个不同的人：

- **格式整理员（Prettier）**：负责排版——缩进、换行、引号、分号……把格式统一好。
- **错别字检查员（ESLint）**：负责纠错——拼写错误、语法不通、逻辑漏洞……把内容改对。

以前你需要同时请这两个人。Biome 的做法是：**雇一个超级管家**，一个人同时干两个人的活，而且干得更快。

Biome 用 Rust 写成（所以快），一个工具顶替 Prettier + ESLint + 部分 typescript-eslint 的工作。

## 核心概念

### 1. 格式化器 (Formatter)

负责代码风格统一。支持 JavaScript、TypeScript、JSX、JSON、CSS、GraphQL。

- 和 Prettier 97% 兼容，基本可以无缝替换
- 不依赖 Node.js，自带可执行文件

### 2. 检查器 (Linter)

负责检查代码中的潜在错误和坏味道。目前有 **508 条规则**，从 ESLint、typescript-eslint 和其他来源借用。

检查器规则分成 8 个组：

| 组名 | 干什么 | 例子 |
|------|--------|------|
| correctness | 会出错的代码 | `noUnusedVariables` |
| suspicious | 很可能出错的代码 | `noDebugger` |
| style | 编码风格规范 | `useConst` |
| complexity | 过于复杂的代码 | `noExcessiveCognitiveComplexity` |
| performance | 可以写得更快 | `noAccumulatingSpread` |
| security | 潜在安全隐患 | `noGlobalIsFinite` |
| a11y | 无障碍访问问题 | `useKeyWithClickEvents` |
| nursery | 还在测试的新规则 | 不稳定的实验性规则 |

### 3. 修复等级 (Fix Level)

这是 Biome 最有特色的设计。每条规则给出的"自动修复"分两级：

- **Safe fix（安全修复）**：改完不会改变代码行为，可以自动执行
- **Unsafe fix（不安全修复）**：改完可能改变程序行为，需要人工审核后再执行

比如把 `var` 改成 `const` 是 safe（更安全了），但把 `console.log(x)` 删掉（因为它未使用）就是 unsafe（可能你确实需要那个日志）。

### 4. 配置文件 (biome.json)

Biome 用 `biome.json` 做配置，放在项目根目录。和 ESLint/Prettier 各用一个配置文件不同，Biome 一个文件管所有。

## 入门使用

### 安装

```bash
# 用 npm 安装到项目里（作为开发依赖，锁定版本）
npm install --save-dev --save-exact @biomejs/biome
```

注意 `-E`（`--save-exact`）的作用：它会精确锁定版本号，不写 `^` 或 `~`。这样每个人的项目都用同一个版本的 Biome，避免"我电脑上能过你电脑上不过"的问题。

### 初始化配置

```bash
# 生成 biome.json
npx @biomejs/biome init
```

生成的配置文件长这样：

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.13/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space"
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  }
}
```

三个工具各自有 `enabled` 开关，可以随时关掉某一个。

### 常用命令

```bash
# 格式化所有文件（把代码排整齐）
npx @biomejs/biome format --write

# 检查代码并自动修复可以安全修复的问题
npx @biomejs/biome lint --write

# 格式化 + 检查 + 整理 import，一站式搞定
npx @biomejs/biome check --write

# CI 环境专用：检查所有文件，不修改
npx @biomejs/biome ci
```

## 代码示例

### 示例 1：格式化前 vs 格式化后

**格式化前（乱的）：**

```javascript
const add=(a,b)=>{return a+b},name="Jason";
function greet(){return `Hello, ${name}!`}
```

**运行 `biome format --write` 后：**

```javascript
const add = (a, b) => {
  return a + b
},
name = "Jason"

function greet() {
  return `Hello, ${name}!`
}
```

Biome 自动处理了缩进、空格、分号（默认不加分号）、换行。不需要你任何配置。

### 示例 2：Linter 自动修复

**检查前（有问题）：**

```javascript
var x = 10
var y = 20
console.log(x)

function double(n) {
  return n * 2
}

const result = double(5)
```

**运行 `biome lint --write` 后：**

```javascript
const x = 10
const y = 20
console.log(x)

function double(n) {
  return n * 2
}

const result = double(5)
```

Biome 把 `var` 全部改成了 `const`（这是 safe fix，因为不会改变代码语义）。但注意 `y` 虽然定义了但没用到——Biome 默认不做删掉 `y` 的修改，因为那是 unsafe fix（万一你只是忘了用呢）。

### 示例 3：自定义配置

如果想让 Biome 用单引号、行宽 120、不用分号：

```jsonc
{
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "lineWidth": 120
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "lineWidth": 120
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noUnusedVariables": "error"
      },
      "suspicious": {
        "noDebugger": "off"
      }
    }
  }
}
```

这里展示了几个关键点：

- `javascript.formatter` 里的配置只影响 JS/TS 文件，`formatter` 里的配置影响所有语言
- `"off"` 关掉某个规则，`"on"` 打开某个规则
- `"error"` 意味着 CI 会因为这条规则报错，`"warn"` 只是警告
- `noUnusedVariables` 设成 `error` 但默认不开启（不推荐），手动 `on` 才会启用

### 示例 4：编辑器实时检查

Biome 内置 LSP（语言服务协议），在 VS Code 里装一个插件，就可以：

1. 写代码时实时标红错误（像编译器一样）
2. 保存时自动修复所有 safe fix
3. 光标悬停时看详细解释

VS Code 配置 `settings.json`：

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.biome": "explicit"
  }
}
```

这样每次保存文件，Biome 就会自动修复所有安全的问题——不用手动跑命令。

## 迁移：从 Prettier + ESLint 过来

如果你原来项目同时用了 Prettier 和 ESLint，迁移只需要：

1. 卸载 `prettier`、`eslint`、`eslint-config-prettier`
2. 安装 `@biomejs/biome`
3. 运行 `biome migrate eslint`（自动把你 ESLint 配置转成 biome.json）
4. 删除 `.prettierrc`、`.eslintrc*` 等旧配置文件
5. 跑一下 `biome check --write`，看效果

Biome 的优势：
- 一个工具，不需要拼配置
- 只跑一次扫描就搞定格式+检查
- 比 Prettier + ESLint 快很多（Rust 写的，并行处理）

## 小结

Biome 的核心思想就一句话：**把前端代码质量工具链合并成一个工具**。

- 格式化：替代 Prettier，97% 兼容
- 检查：替代 ESLint，508 条规则
- 一个配置文件：biome.json
- 一个命令：biome check --write
- 编辑器集成：LSP，实时检查+自动修复
- 速度快：Rust 编写，不依赖 Node.js

对初学者来说，最大的好处就是：**少装一个工具，少配一个文件，少记一条命令**。
