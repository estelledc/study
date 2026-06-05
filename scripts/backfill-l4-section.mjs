#!/usr/bin/env node
// 为缺少 L4 段的 pipeline-v3 / legacy-migrated 笔记插入最小「实践验证」骨架
// curated-season 笔记不处理（需人工）
//
// 骨架标记：<!-- L4-TODO --> 供人工替换占位符
//
// 用法：
//   node scripts/backfill-l4-section.mjs           # dry-run
//   node scripts/backfill-l4-section.mjs --apply   # 写入

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const QUEUE_PATH = path.join(ROOT, 'data/l4-backfill-queue.jsonl');

const SKELETON = `
## 实践验证

<!-- L4-TODO: 将以下占位符替换为真实复现记录 -->

**做了什么**：（在此描述运行了哪个示例、命令或代码片段）

\`\`\`bash
# L4-TODO: 替换为实际运行命令
echo "placeholder"
\`\`\`

**结论**：（一句话描述观察到的结果）
`;

function insertBeforeSection(content, targetH2, skeleton) {
  // Insert before target section or before 关联/反向链接 or at end of content
  const insertTargets = [targetH2, '关联', '反向链接'];
  for (const target of insertTargets) {
    const re = new RegExp(`^(##[^\\n]*${target})`, 'm');
    if (re.test(content)) {
      return content.replace(re, skeleton + '\n$1');
    }
  }
  // Append at end
  return content + '\n' + skeleton;
}

async function main() {
  let queueRaw;
  try {
    queueRaw = await fs.readFile(QUEUE_PATH, 'utf8');
  } catch {
    console.error('data/l4-backfill-queue.jsonl not found. Run audit-l4.mjs first.');
    process.exit(1);
  }

  const queue = queueRaw.split('\n').filter(Boolean).map(l => JSON.parse(l));
  // Only process pipeline / legacy (not curated)
  const toProcess = queue.filter(x => x.provenance !== 'curated-season');

  let done = 0;
  for (const item of toProcess) {
    const filePath = path.join(ROOT, item.file);
    const content = await fs.readFile(filePath, 'utf8');

    // Skip if already has 实践验证 with code
    if (/^## [^\n]*实践验证/m.test(content) && /```/.test(content)) {
      continue;
    }

    const updated = insertBeforeSection(content, '实践案例', SKELETON);
    if (updated === content) continue;

    done++;
    if (APPLY) {
      await fs.writeFile(filePath, updated);
      console.log(`  backfilled  ${item.file}`);
    } else {
      console.log(`  [dry-run]   ${item.file}`);
    }
  }

  console.log(`\nbackfill-l4-section: ${done} files ${APPLY ? 'updated' : 'would be updated'}.`);
  console.log(`Skipped curated-season (${queue.length - toProcess.length} files): manual review required.`);
}

main().catch(err => {
  console.error('backfill-l4-section error:', err);
  process.exit(1);
});
