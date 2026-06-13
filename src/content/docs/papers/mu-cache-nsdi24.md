---
title: MuCache: A General Framework for Caching in Microservice Graphs
来源: https://www.usenix.org/conference/nsdi24/presentation/zhang-haoran
日期: 2026-06-13
分类: 基础设施
子分类: 微服务
provenance: pipeline-v3
---

# MuCache: 微服务图中的通用缓存框架

## 一、从日常生活说起

想象你在一家大型连锁餐厅工作。这家餐厅有五个环节：

1. **点餐台** — 接收顾客的订单
2. **厨房** — 根据订单做菜
3. **洗碗间** — 清洗餐具
4. **仓库** — 管理食材库存
5. **配送部** — 把做好的菜送到顾客桌上

每个环节都通过内部电话线互相联系。比如厨房做完一道菜，要打电话告诉配送部"菜好了"；配送部要送菜前，得先打电话问厨房"这道菜做好了没？"

**问题来了：** 如果十个顾客同时点了同一道菜，厨房其实只需要做一次菜。但现在的做法是——厨房被打了十次电话，做了十次同样的菜，而配送部也接到了十次"菜好了"的通知。这明显浪费。

**缓存**就是在这个场景里加一个"菜单板"：第一份订单来了，厨房做菜并把结果写在菜单板上；后续九个人点同样的菜，配送部看一眼菜单板就知道"已经做好了"，不用再打电话催厨房。

但餐厅的问题比这复杂——如果厨房换了一批厨师，菜谱改了，菜单板上的旧信息就不准了。所以我们需要一个机制来**保证菜单板上的信息是最新的**。这就是 MuCache 要解决的核心问题。

## 二、背景：微服务架构中的缓存难题

现代大型应用（如 Uber、Twitter）采用**微服务架构**：整个应用被拆成很多小服务，每个服务负责一项功能，它们之间通过网络互相调用，形成一张"服务图"（Service Graph）。

```
用户请求 → API Gateway → 订单服务 → 库存服务
                            ↓
                       支付服务 ← 通知服务
```

在这种架构中，缓存是一个经典优化手段。但传统缓存方案有一个致命缺陷：

- **线性链路上的缓存**（A→B→C）相对简单：如果 B 的结果没变，A 可以直接用缓存
- **图拓扑中的缓存**（A→B, A→C, B→C）就复杂多了：B 和 C 之间有依赖关系，如果 B 的数据变了，不仅 B 的缓存要失效，C 的缓存也可能要跟着失效

更麻烦的是，**不能因为加了缓存就改变程序的行为**。如果原来程序看到某个结果是"错误"的，加了缓存之后也不能变成"正确"的——否则程序就出 bug 了。这在学术上叫**因果一致性保证**。

## 三、核心概念

### 3.1 MuCache 的总体思路

MuCache 不做"在每个服务里手动加缓存"这种笨办法，而是提供一个**通用框架**：你不需要改写业务代码，MuCache 自动在微服务之间插入缓存层，并负责管理缓存的一致性和失效。

关键创新在于它的**非阻塞缓存一致性与失效协议**（Non-blocking Cache Coherence and Invalidation Protocol）。

### 3.2 非阻塞协议

传统缓存失效协议通常是"阻塞"的：当某个服务的数据发生变化时，它需要等待所有相关缓存都失效完成后，才能继续处理新的请求。这就像餐厅里——厨房换了菜谱，必须等所有服务员都拿到新菜谱后，才能继续接单。

MuCache 的非阻塞协议允许服务**在缓存失效的过程中继续处理请求**。这就像服务员拿到新菜谱的速度跟不上，但厨房可以先按新菜谱做菜，只是有些老顾客可能还会收到旧菜单上的菜——不过 MuCache 保证了这种情况不会导致逻辑错误。

### 3.3 因果一致性保证

MuCache 证明了一个重要结论：**任何带有缓存的执行，都可以被看作是没有缓存的原始执行的一个合法观察结果。**

通俗地说：加了缓存之后，程序看到的所有结果，都是"可能发生"的。不会出现"没有缓存时不可能发生"的奇怪结果。这是通过追踪服务之间的**因果关系**来实现的。

### 3.4 关键术语速查表

| 术语 | 日常类比 | 技术含义 |
|------|---------|---------|
| 微服务图（Microservice Graph） | 餐厅各岗位的电话连线图 | 多个微服务之间的调用关系构成的有向图 |
| 缓存一致性（Cache Coherence） | 菜单板上的信息准确无误 | 所有缓存节点看到的数据是一致的 |
| 缓存失效（Invalidation） | 菜谱改了，通知所有人更新菜单板 | 当数据变化时，使旧缓存不可用 |
| 非阻塞（Non-blocking） | 服务员可以边拿新菜谱边继续工作 | 失效过程中不影响新请求的处理 |
| 因果一致性（Causal Consistency） | 不会因为换菜谱而导致点错菜 | 缓存的执行结果等价于某种无缓存的执行 |

## 四、代码示例

### 示例 1：没有缓存的微服务调用

下面是一个典型的微服务调用链，没有任何缓存：

```python
import aiohttp

async def get_user_order(user_id: str) -> dict:
    """获取用户的订单详情 —— 每次都要完整调用所有下游服务"""

    # Step 1: 获取用户基本信息
    async with aiohttp.ClientSession() as session:
        async with session.get(f"http://user-service/api/users/{user_id}") as resp:
            user_info = await resp.json()

    # Step 2: 获取用户的订单列表
    async with session.get(f"http://order-service/api/orders?user_id={user_id}") as resp:
        orders = await resp.json()

    # Step 3: 对每个订单，获取商品详情（可能多次调用）
    enriched_orders = []
    for order in orders:
        async with session.get(
            f"http://product-service/api/products/{order['product_id']}"
        ) as resp:
            product = await resp.json()
        enriched_orders.append({
            "order": order,
            "product": product,
        })

    return {"user": user_info, "orders": enriched_orders}
```

这里每次调用 `get_user_order`，都会经过三次网络请求。如果 100 个用户同时查询同一个订单的商品详情，`product-service` 会被调用 100 次——即使商品数据完全没变。

### 示例 2：使用 MuCache 后的效果

MuCache 的设计目标是**不需要改动业务代码**。但从概念上讲，MuCache 在底层做的事情是这样的：

```python
import aiohttp
from mucache import CacheClient, CacheKey

# MuCache 的缓存客户端（由框架提供，开发者无需实现）
cache = CacheClient()

async def get_user_order_cached(user_id: str) -> dict:
    """获取用户订单详情 —— MuCache 自动管理缓存"""

    # MuCache 会自动拦截对下游服务的调用
    # 并在本地缓存结果，同时维护因果一致性

    # Step 1: 用户信息（MuCache 自动缓存）
    user_cache_key = CacheKey("user-service", "users", user_id)
    user_info = await cache.get_or_fetch(
        key=user_cache_key,
        fetch_fn=lambda: fetch_from_service(
            f"http://user-service/api/users/{user_id}"
        ),
    )

    # Step 2: 订单列表（MuCache 自动缓存）
    order_cache_key = CacheKey("order-service", "orders", user_id)
    orders = await cache.get_or_fetch(
        key=order_cache_key,
        fetch_fn=lambda: fetch_from_service(
            f"http://order-service/api/orders?user_id={user_id}"
        ),
    )

    # Step 3: 商品详情（MuCache 自动缓存 + 自动失效传播）
    enriched_orders = []
    for order in orders:
        product_cache_key = CacheKey(
            "product-service", "products", order["product_id"]
        )
        product = await cache.get_or_fetch(
            key=product_cache_key,
            fetch_fn=lambda: fetch_from_service(
                f"http://product-service/api/products/{order['product_id']}"
            ),
        )
        enriched_orders.append({"order": order, "product": product})

    # 当 product-service 的商品数据更新时，
    # MuCache 的非阻塞协议会自动将相关缓存标记为失效，
    # 而不需要阻塞新的请求处理
    return {"user": user_info, "orders": enriched_orders}


async def fetch_from_service(url: str) -> dict:
    """实际的网络请求（由 MuCache 在缓存未命中时调用）"""
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            return await resp.json()
```

注意：在实际使用中，MuCache 通过**旁路拦截**（sidecar 或库注入）的方式工作，开发者甚至不需要写 `get_or_fetch` 这样的显式调用——MuCache 自动代理所有的服务间通信。上面的代码只是为了让你理解其工作原理。

### 示例 3：理解非阻塞失效

下面用简化伪代码展示 MuCache 的非阻塞失效协议如何工作：

```python
# 简化版 MuCache 失效协议的核心逻辑

class MuCacheNode:
    """每个微服务旁边都有一个 MuCache 节点"""

    def __init__(self, service_id: str):
        self.service_id = service_id
        self.cache = {}              # 本地缓存
        self.version_log = {}        # 版本号日志（用于因果一致性）
        self.pending_invalidations = []  # 待处理的失效通知

    async def handle_request(self, request: Request) -> Response:
        """处理请求 —— 非阻塞：即使有失效通知在进行，也不等待"""

        # 1. 先处理待失效的（后台进行，不阻塞当前请求）
        self._process_pending_invalidations_async()

        # 2. 检查缓存是否有效（基于版本号）
        cache_key = request.make_cache_key()
        cached_version = self.version_log.get(cache_key)
        current_version = self._get_current_version(cache_key)

        if cached_version == current_version:
            # 缓存命中！直接返回，不调用下游服务
            return self.cache[cache_key]

        # 3. 缓存未命中，调用下游服务
        response = await self.call_downstream(request)

        # 4. 写入缓存
        self.cache[cache_key] = response
        self.version_log[cache_key] = current_version

        return response

    async def receive_invalidation(self, invalidated_key: str):
        """收到失效通知 —— 非关键路径，异步处理"""
        # 不阻塞！只记录"这个key需要失效"
        self.pending_invalidations.append(invalidated_key)

    def _process_pending_invalidations_async(self):
        """后台处理积压的失效通知"""
        for key in self.pending_invalidations:
            if key in self.cache:
                del self.cache[key]
            if key in self.version_log:
                del self.version_log[key]
        self.pending_invalidations.clear()
```

核心要点：
- `handle_request` 是**关键路径**，必须在最短时间内完成
- `receive_invalidation` 是**非关键路径**，可以异步处理
- 通过版本号比较来决定缓存是否有效，而不是等待失效通知到达

## 五、性能表现

论文在知名微服务基准测试上进行了评估，主要结果：

- **中位请求延迟降低最多 2.5 倍**：这意味着用户感知的响应速度显著提升
- **吞吐量提升最多 60%**：同样硬件条件下，能处理更多请求
- **因果一致性证明**：形式化证明了缓存引入不会改变程序的可观察行为

## 六、总结

MuCache 解决了一个看似简单但实际棘手的问题：**在复杂的微服务图中，如何安全高效地加入缓存？**

它的答案是：
1. 提供一个通用框架，不需要改写业务代码
2. 设计一种非阻塞的缓存一致性与失效协议，最小化关键路径开销
3. 形式化证明因果一致性：缓存不会引入错误的行为

回到餐厅的比喻：MuCache 就是那个既能保证菜单板信息准确、又不会因为更新菜谱而耽误接单的聪明管理系统。

## 七、延伸思考

- MuCache 适用于哪些场景？读写比例高的场景收益最大（读多写少 = 缓存命中率高）
- 如果服务图非常深（超过 5 层），缓存的效果会怎样？
- 非阻塞协议的代价是什么？（可能的短暂不一致窗口）
