---
title: QuestDB 零基础学习笔记
来源: https://github.com/questdb/questdb
日期: 2026-06-13
分类: 数据库
子分类: 现代数据库
provenance: pipeline-v3
---

# QuestDB 零基础学习笔记

## 一、QuestDB 是什么——从一个日常类比开始

想象你有一家连锁便利店，每天每个门店会产生几百条销售记录（商品、数量、金额、时间）。

如果你用普通数据库来存这些数据，就像把所有小票塞进一个大纸箱，找数据时需要翻遍整箱。

QuestDB 的做法完全不同——它像一个有 **时间抽屉** 的智能文件柜：

- 每个抽屉按天（或按小时）分好
- 同一列的数据放在一起（不是同一行放在一起）
- 你要查"昨天咖啡的总销量"，它只翻咖啡那一列，不用看整个箱子

这就是**时序数据库（Time-Series Database）**的核心思路：数据按时间排序存储，列方向排列，查询时跳过不需要的部分。

## 二、为什么需要时序数据库

普通数据库（如 MySQL）在处理时序数据时有两个痛点：

1. **写入速度慢**：每秒处理几千条数据就吃力了
2. **查询慢**：要分析"过去一年的每分钟价格趋势"，需要扫描大量无关数据

QuestDB 用三种技术解决这些问题：

- **列式存储**：数据按列存在一起，查价格时不用读时间、数量
- **SIMD 指令加速**：CPU 一次算多个数（类似一个人同时搬 4 箱货而不是 1 箱）
- **零 GC 设计**：Java 核心做了优化，不会产生大量垃圾数据让系统"停下来打扫"

实际性能对比：QuestDB 写入速度可达每秒 40 万行，是普通数据库的数倍到数十倍。

## 三、核心概念

### 1. 指定时间戳（Designated Timestamp）

每张表必须指定哪一列是"时间锚点"。它决定：
- 数据按这一列物理排序
- 查询时可以跳过无关时间段
- 支持 `SAMPLE BY`、`LATEST ON` 等时序操作

```sql
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    price DOUBLE
) TIMESTAMP(timestamp);
```

### 2. 分区（Partition）

按时间把表分成多个"抽屉"，如按天、按小时。查询时只打开需要的抽屉。

```sql
-- 高流量数据按小时分区
CREATE TABLE trades (...)
PARTITION BY HOUR;

-- 低流量数据按月分区
CREATE TABLE daily_report (...)
PARTITION BY MONTH;
```

### 3. SYMBOL 类型

对重复出现的字符串（如股票代码、货币对），用 `SYMBOL` 而不是 `VARCHAR`。
它内部存为整数索引，比较和分组速度远快于字符串。

### 4. 数据写入方式

QuestDB 支持多种写入方式：
- **ILP（InfluxDB Line Protocol）**：最快，专为写入优化
- **PGWire**：兼容 PostgreSQL 协议，可直接用 psycopg、JDBC 等
- **REST API**：通过 HTTP 接口写入
- **Kafka / Flink**：流式数据集成

### 5. 自动去重与 TTL

- **DEDUP**：指定唯一键，自动替换重复行
- **TTL**：自动删除超过指定时间的数据，不需要手动删除

## 四、安装与运行

### Docker 方式（推荐新手）

```bash
docker run -p 9000:9000 -p 8812:8812 questdb/questdb
```

启动后访问 http://localhost:9000 即可打开 Web Console（在线 SQL 编辑器）。

### macOS Homebrew 方式

```bash
brew install questdb
brew services start questdb
questdb start
```

## 五、代码示例

### 示例 1：创建表并查询（Web Console）

在 Web Console 或任何 SQL 客户端中运行：

```sql
-- 1. 创建交易表
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    side SYMBOL,
    price DOUBLE,
    quantity DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;

-- 2. 插入数据（也可以用 ILP 批量写入）
INSERT INTO trades VALUES ('2026-06-13T10:00:00.000000', 'BTC-USD', 'buy', 65000.50, 0.5);
INSERT INTO trades VALUES ('2026-06-13T10:01:00.000000', 'BTC-USD', 'sell', 65100.00, 0.3);
INSERT INTO trades VALUES ('2026-06-13T10:02:00.000000', 'ETH-USD', 'buy', 3500.25, 2.0);

-- 3. 查询昨天的所有交易
SELECT * FROM trades
WHERE timestamp > dateadd('d', -1, now());
```

### 示例 2：用 SAMPLE BY 做时间聚合

把高频数据按时间窗口汇总，生成 OHLC（开盘/最高/最低/收盘）K 线图数据：

```sql
SELECT
    timestamp,
    symbol,
    first(price) AS open,       -- 开盘价
    max(price) AS high,         -- 最高价
    min(price) AS low,          -- 最低价
    last(price) AS close,       -- 收盘价
    sum(quantity) AS volume     -- 成交量
FROM trades
WHERE timestamp > dateadd('d', -1, now())
SAMPLE BY 1h;                  -- 每小时一组
```

结果示例：

| timestamp | symbol | open | high | low | close | volume |
|-----------|--------|------|------|-----|-------|--------|
| 2026-06-12T10:00:00Z | BTC-USD | 64800 | 65200 | 64700 | 65100 | 2.5 |
| 2026-06-12T11:00:00Z | BTC-USD | 65100 | 65500 | 64900 | 65300 | 1.8 |

### 示例 3：Python 连接查询（PGWire 方式）

```python
import psycopg

conn = psycopg.connect(
    host="127.0.0.1",
    port=8812,
    dbname="qdb",
    user="admin",
    password="quest"
)

cur = conn.cursor()
cur.execute("SELECT symbol, sum(price * quantity) AS total FROM trades SAMPLE BY 1h")

for row in cur.fetchall():
    print(row)

cur.close()
conn.close()
```

## 六、适合什么场景

| 场景 | 说明 |
|------|------|
| 金融行情数据 | 加密货币、外汇、股票 tick 级数据 |
| IoT 传感器 | 温度、湿度、设备遥测 |
| 实时监控 | 运维指标、日志分析 |
| 实时仪表盘 | 需要毫秒级响应的大数据看板 |

## 七、下一步学习方向

- ILP 批量写入（生产环境推荐）
- `ASOF JOIN`（时间序列关联查询）
- 物化视图（自动更新的聚合结果）
- Grafana 可视化集成
