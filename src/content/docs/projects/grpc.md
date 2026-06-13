---
title: gRPC 零基础入门笔记
来源: https://github.com/grpc/grpc
日期: 2026-06-13
分类: 后端 API
子分类: backend-and-api
provenance: pipeline-v3
---

# gRPC 零基础入门笔记

## 一、什么是 gRPC？—— 从外卖点餐说起

想象你去一家餐厅点餐：你（客户端）把菜单上的菜名告诉服务员（网络），服务员跑到厨房（服务端），厨师做好饭后把菜端出来给你。

在传统做法中，每次点餐你要手写一张纸条（比如 HTTP + JSON），写明"我要一份宫保鸡丁"，厨房收到后还要自己解析这张纸条。纸条写得不好，厨房可能看不懂。

gRPC 的做法是：餐厅提前规定好一套标准菜单格式（`.proto` 文件），你和服务端都按同一套格式来交流。你不需要自己拼接消息，gRPC 框架自动帮你打包、发送、接收、解析。

**gRPC 是什么？**

- gRPC 是 Google 开源的一套高性能远程调用框架
- 默认使用 Protocol Buffers（protobuf）作为接口定义语言（IDL）和数据序列化格式
- 核心理念：客户端可以直接像调用本地函数一样调用远程服务器上的方法

## 二、核心概念

### 1. Protocol Buffers（protobuf）

protobuf 是一种高效的数据序列化方案。你可以把它理解成一种"结构化数据的通用语言"。

先在 `.proto` 文件中定义数据结构和接口：

```proto
syntax = "proto3";

package helloworld;

// 定义一个服务
service Greeter {
  // 定义一个远程方法：SayHello
  rpc SayHello (HelloRequest) returns (HelloReply) {}
}

// 请求消息的结构
message HelloRequest {
  string name = 1;
}

// 响应消息的结构
message HelloReply {
  string message = 1;
}
```

然后用 `protoc` 编译器自动生成各语言的代码。生成的代码包含：
- 数据填充和序列化的方法
- 客户端 Stub（存根）代码
- 服务端接口实现代码

### 2. 四种 RPC 方法类型

gRPC 定义了四种调用方式：

| 类型 | 比喻 | 说明 |
|------|------|------|
| Unary RPC | 普通对话 | 一次请求，一次响应（最常见） |
| Server Streaming | 广播通知 | 一次请求，服务端持续推送多条消息 |
| Client Streaming | 往信箱投信 | 客户端持续发消息，服务端最后统一回复 |
| Bidirectional Streaming | 电话通话 | 双方可以同时互相发消息 |

### 3. Channel（通道）

Channel 是客户端到服务端的连接通道，创建 Stub 时需要指定。你可以把它理解成一条专用的"电话线"。

### 4. Deadline（超时）

gRPC 允许客户端设置等待时限。超过时限还没收到响应，就报错 `DEADLINE_EXCEEDED`。

## 三、代码示例（Go 语言）

### 示例一：最简单的 Unary RPC

**服务端实现：**

```go
package main

import (
    "context"
    "fmt"
    "log"
    "net"

    pb "your-project/helloworld"
    "google.golang.org/grpc"
)

// server 实现 Greeter 接口
type server struct {
    pb.UnimplementedGreeterServer
}

// SayHello 是实现的服务方法
func (s *server) SayHello(ctx context.Context, in *pb.HelloRequest) (*pb.HelloReply, error) {
    msg := fmt.Sprintf("Hello %s!", in.GetName())
    return &pb.HelloReply{Message: msg}, nil
}

func main() {
    // 监听 50051 端口
    lis, err := net.Listen("tcp", ":50051")
    if err != nil {
        log.Fatalf("failed to listen: %v", err)
    }

    // 创建 gRPC 服务器并注册服务
    s := grpc.NewServer()
    pb.RegisterGreeterServer(s, &server{})

    fmt.Println("Server listening on :50051")
    if err := s.Serve(lis); err != nil {
        log.Fatalf("failed to serve: %v", err)
    }
}
```

**客户端调用：**

```go
package main

import (
    "context"
    "log"
    "time"

    pb "your-project/helloworld"
    "google.golang.org/grpc"
)

func main() {
    // 建立连接到服务端
    conn, err := grpc.Dial("localhost:50051", grpc.WithInsecure())
    if err != nil {
        log.Fatalf("did not connect: %v", err)
    }
    defer conn.Close()

    // 创建客户端 Stub
    client := pb.NewGreeterClient(conn)

    // 调用远程方法（就像调本地函数一样）
    ctx, cancel := context.WithTimeout(context.Background(), time.Second)
    defer cancel()

    reply, err := client.SayHello(ctx, &pb.HelloRequest{Name: "World"})
    if err != nil {
        log.Fatalf("could not call: %v", err)
    }

    log.Printf("Received: %s", reply.GetMessage())
    // 输出: Received: Hello World!
}
```

### 示例二：Server Streaming RPC（流式响应）

场景：客户端查询一批数据，服务端逐条返回。

**proto 定义：**

```proto
service WeatherService {
    // 普通查询
    rpc GetWeather (LocationRequest) returns (WeatherResponse) {}

    // 流式查询：返回多个城市的天气
    rpc GetManyWeathers (CityList) returns (stream WeatherResponse) {}
}

message LocationRequest {
    string city = 1;
}

message CityList {
    repeated string cities = 1;  // 城市列表
}

message WeatherResponse {
    string city = 1;
    float temperature = 2;
    string condition = 3;
}
```

**服务端实现：**

```go
func (s *weatherServer) GetManyWeathers(req *pb.CityList, stream pb.WeatherService_GetManyWeathersServer) error {
    // 遍历每个城市，逐条发送天气数据
    for _, city := range req.Cities {
        temp := 25.0 // 实际应从数据库查询
        resp := &pb.WeatherResponse{
            City:       city,
            Temperature: temp,
            Condition:   "Sunny",
        }
        // Send 把一条消息推送到客户端
        if err := stream.Send(resp); err != nil {
            return err
        }
    }
    return nil
}
```

**客户端接收流：**

```go
// 发起流式调用
stream, err := client.GetManyWeathers(ctx, &pb.CityList{
    Cities: []string{"Beijing", "Shanghai", "Guangzhou"},
})
if err != nil {
    log.Fatal(err)
}

// 循环接收服务端推送的每一条消息
for {
    resp, err := stream.Recv()
    if err == io.EOF {
        break // 服务端发送完毕
    }
    if err != nil {
        log.Fatal(err)
    }
    log.Printf("%s: %.1f°C, %s", resp.City, resp.Temperature, resp.Condition)
}
// 输出:
// Beijing: 25.0°C, Sunny
// Shanghai: 25.0°C, Sunny
// Guangzhou: 25.0°C, Sunny
```

## 四、gRPC 的优势与适用场景

**优势：**
1. 高性能：基于 HTTP/2 和二进制协议（protobuf），比 REST/JSON 更小更快
2. 强类型：proto 文件即文档，编译期就能检查错误
3. 代码生成：不用手写网络层代码，减少样板代码
4. 多语言：支持 Go、Java、Python、C++、Node.js 等 10+ 种语言互操作

**适用场景：**
- 微服务之间的内部通信
- 对性能要求高的分布式系统
- 移动端与后端的通信（二进制协议节省流量）
- 实时流式数据传输

**不太适合的场景：**
- 浏览器直接调用（HTTP/1.1 时代不支持，需 gRPC-Web 中转）
- 面向公众的开放 API（REST/GraphQL 生态更成熟）

## 五、关键术语速查

| 术语 | 含义 |
|------|------|
| Stub | 客户端本地的代理对象，负责把方法调用转成网络请求 |
| Service | 在 `.proto` 中定义的远程接口 |
| Message | 在 `.proto` 中定义的数据结构 |
| Channel | 客户端到服务端的连接 |
| Unary | 一次请求一次响应 |
| Streaming | 数据流式传输 |
| Deadline | 调用超时限制 |
