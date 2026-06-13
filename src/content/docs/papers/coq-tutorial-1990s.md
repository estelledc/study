---
title: The Coq Proof Assistant: A Tutorial — 零基础学习笔记
来源: https://coq.inria.fr/distrib/current/refman/proof-engine/coq-tutorial.html
日期: 2026-06-13
分类: 形式化方法
子分类: formal-verification
provenance: pipeline-v3
---

# The Coq Proof Assistant: A Tutorial — 零基础学习笔记

## 什么是 Coq？一个日常类比

想象你在给朋友解释"为什么 2 + 2 = 4"。

普通方式：你说"因为这就是数学啊"，朋友说"嗯好吧"，然后问题结束了。但"好吧"不是"确定"。

Coq 的方式：你和朋友一步步推导——从自然数的定义开始（0 是一个自然数；n 是自然数则 succ(n) 也是），然后定义加法，再一步一步用规则推出 2 + 2 = 4。**每一步都必须有依据，不能跳步。** 最终 Coq 会给出一份机器可检查的证明证书——任何人、任何程序都能独立验证它。

Coq（发音 /kɔk/，像法语公鸡的 "cock"）就是这样的东西：一个**交互式定理证明器**。你写"命题"（要证明的数学陈述），然后和 Coq 交互，一步步完成证明。它不是自动的——你需要引导——但一旦完成，证明的正确性就得到了数学级别的保证。

## 核心概念（从类比理解）

### 1. 命题即类型（Propositions as Types）

这是 Coq 最核心的思想，叫 **Curry-Howard 同构**。它说：

> **证明一个命题，等价于构造一个具有对应类型的项。**

类比：如果你说"所有 A 都是 B"，这在 Coq 里就是一个函数类型——给它一个 A，它返回一个 B。你写出这个函数，你就完成了证明。

### 2. 证明状态（Proof State）

当你进入证明模式，Coq 给你看两个东西：

- **上下文（Context）**：你已知的东西（假设、变量）
- **目标（Goal）**：你现在要证明的东西

类比：你正在解谜题。Context 是你手里的拼图块，Goal 是你要完成的画面。每次用一个"战术（tactic）"，你把手里的一块拼上去，画面（目标）就推进一些。

### 3. 战术（Tactics）

Tactic 是推动证明前进的命令。类比：

| 战术 | 类比动作 |
|------|---------|
| `intros` | 把题目给的已知条件拿过来放到手里 |
| `rewrite` | 用已知的等式替换东西 |
| `induction` | 用数学归纳法拆分问题 |
| `apply` | 拿一个已知定理直接套用 |
| `reflexivity` | "这明显成立啊"——让 Coq 自己判断 |

## 第一个例子：自然数加法交换律

让我们看 Coq 教程里最经典的例子之一。

```coq
(* 第一步：定义自然数 *)
Inductive nat : Set :=
| O : nat          (* 零 *)
| S : nat -> nat.  (* 后继函数：S O = 1, S (S O) = 2, 以此类推 *)

(* 第二步：定义加法（递归定义） *)
Fixpoint add (n m : nat) : nat :=
  match n with
  | O => m           (* 0 + m = m *)
  | S n' => S (add n' m)  (* (n+1) + m = S(n + m) *)
  end.

(* 第三步：声明我们要证明的命题 *)
Theorem add_ex : forall n m : nat, add n m = add m n.
(* 此时 Coq 说：
   Goal: forall n m : nat, add n m = add m n
   你还没有开始证明，Coq 在等你。
*)

Proof.
(* 第四步：进入证明模式 *)

(* 5.1: 把 n 和 m 从"forall"里拆出来，放到已知条件中 *)
intros n m.

(* 现在上下文是：
   n : nat
   m : nat
   ----------------------------
   Goal: add n m = add m n
*)

(* 5.2: 对 n 做数学归纳法 *)
induction n as [| n' IHn'].
(* 这拆成了两个子目标：
   子目标 1（n = O 的情况）：
     m : nat
     ----------------------------
     Goal: add O m = add m O

   子目标 2（n = S n' 的情况）：
     n' : nat
     m : nat
     IHn' : add n' m = add m n'   （归纳假设！）
     ----------------------------
     Goal: add (S n') m = add m (S n')
*)

(* 5.3: 处理子目标 1 *)
(* 先把 add 的定义"展开"，让 Coq 计算 *)
simpl.  (* 此时目标变成：m = add m O *)

(* 但这里需要另一个引理：m + 0 = m。
   先证明这个小引理： *)

Lemma add_rzero : forall n : nat, add n O = n.
Proof.
  intros n.
  induction n as [| n' IHn'].
  - simpl. reflexivity.           (* O = O，显然成立 *)
  - simpl. rewrite IHn'.           (* 用归纳假设替换 *)
    reflexivity.                   (* 现在也是 O = O *)
Qed.

(* 回到主证明，用这个引理完成第一个子目标 *)
rewrite add_rzero. reflexivity.

(* 5.4: 处理子目标 2 *)
simpl.                              (* 展开 add 的定义 *)
rewrite IHn'.                       (* 用归纳假设 *)
(* 此时目标变成：S (add m n') = S (add m n') *)
(* 等等——这里还需要 add_lzero 引理：0 + m = m *)

Lemma add_lzero : forall n : nat, add O n = n.
Proof.
  intros n. induction n as [| n' IHn'].
  - reflexivity.                    (* O = O *)
  - simpl. rewrite IHn'. reflexivity.
Qed.

(* 回到主证明 *)
rewrite add_lzero. reflexivity.

(* 完成！所有子目标都解决了 *)
Qed.
```

**这个例子教了我们什么？**

1. `Inductive` 定义了数据类型（自然数就是 O 和 S 递归生成的）
2. `Fixpoint` 做了递归函数（加法就是对第一个参数递归）
3. `Theorem` 声明命题，`Proof...Qed` 包围证明
4. `induction` 把"对任意 n"拆成"n=0"和"n=n'+1"两件事
5. `rewrite` 用等式替换——这是 Coq 证明中最常用的战术之一

## 第二个例子：布尔逻辑的与运算

再看一个稍短但结构清晰的例子，展示 Coq 如何处理逻辑。

```coq
(* 定义布尔类型 *)
Inductive bool : Set := true | false.

(* 定义与运算（andb） *)
Fixpoint andb (b1 b2 : bool) : bool :=
  match b1 with
  | true => b2
  | false => false
  end.

(* 命题：与运算满足交换律 *)
Theorem andb_swap : forall b1 b2 : bool, andb b1 b2 = andb b2 b1.

Proof.
  intros b1 b2.

  (* 分情况讨论 b1 *)
  case b1 as [|].
  (* 现在有两个子目标：
     Case 1: b1 = true, 要证 andb true b2 = andb b2 true
     Case 2: b1 = false, 要证 andb false b2 = andb b2 false
  *)

  (* Case 1: b1 = true *)
  simpl.                               (* andb true b2 → b2 *)
  case b2 as [|].
  (* 子子目标 1a: b2 = true → true = true  ✅ reflexivity *)
  (* 子子目标 1b: b2 = false → false = false ✅ reflexivity *)

  (* Case 2: b1 = false *)
  simpl.                               (* andb false b2 → false *)
  case b2 as [|].
  (* 子子目标 2a: false = andb true false → false = false ✅ *)
  (* 子子目标 2b: false = andb false false → false = false ✅ *)

  (* 所有情况都成立了 *)
 Qed.
```

这个例子展示了 `case`（分情况讨论）战术——当你处理有限类型（如布尔值只有 true/false）时非常有用。

## 关键命令速查

| 命令 | 作用 |
|------|------|
| `Definition` | 定义一个常量 |
| `Fixpoint` | 定义递归函数（必须有一个参数递减） |
| `Inductive` | 定义数据类型（如 nat、bool） |
| `Theorem` / `Lemma` | 声明一个要证明的命题（Lemma 是"小定理"） |
| `Proof...Qed.` | 进入并完成证明 |
| `Fail...Fail.` | 声明一个显然成立的事实（不需要证明） |
| `Compute` | 让 Coq 计算表达式的值 |
| `Check` | 查看某个项的类型 |
| `Print` | 显示某个定义的内容 |

## 为什么这很重要

Coq 不只是教学玩具。它被用于：

- **验证操作系统内核**：seL4 微内核的形式化验证
- **验证编译器**：CompCert C 编译器，证明代码翻译不改变程序行为
- **验证密码学**：形式化证明加密协议的正确性
- **验证数学定理**：四色定理、傅里叶级数收敛定理等

当你用 Coq 写完一个证明，你不是"说服了自己"——你是构造了一个可以被任何程序验证的数学对象。这就是它和其他"辅助证明工具"的根本区别。

## 学习下一步

1. 安装 Coq（`opam install coq` 或从 coq.inria.fr 下载）
2. 使用 Coq 编辑器（Proof General、VS Code + Coqdoc、Coq IDE）来交互式写证明
3. 读官方教程：The Coq Proof Assistant: A Tutorial
4. 尝试证明更多基础命题：排中律、德摩根定律等

---

*本文基于 The Coq Proof Assistant: A Tutorial 教程及 Coq 官方参考文档编写。*
