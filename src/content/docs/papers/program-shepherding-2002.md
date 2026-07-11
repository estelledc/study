---
title: Program Shepherding — 给每次跳转安排门卫
来源: 'Vladimir Kiriansky, Derek Bruening, Saman Amarasinghe, "Secure Execution via Program Shepherding", USENIX Security 2002'
日期: 2026-07-09
分类: security-privacy
难度: 中级
---

## 是什么

Program Shepherding 是一种**在程序运行时盯住每一次控制流转移，并按安全策略决定能不能跳过去**的方法。

日常类比：一栋办公楼不可能把每个员工的包都拆开检查，但可以在每扇门口放门禁。只要有人想进机房、跳进消防通道、从窗户翻进会议室，门卫就问："你从哪里来？你要去哪里？这条路被允许吗？"

论文的思路很直接：攻击者经常先利用缓冲区溢出或格式化字符串漏洞，把某个返回地址、函数指针或 GOT 项改掉；真正造成伤害的是最后那一步——CPU 被带去执行攻击者想执行的代码。

Program Shepherding 不试图阻止所有内存写入。它换一个位置防守：让普通二进制程序在 RIO 这样的运行时系统里执行，每个基本块进入代码缓存前检查来源，每次跳转建立连接前检查目标，必要时给系统调用等操作加不可绕过的沙箱检查。

## 为什么重要

不理解 Program Shepherding，下面这些事都很难解释：

- 为什么早期 x86 上"数据页可执行"会让栈溢出特别危险：攻击数据一旦被当成代码跳过去，就能运行。
- 为什么只给函数开头结尾打补丁不够：攻击者可能直接跳到补丁后面，绕过检查。
- 为什么现代控制流完整性会关心"跳转目标集合"：安全边界不是某行代码，而是控制流能不能走到那里。
- 为什么动态二进制监控能保护未修改程序：它不需要源码，而是在运行时接管跳转、缓存和翻译。

## 核心要点

Program Shepherding 可以拆成三件事：

1. **限制代码来源**：只允许来自原始磁盘镜像、已加载库或被策略认可的动态生成代码执行。类比：门卫先看工牌是不是公司发的，不让手写假工牌进门。

2. **限制控制流转移**：直接跳转、间接调用、返回指令都要符合策略。类比：你可以从办公室去茶水间，但不能从茶水间直接钻进财务保险柜。

3. **不可绕过的沙箱**：如果某个系统调用需要检查，攻击者不能跳到检查后面的半截代码。类比：安检机不是摆设，所有入口都必须从安检机前面经过。

这三点合起来，把"程序有没有漏洞"这个难题，转成"攻击能不能把控制流带到危险地方"这个更集中的问题。

## 实践案例

### 案例 1：执行前先看代码来源

```c
bool may_execute(Block b) {
  if (b.from_original_text && !b.modified) return true;
  if (b.generated_at_runtime && policy.allows_jit) return true;
  return false;
}
```

**逐部分解释**：

- `from_original_text` 表示这段指令来自程序或共享库的原始代码段。
- `modified` 用来挡住自修改或被攻击者改过的代码页。
- `generated_at_runtime` 给 JIT 留口子，但是否允许由策略决定。
- 论文把检查放在基本块复制进代码缓存时，所以同一块代码不用每次执行都重复检查。

### 案例 2：返回指令只能回到 call 后面

```c
bool valid_return(uintptr_t target) {
  return address_after_executed_call.contains(target);
}
```

**逐部分解释**：

- 返回地址被溢出覆盖时，攻击者想让 `ret` 跳到任意位置。
- Shepherding 记录合法 call 之后的位置，只允许 `ret` 回到这些点。
- 这会严重限制 return-into-libc 和链式返回攻击，因为链条不能随便拼接函数片段。
- 这不是证明程序没有 bug，而是让被篡改的返回地址很难变成有用的控制权。

### 案例 3：沙箱检查不能被跳过

```c
void cached_syscall_block() {
  check_policy_for_execve();  // 必须先经过这里
  real_execve();
}
```

**逐部分解释**：

- 普通沙箱如果只是插一段检查，攻击者可能跳到 `real_execve` 前一行，绕开 `check_policy_for_execve`。
- RIO 只允许控制流进入代码缓存中基本块或 trace 的开头。
- 如果间接跳转想落到基本块中间，查表会失败，系统会重新复制一个从该位置开始的新块，并重新插入检查。
- 所以检查不再是"希望攻击者走正门"，而是"所有门都从检查前开始"。

## 踩过的坑

1. **把它当成修补漏洞**：它不修复缓冲区溢出，只阻止溢出之后把控制流带去危险位置。

2. **以为只挡 shellcode**：代码来源策略挡注入代码，控制流策略还要挡重用已有 libc 代码的攻击。

3. **忽略系统自身保护**：RIO 的代码缓存和哈希表也在同一进程里，若不保护这些数据结构，门卫自己会被攻击。

4. **把"低开销"理解成零成本**：常见热路径接近无额外指令，但页权限切换、线程和异常路径仍可能带来明显成本。

## 适用 vs 不适用场景

**适用**：

- 没有源码、不能重新编译，但想保护现成 IA-32 二进制程序。
- 想挡栈溢出、格式化字符串漏洞导致的代码注入和返回地址劫持。
- 想做运行时策略实验，比如限制库入口、系统调用或动态生成代码。
- 想理解后来的控制流完整性、动态二进制插桩和代码缓存系统。

**不适用**：

- 想阻止所有数据破坏；论文明确说 sensitive data overwrite 不在核心保护范围内。
- 程序大量自修改代码或复杂 JIT，代码来源策略会变难，需要额外失效机制。
- 需要强语义判断的多步合法 API 滥用，仅靠控制流目标集合不够。
- 实时系统或频繁页权限切换场景，因为保护监控器自身可能引入延迟。

## 历史小故事（可跳过）

- **1996 年**：Aleph One 的栈溢出文章让"把数据当代码跳过去"成为安全经典问题。
- **1998 年**：StackGuard 用 canary 保护返回地址，但需要编译器改动，且主要针对顺序覆盖。
- **2000 年**：Dynamo 证明运行时动态优化可以把基本块缓存、链接和 trace 做得足够快。
- **2001 年**：StackGhost、FormatGuard 等系统分别保护返回地址或格式化字符串，覆盖面仍有限。
- **2002 年**：Kiriansky、Bruening、Amarasinghe 把动态优化基础设施改造成安全门卫，提出 Program Shepherding。

## 学到什么

- **防守位置可以后移**：不必抓住每一次非法写入，只要阻止非法写入最终变成危险跳转。
- **控制流是安全边界**：攻击能不能成功，取决于 CPU 最后能不能到达攻击者想要的指令。
- **缓存让运行时监控可用**：第一次复制基本块时检查，之后在代码缓存里高速运行。
- **策略和机制要分开**：RIO 提供"所有跳转都可控"的机制，具体允许哪些来源和目标由安全策略决定。

## 延伸阅读

- 论文 PDF：[Kiriansky et al. 2002 — Secure Execution via Program Shepherding](https://www.usenix.org/legacy/publications/library/proceedings/sec02/full_papers/kiriansky/kiriansky.pdf)
- 参考系统：[Dynamo: A Transparent Runtime Optimization System](https://dl.acm.org/doi/10.1145/349299.349303)（代码缓存和 trace 的早期代表）
- 背景文章：[Smashing The Stack For Fun And Profit](http://phrack.org/issues/49/14.html)（理解论文威胁模型的经典材料）
- 对照阅读：StackGuard 和 StackGhost 保护返回地址，Program Shepherding 保护更一般的控制流入口。

## 关联

- [[newsome-taintcheck-2005]] —— 同样运行未修改二进制，但 TaintCheck 追数据来源，Shepherding 追控制流目标。
- [[avgustinov-codeql-2016]] —— CodeQL 用静态查询找潜在漏洞，Shepherding 在真实运行时拦截利用结果。
- [[hotspot-server-compiler]] —— 两者都依赖运行时代码缓存；HotSpot 为性能，RIO 在这里服务安全策略。
- [[pypy-tracing-jit]] —— trace 让热路径少回到解释器，Shepherding 也借 trace 降低监控开销。
- [[llvm]] —— LLVM 代表编译期改代码的路线，Program Shepherding 代表不改二进制的运行时路线。
- [[aes]] —— AES 保护数据内容机密性，Shepherding 保护程序执行路径不被劫持。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[newsome-taintcheck-2005]] —— TaintCheck — 给不可信输入贴追踪标签
