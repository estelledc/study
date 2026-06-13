---
title: Loopy Hell(ow): Infinite Traffic Loops at the Application Layer
来源: https://www.usenix.org/conference/usenixsecurity24/presentation/pan-yepeng
日期: 2026-06-13
分类: 网络协议
子分类: 网络安全
provenance: pipeline-v3
---

# Loopy Hell(ow): Infinite Traffic Loops at the Application Layer

## 一、一句话概括

这篇论文发现了一个全新的 DoS 攻击方式：攻击者只需要发送**一条**伪造的包，就能让两台服务器**无限地互相发消息**，直到把它们的带宽或计算资源耗尽。这种攻击几乎零成本，而且不需要控制任何被攻击的服务器。

## 二、日常类比：两个爱抱怨的朋友

想象有两个人 A 和 B：

- A 的规则是："如果别人对我发脾气，我也对他发脾气。"
- B 的规则也一样："如果别人对我发脾气，我也对他发脾气。"

现在有一个捣蛋鬼 C，他先跑去对 A 发了一次脾气，然后故意说自己是 B 派来的。于是 A 也对 B 发了一次脾气。B 收到后也生气了，回敬 A。A 又生气……就这样两人没完没了地吵架，而 C 只需要说一句话就撤了，剩下的事全由 A 和 B 自己完成。

网络世界里的服务器就是这样被利用的。

## 三、核心概念

### 3.1 传统 DoS vs. 环路 DoS

传统的 DoS 攻击（比如 SYN Flood、DNS 放大攻击）要求攻击者**持续不断地**发送大量流量。而环路 DoS 的关键区别在于：

- 攻击者只发**一个**触发包
- 之后服务器之间**无限循环**互发
- 不需要持续发送，也不需要控制被攻击的服务器

### 3.2 为什么 IP 层的 TTL 拦不住？

IP 协议有一个叫 TTL（Time To Live）的机制：每个数据包经过一个路由器时，TTL 减 1，到 0 就被丢弃。这防止了**网络层**的路由环路无限转圈。

但是应用层环路发生在**应用层**——数据包正常地被路由器转发，只是在应用层被反复处理。TTL 照常递减，但每次数据包到达新目的地时，都会生成**新的**应用层响应包，这些新包的 TTL 是重新设置的，所以永远不会因为 TTL=0 而被丢弃。

### 3.3 环路图（Loop Graph）

论文的核心方法论是构建"环路图"：

1. 向目标服务器发送各种测试包（包括错误包、畸形包）
2. 记录每台服务器的响应行为
3. 把响应按语义聚类成不同的"簇"（cluster）
4. 构建一个有向图：节点是簇，边表示"收到某类包后回复另一类包"
5. 在这个图中寻找环（cycle），环就意味着两台服务器可能互相触发

## 四、关键发现

### 4.1 数据概览

论文研究了 9 种协议，发现了惊人的结果：

| 协议类别 | 协议 | 受影响主机数 | 潜在环路对数 | 验证成功率 |
|---------|------|------------|-------------|-----------|
| 常用协议 | DNS | ~98,374 | ~10 亿 | 70.1% |
| 常用协议 | NTP | ~82,318 | ~34.7 亿 | 95.2% |
| 常用协议 | TFTP | ~19,027 | ~1.8 亿 | 84.5% |
| 遗留协议 | Chargen, QOTD, Echo 等 | ~96,500 | ~15.6 亿 | 78.1% |
| **合计** | | **~296,000** | **~53 亿+** | — |

### 4.2 三种环路类型

**类型一：错误消息循环**

最常见的类型。两台服务器收到错误消息后，自己也回复错误消息，形成闭环。

DNS 中的例子：Server A 收到"服务器故障"响应后，又回复一个"服务器故障"给 Server B。Server B 也这样做，无限循环。

**类型二：中间件效应环路（Middlebox Effect）**

某些国家部署了 DNS 审查中间件。当中间件看到特定域名的查询时，会注入伪造的 DNS 响应。论文发现伊朗的中间件就存在这种行为——不同形式的伪造响应互相触发。

**类型三：遗留协议天然环路**

像 Chargen（字符生成器）、QOTD（每日名言）这些古老协议，根本不区分请求和响应——不管收到什么，都回复一堆随机文本。所以两台 Chargen 服务器天然就能互相形成环路。

## 五、代码示例

### 5.1 DNS 环路触发示例

下面模拟 DNS 环路的工作原理。假设两台 DNS 服务器 A 和 B，它们都有同一个 bug：收到"服务器故障"的 DNS 响应包后，也会回复一个"服务器故障"。

```python
# 模拟 DNS 服务器
class FaultyDNSServer:
    def __init__(self, name):
        self.name = name

    def handle_packet(self, packet):
        """
        处理收到的 DNS 包。
        Bug 所在：如果收到的包是错误响应，自己也回复错误响应。
        """
        if packet.get("rcode") == "server-failure":
            # 错误的行为：对错误消息回复错误消息
            return {
                "qr": 1,                    # 这是响应包
                "opcode": "QUERY",
                "rcode": "server-failure",  # 也是服务器故障
                "qdcount": 1,               # 保留问题字段
                "question": packet.get("question"),
            }
        else:
            # 正常行为：解析并返回答案
            return self.resolve(packet)

    def resolve(self, packet):
        """正常的 DNS 解析逻辑"""
        return {
            "qr": 1,
            "rcode": "no-error",
            "answer": "1.2.3.4",
        }


def simulate_loop(server_a, server_b, trigger_packet, max_rounds=5):
    """
    模拟两台服务器之间的环路。
    攻击者只需要发出 trigger_packet 一次。
    """
    print(f"攻击者发送触发包: {trigger_packet}")
    print("-" * 50)

    current = trigger_packet
    sender = "Attacker"
    for i in range(max_rounds):
        # 决定目标服务器
        target = server_a if sender == "Attacker" or sender == "Server B" else server_b
        response = target.handle_packet(current)

        print(f"第 {i+1} 轮: {sender} -> {target.name}: {response['rcode']}")

        # 下一轮的发送者变成刚才回复的那台服务器
        sender = target.name
        current = response

        # 如果响应不再是错误，环路终止
        if response.get("rcode") != "server-failure":
            print(f"环路在第 {i+1} 轮终止（rcode={response['rcode']}）")
            break
    else:
        print(f"环路持续了 {max_rounds} 轮仍未终止！")


# 创建两台有 bug 的 DNS 服务器
server_a = FaultyDNSServer("DNS_A")
server_b = FaultyDNSServer("DNS_B")

# 攻击者构造一个伪造的触发包：伪装成 DNS_B 发出的服务器故障响应
trigger = {
    "qr": 1,                  # 响应包
    "rcode": "server-failure",
    "question": {"name": "example.com", "type": "A"},
}

simulate_loop(server_a, server_b, trigger)
```

运行结果：

```
攻击者发送触发包: {'qr': 1, 'rcode': 'server-failure', 'question': {'name': 'example.com', 'type': 'A'}}
--------------------------------------------------
第 1 轮: Attacker -> DNS_A: server-failure
第 2 轮: DNS_A -> DNS_B: server-failure
第 3 轮: DNS_B -> DNS_A: server-failure
第 4 轮: DNS_A -> DNS_B: server-failure
第 5 轮: DNS_B -> DNS_A: server-failure
环路持续了 5 轮仍未终止！
```

### 5.2 Chargen 遗留协议环路示例

Chargen 协议更简单：不管收到什么，都返回一行随机文本。两台 Chargen 服务器天然形成环路。

```python
import random
import string


class ChargenServer:
    def __init__(self, name):
        self.name = name

    def handle_packet(self, _data):
        """
        Chargen 协议的实现：完全忽略输入，生成随机文本。
        这就是为什么它天然会形成环路。
        """
        # 生成一行 7-72 个字符的随机文本
        length = random.randint(7, 72)
        text = ''.join(random.choices(string.printable, k=length))
        return f"{text}\n"


def simulate_chargen_loop(server_a, server_b, max_rounds=5):
    """
    模拟两台 Chargen 服务器之间的环路。
    不需要伪造源地址——它们对任何输入都会回复。
    """
    print(f"Chargen 环路模拟（{server_a.name} <-> {server_b.name}）")
    print("-" * 50)

    current_data = b""
    sender = "External"

    for i in range(max_rounds):
        target = server_a if sender == "External" or sender == "Chargen_B" else server_b
        response = target.handle_packet(current_data)

        print(f"第 {i+1} 轮: {sender} -> {target.name}: '{response.strip()}'")

        sender = target.name
        current_data = response.encode()


simulate_chargen_loop(ChargenServer("Chargen_A"), ChargenServer("Chargen_B"))
```

### 5.3 修复后的服务器（不回复错误消息）

```python
class FixedDNSServer:
    """修复后的 DNS 服务器：收到错误消息时保持沉默"""

    def __init__(self, name):
        self.name = name

    def handle_packet(self, packet):
        """
        修复：不回复错误消息。
        根据 RFC 规定，服务器不应对其他服务器生成的错误消息做出响应。
        """
        if packet.get("rcode") == "server-failure":
            # 修复：静默丢弃，不回复
            return None

        return self.resolve(packet)

    def resolve(self, packet):
        return {
            "qr": 1,
            "rcode": "no-error",
            "answer": "1.2.3.4",
        }


def test_fixed_loop(server_a, server_b, trigger_packet):
    """验证修复是否有效"""
    response_a = server_a.handle_packet(trigger_packet)
    if response_a is None:
        print("修复生效！Server A 静默丢弃了错误消息，环路被阻断。")
    else:
        response_b = server_b.handle_packet(response_a)
        if response_b is None:
            print("部分修复！Server B 静默丢弃了错误消息。")
        else:
            print("仍有环路风险。")


fixed_a = FixedDNSServer("Fixed_DNS_A")
fixed_b = FixedDNSServer("Fixed_DNS_B")

test_fixed_loop(fixed_a, fixed_b, trigger)
```

## 六、论文的方法论流程

整个研究过程可以概括为以下步骤：

```
已知服务列表（从历史扫描获取）
        ↓
  发送探测包（包含错误包、畸形包）
        ↓
  收集响应并按语义聚类
        ↓
  学习每台服务器的响应函数
        ↓
  构建环路图（节点=响应簇，边=响应关系）
        ↓
  在图中搜索环（最多长度为 4）
        ↓
  采样验证（通过代理服务器实际测试环路）
```

## 七、防御建议

论文讨论了多种缓解方案：

1. **不要回复错误消息**：这是最有效的修复。RFC 已经规定服务器不应该对其他服务器生成的错误消息做出响应，但很多实现没有遵守。

2. **抑制错误消息**：收到格式错误的包时保持沉默，不回复任何内容。这样可以阻断跨协议环路。

3. **速率限制**：对服务器设置速率限制，当环路中的数据包数量达到上限时停止。但这只能减缓不能完全阻止攻击。

4. **源端口验证**：要求所有请求来自临时客户端端口范围（ephemeral port range），而非服务器端口。

5. **服务质量（QoS）**：对易受攻击的协议（特别是遗留协议）分配较低的 QoS 优先级，在网络拥塞时优先丢弃。

## 八、个人思考

这篇论文最让我惊讶的是，环路问题在 IP 层早就被 TTL 解决了，但人们几乎完全忽略了应用层也存在同样的问题。就像我们修好了桥上的环形匝道，却没注意到桥上的每辆车自己也能绕圈。

另一个有趣的现象是，很多环路根源于**共享的有缺陷的实现**。论文中 DNS 的几个大环路中，大量服务器使用了相同的有 bug 的软件（比如 BIND），这意味着修好一个软件就能消除成千上万的环路对。

最后，跨协议环路（比如 DNS 和 TFTP 互相触发）的存在说明，即使每个协议单独修复，仍然可能因为协议间的交互产生新的环路。这需要更全局的视角来思考网络安全。

## 九、关键数字速查

- 受影响服务器总数：约 **296,000** 台
- 潜在环路对数：超过 **53 亿** 对
- 覆盖自治系统（AS）：**7,318** 个，占全球的 **9.7%**
- 验证成功率最高：NTP（**95.2%**）
- 验证成功率最低：DNS 自环（**16%-25%**，主要因 IP 频繁变更）
- 最大单一环路：NTP 中涉及 **76,000** 台服务器，产生约 **28.8 亿** 对
