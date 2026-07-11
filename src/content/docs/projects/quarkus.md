---
title: Quarkus — 让 Java 启动比 Node 还快的云原生框架
来源: 'https://github.com/quarkusio/quarkus'
日期: 2026-05-30
分类: backend-api
难度: 中级
---

## 是什么

Quarkus 是一个**让 Java 应用启动几十毫秒、内存只占几十 MB** 的后端框架。日常类比：传统 Java 像家里的台式电脑——开机要等 1 分钟，但跑一天没问题；Quarkus 把它改造成笔记本电脑——掀盖即用，电池还省。

它做了一件反直觉的事：**把启动时该做的活儿提前到打包时**。比如 Spring Boot 启动那一刻才扫描所有 `@Service`、读配置、解析注解；Quarkus 在 `mvn package` 那一刻就把这些算完，运行时只剩业务逻辑。

再叠一层 GraalVM——把 Java 字节码 ahead-of-time 编译成原生 Linux 二进制，启动从 4 秒压到 50 毫秒，内存从 200MB 压到 13MB。容器镜像也跟着瘦到 50MB 以内，正好喂给 Kubernetes 的 pod 弹性伸缩。

## 为什么重要

不理解 Quarkus，下面这些事都没法解释：

- 为什么 Java 在 serverless / FaaS 上长期被嘲笑"冷启动太慢"，最近又突然能用了
- 为什么 Spring 团队 2022 年也急着出 Spring Boot Native，跟谁较劲
- 为什么"build-time DI"听起来像废话，其实是十几年来 Java 框架的最大变化
- 为什么一个 JAX-RS 接口能跑出和 Go / Rust 同量级的资源数字

## 核心要点

Quarkus 的招式可以拆成 **三步**：

1. **build-time DI**：依赖注入、配置解析、注解处理全在编译期完成。类比：宜家家具——出厂时该锯的锯好，到家只需拧螺丝。运行时不再反射扫描，启动速度直接起飞。

2. **native-image AOT**：用 GraalVM 把字节码编成原生可执行文件，没 JVM warm-up，启动即峰值性能。类比：把"打开 Word 再打字"换成"打开就是已经写好的文档"。

3. **dev mode 热重载**：开发时启 `mvn quarkus:dev`，改 Java 文件刷新浏览器就生效，不用重启。类比：前端的 Vite——保留 Java 严肃的同时偷了 JS 的开发体验。

三者合起来：生产快、上线小、开发爽。

## 实践案例

### 案例 1：最小 REST 接口 + dev mode

```java
@Path("/hello")
public class GreetingResource {
    @GET
    public String hello() { return "Hello"; }
}
```

启动：

```bash
./mvnw quarkus:dev
```

**逐部分解释**：

- `@Path` 是 JAX-RS 标准注解，告诉框架这个类挂在 `/hello`
- `quarkus:dev` 启动后改 `"Hello"` 为 `"Hi"`，浏览器刷新立刻看到——不重启
- JVM 模式启动约 1 秒；后面案例 2 跑 native 会变 50 毫秒

### 案例 2：跑 native-image 看冷启动

```bash
./mvnw package -Dnative
./target/myapp-runner
```

**逐部分解释**：

- `-Dnative` 触发 GraalVM 编译，约 2-5 分钟（CI 单独 job）
- 产物 `myapp-runner` 是 ELF 二进制，没 JVM 依赖
- 启动打印 `started in 0.018s`，比 `node app.js` 还快
- 适合 serverless / Knative scale-to-zero 场景

### 案例 3：Kafka 消费者微服务

```java
@ApplicationScoped
public class OrderConsumer {
    @Incoming("orders")
    public void consume(String msg) {
        Log.infof("got %s", msg);
    }
}
```

**逐部分解释**：

- `@Incoming` 来自 Quarkus 的 SmallRye Reactive Messaging extension
- 配置 `mp.messaging.incoming.orders.connector=smallrye-kafka` 即可绑 Kafka topic
- 部署到 Kubernetes 时单 pod 内存占用约 80MB（JVM）/ 25MB（native）
- 详见 [[kafka]] 章节理解 topic / consumer group 概念

## 踩过的坑

1. **native 反射陷阱**：动态加载类 / Jackson 反序列化 / `Class.forName` 在 native 下默认不工作，必须给类加 `@RegisterForReflection` 或手写 reflect-config.json，不然运行时报 `ClassNotFoundException`
2. **build 时间长**：native 编译一次 2-5 分钟，CI 上必须单独 job，本地开发千万别每次都 native，用 dev mode 或 JVM 模式
3. **extension 锁版本**：Quarkus BOM 写死了所有依赖版本，自己 pom.xml 覆盖会破坏 build-time 处理，应该用官方 extension 或干脆 fork BOM
4. **CDI 作用域踩坑**：Quarkus 的 ArC 是 CDI 子集，`@RequestScoped` 在 reactive 路径里不能跨线程传递，reactive endpoint 默认不开 request context

## 适用 vs 不适用场景

**适用**：

- Kubernetes / OpenShift 上的 Java 微服务，要弹性伸缩
- AWS Lambda / Knative serverless 函数，冷启动敏感
- 已有 Java 团队但容器资源吃紧，想从 Spring Boot 瘦身

**不适用**：

- 纯单体应用、长期常驻、几台 VM 跑 → Spring Boot 反而更省事
- 大量动态加载 / 反射的老代码 → native 改造成本高
- 团队完全没 Java 背景 → 选 [[gin]] / [[axum]] / [[fastapi]] 起步更轻
- 需要复杂 Spring 生态（Spring Security 高级特性）→ 兼容层有限

## 历史小故事（可跳过）

- **2019 年 3 月**：Red Hat 内部首次公开 Quarkus，主打 "Supersonic Subatomic Java"
- **2019 年 11 月**：Devoxx Belgium 发布 1.0，启动速度对比 Spring Boot 视频在社区疯传
- **2020 年**：GraalVM 集成成熟，native 模式成主流卖点
- **2022 年**：Spring 团队推出 Spring Boot Native 反击，承认 build-time 路线的价值
- **2024 年**：项目捐给 Commonhaus Foundation 成中立基金会项目，Apache 2.0 协议

## 学到什么

1. **把运行时活儿挪到构建期**——这是过去十年云原生框架的共同方向
2. **AOT 不是替代 JIT**，而是给"启动一次跑很久"和"启动很多次"两种工作负载提供两条路
3. **开发体验和生产性能可以同时要**——dev mode + native build 是两端兼顾的范例
4. **生态比技术更难**：Quarkus 200+ extension 是它真正打动 Java 社区的关键

## 延伸阅读

- 官方 guide：[Quarkus Getting Started](https://quarkus.io/guides/getting-started)（30 分钟跑出第一个接口）
- 视频：[Devoxx 2019 Quarkus 发布](https://www.youtube.com/watch?v=cmxKMlXRdhI)（1.0 首秀，启动对比震撼）
- GitHub：[quarkusio/quarkus](https://github.com/quarkusio/quarkus)（14k star，extension 目录值得翻）
- [[spring-boot]] —— 老大哥，对比着看才理解 Quarkus 解决什么
- [[kubernetes]] —— Quarkus 的部署目标平台

## 关联

- [[spring-boot]] —— Java 后端事实标准，Quarkus 是它的云原生挑战者
- [[kubernetes]] —— Quarkus 的部署目标，pod 弹性伸缩对启动时间敏感
- [[docker]] —— Quarkus 镜像优化的容器底座
- [[kafka]] —— Quarkus extension 直接集成的消息系统
- [[axum]] —— Rust 的同类轻量后端框架，对比看不同语言的取舍
- [[fastapi]] —— Python 的同类，dev mode 思路相近
- [[gin]] —— Go 的轻量后端，资源占用是 Quarkus native 的对标参照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dropwizard]] —— Dropwizard — Java 微服务的"开箱即用 12-factor 起步包"
- [[hanami]] —— Hanami — Ruby 里既不是 Rails 也不是 Sinatra 的第三选择
- [[helidon]] —— Helidon — 让 Java 微服务用同步代码写出反应式性能
- [[micronaut]] —— Micronaut — 编译期搞定 DI 的 JVM 云原生框架
- [[spring-boot]] —— Spring Boot — 用 Auto-configuration 把 Java 后端从 XML 地狱里救出来的事实标准框架
- [[vertx]] —— Vert.x — Eclipse 出品的 polyglot reactive JVM toolkit，用事件总线 + verticle 把 Node.js 那套搬到多语言
