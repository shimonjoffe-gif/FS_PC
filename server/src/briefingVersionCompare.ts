/**
 * Compare two briefing versions (input diff MVP + high-level DO snapshot from dumps).
 */
import { FS_QUEUE_KEYS, parseQueuesJson, anyQueueEnabled } from './fsQueues';
import {
  getBriefingVersion,
  getVersionDump,
  type BriefingVersionMeta,
} from './briefingVersions';

export interface VersionInputDiffItem {
  key: string;
  label: string;
  change: 'added' | 'removed' | 'changed' | 'same';
  detail?: string;
}

export interface VersionCompareResult {
  a: BriefingVersionMeta;
  b: BriefingVersionMeta;
  input: {
    problems: VersionInputDiffItem[];
    solutions: VersionInputDiffItem[];
    widgets: VersionInputDiffItem[];
    fs: VersionInputDiffItem[];
    summary: { added: number; removed: number; changed: number };
  };
  /** Phase DO totals from frozen dump / live assessment scenarios (stored snapshot). */
  do_hint: {
    a_label: string;
    b_label: string;
    note: string;
  };
}

async function queuesLabel(queuesRaw: unknown): Promise<string > {
  const q = parseQueuesJson(queuesRaw as string | Record<string, number> | null);
  const on = FS_QUEUE_KEYS.filter(k => q[k] === 1);
  return on.length ? on.map(k => `оч.${k}`).join('+') : 'нет';
}

async function resolveFull(
  briefingId: number,
  versionId: number,
  getLiveFull: (id: number) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null,
): Promise<Record<string, unknown> | null> {
  const meta = await getBriefingVersion(versionId);
  if (!meta || meta.briefing_id !== briefingId) return null;
  if (meta.status === 'draft') {
    return await getLiveFull(briefingId);
  }
  const dump = await getVersionDump(versionId);
  return dump?.full ?? null;
}

async function diffProblems(aFull: Record<string, unknown>, bFull: Record<string, unknown>): Promise<VersionInputDiffItem[] {
  const aList = (aFull.problems as Array<Record<string, unknown>> | undefined) ?? [];
  const bList = (bFull.problems as Array<Record<string, unknown>> | undefined) ?? [];
  const keyOf = (p: Record<string, unknown>) =>
    p.problem_id != null
      ? `p:${p.problem_id}`
      : `c:${String(p.custom_text ?? '').trim()}`;
  const labelOf = (p: Record<string, unknown>) =>
    String(p.problem_name ?? p.custom_text ?? p.linked_problem_name ?? keyOf(p));

  const aMap = new Map(aList.map(p => [keyOf(p), p]));
  const bMap = new Map(bList.map(p => [keyOf(p), p]));
  const keys = new Set([...aMap.keys(), ...bMap.keys()]);
  const out: VersionInputDiffItem[] = [];
  for (const key of keys) {
    const a = aMap.get(key);
    const b = bMap.get(key);
    if (a && !b) out.push({ key, label: labelOf(a), change: 'removed' });
    else if (!a && b) out.push({ key, label: labelOf(b), change: 'added' });
    else if (a && b) {
      const aLink = a.linked_problem_id ?? null;
      const bLink = b.linked_problem_id ?? null;
      const aText = String(a.custom_text ?? '');
      const bText = String(b.custom_text ?? '');
      if (aLink !== bLink || aText !== bText) {
        out.push({ key, label: labelOf(b), change: 'changed', detail: 'текст/связь' });
      }
    }
  }
  return out;
}

async function diffSolutions(aFull: Record<string, unknown>, bFull: Record<string, unknown>): Promise<VersionInputDiffItem[] {
  const aList = (aFull.solutions as Array<Record<string, unknown>> | undefined) ?? [];
  const bList = (bFull.solutions as Array<Record<string, unknown>> | undefined) ?? [];
  const aMap = new Map(aList.map(s => [String(s.id), s]));
  const bMap = new Map(bList.map(s => [String(s.id), s]));
  const keys = new Set([...aMap.keys(), ...bMap.keys()]);
  const out: VersionInputDiffItem[] = [];
  for (const key of keys) {
    const a = aMap.get(key);
    const b = bMap.get(key);
    const label = String((b ?? a)?.name ?? key);
    if (a && !b) out.push({ key, label, change: 'removed' });
    else if (!a && b) out.push({ key, label, change: 'added' });
    else if (a && b && String(a.queue ?? '') !== String(b.queue ?? '')) {
      out.push({
        key,
        label,
        change: 'changed',
        detail: `очередь ${a.queue ?? '—'} → ${b.queue ?? '—'}`,
      });
    }
  }
  return out;
}

async function diffWidgets(aFull: Record<string, unknown>, bFull: Record<string, unknown>): Promise<VersionInputDiffItem[] {
  type W = { widget_id: number; name?: string; solution_id?: number };
  const norm = (full: Record<string, unknown>) => {
    const fromSol = ((full.widgets as W[] | undefined) ?? []).map(w => ({
      key: `s:${w.solution_id}:${w.widget_id}`,
      label: w.name ?? `виджет ${w.widget_id}`,
    }));
    const fromCust = ((full.customer_widgets as W[] | undefined) ?? []).map(w => ({
      key: `c:${w.widget_id}`,
      label: w.name ?? `виджет ${w.widget_id}`,
    }));
    return new Map([...fromSol, ...fromCust].map(x => [x.key, x.label]));
  };
  const aMap = norm(aFull);
  const bMap = norm(bFull);
  const keys = new Set([...aMap.keys(), ...bMap.keys()]);
  const out: VersionInputDiffItem[] = [];
  for (const key of keys) {
    const a = aMap.get(key);
    const b = bMap.get(key);
    if (a && !b) out.push({ key, label: a, change: 'removed' });
    else if (!a && b) out.push({ key, label: b, change: 'added' });
  }
  return out;
}

async function diffFs(aFull: Record<string, unknown>, bFull: Record<string, unknown>): Promise<VersionInputDiffItem[] {
  type Fs = {
    fs_item_id: number;
    name?: string;
    prefix?: string;
    queues_json?: unknown;
    enabled?: number;
  };
  const list = (full: Record<string, unknown>) =>
    ((full.fs_items as Fs[] | undefined) ?? []).filter(i => {
      const q = parseQueuesJson(i.queues_json as never);
      return anyQueueEnabled(q) || i.enabled === 1;
    });

  const aList = list(aFull);
  const bList = list(bFull);
  const aMap = new Map(aList.map(i => [i.fs_item_id, i]));
  const bMap = new Map(bList.map(i => [i.fs_item_id, i]));
  const keys = new Set([...aMap.keys(), ...bMap.keys()]);
  const out: VersionInputDiffItem[] = [];
  for (const id of keys) {
    const a = aMap.get(id);
    const b = bMap.get(id);
    const label = `${(b ?? a)?.prefix ?? ''} ${(b ?? a)?.name ?? id}`.trim();
    if (a && !b) out.push({ key: String(id), label, change: 'removed' });
    else if (!a && b) out.push({ key: String(id), label, change: 'added' });
    else if (a && b) {
      const aq = queuesLabel(a.queues_json);
      const bq = queuesLabel(b.queues_json);
      if (aq !== bq) {
        out.push({ key: String(id), label, change: 'changed', detail: `${aq} → ${bq}` });
      }
    }
  }
  return out;
}

export async function computeVersionCompare(
  briefingId: number,
  versionA: number,
  versionB: number,
  getLiveFull: (id: number) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null,
): Promise<VersionCompareResult> {
  const aMeta = await getBriefingVersion(versionA);
  const bMeta = await getBriefingVersion(versionB);
  if (!aMeta || aMeta.briefing_id !== briefingId) throw new Error('Версия A не найдена');
  if (!bMeta || bMeta.briefing_id !== briefingId) throw new Error('Версия B не найдена');

  const aFull = await resolveFull(briefingId, versionA, getLiveFull);
  const bFull = await resolveFull(briefingId, versionB, getLiveFull);
  if (!aFull || !bFull) throw new Error('Нет данных для сравнения (дамп отсутствует)');

  const problems = diffProblems(aFull, bFull);
  const solutions = diffSolutions(aFull, bFull);
  const widgets = diffWidgets(aFull, bFull);
  const fs = diffFs(aFull, bFull);
  const all = [...problems, ...solutions, ...widgets, ...fs];

  return {
    a: aMeta,
    b: bMeta,
    input: {
      problems,
      solutions,
      widgets,
      fs,
      summary: {
        added: all.filter(x => x.change === 'added').length,
        removed: all.filter(x => x.change === 'removed').length,
        changed: all.filter(x => x.change === 'changed').length,
      },
    },
    do_hint: {
      a_label: aMeta.label,
      b_label: bMeta.label,
      note: 'Сводная матрица ДО по версиям — на клиенте из дампов (подвкладка сравнения).',
    },
  };
}
