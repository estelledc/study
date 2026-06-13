---
title: Metro — React Native 的 JavaScript 打包器
来源: https://github.com/facebook/metro
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
provenance: pipeline-v3
---

## 是什么

**Metro** 是 Meta（Facebook）为 **React Native** 打造的开源 JavaScript 打包器（bundler）。它把分散在工程里的 `.js` / `.ts` / `.tsx`、图片、字体等资源，沿着 `import` / `require` 关系递归收集，**编译、合并、序列化**成手机 App 或开发服务器能加载的单个（或少量）bundle。

日常类比：Metro 像一家**地铁调度中心**（名字 Metro 即「地铁」）——

- 每个源文件是一个**站点**；
- `import` 是**线路**；
- Resolver（解析器）负责查时刻表、决定列车走哪条线；
- Transformer（转换器）在站台把乘客（源码）翻译成统一格式（Babel 转译后的 JS）；
- Serializer（序列化器）把整条线路上的车厢**编组**成一列完整列车（bundle）；
- Dev Server 在开发时**按需发车**：你改一个文件，只重新编组受影响的那几节车厢（增量构建），而不是每次整列重造。

React Native 从第一天起就用 Metro；Expo、`npx react-native start`、EAS Build 底层都是它。官方文档：[metrobundler.dev](https://metrobundler.dev/)，源码：[facebook/metro](https://github.com/facebook/metro)。

## 为什么重要

不理解 Metro，下面这些 RN / 移动端前端现象就说不清：

- **为什么 `npx react-native start` 默认监听 8081**——Metro dev server 的默认端口
- **为什么改 `.tsx` 能秒级热更新，改 `metro.config.js` 却要重启**——配置在 bundler 启动时加载，模块图缓存与 watcher 绑定在旧配置上
- **为什么可以写 `import icon from './icon.png'`**——Metro 把 PNG 当 asset 模块处理，运行时返回 `require` 解析后的资源 ID
- **为什么同一份代码能 `import './foo.ios.js'` 和 `import './foo.android.js'`**——平台扩展（platform extensions）由 Resolver 按 `platform` 参数选文件
- **为什么 Hermes 的 `.hbc` 字节码是在 Metro bundle 之后生成的**——Metro 产出 JS bundle，Hermes 编译器在原生构建阶段再把它变成字节码

## 核心概念

Metro 的配置与流水线围绕五个子系统组织（见官方 Configuration 文档）：

```
入口 (entry)
    │
    ▼
┌───────────┐    模块名 → 绝对路径
│  Resolver │    处理 node_modules、别名、平台扩展、资源
└─────┬─────┘
      ▼
┌─────────────┐  Babel / TS / 自定义 transformer
│ Transformer │
└─────┬───────┘
      ▼
┌─────────────┐  依赖图 → 单个 JS 字符串 + source map
│ Serializer  │
└─────┬───────┘
      ▼
┌─────────────┐  HTTP 提供 bundle；HMR / Fast Refresh
│   Server    │  默认开发端口 8081
└─────────────┘
```

### 1. Resolver（模块解析）

给定 `import X from 'moduleName'`，Resolver 回答：**磁盘上的哪个文件**对应这个模块？

默认规则（`metro-resolver`）大致包括：

- **相对路径** `./foo`、`../bar` → 按目录查找
- **node_modules** → 读 `package.json` 的 `main` / `browser` / `react-native` 字段（RN 默认 `resolverMainFields: ['react-native', 'browser', 'main']`）
- **平台扩展**：存在 `Button.ios.js` 与 `Button.android.js` 时，打 iOS bundle 选前者
- **资源扩展**：`.png`、`.jpg` 等列入 `assetExts`，不走 Babel，而是生成 asset 描述符
- **自定义 `resolveRequest`**：别名、`@/` 路径、重定向到 shim，都挂在这里

### 2. Transformer（转换）

把每个源文件变成 Metro 内部统一的 **JS 模块** 表示。React Native 默认使用 `@react-native/metro-babel-transformer`，底层走 Babel preset（`@react-native/babel-preset`）。

常见选项：

- `inlineRequires: true`（默认）——把 `require` 推迟到函数内执行，缩短启动时同步加载链，改善 TTI
- `babelTransformerPath`——换成自定义 transformer（例如 SVG 转组件）
- `getTransformOptions`——按 bundle 类型（dev / prod、平台）动态返回选项

### 3. Serializer（序列化）

把整张**依赖图**摊平成浏览器 / JSC / Hermes 能执行的 **IIFE 模块包裹格式**（类似 webpack 的 module wrapper），并可选生成 source map、插入 polyfill、`getModulesRunBeforeMainModule`（RN 用来先跑 `InitializeCore`）。

### 4. Server 与增量构建

开发模式下 Metro **不**每次全量打包整个 `node_modules`。它维护依赖图缓存，配合 Watchman（或 Node watcher）监听文件变更，只重新 transform 受影响的模块——这是 RN 开发体验「改代码几秒内见效果」的基础。配合 **Fast Refresh**，React 组件状态在多数编辑场景下得以保留。

### 5. 配置文件优先级

Metro 读取配置的优先级（高到低）：

1. `metro.config.js`
2. `metro.config.json`
3. `package.json` 里的 `"metro"` 字段

React Native 项目应 **extend** `@react-native/metro-config`（Expo 用 `expo/metro-config`），否则缺少 RN 必需的 serializer / transformer 默认值。

## 实践案例

### 案例 1：标准 `metro.config.js`（合并默认配置）

这是 RN 模板工程最常见的写法：拿默认配置，再覆盖自己关心的字段。

```javascript
// metro.config.js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/** @type {import('metro-config').MetroConfig} */
const config = {
  resolver: {
    // 让 Metro 把 .svg 当源码用 SVGR 处理，而不是当静态资源
    assetExts: getDefaultConfig(__dirname).resolver.assetExts.filter(
      (ext) => ext !== 'svg',
    ),
    sourceExts: [...getDefaultConfig(__dirname).resolver.sourceExts, 'svg'],
  },
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
```

要点：

- `getDefaultConfig(__dirname)` 带上 RN 的 `platforms`、`resolverMainFields`、`inlineRequires` 等关键默认项
- `mergeConfig` 做深合并，避免手写时漏掉 `serializer.getPolyfills` 之类隐形依赖
- 改 `assetExts` / `sourceExts` 后需**重启** dev server

### 案例 2：自定义 Resolver 做路径别名

Monorepo 里常把 `@app` 指到 `src/`，或在 web 平台把 `react-native` 指到 `react-native-web`。Metro 推荐在 **`resolveRequest`** 里做，而不是只靠 Babel 插件——这样依赖图、HMR、预构建缓存与解析结果一致。

```javascript
// metro.config.js
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const ALIASES = {
  '@app': path.resolve(__dirname, 'src'),
};

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  watchFolders: [path.resolve(__dirname, '..')], // monorepo 根，让 Metro 能 watch 兄弟包
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName.startsWith('@app/')) {
        const filePath = path.join(
          ALIASES['@app'],
          moduleName.replace('@app/', ''),
        );
        return context.resolveRequest(
          context,
          filePath,
          platform,
        );
      }
      // 必须回退到默认 resolver，否则 node_modules 解析会断
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
```

Expo 文档补充：若项目有 `tsconfig.json` 的 `paths`，`expo/metro-config` 可自动映射；纯 RN 则需手写或借助社区方案。别名逻辑变更后**重启 server** 即可，一般不必 `--reset-cache`（与纯 Babel alias 不同）。

### 案例 3：CLI 离线打 production bundle

不启动 dev server，直接把入口打成文件——CI、调试 bundle 体积时常用：

```bash
# 为 Android 打生产包，输出 bundle + source map
npx metro build index.js \
  --platform android \
  --dev false \
  --minify true \
  --out android-release.bundle \
  --source-map

# 列出某入口会打进 bundle 的全部依赖（排查意外 import 很有用）
npx metro get-dependencies index.js --platform ios
```

在 RN 工程里，Release 构建通常由 Gradle / Xcode 脚本调用 Metro，参数与上述类似，并可能链接 Hermes 编译步骤。

## Metro vs Webpack / Vite

| 维度 | Metro | Webpack | Vite |
|------|-------|---------|------|
| 主战场 | React Native、Expo | 通用 Web、历史 RN | 现代 Web |
| 模块格式 | CommonJS 风格 wrapper + RN 约定 | ESM/CJS 均可 | 原生 ESM dev |
| 多平台 | 一等公民（`platform` 参数） | 需额外配置 | 主要针对 Web |
| 资源 | `assetExts` + 多倍图 `@2x` | loader / asset modules | 内置静态资源 |
| 默认 HMR | Fast Refresh（RN） | HMR 插件 | 原生 ESM HMR |

Metro **不追求**成为通用 Web 打包器的超集；它的优化假设是：移动 App、单入口、平台分叉、与 Hermes/JSC 配合、dev server 与真机/模拟器协同。

## 常见问题与排错

**白屏 / Unable to resolve module**

- 检查包是否在 `watchFolders` 覆盖范围内（monorepo）
- 新加了原生不认识的扩展？补 `sourceExts` 或 `assetExts`
- 执行 `npx react-native start --reset-cache` 清 transformer 缓存（比改 resolver 更「重」）

**改配置不生效**

- `metro.config.js` 变更必须重启 Metro；仅改业务源码则不必

**Bundle 体积暴涨**

- 用 `get-dependencies` 看是否误打进大型 dev 依赖
- 确认 production 构建 `--dev false --minify true`
- 检查 `inlineRequires` 与是否启用了不必要的 polyfill

**与 Hermes 的关系**

- Metro 输出 **JavaScript bundle**；Release 时 Android Gradle / iOS 构建链再调用 `hermesc` 生成 `.hbc`。调试 Metro 问题时不要和 Hermes 字节码混为一谈——先确认 JS bundle 本身是否正确。

## 学习路径建议

1. 跑起一个最小 RN 或 Expo 项目，`npx react-native start` / `npx expo start`，观察 8081 日志里的 `transform` 与 `bundle` 事件
2. 读官方 [Configuration](https://metrobundler.dev/docs/configuration/) 与 [Resolution](https://github.com/facebook/metro/blob/main/docs/Resolution.md)，对照 `metro.config.js` 改一项、验证一项
3. 用 `get-dependencies` 理解「入口文件实际拉进了哪些模块」
4. 需要 monorepo / SVG / symlinks 时，再深入 `resolveRequest` 与 `watchFolders`
5. 与 [Hermes](./hermes.md) 笔记连读：Metro 管「怎么打包」，Hermes 管「怎么在手机上更快执行打包结果」

## 参考链接

- 源码与文档：[github.com/facebook/metro](https://github.com/facebook/metro)
- 配置参考：[metrobundler.dev/docs/configuration](https://metrobundler.dev/docs/configuration/)
- React Native 集成：[reactnative.dev/docs/metro](https://reactnative.dev/docs/metro)
- Expo 定制 Metro：[docs.expo.dev/guides/customizing-metro](https://docs.expo.dev/guides/customizing-metro/)
