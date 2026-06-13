---
title: Unkey API Key Management
来源: https://github.com/unkeyed/unkey
date: 2026-06-13
分类: 后端 API
子分类: Web 后端
provenance: pipeline-v3

---

# Unkey API Key Management

## 日常类比：小区门禁卡系统

想象你住在一个高档小区，每户人家都有一张门禁卡。这张卡有几个关键属性：

- **唯一性**：每张卡有独一无二的编号，保安不可能搞混
- **可挂失**：卡丢了可以立刻作废，捡到的人刷不开门
- **有时效**：访客卡只有三天有效期，过了就失效
- **有额度**：有些卡限制每月只能进 100 次
- **有权限**：业主卡能进所有区域，保洁卡只能进公共区域

Unkey 做的事情就是——把你的 API 变成一个这样的智能小区，而 API key 就是那张门禁卡。它帮你管理卡的发放、验证、过期、撤销，全部自动化。

## 为什么需要专门管理 API Key？

没有 Unkey 的时候，开发者通常自己处理这些逻辑：

- 把 key 存在数据库里，每次请求拿用户的 key 和数据库比对
- 自己实现过期时间检查
- 自己实现限流逻辑
- key 泄露了要手动去数据库删掉

这些看起来简单，但真正上线后会有很多坑：并发验证的性能、key 的安全存储（不能明文存）、大规模下的查询速度。Unkey 把这些全部打包成一个托管服务。

## 核心概念

### API（API ID）

一个 API 代表你的一个服务项目。比如你有"用户服务"和"支付服务"两个 API，每个都有自己的 `api_id`。keys 属于某个 API，不同 API 的 key 互不干扰。

### Keyspace

Keyspace 是一个 API 下的 key 容器。你可以为生产环境和测试环境创建不同的 keyspace，方便隔离管理。

### Root Key

Root Key 是你的"管理员密钥"，用来调用 Unkey 的 API 来创建、删除、管理其他 key。这个 key 要像密码一样保密，绝不能放到前端代码里。

### Sentinel（哨兵）

Sentinel 是 Unkey 的网关层，位于你的 API 前面。所有请求先到 Sentinel，它会验证 key、检查限流、过滤 IP，只有通过的所有请求才会到达你的实际代码。这意味着你不需要在自己代码里写验证逻辑。

### Verification（验证）

验证是核心动作。每次请求来的时候，你把收到的 key 发给 Unkey，它返回这个 key 是否有效、属于谁、还剩多少额度、有没有过期。整个过程是毫秒级的。

## 安全设计

Unkey 不会以明文形式存储任何 API key。所有 key 在存入数据库之前都会经过 SHA-256 哈希处理。这意味着即使 Unkey 的数据库被攻破，攻击者也只能看到一堆哈希值，无法还原出原始的 key。

验证时，Unkey 会对传入的 key 也做一次哈希，然后跟数据库里的哈希值比对。这跟操作系统存储密码密码的方式完全一样。

## 代码示例

### 示例一：创建和验证一个 API Key

这是最基础的使用流程——先创建一个 key 给用户，然后在每次请求中验证它。

```typescript
import { Unkey } from "@unkey/api";

// 初始化客户端，使用你的 root key 认证
const unkey = new Unkey({ rootKey: process.env.UNKEY_ROOT_KEY });

// 步骤 1：为用户创建一个 API key
// 这通常在用户注册或申请 API 访问时调用
async function createUserKey(userId: string) {
  const { meta, data } = await unkey.keys.createKey({
    apiId: "api_myproject",       // 所属的 API
    name: `user-${userId}`,        // 可读名称，方便识别
    meta: { userId },              // 自定义元数据
    expires: Date.now() + 86400000, // 24 小时后过期
    ratelimit: {
      limit: 100,                  // 最多 100 次请求
      duration: 60_000,            // 在 60 秒窗口内
    },
  });

  // data.key 是生成的完整 key 字符串（如 sk_xxx...）
  // 这个值只会显示一次！必须保存给用户
  console.log("新 key:", data.key);
  return data.key;
}

// 步骤 2：在 API 请求中验证 key
async function handleApiRequest(req: Request) {
  // 从 Authorization 头提取 key
  const authHeader = req.headers.get("Authorization") || "";
  const key = authHeader.replace("Bearer ", "");

  if (!key) {
    return new Response("缺少 API key", { status: 401 });
  }

  // 向 Unkey 发起验证
  const { meta, data } = await unkey.keys.verifyKey({ key });

  if (!data.valid) {
    // key 无效的可能原因：
    // - NOT_FOUND: key 不存在
    // - EXPIRED: key 已过期
    // - RATE_LIMITED: 超出限流
    // - DISABLED: key 已被禁用
    return new Response(`验证失败: ${data.code}`, { status: 401 });
  }

  // key 有效，继续处理业务逻辑
  // data.keyId 是 key 的内部 ID
  // data.meta 是你创建时设置的元数据
  return new Response(`你好，用户 ${data.meta?.userId}`);
}
```

### 示例二：带用量配额和自动续费的 API Key

这个示例展示更高级的功能：给不同付费等级的用户设置不同的用量配额，并且每月自动恢复额度。

```typescript
// 为不同等级的用户创建带有用量限制的 key
async function createTieredKey(userId: string, tier: "free" | "pro" | "enterprise") {
  const plans = {
    free:      { credits: 1000,  refill: { interval: "monthly" as const, amount: 1000 } },
    pro:       { credits: 50000, refill: { interval: "monthly" as const, amount: 50000 } },
    enterprise: { credits: 1000000, refill: { interval: "monthly" as const, amount: 1000000 } },
  };

  const { meta, data } = await unkey.keys.createKey({
    apiId: "api_myproject",
    name: `${tier}-${userId}`,
    meta: { userId, tier },
    credits: plans[tier],   // 设置用量配额和自动续费
    permissions: [           // 权限控制
      "read:data",
      tier !== "free" ? "write:data" : null,
      tier === "enterprise" ? "admin:all" : null,
    ].filter(Boolean) as string[],
  });

  console.log(`${tier} 用户 ${userId} 的 key:`, data.key);
  console.log(`额度: ${plans[tier].credits}, 每月自动恢复`);
  return data.key;
}

// 在请求中检查用量
async function handleRequestWithQuota(req: Request) {
  const key = req.headers.get("Authorization")?.replace("Bearer ", "");
  const { data } = await unkey.keys.verifyKey({ key });

  if (!data.valid) {
    return new Response("未授权", { status: 401 });
  }

  // 如果设置了用量配额，data.credits 显示剩余次数
  if (data.credits !== undefined) {
    console.log(`剩余配额: ${data.credits}`);
    // 配额用完时，verifyKey 会返回 code: "NO_CREDITS"
  }

  // 处理正常请求...
  return new Response("请求成功");
}
```

### 示例三：通过 Sentinel 网关透明验证

如果你使用 Unkey 的部署功能，Sentinel 会自动在代码外面做验证，你的应用代码完全不需要调用 Unkey SDK。

```typescript
// 你的 API 代码完全不需要关心认证
// Sentinel 已经在前端验证了 key，只有合法的请求会到达这里

export async function handler(req: Request) {
  // 此时请求已经通过 Unkey Sentinel 验证
  // 验证结果以 HTTP 头的形式附加在请求上

  // 从 header 获取已验证的用户身份信息
  const userId = req.headers.get("x-unkey-identity");
  const keyId = req.headers.get("x-unkey-key-id");

  // 直接处理业务逻辑，不需要任何验证代码
  return new Response(`已验证用户: ${userId}, key: ${keyId}`);
}
```

## 验证响应字段速查

调用 `verifyKey` 后，返回的 `data` 对象包含以下字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `valid` | boolean | key 是否通过所有检查 |
| `code` | string | 状态码（VALID / NOT_FOUND / EXPIRED / RATE_LIMITED 等） |
| `keyId` | string | key 的唯一内部 ID |
| `name` | string | key 的名称 |
| `meta` | object | 创建时设置的自定义元数据 |
| `expires` | number | 过期时间戳（毫秒），如果设置了过期时间 |
| `credits` | number | 剩余可用次数，如果设置了用量配额 |
| `enabled` | boolean | key 是否处于启用状态 |
| `roles` | string[] | 关联的角色 |
| `permissions` | string[] | 授予的权限列表 |
| `ratelimits` | object[] | 限流状态，如果配置了限流 |

## 总结

Unkey 把 API key 的管理从"自己写一堆 if-else"变成了一个完整的平台服务。它的核心价值在于：

1. **安全**：key 永远不存明文，SHA-256 哈希保障即使数据库泄露也没事
2. **省心**：不用自己搭 Redis 做限流，不用自己写 key 的创建、过期、撤销逻辑
3. **灵活**：支持按 key 设限流、按 key 设用量配额、自动恢复、权限分级、过期时间
4. **透明**：通过 Sentinel 网关，验证逻辑完全前置，你的业务代码零负担

对于刚接触 API 安全的人来说，理解 Unkey 的最好方式就是记住那个小区门禁卡的类比——它本质上就是一个智能门禁系统，只不过门后面保护的不是房间，而是你的 API 接口。
