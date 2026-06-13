---
title: Hypothesis — Python 属性驱动测试入门
来源: https://github.com/HypothesisWorks/hypothesis
日期: 2026-06-13
分类: 后端 API
子分类: education-tech
provenance: pipeline-v3
---

# Hypothesis — Python 属性驱动测试入门

## 一、日常类比：你为什么要"乱点"测试？

假设你要写一个排序函数。传统测试是这样做的：

> 我准备几组数据：`[3, 1, 2]`、`[1]`、`[]`，然后调用我的排序函数，看看输出对不对。

这种方式叫**示例驱动测试**（Example-Driven Testing）——你手动挑几个用例去验证。问题在于：你挑的用例再精妙，也只是大海里的一两滴水。边界情况（负数、超大数、空列表、重复元素……）你永远猜不全。

Hypothesis 做了一件完全不同的事：它像一台自动投注机，替你随机生成成千上万组输入数据去测试同一个函数，并且如果发现某个输入会让函数出错，它会帮你找到**最简单**的那个反例。

所以 Hypothesis 的核心思想一句话概括：**你写的是"什么应该成立"（属性），它替你生成"什么时候不成立"（反例）**。

## 二、安装

```bash
pip install hypothesis
```

## 三、核心概念

### 3.1 Strategy（策略）

策略是 Hypothesis 的基石。它是一个描述器，告诉 Hypothesis "从这里随机抽数据"。比如：

- `st.integers()` — 随机整数
- `st.text()` — 随机文本
- `st.lists(st.integers())` — 随机整数列表

### 3.2 @given 装饰器

`@given` 把策略"注入"到测试函数里。调用这个函数时，Hypothesis 替你生成参数并反复执行。

```python
from hypothesis import given, strategies as st

@given(st.integers())
def test_integers_are_int(n):
    assert isinstance(n, int)
```

这里 `st.integers()` 就是策略。`@given(st.integers())` 意味着：每次调用 `test_integers_are_int()` 时，Hypothesis 随机生成一个整数传给 `n`。默认跑 100 次。

### 3.3 自动最小化（Shrinking）

这是 Hypothesis 最酷的地方。测试出错了，它不只告诉你"有个输入挂了"，而是帮你找到**最小的**那个失败输入。

比如你用 `my_sort` 排序了一个列表 `[0, 0]`，它报错时直接告诉你：

```
Falsifying example: test_matches_builtin(ls=[0, 0])
```

它自动把复杂输入简化，帮你定位问题的根因。

## 四、代码示例

### 示例 1：验证排序正确性

```python
from hypothesis import given, strategies as st

def my_sort(lst):
    """我的冒泡排序实现"""
    result = lst.copy()
    n = len(result)
    for i in range(n):
        for j in range(0, n - i - 1):
            if result[j] > result[j + 1]:
                result[j], result[j + 1] = result[j + 1], result[j]
    return result


@given(st.lists(st.integers(), min_size=0, max_size=20))
def test_my_sort_is_always_sorted(lst):
    """排序后的列表必须有序"""
    result = my_sort(lst)
    for i in range(len(result) - 1):
        assert result[i] <= result[i + 1], f"{result[i]} > {result[i+1]}"
```

上面的测试中，`st.lists(st.integers(), min_size=0, max_size=20)` 会生成 0 到 20 个整数的任意列表。Hypothesis 会尝试各种边界情况：空列表、全相同元素、已经排好序的列表、逆序列表……

### 示例 2：结合 assume 过滤不想要的输入

```python
from hypothesis import given, strategies as st, assume
import math


def my_sqrt(x):
    """简单的平方根实现"""
    if x < 0:
        raise ValueError("不接受负数")
    return math.sqrt(x)


@given(st.floats(min_value=0.0, allow_nan=False, allow_infinity=False))
def test_sqrt_square_returns_original(x):
    """平方根的平方应该等于原数"""
    assume(x > 0)  # 跳过 x=0 的情况，让测试更聚焦
    result = my_sqrt(x)
    # 浮点数比较要用近似值
    assert abs(result * result - x) < 1e-6, f"sqrt({x})^2 = {result*result}"
```

`assume()` 告诉 Hypothesis："如果遇到不符合条件的输入，跳过这次测试而不是让它失败"。它和 `.filter()` 不同，`filter()` 在策略层面过滤，`assume()` 在测试函数内部过滤。

### 示例 3：带 pytest 的参数化测试

```python
import pytest
from hypothesis import given, strategies as st


@pytest.mark.parametrize("operation", [reversed, sorted])
@given(st.lists(st.integers(), min_size=1))
def test_list_operation_preserves_length(operation, lst):
    """无论用 reversed 还是 sorted，长度都不变"""
    assert len(lst) == len(list(operation(lst)))
```

Hypothesis 和 pytest 天然兼容。你可以把 `@pytest.mark.parametrize` 和 `@given` 叠加使用，测试的组合空间会更大。

## 五、常用内置策略速查

| 策略 | 说明 |
|---|---|
| `st.integers(min_value, max_value)` | 指定范围的整数 |
| `st.text(min_size, max_size)` | 字符串 |
| `st.lists(elements, min_size, max_size)` | 列表 |
| `st.builds(cls, ...)` | 构造对象实例 |
| `st.sampled_from([...])` | 从固定列表中随机选 |
| `st.one_of(s1, s2)` | 从多个策略中选一个 |

## 六、进阶用法

### 6.1 设置参数

```python
from hypothesis import settings, given, strategies as st


@settings(max_examples=500)
@given(st.lists(st.integers()))
def test_with_more_examples(lst):
    assert sorted(lst) == lst or lst != sorted(lst, reverse=True)
```

`@settings(max_examples=500)` 可以让测试跑 500 次而不是默认的 100 次，覆盖更多输入空间。

### 6.2 Composite 策略（依赖生成）

当两个输入之间存在依赖关系时，可以用 `@composite`：

```python
from hypothesis import composite, given, strategies as st


@composite
def ordered_pair(draw):
    """生成 n1 <= n2 的有序对"""
    n1 = draw(st.integers())
    n2 = draw(st.integers(min_value=n1))
    return (n1, n2)


@given(ordered_pair())
def test_ordered_pairs(pair):
    n1, n2 = pair
    assert n1 <= n2
```

## 七、与传统 unittest 的区别

| | 传统 unittest | Hypothesis |
|---|---|---|
| 输入 | 你手动准备 | Hypothesis 自动生成 |
| 覆盖范围 | 你选的 N 个用例 | 100+ 个随机用例 |
| 边界发现 | 靠你自己想 | Hypothesis 自动发现 |
| 失败时 | 只告诉你失败的用例 | 帮你找到最小反例 |
| 测试本质 | "用这些数测试" | "这些性质必须成立" |

## 八、总结

Hypothesis 的核心价值可以用三个词概括：**策略、生成、最小化**。

1. 你用策略描述"合法的输入长什么样"
2. Hypothesis 自动从策略中生成大量随机输入去跑你的测试
3. 一旦发现 bug，它自动缩小输入范围，帮你找到最小反例

对于学习 TDD 和属性驱动编程来说，Hypothesis 是一个绝佳的起点。它不要求你懂复杂的数学或形式化验证，只需要你能说出"什么是对的"。

## 九、继续学习

- 官方教程：https://hypothesis.readthedocs.io/en/latest/tutorial/index.html
- 内置策略参考：https://hypothesis.readthedocs.io/en/latest/reference/strategies.html
- GitHub 仓库：https://github.com/HypothesisWorks/hypothesis
