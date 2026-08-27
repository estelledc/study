# Adaptive-video source review (writer ID)

> 用途：记录 hls.js、dash.js 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：ID
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、真实播放或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## hls.js

- canonical source：`https://github.com/video-dev/hls.js`
- revision：`565f70ee8e074a0fbe82ed80dfb7fac0697bbb8a`
- package：`hls.js@1.7.1`（源码 tag `v1.7.1`）
- inspected：
  - `package.json`
  - `src/version.ts`
  - `src/hls.ts`（constructor、attachMedia、loadSource、startLoad、recoverMediaError、destroy、currentLevel / nextLevel）
  - `src/is-supported.ts`
  - `src/config.ts`（hlsDefaultConfig）
  - `src/controller/abr-controller.ts`
  - `src/controller/error-controller.ts`
  - `src/controller/level-controller.ts`
  - `src/demux/transmuxer-interface.ts`
  - `src/errors.ts`
- observed：
  - annotated tag `v1.7.1` object is `cdc4f116c3b83c23fd6e47ecbd2ddc0a6b399092` and peels to the bound commit；
  - source `package.json` has no `version` field；`main` / `module` point at `dist/`；
  - npm `hls.js@1.7.1` `gitHead` matches the peeled commit；
  - `Hls.isSupported()` requires MSE plus baseline `isTypeSupported` codec checks；
  - `loadSource` emits `MANIFEST_LOADING` and may detach/reattach to rebuild MediaSource；
  - `currentLevel` setter calls `immediateLevelSwitch()`；`nextLevel` calls `nextLevelSwitch()`；
  - default `autoStartLoad=true`、`enableWorker=true`、`liveSyncDurationCount=3`、`abrEwmaDefaultEstimate=5e5`；
  - `ErrorController.onErrorOut` may call `recoverMediaError()` when `ResetMediaSource` is set, then `stopLoad()` on fatal.
- provenance split：none. tag peel and npm `gitHead` identify the same commit.

## dash.js

- canonical source：`https://github.com/Dash-Industry-Forum/dash.js`
- revision：`a9a8542cd7e6257116be4046ebf16ac49e1cec91`
- package：`dashjs@5.2.1`
- inspected：
  - `package.json`
  - `index.js`
  - `index_mediaplayerOnly.js`
  - `src/core/FactoryMaker.js`
  - `src/core/Settings.js`
  - `src/core/Version.js`
  - `src/streaming/MediaPlayer.js`（initialize、attachView、attachSource、updateSettings、reset、destroy）
  - `src/streaming/MediaPlayerFactory.js`
  - `src/streaming/constants/Constants.js`
  - `src/streaming/rules/abr/ABRRulesCollection.js`
- observed：
  - lightweight tag `v5.2.1` points directly at the bound commit；
  - `package.json` name is `dashjs` with `version=5.2.1` and `engines.node >= 20`；
  - npm `dashjs@5.2.1` does not publish `gitHead`；
  - `dashjs.MediaPlayer` is a FactoryMaker class factory；`initialize` aborts without MediaSource；
  - default ABR keeps throughput + BOLA + insufficientBuffer + switchHistory + abandonRequests active；droppedFrames / L2A / LoLP are inactive；
  - when throughput and BOLA are both active, `getBestPossibleSwitchRequest` keeps only one per media type after `hybridSwitchBufferTime`；
  - default `liveDelay` is `NaN`；`liveCatchup.enabled` is `null`；low-latency download-time mode defaults to `MOOF_PARSING`.
