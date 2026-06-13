---
title: Iterated Register Coalescing
来源: https://www.cs.princeton.edu/~appel/papers/coalesce.pdf
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
provenance: pipeline-v3
---

# Iterated Register Coalescing — 零基础学习笔记

## 一、日常类比：把同名物品合并到同一个抽屉

想象你在整理一个有很多抽屉的柜子。每个抽屉代表 CPU 里的一枚物理寄存器。程序里的每一个变量，都需要放进某个抽屉。

现在有两个变量 `a` 和 `b`，中间有一条指令 `b = a`（把 a 的值复制给 b）。如果 a 放在第 1 号抽屉，b 也放在第 1 号抽屉，那这条复制指令就完全不需要执行——因为两个名字指向同一个抽屉，值天然一样。编译器称这种操作为 **coalescing（合并）**：把两个变量"合并"到同一个寄存器，从而消除一条 move 指令。

但有个问题：如果 a 和 b 在同一时刻都在"使用中"（即它们的值同时 live），你就不能把它们放进同一个抽屉。这叫 **interference（干扰）**。

Chaitin 在 1982 年提出了最早的图着色寄存器分配算法，但它把所有 copy 指令都当作 coalescing 的机会去合并，结果常常把太多节点"粘"在一起，导致图的色数超过了可用寄存器的数量，不得不把一些变量"spill"到内存里。

George 和 Appel 在 1996 年的这篇论文，核心贡献就是：**不要贪心地一次合并所有能合并的 copy，而是分多轮迭代，每轮只合并那些"安全"的 copy，最后再处理剩下的。** 这就是 Iterated Register Coalescing（迭代寄存器合并，简称 IRC）。

## 二、核心概念

### 2.1 干扰图（Interference Graph）

编译器先把程序的变量和临时值画成一张图：

- 每个节点 = 一个变量的"生命周期"（live range）
- 每条边 = 两个变量的生命周期有重叠，不能放同一个寄存器

```
    程序代码：          干扰图示意：
                       (每个字母是一个节点)
    a = 1              a --- b
    b = a + 1          |     |
    c = b * 2          |     |
    d = a + c          c --- d
```

这里 a 和 b 同时 live，所以有边；a 和 c 也有边（因为 a 在 d = a + c 中还在使用）。

### 2.2 三种节点类型

IRC 把节点分成三类，这是理解整个算法的关键：

1. **Move 相关节点（Move-related）**：被 copy 指令连接的节点，比如 `b = a` 中的 a 和 b
2. **预着色节点（Pre-colored）**：已经绑定到特定物理寄存器的变量，比如函数参数、返回值
3. **普通节点（Non-move-related）**：跟 copy 无关的临时变量

### 2.3 简化（Simplify）— 别急着决定

IRC 的第一遍遍历干扰图，尝试找到一个节点排序。对于度数（连接的边数）小于可用寄存器数量 K 的节点，把它"压栈"并暂时从图中删掉。这个过程叫 simplify。

**类比**：你有一堆人要和很多人握手。如果某个人握手的次数少于你能安排的座位数，就先让他"等一下"，把他记在笔记本上，然后从房间裡把他"请出去"，减少其他人的握手负担。反复这样做，直到所有人都出去了。

### 2.4 保守的 Coalescing（Conservative Coalescing）

如果简化之后还有节点剩下来（说明图的复杂程度超过了 K），IRC 不会立刻决定谁该 spill，而是进入 coalescing 阶段：

- 遍历所有的 copy 指令
- 对于每个 copy `b = a`，检查：如果把 a 和 b 合并成一个节点，新节点的度数是否会超过 K？
- **只有不会导致度数超过 K 时才合并**（这就是 Briggs 提出的"保守"准则）
- 合并后继续遍历，可能之前的"危险"节点因为别人被合并而变得"安全"了

**类比**：你发现房间裡还有几个人没安排座位。你开始找人"共享"座位——两个人坐一个。但你很谨慎：只有当这两个人合起来需要握手的总人数不超过座位数时，才让他们共享。而且每合并一对，你就重新检查一下其他人是不是也能共享了。

### 2.5 选色（Select）— 最后一锤定音

所有节点都压栈后，从栈顶一个个弹出，给它们分配颜色（寄存器）：

- 弹出节点时，查看它邻居们已经用了哪些颜色
- 从可用的颜色中选一个（优先选和 copy 源节点相同的颜色）
- 如果找不到可用颜色，说明之前简化时"压栈"压错了，需要回溯（spills）

## 三、为什么叫"Iterated"（迭代）？

Chaitin 的原始算法只做一轮：build → coalesce → simplify → select。如果 select 失败了，整条路径就断了。

IRC 的做法是把 coalescing 和 simplify/select 放在一个循环里：

1. 构建干扰图
2. 简化（压栈）
3. 如果不能全部简化，尝试 coalescing
4. 如果 coalescing 成功，回到步骤 2
5. 如果 coalescing 也无法推进，选一个节点 spill，插入 load/store 代码，回到步骤 1

这个循环可以跑很多轮，每一轮都在上一轮的基础上改进。这就是"iterated"的含义。

## 四、代码示例

### 示例 1：Coalescing 如何消除 move 指令

**没有 Coalescing 的情况**：

```python
# 源代码
a = x + y       # a 分配到寄存器 R1
b = a           # b 分配到寄存器 R2，需要执行: MOV R2, R1
result = b + 1  # 从 R2 读取 b 的值

# 生成的汇编（4 条指令）
MOV  R1, x
ADD  R1, R1, y
MOV  R2, R1      # <-- 这条 move 指令是多余的！
ADD  result, R2, 1
```

**IRC Coalescing 后的情况**：

```python
# IRC 发现 a 和 b 不干扰（a 的生命周期在 b 使用前就结束了）
# 于是把 a 和 b 合并到同一个节点，都分配到 R1

# 生成的汇编（3 条指令，少了一条）
MOV  R1, x
ADD  R1, R1, y
ADD  result, R1, 1   # b = a 被消除了！
```

### 示例 2：IRC 的迭代过程

```python
# 假设我们有 2 个可用寄存器 (K=2)
# 干扰图：a-b, b-c, c-d, d-a, b-d
# copy 指令：b = a, d = c

# 初始状态：
#   节点度数：a=3, b=4, c=2, d=4
#   K = 2

# 第一轮 Iterate：
# Step 1 - Simplify: 没有节点的度数 < 2，无法简化
# Step 2 - Coalesce:
#   检查 copy b = a: degree(b)+degree(a) = 4+3 = 7 > 2，跳过
#   检查 copy d = c: degree(d)+degree(c) = 4+2 = 6 > 2，跳过
# Step 3 - Spill: 选度数最高的节点 spill（比如 b）
#   插入 spill 代码，回到步骤 1

# 第二轮 Iterate（b 已被 spill，图中少了 b 节点）：
#   节点度数：a=2, c=2, d=2
# Step 1 - Simplify:
#   a 的度数 = 2 >= K=2，跳过
#   c 的度数 = 2 >= K=2，跳过
#   d 的度数 = 2 >= K=2，跳过
# Step 2 - Coalesce:
#   检查 copy d = c: degree(d)+degree(c) = 2+2 = 4 > 2，跳过
# Step 3 - Spill: 选一个 spill（比如 d）
#   回到步骤 1

# 第三轮 Iterate（b 和 d 都被 spill）：
#   节点度数：a=1, c=1
# Step 1 - Simplify:
#   a 的度数 = 1 < K=2，压栈 a
#   c 的度数 = 1 < K=2，压栈 c
# Step 2 - Select:
#   弹出 c：邻居中没有已着色的，选颜色 0
#   弹出 a：邻居 c 用了颜色 0，选颜色 1
# 完成！

# 最终结果：
#   a -> R0 (颜色 0)
#   c -> R1 (颜色 1)
#   b -> spill 到内存
#   d -> spill 到内存
```

### 示例 3：实际编译器中的 IRC

```python
# 以 GCC 的寄存器分配器为例
# 源代码：
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

# 编译器内部表示（伪 IR）：
#   %tmp1 = icmp sle i32 %n, 1
#   %tmp2 = mul i32 %n, %tmp3
#   %tmp3 = call i32 @factorial(i32 %n_sub1)
#   %n_sub1 = sub i32 %n, 1
#   mov %result, %tmp2

# IRC 的工作流程：
# 1. Build 干扰图：%tmp1, %tmp2, %tmp3, %n_sub1, %n, %result
# 2. Coalesce 轮次 1：尝试合并不干扰的 copy 相关节点
# 3. Simplify：度数低的节点入栈
# 4. 如果卡住，Spill 一个节点，重新构建图
# 5. Select：弹出节点，分配物理寄存器（RAX, RBX 等）
# 6. 生成最终汇编
```

## 五、IRC 的优势与局限

### 优势

1. **更少的 spill**：保守 coalescing 避免了过度合并导致的不必要的 spill
2. **消除更多 move**：迭代的方式确保即使第一轮合并失败的 copy，在后续轮次中仍有机会被合并
3. **工程上非常有效**：被 GCC、LLVM 等主流编译器采用

### 局限

1. **启发式而非最优**：IRC 是启发式算法，不保证找到最优解
2. **回溯开销**：Select 阶段可能需要回溯，增加编译时间
3. **对复杂架构支持有限**：原始的 IRC 假设单一寄存器银行，对现代 CPU 的多寄存器类别（如 x87 FP 寄存器、SIMD 寄存器）支持较弱

## 六、延伸阅读

- Chaitin 1982 年的原始图着色寄存器分配论文
- Briggs, Cooper, Torczon 1992 年的 Conservative Coalescing 改进
- Poletto 1999 年的 Linear Scan 寄存器分配（另一种主流方法，被 V8、HotSpot 等 JIT 编译器使用）
- George & Appel 1996 原文：https://www.cs.princeton.edu/~appel/papers/coalesce.pdf
