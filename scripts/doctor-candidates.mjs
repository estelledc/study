#!/usr/bin/env node
import { formatCandidateMetadataIssue } from './lib/candidate-metadata.mjs';
import { candidateDoctorReport } from './lib/candidate-maintenance.mjs';
import { readCandidates } from './lib/queue-store.mjs';

function parseArgs(argv) {
  const args = {
    all: false,
    includeWritten: false,
    json: false,
    minPaperQueued: 2,
    verbose: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') args.all = true;
    else if (arg === '--include-written') args.includeWritten = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--verbose') args.verbose = true;
    else if (arg === '--min-paper-queued') args.minPaperQueued = Number.parseInt(argv[++i], 10);
    else throw new Error(`Unknown arg: ${arg}`);
  }
  return args;
}

function renderHuman(report, args) {
  const lines = [
    `candidate doctor: checked=${report.checked}/${report.total} include_written=${report.include_written}`,
    `papers queued: ${report.paper_queued}`,
    `projects queued: ${report.project_queued}`,
    `metadata issues: ${report.issue_count} (blocking ${report.blocking_issue_count}, advisory ${report.advisory_issue_count})`,
  ];
  if (report.paper_queued < args.minPaperQueued) {
    lines.push(`paper queued shortage: got ${report.paper_queued}, need ${args.minPaperQueued}`);
  }
  if (report.blocking_issues.length) {
    lines.push('');
    lines.push('blocking issues:');
    for (const issue of report.blocking_issues) {
      lines.push(`- ${formatCandidateMetadataIssue(issue)} status=${issue.status} source=${issue.source_file}`);
    }
  }
  if (report.advisory_issues.length) {
    lines.push('');
    lines.push(`advisory issues: ${report.advisory_issues.length}`);
    if (args.verbose) {
      for (const issue of report.advisory_issues) {
        lines.push(`- ${formatCandidateMetadataIssue(issue)} status=${issue.status} source=${issue.source_file}`);
      }
    } else {
      lines.push('  pass --verbose to list advisory candidate cleanup items');
    }
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  const candidates = await readCandidates();
  const report = candidateDoctorReport(candidates, { includeWritten: args.includeWritten });

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else console.log(renderHuman(report, args));

  if (report.blocking_issue_count > 0 || report.paper_queued < args.minPaperQueued) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
