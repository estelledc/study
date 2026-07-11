import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { auditA11yStatic } from './audit-a11y-static.mjs';

test('requires focus, reduced motion, and explicit broken-link semantics', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-a11y-static-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/styles/jx'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/styles/jx/base.css'), 'a:focus-visible{} @media (prefers-reduced-motion: reduce){}');
  fs.writeFileSync(path.join(root, 'src/styles/jx/product-ui.css'), '');
  fs.writeFileSync(path.join(root, 'src/styles/jx/components.css'), '');
  fs.writeFileSync(path.join(root, 'scripts/remark-wikilinks.mjs'), '`<span class="wikilink-broken" aria-label="未解析链接">`');
  assert.deepEqual(auditA11yStatic(root), []);
  fs.writeFileSync(path.join(root, 'scripts/remark-wikilinks.mjs'), '`<span class="wikilink-broken">`');
  assert.deepEqual(auditA11yStatic(root), ['broken wikilinks have no explicit accessible state']);
});
