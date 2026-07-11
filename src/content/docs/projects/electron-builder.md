---
title: electron-builder — Electron 打包发布事实标准
来源: 'https://github.com/electron-userland/electron-builder'
日期: 2026-07-09
分类: mobile
难度: 中级
---

## 是什么

electron-builder 是**把 Electron 应用从源码打成可安装软件、再发布给用户更新**的工具。

日常类比：Electron 负责把网页变成桌面应用，像把店面装修好；electron-builder 负责装箱、贴标签、找快递、生成升级清单，确保 Windows、macOS、Linux 用户都能拿到能安装的包。

它做的不是“把 JS 压缩一下”，而是处理 installer、图标、asar、原生依赖、签名、自动更新元数据和发布目标。截至整理时仓库约 14k stars，说明它已经是 Electron 发布链路里的事实标准之一。

## 为什么重要

不理解 electron-builder，下面这些事会很难解释：

- 为什么 `npm start` 能跑的 Electron App，发给用户却不能直接双击安装。
- 为什么 macOS 会拦截未签名应用，Windows 会提示未知发布者。
- 为什么自动更新不是只写一行 `checkForUpdates`，还要有 `latest.yml`、发布服务器和版本号。
- 为什么同一份源码在 macOS、Windows、Linux 上会产出完全不同的安装格式。

## 核心要点

1. **打包目标是“系统能认的发行物”**。类比：同一件衣服寄到不同国家要不同报关单。macOS 常见是 DMG/ZIP，Windows 默认是 NSIS installer，Linux 常见是 AppImage、Snap、deb、rpm。

2. **配置是发布契约**。类比：快递面单写错，包裹再漂亮也送不到。`appId`、`productName`、`files`、`mac`、`win`、`linux`、`publish` 决定包名、升级身份、文件内容和发布地址。

3. **自动更新依赖产物和元数据一起发布**。类比：用户手里的应用会先看公告栏上的最新版本号和下载地址。builder 生成并上传公告文件，`electron-updater` 在运行时检查。

## 实践案例

### 案例 1：把最小 Electron 项目打成安装包

```bash
git clone https://github.com/electron/electron-quick-start
cd electron-quick-start
npm install
npm install --save-dev electron-builder
```

在 `package.json` 加基础字段、脚本和 build 配置：

```json
{
  "name": "hello-electron",
  "version": "1.0.0",
  "scripts": { "app:dir": "electron-builder --dir", "app:dist": "electron-builder" },
  "build": {
    "appId": "dev.example.hello",
    "productName": "Hello Electron",
    "files": ["main.js", "preload.js", "index.html", "package.json"],
    "mac": { "target": "dmg" },
    "win": { "target": "nsis" },
    "linux": { "target": "AppImage" }
  }
}
```

```bash
npm run app:dir
npm run app:dist
```

**逐部分解释**：

- `app:dir` 只生成 unpacked 目录，适合先确认文件有没有漏。
- `appId` 是应用身份，Windows 升级和通知、macOS bundle id 都会用到。
- `files` 是打进包里的内容清单；`app:dist` 才生成真正的安装包。

### 案例 2：接入 GitHub Releases 自动更新

```bash
npm install electron-updater
```

构建配置写发布目标，主进程写 updater：

```yaml
appId: dev.example.hello
productName: Hello Electron
publish: { provider: github, owner: example-org, repo: hello-electron }
win: { target: nsis }
mac: { target: [dmg, zip] }
linux: { target: AppImage }
```

```js
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
app.whenReady().then(() => autoUpdater.checkForUpdatesAndNotify());
```

```bash
GH_TOKEN="$GITHUB_TOKEN" npm run app:dist -- --publish always
```

**逐部分解释**：

- `publish.provider: github` 告诉 builder 把安装包和更新元数据放到 GitHub Releases。
- `electron-updater` 会读取打包时生成的内部配置，不需要手写 `setFeedURL`。
- Windows 默认 NSIS 支持简化自动更新；macOS 自动更新要求应用已经签名。
- 版本号必须递增，坏版本不能靠重新上传同一个版本号来“覆盖修好”。

### 案例 3：在 CI 里处理签名和多平台构建

先把“必须签名”和产物命名写清楚：

```yaml
appId: dev.example.hello
productName: Hello Electron
forceCodeSigning: true
artifactName: "${productName}-${version}-${os}-${arch}.${ext}"
mac: { target: dmg }
win: { target: nsis }
linux: { target: [AppImage, deb] }
```

证书放到 CI secrets，用环境变量交给 builder：

```bash
export CSC_LINK="file:///secure/certs/company.p12"
export CSC_KEY_PASSWORD="$CERT_PASSWORD"
npm run app:dist -- --mac dmg --win nsis
```

```bash
docker run --rm -v "$PWD":/project \
  electronuserland/builder:wine \
  /bin/bash -lc "yarn && yarn app:dist --linux --win"
```

**逐部分解释**：

- `forceCodeSigning: true` 让签名缺失变成构建失败，而不是悄悄发出未签名包。
- `CSC_LINK` 可以指向 p12/pfx 证书文件、HTTPS 链接、base64 数据或本地路径。
- `artifactName` 固定产物命名，方便发布、回滚和排查用户拿到的是哪个包。
- 官方文档明确提醒：不要幻想一个平台无条件构建全部平台；macOS 签名要在 macOS 环境处理。

## 踩过的坑

1. **把开发启动当发布验证**：`electron .` 能跑只说明源码能启动，不说明 installer、asar、签名、权限和更新都正确。
2. **随便改 `appId`**：NSIS 会用它派生安装身份，发版后改掉可能破坏升级、卸载和 Windows 通知。
3. **自动更新只测本地 unpacked 包**：真实更新要测已安装应用、发布元数据、版本递增和签名校验。
4. **忽略原生依赖和 Yarn PnP**：Electron 原生模块要匹配 Electron 版本，Yarn 3 PnP 场景还要切到 `node-modules` linker。

## 适用 vs 不适用场景

**适用**：

- Electron 应用需要正式发给用户安装，而不是只给开发者跑源码。
- 需要同时产出 macOS、Windows、Linux 的安装包或压缩包。
- 需要 GitHub、S3、generic server 等发布目标配合自动更新，并把签名、artifact 命名、文件规则固化进 CI。

**不适用**：

- 只是写一个网页或移动端 App，不需要 Electron 桌面壳。
- 只想本地临时试运行，用 `electron .` 或 `electron-builder --dir` 已够。
- 对包体极端敏感，或者团队还没有签名证书和发布流程。

## 历史小故事（可跳过）

- **2010 年代中期**：Electron 普及后，桌面 Web App 变多，打包和安装器成为共同痛点。
- **electron-builder 成熟期**：它把 macOS、Windows、Linux target、asar、图标、发布和签名整合成一个配置入口。
- **CI 化之后**：团队用 tag、draft release、token、证书和 runner 自动产出发行物。
- **v27 时代**：官方 README 写明 Node.js 需要 22.12+，升级前要关注 ESM 和 breaking changes。

## 学到什么

1. **发布不是构建的最后一步，而是一套产品能力**：安装、签名、更新、回滚和排查都属于发布。
2. **Electron 打包的难点在系统边界**：每个平台都要按自己的安装器、证书和权限规则来。
3. **自动更新是“构建时元数据 + 运行时 updater”的配合**，缺一边都不会可靠。
4. **CI 配置就是发布知识库**：把证书、目标、命名、版本和发布策略写清楚，比靠人肉记流程稳。

## 延伸阅读

- 官方文档：[electron.build](https://www.electron.build/)
- 配置入口：[Configuration](https://www.electron.build/configuration.html)
- 自动更新：[Auto Update](https://www.electron.build/auto-update.html)
- 签名设置：[Code Signing](https://www.electron.build/code-signing.html)
- 多平台构建：[Multi Platform Build](https://www.electron.build/multi-platform-build.html)

## 关联

- [[node-js]] —— electron-builder 是 Node 生态里的 CLI，v27 对 Node 版本有明确要求。
- [[vite]] —— 许多 Electron 项目先用 Vite 构建 renderer，再交给 builder 打发行包。
- [[github-actions]] —— 签名、发布和多平台矩阵通常放进 CI 自动化。
- [[docker]] —— 官方 builder 镜像是 Linux/Windows 构建的常见基础设施。
- [[changesets]] —— 自动更新强依赖版本递增，版本治理和发布说明要同步。
- [[neutralinojs]] —— 轻量桌面壳对照组，能看清 Electron 打包体积的来源。
- [[nodegui]] —— 另一条 JS 桌面路线，发布同样会遇到原生依赖和平台打包问题。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[electron]] —— Electron — 用网页技术做跨平台桌面应用
- [[tauri]] —— Tauri — 用系统浏览器内核 + Rust 做轻量桌面应用
- [[wails]] —— Wails — 用 Go + 网页技术打成单个桌面应用
