---
title: "Spring Framework — Java 生态的瑞士军刀"
来源: https://github.com/spring-projects/spring-framework
日期: 2026-06-13
分类: 后端 API
子分类: backend-and-api
provenance: pipeline-v3
---

## 是什么

Spring Framework 是 **Java 生态里最流行的开源应用框架**。它帮 Java 开发者用更少的样板代码，写出更清晰、更好测试的应用。

日常类比：想象你要盖一栋房子。没有 Spring 的话，你自己要造砖、浇水泥、做电线、通水管——每一块砖都得亲手捏。有了 Spring，你只需要告诉它"我要一间卧室"，它就会把砖搬来、水电接好，你只负责装修和住进去。

Spring 做了三件大事：

1. **IOC/DI（控制反转/依赖注入）**：帮你管对象之间的关系，不再手动 new
2. **AOP（面向切面编程）**：把日志、事务这些横切关注点抽出来
3. **MVC 框架**：帮你快速建 Web 应用

## 核心概念

### 1. IOC 容器 — 对象的"大管家"

IOC（Inversion of Control）意思是：**不再由你的代码来控制对象的创建和销毁，而是交给 Spring 容器来管**。

想象一个餐厅：

- **没有 Spring**：每个厨师自己要去找食材、自己洗菜、自己切菜。如果换供应商，所有厨师都要改。
- **有 Spring**：厨师只管做菜。食材由"采购经理"（Spring 容器）准备好送到手。换供应商？只改采购经理一个人就行。

Spring 容器就是那个采购经理。你告诉它"我需要一把菜刀"，它就给你一把准备好的菜刀，连磨好的都有。

### 2. Bean — 被 Spring 管理的对象

Spring 管理的每一个对象叫 **Bean**。你可以理解为"被 Spring 工厂生产出来的零件"。

```java
// 这是一个普通的 Java 类
public class UserService {
    private UserRepository userRepository;

    // 构造函数注入 —— Spring 会自动填入 userRepository
    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public String findUserName(Long id) {
        return userRepository.findById(id).getName();
    }
}
```

### 3. 依赖注入（DI）— 被动获得，而非主动索取

DI 是 IOC 的具体实现方式。你的类**不需要自己创建依赖**，而是让 Spring 注入进来。

三种注入方式：

| 方式 | 写法 | 推荐度 |
|------|------|--------|
| 构造函数注入 | `public Class(Dep dep)` | 最推荐 ✅ |
| Setter 注入 | `@Setter` + `@Autowired` | 可选依赖时用 |
| 字段注入 | `@Autowired private Dep dep;` | 不推荐，难测试 |

### 4. 注解驱动 — 少写配置，多用注解

Spring 用注解代替了大量 XML 配置。最常见的几个：

- `@Component` — 标记这是一个 Bean
- `@Service` — 标记业务逻辑层
- `@Repository` — 标记数据访问层
- `@Controller` / `@RestController` — 标记 Web 控制器
- `@Autowired` — 自动注入依赖

## 代码示例

### 示例 1：一个简单的 Spring Boot 应用

这是最快的入门方式。Spring Boot 是 Spring 的"快速启动版"，自动帮你配好了大部分东西。

```java
// 1. 定义一个数据模型
public class Book {
    private Long id;
    private String title;
    private String author;

    // 构造函数、getter、setter 省略
    public Book(Long id, String title, String author) {
        this.id = id;
        this.title = title;
        this.author = author;
    }
}

// 2. 定义数据访问层（Repository）
// Spring 会自动实现这个接口！你不用写一行实现代码
public interface BookRepository {
    Book findById(Long id);
    List<Book> findAll();
    void save(Book book);
}

// 3. 定义业务逻辑层（Service）
@Service  // 告诉 Spring：我是一个 Bean，请管我
public class BookService {

    // Spring 会自动把 BookRepository 的实现注入到这里
    private final BookRepository bookRepository;

    public BookService(BookRepository bookRepository) {
        this.bookRepository = bookRepository;
    }

    public Book getBookById(Long id) {
        return bookRepository.findById(id);
    }

    public List<Book> getAllBooks() {
        return bookRepository.findAll();
    }

    public void addBook(Book book) {
        bookRepository.save(book);
    }
}

// 4. 定义 Web 层（Controller）
@RestController  // 告诉 Spring：我是一个 Web 控制器
@RequestMapping("/api/books")  // 所有接口都以 /api/books 开头
public class BookController {

    // Spring 自动注入 BookService
    private final BookService bookService;

    public BookController(BookService bookService) {
        this.bookService = bookService;
    }

    // GET /api/books/1
    @GetMapping("/{id}")
    public Book getBook(@PathVariable Long id) {
        return bookService.getBookById(id);
    }

    // GET /api/books
    @GetMapping
    public List<Book> getAllBooks() {
        return bookService.getAllBooks();
    }

    // POST /api/books
    @PostMapping
    public void addBook(@RequestBody Book book) {
        bookService.addBook(book);
    }
}
```

运行后，打开浏览器访问 `http://localhost:8080/api/books/1`，就能看到结果。**整个过程中你没有手动 new 过任何一个对象**——Spring 替你管好了所有对象的生命周期和依赖关系。

### 示例 2：Spring 的事务管理

实际项目中，数据库操作经常需要事务保证一致性。比如转账：A 扣钱、B 加钱，这两步要么全成功，要么全失败。

```java
@Service
public class TransferService {

    private final AccountRepository accountRepository;

    public TransferService(AccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }

    // @Transactional 告诉 Spring：这个方法要放在事务里执行
    // 如果方法内抛出异常，所有数据库操作自动回滚
    @Transactional
    public void transfer(Long fromAccountId, Long toAccountId, BigDecimal amount) {
        // 第一步：扣钱
        Account from = accountRepository.findById(fromAccountId);
        from.setBalance(from.getBalance().subtract(amount));
        accountRepository.save(from);

        // 模拟一个异常（比如余额不足）
        if (from.getBalance().compareTo(BigDecimal.ZERO) < 0) {
            throw new RuntimeException("余额不足！");
        }

        // 第二步：加钱
        Account to = accountRepository.findById(toAccountId);
        to.setBalance(to.getBalance().add(amount));
        accountRepository.save(to);
    }
}
```

关键点：`@Transactional` 这一行注解，代替了你以前手动写的 `connection.commit()` 和 `connection.rollback()`。Spring 在后台用 AOP 代理拦截了这个方法，自动管理事务的开始、提交和回滚。

## 为什么重要

不理解 Spring，很多后续技术都看不懂：

- **Spring Boot**：Spring 的"一键启动版"，现在 90% 以上的新 Java 项目都用它
- **Spring Cloud**：微服务架构的事实标准
- **Spring Security**：Spring 官方的安全框架
- **Spring Data**：简化数据库访问

## 学习路线建议

1. 先学 Java 基础（面向对象、集合、异常处理）
2. 理解 Maven/Gradle 构建工具
3. 从 Spring Boot 入手，比纯 Spring 简单很多
4. 重点掌握：IOC/DI、注解、RESTful API
5. 再深入 Spring MVC、Spring Data JPA、Spring Security

## 关键术语速查

| 术语 | 全称 | 一句话解释 |
|------|------|------------|
| IOC | Inversion of Control | 控制权交给容器，不再自己 new |
| DI | Dependency Injection | 依赖由外部注入，不是自己创建 |
| Bean | — | 被 Spring 管理的对象 |
| AOP | Aspect-Oriented Programming | 把日志、事务等横切逻辑抽出来 |
| Spring Boot | — | Spring 的快速启动封装 |
| @Component | — | 标记"这是个 Bean" |
| @Autowired | — | 标记"这里要自动注入" |
| @Transactional | — | 标记"这个方法要走事务" |
