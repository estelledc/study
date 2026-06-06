---
title: Electron Forge — 官方一体化桌面应用构建流水线
来源: 'https://github.com/electron/forge'
日期: 2026-06-06
分类: 后端 API
子分类: 移动端
难度: 初级
---

## 是什么

Electron Forge 是 Electron 官方推荐的**一体化构建与发布工具链**，把脚手架初始化、bundler 集成、平台打包（DMG/NSIS/AppX/Flatpak）、代码签名和 artifact 发布整合进一条流水线，是替代社区版 electron-builder 的官方答案。

日常类比：就像餐厅的"套餐流水线"——你只需要提供食材（代码），备料、烹饪、摆盘、打包外卖（生成安装包）到配送（发布到 GitHub Releases）全部由流水线搞定，不用自己拼散件厨具。

在 Forge 出现之前，开发者通常要手动把 electron-packager、electron-builder、代码签名脚本逐一拼接，每换一台 CI 机器就重新调试一遍。Forge 的核心思路是：一个 `forge.config.js`，三层抽象覆盖全流程——**Makers**（生成平台安装包）、**Publishers**（上传发布）、**Plugins**（开发阶段 bundler 集成）——从 `npm run dev` 到 `npm run publish` 一气呵成。

2022 年 Electron 官方团队接管维护，v7（2023）加入 pnpm 支持、Vite Plugin 稳定，官方正式宣布 Forge 是首推工具链。

## 为什么重要

不理解 Electron Forge，下面这些事都没法解释：

- 为什么同一份代码能同时产出 macOS 的 `.dmg`、Windows 的 `.exe` 安装程序和 Linux 的 `.deb`——靠的是 Makers 的多目标抽象
- 为什么 CI 上打包总比本地多出一堆签名错误——Forge 把签名嵌在 Makers 里，缺证书时会静默产出未签名产物而不是直接报错
- 为什么 `npx create-electron-app@latest` 一行命令能拿到带热重载的完整脚手架——Forge 替你内置了 Vite/webpack Plugin 和合理默认值
- 为什么从 electron-builder 迁移到 Forge 改动如此之小——两者共享大部分 Makers 概念，官方提供 `electron-forge import` 自动转换命令

## 核心要点

Forge 的三层抽象是理解它一切行为的钥匙：

1. **Makers — 生成平台产物**：每个 Maker 对应一种安装包格式。`@electron-forge/maker-dmg` 产出 macOS 磁盘镜像，`@electron-forge/maker-squirrel` 产出 Windows NSIS 安装程序，`@electron-forge/maker-deb` 产出 Linux .deb 包。类比：Maker 就是模具——同一块"面团"（构建产物）压进不同模具，出来的形状（安装包格式）各不相同。`npm run make` 命令自动检测当前操作系统，只跑对应 Maker。

2. **Publishers — 上传发布**：`@electron-forge/publisher-github` 把各平台产物上传到 GitHub Releases，`publisher-s3` 推到 S3 私有桶。Publisher 把"产出文件"和"把文件交给用户"解耦，CI 只调 `npm run publish`，切换发布目的地只改 `forge.config.js` 里的 `publishers` 数组，不动 CI 脚本。

3. **Plugins — 开发阶段集成**：`@electron-forge/plugin-vite` 把 Vite 嵌进 Forge 生命周期，让主进程（main）和渲染进程（renderer）同时享受 HMR；`plugin-webpack` 同理。Hooks 则允许在 `generateAssets`、`prePackage`、`postMake` 等生命周期节点注入自定义脚本，类比 Git hooks，但面向打包流程而非版本控制。

## 实践案例

### 案例 1：从零创建 Vite + TypeScript Electron 应用

```bash
# 创建项目（选 vite-typescript 模板）
npx create-electron-app@latest my-app --template=vite-typescript
cd my-app

npm start          # 热重载开发模式，主进程 + 渲染进程同时 HMR
npm run make       # 生成当前平台安装包，输出到 out/make/
npm run publish    # 上传到 GitHub Releases（需提前设置 GITHUB_TOKEN）
```

`forge.config.js` 关键配置：

```js
const { VitePlugin } = require('@electron-forge/plugin-vite');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');

module.exports = {
  packagerConfig: {
    asar: true,                          // 把源码打成 ASAR 归档
    asar: { unpack: '**/*.node' },       // .node 原生模块排除在外
  },
  makers: [
    { name: '@electron-forge/maker-squirrel', config: {} },  // Windows
    { name: '@electron-forge/maker-dmg', config: {} },       // macOS
    { name: '@electron-forge/maker-deb', config: {} },       // Linux
  ],
  plugins: [
    new VitePlugin({ renderer: [{ name: 'main_window' }] }),
    new FusesPlugin({ /* 关闭不需要的 Electron 安全特性 */ }),
  ],
};
```

- `asar: true`：把 JS 源码打成只读归档，用户无法直接解压读取
- `makers` 数组：在 macOS 上 `make-squirrel` 自动跳过，只跑 `maker-dmg`
- `VitePlugin`：替换传统 webpack，开发构建快 10 倍以上

### 案例 2：从 electron-builder 迁移

老项目的 `package.json` 里有 `"build": { "appId": "...", "mac": {}, "win": {} }` 这样的字段，迁移步骤：

```bash
npm install --save-dev @electron-forge/cli
npx electron-forge import
```

`import` 命令自动完成：
1. 读取 `package.json` 里的 `build` 字段
2. 把 `mac`/`win`/`linux` targets 映射为对应 Makers
3. 生成 `forge.config.js`，删除旧的 `electron-builder` 配置
4. 把 npm scripts 里的 `electron-builder` 替换为 `electron-forge`

迁移后先跑 `npm run make` 验证产物，再把 CI 里的 `electron-builder --mac --win` 统一替换为 `npm run make`。

### 案例 3：企业内网私有分发与静默自动更新

```js
// forge.config.js — S3 私有桶分发方案
module.exports = {
  packagerConfig: { asar: true },
  makers: [
    { name: '@electron-forge/maker-squirrel', config: {} },
    { name: '@electron-forge/maker-dmg', config: {} },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-s3',
      config: {
        bucket: 'corp-updates-bucket',
        region: 'cn-northwest-1',
        public: false,                    // 私有桶，不对外公开
        keyResolver: (filename, platform, arch) =>
          `releases/v${process.env.npm_package_version}/${platform}/${filename}`,
      },
    },
  ],
};
```

配合 `electron-updater`，主进程在启动时检查 S3 上的版本 JSON，后台静默下载新版本，下次启动时自动替换。整个流程不依赖 GitHub，适合无公网访问的企业内网环境。Windows 需要 EV 代码签名证书（避免 SmartScreen 拦截），macOS 需要 Apple 公证。

## 踩过的坑

1. **Yarn Berry PnP 模式不兼容**：Forge 的模块解析不识别 PnP 符号链接，打包时报 `Cannot find module`；在 `.yarnrc.yml` 里加 `nodeLinker: node-modules`，切回传统 node_modules 解决。

2. **pnpm 非 hoisted 模式踩坑**：pnpm 默认不 hoist 依赖，Forge 在扫主进程依赖时抓不到某些包；在 `.npmrc` 加 `node-linker=hoisted`，或升级到 Forge v7.7.0+ 并显式配置 `pnpm` 模式。

3. **原生 `.node` 模块打进 ASAR 后崩溃**：`.node` 是平台编译的二进制文件，不能被 ASAR 归档读取，运行时报 `Invalid ELF header`；在 `packagerConfig.asar.unpack` 字段用 `**/*.node` glob 排除所有原生模块。

4. **macOS 代码签名在 CI 静默失败**：没挂 `APPLE_ID`/`TEAM_ID`/`APPLE_APP_SPECIFIC_PASSWORD` 时，maker-dmg 跑签名流程但不抛出错误，产出的是未签名 DMG，Gatekeeper 会拦截；开发期显式在 Makers 配置里加 `sign: false` 跳过，CI 里通过 GitHub Secrets 正确注入 Apple 凭据。

## 适用 vs 不适用场景

**适用**：

- 新建 Electron 应用，希望从开发到发布用同一套工具不换轮子
- 需要同时发布 macOS/Windows/Linux 三平台安装包
- 团队规模小，不想维护复杂 CI 打包脚本
- 已有 electron-builder 项目，想迁移到官方维护链路、跟上 Electron 主版本更新

**不适用**：

- 需要极高度定制打包流程（如 Chromium 源码级改动）——此时手写脚本灵活性更高
- 项目强依赖 Yarn Berry PnP 模式且不愿切换链接器
- 只需要开发环境热重载、不做任何打包发布——直接 `electron .` 配合 Vite 即可，Forge 引入额外开销
- 构建 NW.js 或 Tauri 应用——Forge 专为 Electron 设计，不支持其他运行时；Tauri 用 `tauri-cli` 自带的工具链

## 历史小故事（可跳过）

- **2013 年**：Electron（原名 Atom Shell）在 GitHub 内部孵化，为 Atom 编辑器提供跨平台 Web 容器。社区用户自行组合 electron-packager 打包，签名和发布靠手写 shell 脚本。
- **2015-2021 年**：社区版 electron-builder 崛起，提供比 electron-packager 更完整的一体化能力，成为事实标准。electron-forge 最初由社区开发者 Felix Rieseberg 创建，但功能较碎片化。
- **2022 年**：Electron 官方团队接管 electron-forge 并重写 v6，electron-packager 进入只维护模式（不再加新功能），两者分工明确——packager 作为底层、forge 作为用户层工具链。
- **2023 年 v7**：pnpm 支持正式落地、Vite Plugin 稳定发布、FusesPlugin（Electron 安全开关）内置。官方文档首页推荐由 electron-builder 切换到 electron-forge，标志着工具链迭代交接完成。

## 学到什么

1. **工具链整合 > 单点工具相加**：Forge 把 packager + builder + publisher 三段流程的胶水代码变成内置抽象，减少的是配置维护负担，不是功能
2. **官方维护的价值**：社区版工具靠个人热情驱动，官方工具跟着主版本走——Electron API 改了，Forge 同步更新，不需要等社区 patch
3. **三层分离即单一职责**：Makers/Publishers/Plugins 每层只管一件事，换一个 Publisher 不影响 Makers，这是职责单一原则在 CLI 工具设计里的体现
4. **配置文件即设计文档**：`forge.config.js` 集中记录了"这个应用输出哪些平台、签名策略是什么、发布到哪里"，新成员看一眼就能理解整个发布流程

## 延伸阅读

- 官方文档：[Electron Forge — Getting Started](https://www.electronforge.io/import-existing-project)（从安装到 publish 的完整流程）
- 迁移指南：[Migrating from electron-builder](https://www.electronforge.io/guides/framework-integration/migrating-from-builder)（官方一对一字段映射）
- Vite Plugin 文档：[Forge Vite Plugin](https://www.electronforge.io/config/plugins/vite)（配置热重载开发环境）
- [[electron]] —— Electron 是 Forge 的宿主运行时；理解主进程/渲染进程结构是配置 Forge 的前提
- [[electron-builder]] —— Forge 的前任"事实标准"；了解差异有助于评估迁移成本

## 关联

- [[electron]] —— Electron 跨平台桌面运行时；Forge 是它的官方构建伴侣，两者版本同步发布
- [[electron-builder]] —— 社区版打包工具；Forge 是其官方替代，`electron-forge import` 命令自动完成配置迁移

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[electron]] —— Electron — Chromium + Node.js 跨平台桌面应用框架
- [[electron-builder]] —— electron-builder — 一条命令把 Electron 应用打包发布到全平台
- [[neutralinojs]] —— Neutralinojs — 用系统 webview 写桌面应用，2MB 搞定
- [[tauri]] —— Tauri — Rust 写的 Electron 替代，用系统 webview 打包桌面/移动端应用
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[webpack]] —— webpack 模块打包

