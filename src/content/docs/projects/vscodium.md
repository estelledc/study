---
title: VSCodium — 去微软遥测的 VS Code 干净构建
来源: 'VSCodium contributors, https://github.com/VSCodium/vscodium'
日期: 2026-06-01
分类: projects / 编辑器
难度: 入门
---

## 是什么

VSCodium 是 VS Code 源码（MIT 许可）的**自动化干净构建产物**。日常类比：超市卖的可乐和自家用同一份配方在家熬的可乐——配料表一致，但去掉了厂家的防腐剂和品牌包装。它的核心不是另写一个编辑器，而是**一个 CI 脚本仓库**：每天拉一次微软的 vscode 源码，把品牌定制和遥测端点的 product.json 换成中性版，再跑 vscode 自带的 gulp 构建脚本，输出 deb / rpm / dmg / msi / tarball。

你装上后看到的还是那个熟悉的界面：

```bash
brew install --cask vscodium
codium .   # 命令叫 codium 不是 code
```

启动后默认打开的 marketplace 不是微软的 marketplace.visualstudio.com，而是社区版 open-vsx.org；右下角不会再有"使用情况和崩溃数据正在发送"的小字。版本号与官方 VS Code 同步——上游今天发 1.96.0，VSCodium 今晚或明早就跟上 1.96.0。

## 为什么重要

不理解 VSCodium 的定位，下面这些事都没法解释：

- 为什么 VS Code 源码 MIT 但官方下载的二进制**不是 MIT 构建**——微软在自家构建里加了私有 license 包（品牌、字体、CLA 限制）
- 为什么"零遥测"在金融、医疗、政府这些受监管行业是一条硬性合规线，普通 VS Code 过不了审
- 为什么 VSCodium 不是 fork 而只是"build 仓库"——fork 意味着要维护代码差异，build 仓库只维护**构建参数差异**，长期成本天差地别
- 为什么有人愿意接受"装不了 Pylance / Remote-SSH"的代价，也要换掉官方 VS Code

## 核心要点

VSCodium 的整套机制可以拆成 **三块**：

1. **它不是 fork，是构建脚本**：仓库里没有 src/，只有 build.sh / patch/ / product.json。脚本的工作流程是 `git clone microsoft/vscode → 应用 patch → 执行 yarn gulp vscode-darwin-x64 → 签名打包`。类比：不是改菜谱，是用同一份菜谱但换掉一两味调料。这样上游升级几乎零成本——除非微软改了构建脚本本身。

2. **product.json 是开关总闸**：vscode 源码里 product.json 控制了**所有品牌和服务端点**——logo、产品名、telemetry endpoint、marketplace URL、内置扩展白名单、Settings Sync server。VSCodium 用一份"中性版" product.json 覆盖，再加少量 patch/ 补丁；几乎不改上游 src/，只维护构建参数差异。这是它长期成本远低于 fork 的关键。

3. **Marketplace 替代是 open-vsx.org**：微软的 marketplace 协议禁止非官方 VS Code 客户端连接（ToS 第 1.b 条）。VSCodium 默认指向 Eclipse 基金会维护的 open-vsx.org，绝大部分主流扩展（ESLint / Prettier / GitLens / Vim / Rust Analyzer）作者都同步发布两边。少数微软自家扩展（Pylance / Remote-SSH / C++）只发到官方 marketplace，且 license 内置了"仅限官方 VS Code"检查，VSCodium 装上会报错。

三块加起来就是 VSCodium 的全部——一个编辑器项目里**没有编辑器代码**。

## 实践案例

### 案例 1：在 macOS 切换默认编辑器

```bash
brew install --cask vscodium
codium ~/projects/foo
git config --global core.editor 'codium --wait'
cp -r "$HOME/Library/Application Support/Code/User" \
      "$HOME/Library/Application Support/VSCodium/User"
```

**逐部分解释**：

- `brew install --cask vscodium`：装的是社区干净构建，命令叫 `codium` 不是 `code`
- `git config ... --wait`：让 git commit 弹窗用 VSCodium，`--wait` 表示关窗才继续
- `cp -r .../Code/User .../VSCodium/User`：把主题、快捷键、settings.json 一并迁过去
- 扩展要重装：目录是 `~/.vscode-oss/extensions/`，不是 `~/.vscode/extensions/`

### 案例 2：内网 marketplace（self-host open-vsx）

合规通过 VSCodium 后，扩展也要走内网。先起 open-vsx，再让客户端指向它：

```bash
docker run -p 8080:8080 ghcr.io/eclipse/openvsx-server:latest
```

在用户 settings.json（或团队下发的模板）里写：

```json
{
  "extensionsGallery": {
    "serviceUrl": "http://intranet.example:8080/vscode/gallery",
    "itemUrl": "http://intranet.example:8080/vscode/item",
    "resourceUrlTemplate": "http://intranet.example:8080/vscode/asset/{publisher}/{name}/{version}/Microsoft.VisualStudio.Code.WebResources/{path}"
  }
}
```

**逐部分解释**：

1. Docker 起的是 Eclipse 的 open-vsx 服务端（扩展商店本体）
2. `extensionsGallery` 告诉 VSCodium："别去公网 open-vsx，去内网这台"
3. `serviceUrl` / `itemUrl` 分别管搜索列表和详情页；URL 按你们反向代理实际路径改
4. 之后装扩展不再把索引请求打到外网——这是受监管环境最常卡的合规点

### 案例 3：抓包验证真的零遥测

不要光信 README，自己用 mitmproxy 看流量：

```bash
brew install mitmproxy
mitmproxy -p 8080
# 1) 浏览器打开 http://mitm.it 安装并信任 mitmproxy CA（否则 HTTPS 解密失败）
# 2) 系统 HTTP/HTTPS 代理设为 127.0.0.1:8080
# 3) 启动 codium，正常编辑 5 分钟，看 mitmproxy 列表
```

**逐部分解释**：

- 不信任 CA 时，HTTPS 会握手失败或显示空白——**不是**"零流量"，是你没解密成功
- 正常解密后，VSCodium 常见请求只有：open-vsx.org（装扩展）、github.com/VSCodium/.../releases（查更新）
- 对比官方 VS Code：启动后会向 `vortex.data.microsoft.com` 等域名打出一串 telemetry beacon
- 这一对比是合规审查里最有说服力的证据；AI 插件开发者也常用同一手法确认自家扩展没夹带意外外联
## 踩过的坑

1. **微软自家扩展装不了**：Pylance / Remote-SSH / Remote-Containers / Live Share / C++ IntelliSense 这五个最常用的扩展 license 写死"仅限 VS Code 官方构建"，VSCodium 装上会报 "this extension is not compatible"。代替方案：Pylance → Pyright（同公司的开源版）；Remote-SSH → Open Remote SSH（社区 fork）；C++ → clangd 扩展。

2. **改 product.json 指回官方 marketplace 违反 ToS**：网上很多教程教把 VSCodium 的 marketplace URL 改回 marketplace.visualstudio.com 来装 Pylance——能跑，但**违反微软的 marketplace 服务条款**，团队部署不要这么做，个人用机自负风险。

3. **远程开发握手必须两端版本一致**：用 VSCodium 通过 SSH 连远端，远端 server 也得是 VSCodium 的 server build（codium-server）。如果远端已经装过官方 vscode-server，会出现连接成功但功能错乱、或直接握手失败。解法：删掉远端的 `~/.vscode-server/`，让 VSCodium 重新推它自己的 server。

4. **Settings Sync 要么不可用要么用第三方**：官方 Settings Sync 走微软账号，VSCodium 没接入。要么不用，要么装 Settings Sync (Shan Khan) 这个老牌社区扩展走 GitHub Gist 同步——但维护节奏跟不上官方。

## 适用 vs 不适用场景

**适用**：

- 隐私敏感个人用户——拒绝任何遥测但又想保持 VS Code 的生态体验
- 受监管行业（金融 / 医疗 / 政府）——合规审查需要 100% MIT 构建链
- AI 编程插件开发者——需要干净基线测自家插件
- 内网开发环境——配合 self-host open-vsx 形成闭环

**不适用**：

- 重度依赖 Pylance / Remote-SSH / Live Share 的 Python / 远程开发场景——直接用官方 VS Code 更省心
- 需要 Settings Sync 跨设备同步——官方 sync 不支持，第三方扩展体验降级
- 团队全员 onboarding 时间紧——切换需要重装扩展、重配命令、培训"为什么不能装 Pylance"

## 历史小故事（可跳过）

- **2015 年**：微软把 VS Code 源码以 MIT 许可开源，但官方下载的二进制是用**包含微软专有组件**的构建脚本打的——logo / 品牌 / 部分内置扩展不在 MIT 里。
- **2017 年前后**：社区维护者发现"自己重新构建一份干净的 VS Code"是可行的——只要把 product.json 换掉就行。VSCodium 项目在 GitHub 上线，最初是几个志愿者的脚本仓库。
- **2019 年起**：随着 GitHub 被微软收购、Telemetry 默认开启，VSCodium 用户激增。Homebrew / Scoop / WinGet 都把它收进了官方仓库。
- **现在**：仓库约数万 stars，项目核心**仍然只有几百行 shell + 几份 patch**——它最了不起的不是技术，是"把构建脚本本身做成一个长期维护的项目"这个洞察。

## 学到什么

1. **开源不等于开源构建**——MIT 许可保护源码，但官方二进制可能是混进了专有组件的版本；想拿到纯净版需要自己（或社区）重新构建
2. **"build 仓库"是一种被忽视的项目形态**——不写代码、只维护构建参数差异，长期成本远低于 fork
3. **product.json 这种"集中配置入口"是软件可定制性的关键设计**——一份文件控制所有品牌和服务端点，下游能用极小成本做衍生版本
4. **生态依赖才是切换成本的真相**——VSCodium 技术上 100% 兼容，但 Pylance / Remote-SSH 这几个扩展的 license 锁就足以挡住一半用户

## 延伸阅读

- 官方仓库：[VSCodium/vscodium](https://github.com/VSCodium/vscodium)（README 把所有 FAQ 都答了）
- open-vsx 替代 marketplace：[open-vsx.org](https://open-vsx.org)
- 微软 vscode 源码：[microsoft/vscode](https://github.com/microsoft/vscode)（理解 product.json 在源码里的位置）
- [[monaco-editor]] —— VS Code 的编辑器内核，也是 VSCodium 跑起来后你看到的那个
- [[claude-code]] —— 这类 AI 编程插件常拿 VSCodium 当干净基线测

## 关联

- [[monaco-editor]] —— VSCodium 内嵌的就是 Monaco 同款编辑器内核
- [[codemirror]] —— 浏览器里的另一条编辑器路线，更轻但功能更克制
- [[claude-code]] —— AI 编程插件的代表，常用 VSCodium 测试发布
- [[continue]] —— 开源 AI 编程助手，原生支持 open-vsx 发布
- [[biome]] —— JS/TS 工具链，VSCodium 上装它体验和官方一致
- [[universal-ctags]] —— 没有 Pylance 时的轻量替代思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[code-server]] —— code-server — 浏览器里的 VS Code
- [[coder]] —— Coder — 自托管开发环境平台
- [[notepad-plus-plus]] —— Notepad++ — 比记事本多两个加号的 Windows 编辑器
