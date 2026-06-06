---
title: Electron Forge — 官方一体化桌面应用构建与发布工具链
来源: 'https://github.com/electron/forge'
日期: 2026-06-06
分类: 后端 API
子分类: 移动端
难度: 中级
---

## 是什么

Electron Forge 是 Electron 官方维护的**一体化构建流水线**——脚手架、bundler（把 JS 文件打包成一份的工具，如 Vite/webpack）集成、跨平台打包、代码签名、安装包发布，一条命令全搞定。日常类比：它像装修界的"全包公司"，你只要告诉它户型（你的源码），它替你安排水电工（webpack/vite）、木工（maker）、验收（code signing）、交房（publisher）——你不需要一个个找单独的工匠然后自己协调。

在 Electron Forge 出现之前，开发者通常要自己拼接三四个工具：`electron-packager` 压包、`electron-builder` 签名、一个 CI 脚本发布。Forge 的价值在于把这些**粘合进统一的生命周期（Hooks）**，配置文件只有一个 `forge.config.js`：

```js
module.exports = {
  packagerConfig: { asar: true },
  makers: [
    { name: '@electron-forge/maker-dmg' },
    { name: '@electron-forge/maker-squirrel', config: { name: 'MyApp' } }
  ],
  plugins: [
    { name: '@electron-forge/plugin-vite', config: { build: [/* ... */] } }
  ]
};
```

三个角色明确：**Makers**（生产产物）、**Publishers**（推送到目标）、**Plugins**（开发阶段打包）。打包完成后，Forge 会把所有源码和资源打进 **ASAR**（Electron 专属的单文件归档格式，类似 ZIP，让主进程可以直接读取而无需解压到磁盘）。

## 为什么重要

不理解 Electron Forge，下面这些事情都没法解释：

- 为什么同一份 JS 代码能在 macOS 打出 .dmg、在 Windows 打出 .exe 安装包——Makers 层做了平台差异抽象
- 为什么 electron-builder 和 electron-forge 都能打包，官方却推荐 Forge——两者定位和维护主体不同
- 为什么 Forge 项目里 `npm run make` 就出安装包，而手写 electron-packager 需要十几个参数
- 为什么 CI 上代码签名经常静默失败——Forge 的签名流程对环境变量有严格依赖，配错就跳过

## 核心要点

Forge 的设计可以拆成**三层抽象**：

1. **Plugins（打包层）**：控制开发阶段和生产构建。webpack-plugin 和 vite-plugin 是最常用的两个。它们在 `forge dev` 时启动热重载服务，在 `forge package` 时生成 bundle。没有这层，Forge 不知道怎么处理你的 JS 源码。

2. **Makers（产物层）**：把打好包的应用转成各平台的可分发格式。`maker-dmg` → macOS disk image，`maker-squirrel` → Windows NSIS 安装包，`maker-deb` / `maker-rpm` → Linux 包。每个 Maker 只负责一种格式，互相独立，按 `platforms` 字段决定是否运行。类比：Maker 是"包装工"，一个专门包 Apple 风格礼盒，一个专门包 Windows 风格礼盒。

3. **Publishers（分发层）**：把 Makers 输出的文件推送到目标存储。`publisher-github` 推到 GitHub Releases，`publisher-s3` 推到对象存储，`publisher-electron-release-server` 推到自建服务。Publisher 拿到 Maker 的输出路径列表，逐一上传。

三层串起来，加上 Hooks API 在 `postMake` / `prePatch` 等节点注入自定义逻辑，形成完整的 CI/CD 流水线。

## 实践案例

### 案例 1：从零新建带 Vite + TypeScript 的桌面应用

```bash
npx create-electron-app@latest my-app --template=vite-typescript
cd my-app
npm start        # 热重载开发模式
npm run make     # 生成本平台安装包
npm run publish  # 上传到 GitHub Releases
```

`forge.config.js` 里 plugin-vite 配置的是主进程和渲染进程各一个 Vite config——主进程 bundle 到 `dist/main`，渲染进程 bundle 到 `dist/renderer`。Forge 打包时自动把两者合并进 ASAR。

整个从 0 到出安装包的时间在 5 分钟内，对比手工配置省去了 30+ 行 webpack/vite 配置和 packager 参数。

### 案例 2：迁移老 electron-builder 项目到 Forge

原项目 `package.json` 里有一个 `build` 字段控制 electron-builder，迁移步骤：

1. 安装 Forge CLI：`npm i -D @electron-forge/cli && npx electron-forge import`（import 命令自动检测并转换配置）
2. `build.mac.target` → `@electron-forge/maker-dmg`
3. `build.win.target: nsis` → `@electron-forge/maker-squirrel`
4. 删除 `electron-builder.yml`，检查 `forge.config.js` 的 packagerConfig

```js
// 迁移后的 forge.config.js 片段
makers: [
  { name: '@electron-forge/maker-dmg', config: { format: 'ULFO' } },
  { name: '@electron-forge/maker-squirrel', config: { name: 'MyApp', setupExe: 'MyAppSetup.exe' } },
  { name: '@electron-forge/maker-deb', config: {} }
]
```

注意：electron-builder 的 `extraResources` 对应 Forge 的 `packagerConfig.extraResource`，字段名略有差异，需逐一比对文档。

### 案例 3：GitHub Actions CI/CD 自动发布

```yaml
# .github/workflows/release.yml
- name: Install dependencies
  run: npm ci

- name: Make distributables
  run: npm run make
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}

- name: Publish to GitHub
  run: npm run publish
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`publisher-github` 读取 `GITHUB_TOKEN` 自动创建 Release 并上传 `.dmg` / `.exe` / `.deb`。Windows 代码签名需要额外的 EV 证书环境变量。macOS 公证（notarization）通过 `@electron/notarize` 插件挂到 `postMake` Hook。

## 踩过的坑

1. **Yarn Berry PnP 不兼容**：Forge 用朴素的 `node_modules` 目录扫描来收集依赖，Yarn 2+ 的 PnP 格式（`.pnp.cjs`）完全绕过了目录，导致打包时找不到依赖。解决：在 `.yarnrc.yml` 加 `nodeLinker: node-modules` 退回传统模式。

2. **pnpm 默认 non-hoisted 结构**：pnpm 把依赖放在 `.pnpm/` 目录的特殊结构里，Forge 找不到。修复：项目根目录的 `.npmrc` 加 `node-linker=hoisted`，或升级到 Forge v7.7.0+（官方提供了更好的 pnpm 兼容性）。

3. **原生 Node 模块打进 ASAR 崩溃**：`.node` 是二进制动态库，不能直接解压自 ASAR；运行时会报 `Error: Module did not self-register`。修复：在 `forge.config.js` 的 `packagerConfig.asar.unpack` 里用 glob 排除 `**/*.node`，让 Forge 把这些文件放在 ASAR 外部。

4. **macOS 签名在 CI 静默跳过**：Forge 默认尝试代码签名，但如果 `APPLE_ID` / `APPLE_TEAM_ID` 等环境变量缺失，它**不报错**，直接生成未签名的 .dmg。用户下载后 Gatekeeper 拦截。解决：在 packagerConfig 里显式设 `osxSign: { identity: '...' }` 并在 CI 挂证书，或在测试流水线里显式 `osxSign: null` 跳过签名。

## 适用 vs 不适用场景

**适用**：
- 新建 Electron 项目，想要开箱即用的热重载 + 打包 + 发布一体化
- 需要同时支持 macOS / Windows / Linux 三端安装包，且要代码签名
- 团队规模小，不想维护复杂的自定义打包脚本
- 已有 electron-builder 项目，想迁移到官方维护的工具链

**不适用**：
- 项目重度依赖 Yarn PnP 或自定义 monorepo 工具（迁移成本高）
- 需要极细粒度控制打包产物（Forge 抽象层遮蔽了部分 electron-packager 选项）
- 不用 Electron，用 Tauri / NW.js——这些有自己的 CLI
- 老项目已经有完善的 electron-builder 流程且运作良好——迁移收益不明显

## 历史小故事（可跳过）

- **2013 年**：Electron（当时叫 Atom Shell）在 GitHub 内部诞生，主要用来驱动 Atom 编辑器。
- **2015-2018 年**：社区爆发，大量团队用 electron-builder（社区开发者 develar 发起）作为事实标准打包工具；electron-forge 由另一批社区开发者另起炉灶，目标是把打包门槛降到"一行命令"。
- **2022 年**：Electron 官方团队宣布将 electron-forge 纳入官方维护范围（v6 大版本），官方文档和 Getting Started 正式推荐 Forge，electron-builder 退为"社区方案"。
- **2023 年**：v7 发布，加入 pnpm ≥ v7.7.0 的正式支持，模板增加 `vite-typescript`，与现代前端工具链进一步对齐。

## 学到什么

1. **"官方" ≠ "功能最多"**：Forge 把 electron-builder 的部分高级特性抽象掉了，换来的是更低的上手门槛和官方的维护承诺——取舍值不值得看项目复杂度。
2. **三层抽象（Plugins / Makers / Publishers）**是处理"多平台 × 多环境"组合爆炸的经典套路——在 CI 层也能看到同样的 Source / Build / Artifact / Deploy 分层。
3. **模块解析朴素性是工具链的隐形约束**：Forge 的 `node_modules` 扫描假设暴露了 Yarn PnP / pnpm 这类"优化包管理器与打包工具的边界摩擦"——越是激进的优化，越容易和别的工具不兼容。
4. **代码签名失败往往"静默"**：分发工具在 CI 上的签名错误不该静默跳过，这是 Forge 早期版本的设计缺陷，教训是：关键安全步骤必须明确 fail-fast。

## 延伸阅读

- 官方文档：[Electron Forge — Getting Started](https://www.electronforge.io/)（完整 Makers / Publishers / Plugins 参考）
- 官方仓库：[github.com/electron/forge](https://github.com/electron/forge)（Issues 里有大量真实踩坑记录）
- [[electron]] —— Electron 运行时本体，Forge 是它的构建层
- [[electron-builder]] —— Forge 的前任/竞争方案，功能更多但配置更复杂
- [[vite]] —— Forge vite-plugin 背后的打包引擎
- [[webpack]] —— Forge webpack-plugin 背后的打包引擎

## 关联

- [[electron]] —— Forge 封装的运行时，没有 Electron 就没有 Forge 的存在意义
- [[electron-builder]] —— 社区方案，与 Forge 功能重叠最多；迁移方向是 builder → forge
- [[vite]] —— Forge 的现代 bundler 选项，vite-plugin 提供最快的热重载
- [[webpack]] —— Forge 的老牌 bundler 选项，稳定但配置冗长
- [[tauri]] —— 用 Rust + WebView2/WKWebView 的跨平台替代，包体积比 Electron 小 10 倍以上
- [[neutralinojs]] —— 更轻量的跨平台桌面方案，不带 Node.js 运行时

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

