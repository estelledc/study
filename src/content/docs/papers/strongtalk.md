---
title: Strongtalk — 可以装可以卸的 Smalltalk 类型系统
来源: 'Bracha & Griswold, "Strongtalk: Typechecking Smalltalk in a Production Environment", OOPSLA 1993'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Strongtalk 是一套**给 Smalltalk 加静态类型检查的工具**，但它有一个特殊的设计：**类型注解是可选的，并且完全不影响程序怎么跑**。日常类比：像在原本不戴眼镜的小孩脸上配一副"可以摘下的眼镜"——戴上能看清更多细节（编译期发现 bug），摘下来人还是同一个人（运行时一模一样）。

你可以这样想：

```smalltalk
"不写类型——程序照跑"
add: x and: y
    ^ x + y

"写了类型——程序也是这么跑，但编译器多帮你查一遍"
add: x <Number> and: y <Number> <Number>
    ^ x + y
```

注意第二份代码里的 `<Number>` 标注，**只有类型检查器看**。Strongtalk VM 跑代码时把它当注释。这个"类型不进运行时"的设计后来被 TypeScript、Dart、Python typing 当作基础哲学。

## 为什么重要

不理解 Strongtalk，下面这些事都说不清：

- 为什么 TypeScript 编译完是 `.js`，类型全擦掉但**运行时不会突然炸**——它继承的就是 Strongtalk 思路
- 为什么"加类型"不一定要重写语言——可以做成可拔插的工具，老代码不动也能用
- 为什么 HotSpot JVM 跑得这么快——它的 VM 团队就是 Strongtalk 的那群人
- 为什么 Bracha 后来要造一个词叫 "pluggable type systems"——这是把 Strongtalk 经验抽象成的方法论

## 核心要点

Strongtalk 的设计可以拆成 **三个独立想法**：

1. **类型可选（optional typing）**：一份代码可以完全不标类型；标了，类型检查器才工作；不标，照样能跑。**类比**：餐厅菜单里"可加辣"——不加辣是默认款，加辣是另一种体验，但都是同一道菜。

2. **类型不影响运行时（no runtime semantics）**：这是 Strongtalk 与传统 ML / Java 最大的区别。Java 的 `(String) obj` 强转会在运行时检查，失败抛异常；Strongtalk 的类型只在编译期存在，VM 看到的字节码与未标类型时完全一样。

3. **protocol 而非 class 作为类型**：Strongtalk 用 **protocol**（一组消息签名）当类型，而不是 class。`Iterable` protocol 就是"会响应 `next` 和 `hasNext` 消息"的东西——任何对象只要响应得了就符合，不需要 `implements`。**类比**：和 Go 的 interface 一样，看你"会做什么"，不看你叫什么。

三件事加起来叫 **pluggable type system**——可以装可以卸的类型层。

## 实践案例

### 案例 1：optional 的感觉

Strongtalk 里你可以写：

```smalltalk
"完全没类型注解——能跑、能调用"
square: x
    ^ x * x

"加上类型——多了一层编译期保险"
square: x <Number> <Number>
    ^ x * x
```

你给第一个版本传字符串 `square: 'hello'`，运行时 Smalltalk 自己抛 `doesNotUnderstand: *`。第二个版本传字符串，类型检查器编译期就报错——但**只在你跑了类型检查这一步时**。如果你不跑，第二份代码与第一份一样能跑、一样会运行时炸。

这是"optional"的本质：**类型是可选保险，不是必选闸门**。

### 案例 2：protocol 不是 interface

```smalltalk
"定义一个 protocol——只看消息签名"
Protocol Drawable
    draw <-> ()
    bounds <-> Rectangle
```

任何对象，只要它响应 `draw` 与 `bounds`，**就自动符合 Drawable**——不需要写 `class Circle implements Drawable`。这与 Java 的 interface 不同（Java 要显式声明），更像 Go 的 interface（结构化匹配）或 TypeScript 的 `interface`（duck typing）。

```ts
// TypeScript 里的同等概念
interface Drawable {
  draw(): void
  bounds(): Rectangle
}
// Circle 不需要 implements Drawable，只要方法签名匹配就行
```

### 案例 3：到 TypeScript 的精神映射

```ts
// .ts 源码（带类型）
function add(x: number, y: number): number {
  return x + y
}

// 编译后的 .js（类型擦除，运行时不存在）
function add(x, y) {
  return x + y
}
```

这就是 Strongtalk 的现代版：**类型在编译期帮你查，编译完类型消失，运行时只剩纯逻辑**。TypeScript 1.0 (2014) 的设计文档里明确提到借鉴了 optional typing 的 idea。

## 踩过的坑

1. **把 optional 当成 gradual**：optional typing（Strongtalk）类型与运行时**完全脱钩**；gradual typing（Siek-Taha 2006）则在动态/静态边界**插入运行时检查**保证类型安全。两者哲学不同——TypeScript 走 optional，Racket 的 typed/untyped 边界走 gradual。

2. **以为 protocol 就是 Java interface**：interface 是 nominal（看名字声明），protocol 是 structural（看消息签名匹配）。Go interface 更接近 protocol。

3. **把 Strongtalk 仅当语言设计**：Strongtalk 同时是工业级 VM——Animorphic 团队把 VM 卖给 Sun 后变成 HotSpot 的核心引擎，inline cache、自适应编译都源自这里。光看类型系统会漏掉这一半。

4. **想当然地以为类型擦除等于不安全**：类型擦除指的是**类型信息不进字节码**，不是"完全没用"。类型擦除可以编译期发现 80% 的拼写/签名错误，剩下 20% 由动态语言本身的运行时检查兜底——是个工程上的甜区。

## 适用 vs 不适用场景

**适用**：

- 已经有大量动态语言代码，想"先加类型，后期再说"——optional typing 让你逐步迁移
- 库与应用边界，库给类型签名，应用可选用——TypeScript 的 `.d.ts` 就是这个套路
- 工业 VM 想保留动态性又想给开发者更多保险——Smalltalk / Self / V8 的世系
- 想让类型工具与运行时**解耦**——类型工具可以单独迭代，不绑死语言版本

**不适用**：

- 需要类型驱动优化（如 OCaml / Haskell 编译器靠类型推 unboxing）→ 必须 mandatory typing
- 需要在运行时反射类型信息做分发（如 Java 泛型擦除痛点）→ optional 也擦得太干净
- 安全关键系统要求类型 0 漏洞（航天 / 金融核心）→ 应该用 mandatory + 形式化验证
- 追求 Hindley-Milner 那样的全自动推导 → optional typing 通常不做全程推导

## 历史小故事（可跳过）

- **1990 年代初**：Sun Lab 的 Self 研究组（David Ungar、Urs Hölzle、Lars Bak）做出 polymorphic inline cache、type feedback 等高性能动态语言 VM 技术
- **1993 年**：Bracha 与 Griswold 在 OOPSLA 发表 Strongtalk 类型系统论文——给 Smalltalk 加可选静态类型
- **1994 年**：那批人创立 Animorphic Systems，把 Strongtalk 当成商业 Smalltalk 产品做
- **1997 年**：Sun 收购 Animorphic——他们的 VM 团队转去做 HotSpot JVM，inline cache、自适应编译直接搬过去
- **2004 年**：Bracha 写《Pluggable Type Systems》，把 Strongtalk 经验提炼成方法论
- **2006 年**：Strongtalk 本身开源；同年 Siek-Taha 提出 gradual typing，与 optional 形成对照
- **2009-2014 年**：Lars Bak 主持 V8 JavaScript 引擎；Bracha 主导 Dart 语言；TypeScript 1.0 发布——Strongtalk 哲学全面开花

## 学到什么

1. **类型工具与运行时可以解耦**——这是过去 30 年最被低估的语言设计洞见之一
2. **optional vs gradual vs mandatory** 是三种不同的类型策略，没有谁更对，只有谁更适合具体生态
3. **结构化类型（protocol）** 比标称类型（interface）灵活，但报错信息更难懂——是个权衡
4. **工业产品里最有价值的副产品有时不是产品本身**——Strongtalk 的 VM 比它的类型系统影响更大

## 延伸阅读

- 论文 PDF：[Bracha & Griswold OOPSLA 1993](https://bracha.org/oopsla93.pdf)（约 20 页，可读性中等）
- 后续抽象：[Bracha — Pluggable Type Systems (2004)](https://bracha.org/pluggableTypesPosition.pdf)（10 页，把 Strongtalk 经验提炼成方法论）
- 视频：Gilad Bracha 的多次演讲（YouTube 搜 "Gilad Bracha pluggable types"）有现场讲解
- 代码：[Strongtalk 开源仓库](https://github.com/talksmall/Strongtalk)（2006 开源，可以编译跑起来看）
- [[smalltalk-80]] —— Strongtalk 的宿主语言
- [[gradual-typing]] —— optional 的"近亲"，类型与运行时如何协同的另一种答案

## 关联

- [[smalltalk-80]] —— Strongtalk 是它的"加类型版本"，没有 Smalltalk-80 的反射与消息传递就没有 Strongtalk
- [[self-customization]] —— Self 是 Strongtalk 团队的另一条主线，VM 技术的源头
- [[self-pic]] —— polymorphic inline cache 来自 Self，被 Strongtalk VM 实现，再被 HotSpot 继承
- [[gradual-typing]] —— 与 optional 的精神近亲：怎样在动态语言里加静态保险
- [[hindley-milner]] —— 类型推导的另一极端：mandatory + 全自动；与 optional 形成对照
- [[simula-67]] —— 面向对象的祖先，Smalltalk 的灵感来源
- [[bidirectional-typing]] —— 现代类型检查器常用的内部机制，optional typing 也常用它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hotspot-server-compiler]] —— HotSpot Server Compiler — JVM 在运行时把热点 Java 代码翻译成飞快的本地码
- [[tracemonkey]] —— TraceMonkey — 只编"真的走过的那一条路"
