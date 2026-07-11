---
title: Ledger App SDK — 在硬件钱包里写应用的 C 框架
来源: 'https://github.com/LedgerHQ/ledger-secure-sdk'
日期: 2026-05-30
分类: blockchain
难度: 中级
---

## 是什么

Ledger App SDK（仓库 `ledger-secure-sdk`）是 Ledger 官方为旗下硬件钱包（Nano X / Nano S+ / Stax / Flex）提供的 **C 语言应用开发框架**。日常类比：像 iOS 的 SDK 给手机写 App，但这台"手机"只有一颗安全芯片、一块小屏、两个物理键，操作系统叫 BOLOS（Blockchain Open Ledger Operating System）。

你写一个 ledger-app-bitcoin 或 ledger-app-ethereum，本质就是在 BOLOS 上注册一个能响应"派生地址"和"签交易"两类指令的小程序。它不能联网、不能开线程、不能 malloc，但它**能做这台设备上唯一能做的事**——拿到种子派生出私钥，然后签一笔交易，整个过程用户必须按物理键确认。

仓库本身就是一堆 C 头文件 + Makefile + 链接脚本，按 `API_LEVEL` 分支锁版本——每代设备 OS 一个 API_LEVEL，不同代共享同一份源码不同分支。Rust 已开始作为补充语言进入官方支持，但 C 仍是绝大多数 App 的实际选择。

## 为什么重要

不理解 Ledger App SDK，下面这些事都没法解释：

- 为什么一台 Ledger 能同时装 BTC / ETH / SOL App，**一个 App 偷不到另一个的私钥**
- 为什么连 Ledger 自己都看不到你的助记词，签名却照样能在设备里完成
- 为什么 [[metamask]] / [[rabby-wallet]] 这些软件钱包都集成"硬件钱包"选项，背后就是在跟 Ledger App 对话
- 为什么写 Ledger App 必须用 C，而不是更舒服的 Rust 或 Go（虽然 Rust 也开始支持）
- 为什么交易屏上必须看到金额和地址，不能只显示一串哈希——这是 Clear Signing 强制要求

## 核心要点

Ledger App 的工作模型可以拆成 **三个支柱**：

1. **BOLOS 隔离**：每个 App 是 BOLOS 下一个独立进程，App 之间**不共享内存、不共享存储**。BIP32 派生路径在 install 时声明，BOLOS 拦截不属于自己路径的派生请求。类比：像手机 App 沙箱，但更严格——连"读对方的偏好设置"都不行。

2. **APDU 协议**：电脑端通过 USB / 蓝牙发一串字节，叫 APDU（Application Protocol Data Unit），格式是 `CLA | INS | P1 | P2 | LC | DATA`。App 的 main loop 收到 APDU 后 dispatch 到不同 handler。类比：像 HTTP 请求，但只有 5 个字节的 header。

3. **Clear Signing + 物理确认**：交易内容必须被 App **解析成人类可读的字符串**显示在屏幕上（"转 100 USDT 给 0xabc..."），用户按物理键才会触发签名。屏幕和按键直接接到安全元件，恶意主机欺骗不了。

三个支柱合起来叫"用户掌握私钥"——种子永远在芯片里，主机看到的只有签名结果。这也是硬件钱包能比软件钱包多卖几倍价钱的根本理由。

## 实践案例

这三个案例分别对应 Ledger App 的三个最常见职责：响应主机查询、做密码学派生、把交易内容给用户看。

### 案例 1：最小骨架 App 响应版本号

```c
// main.c
#include "os.h"
#include "os_io_seproxyhal.h"

void app_main(void) {
  for (;;) {
    unsigned char input_size = io_exchange(CHANNEL_APDU, 0);
    if (G_io_apdu_buffer[1] == INS_GET_VERSION) {
      G_io_apdu_buffer[0] = APP_VERSION_MAJOR;
      G_io_apdu_buffer[1] = APP_VERSION_MINOR;
      io_exchange(CHANNEL_APDU | IO_RETURN_AFTER_TX, 2);
    }
  }
}
```

**逐部分解释**：

- `io_exchange` 是 BOLOS syscall，阻塞等下一条 APDU
- 拿到字节后看 INS 字段（指令码），匹配 `GET_VERSION` 就把版本写回 buffer
- 没有 main 函数返回——App 就是这样一个永不退出的循环，BOLOS 切回 dashboard 时会硬中断它

### 案例 2：派生地址走 BIP32

```c
// 硬化路径分量是 32 位：最高位 0x80000000 表示 hardened（子密钥无法反推父密钥）
uint32_t bip32_path[] = {
  44 | 0x80000000,  // purpose
  60 | 0x80000000,  // coin_type = ETH
  0  | 0x80000000   // account
};
cx_ecfp_private_key_t priv;
os_perso_derive_node_bip32(CX_CURVE_256K1, bip32_path, 3, priv.d, NULL);
cx_ecfp_public_key_t pub;
cx_ecfp_generate_pair(CX_CURVE_256K1, &pub, &priv, 1);
explicit_bzero(&priv, sizeof(priv));
```

`os_perso_derive_node_bip32` 是 BOLOS 唯一拿私钥的入口，**返回后必须立刻 bzero**，否则栈上残留私钥被下一次调用读到。路径数组必须用 `uint32_t`（不要写成 `uint8_t`，否则 `0x80000000` 截断后硬化语义全错）。曲线参数（CX_CURVE_256K1 / Ed25519 等）由 cxlib 提供，自己实现椭圆曲线代码会被审计直接打回。

### 案例 3：Clear Signing 显示交易意图

```c
void review_transfer(uint8_t *to, uint64_t amount) {
  char addr_str[43];
  format_hex_address(to, addr_str);
  char amt_str[32];
  format_amount(amount, 6, "USDT", amt_str);
  ux_flow_init(0, ux_review_flow, NULL);  // NBGL 调起多页确认
}
```

UI 层用 NBGL（Stax / Flex）或 BAGL（Nano 系），把目标地址 + 金额 + 代币符号铺成滚动卡片，用户翻完按"Approve"才进签名 handler。Approve 之前 App 已经把交易解析、字段校验、ChainID 检查全跑过一遍——这套流程就是"Clear Signing"。

## 踩过的坑

1. **API_LEVEL 分支选错**：每代设备 OS 对应一个 `API_LEVEL` 分支，checkout 错分支编译能过但烧到设备就不动；先 `git checkout API_LEVEL_15` 再开编，分支名可在仓库 README 查到。
2. **NBGL 和 BAGL 混用**：Stax / Flex 用 NBGL（高分辨率），Nano S+ / X 用 BAGL（单色），同一份代码跑两套必须靠 `#ifdef HAVE_NBGL` 切分，新人常忘掉一边导致 Stax 上崩溃。
3. **忘了 Clear Signing**：只把交易哈希给用户看而不解析内容，等于让用户盲签——Ledger 的安全审计直接打回，App 上不了 Ledger Live。
4. **栈空间打爆**：安全元件 RAM 只有几 KB，递归解析复杂结构（比如 EIP-712 typed data）很容易溢出，没有任何错误提示，App 就静默重启了，调试只能靠 speculos 模拟器看日志。

## 适用 vs 不适用场景

**适用**：

- 写新币种 / 新链的硬件钱包 App（ledger-app-bitcoin / ledger-app-ethereum 这类）
- 给企业做基于 Secure Element 的签名设备（身份认证、文档签署、金库审批）
- DeFi 工具想在设备里完成"复杂交易明文展示 + 二次确认"
- Ledger Live 集成方做插件，让自家协议在 Ledger 上能签

**不适用**：

- 想在 App 里做联网 / 下载链上数据 → BOLOS 不允许，必须由主机端供数
- 需要持久化大量用户数据 → NVRAM 只有几 KB，超出就要拆架构到主机端
- 偏好用 Go / Java 等带运行时的语言 → 安全芯片只跑裸 C / Rust，无 GC 无 OS 线程
- 不想写 [[bitcoin]] 那种字节级别协议 → 这层抽象 SDK 不会替你做掉

## 历史小故事（可跳过）

- **2014-2016**：Ledger 联合创始人 Nicolas Bacca 设计 BOLOS（Blockchain Open Ledger Operating System），目标是"一台硬件钱包同时支持几百种币又互不污染"
- **2017**：Nano S 上市，开放 SDK，社区贡献的 App 数量从几款飙到 100+
- **2019**：Nano X 加入蓝牙，APDU 协议扩展支持 BLE 信道
- **2022**：Stax 发布，引入 NBGL 高分辨率 UI 框架，触屏交互替代物理键翻页
- **2024 起**：`ledger-secure-sdk` 单仓库取代各代分裂的旧 SDK（旧仓如 `nanos-secure-sdk` 已 deprecated），按 `API_LEVEL` 分支统一管理
- **2025**：Apex+ / Flex 加入支持，App 数量超 600，覆盖几乎所有主流公链与代币

## 学到什么

1. **隔离比加密更重要**：哪怕 App 被攻破，BOLOS 的进程隔离让它拿不到别的币的私钥——纵深防御的典型
2. **物理键不能被代码绕过**：屏幕和按键直接接安全元件，是"用户掌握私钥"的最后一道物理防线
3. **嵌入式 C 的硬约束**：没 malloc / 没线程 / 栈只有几 KB，逼你写出最简单可靠的状态机
4. **APDU 是事实标准**：所有钱包软件、所有链、所有硬件设备都靠这层字节协议互通，[[walletconnect]] 之类协议是它的上层包装
5. **官方仓库就是教材**：先 fork app-boilerplate 跑通编译，再去看 ledger-app-bitcoin 学高级用法，比啃文档快得多

## 延伸阅读

- 官方文档：[Ledger Developer Portal](https://developers.ledger.com/)（embedded app 教程 + API 参考）
- 仓库示例：[LedgerHQ/app-boilerplate](https://github.com/LedgerHQ/app-boilerplate)（最小可跑骨架 App）
- BOLOS 论文：[BOLOS: Blockchain Open Ledger Operating System](https://www.ledger.com/wp-content/uploads/2017/12/Bolos_Whitepaper.pdf)
- 模拟器：[Speculos](https://github.com/LedgerHQ/speculos)（不用真机就能跑 App 调试）
- 测试框架：[Ragger](https://github.com/LedgerHQ/ragger)（Python 写自动化测试）
- [[bitcoin]] —— ledger-app-bitcoin 是这个 SDK 的旗舰应用

## 关联

- [[bitcoin]] —— Ledger 第一个支持的币，BIP32 派生模型成 SDK 的内置语义
- [[metamask]] —— 软件钱包，通过 APDU 协议连 Ledger 用作硬件签名后端
- [[rabby-wallet]] —— 同上，集成 Ledger 作为外部签名设备
- [[walletconnect]] —— DApp 与钱包通信协议，最终签名常落到 Ledger App
- [[argent-x]] —— Starknet 钱包，也支持 Ledger 作为硬件层
- [[safe-contracts]] —— 多签合约，Ledger 常作为 signer 之一
- [[go-ethereum]] —— 主网客户端，Ledger 通过它的 RPC 拿待签交易

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arweave]] —— Arweave — 一次付费、永远存着的区块链
