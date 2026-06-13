---
title: Noir 零基础学习笔记
来源: https://github.com/noir-lang/noir
日期: 2026-06-13
分类: 安全与隐私
子分类: 密码与零知识
provenance: pipeline-v3
---

# Noir 零基础学习笔记

## 一、Noir 是什么？从一份"密封账本"说起

想象你有一本账本，记录了你的每一笔消费。你想向朋友证明"我上个月确实只花了不到 5000 元"，但不想让他看到每一笔花的什么。

传统做法是你把整本账本给他看——隐私全没了。

**零知识证明（Zero-Knowledge Proof, ZKP）**就是解决这个问题的数学魔法：你能向对方证明某个命题为真，而**不泄露任何额外信息**。就像你走进一个魔术箱，在里面把一张纸撕碎吃掉，出来后告诉朋友"纸已经不存在了"，朋友无法验证你说的是真是假——除非有一种机制，能让朋友确信你真的撕了、吃了，却看不到纸上的内容。

**Noir** 就是用来编写这种"魔法程序"的编程语言。它是一个领域特定语言（DSL），专门用来生成零知识证明（具体来说是 SNARK 证明）。它的语法受 Rust 启发，对程序员来说比较亲切。

简单来说：
- 你写一段 Noir 代码，描述"我要证明什么"
- Noir 编译器把它编译成一个电路（circuit）
- 运行这个电路，生成一个证明
- 任何人可以用这个证明来验证你的陈述为真，而不需要知道你的输入数据

## 二、核心概念

### 2.1 公钥与私钥思维：公开 vs 私有值

在 Noir 中，每个值都有两种可见性：

- **私有值（private）**：只有证明者（Prover）知道。相当于你账本里的具体消费明细。
- **公开值（public）**：证明者和验证者（Verifier）都知道。相当于你声明的"总支出不到 5000 元"这个数字。

私有值在代码中默认就是私有的，要声明公开值需要在类型前加 `pub` 修饰符。

### 2.2 Field（域元素）—— Noir 的原子

Noir 里所有的值本质上都是由 `Field` 构成的。你可以把 `Field` 理解为一个非常大的数（在 BN254 曲线上的有限域中，范围是 0 到 2^254 左右）。整数类型（如 `u32`、`u64`）只是 `Field` 的抽象包装，方便程序员使用。

### 2.3 电路（Circuit）—— 程序的终极形态

Noir 程序被编译成一种叫 ACIR（Abstract Circuit Intermediate Representation）的结构。你可以把它想象成一条流水线：

- 叶子节点（Leaves）是输入值（`Field` 类型）
- 中间的每个节点是一个算术运算门（加、乘等）
- 根节点是最终输出

编译的过程就是把你的代码"折叠"成这个门电路。门越多，证明的成本越高。所以写 Noir 的一个核心挑战是：**用最少的门完成计算**。

### 2.4 约束（Constrain / Assert）

Noir 的核心思想是"约束求解"。你用 `assert` 语句声明一些条件，比如"我的密码哈希必须等于这个值"。如果条件不满足，证明就会失败。编译器会把所有 `assert` 变成电路中的约束门。

### 2.5 有界函数 vs 无界函数

- **有界函数（constrained）**：会被编译进电路，其中的每一步操作都会变成门。**这里的循环次数必须是固定的**（因为电路需要展开成固定大小的门网络）。
- **无界函数（unconstrained）**：不会被编译进电路，而是在运行时直接执行。适合做哈希、加密等"门成本很高"的操作，然后把结果传回有界函数做校验。

## 三、代码示例

### 示例 1：最简单的零知识证明——"我知道一个数，它的平方是 16"

这是一个经典的教学案例。你告诉别人"我知道一个数 x，使得 x² = 16"，但不告诉对方 x 是多少。对方可以通过验证证明来确认你确实知道这个数。

```noir
use std::field::Field;

fn main(private x: Field, pub result: Field) {
    // 约束1：x 的平方必须等于 result
    constrain x * x == result;

    // 约束2：result 必须是 16
    assert(result == 16);
}
```

解读：
- `x` 是私有输入——这是你知道但别人不知道的秘密
- `result` 是公开输入——你公开声明"这个数的平方是 16"
- `constrain x * x == result` 是核心约束：它告诉电路"x 乘以 x 的结果必须等于 result"
- `assert(result == 16)` 进一步约束 result 的值必须是 16

验证者拿到证明后，只需要验证：是否存在某个 x，使得 x² = 16。验证通过后，验证者知道了"有人知道一个平方为 16 的数"，但**完全不知道这个数是 4 还是 -4**。

### 示例 2：密码验证——"我知道密码，但不泄露密码"

这个例子展示如何用零知识证明来验证密码，而无需将密码本身发送给服务器。

```noir
use hash::{sha256_hash};

fn main(private password: Field, pub expected_hash: [u8; 32]) {
    // 将 Field 类型的密码转换为字节数组
    let password_bytes = to_bytes_le(password);

    // 计算密码的 SHA-256 哈希
    let computed_hash = sha256_hash(password_bytes);

    // 约束：计算出的哈希必须等于公开的期望哈希
    for i in 0..32 {
        assert(computed_hash[i] == expected_hash[i]);
    }
}
```

解读：
- 你把密码存在本地，从不发送给服务器
- 服务器上存着密码的哈希值（`expected_hash`），这是公开的
- 你运行这段 Noir 程序，用自己的密码计算出哈希，然后生成一个证明
- 服务器只验证证明是否有效，不需要看到你的密码

### 示例 3：年龄验证——"我年满 18 岁，但不透露我的确切生日"

这个例子展示了隐私保护的身份验证场景。

```noir
fn main(private birth_year: u32, private birth_month: u8, private birth_day: u8, pub is_adult: bool) {
    // 假设当前年份是 2026
    let current_year = 2026;

    // 计算年龄（简化版，不考虑月份细节）
    let age = current_year - birth_year;

    // 约束：年龄必须大于等于 18
    assert(age >= 18);

    // 将结果赋给公开变量
    is_adult = true;
}
```

验证者得到的结论只是"这个人年满 18 岁"，而不知道他的出生年月日。

## 四、Noir 的基本语法速览

Noir 的语法和 Rust 非常相似，以下是常用语法对照：

| 概念 | Noir 语法 | 说明 |
|------|-----------|------|
| 声明变量 | `let x = 42;` | 默认不可变 |
| 可变变量 | `let mut x = 42;` | 需要 mut 关键字 |
| 函数 | `fn main(x: u32) -> u32 { x + 1 }` | 类似 Rust |
| 条件分支 | `if x > 0 { ... } else { ... }` | 标准 if-else |
| 循环 | `for i in 0..10 { ... }` | 固定次数的循环 |
| 结构体 | `struct User { name: Field, age: u32 }` | 类似 Rust struct |
| 断言约束 | `assert(x > 0);` | 编译为电路约束 |
| 类型注解 | `let x: u32 = 42;` | 可选，编译器通常能推断 |

主要数据类型：
- `Field`：基础域元素，所有值的底层表示
- `bool`：布尔值
- `u8`, `u16`, `u32`, `u64`, `u128`：无符号整数
- `i8`, `i16`, `i32`, `i64`, `i128`：有符号整数
- `[T; N]`：固定长度数组
- `struct`：自定义结构体
- `pub T`：公开类型的值

## 五、开发工具链

Noir 的工具链以 `nargo` 为核心：

- `nargo new <name>`：创建新项目
- `nargo check`：检查代码是否有语法错误
- `nargo prove`：生成证明
- `nargo verify`：验证证明
- `nargo info`：查看电路大小（门数量）
- `nargo test`：运行测试

Noir 还有 VS Code 扩展、REPL 调试器、以及 NoirJS 库，可以在浏览器和 Node.js 环境中使用。

## 六、学习建议

1. **先理解 ZKP 的概念**：Noir 的难点不在于语法，而在于理解零知识证明的思维方式。推荐阅读 Aztec Network 的教程或参加他们的社区讨论。

2. **从简单约束开始**：先写"我知道一个数的平方是 X"这类简单例子，逐步增加复杂度。

3. **注意门的成本**：在普通编程中你习惯的位运算（`<<`、`>>`、`|`），在电路中非常昂贵。尽量用算术运算（`+`、`*`）代替。

4. **善用无界函数**：对于哈希、加密等门成本极高的操作，放在无界函数中执行，再把结果传回有界函数验证。

5. **关注社区**：Noir 仍在快速发展（截至 2026 年 6 月为 v1.0.0-beta.22），[Aztec Forum](https://forum.aztec.network/c/noir) 和 [Discord](https://discord.gg/JtqzkdeQ6G) 是很好的交流场所。

## 七、参考资料

- 官方仓库：https://github.com/noir-lang/noir
- 官方文档：https://noir-lang.org/docs/
- 官方教程：https://noir-lang.org/docs/tutorials/noirjs_app
- Awesome Noir：https://github.com/noir-lang/awesome-noir
- Aztec Network：https://aztec.network
