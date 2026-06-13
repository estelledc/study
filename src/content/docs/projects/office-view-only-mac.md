---
title: Microsoft Office 2019/2021 for Mac view-only conversion (consumer rights)
来源: https://consumerrights.wiki/w/Microsoft_Office_2019_and_2021_for_Mac_view-only_conversion_(2026)
日期: 2026-06-13
分类: 其他
子分类: 工程文化
provenance: pipeline-v3
---

# Microsoft Office 2019/2021 for Mac 只读转换事件（2026）

## 一句话总结

Microsoft 在 2026 年 7 月 13 日通过一个过期的数字证书，让已经"永久购买"的 Office 2019 for Mac 变成只能看不能改的"残废版"。消费者花了一辈子买的东西，被远程锁了功能。

## 日常类比：你买了一台电视，厂家说"保修期到了"就远程锁屏

想象一下，你在店里花 150 美元买了一台电视机。卖家告诉你："这台电视你永远能用，不需要任何订阅。" 你用了好几年，突然有一天电视自己弹出一个窗口："您的许可证已过期，现在只能看不能调频道、不能换输入源。"

你问："我明明买断的，为什么不能用了？" 对方回答："嗯……我们之前说的'继续能用'，指的是你能看到画面而已。"

这就是 Office 2019 for Mac 用户在 2026 年 7 月 13 日之后遭遇的事情。

## 核心概念

### 1. 永久许可（Perpetual License）vs 订阅制（Subscription）

软件有两种卖法：

- **订阅制**（如 Microsoft 365）：按月/年付费，不续费就不能用。像租房子。
- **永久许可**（如 Office 2019/2021）：一次性付费，理论上买到手就是你的。像买房子。

Office 2019 for Mac 就是永久许可产品。2018 年发布时，微软自己的广告页写着：

> "One-time purchase for 1 PC or Mac" — $149.99

翻译：花 149 美元，买一台电脑或 Mac 的使用权，一次搞定，没有订阅。

### 2. 数字证书（Digital Certificate）

数字证书就像软件的"身份证"。Office 安装包里内置了一张证书，用来证明"你是正版用户"。证书有一个有效期，到期后会过期。

正常情况下，软件厂商会在证书到期前发一个新版本，把新证书塞进去。老用户升级后，新证书生效，一切正常。

但问题来了——如果某个产品**不会再有更新**了呢？

### 3. 降低功能模式（Reduced Functionality Mode）

这是微软给 Office 2019 for Mac 准备的后门。证书过期后，软件不会崩溃，也不会消失，而是进入一个"半残废"状态：

- 能打开文件
- 能查看内容
- **不能编辑**
- **不能保存**
- **不能使用完整功能**

简单说：你的 Word 变成了 Word Viewer，你的 Excel 变成了 Excel Viewer。

## 时间线：从承诺到反悔

| 时间 | 发生了什么 |
|------|-----------|
| 2018-09-24 | Office 2019 for Mac 发布。微软说："这是一次性购买，不会有后续功能更新。" |
| 2023-04-12 | 微软发布 Office 2019 for Mac 的"结束支持"页面，原话是："Your Office 2019 apps will **continue to function**"（你的应用会继续正常运行） |
| 2023-10-10 | Office 2019 for Mac 正式结束支持 |
| 2026-05-15 | 微软悄悄改掉了那个页面，把 "continue to function" 这句话删了 |
| 2026-05 中旬 | 微软开始给受影响用户发邮件，通知 7 月 13 日将发生转换 |
| 2026-05-16 | PiunikaWeb 最早报道此事，称用户反应" largely negative "（非常负面） |
| 2026-06-04 | Consumer Rights Wiki 收录此事件 |
| **2026-07-13** | 证书过期，Office 2019 for Mac 正式进入只读模式 |

## 关键代码示例

### 示例 1：检查你的 Office 版本是否受影响

打开终端，运行以下命令查看你安装的 Office 版本：

```bash
# 检查 Office 2019 的版本号
/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" \
  "/Applications/Microsoft Word.app/Contents/Info.plist" 2>/dev/null

# 如果输出类似 "16.xx"，你需要确认版本号是否低于 16.83
# 只有 >= 16.83 的版本才不会受影响
```

解释：

- `/usr/libexec/PlistBuddy` 是 macOS 自带的工具，用来读取 `.plist` 配置文件
- Office 的 `.app` 文件里面有一个 `Info.plist`，记录了版本号
- Office 2019 **永远不会有** 16.83 这个版本——因为它已经被终止更新了
- 所以只要你是 Office 2019 for Mac，你就在受影响名单里

### 示例 2：模拟证书过期后的状态检测

下面是微软官方文档中描述的逻辑伪代码，解释了证书过期机制如何工作：

```
// 这是微软管理员文档中的简化版逻辑
// 实际实现更复杂，但核心逻辑如下

function checkLicense(appVersion, certificateExpiryDate, currentDate) {
    // 步骤 1: 检查应用是否已更新到最低安全版本
    const minimumRequiredVersion = "16.83";
    
    if (appVersion >= minimumRequiredVersion) {
        // 新版本自带新证书，正常运作
        return { status: "normal", mode: "full-functionality" };
    }
    
    // 步骤 2: 检查证书是否过期
    if (currentDate > certificateExpiryDate) {
        // 旧版本 + 证书过期 = 只读模式
        return { 
            status: "degraded", 
            mode: "reduced-functionality",
            canOpen: true,
            canEdit: false,
            canSave: false,
            message: "Files can be opened and viewed but cannot be edited, saved, or accessed with full features."
        };
    }
    
    // 步骤 3: 证书尚未过期，暂时正常
    return { status: "normal", mode: "full-functionality" };
}

// 实际调用场景
const office2019Version = "16.78";  // Office 2019 的最高版本
const certExpiry = new Date("2026-07-13");
const today = new Date("2026-07-14");  // 过期后的一天

const result = checkLicense(office2019Version, certExpiry, today);
// 结果: { status: "degraded", mode: "reduced-functionality", ... }
```

对比一下 Office 2021 的情况：

```
// Office 2021 仍然在支持期内，可以收到更新
// 用户可以升级到 16.83+，避开这个问题

Office 2019: 版本上限 ≈ 16.78 ❌ 永远无法达到 16.83
Office 2021: 仍接收更新，可升级至 16.83+ ✅ 完全不受影响
Microsoft 365: 持续更新 ✅ 完全不受影响

// 微软官方的说法：
// "Apps on older versions enter reduced functionality mode 
//  after the certificate expires."
// "This issue cannot be resolved by updating or reinstalling 
//  Office 2019 for Mac."
```

注意最后一句："**无法通过更新或重新安装 Office 2019 for Mac 来解决。**" 也就是说，即使你卸载重装，也没用。因为问题不在你的电脑上，在于微软故意不给你新证书。

## 消费者面临的选项

微软给了三条路：

1. **继续只用只读模式**——能看不能改
2. **改用免费的 Microsoft 365 网页版**——功能有限，需要联网
3. **花钱**——订阅 Microsoft 365 或购买新的 Office Home 2024（又是一笔钱）

有趣的是，微软发邮件的时候还附带了一个"免费试用"链接，但试用结束后会自动转成付费订阅，而且需要你提供付款方式。这被广泛认为是典型的"暗黑模式"（Dark Pattern）设计。

## 争议焦点

### 微软修改了之前的承诺

2023 年，微软的官方页面写着：

> "Rest assured that all your Office 2019 apps will **continue to function**—they won't disappear from your Mac, nor will you lose any data."

2026 年 5 月，同样的页面变成了：

> "Rest assured that all your Office 2019 apps won't lose any data."

"continue to function" 这句话被删了。数据安全的承诺保留了，但"继续正常工作"的承诺消失了。

旧金山的 IT 咨询公司 JimmyTech 指出：

> "证书是可以续期的。微软选择用这个过期日期作为淘汰旧版 Office 的截止日期，而不是悄悄地续期，这是一个**主动的选择**。"

### 消费者组织的定性

AppleInsider 的记者 Amber Neely 写道：

> "Microsoft will be **effectively bricking** the standalone Office 2019 for Mac, iPad, and iPhone users on July 13, 2026."

"Bricking" 是科技圈的词，意思是把一个还能用的设备变成砖头——虽然硬件没坏，但功能被远程锁死了。

### 受影响的产品范围

| 平台 | 是否受影响 |
|------|----------|
| Office 2019 for Mac | **是**，无法修复 |
| Office 2019 for iOS (iPad/iPhone) | **是**，需要升级至 2.93+ |
| Office 2021 for Mac | **否**，仍可更新至 16.83+ |
| Office for Windows | **否** |
| Office for Android | **否** |
| Microsoft 365 for Mac | **否**，持续更新 |

注意：Office 2021 for Mac 要到 2026 年 10 月 13 日才结束支持，在此之前它仍然能收到包含新证书的更新。

## 如果你正在使用 Office 2019 for Mac，该怎么办

以下是实际可行的应对方案：

```
方案 A：迁移到免费替代品（推荐）
├── LibreOffice（开源，功能全面）
├── OnlyOffice（界面接近 MS Office）
└── Apple Pages/Numbers/Keynote（macOS 自带，免费）

方案 B：升级到 Office 2024
└── 一次性购买，约 $150（跟当年买 2019 差不多）

方案 C：订阅 Microsoft 365
└── 按月/年付费，持续获得更新

方案 D：过渡期临时使用网页版
└── app.office.com 免费使用基础功能
```

## 这件事为什么重要

这件事触及了一个根本问题：**你买的软件，到底归谁？**

如果花钱买断的软件可以被厂商远程降级，那"买断"这个词还有什么意义？你买的究竟是软件本身，还是一个随时可能被收回的"使用权"？

这不只是 Office 的问题。随着软件越来越依赖在线验证、数字证书和远程授权，"永久许可"正在变成一个营销词汇，而不是法律承诺。

## 延伸阅读

- [Consumer Rights Wiki - 原文](https://consumerrights.wiki/w/Microsoft_Office_2019_and_2021_for_Mac_view-only_conversion_(2026))
- [PiunikaWeb 报道 (2026-05-16)](https://piunikaweb.com)
- [AppleInsider 报道 (2026-05-28)](https://appleinsider.com)
- [JimmyTech 分析](https://jimmytech.com)
- [Microsoft Lifecycle Policy - Office 2021](https://learn.microsoft.com)
