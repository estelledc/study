# Legacy Audit Reviews

This directory stores the completed legacy corpus audit from the historical batch flow.

The current canonical files are:

- `legacy-audit-reviews.jsonl`: one raw JSON record per historical audit review.
- `manifest.json`: byte counts and SHA-256 digests for every original review path.

These records are qualitative observations only. They are not `study-review-receipt-v1`
receipts, do not contain `ACTUAL_RUN` evidence, and cannot upgrade a note to
`VERIFIED`.

Verify the archive with:

```bash
npm run audit:legacy-reviews
```

Do not recreate the old per-note `papers/*.json` or `projects/*.json` layout without
an operation-bound, single-use approval.
