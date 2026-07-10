import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import { homepageTrustClaimFailures } from './homepage-trust.mjs';

test('homepage source limits capability promises to the visible evidence state', async () => {
  const source = await fs.readFile(new URL('../../src/content/docs/index.md', import.meta.url), 'utf8');
  assert.deepEqual(homepageTrustClaimFailures(source), []);
});

test('DOM trust audit rejects universal run claims and requires the legacy warning', () => {
  const unsafe = '<main><p>项目笔记会落到真实源码、核心文件与一个可以动手验证的最小实验。</p></main>';
  const failures = homepageTrustClaimFailures(unsafe);
  assert.equal(failures.some((failure) => failure.includes('unsupported universal')), true);
  assert.equal(failures.some((failure) => failure.includes('待复核')), true);
});
