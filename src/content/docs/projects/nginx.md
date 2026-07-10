---
title: nginx — 高性能 Web 服务器
来源: https://github.com/nginx/nginx
日期: 2026-05-29
分类: DevOps / 网络
难度: 中级
---

## 是什么

nginx 是俄罗斯工程师 Igor Sysoev 在 2004 年写的一个 Web 服务器。它要解决的问题是：当时主流的 Apache 每来一个客户端，就开一个进程或线程去服务它，连接一多就把内存吃光。nginx 换了一个思路——**一个 worker 进程同时招呼成千上万个连接**。

日常类比：

- Apache 像传统中餐馆——**每桌客人配一个专属服务员**，10 桌就要 10 个人。客人多了店里站不下。
- nginx 像高端日料吧台——**一个师傅同时招呼吧台上 100 位客人**，谁喊一声就回应谁，没人喊就低头干活。这套 "一个人 + 事件循环 + epoll" 的玩法就是异步 I/O。

最小配置长这样：

```nginx
server {
    listen 80;
    location / {
        root /var/www/html;
    }
}
```

这就跑起来了一个静态文件服务器。

## 为什么重要

不理解 nginx，下面这些事都没法解释：

- 为什么 **30%+ 的网站**用 nginx（和 Apache 并列前两名），Cloudflare / Fastly / GitHub / Netflix 都在用
- 为什么一台 1G 内存的小机器能扛 10K 并发——它把 "1 连接 = 1 进程" 换成 "1 进程 = N 连接"
- 为什么后端架构图里 nginx 永远画在最前面——它是反向代理 / 负载均衡 / SSL 终止 / 静态文件缓存 **一站式工具**
- 为什么 OpenResty / Tengine / Kong 这些项目都从 nginx fork——它的模块化设计让别人可以很容易扩展

## 核心要点

nginx 的几个核心机制：

1. **master + worker 进程模型**：master 进程只管控制（读配置、起 worker、接信号），不处理请求。worker 进程才真正服务客户端，每台机器一般跑 CPU 核数个 worker。
2. **每 worker 单线程跑事件循环**：worker 内部不开线程，靠 Linux 的 **epoll**（macOS 是 kqueue）一次性问内核 "这一批 fd 里哪些有动静"，然后挨个处理。处理完一个继续问下一批，永不阻塞。
3. **反向代理 + 负载均衡**：用 `upstream` 块声明后端池，用 `proxy_pass` 把请求转给后端。算法支持 round-robin / least_conn / ip_hash 等。
4. **协议支持广**：HTTP/1.1、HTTP/2、HTTP/3（QUIC）、WebSocket、gRPC、TCP/UDP 四层代理都能做。
5. **配置文件即代码**：所有行为都写在 `nginx.conf` 里，没有 GUI，没有数据库，重启 / reload 就生效。

## 实践案例

### 反向代理：把 /api 转给后端服务

```nginx
server {
    listen 80;
    server_name example.com;

    location /api/ {
        proxy_pass http://backend:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        root /var/www/html;
        try_files $uri $uri/ /index.html;
    }
}
```

效果：浏览器请求 `example.com/api/users` 时，nginx 把它转给内部的 `backend:3000`；其余路径走静态文件，匹配不到就回 `index.html`（SPA 友好）。

### 负载均衡：把流量分到多台后端

```nginx
upstream backend_pool {
    server 10.0.0.1:3000 weight=2;
    server 10.0.0.2:3000 weight=1;
    server 10.0.0.3:3000 backup;
}

server {
    location / {
        proxy_pass http://backend_pool;
    }
}
```

`weight=2` 让第一台拿到 2 倍流量；`backup` 标记的机器只在前两台都挂了才上场。

### 静态文件 + gzip

```nginx
location /static/ {
    root /var/www;
    gzip on;
    gzip_types text/css application/javascript;
    expires 7d;
}
```

`gzip on` 让响应自动压缩，CSS / JS 一般能省 60-80%；`expires 7d` 加 `Cache-Control: max-age=604800`，浏览器一周内不再回源。

## 踩过的坑

1. **改配置不先 `nginx -t` 直接 reload**：语法错误会让 reload 失败但旧配置继续跑，你以为生效了其实没改。规矩：先 `nginx -t` 测语法，过了再 `nginx -s reload`。
2. **proxy_buffer 默认太小**：后端返回大响应（比如 10MB JSON）时，nginx 默认只给 8 个 4K buffer，超出的会写临时文件，磁盘 I/O 拖慢响应。压力大时调大 `proxy_buffers 16 64k;`。
3. **upstream 不开 keepalive**：默认每次代理都新建 TCP 连接到后端，握手 + 慢启动消耗大。应当：

   ```nginx
   upstream backend { server 10.0.0.1; keepalive 32; }
   location / { proxy_http_version 1.1; proxy_set_header Connection ""; proxy_pass http://backend; }
   ```

4. **access.log 写满磁盘**：默认每个请求都记一行，高 QPS 一天能写几十 GB。要么挂 `logrotate`，要么对静态资源关日志（`access_log off;`）。
5. **`worker_connections` 不够**：默认 1024，意思是 "一个 worker 同时只能处理 1024 个连接"。10K 并发 + 4 worker 才刚够，调到 `worker_connections 10240;` 比较稳。

## 适用 vs 不适用场景

**适用**：

- 反向代理 / 负载均衡（最经典用法）
- 静态文件服务（比 Node.js 的 `express.static` 快几个数量级）
- SSL 终止——后端服务用明文，nginx 统一收 HTTPS
- API 网关的 "1.0 版本"——简单路由 / 限流 / 认证 / 缓存

**不适用**：

- 复杂业务逻辑（要写 Lua 嵌进去就走 OpenResty，纯 nginx 配置写不动）
- 需要细粒度可观测性（trace / metrics 比 Envoy 弱）
- 服务网格场景（用 Envoy / Istio 更合适，nginx 不是为 sidecar 设计的）
- 动态服务发现（默认配置文件静态，得配合 `nginx-upsync` 之类才能实时拉 Consul）

## 历史小故事（可跳过）

- **2002 年**：Sysoev 在俄罗斯门户 Rambler 工作，Apache 顶不住流量，自己开始写 nginx。
- **2004 年 10 月**：第一版开源，俄文文档为主，先在俄语圈火起来。
- **2010 年前后**：Cloudflare 等把 nginx 用作边缘节点核心组件之一，nginx 进入西方主流视野。
- **2011 年**：Sysoev 创立 nginx Inc.，全职维护开源版 + 卖商业版（nginx Plus）。
- **2019 年**：F5 Networks 以约 6.7 亿美金收购 nginx Inc.。
- **2024 年起**：原核心维护者 Maxim Dounin 因和 F5 在安全披露上的分歧离开，fork 出 freenginx；OpenResty / Tengine / Angie 等社区分支也活跃起来。

## 学到什么

- **事件驱动 + 单线程** 不是慢，是把 "等 I/O" 的时间利用起来——这是 Node.js / Redis / Envoy 共享的底层思路
- **配置即代码、没有数据库** 让 nginx 重启快、好回滚——这是 12factor 的雏形
- **master + worker 模型** 在 PostgreSQL / Redis Cluster / Chrome 里都能看到——一个控制进程 + 多个干活进程
- **协议中立 + 模块化** 让一个工具同时是 Web 服务器 / 代理 / 负载均衡器

## 延伸阅读

- 官方文档：搜 "nginx docs"，指令分类齐全
- 经典书：《Nginx 高性能 Web 服务器详解》—— 苗泽
- 配置生成器：DigitalOcean NGINXConfig，可视化拼配置
- [[redis]] —— 同样的事件驱动单线程模型
- [[express]] —— 常放在 nginx 后面，由 nginx 终止 SSL

## 关联

- [[express]] —— Node.js 后端框架，常作为 nginx upstream 的目标
- [[next-js]] —— 部署时通常前面架 nginx 做 SSL 终止 + 静态缓存
- [[redis]] —— 同样是单线程 + epoll 的事件驱动设计
- [[kafka]] —— 一起组成 "流量入口 + 后端异步处理" 的标准架构
- [[envoy]] —— 服务网格/可观测性更强的代理对照
- [[haproxy]] —— 另一路高性能负载均衡对照
- [[kong]] —— 基于 nginx + Lua 的 API 网关

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[caddy]] —— Caddy — 自动 HTTPS Web 服务器
- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[haproxy]] —— HAProxy — 高性能 LB，TCP/HTTP 双层负载均衡
- [[kong]] —— Kong — 基于 nginx + Lua 的云原生 API 网关
- [[next-js]] —— Next.js — React 全栈框架
- [[redis]] —— Redis — 内存键值数据库
- [[traefik]] —— Traefik — 现代云原生反向代理

