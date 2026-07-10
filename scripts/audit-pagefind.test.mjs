import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateSearchContract } from './audit-pagefind.mjs';

test('checks result sets without locking full ranking', async () => {
  const contract = {
    queries: [
      { query: 'React UI', must_include: ['/study/projects/react/'] },
      { query: 'missing', maximum_results: 0 },
    ],
  };
  const fakeSearch = async (query) => ({
    results: query === 'React UI'
      ? [{ data: async () => ({ url: '/study/projects/react/' }) }]
      : [],
  });
  const result = await evaluateSearchContract(contract, fakeSearch);
  assert.deepEqual(result.failures, []);
});

test('reports missing required results and count budgets', async () => {
  const contract = { queries: [{ query: 'ReAct', must_include: ['/study/papers/react/'], minimum_results: 2 }] };
  const result = await evaluateSearchContract(contract, async () => ({
    results: [{ data: async () => ({ url: '/study/projects/react/' }) }],
  }));
  assert.equal(result.failures.length, 2);
});
