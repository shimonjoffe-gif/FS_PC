import type { Problem } from '../types';

export type ProblemDisplayUnit =
  | { kind: 'group'; parent: Problem; children: Problem[] }
  | { kind: 'standalone'; item: Problem };

export function collectProblemWithAncestors(items: Problem[], matchIds: Set<number>): Set<number> {
  const byId = new Map(items.map(p => [p.id, p]));
  const result = new Set<number>();
  for (const id of matchIds) {
    let cursor: number | null = id;
    while (cursor) {
      if (result.has(cursor)) break;
      result.add(cursor);
      const row = byId.get(cursor);
      cursor = row?.parent_id ?? null;
    }
  }
  return result;
}

export function buildProblemDisplayUnits(items: Problem[]): ProblemDisplayUnit[] {
  const byId = new Map(items.map(p => [p.id, p]));
  const units: ProblemDisplayUnit[] = [];
  const consumed = new Set<number>();

  const roots = items
    .filter(p => !p.parent_id || !byId.has(p.parent_id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

  for (const root of roots) {
    const children = items
      .filter(c => c.parent_id === root.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
    if (children.length > 0) {
      units.push({ kind: 'group', parent: root, children });
      consumed.add(root.id);
      for (const child of children) consumed.add(child.id);
    }
  }

  for (const item of items) {
    if (!consumed.has(item.id)) {
      units.push({ kind: 'standalone', item });
    }
  }

  units.sort((a, b) => {
    const orderA = a.kind === 'group' ? (a.parent.sort_order ?? 0) : (a.item.sort_order ?? 0);
    const orderB = b.kind === 'group' ? (b.parent.sort_order ?? 0) : (b.item.sort_order ?? 0);
    return orderA - orderB || (a.kind === 'group' ? a.parent.id : a.item.id) - (b.kind === 'group' ? b.parent.id : b.item.id);
  });

  return units;
}

export function aggregateProblemGroupSelected(members: Problem[], selectedIds: Set<number>): boolean {
  return members.some(m => selectedIds.has(m.id));
}

export type HypothesisProblemSection = {
  hypothesisId: number;
  hypothesisName: string;
  units: ProblemDisplayUnit[];
};

export function buildHypothesisProblemSections(
  hypotheses: { id: number; name: string }[],
  visibleProblems: Problem[],
): HypothesisProblemSection[] {
  const sections: HypothesisProblemSection[] = [];

  for (const hyp of hypotheses) {
    const subset = visibleProblems.filter(p => p.used_in_hypotheses?.includes(hyp.name));
    if (!subset.length) continue;
    sections.push({
      hypothesisId: hyp.id,
      hypothesisName: hyp.name,
      units: buildProblemDisplayUnits(subset),
    });
  }

  const covered = new Set<number>();
  for (const section of sections) {
    for (const unit of section.units) {
      if (unit.kind === 'group') {
        covered.add(unit.parent.id);
        for (const child of unit.children) covered.add(child.id);
      } else {
        covered.add(unit.item.id);
      }
    }
  }

  const rest = visibleProblems.filter(p => !covered.has(p.id));
  if (rest.length > 0) {
    sections.push({
      hypothesisId: 0,
      hypothesisName: 'Прочие',
      units: buildProblemDisplayUnits(rest),
    });
  }

  return sections;
}
