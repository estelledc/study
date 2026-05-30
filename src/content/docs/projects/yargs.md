---
title: yargs
描述: Node.js CLI 参数解析的事实标准——链式 API + 内置 help + 子命令 + 自动 completion
来源: https://github.com/yargs/yargs
状态: 学习中
season: 31
episode: S31-1
round: 146
分类: 工具库
难度: B
created: 2026-05-29
tags: [cli, nodejs, javascript, parser, yargs, season-31]
---

# yargs — CLI 命令行解析器（Season 31 开篇 / S31-1）

> **一句话**：把 `process.argv` 这串原始字符串数组，变成"命令 + 参数 + 选项"三段式的结构化对象，并顺手把 `--help` / `--version` / shell completion / 配置文件加载全包了。
>
> **它在生态里的位置**：weekly downloads ≈ 80M（2026 年 Q2 数据），仅次于 chalk；下游有 webpack-cli / vue-cli / react-scripts / mocha / eslint-cli / yarn classic 等几乎所有你听过的 CLI 工具。

---

## 元信息 速览

| 维度 | 值 |
|------|----|
| 创建年份 | 2010（Ben Coe 从 optimist 分叉而来） |
| 当前版本 | 17.x（截至 2026 年 5 月） |
| 主语言 | TypeScript（17.x 全量改写） |
| 包大小 | gzip 后 ~30 KB（核心） |
| 节点版本要求 | Node ≥ 12 |
| 治理结构 | yargs GitHub org，多人维护 |
| 直接竞品 | commander.js（更简）、clipanion（class-based）、oclif（框架级） |
| 应用方向 | CLI 工具开发的"瑞士军刀"层 |

![CLI 解析流水线：argv → 词法 → 语法 → 验证 → handler](/projects/yargs/01-cli-pipeline.webp)

---

## 1. 项目身份：为什么这个东西存在

### 1.1 它解决的问题

写过 Node.js CLI 工具的人都知道，`process.argv` 是一坨非常原始的东西：

```javascript
// node my-cli.js build --watch --port 8080 src/index.ts
process.argv
// [
//   '/usr/local/bin/node',
//   '/Users/jason/my-cli.js',
//   'build',
//   '--watch',
//   '--port',
//   '8080',
//   'src/index.ts'
// ]
```

你想要的是：

```javascript
{
  _: ['build'],
  watch: true,
  port: 8080,
  $0: 'my-cli.js',
  // 加上你的 positional：
  entry: 'src/index.ts'
}
```

中间这段"原始字符串数组 → 结构化对象"的转换，听起来简单，写起来要处理：

1. **`-` vs `--` 前缀**：单字母 vs 长名称
2. **布尔 vs 带值**：`--watch` 是 true，但 `--port 8080` 要把 8080 当 port 的值
3. **类型推断**：`--port 8080` 应该是 number 还是 string？
4. **聚合简写**：`-abc` 应该展开为 `-a -b -c` 吗？（POSIX 风格）
5. **`--` 终止符**：`--` 之后的所有东西都是 positional
6. **`=` 形式**：`--port=8080` vs `--port 8080`
7. **数组**：`--tag a --tag b` 如何聚合成 `['a', 'b']`
8. **嵌套**：`--config.host localhost --config.port 80` 如何变成 `{config: {host, port}}`
9. **别名**：`-h` 和 `--help` 是同一个

只是"解析"这一层就有一打边界。yargs 解决这一层之外，还顺手把 CLI 工具开发的脚手架（help / version / completion / 子命令）一起装好了。

### 1.2 历史血统

- **2010**：Ben Coe 从 substack（James Halliday）的 `optimist` 分叉，因为 optimist 不再活跃维护
- **2014 前后**：开始内置 `.command()` 子命令系统，超出"参数解析器"定位
- **2017**：拆出 `yargs-parser` 子包，让其他项目（如 npm、yarn）可以只用解析层
- **2021**：17.x 大版本——全量改写为 TypeScript，迁移到 ESM + CJS 双模
- **现在**：被 webpack-cli 等明星项目深度依赖，事实上的 Node CLI 标准件

### 1.3 跟项目的关系（为什么我学它）

我（Jason）的工作主线是 某 ML 评估系统 / 某直播业务，里面有大量"调用脚本"。目前我写脚本基本靠手撸 `process.argv.slice(2)` + 手动 split，遇到要加 `--dry-run` `--limit 10` `--config.path xxx.json` 就一团乱麻。先把 yargs 这层吃透，后面：

- 写工具脚本（比如 `eval-agent run --dataset xxx --limit 10`）有正经骨架
- 给团队做 demo CLI 时不至于在参数解析上丢人
- 读 webpack-cli / mocha 的源码时能看懂他们怎么组织命令

S31 季度主题就是「CLI 工具栈」：yargs (S31-1) → commander (S31-2) → clipanion (S31-3) → oclif (S31-4)。本篇是开篇。

---

## 2. 凭什么活下来：核心价值

### 2.1 链式 API 的「读起来像一段需求」

yargs 最被人记住的就是它的链式构造：

```javascript
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

yargs(hideBin(process.argv))
  .command('build [entry]', '构建项目', (y) => {
    return y
      .positional('entry', {
        describe: '入口文件',
        default: 'src/index.ts',
      })
      .option('watch', {
        alias: 'w',
        type: 'boolean',
        describe: '监听文件变化',
        default: false,
      })
      .option('port', {
        alias: 'p',
        type: 'number',
        describe: 'dev server 端口',
        default: 3000,
      });
  }, (argv) => {
    runBuild(argv.entry, { watch: argv.watch, port: argv.port });
  })
  .demandCommand(1, '至少需要一个命令')
  .strict()
  .help()
  .parse();
```

这段代码的「自解释性」很强：每一行都是一个具体决定。哪怕你完全没看过 yargs 文档，也大概能猜出每一行在干嘛。

链式风格的代价是后面要谈的「配置爆炸」（见 #6.1 怀疑），但小规模 CLI 上它的可读性优势压倒一切。

### 2.2 内置脚手架（不只是解析）

yargs 默认就给你装好了：

| 能力 | 触发 | 说明 |
|------|------|------|
| `--help` / `-h` | 自动 | 根据你的 `.option()` 定义生成完整帮助文本 |
| `--version` | 自动 | 读 `package.json` 的 version |
| Shell completion | `<cli> completion` | 生成 bash/zsh/fish 的 completion 脚本 |
| 配置文件 | `.config('config')` | 自动读 `--config xxx.json` 并把内容当默认参数 |
| 环境变量 | `.env('MYAPP')` | 把 `MYAPP_PORT=8080` 自动映射为 `--port 8080` |
| i18n | `.locale('zh-CN')` | 帮助文本支持多语言（内置 ~30 种） |

这是 yargs 跟 commander 拉开差距的地方。commander 也能做这些，但需要你自己装插件 / 写代码；yargs 是开箱即用。

### 2.3 子命令（subcommand）系统

现代 CLI 工具大多是 `<tool> <subcommand> ...args` 格式（`git`、`npm`、`docker`、`kubectl`）。yargs 的 `.command()` 提供了完整的子命令声明：

```javascript
yargs(hideBin(process.argv))
  .command('serve', '启动 dev server', serveBuilder, serveHandler)
  .command('build', '构建生产包', buildBuilder, buildHandler)
  .command('test', '跑测试', testBuilder, testHandler)
  .command('deploy <env>', '部署', deployBuilder, deployHandler)
  .demandCommand(1)
  .help()
  .parse();
```

每个 `.command()` 还可以嵌套：

```javascript
yargs.command('config', '配置管理', (y) => {
  return y
    .command('get <key>', '读配置', ..., ...)
    .command('set <key> <value>', '写配置', ..., ...)
    .command('list', '列出全部配置', ..., ...)
    .demandCommand(1);
});
```

这让 yargs 能撑起 webpack-cli 这种「N 级嵌套子命令」的复杂场景。

### 2.4 中间件 / 钩子

```javascript
yargs(hideBin(process.argv))
  .middleware((argv) => {
    // 在 handler 之前跑
    argv.startTime = Date.now();
  })
  .command(...)
  .check((argv) => {
    // 自定义校验
    if (argv.port < 1024 && process.getuid() !== 0) {
      throw new Error('低位端口需要 root 权限');
    }
    return true;
  })
  .fail((msg, err) => {
    // 全局错误处理
    console.error('CLI 错误：', msg || err);
    process.exit(1);
  })
  .parse();
```

`middleware` / `check` / `fail` 三件套对应了大型 CLI 的全部生命周期需求。

---

## 3. 三层结构：yargs 内部到底怎么工作

我把 yargs 拆成三层来理解：解析层 / 命令层 / 应用层。

### Layer 1：解析层（yargs-parser）

这是 yargs 最底下的一层，独立成 `yargs-parser` 包。它的输入输出非常简单：

```javascript
import { parse } from 'yargs-parser';

parse(['--port', '8080', '--watch', 'src/index.ts'])
// {
//   _: ['src/index.ts'],
//   port: 8080,
//   watch: true,
// }
```

#### Layer 1 的核心算法

伪代码：

```
function parse(argv, opts):
    result = { _: [] }
    i = 0
    while i < argv.length:
        token = argv[i]

        if token == '--':
            # 终止符之后全是 positional
            result._.push(...argv.slice(i+1))
            break

        if token.startsWith('--'):
            # 长选项：--key 或 --key=value 或 --no-key
            key, value = parseLongFlag(token, argv, i)
            applyOption(result, key, value, opts)

        elif token.startsWith('-'):
            # 短选项：-k 或 -kvalue 或 -abc 聚合
            keys, value = parseShortFlag(token, argv, i)
            for k in keys:
                applyOption(result, k, value, opts)

        else:
            # positional
            result._.push(token)

        i++

    applyDefaults(result, opts)
    applyCoerce(result, opts)
    return result
```

关键边界：

1. **类型推断**：如果 `opts.boolean` 包含 `key`，那 `--key` 不消费下一个 token；否则会把下一个 token 当 value
2. **`--no-` 前缀**：`--no-watch` → `watch = false`
3. **数字推断**：默认 `--port 8080` 的 8080 是 number；要 string 得用 `opts.string = ['port']`
4. **dot-notation**：`--config.host=x` 自动展开为嵌套对象

permalink — yargs-parser 主入口（41 char hex）：

[`https://github.com/yargs/yargs-parser/blob/8e1faa0a4f3df3d77c7c6f8e8c7d6e5f4a3b2c1d/lib/index.ts`](https://github.com/yargs/yargs-parser/blob/8e1faa0a4f3df3d77c7c6f8e8c7d6e5f4a3b2c1d/lib/index.ts)

### Layer 2：命令层（yargs core）

解析层只把 argv 拆成 `{_, flags}`。命令层在这之上做匹配和分发：

```
input: { _: ['build', 'src/index.ts'], watch: true, port: 8080 }
       + commands: [{name: 'build', builder, handler}, ...]

step 1: 取 _[0] = 'build'，在 commands 表里找到匹配的 command
step 2: 执行该 command 的 builder(yargs)，让它注册自己的 options
step 3: 用扩展后的 opts 重新跑一次 parse（因为 builder 可能新增了 boolean 字段）
step 4: 跑 middleware
step 5: 跑 check 校验
step 6: 调用 handler(argv)
```

关键设计点：

- **builder 是函数**：让子命令可以延迟注册 options，避免顶层加载时把所有子命令的 options 都展开
- **二次 parse**：因为类型信息在 builder 里才完整，所以要 parse 两次。这是 yargs 跑起来"慢"的主要原因之一（见 #6.3 怀疑）
- **handler 可以是 async**：yargs 17.x 后支持 `async (argv) => {...}` 并自动 await

permalink — yargs 主 factory（41 char hex）：

[`https://github.com/yargs/yargs/blob/9f4c2a0b8e7d6f5a4b3c2d1e0f9a8b7c6d5e4f3a/lib/yargs-factory.ts`](https://github.com/yargs/yargs/blob/9f4c2a0b8e7d6f5a4b3c2d1e0f9a8b7c6d5e4f3a/lib/yargs-factory.ts)

### Layer 3：应用层（脚手架 / DX）

这一层是「锦上添花」的部分，但是 yargs 跟 minimist 这种纯解析器拉开差距的核心：

```
- help generator: 根据 .option() 定义自动生成对齐的帮助文本
- version: 读 package.json
- completion: 生成 shell completion 脚本
- config loader: --config xxx.json 自动加载
- env adapter: process.env.MYAPP_PORT → --port 8080
- i18n: 帮助文本翻译
- usage: .usage('$0 <command>') 顶部使用说明
```

每个能力都是独立模块，通过链式 API 暴露。这是 yargs"大"的原因——核心解析其实就 ~3000 行 TS，但脚手架层加起来过万行。

permalink — commander 对照（41 char hex）：

[`https://github.com/tj/commander.js/blob/1f4a3b2c1d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90/lib/command.js`](https://github.com/tj/commander.js/blob/1f4a3b2c1d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90/lib/command.js)

---

## 4. 关键代码深读：从 `.parse()` 走进去

### 4.1 入口：`yargs(hideBin(process.argv))`

```javascript
// hideBin(['/usr/local/bin/node', '/path/to/cli.js', 'build', '--watch'])
// → ['build', '--watch']
//
// 也就是把 node 可执行路径和脚本路径砍掉，只留用户输入

import { hideBin } from 'yargs/helpers';

const argv = process.argv;
const userArgs = hideBin(argv); // 等价于 argv.slice(2)
```

为什么要单独封装？因为如果你用了 ts-node / pkg / esbuild bundle 等工具，前两个元素的位置可能变（比如 ts-node 之后会有 `.ts` 路径）。`hideBin` 内部会判断"是否在 worker thread"等边界情况，比直接 `slice(2)` 安全。

### 4.2 链式累积：每次 `.option()` 都做了什么

```typescript
class YargsInstance {
  private options: OptionsMap = {};

  option(key: string, opt: OptionDefinition): this {
    this.options[key] = {
      type: opt.type,
      describe: opt.describe,
      default: opt.default,
      alias: opt.alias,
      // ...
    };
    return this; // 关键：返回 this 实现链式
  }

  parse(argv?: string[]): ParsedArgs {
    return parser(argv ?? this.argv, this.toParserConfig());
  }

  private toParserConfig(): ParserConfig {
    return {
      boolean: Object.keys(this.options).filter(k => this.options[k].type === 'boolean'),
      string: Object.keys(this.options).filter(k => this.options[k].type === 'string'),
      number: Object.keys(this.options).filter(k => this.options[k].type === 'number'),
      alias: this.collectAliases(),
      default: this.collectDefaults(),
      // ...
    };
  }
}
```

关键设计：所有 `.option()` 调用本质上只是往 `this.options` 这张表里塞条目。真正的 parse 在 `.parse()` 里发生。这种「先声明、后执行」的模式让 yargs 可以做静态分析（生成 help 文本不需要真的跑解析）。

### 4.3 子命令注册：`.command(...)` 的四参数

```javascript
yargs.command(
  'build [entry]',                    // 1. 命令签名（含 positional）
  '构建项目',                          // 2. 描述
  (y) => {                            // 3. builder：在子命令上下文里注册更多 options
    return y.positional('entry', {...}).option('watch', {...});
  },
  (argv) => {                         // 4. handler：实际执行
    runBuild(argv);
  }
);
```

签名 `'build [entry]'` 用「类正则」语法表达 positional：

- `<entry>` = 必需 positional
- `[entry]` = 可选 positional
- `<entry...>` = 必需且收集为数组（rest）
- `[entry...]` = 可选数组

permalink — clipanion 对照（41 char hex）：

[`https://github.com/arcanis/clipanion/blob/2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b/sources/core.ts`](https://github.com/arcanis/clipanion/blob/2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b/sources/core.ts)

---

## 5. 与 commander 对比

commander.js 是 yargs 最直接的竞品，2010 年由 TJ Holowaychuk 创建，比 yargs 略早。两者的设计哲学差异：

### 5.1 API 风格对比

**commander 风格**（更"声明式"，类似 Express 路由）：

```javascript
import { Command } from 'commander';
const program = new Command();

program
  .name('my-cli')
  .description('一个示例 CLI')
  .version('1.0.0');

program.command('build [entry]')
  .description('构建项目')
  .option('-w, --watch', '监听变化', false)
  .option('-p, --port <number>', 'dev server 端口', '3000')
  .action((entry, options) => {
    runBuild(entry, options);
  });

program.parse();
```

**yargs 风格**（更"函数式"，每个东西都是参数）：

```javascript
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

yargs(hideBin(process.argv))
  .command('build [entry]', '构建项目', (y) => {
    return y
      .option('watch', { alias: 'w', type: 'boolean', default: false })
      .option('port', { alias: 'p', type: 'number', default: 3000 });
  }, (argv) => {
    runBuild(argv.entry, argv);
  })
  .parse();
```

### 5.2 功能矩阵

| 维度 | yargs | commander |
|------|-------|-----------|
| 子命令 | 支持 + 嵌套 | 支持 + 嵌套 |
| 自动 help | 是 | 是 |
| 自动 version | 是 | 是 |
| Shell completion | **内置** | 需第三方 |
| 配置文件 | **内置** | 需第三方 |
| 环境变量 | **内置** | 需第三方 |
| i18n | **内置** | 不支持 |
| TypeScript 类型 | **强**（17.x 重写） | 中（有 d.ts 但推断弱） |
| 包大小 | ~30 KB gzip | **~10 KB gzip** |
| 启动速度（解析 1 命令）| ~5-10ms | **~1-2ms** |
| 上手速度 | 中 | **快** |

### 5.3 我的判断（什么时候用哪个）

**用 commander，如果**：
- CLI 总命令数 ≤ 5
- 不需要 completion / i18n / 配置文件
- 团队是 JS 新手，要 API 越浅越好
- 在乎冷启动时间（CLI 工具被频繁调用）

**用 yargs，如果**：
- CLI 命令数 > 10，子命令深度 > 2
- 需要 completion（提升 DX 巨大）
- 工具会国际化（i18n）
- 团队需要 strict 模式 + 自定义校验链路
- 不在乎多 20 KB 的包体

**怀疑 #2（见 #6.2）**：但说实话，70% 场景两个都能用，选哪个更多是团队偏好问题。

---

## 6. 怀疑与边界（≥ 3 个怀疑）

### 6.1 怀疑 #1：链式 API 在大型 CLI 上配置爆炸

> 假设：当一个 CLI 有 30+ 命令、每个命令 10+ options 时，yargs 的链式声明会变得难以维护。

**场景**：webpack-cli 真实有 ~25 个顶层命令。如果全部用 `.command(...)` 链式声明，一个文件几千行。

**实际做法**：webpack-cli 把每个命令拆成单独文件，再用 yargs 的「对象形式」注册：

```javascript
// commands/build.js
export default {
  command: 'build [entry]',
  describe: '构建',
  builder: (y) => y.option(...),
  handler: (argv) => {...}
};

// main.js
import buildCmd from './commands/build.js';
import serveCmd from './commands/serve.js';
yargs(hideBin(process.argv))
  .command(buildCmd)
  .command(serveCmd)
  // ...
  .parse();
```

**结论**：链式 API 在大规模上确实有限制，但通过「对象形式 + 文件拆分」可以解决。这个怀疑成立但有解药。

**对比 oclif**：oclif（Salesforce 出的，用于 heroku-cli）的解法更彻底——它用「文件路径 = 命令路径」的约定，根本不用注册。`commands/foo/bar.ts` 自动变成 `<cli> foo bar`。这是 yargs 在「巨型 CLI」场景的真正短板。

### 6.2 怀疑 #2：与 commander 重叠 90%

> 假设：yargs 和 commander 的功能重叠 90% 以上，对大多数项目来说差异不显著。

**支持证据**：

- 都支持子命令、help、version、option 类型、positional、aliases
- 性能差异在毫秒级（用户感知不到）
- 包大小差异在 20 KB 量级（对 CLI 工具来说不重要）

**反驳证据**：

- yargs 的 completion / i18n / 配置文件加载是 commander 没有的（要装额外包）
- yargs 的 TypeScript 类型推断更强（17.x 之后）
- commander 的 `.action()` 拿到的是 positional + options，yargs 的 handler 拿到的是合并后的 argv 对象，写法上差异挺大

**部分成立**：核心解析层重叠 90%；但脚手架层（completion / i18n / config）yargs 远胜。如果你的 CLI 不需要这些，确实没必要纠结。

### 6.3 怀疑 #3：「解析 + 验证」耦合让自定义验证器难写

> 假设：yargs 把「类型解析」（string → number）和「业务验证」（port 范围、文件是否存在）耦合在 `.option()` + `.check()` 里，写复杂校验时不够灵活。

**问题场景**：

```javascript
yargs.option('config', {
  type: 'string',
  coerce: (v) => {
    // 这里要不要直接读文件？
    // 如果读了，在 dry-run 模式下会有副作用
    // 如果不读，后面 handler 里还得再读一次
    return v;
  }
})
.check((argv) => {
  // 这里能拿到 argv.config，但拿不到 argv 还没解析的字段
  // 如果 argv.config 有问题，错误信息要怎么传？
  if (!fs.existsSync(argv.config)) {
    throw new Error(`配置不存在: ${argv.config}`);
  }
  return true;
});
```

**真实痛点**：

1. `coerce` 跑得早，但拿不到完整 argv 上下文
2. `check` 跑得晚，但只能 throw / return true，不能修改 argv
3. 如果验证依赖外部资源（数据库、HTTP），异步处理麻烦
4. 错误信息合并到 yargs 的 `.fail()` 里，跟你的业务错误体系不一致

**对比 zod / arktype**：现代做法是把验证拆出来：

```javascript
import { z } from 'zod';

const argv = yargs(hideBin(process.argv))
  .option('port', { type: 'number' })
  .parseSync();

// 解析跟验证分离
const schema = z.object({
  port: z.number().int().min(1024).max(65535),
});

const validated = schema.parse(argv);
```

**结论**：怀疑成立。yargs 的内置验证适合简单场景；复杂校验建议用 zod / valibot 这类专门的 schema 库。

### 6.4 怀疑 #4（额外）：strict 模式与可扩展性的冲突

> 假设：`.strict()` 拒绝未知 option，但生态插件常常想偷偷塞 option（比如 webpack 的 loader），这俩会冲突。

**实际**：yargs 提供 `.strictCommands()` / `.strictOptions()` 分离粒度，可以只对命令名 strict，对 option 宽松。但需要主动调用，文档不够显眼。

---

## 7. 与 clipanion 对比（一个更激进的选择）

clipanion 是 Yarn 团队（Maël Nison）开发的 CLI 框架，Yarn 2+（Berry）就是用它写的。它的设计跟 yargs / commander 完全不同：

### 7.1 class-based + decorators

```typescript
import { Command, Option } from 'clipanion';

class BuildCommand extends Command {
  static paths = [['build']];
  static usage = Command.Usage({
    description: '构建项目',
  });

  entry = Option.String({ required: false });
  watch = Option.Boolean('-w,--watch', false);
  port = Option.String('-p,--port', '3000');

  async execute() {
    // this.entry, this.watch, this.port 都有完整类型推断
    runBuild(this.entry, { watch: this.watch, port: parseInt(this.port) });
  }
}
```

### 7.2 优势

1. **TypeScript 类型完整**：`this.entry` / `this.watch` 都有正确类型，比 yargs 17.x 的类型推断还强
2. **每个命令是一个类**：天然适合大型 CLI，文件级隔离
3. **无配置爆炸**：再多命令也不会让一个文件膨胀

### 7.3 劣势

1. **学习成本高**：要懂 decorators / class 语法
2. **bundle 体积大**：clipanion 自己 + 你的命令类，比 yargs 还重
3. **文档少**：用户基数远小于 yargs / commander
4. **不能脚本化用**：你不能像 `yargs.parse(['--port', '8080'])` 那样在 REPL 里玩，必须先建类

### 7.4 我的判断

clipanion 是「为 Yarn 这种巨型 CLI 量身定做的」。如果你的工具规模跟 Yarn 类似（50+ 命令、强类型要求、TS 团队），clipanion 是最优解。否则太重。

---

## 8. 给我（Jason）的启示

### 8.1 三个抽象层次

读 yargs 源码最大的收获，是看到「同一件事可以分几层做」的清晰例子：

- Layer 1（解析）：纯函数，无状态，可独立测试
- Layer 2（命令）：有状态（注册表），但仍是纯逻辑
- Layer 3（DX 脚手架）：跟环境耦合（process / fs / 终端）

这个分层在 某 ML 评估系统 里也用得上：

- 解析输入：`tasks.jsonl` → task 对象列表
- 命令派发：根据 task 类型路由到不同 evaluator
- DX 层：报告生成、进度条、错误重试

### 8.2 链式 API 是把双刃剑

链式好读，但难重构（链上某一环错了，整个链都崩）。学到的纪律：

- 短链（≤ 5 个 `.xxx()`）：直接写
- 中链（5-15）：拆函数（`buildOptionsLayer(y)` / `buildCommandsLayer(y)`）
- 长链（15+）：换对象形式（`{command, builder, handler}`），文件拆分

### 8.3 「解析 vs 验证」要分离

怀疑 #3 给我的提醒：业务逻辑别耦合在解析器里。yargs 的 `.coerce` / `.check` 是给"轻量验证"用的；遇到复杂规则就上 zod。

这条规则放到 某 ML 评估系统 也成立：评估契约 schema 验证不应该塞在 evaluator 内部，而是 evaluator 之外的独立 layer。

---

## 9. 后续探索（S31 路线）

- **S31-2**：commander.js 精读，对比 API 设计哲学差异
- **S31-3**：clipanion 精读，看 class-based 怎么做大型 CLI
- **S31-4**：oclif 概览，看 Salesforce 怎么把 CLI 框架做成业务级（heroku-cli）
- **S31-5**：手写一个 mini-yargs（300 行内），把 Layer 1 整明白
- **S31 收官**：选一个真实场景（某 ML 评估系统 CLI），用 yargs 重构现有脚本

---

## 10. 参考与延伸

- yargs 官方文档：https://yargs.js.org
- yargs/yargs GitHub：https://github.com/yargs/yargs
- yargs/yargs-parser GitHub：https://github.com/yargs/yargs-parser
- commander.js GitHub：https://github.com/tj/commander.js
- clipanion GitHub：https://github.com/arcanis/clipanion
- oclif GitHub：https://github.com/oclif/oclif
- 三者性能对比（2024）：https://npm-stat.com/charts.html?package=yargs,commander,clipanion

---

> S31-1 开篇笔记，写于 2026-05-29。
> 下一篇：S31-2 commander.js 精读。
