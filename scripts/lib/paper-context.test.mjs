import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPaperContext,
  formatManualCitation,
  maybeFormatCitation,
  normalizeLrSearchResults,
  parseReferences,
} from './paper-context.mjs';

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

test('normalizeLrSearchResults extracts DOI, OpenAlex ID, authors, and citations', () => {
  const results = normalizeLrSearchResults(JSON.stringify([
    {
      title: 'A Relational Model of Data for Large Shared Data Banks',
      authors: [{ name: 'Edgar F. Codd' }],
      year: 1970,
      doi: 'https://doi.org/10.1145/362384.362685',
      ids: { openalex: 'https://openalex.org/W2078755468' },
      citationCount: 12345,
    },
  ]));

  assert.equal(results[0].title, 'A Relational Model of Data for Large Shared Data Banks');
  assert.deepEqual(results[0].authors, ['Edgar F. Codd']);
  assert.equal(results[0].doi, '10.1145/362384.362685');
  assert.equal(results[0].openalex_id, 'W2078755468');
  assert.equal(results[0].citation_count, 12345);
});

test('parseReferences extracts numbered references with year and title', () => {
  const refs = parseReferences(`
[1] Leslie Lamport. 1978. Time, clocks, and the ordering of events in a distributed system. CACM.
[2] Michael Stonebraker et al. 1986. The design of POSTGRES. SIGMOD.
`);

  assert.equal(refs.length, 2);
  assert.equal(refs[0].title, 'Time, clocks, and the ordering of events in a distributed system');
  assert.equal(refs[0].year, 1978);
  assert.equal(refs[0].slug, 'time-clocks-ordering-events-distributed-system-1978');
});

test('maybeFormatCitation does not call lr cite format without resource_id', async () => {
  const calls = [];
  const warnings = [];
  const result = await maybeFormatCitation({
    paper: { title: 'Demo Paper', authors: ['Ada Lovelace'], year: 1843 },
    warnings,
    runner: async (command, args) => {
      calls.push([command, args]);
      return '{}';
    },
  });

  assert.equal(calls.length, 0);
  assert.equal(result.source_text, formatManualCitation({ title: 'Demo Paper', authors: ['Ada Lovelace'], year: 1843 }));
  assert.deepEqual(warnings, ['cite-format-skipped-missing-resource-id']);
});

test('buildPaperContext combines OpenAlex metadata and skips unsafe cite format', async () => {
  const commands = [];
  const runner = async (command, args) => {
    commands.push([command, args]);
    if (args[0] === 'search') {
      return JSON.stringify([
        {
          title: 'Demo Paper',
          authors: ['Ada Lovelace'],
          year: 2024,
          doi: '10.1234/demo',
          ids: { openalex: 'https://openalex.org/W1' },
          citationCount: 10,
        },
      ]);
    }
    if (args[0] === 'graph' && args[1] === 'build') {
      return JSON.stringify({ citations_in: [], citations_out: [] });
    }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
  };
  const fetchImpl = async (url) => {
    if (url.includes('/works/W1')) {
      return response({
        id: 'https://openalex.org/W1',
        display_name: 'Demo Paper',
        publication_year: 2024,
        doi: 'https://doi.org/10.1234/demo',
        cited_by_count: 12,
        authorships: [{ author: { display_name: 'Ada Lovelace' } }],
        referenced_works: ['https://openalex.org/W2'],
        cited_by_api_url: 'https://api.openalex.org/works?filter=cites:W1',
      });
    }
    if (url.includes('filter=cites:W1') || url.includes('filter=cites%3AW1')) {
      return response({
        results: [
          {
            id: 'https://openalex.org/W3',
            display_name: 'A Later Demo Paper',
            publication_year: 2025,
            cited_by_count: 4,
          },
        ],
      });
    }
    if (url.includes('/works/W2')) {
      return response({
        id: 'https://openalex.org/W2',
        display_name: 'A Referenced Demo Paper',
        publication_year: 2020,
        cited_by_count: 5,
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const context = await buildPaperContext({
    slug: 'demo-paper',
    title: 'Demo Paper',
    year: '2024',
    url: 'https://example.com/demo',
    apiKey: 'oa_test',
    writtenText: 'referenced-demo-paper-2020\n',
    fullMarkdown: `
## References

[1] Grace Hopper. 1952. The education of a computer. ACM.
`,
  }, { runner, fetchImpl });

  assert.equal(context.paper.openalex_id, 'W1');
  assert.equal(context.paper.doi, '10.1234/demo');
  assert.equal(context.citations_in[0].title, 'A Later Demo Paper');
  assert.equal(context.citations_out[0].title, 'A Referenced Demo Paper');
  assert.ok(context.citations_out.some((item) => item.source === 'references'));
  assert.ok(context.linkable_slugs.includes('referenced-demo-paper-2020'));
  assert.ok(context.fallback_used.includes('openalex'));
  assert.ok(context.fallback_used.includes('references'));
  assert.ok(context.fallback_used.includes('manual-citation'));
  assert.equal(commands.some(([, args]) => args[0] === 'cite'), false);
});

test('buildPaperContext falls back to References when graph is empty', async () => {
  const runner = async (command, args) => {
    if (args[0] === 'search') return JSON.stringify([{ title: 'Graphless Paper', year: 2024 }]);
    if (args[0] === 'graph' && args[1] === 'search') return JSON.stringify([{ title: 'Graphless Paper' }]);
    return JSON.stringify({ citations_in: [], citations_out: [] });
  };

  const context = await buildPaperContext({
    slug: 'graphless-paper',
    title: 'Graphless Paper',
    year: '2024',
    fullMarkdown: `
## References

[1] Butler Lampson. 1996. Hints for computer system design. SOSP.
`,
    writtenText: '',
    apiKey: '',
  }, {
    runner,
    fetchImpl: async () => response({}),
  });

  assert.equal(context.citations_in.length, 0);
  assert.equal(context.citations_out[0].title, 'Hints for computer system design');
  assert.ok(context.fallback_used.includes('references'));
  assert.ok(context.warnings.includes('openalex-skipped-missing-key'));
  assert.ok(context.warnings.includes('lr-graph-skipped-missing-openalex-id'));
});
