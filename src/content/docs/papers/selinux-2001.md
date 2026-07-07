---
title: SELinux — 给 Linux 装上不可绕过的安检门
来源: 'Loscocco & Smalley, "Integrating Flexible Support for Security Policies into the Linux Operating System", USENIX Security 2001'
日期: 2026-06-24
分类: 操作系统
难度: 中级
---

## 是什么

SELinux（Security-Enhanced Linux）是一套**强制访问控制（MAC）框架**，被嵌入 Linux 内核。日常类比：普通 Linux 权限像公司的门卡——你是员工就能刷开所有楼层；SELinux 像机场安检——不管你是旅客还是机长，每次进不同区域都要单独查一遍证件和行李，安检规则由安全部门统一制定，个人无法绕过。

核心区别：传统 Unix 权限是**自主访问控制（DAC）**——文件所有者说了算，root 更是全能。SELinux 是**强制访问控制（MAC）**——内核强制执行系统管理员定义的策略，即使 root 进程也受约束。

论文由 NSA（美国国家安全局）的 Peter Loscocco 和 Stephen Smalley 发表于 USENIX Security 2001，展示如何在 Linux 内核里加入通用的安全策略执行点，让不同安全模型（类型强制、角色访问、多级安全）都能插拔使用。

一句话总结：SELinux = 在内核里加一层不可绕过的安全检查层，规则由策略文件定义，任何进程（含 root）都无法自行取消。

## 为什么重要

- Linux 内核漏洞或应用被攻破后，DAC 权限形同虚设——攻击者拿到 root 就等于拿到一切。SELinux 让“拿到 root 不等于拿到一切”成为可能
- 实际案例：2014 年 Heartbleed 漏洞暴露时，启用 SELinux 的系统攻击面显著小于未启用的系统
- 直接催生了 **LSM（Linux Security Modules）** 框架——今天所有主流安全模块（AppArmor、SMACK、Landlock）都通过 LSM 挂载
- Android 4.3 起默认启用 SELinux，全球数十亿设备的沙箱隔离依赖它
- 论文提出的“策略与机制分离”设计哲学，至今仍是操作系统安全的黄金准则
- RHEL、CentOS、Fedora 默认开启 SELinux，企业服务器市场占有率巨大

## 核心要点

论文解决三个问题：**在哪检查**、**怎么判断**、**策略怎么换**。

1. **安全钩子（Security Hooks）**：在内核每个访问决策点（打开文件、创建 socket、fork 进程……）插入检查钩子。类比：商场每个入口装摄像头 + 闸机，不管从哪进都会被拦一次。论文统计，Linux 2.4 内核中共插入了约 150 个钩子点，覆盖文件系统、网络、进程管理等所有子系统。

2. **安全服务器（Security Server）**：集中的策略判定引擎。钩子把"主体 A 想对客体 B 做操作 X"的请求发过来，安全服务器查策略表返回 allow/deny。类比：安检员不自己决定规则，每次扫描后问中央数据库"这人能不能带这个进去"。

3. **策略可替换**：安全服务器是模块化的。你可以换成"类型强制（TE）"策略，也可以换成"多级安全（MLS）"策略，内核钩子不用改。这就是"机制与策略分离"——同一套钩子框架支撑完全不同的安全需求。

4. **安全标签（Security Context）**：每个进程、文件、端口都贴一个标签，格式类似 `user:role:type:level`。策略就是一组"标签 A 对标签 B 允许做什么"的规则。标签存储在文件系统的扩展属性（xattr）中，重启不丢失。

5. **AVC（Access Vector Cache）**：策略判定结果缓存在内核里，避免每次都查策略表，性能开销压到 5-7%。缓存命中率在实际工作负载中可达 99% 以上，因为大多数访问模式是重复的。

## 实践案例

### 案例 1：Web 服务器被攻破后的差异

没有 SELinux：Apache 被注入 shell → 攻击者以 `www-data` 身份读 `/etc/shadow`、改系统文件、装后门。严重时可以安装 rootkit、簟改日志、拒不承认入侵。

有 SELinux：Apache 进程标签为 `httpd_t`，策略只允许它读 `httpd_content_t` 类型的文件、监听 `http_port_t`。即使被注入 shell，进程仍被限制在 `httpd_t` 权限笼子里——读不了 shadow，改不了系统文件。攻击者能做的事被封锁在非常小的范围内。

### 案例 2：Android 应用沙箱

每个 APK 安装后被分配唯一 SELinux 类型（如 `untrusted_app`）。即使某个 App 利用漏洞提权到 root，SELinux 策略仍然阻止它访问其他 App 的数据目录或系统关键服务。这就是为什么 Android root 后还需要"关闭 SELinux"才能真正为所欲为。

Android 的 SELinux 策略由 Google 维护在 AOSP 中，厂商可在此基础上添加自定义规则。策略文件编译为二进制格式加载到内核，运行时不可修改。

### 案例 3：查看和排查 SELinux 拒绝

```bash
# 查看当前模式
getenforce          # 输出: Enforcing / Permissive / Disabled

# 查看某进程的安全上下文
ps -eZ | grep httpd
# 输出: system_u:system_r:httpd_t:s0  1234 ?  00:00:01 httpd

# 查看文件的安全标签
ls -Z /var/www/html/index.html
# 输出: system_u:object_r:httpd_content_t:s0 /var/www/html/index.html

# 查看拒绝日志
ausearch -m AVC -ts recent
# 输出: type=AVC msg=... denied { read } for ... scontext=httpd_t tcontext=shadow_t

# 从拒绝日志生成最小策略模块
ausearch -m AVC -ts recent | audit2allow -M mypolicy
semodule -i mypolicy.pp
```

## 踩过的坑

1. **Permissive 模式忘切回 Enforcing**：调试时切到 Permissive（只记录不拒绝），调完忘切回去，等于安检门开着不拦人。生产环境必须 `setenforce 1`。建议用自动化工具（如 Ansible）管理这个状态。

2. **自定义策略写得太宽**：新手图省事写 `allow httpd_t file_type:file *;`——等于给 Apache 开了全权限读所有文件类型，失去了 MAC 的意义。策略应该最小权限。正确做法是用 `audit2allow` 从实际拒绝日志生成最小策略。

3. **文件标签丢失**：用 `cp` 代替 `mv` 时文件可能丢失原标签，导致服务启动后被 SELinux 拒绝访问。修复：`restorecon -Rv /path`。根因是 `cp` 创建新 inode 并继承目标目录的默认标签，而 `mv` 保留原 inode 及其标签。

4. **容器内 SELinux 冲突**：Docker 默认给容器加 `container_t` 标签，挂载宿主机目录时如果宿主目录标签不匹配会被拒绝。常见错误是直接关闭 SELinux 而非正确加 `:Z`（单容器独占）或 `:z`（多容器共享）挂载选项。

## 适用 vs 不适用场景

**适用**：

- 多租户服务器需要强隔离（即使某服务被攻破也不扩散）
- 合规要求（政府、金融、医疗系统要求 MAC，如 PCI-DSS、HIPAA）
- Android/嵌入式设备的应用沙箱
- 任何“defense in depth”策略的关键一层
- 容器编排环境（OpenShift 默认强制 SELinux）

**不适用**：

- 开发环境频繁变更文件路径和权限（SELinux 策略维护成本高）
- 单用户桌面且不关心纵深防御（Ubuntu 默认用更轻量的 AppArmor）
- 需要极致性能且安全不是首要关注（5-7% 开销在高频 I/O 场景可感知）
- 团队没有人理解 MAC 概念（错误策略比没有策略更危险——服务莫名拒绝）

## 历史小故事（可跳过）

1992 年 NSA 内部启动"分布式可信操作系统"研究，先后在 Mach 和 Flask 微内核上做实验。Flask 的核心思想——安全服务器 + 对象管理器——直接成为 SELinux 的架构蓝本。

2000 年 NSA 做了一个大胆决定：把成果开源到 Linux——一个情报机构给开源社区贡献安全代码，在当时引发巨大争议（"NSA 是不是藏后门？"）。代码经过社区审计后被接受。Linus Torvalds 最初拒绝直接合入 SELinux，而是要求先建立通用框架——这倒逼了 LSM 的诞生。2003 年 SELinux 作为第一个 LSM 模块合入 Linux 2.6 主线。

讽刺的是，2013 年斯诺登泄露文件显示 NSA 确实试图削弱加密标准，但 SELinux 代码本身因为开源透明、经过独立审计，反而被证明是干净的。

今天 SELinux 的主要维护者已从 NSA 转移到 Red Hat，社区驱动的开发模式让它成为企业 Linux 安全的基石。

## 学到什么

1. **机制与策略分离**是系统设计的通用原则——内核提供"检查能力"，具体"检查什么"由策略配置决定，不硬编码。这个思想在网络（OpenFlow 交换机）、容器（OPA 策略引擎）中反复出现

2. **DAC 不够用**——只要有 root 或所有者权限就能绕过。MAC 补上了这个缺口，形成纵深防御

3. **性能与安全的 trade-off**：AVC 缓存是典型的"空间换时间"，把策略查询从微秒级压到纳秒级。设计安全系统时必须考虑性能——没人愿意用慢 20% 的安全方案

4. **标签是一切的基础**——进程、文件、端口都带标签，安全判定变成"标签之间的关系查询"。这种"给万物贴标签再写规则"的思路在 K8s NetworkPolicy、云 IAM 中都能看到

5. **开源让安全可信**——NSA 选择开源而非闭源，社区审计反而增强了信任。安全系统越透明越安全

6. **从微内核到宏内核的迁移智慧**——NSA 先在 Mach/Flask 微内核验证思路，再迁移到 Linux 宏内核。证明好的安全架构可以跨内核设计复用

## 延伸阅读

- Red Hat 官方文档：[SELinux User's and Administrator's Guide](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/selinux_users_and_administrators_guide/)（最完整的实操参考）
- 论文 PDF：[USENIX Security 2001 原文](https://www.cs.unc.edu/~jeffay/courses/nidsS05/papers/selinux.pdf)（18 页，图表清晰）
- 视频：[SELinux for mere mortals - Red Hat Summit Talk](https://www.youtube.com/watch?v=_WOKRaM-HI4)（30 分钟入门，带真实 demo）
- Flask 架构论文：Spencer et al., "The Flask Security Architecture", USENIX Security 1999（SELinux 的直系前身）
- [[saltzer-schroeder-1975]] —— 最小权限等安全设计原则的源头论文

## 关联

- [[saltzer-schroeder-1975]] —— SELinux 是"最小权限原则"和"完全中介"在 Linux 上的工程实现
- [[unix-1974]] —— SELinux 补强的正是 Unix DAC 模型的先天不足
- [[sel4-2009]] —— 从形式化验证角度做安全内核，与 SELinux 的工程路线形成对比
- [[multics-1965]] —— Multics 的 ring 保护机制是 MAC 思想的前身
- [[exokernel-1995]] —— 同样探索内核机制与策略分离，但方向是性能而非安全
- [[mach-1986]] —— NSA 最早在 Mach 微内核上实验 MAC，后迁移到 Linux
- [[kubernetes-2016]] —— K8s Pod Security 策略借鉴了 SELinux 的标签思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[capsicum-2010]] —— Capsicum — 给 UNIX 进程发"通行证"而不是"万能钥匙"
- [[haven-2014]] —— Haven — 在不信任的云里给程序造一间安全屋
- [[kubernetes-2016]] —— Kubernetes — 为什么选声明式 API 加协调环
- [[mach-1986]] —— Mach — 把内核拆成消息互通的小服务
- [[saltzer-schroeder-1975]] —— Saltzer-Schroeder 1975 — 8 条至今教科书还在引的安全设计原则
- [[sel4-2009]] —— seL4 — 第一个被数学证明"代码和规范完全一致"的操作系统内核

