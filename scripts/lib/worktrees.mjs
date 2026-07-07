const WORKTREE_NAMES = {
  papers: ['papers', 'papers-2', 'papers-3', 'papers-4'],
  projects: ['projects', 'projects-2', 'projects-3', 'projects-4'],
};

function requireHome(home = process.env.HOME) {
  if (!home) throw new Error('HOME is required to resolve study worktrees');
  return home;
}

function worktreeFromName(area, slot, home) {
  const name = WORKTREE_NAMES[area]?.[slot];
  if (!name) throw new Error(`No worktree for area=${area} slot=${slot}`);
  return {
    area,
    slot,
    name,
    path: `${home}/study-refactor-${name}`,
    branch: `refactor/${name}`,
  };
}

export function worktreeForAreaSlot(area, slot, home = process.env.HOME) {
  return worktreeFromName(area, slot, requireHome(home));
}

export function worktreesForDispatch(area, mode, home = process.env.HOME) {
  const slots = mode === 'rewrite' ? [0, 1] : [2, 3];
  return slots.map((slot) => worktreeForAreaSlot(area, slot, home));
}

export function worktreeForPipelineKind(kind, slot, home = process.env.HOME) {
  const area = kind.endsWith('paper') ? 'papers' : 'projects';
  return worktreeForAreaSlot(area, slot, home);
}

export function allWorktrees(home = process.env.HOME) {
  const root = requireHome(home);
  return ['papers', 'projects'].flatMap((area) =>
    WORKTREE_NAMES[area].map((_, slot) => worktreeFromName(area, slot, root))
  );
}
