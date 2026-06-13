---
title: 分布式追踪中的常见错误
来源: https://lightstep.com/blog/2026/tracing-mistakes
日期: 2026-06-13
分类: 基础设施
子分类: 可观测性
provenance: pipeline-v3
---

## 是什么

分布式追踪（Distributed Tracing）是一种**跟踪请求在微服务之间完整旅程**的技术。

日常类比：
- **传统单体应用**像去一家店买咖啡——你从进门到取货，全程在一个空间，老板看店里日志就知道每个顾客的经历
- **微服务架构**像跨国快递——包裹从你家出发，经过快递员、分拣中心、航空货运、目的地分拣、最后送达。每个环节都由不同公司负责。如果你问"包裹在哪"，没有追踪系统你就只能打电话问每个环节
- **分布式追踪**就是给这个快递装了 GPS，你能实时看到包裹的每一步：什么时候被取走、在哪个分拣中心停了 2 小时、在哪架飞机上

每个"包裹"有一个唯一的追踪 ID（Trace ID），经过每个服务时都记录一个" Span"（一次操作），所有 Span 按父子关系串起来，就形成了完整的追踪链路。

## 为什么重要

- **微服务故障排查的刚需**：10 个服务组成的链路，出问题时你不可能逐个 SSH 到每台机器上看日志
- **性能瓶颈定位**：追踪能告诉你"订单服务调用库存服务时花了 3 秒"，而不是模糊地说"系统慢"
- **Lightstep 等可观测性平台的核心数据**：追踪数据和日志、指标一起构成"可观测性三支柱"
- **OpenTelemetry 成为统一标准**：2024 年后，OpenTelemetry 基本统一了追踪数据的采集和发送方式

## 常见错误

### 错误一：没有跨服务传递 Trace ID

这是最常见也最致命的问题。追踪系统通过一个唯一的 Trace ID 把所有服务的 Span 关联起来。如果某个服务没有把 Trace ID 传给下一个服务，追踪链就断了。

**类比**：快递从北京寄到上海，北京的快递员把包裹放在快递柜上贴了标签，但上海的分拣中心重新打印了一张新标签——两个标签不关联，你无法看到包裹是从北京来的。

**错误示例**（Go，没有传递 Trace ID）：

```go
// 服务 A：收到请求并创建了 Span
func OrderHandler(w http.ResponseWriter, r *http.Request) {
    ctx, span := tracer.Start(r.Context(), "order.create")
    defer span.End()

    // 错误：直接发起 HTTP 请求，没有把 Trace Context 注入到请求头中
    resp, err := http.Get("http://inventory-service/check")
    // 服务 B 拿到的请求里没有 Trace ID，追踪链在此断裂
}
```

**正确示例**（Go，使用 OpenTelemetry HTTP 传播器）：

```go
// 服务 A：收到请求并创建了 Span
func OrderHandler(w http.ResponseWriter, r *http.Request) {
    ctx, span := tracer.Start(r.Context(), "order.create")
    defer span.End()

    // 正确：把 Trace ID 注入到 HTTP 请求头中
    ctx = propagator.Inject(ctx, propagation.HeaderCarrier(r.Header))
    resp, err := http.DefaultClient.Do(r.WithContext(ctx))
}

// 服务 B：从 HTTP 请求头中提取 Trace Context
func InventoryHandler(w http.ResponseWriter, r *http.Request) {
    // 正确：从请求头中提取 Trace Context
    ctx := propagator.Extract(propagation.HeaderCarrier(r.Header))
    ctx, span := tracer.Start(ctx, "inventory.check")
    defer span.End()
    // 追踪链在此继续
}
```

关键：每个服务在发起出站请求时，必须把当前的 Trace Context（包含 Trace ID、Span ID 和采样信息）通过 HTTP 头（如 `traceparent`）传递出去；接收方必须从请求头中提取 Context 并继续追踪。

### 错误二：Span 粒度不当

Span 是追踪的基本单位。粒度太粗，看不出瓶颈在哪；粒度太细，数据量爆炸，追踪系统扛不住。

**类比**：
- 太粗：只记录"取快递"这一个 Span，但你不知道是快递柜问题、快递员问题还是配送站问题
- 太细：记录"打开包装箱"、"触摸快递单"、"看一眼收件人名字"——每个动作一个 Span，追踪图密密麻麻看不清楚

**错误示例**（每个 Span 包含太多逻辑）：

```go
func OrderHandler(w http.ResponseWriter, r *http.Request) {
    ctx, span := tracer.Start(r.Context(), "handle-order")
    defer span.End()

    // 错误：整个函数塞进一个 Span，无法定位具体哪步慢了
    // 这一步可能花 50ms
    order := parseOrder(r)
    // 这一步可能花 3000ms（远程调用库存服务）
    stock := checkInventory(ctx, order)
    // 这一步可能花 2000ms（远程调用支付服务）
    payment := processPayment(ctx, order, stock)
    // 这一步可能花 500ms（写数据库）
    saveOrder(ctx, order, payment)

    span.SetAttribute("total_time", 6000)
    w.Write([]byte("order created"))
}
```

**正确示例**（按逻辑拆分成独立 Span）：

```go
func OrderHandler(w http.ResponseWriter, r *http.Request) {
    ctx, span := tracer.Start(r.Context(), "order.create")
    defer span.End()

    // 每个关键步骤一个独立 Span
    ctx, parseSpan := tracer.Start(ctx, "order.parse")
    order := parseOrder(r)
    parseSpan.End()

    ctx, checkSpan := tracer.Start(ctx, "inventory.check")
    stock := checkInventory(ctx, order)
    checkSpan.End()

    ctx, paySpan := tracer.Start(ctx, "payment.process")
    payment := processPayment(ctx, order, stock)
    paySpan.End()

    ctx, saveSpan := tracer.Start(ctx, "order.save")
    saveOrder(ctx, order, payment)
    saveSpan.End()

    w.Write([]byte("order created"))
}
```

经验法则：
- **每个远程调用**（HTTP/gRPC/数据库查询）都应该是一个 Span
- **关键业务步骤**（支付、发货）应该是 Span
- **纯 CPU 计算**如果超过 100ms 才值得记录

### 错误三：错误和异常没有记录到 Span

当服务出错了，追踪系统中必须有对应的错误信息。如果 Span 里没标记错误，你在追踪面板上就看不到这条链路有问题。

**类比**：快递送达了但包裹坏了。如果快递员不在系统里标记"损坏"，客服就永远发现不了这个问题。

**错误示例**（异常被吞掉，没有记录到 Span）：

```go
func PaymentHandler(w http.ResponseWriter, r *http.Request) {
    ctx, span := tracer.Start(r.Context(), "payment.charge")

    // 错误：调用第三方支付网关出错了，但没有记录到 Span
    // Span 显示"成功"，但实际失败了
    err := paymentGateway.Charge(ctx, amount)
    if err != nil {
        log.Printf("payment failed: %v", err)
        w.WriteHeader(http.StatusInternalServerError)
        return
    }

    span.End()
}
```

**正确示例**（异常记录到 Span）：

```go
func PaymentHandler(w http.ResponseWriter, r *http.Request) {
    ctx, span := tracer.Start(r.Context(), "payment.charge")
    defer span.End()

    err := paymentGateway.Charge(ctx, amount)
    if err != nil {
        // 正确：记录错误到 Span，追踪面板会标记红色
        span.RecordError(err)
        span.SetStatus(codes.Error, "payment failed")
        span.End()
        log.Printf("payment failed: %v", err)
        w.WriteHeader(http.StatusInternalServerError)
        return
    }

    span.SetStatus(codes.Ok, "")
}
```

### 错误四：给追踪系统塞太多数据

Span 越多，存储和查询成本越高。很多团队一开始把所有东西都记成 Span，结果追踪面板卡到没法用。

**类比**：如果快递每个动作都拍照上传——拆箱子拍一张、看商品拍一张、检查生产日期拍一张、放回去拍一张——照片太多，客服系统直接卡死。

**采样（Sampling）策略**：
- **AlwaysOn**：所有请求都追踪（开发环境用）
- **AlwaysOff**：完全不追踪（测试用）
- **TraceIDRatioBased**：按固定比例抽样（如 10%），这是生产环境的推荐策略
- **自适应采样**：优先追踪慢请求和错误请求

```go
// 生产环境：只追踪 10% 的请求，但错误请求全部追踪
processor := trace.WithSampler(
    traceparent.CompositeSampler(
        traceparent.AlwaysOnSampler(),              // 开发环境用
        traceparent.TraceIDRatioBased(0.1),         // 生产环境：10%
    ),
)

// 更好的做法：对慢请求和错误请求提高采样率
sampler := func(ctx context.Context, traceID trace.TraceID, spanName string, parentSpanID trace.SpanID, attributes []trace.Attribute) bool {
    // 错误和慢请求全采
    if parentSpanID != nil {
        return true
    }
    // 新追踪：10% 概率
    return rand.Float64() < 0.1
}
```

### 错误五：Span 没有设置有意义的属性

Span 只是按时间顺序记录"开始"和"结束"，这信息量太少了。属性（Attributes）才是让追踪有用的关键。

**类比**：快递只记录"包裹已发出"和"包裹已到达"，但不记录收件人地址、包裹重量、快递公司——你没法分析数据。

**关键属性**：
- `http.method` / `http.url`：HTTP 请求信息
- `db.system` / `db.statement`：数据库操作
- `error.type` / `error.message`：错误详情
- `service.name`：当前服务名
- 业务属性如 `order.id` / `user.id`

```go
span.SetAttributes(
    attribute.String("http.method", r.Method),
    attribute.String("http.url", r.URL.String()),
    attribute.Int("http.status_code", statusCode),
    attribute.String("db.statement", query),
    attribute.String("user.id", userID),
    attribute.String("order.id", orderID),
)
```

### 错误六：追踪异步操作

消息队列（Kafka、RabbitMQ）是异步的。如果消息的生产者和消费者之间没有传递 Trace Context，异步链路就断了。

**类比**：你给快递员留了便条说"把包裹放门口"，但快递员把便条扔了直接走人。你第二天发现包裹不见了，不知道是谁的问题。

```go
// 生产者：把 Trace Context 注入到消息头中
func PublishOrder(order Order) {
    ctx, span := tracer.Start(context.Background(), "order.publish")
    defer span.End()

    // 注入 Trace Context 到消息属性
    headers := amqp.Table{
        "traceparent": span.SpanContext().TraceParentString(),
    }

    // 发送到消息队列
    channel.Publish("orders", "", false, false, amqp.Publishing{
        Headers: headers,
        Body:    marshal(order),
    })
}

// 消费者：从消息头中恢复 Trace Context
func ConsumeOrder(msg amqp.Delivery) {
    traceparent := msg.Headers["traceparent"].(string)

    // 从消息头中恢复 Context
    ctx := propagator.Extract(propagation.HeaderCarrier(
        amqp.Table{"traceparent": traceparent},
    ))

    ctx, span := tracer.Start(ctx, "order.consume")
    defer span.End()

    order := unmarshal(msg.Body)
    processOrder(ctx, order)
}
```

## 总结

| 错误 | 后果 | 一句话修复 |
|------|------|-----------|
| 不传递 Trace ID | 追踪链断裂 | 用 propagator 注入/提取 HTTP 头 |
| Span 粒度不当 | 要么看不清瓶颈，要么数据爆炸 | 每个远程调用拆成一个 Span |
| 不记录错误 | 追踪面板看不出故障 | `span.RecordError(err)` + `span.SetStatus` |
| 不采样 | 存储成本失控 | 生产环境用 TraceIDRatioBased(0.1) |
| 不设属性 | 追踪数据不可查询 | 至少设 http.method, db.system, error |
| 不传异步 Context | 异步链路断裂 | 消息头里注入 traceparent |

分布式追踪的核心理念：**追踪应该像快递 GPS 一样，从起点到终点全程不断**。每个错误都是 GPS 信号丢失的一段路，修好它们，你就能在任何微服务故障面前从容不迫。
