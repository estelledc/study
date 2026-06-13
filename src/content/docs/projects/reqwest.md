---
title: reqwest — Rust HTTP 客户端
来源: https://github.com/seanmonstar/reqwest
日期: 2026-06-13
分类: 其他
子分类: rust-tools
provenance: pipeline-v3
---

# reqwest — Rust HTTP 客户端

## 一、什么是 reqwest？

想象一下，你要给远方的朋友寄一封信。你需要写地址、贴邮票、把信交给邮局，然后等着回信。

在 Rust 程序里，"给别的网站发消息"就是发 HTTP 请求。reqwest 就是 Rust 世界里最常用的"邮局"——它帮你打包请求、发出去、收回来，还顺便把信封上的格式问题都处理好了。

它是 Rust 生态中最流行的 HTTP 客户端库，GitHub 上有 11,700 多个星标，被大量生产项目使用。

## 二、核心概念

### 1. Client（客户端）

Client 就像一个快递柜。你创建一个 Client，就可以反复用它来发请求。它会复用连接（叫 keep-alive），比每次新建连接更快。

### 2. RequestBuilder（请求构建器）

这是 reqwest 最优雅的设计。它用"链式调用"让你一步步组装请求：

```
GET("url")         → 设置网址和方式
   .header(...)    → 加请求头
   .json(...)      → 加 JSON 数据
   .send()         → 发送
   .await          → 等待结果
```

每一步都返回一个新的 RequestBuilder，像搭积木一样，最后一步 `.send()` 才真正发出去。

### 3. Response（响应）

收到回信后，你会看到信封上的状态（200 成功、404 找不到等），以及信的内容（body）。reqwest 帮你把这两部分分别封装好了。

### 4. 异步 vs 阻塞

reqwest 有两种模式：
- **异步（async）**：默认模式，配合 Tokio 运行时使用，适合服务器程序
- **阻塞（blocking）**：像传统写法一样"等结果出来再继续"，适合脚本或简单程序

## 三、安装

在 `Cargo.toml` 中添加：

```toml
[dependencies]
reqwest = { version = "0.13", features = ["json"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
```

`features = ["json"]` 表示开启 JSON 序列化/反序列化支持，这是最常用的功能之一。

## 四、代码示例

### 示例 1：最简单的 GET 请求

```rust
use std::collections::HashMap;
use serde::Deserialize;

#[derive(Deserialize, Debug)]
struct IpInfo {
    origin: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 直接用一个简单函数发 GET 请求
    let resp = reqwest::get("https://httpbin.org/ip")
        .await?                              // 发出请求，等待响应
        .error_for_status()?                 // 如果是 4xx/5xx，转为错误
        .json::<IpInfo>()                    // 把 JSON body 自动解析成结构体
        .await?;                             // 等待解析完成

    println!("你的 IP 是: {}", resp.origin);
    Ok(())
}
```

**逐行解释：**
1. `reqwest::get("url")` — 发 GET 请求
2. `.await?` — 异步等待服务器回复，`?` 表示出错就提前返回
3. `.error_for_status()?` — 如果状态码是 400 或 500 开头，转为错误（不检查的话，即使是 404 也不会报错）
4. `.json::<IpInfo>().await?` — 把返回的 JSON 自动反序列化成 `IpInfo` 结构体

### 示例 2：POST 请求 + 自定义 Client + 表单

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug)]
struct CreateUser {
    username: String,
    email: String,
}

#[derive(Deserialize, Debug)]
struct UserResponse {
    id: u64,
    username: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 创建一个可复用的 Client
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))  // 30 秒超时
        .build()?;

    // 准备要发送的数据
    let user = CreateUser {
        username: "testuser".to_string(),
        email: "test@example.com".to_string(),
    };

    // 链式调用：发 POST 请求，body 是 JSON
    let response = client.post("https://httpbin.org/post")
        .json(&user)                        // 自动序列化 JSON 并设置 Content-Type
        .header("X-Custom-Header", "my-app") // 自定义请求头
        .send()
        .await?;

    // 检查状态
    if response.status().is_success() {
        let body_text = response.text().await?;
        println!("请求成功！返回数据: {}", body_text);
    } else {
        println!("请求失败，状态码: {}", response.status());
    }

    Ok(())
}
```

**关键知识点对比：**

| 方法 | 用途 | 自动处理 |
|------|------|----------|
| `.json(&data)` | 发送 JSON body | 设置 `Content-Type: application/json` |
| `.form(&params)` | 发送表单 body | 设置 `Content-Type: application/x-www-form-urlencoded` |
| `.body(raw_bytes)` | 发送原始字节 | 不做额外处理 |

## 五、reqwest 能做什么

- GET / POST / PUT / DELETE 等所有 HTTP 方法
- 自动处理 gzip/brotli 压缩（开 feature 即可）
- Cookie 会话管理
- 代理支持（HTTP、SOCKS5）
- 自定义重定向策略（最多 10 跳）
- 上传/下载文件（multipart）
- 流式接收大数据
- 支持 WebAssembly（浏览器环境）

## 六、下一步

- 官方文档: https://docs.rs/reqwest
- 示例代码: https://github.com/seanmonstar/reqwest/tree/master/examples
- Cargo 页面: https://crates.io/crates/reqwest
