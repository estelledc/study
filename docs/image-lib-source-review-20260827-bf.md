# Image library source review BF

> 用途：记录 sharp、jimp 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer BF
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- forbidden overlap：未修改 three、pixi、vips、pillow、imagemagick、fabric-js、konva 或其他开放 PR slug

## sharp

- canonical source：`https://github.com/lovell/sharp`
- revision：`7f1a0a22cc285fe180766f4935d50b55af6e8432`
- release tag / package：`v0.35.4` / `sharp@0.35.4`
- inspected：
  - `package.json`
  - `lib/index.mjs`
  - `lib/constructor.mjs`
  - `lib/input.mjs`
  - `lib/resize.mjs`
  - `lib/operation.mjs`
  - `lib/output.mjs`
  - `lib/utility.mjs`
  - `lib/composite.mjs`
  - `lib/index.d.ts`
- observed：
  - `Sharp` extends Node `stream.Duplex`; constructor methods mutate `this.options` and return `this`;
  - `clone()` is the documented way to snapshot options into a new instance (`structuredClone` of options, shared input);
  - chaining records a pipeline; `_pipeline()` is the first call into the native `sharp.pipeline(options, cb)`;
  - `toFile` / `toBuffer` / `toUint8Array` / first `_read()` of a piped instance all invoke `_pipeline`;
  - `toFile` rejects when resolved input and output paths are the same;
  - default output strips metadata, including EXIF orientation, unless `keepMetadata` / `withMetadata` / `keepExif` is used;
  - `rotate()` without an angle calls `autoOrient()` for compatibility; preferred explicit API is `.autoOrient()`;
  - only one `rotate(angle)` is kept per pipeline; a later call logs and replaces the previous angle;
  - `autoOrient` is also a constructor option defaulting to `false`;
  - `resize` default `fit` is `cover` (internal canvas `crop`); other fits are `contain`/`fill`/`inside`/`outside`;
  - `limitInputPixels` defaults to `268402689` (`0x3FFF * 0x3FFF`); `failOn` defaults to `warning`;
  - `sequentialRead` defaults to `true`;
  - libvips operation cache defaults to 50MB / 20 files / 100 items;
  - per-image libvips concurrency defaults to CPU count, except glibc-without-jemalloc defaults to `1`;
  - `timeout({ seconds })` stores `timeoutSeconds` in the range 0–3600;
  - package `engines.node` is `>=20.9.0`; `config.libvips` is `>=8.18.6`;
  - optionalDependencies cover darwin/linux/musl/win32/freebsd-wasm32/webcontainers-wasm32 binaries plus matching `@img/sharp-libvips-*@1.3.3`;
  - Web Streams example uses `Duplex.toWeb` and documents Node `>=24.15.0`.
- provenance：
  - GitHub tag `v0.35.4` commit `7f1a0a22cc285fe180766f4935d50b55af6e8432`;
  - npm `sharp@0.35.4` `gitHead` is the same SHA;
  - package.json version at that commit is `0.35.4`.

## jimp

- canonical source：`https://github.com/jimp-dev/jimp`
- revision：`7e6a95694e00a8b6f1bdd9aad709f5413eb9b08c`
- release tag / package：`v1.6.1` / `jimp@1.6.1`
- inspected：
  - `package.json`
  - `packages/jimp/package.json`
  - `packages/jimp/src/index.ts`
  - `packages/core/package.json`
  - `packages/core/src/index.ts`
  - `packages/core/src/utils/image-bitmap.ts`
  - `packages/file-ops/src/index.ts`
  - `packages/file-ops/package.json`
  - `packages/types/src/index.ts`
  - `plugins/plugin-resize/src/index.ts`
  - `plugins/plugin-blur/src/index.ts`
  - `plugins/plugin-color/src/index.ts`
  - `plugins/js-png/package.json`
  - `plugins/js-jpeg/package.json`
  - `plugins/wasm-webp/package.json`
- observed：
  - default `Jimp` is `createJimp({ formats: defaultFormats, plugins: defaultPlugins })`;
  - default formats are bmp / msBmp / gif / jpeg / png / tiff; WebP/AVIF live in separate `@jimp/wasm-*` packages and are not wired into the convenience export;
  - constructor accepts `{ width, height, color? }` or a bitmap; empty images allocate `Buffer.alloc(width * height * 4)`;
  - plugin wrappers mutate `this.bitmap` and return `this` when the plugin returns an object with `bitmap`;
  - `resize` plugin accepts `{ w, h?, mode? }` (or height-only); positional `resize(w, h)` is not in the plugin schema;
  - `blur(r)` is Superfast Blur / FastBlur.js (Mario Klingemann), not StackBlur;
  - `greyscale()` uses Rec. 709 coefficients `0.2126 / 0.7152 / 0.0722`, not a plain RGB average;
  - `clone()` constructs a new instance with `Buffer.from(bitmap.data)`;
  - `Jimp.read(path)` uses `existsSync` then `readFile`; otherwise it `fetch`es the string as URL;
  - `fromBuffer` uses `file-type` to pick MIME, then the matching format decoder, then `attemptExifRotate`;
  - `getBuffer(mime, options?)` encodes through the format plugin; non-alpha formats first composite onto `background`;
  - `write(path)` derives MIME from the path via `mime.getType`;
  - Node `@jimp/file-ops` re-exports `fs` `existsSync` / `readFile` / `writeFile`; package also publishes a browser export;
  - bitmap `data` is typed as `Buffer`; core still imports Node `Buffer`;
  - package and workspace `engines.node` are `>=18`;
  - convenience package author is Andrew Lisowski; workspace packageManager is `pnpm@9.9.0`.
- provenance：
  - GitHub tag `v1.6.1` commit `7e6a95694e00a8b6f1bdd9aad709f5413eb9b08c`;
  - npm `jimp@1.6.1` `gitHead` is the same SHA;
  - `packages/jimp/package.json` and `@jimp/core` at that commit are both `1.6.1`.
