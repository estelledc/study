---
title: PostHog OSS Product Analytics — 从零到一的理解
来源: https://github.com/PostHog/posthog
日期: 2026-06-13
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

## 一句话概括

PostHog 是一个**全栈、开源的产品分析平台**——它把用户行为追踪、漏斗分析、留存分析、会话回放、功能开关、A/B 测试等一整套产品工具箱，打包成一个你可以自己部署的开源项目。

## 日常类比

想象你开了一家咖啡馆。你想了解：

- 哪些客人是新客、哪些是回头客？（**用户识别**）
- 客人点了哪些饮品？在哪个环节放弃购买？（**事件与漏斗**）
- 哪个促销按钮能让更多人下单？（**A/B 测试**）

PostHog 就是这家咖啡馆的"智能监控摄像头 + 记账本 + 实验记录本"。它在你的网站或 App 里装一个"小插件"，自动记录客人的一举一动，然后把数据存到你自己的服务器上。

## 核心概念

### 1. 事件（Event）

PostHog 的一切以**事件**为中心。每一次用户操作——点击、页面浏览、表单提交——都是一条事件记录。

每条事件包含三个要素：

| 要素 | 说明 | 举例 |
|------|------|------|
| `event` | 事件名称 | `"user signed up"` |
| `distinct_id` | 唯一用户标识 | `"user_12345"` |
| `properties` | 额外属性 | `{ `"login_type"`: `"email"` }` |

### 2. 自动捕获（Autocapture）

PostHog 最省力的一点：**不需要手动埋点**。安装 SDK 后，它会自动捕获页面浏览、点击、表单输入等行为。你只需要为业务逻辑补充自定义事件。

### 3. 用户识别（Identify）

PostHog 默认用浏览器的 cookie 生成一个匿名 ID。当用户登录时，你需要调用 `identify()` 把匿名 ID 和真实用户信息绑定。这样同一个客人在匿名阶段和登录阶段的行为就能拼在一起。

### 4. 属性（Properties）

事件的额外信息，可以是用户属性（`user_properties`）或事件属性（`event_properties`）。比如"用户注册"这个事件，可以带上 `login_type`、`is_free_trial` 等属性。

### 5. 仪表板组件

PostHog 内置了多种分析图表：

- **趋势图（Trends）** — 随时间变化的指标曲线
- **漏斗（Funnels）** — 用户在哪一步流失
- **留存（Retention）** — 用户是否会回来
- **用户路径（User Paths）** — 用户的典型行为路线
- **会话回放（Session Replay）** — 真实用户操作的录像

## 代码示例

### 示例一：在网页中安装 PostHog 并捕获自定义事件

把这段代码放在你的 HTML `<head>` 中：

```html
<script>
  !function(t,e){
    var o,n,p,r;e.__SV||(
      window.posthog=e,
      e._i=[],
      e.init=function(i,s,a){
        function g(t,e){
          var o=e.split(".");
          2==o.length&&(t=t[o[0]],e=o[1]),
          t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}
        }
        (p=t.createElement("script")).type="text/javascript",
        p.crossOrigin="anonymous",
        p.async=!0,
        p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+
          "/static/array.js",
        (r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);
        var u=e;
        for(
          void 0!==a?u=e[a]=[]:a="posthog",
          u.people=u.people||[],
          u.toString=function(t){
            var e="posthog";
            return "posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e
          },
          u.people.toString=function(){
            return u.toString(1)+".people (stub)"
          },
          o="init capture register register_once register_for_session "+
            "unregister unregister_for_session getFeatureFlag "+
            "getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags "+
            "updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures "+
            "on onFeatureFlags onSessionId getSurveys renderSurvey "+
            "canRenderSurvey getNextSurveyStep identify "+
            "setPersonProperties group resetGroups "+
            "setPersonPropertiesForFlags resetPersonPropertiesForFlags "+
            "setGroupPropertiesForFlags resetGroupPropertiesForFlags "+
            "reset get_distinct_id getGroups get_session_id "+
            "get_session_replay_url alias set_config "+
            "startSessionRecording stopSessionRecording "+
            "sessionRecordingStarted captureException loadToolbar "+
            "get_property getSessionProperty createPersonProfile "+
            "opt_in_capturing opt_out_capturing "+
            "has_opted_in_capturing has_opted_out_capturing "+
            "clear_opt_in_out_capturing debug".split(" "),
          n=0;n<o.length;n++)g(u,o[n]);
        e._i.push([i,s,a])
      },
      e.__SV=1
    )
  }(document,window.posthog||[]);

  // 初始化 PostHog，替换你的项目 Token
  posthog.init('YOUR_PROJECT_TOKEN', {
    api_host: 'https://us.i.posthog.com',
    defaults: '2026-01-30'
  });
</script>
```

当用户完成注册时，发送一条自定义事件：

```javascript
posthog.capture('user_signed_up', {
  login_type: 'email',
  is_free_trial: true,
  plan: 'starter'
});
```

### 示例二：在 Node.js 后端通过 API 发送事件

如果你想在服务器端捕获事件（比如用户完成支付），可以使用 Node.js SDK：

```javascript
const { PostHog } = require('posthog-node');

// 初始化客户端
const client = new PostHog('YOUR_PROJECT_TOKEN', {
  host: 'https://us.i.posthog.com'
});

// 捕获用户注册事件
client.capture({
  distinctId: 'user_12345',
  event: 'user signed up',
  properties: {
    login_type: 'google_oauth',
    is_free_trial: false,
    plan: 'pro'
  }
});

// 捕获页面浏览事件（后端-only 模式）
client.capture({
  distinctId: 'user_12345',
  event: '$pageview',
  properties: {
    $current_url: 'https://example.com/dashboard',
    $referrer: 'https://google.com'
  }
});

// 程序退出前刷新数据
process.on('SIGINT', () => client.shutdown());
```

### 示例三：识别用户身份

前端在用户登录后调用 `identify()`：

```javascript
// 匿名访客浏览时，PostHog 自动生成一个随机 ID
// 用户登录后，把这个随机 ID 和真实用户 ID 绑定

posthog.identify('user_12345', {
  email: 'jason@example.com',
  name: 'Jason',
  plan: 'pro'
});
```

这样，之前匿名的所有行为都会归到这个用户身上。

## 架构速览

```
浏览器 / App 中的 SDK
        │
        ▼
   PostHog 收集器 (Capture API)
        │
        ▼
   Kafka → ClickHouse（数据存储与查询）
        │
        ▼
   Web 仪表板（图表、漏斗、留存、回放）
```

PostHog 后端用 Python 编写，数据存储在 ClickHouse（列式数据库），消息队列用 Kafka。整个项目放在 GitHub 上，可以用 Docker 一键部署到自己服务器上。

## 和其他工具的对比

| 工具 | 定位 | 开源？ | 特点 |
|------|------|--------|------|
| **PostHog** | 全栈产品分析 | 是 | 功能最全，自建数据 |
| **Google Analytics** | 流量分析 | 免费闭源 | 免费但数据不归你 |
| **Mixpanel** | 事件分析 | 闭源 | 产品体验好，数据在对方那里 |
| **Amplitude** | 产品分析 | 闭源 | 功能深入，数据在对方那里 |

PostHog 的核心优势：**数据在自己手里**，符合隐私合规要求，而且免费开源。

## 快速上手步骤

1. 注册 PostHog Cloud（免费 100 万条事件/月）或自建部署
2. 获取 Project Token
3. 在网页中粘贴安装代码
4. 等待用户产生行为
5. 在仪表板中查看趋势、漏斗、留存

## 进一步学习方向

- [产品分析概览](https://posthog.com/docs/product-analytics) — 官方完整文档
- [事件捕获指南](https://posthog.com/docs/product-analytics/capture-events) — 如何追踪事件
- [JS SDK 安装](https://posthog.com/docs/libraries/js) — 前端集成详情
- [识别用户](https://posthog.com/docs/product-analytics/identify-users) — 匿名到已知的转换

## 一句话总结

PostHog 把原来需要 Google Analytics + Mixpanel + FullStory + LaunchDarkly 四个工具才能做的事，全部塞进了一个开源项目里。你只需要装一个 SDK，剩下的分析和实验功能开箱即用。
