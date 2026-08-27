# debug + loglevel source review (writer EN)

> Purpose: record the pinned source inputs used to create the `debug` and `loglevel` project notes. The notes are the knowledge source of truth; this file only supplies review-receipt provenance. The `-en` suffix marks the 2026-08-27 parallel writer EN and avoids colliding with other same-day review documents.

## Scope and boundary

- review date: 2026-08-27
- writer: PARALLEL writer EN
- evidence: GitHub metadata, npm package metadata, pinned-commit static source and tests
- not executed: dependencies were not installed; upstream tests, browsers, bundle, and performance benchmarks were not run
- worktrees: local `research-worktrees/` (gitignored), not committed
- pair: target `debug` + `loglevel`; `pino` / `winston` were excluded by the writer contract

## debug

- canonical source: `https://github.com/debug-js/debug`
- git tag: annotated `4.4.3` → `e61ab962882930ec7dbae02068577bafd804faf6` peels to commit `6b2c5fbdb7d414483d9e306ef234acb4cd7ea67c`
- package: `debug@4.4.3` (MIT), `engines.node >= 6.0`
- npm: `debug@4.4.3` latest; `gitHead` equals the peeled tag commit
- dependency: runtime `ms@^2.1.3`; optional peer `supports-color`
- inspected:
  - `package.json`
  - `src/index.js`
  - `src/common.js`
  - `src/node.js`
  - `src/browser.js`
  - `README.md`
  - `test.js`
- observed:
  - `src/index.js` loads `browser.js` when `process` is missing, or when `process.type === 'renderer'`, `process.browser === true`, or `process.__nwjs`; otherwise it loads `node.js`;
  - both implementations call `require('./common')(exports)`; `setup()` attaches `enable` / `disable` / `enabled` / `formatters` and immediately `enable(load())`;
  - `createDebug(namespace)` returns a function; `enabled` is a getter that caches `createDebug.enabled(namespace)` until `createDebug.namespaces` changes, and a setter that stores a per-instance override;
  - a disabled call returns before coerce / formatters / `formatArgs` / `log`;
  - `enable()` persists via env-specific `save()`, then splits the string on commas after collapsing whitespace, sending `-prefix` tokens to `skips` and the rest to `names`;
  - matching uses `matchesTemplate()` (character walk with `*` backtracking), not `RegExp`; skips win;
  - Node `log` writes `util.formatWithOptions(inspectOpts, ...args) + '\n'` to `process.stderr`; `save` / `load` use `process.env.DEBUG`;
  - Node `inspectOpts` is built from `DEBUG_*` env keys; `useColors` prefers `inspectOpts.colors`, else `tty.isatty(process.stderr.fd)`;
  - Node formatters: `%o` single-line `util.inspect`, `%O` multi-line; leftover `%s` / `%d` / `%j` fall through to `util.formatWithOptions`;
  - browser `log` is `console.debug || console.log || noop`; `save` / `load` use `localStorage` keys `debug` then `DEBUG`, then Electron `process.env.DEBUG`;
  - browser formatter `%j` is `JSON.stringify` with a catch string;
  - `coerce()` replaces `Error` with `stack || message`;
  - `extend(namespace, delimiter)` defaults the delimiter to `:`; the child copies `this.log`;
  - `destroy()` is a deprecated no-op stub;
  - README claim that a namespace ending in `*` is always enabled regardless of `DEBUG` is not implemented in this revision.
- provenance: annotated tag `4.4.3`, package version, and npm `gitHead` agree on `6b2c5fbdb7d414483d9e306ef234acb4cd7ea67c`.

## loglevel

- canonical source: `https://github.com/pimterry/loglevel`
- git tag: annotated `v1.9.2` → `2f3fec2a6642f7137eb35d7fbda8ace580494ca5` peels to commit `40d10ef1917710afcc70b5f2115bb336ab4b0580`
- package: `loglevel@1.9.2` (MIT), `engines.node >= 0.6.0`, zero runtime dependencies
- npm: `loglevel@1.9.2` latest; `gitHead` equals the peeled tag commit
- inspected:
  - `package.json`
  - `lib/loglevel.js`
  - `index.d.ts`
  - `README.md`
  - `test/level-setting-test.js`
  - `test/multiple-logger-test.js`
  - `test/method-factory-test.js`
- observed:
  - UMD wrapper exports AMD, CommonJS, or global `log`; the root object also has a `default` property for ES-module interop;
  - levels are `TRACE=0`, `DEBUG=1`, `INFO=2`, `WARN=3`, `ERROR=4`, `SILENT=5`; a new logger inherits the root level or `WARN`;
  - `setLevel` stores `userLevel`, persists unless `persist === false`, then `replaceLoggingMethods()` assigns `noop` when `i < level` and `methodFactory(...)` otherwise;
  - `this.log` is always aliased to `this.debug` after replacement;
  - `realMethod('debug')` remaps the name to `'log'` before looking up `console`, so `log.debug` binds `console.log`, not `console.debug`;
  - enabled methods prefer `Function.prototype.bind` so the console stack points at the call site;
  - persistence key is `loglevel` or `loglevel:<name>`; localStorage first, then a session cookie; Node and Symbol-named loggers skip persistence;
  - `setDefaultLevel` writes `defaultLevel` and only calls `setLevel(level, false)` when nothing is persisted;
  - `resetLevel` clears `userLevel` and persisted storage, then rebuilds methods;
  - `getLogger(name)` requires a non-empty string or symbol; the same string returns the same instance from `_loggersByName`;
  - `setLevel` on the root does **not** rebuild existing children (source comment: intended for v2); callers must `rebuild()`;
  - `rebuild()` on the root copies `defaultLogger.getLevel()` into each child's `inheritedLevel` unless that child has `userLevel` / `defaultLevel`;
  - `methodFactory` is the plugin hook; changing it requires `rebuild()`;
  - README size / gzip claims and “debug goes to console.debug if possible” are not treated as facts for this pin.
- provenance: annotated tag `v1.9.2`, package version, and npm `gitHead` agree on `40d10ef1917710afcc70b5f2115bb336ab4b0580`.
