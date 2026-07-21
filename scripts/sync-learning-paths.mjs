#!/usr/bin/env node

import { runLearningPathSync } from './lib/learning-paths.mjs';

function parseArgs(argv) {
  const args = { write: false, check: false, json: false };
  for (const arg of argv) {
    if (arg === '--write') args.write = true;
    else if (arg === '--check') args.check = true;
    else if (arg === '--json') args.json = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (args.write && args.check) throw new Error('--write and --check cannot be combined');
  return args;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = await runLearningPathSync({ write: args.write });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (args.write) {
    console.log(`learning-paths: ${result.changed.length} changed`);
    for (const file of result.changed) console.log(`- ${file}`);
  } else if (!result.ok) {
    if (result.failures.length) {
      console.error('learning-path failures:');
      for (const failure of result.failures) console.error(`- ${failure}`);
    }
    if (result.stale.length) {
      console.error('learning-path generated sections are stale:');
      for (const file of result.stale) console.error(`- ${file}`);
    }
  } else {
    console.log(`learning-paths: current, ${result.paths.length} paths`);
  }
  if (!args.write && !result.ok) process.exitCode = 1;
} catch (error) {
  console.error(`learning-paths failed: ${error.message}`);
  process.exitCode = 2;
}
