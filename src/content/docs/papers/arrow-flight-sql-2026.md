---
title: Arrow Flight SQL: Zero-Copy Federated Query at Scale
来源: https://arxiv.org/abs/2605.30743
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

# Arrow Flight SQL: Zero-Copy Federated Query at Scale

## 一、从"快递"开始：为什么我们需要它

想象你在一家大型电商公司工作。公司有十几个数据库：订单存在 PostgreSQL 里，用户信息存在 MySQL 里，日志存在 ClickHouse 里，报表数据存在 Snowflake 里。

现在老板说："给我拉一份报表，要跨所有这些库的数据。"

传统做法是什么？你写一段 Python，用 JDBC 或 ODBC 分别连每个库，把数据拉到你的服务器上，在内存里拼起来——这就是**ETL**。问题是：

1. **数据拷贝了多次**：每个数据库 -> 你的机器 -> 再发给别人
2. **格式不统一**：每个数据库有自己的二进制格式，转换消耗 CPU
3. **延迟高**：数据在网络里来回穿梭

Arrow Flight SQL 解决了什么？它让**所有数据库共享同一种内存格式（Apache Arrow）**，查询结果可以直接跨网络以零拷贝方式传递。

类比：以前是每个快递公司用自己的包装箱，收到后要拆包再打包。现在所有快递公司都用标准集装箱——直接吊上车，不用拆。

## 二、核心概念拆解

### 2.1 Apache Arrow：列式内存格式

Arrow 是一种**列式、内存中**的数据格式。它的核心思想是：同一列的数据在内存里连续存放（比如所有整数排在一起，所有字符串排在一起），而不是像传统行式存储那样一行挨一行。

好处：CPU 缓存友好，向量化的 SIMD 指令可以直接处理整列数据，速度极快。

### 2.2 gRPC / Flight RPC：传输层

Arrow Flight 是基于 gRPC 的远程过程调用（RPC）框架。它定义了客户端和服务器之间如何传输 Arrow 数据块（Record Batch）。

你可以把它理解为一个"搬运 Arrow 数据"的标准协议。

### 2.3 Flight SQL：在 Flight 之上加 SQL

Flight SQL 是 Apache Arrow 的规范文档（见 arrow.apache.org/docs/format/FlightSql.html），它在 Flight RPC 框架上增加了一组 SQL 命令：

- 执行 SQL 查询（`CommandStatementQuery`）
- 预处理语句（`CommandPreparedStatementQuery`）
- 批量数据导入（`CommandStatementIngest`）
- 获取数据库元数据（表列表、列信息、主键等）
- 会话管理（设置 catalog/schema 等选项）

**关键点**：查询结果不是传统的关系型结果集，而是直接以 Arrow Record Batch 流的形式返回。客户端收到后可以直接喂给 Pandas、DuckDB、DataFusion 等工具，中间**没有任何序列化/反序列化**。

## 三、零拷贝是什么意思？

假设你在做数据分析：

1. 数据库服务器执行 SQL 查询
2. 结果以 Arrow 格式从数据库引擎内存直接发到网络上
3. 客户端收到 Arrow Record Batch 流
4. 客户端的查询引擎（如 DataFusion）直接消费这些 Arrow 数据

传统方式中，步骤 2 的数据要经过"数据库内部格式 -> JSON/Protobuf -> 网络 -> 解析 -> 内存对象"的多次转换。而 Arrow Flight SQL 让数据从数据库引擎的列式内存直接流向消费者的列式内存，格式不变、拷贝最少。

这就是"零拷贝"——不是完全没拷贝（网络传输本身要拷贝），而是**跳过了格式转换层**。

## 四、代码示例

### 示例 1：用 Python 执行查询

这是使用 `pyarrow.flight` 连接一个支持 Flight SQL 的服务器（如 DuckDB、Apache DataFusion、ClickHouse）：

```python
import pyarrow as pa
import pyarrow.flight

# 1. 连接到 Flight SQL 服务器
# 假设有一个运行中的 DuckDB 实例，监听 localhost:32010
client_options = [
    ("dns_resolution_attempts", 5),
]
client = pyarrow.flight.FlightClient(
    "grpc://localhost:32010", options=client_options
)

# 2. 执行一条 SQL 查询（ad-hoc 查询）
sql_command = b"SELECT * FROM read_csv_auto('orders.csv')"

# 获取查询结果的位置信息（FlightInfo）
descriptor = pyarrow.flight.FlightDescriptor.for_command(sql_command)
flight_info = client.get_flight_info(descriptor)

# 3. 从返回的端点下载数据
for endpoint in flight_info.endpoints:
    for ticket in endpoint.tickets:
        reader = client.do_get(ticket)
        # 结果直接是 Arrow RecordBatchReader，零拷贝！
        for batch in reader:
            df = pa.Table.from_batches([batch]).to_pandas()
            print(df.head())
```

注意第 20 行：`reader` 返回的不是普通的游标或列表，而是 `RecordBatchReader`——一个流式迭代器，直接产出 Arrow 数据块。你可以把它直接送给 Pandas、Polars 或任何 Arrow 兼容的工具，**不需要 JSON 解析或 ORM 映射**。

### 示例 2：预处理语句 + 会话管理

预处理语句相当于 SQL 中的"预编译"。你先把 SQL 模板发给服务器，服务器编译好给你一个"句柄"（handle），之后你只需传参数，不需要重复解析 SQL：

```python
import pyarrow as pa
import pyarrow.flight
import pyarrow.flight.sql

# 1. 创建客户端并建立会话
client = pyarrow.flight.FlightClient("grpc://localhost:32010")

# 2. 创建预处理语句
sql = "SELECT user_id, total FROM orders WHERE status = ? AND amount > ?"
action = pyarrow.flight.Action("CreatePreparedStatement", sql.encode())
result = client.do_action(action)

# 3. 服务器返回一个句柄（handle）
handle_bytes = next(result.body).to_pybytes()
handle = pa.py_buffer(handle_bytes)

# 4. 绑定参数并执行
# 参数值也是以 Arrow 格式发送的
params_batch = pa.record_batch([
    pa.array(["shipped"], type=pa.string()),   # status = 'shipped'
    pa.array([100.0], type=pa.float64())        # amount > 100
], names=['f0', 'f1'])

# 用 DoPut 发送参数 + 句柄
ticket = pyarrow.flight.Ticket(handle)
descriptor = pyarrow.flight.FlightDescriptor.for_command(handle)

# 发送参数流
writer, _ = client.do_put(descriptor, params_batch.schema)
writer.write_batch(params_batch)
writer.close()

# 5. 获取结果
flight_info = client.get_flight_info(descriptor)
for endpoint in flight_info.endpoints:
    reader = client.do_get(endpoint.tickets[0])
    table = reader.read_all()
    print(table.to_pandas())

# 6. 关闭预处理语句释放资源
close_action = pyarrow.flight.Action(
    "ClosePreparedStatement", handle_bytes
)
client.do_action(close_action)
```

这个例子展示了 Flight SQL 的两个重要特性：

- **参数以 Arrow 格式传递**（不是字符串拼接，不是 JDBC 的 setString）
- **句柄机制**让预处理语句的状态在服务器端维护，客户端只需要传 handle + 参数

## 五、典型架构：联邦查询

```
[PostgreSQL]  [MySQL]  [ClickHouse]  [Snowflake]
     |           |           |           |
   [Flight SQL Server (每库一个)]
          \         |         /           /
           \        |        /           /
            [ Arrow Flight RPC 网络层 (gRPC, HTTP/2) ]
                          |
                  [ Arrow Record Batch 流 ]
                          |
              [ 统一查询引擎：DataFusion / DuckDB ]
                          |
                  [ 结果：Pandas / Polars / BI 工具 ]
```

每个数据库前面跑一个 Flight SQL 代理（Proxy），把数据库的查询结果转换成 Arrow 格式输出。统一查询引擎通过网络拿到所有数据流后，在内存里做 JOIN、聚合等操作——**所有数据都以同一种列式格式存在**，不需要格式转换。

## 六、生态中的 Flight SQL 实现

| 实现 | 语言 | 特点 |
|------|------|------|
| DuckDB | C++ | 嵌入式，支持 in-process Flight SQL 服务器 |
| Apache DataFusion | Rust | 分布式查询引擎，Flight SQL 是一等公民 |
| ClickHouse | C++ | 内置 Flight SQL 端点 |
| RisingWave | Rust | 流式数据库，支持 Flight SQL |
| Apache Arrow Flight (官方案例) | C++/Rust | 参考实现 |

## 七、Flight SQL vs 传统 JDBC/ODBC

| 维度 | JDBC/ODBC | Flight SQL |
|------|-----------|------------|
| 数据格式 | 行式，驱动特定 | Arrow 列式，统一 |
| 序列化 | 驱动内部格式 | 零拷贝（同格式直接传递） |
| 传输协议 | TCP / 专有 | gRPC (HTTP/2) |
| 跨语言 | 需要对应驱动 | 任意语言只要有 Arrow 库 |
| 流式传输 | 支持但需逐行读取 | 原生支持 RecordBatch 流 |
| 预处理语句 | 标准 API | 通过 Handle 机制实现 |

## 八、总结

Arrow Flight SQL 的核心价值可以用一句话概括：

> **让 SQL 查询结果以标准化的列式内存格式在网络中流动。**

它不取代数据库，不取代 SQL 语言，而是在"数据库"和"查询引擎"之间铺了一条高速公路——这条路的标准集装箱就是 Arrow。

对零基础学习者的关键 takeaway：
- Arrow 解决了"数据在不同系统间传递时的格式统一"问题
- Flight SQL 解决了"SQL 查询结果如何高效跨网络传输"问题
- 零拷贝的核心是"格式不变，直接传递"
- 生态正在快速增长，DuckDB 和 DataFusion 是两个最容易上手的切入点

## 九、进一步学习建议

1. 本地跑一个 DuckDB 的 Flight SQL 服务器（`pip install duckdb` + `duckdb --flight`）
2. 用上面示例 1 的 Python 代码连上去执行查询
3. 阅读 Apache Arrow Flight SQL 官方规范：arrow.apache.org/docs/format/FlightSql.html
4. 尝试 DataFusion（Rust）：https://datafusion.apache.org/
