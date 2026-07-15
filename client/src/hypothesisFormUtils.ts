import type { HypothesisDetail, HypothesisProblemDraft } from './types';

export function detailToDrafts(detail: HypothesisDetail): HypothesisProblemDraft[] {
  return [...detail.problems]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(p => ({
      problem_id: p.id,
      name: p.name,
      parent_id: p.parent_id ?? null,
      depth: p.depth ?? 0,
      lcm_code: p.lcm_code ?? null,
      sort_order: p.sort_order ?? 0,
      solution_ids: p.solutions.map(s => s.id),
      new_solution_name: '',
    }));
}

export interface IndexedProblem extends HypothesisProblemDraft {
  idx: number;
}

export type ProblemDisplayUnit =
  | { kind: 'group'; parent: IndexedProblem; children: IndexedProblem[] }
  | { kind: 'standalone'; item: IndexedProblem };

export function buildDisplayUnits(problems: HypothesisProblemDraft[]): ProblemDisplayUnit[] {
  const indexed: IndexedProblem[] = problems.map((p, idx) => ({ ...p, idx }));
  const byId = new Map(
    indexed.filter(p => p.problem_id).map(p => [p.problem_id!, p]),
  );

  const units: ProblemDisplayUnit[] = [];
  const consumed = new Set<number>();

  const roots = indexed
    .filter(p => !p.parent_id || !byId.has(p.parent_id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  for (const root of roots) {
    const children = indexed
      .filter(c => c.parent_id && c.parent_id === root.problem_id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (children.length > 0) {
      units.push({ kind: 'group', parent: root, children });
      consumed.add(root.idx);
      for (const c of children) consumed.add(c.idx);
    }
  }

  for (const p of indexed) {
    if (!consumed.has(p.idx)) {
      units.push({ kind: 'standalone', item: p });
    }
  }

  units.sort((a, b) => {
    const orderA = a.kind === 'group' ? (a.parent.sort_order ?? 0) : (a.item.sort_order ?? 0);
    const orderB = b.kind === 'group' ? (b.parent.sort_order ?? 0) : (b.item.sort_order ?? 0);
    return orderA - orderB;
  });

  return units;
}

export function uniqueSolutionNames(
  problems: HypothesisProblemDraft[],
  solutionById: (id: number) => { name: string } | undefined,
): string[] {
  const seen = new Set<number>();
  const names: string[] = [];
  for (const p of problems) {
    for (const sid of p.solution_ids) {
      if (seen.has(sid)) continue;
      seen.add(sid);
      const sol = solutionById(sid);
      if (sol) names.push(sol.name);
    }
  }
  return names.sort((a, b) => a.localeCompare(b, 'ru'));
}
