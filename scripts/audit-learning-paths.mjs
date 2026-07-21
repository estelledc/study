#!/usr/bin/env node

import { runLearningPathSync } from './lib/learning-paths.mjs';

const json = process.argv.includes('--json');

try {
  const result = await runLearningPathSync({ write: false });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(`learning-paths: current, ${result.paths.length} paths`);
  } else {
    if (result.failures.length) {
      console.error('learning-path failures:');
      for (const failure of result.failures) console.error(`- ${failure}`);
    }
    if (result.stale.length) {
      console.error('learning-path generated sections are stale:');
      for (const file of result.stale) console.error(`- ${file}`);
    }
  }
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(`learning-paths failed: ${error.message}`);
  process.exitCode = 2;
}
