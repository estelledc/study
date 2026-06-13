---
title: react-native-builder-bob — React Native 库脚手架与多产物构建工具
来源: https://github.com/callstack/react-native-builder-bob
日期: 2026-06-13
分类: 后端 API
子分类: 移动端
provenance: pipeline-v3
---

## 是什么

**react-native-builder-bob**（社区常简称 **Bob**）是 Callstack 维护的一套 CLI，专门解决 React Native **npm 库作者**的两件大事：**从零搭工程**（配合 `create-react-native-library`）和 **把 TypeScript / JSX 源码编译成可发布的多种产物**（CommonJS、ESM、`.d.ts`、Codegen 等）。

日常类比：你要开一家「调料包」工厂，卖给全国各地的火锅店（各种 App 和打包工具）。原料是带 JSX、TypeScript 的「生鲜配方」（`src/`），但顾客厨房的灶具不一样——有的只认 CommonJS 老锅，有的要 ESM 新灶，有的还要附带「成分表」（类型定义）。Bob 就像**中央厨房的标准化流水线**：你只管在 `src/` 写配方，它按 `package.json` 里的配置，自动产出 `lib/` 里多套成品，并在 `npm publish` 前通过 `prepare` 钩子自动跑一遍。

Bob 本身不替代 React Native 运行时，它服务的是**库维护者**，不是 App 业务开发者。与之配套的脚手架命令是：

```bash
# 新建一个带 example App、CI、Bob 预配置的 RN 库
npx create-react-native-library@latest awesome-library

# 给已有库一键接入 Bob 构建
npx react-native-builder-bob@latest init
```

官方文档：https://oss.callstack.com/react-native-builder-bob/

## 为什么重要

如果你要**发布**或**在 monorepo 内共享** React Native 原生模块 / JS 工具库，不理解 Bob 会在这些场景踩坑：

- **直接发布 `src/` 里的 TSX**：消费者的 Metro / Webpack 未必能正确处理你的 Babel 配置；类型文件路径混乱，IDE 补全体验差
- **手写 Babel + tsc 双配置**：`module` / `main` / `types` / `exports` 字段要对齐多套输出目录，漏一项就会在 ESM-only 或 legacy Node 环境里 `require is not defined`
- **新架构（Turbo Module + Fabric）**：Codegen 生成物何时打进 npm 包、`cmakeListsPath` 如何指到生成目录——Bob 的 `codegen` target 把这条链纳入 `bob build`
- **本地库 vs 发 npm**：在 App 仓库里用 `--local` 建 `modules/awesome-library`，比把代码塞进 `android/`、`ios/` 更易升级 RN、复制到其他项目

Bob 在 RN 生态里的地位类似前端库里的 **tsup / unbuild / microbundle**，但默认约定（`react-native` 字段指向源码、`exports.source`、Codegen 集成）是**按 RN 库规范定制**的。

## 核心概念

Bob 的心智模型可以拆成四块：

### 1. 两个 CLI，分工明确

| 工具 | 职责 |
|------|------|
| `create-react-native-library` | **脚手架**：生成库目录、example App、ESLint/Prettier/Lefthook、GitHub Actions、Kotlin/Swift/C++ 模板、**预置 Bob 配置** |
| `react-native-builder-bob` | **构建器**：`init` 给老项目加配置；`build` 按 targets 编译 |

你完全可以只用后者：已有仓库执行 `npx react-native-builder-bob@latest init`，不必重新 scaffold。

### 2. `source` → `output` → `targets`

配置写在 `package.json` 的 `react-native-builder-bob` 字段，或根目录 `bob.config.js`：

- **`source`**：源码根目录，需包含 `index` 入口（如 `src/index.tsx`）
- **`output`**：编译输出根目录（常见 `lib/`）
- **`targets`**：要生成哪些产物

常见 targets：

| Target | 作用 | 典型 `package.json` 指向 |
|--------|------|---------------------------|
| `module` | Babel 编译为 **ESM**（`import`/`export` 保留） | `exports['.'].import` 或 `module` 字段 |
| `commonjs` | Babel 编译为 **CommonJS** | `main` 或 `exports['.'].require` |
| `typescript` | `tsc` 生成 **`.d.ts`** | `types`、`exports['.'].types` |
| `codegen` | 运行 RN **Codegen**，生成 Turbo/Fabric 脚手架代码 | 原生工程 `ios/generated`、`android/generated` |
| `custom` | 挂自定义 npm script | 适合额外打包步骤 |

`module` target 常配 `{ "esm": true }`，以符合 Node 12+ 与现代 bundler 的 `package.json#exports` 约定。

### 3. 入口字段：开发读源码，发布用 `lib/`

Bob 推荐的双轨入口（简化版）：

```json
{
  "main": "./lib/module/index.js",
  "types": "./lib/typescript/src/index.d.ts",
  "exports": {
    ".": {
      "source": "./src/index.tsx",
      "types": "./lib/typescript/src/index.d.ts",
      "default": "./lib/module/index.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["lib", "src"]
}
```

含义：

- **开发 / Metro**：通过 `exports` 的 `source` 或传统 `react-native` 字段直接消费 `src/`，热更新快
- **发布后消费者**：拿到编译好的 `lib/`，不依赖你的 Babel 插件链
- **`files`**：控制 npm 包里实际包含哪些目录（通常 `lib` + `src`）

### 4. `prepare` vs `prepack`：何时自动 `bob build`

```json
"scripts": {
  "prepare": "bob build"
}
```

- **`prepare`**：`npm publish`、从 Git URL `npm install`（Yarn 1 / npm / pnpm）时会跑——适合多数库
- **`prepack`**：任意包管理器 `publish` 时都会跑；Yarn 4 从 Git 安装时也依赖它

官方建议拿不准就用 **`prepare`**。本地开发可手动 `yarn bob build` 或配置 watch。

### 5. 本地库（`--local`）

在**已有 App** 的目录执行 scaffold，会生成 `modules/awesome-library` 一类结构，通过 `link:`（Yarn）或 `file:`（npm）链到主工程，走 **autolinking**，无需把原生代码塞进 App 的 `android/`、`ios/`。适合 monorepo、Expo dev client 内嵌原生模块、或暂时不发 npm 的内部库。

## 实践案例

### 案例 1：从零创建可发布库

```bash
npx create-react-native-library@latest react-native-awesome-storage
# 交互式选择：Turbo Module / Fabric / 仅 JS / Expo Web 等

cd react-native-awesome-storage
yarn
yarn example start   # 启动 example App 调试库代码
```

生成物通常已包含：

```json
"scripts": {
  "prepare": "bob build",
  "watch": "bob build --watch"
},
"react-native-builder-bob": {
  "source": "src",
  "output": "lib",
  "targets": [
    ["module", { "esm": true }],
    "commonjs",
    "typescript"
  ]
}
```

发布前在库根目录执行 `npm pack` 可本地检查 tarball 是否含 `lib/` 与类型文件。

### 案例 2：给已有 JS/TS 库接入 Bob（`init` 等价的手动配置）

假设库源码在 `src/index.ts`，希望产出 ESM + 类型定义：

```bash
yarn add --dev react-native-builder-bob
```

`package.json` 片段：

```json
{
  "name": "my-rn-utils",
  "scripts": {
    "prepare": "bob build"
  },
  "react-native-builder-bob": {
    "source": "src",
    "output": "lib",
    "targets": [
      ["module", { "esm": true }],
      "typescript"
    ]
  },
  "main": "./lib/module/index.js",
  "types": "./lib/typescript/src/index.d.ts",
  "exports": {
    ".": {
      "source": "./src/index.ts",
      "types": "./lib/typescript/src/index.d.ts",
      "default": "./lib/module/index.js"
    }
  },
  "files": ["lib", "src"]
}
```

`.gitignore` 增加：

```
lib/
```

若使用 Jest，避免测试跑到编译产物：

```json
"jest": {
  "modulePathIgnorePatterns": ["<rootDir>/lib/"]
}
```

然后：

```bash
yarn bob build
ls lib/module lib/typescript
```

### 案例 3：在 monorepo App 内建本地原生库

```bash
cd MyApp
npx create-react-native-library@latest awesome-bridge --local
```

主 App `package.json` 会自动出现类似：

```json
"dependencies": {
  "awesome-bridge": "link:./modules/awesome-bridge"
}
```

库代码在 `modules/awesome-bridge/`，通过 autolinking 进 Android Gradle / iOS CocoaPods，升级 RN 时不必 merge 进 App 原生目录的冲突补丁。

## 开发工作流速查

```bash
# 监听源码变更并增量编译
yarn bob build --watch

# 只构建某一 target（例如 Codegen）
npx bob build --target codegen

# 老项目一键写入 Bob 配置
npx react-native-builder-bob@latest init
```

`create-react-native-library` 生成的 `CONTRIBUTING.md` 会描述在 example App 里跑 iOS/Android/Web 测试的具体命令；Bob 负责的是**库包构建**，example 负责**集成验证**。

## 常见坑与排查

1. **`lib/` 被提交进 Git**  
   应在 `.gitignore` 忽略；CI 应在 publish 前能跑 `bob build`。若 `lib/` 陈旧，消费者会用到过期编译结果。

2. **`main` / `exports` 与 targets 不一致**  
   启用了 `commonjs` 却只在 `exports.default` 指 ESM 文件，会在 `require()` 场景报错。对照 [官方 ESM 兼容说明](https://oss.callstack.com/react-native-builder-bob/esm) 做 dual package。

3. **类型路径对不上**  
   `typescript` target 默认读根目录 `tsconfig.json`；可用 `["typescript", { "project": "tsconfig.build.json" }]` 分离开发/发布配置。

4. **Codegen 与 `includesGeneratedCode`**  
   若把生成代码打进 npm，需在 `codegenConfig` 设 `includesGeneratedCode: true` 并配置 `outputDir`；同时更新 iOS import 路径与 Android `react-native.config.js` 的 `cmakeListsPath`——官方 build 文档有逐步清单。

5. **与 App 开发混淆**  
   Bob 不替代 Metro bundler 跑业务 App；它是**库作者**在 publish 前的构建步骤。写 App 用 Expo / RN CLI 即可，只有当你维护 `react-native-*` 包时才需要 Bob。

## 和相近工具的关系

| 工具 | 关系 |
|------|------|
| **create-react-native-library** | Bob 官方脚手架，创建时即带好 Bob |
| **Expo Modules API** | 另一套写原生模块的路径；也可用 Bob 编译纯 JS 层 |
| **tsup / rollup** | 通用 TS 库打包；缺少 RN 的 `source` 字段、Codegen target 等约定 |
| **React Native 文档「本地库」** | Bob `--local` 是更工程化、可迁移的替代方案 |

## 小结

**react-native-builder-bob** 把 React Native 库作者从「手写 Babel + tsc + 入口字段对齐」里解放出来：源码留在 `src/`，`bob build` 产出 CommonJS / ESM / 类型 / Codegen 等多套目标，并在 `npm publish` 时通过 `prepare` 自动执行。配合 **create-react-native-library**，可以从零得到带 example、CI、新架构模板的标准库仓库；配合 **`--local`**，可以在 App monorepo 里以可复用包的形式写原生桥接，而不污染 App 自身的 `android/`、`ios/`。

记住一句类比：**App 开发者炒菜，库作者卖标准化调料包——Bob 就是那台把生鲜配方变成多规格包装的生产线。**
