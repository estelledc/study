import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatCandidateMetadataIssue,
  validateCandidateRows,
} from './candidate-metadata.mjs';

test('project metadata accepts normal stars and value description', () => {
  const issues = validateCandidateRows([
    {
      area: 'projects',
      slug: 'sdk-nrf',
      meta: {
        col3: '1.7k',
        col4: 'Nordic nRF52/nRF53/nRF54 全家桶 SDK，BLE / Thread / Matter / 蜂窝 IoT 一体',
      },
    },
  ]);

  assert.deepEqual(issues, []);
});

test('project metadata detects swapped stars and value', () => {
  const issues = validateCandidateRows([
    {
      area: 'projects',
      slug: 'lora-mac-node',
      meta: {
        col3: 'LoRa Alliance 参考实现，LoRaWAN MAC 层 + 区域参数 + Class A/B/C 完整',
        col4: '1.9k',
      },
    },
  ]);

  assert.equal(issues.length, 1);
  assert.equal(issues[0].suggestion.col3, '1.9k');
  assert.match(formatCandidateMetadataIssue(issues[0]), /lora-mac-node/);
  assert.match(formatCandidateMetadataIssue(issues[0]), /suggested swap/);
});

test('paper metadata detects swapped year and value', () => {
  const issues = validateCandidateRows([
    {
      area: 'papers',
      slug: 'paper-swapped',
      meta: {
        col3: '经典论文价值说明',
        col4: '2016',
      },
    },
  ]);

  assert.equal(issues.length, 1);
  assert.equal(issues[0].suggestion.col3, '2016');
});

test('normal mixed 4 NEW metadata passes', () => {
  const issues = validateCandidateRows([
    { area: 'papers', slug: 'p1', meta: { col3: '2016', col4: '覆盖引导 greybox fuzzing 的经典论文' } },
    { area: 'papers', slug: 'p2', meta: { col3: '2005', col4: '动态污点分析检测 exploit 的经典论文' } },
    { area: 'projects', slug: 'eclipse-che', meta: { col3: '~7k', col4: 'DevWorkspace + Devfile 标准化云 IDE 描述，企业级方案' } },
    { area: 'projects', slug: 'lora-mac-node', meta: { col3: '1.9k', col4: 'LoRa Alliance 参考实现，LoRaWAN MAC 层 + 区域参数完整' } },
  ]);

  assert.deepEqual(issues, []);
});
