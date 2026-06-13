---
title: The State of Rust 2026 — 零基础学习笔记
来源: https://blog.rust-lang.org/2026/03/02/2025-State-Of-Rust-Survey-results/
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
provenance: pipeline-v3
---

# The State of Rust 2026 — 零基础学习笔记

## 一句话介绍

Rust 基金会每年做一次"全球 Rust 开发者大普查"，收集开发者的使用习惯、学习方式和痛点。2026 年 3 月发布的这份报告，覆盖的是 2025 年 11 月到 12 月的调查，共有 **7156 人**完成，是历史上第 10 次调查。

---

## 核心概念 1：你用的 Rust 版本是什么？

### 日常类比

想象你开一家面包店。编译器就是烤箱。

- **stable（稳定版）** = 标准烤箱，每天都能买，不会突然换样子
- **beta（测试版）** = 新上市的烤箱，功能多但可能有小问题
- **nightly（每晚版）** = 实验室烤箱，每天都有新功能，但可能炸厨房

### 调查结果

大部分 Rust 开发者坚持使用 **stable 稳定版**。很少人用 nightly。

> 这说明 Rust 的"稳定承诺"成功了——开发者不需要为了日常工作去冒险用 unstable 的版本。

去年 Stabilized（从 nightly 搬到 stable）的两个大功能特别受欢迎：

1. **let chains** — 可以在 if 语句里同时判断多个条件
2. **async closures** — 异步闭包，让异步回调更简洁

### 代码示例：let chains

**没有 let chains 之前：**

```rust
// 旧写法：需要额外嵌套 if，缩进越来越深
fn handle_user(name: Option<&str>, age: Option<u32>) {
    if let Some(n) = name {
        if let Some(a) = age {
            println!("用户 {} 今年 {} 岁", n, a);
        }
    }
}
```

**有了 let chains 之后：**

```rust
// 新写法：把条件都放在同一行，清晰多了
fn handle_user(name: Option<&str>, age: Option<u32>) {
    if let Some(n) = name && let Some(a) = age {
        println!("用户 {} 今年 {} 岁", n, a);
    }
}
```

### 代码示例：async closures

**没有 async closures 之前：**

```rust
// 旧写法：async closure 不支持，只能用循环
async fn process_items(items: Vec<String>) {
    for item in &items {
        let result = do_something(item).await;
        println!("处理了: {}", result);
    }
}

fn do_something(s: &str) -> impl std::future::Future<Output = String> + '_ {
    async move { format!("done: {}", s) }
}
```

**有了 async closures 之后：**

```rust
// 新写法：直接在 for_each 里写异步操作
async fn process_items(items: Vec<String>) {
    items.into_iter().for_each_async(|item| async {
        let result = do_something(item).await;
        println!("处理了: {}", result);
    });
}
```

---

## 核心概念 2：人们最想要什么新功能？

### 日常类比

还是面包店。烤箱已经很好用了，但开发者们还在提需求：

- "如果能一边烤面包一边算温度就好了" → **generic const expressions**（泛型常量表达式）
- "如果函数的返回值能更灵活地指定类型就好了" → **improved trait methods**（改进的 trait 方法）

### 最想要的功能排名

1. **Generic const expressions** — 泛型常量表达式，允许在泛型代码中使用常量
2. **Improved trait methods** — 更灵活的 trait 方法定义
3. **Other macros** — 其他宏功能
4. **Better pattern matching** — 更好的模式匹配
5. **Let chains** — 这个**已经实现了**，但还在需求榜上（因为大家还在熟悉它）

---

## 核心概念 3：Rust 开发者的痛点是什么？

### 日常类比

你学做面包，遇到的最大困难是什么？

调查结果（按困扰程度排序）：

1. **编译慢** — 每次改代码都要等很久才能看到结果
2. **存储占用大** — Rust 的依赖和构建产物占磁盘空间
3. **学习曲线陡** — 新概念多，尤其是所有权（ownership）系统
4. **调试体验** — 出错了不太好查

> 注意：调试体验从去年的第 2 名掉到了第 4 名。不是变好了，而是前两项（编译速度和存储空间）更让人头疼了。

### 代码示例：Rust 的所有权概念

Rust 最著名的特性是"所有权（ownership）"。让我用一个最简单的例子来解释：

```rust
// 类比：一本书只能有一个主人
fn main() {
    let book1 = String::from("Rust 编程之道");

    // book1 是这本书的主人
    let book2 = book1; // 主人变了！book2 现在是主人

    // 下面这行会报错！因为 book1 已经不是主了
    // println!("{}", book1); // Error: borrow of moved value

    // 正确做法：用 clone 复印一本
    let book1_copy = book1.clone();
    println!("{} 和 {}", book2, book1_copy);
}
```

这就是为什么 Rust 初学者觉得"难"——你需要时刻想"这本书现在归谁管"。但一旦理解了这个规则，很多 Bug 在编译阶段就被抓住了，不用等到运行的时候才崩溃。

---

## 核心概念 4：人们怎么学习 Rust？

### 日常类比

你想学一门新语言，你会去哪找资料？

调查结果：

1. **官方文档** — 最受欢迎，像字典一样可靠
2. **阅读别人的代码** — 看实际项目怎么写
3. **在线社区 / Meetup** — 比去年下降了约 3 个百分点
4. **LLM 工具**（ChatGPT 等）— 正在快速上升！

> 一个有趣的现象：越来越多的人遇到问题先问 AI，而不是去社区发帖。

### 编辑器趋势

- **Zed** 编辑器排名大幅上升
- **Helix** 也不错
- **VSCode** 和 **IntelliJ** 的用户在被 AI 编辑器蚕食
- 还有 **11 个人**在用 Atom（致敬！）
- **Emacs** 和 **Vim** 用户依然坚挺

---

## 核心概念 5：行业在怎么看待 Rust？

### 调查结果

- **越来越多公司在招聘 Rust 开发者** — 这趋势是持续的、结构性的
- Rust 在公司里的代码量在稳步增长
- 人们对 **Rust Foundation（基金会）** 的信任度在提升

### 开发者的担忧

1. **语言变得越来越复杂** — 功能越来越多，新手更难入门
2. **维护者支持不足** — 很多核心贡献者是 unpaid（ unpaid = 没有报酬的志愿者）

> 报告里特别提醒使用 Rust 的公司：你们应该支持 Rust 项目的贡献者！可以通过加入 Rust Foundation、让员工花一些工作时间贡献代码、或者通过 GitHub Sponsor 等方式。

---

## 核心概念 6：从社区多样性看 Rust

调查还统计了开发者中的"弱势群体"比例：

| 群体 | 比例 |
|------|------|
| LGBTQ+ | 10.59% |
| 神经多样性（如 ADHD、自闭谱系） | 9.94% |
| 跨性别 | 7.72% |
| 女性 | 6.43% |
| 非二元性别 | 4.11% |
| 残障人士 | 3.07% |

> Rust 社区在这些数字上比很多技术社区做得更好，但仍然偏低。社区一直在努力成为一个对所有人都友好的开源社区。

---

## 关键数据速查

| 指标 | 数值 |
|------|------|
| 调查次数 | 第 10 次（2016 年起每年一次） |
| 完成人数 | 7,156 |
| 开始人数 | 9,389 |
| 完成率 | 76.2% |
| 页面浏览量 | 20,397 |
| 调查时间 | 2025.11.17 - 2025.12.17 |
| 官方语言 | 英语、简体中文、繁体中文等 10 种 |

---

## 学习建议

基于这份调查报告，给初学者的建议：

1. **从 stable 版本开始** — 不需要追 nightly
2. **先看官方文档** — 这是最权威的参考资料
3. **读别人的代码** — 在 GitHub 上看真实项目
4. **接受编译慢的现实** — 可以用 `cargo check` 快速检查不运行
5. **善用 AI 工具** — 但它不能替代文档
6. **加入社区** — 即使线上参与度在下降，社区仍然是最好的学习资源

---

## 延伸阅读

- 完整 PDF 报告：<https://raw.githubusercontent.com/rust-lang/surveys/main/surveys/2025/annual-survey/report/annual-survey-2025-report.pdf>
- 2024 年调查：<https://blog.rust-lang.org/2025/02/13/2024-State-Of-Rust-Survey-results/>
- Rust 官方文档：<https://doc.rust-lang.org>

---

*本文是基于 Rust Blog 2026 年 3 月发布的《2025 State of Rust Survey Results》编写的学习笔记。数据来源于 7,156 名 Rust 开发者的回答。*
