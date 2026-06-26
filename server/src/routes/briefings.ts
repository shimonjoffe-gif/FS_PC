import { Router } from 'express';
import { db } from '../db';
import { deriveFsFromSelections, calculateBriefing, getDefaultParams, loadFsSelections } from '../briefingCalc';
import { parseQueuesJson, primaryQueue, enabledFromQueues } from '../fsQueues';
import { FS_QUEUE_KEYS } from '../fsQueues';
import {
  computeAutoProjectType, computeRisks, mergeEffectiveRisks, computeOrgVolume,
  getHourlyRateForType, getHeadcountCoeffs, technologyForType,
  computeCriteriaSpAuto,
  SELLER_CRITERIA_DEFS, type SellerCriteria, type OrgVolumeData, type RisksC51C57,
} from '../assessmentCalc';
import { parseSellerCriteria, serializeSellerCriteria } from '../sellerCriteria';

export const briefingsRouter = Router();

function parseJson<T>(raw: string | T | null | undefined, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function ensureAssessmentRow(briefingId: number) {
  const exists = db.prepare(`SELECT briefing_id FROM briefing_assessment WHERE briefing_id=?`).get(briefingId);
  if (!exists) {
    db.prepare(`INSERT INTO briefing_assessment(briefing_id) VALUES (?)`).run(briefingId);
  }
}

function loadAssessment(briefingId: number) {
  ensureAssessmentRow(briefingId);
  const row = db.prepare(`SELECT * FROM briefing_assessment WHERE briefing_id=?`).get(briefingId) as {
    criteria_json: string;
    project_type_id: number | null;
    project_type_manual: number;
    risks_json: string;
    risks_manual: number;
    org_volume_json: string;
    org_volume_manual: number;
    headcount_category: string | null;
    headcount_coeffs_json: string;
    headcount_manual: number;
  };

  const criteria = parseSellerCriteria(parseJson(row.criteria_json, {}));
  const storedOrg = parseJson<Partial<OrgVolumeData>>(row.org_volume_json, {});

  const autoType = computeAutoProjectType(briefingId, criteria);
  const autoOrg = computeOrgVolume(briefingId, row.org_volume_manual ? storedOrg : {});

  const effectiveTypeId = row.project_type_manual && row.project_type_id
    ? row.project_type_id
    : autoType?.id ?? row.project_type_id ?? autoType?.id ?? null;

  const typeRow = effectiveTypeId
    ? db.prepare(`SELECT * FROM project_types WHERE id=?`).get(effectiveTypeId) as { id: number; code: string; name: string } | undefined
    : undefined;

  const autoRisks = computeRisks(criteria, { projectTypeCode: typeRow?.code ?? autoType?.code ?? null });

  const storedRisks = parseJson<Partial<RisksC51C57>>(row.risks_json, {});
  const effectiveRisks = mergeEffectiveRisks(autoRisks, storedRisks, row.risks_manual === 1);

  const effectiveOrg: OrgVolumeData = row.org_volume_manual && storedOrg.queues
    ? { ...autoOrg, ...storedOrg, queues: { ...autoOrg.queues, ...storedOrg.queues } }
    : autoOrg;

  const category = row.headcount_manual && row.headcount_category
    ? row.headcount_category
    : effectiveOrg.headcount_category;

  const autoCoeffs = getHeadcountCoeffs(effectiveTypeId, category);
  const storedCoeffs = parseJson(row.headcount_coeffs_json, {});
  const effectiveCoeffs = row.headcount_manual
    ? { ...autoCoeffs, ...storedCoeffs, c62: category }
    : { ...autoCoeffs, c62: category };

  const nsiRate = getHourlyRateForType(effectiveTypeId);
  const technology = technologyForType(typeRow?.code ?? null);

  const queueCalcs = FS_QUEUE_KEYS.map(q => {
    const stored = db.prepare(`
      SELECT * FROM briefing_queue_calc WHERE briefing_id=? AND queue=?
    `).get(briefingId, q) as { technology: string | null; rate: number | null; rate_manual: number } | undefined;

    const autoRate = nsiRate;
    const rate = stored?.rate_manual && stored.rate != null ? stored.rate : autoRate;

    return {
      queue: q,
      technology: stored?.technology ?? technology,
      rate,
      nsi_rate: autoRate,
      rate_manual: stored?.rate_manual ?? 0,
    };
  });

  const projectTypes = db.prepare(`
    SELECT id, code, name, sort_order FROM project_types WHERE is_active=1 ORDER BY sort_order
  `).all();

  return {
    criteria,
    criteria_defs: SELLER_CRITERIA_DEFS,
    auto_criteria_sp: computeCriteriaSpAuto(
      criteria.content_selections,
      criteria.groups,
    ),
    project_type_id: effectiveTypeId,
    project_type_manual: row.project_type_manual === 1,
    auto_project_type_id: autoType?.id ?? null,
    auto_project_type: autoType,
    project_types: projectTypes,
    risks: effectiveRisks,
    risks_manual: row.risks_manual === 1,
    auto_risks: autoRisks,
    org_volume: effectiveOrg,
    org_volume_manual: row.org_volume_manual === 1,
    auto_org_volume: autoOrg,
    headcount_category: category,
    headcount_coeffs: effectiveCoeffs,
    headcount_manual: row.headcount_manual === 1,
    auto_headcount_coeffs: getHeadcountCoeffs(effectiveTypeId, effectiveOrg.headcount_category),
    queue_calcs: queueCalcs,
    nsi_hourly_rate: nsiRate,
  };
}

function getBriefingFull(id: number) {
  const briefing = db.prepare(`
    SELECT b.*, i.name as industry_name, s.name as segment_name
    FROM briefings b
    LEFT JOIN industries i ON i.id = b.industry_id
    LEFT JOIN segments s ON s.id = b.segment_id
    WHERE b.id=?
  `).get(id);
  if (!briefing) return null;

  const problems = db.prepare(`
    SELECT bps.*, p.name as problem_name
    FROM briefing_problem_sel bps
    LEFT JOIN problems p ON p.id = bps.problem_id
    WHERE bps.briefing_id=?
  `).all(id);

  const solutions = db.prepare(`
    SELECT bss.solution_id AS id, sol.name, sol.description
    FROM briefing_solution_sel bss
    JOIN solutions sol ON sol.id = bss.solution_id
    WHERE bss.briefing_id=?
  `).all(id);

  const widgets = db.prepare(`
    SELECT bws.solution_id, bws.widget_id, w.name, w.description
    FROM briefing_widget_sel bws
    JOIN widgets w ON w.id = bws.widget_id
    WHERE bws.briefing_id=?
  `).all(id);

  const fsItems = loadFsSelections(id);

  const params = db.prepare(`SELECT * FROM briefing_params WHERE briefing_id=?`).get(id);
  const defaults = getDefaultParams();

  return {
    ...briefing,
    problems,
    solutions,
    widgets,
    fs_items: fsItems,
    params: params ?? { briefing_id: id, ...defaults, phases_json: JSON.stringify(defaults.phases_json), team_json: JSON.stringify(defaults.team_json) },
    assessment: loadAssessment(id),
  };
}

briefingsRouter.get('/', (_req, res) => {
  res.json(db.prepare(`
    SELECT b.*, i.name as industry_name
    FROM briefings b
    LEFT JOIN industries i ON i.id = b.industry_id
    ORDER BY b.updated_at DESC
  `).all());
});

briefingsRouter.get('/:id', (req, res) => {
  const data = getBriefingFull(Number(req.params.id));
  if (!data) return res.status(404).json({ error: 'not found' });
  res.json(data);
});

briefingsRouter.post('/', (req, res) => {
  const { name, created_by } = req.body as { name?: string; created_by?: number };
  const result = db.prepare(`
    INSERT INTO briefings(name, created_by) VALUES (?,?)
  `).run(name?.trim() || 'Новая предоценка', created_by ?? null);
  const id = Number(result.lastInsertRowid);
  const defaults = getDefaultParams();
  db.prepare(`
    INSERT INTO briefing_params(briefing_id, hourly_rate, accuracy, sp_cost_rub, phases_json, team_json)
    VALUES (?,?,?,?,?,?)
  `).run(id, defaults.hourly_rate, defaults.accuracy, defaults.sp_cost_rub,
    JSON.stringify(defaults.phases_json), JSON.stringify(defaults.team_json));
  ensureAssessmentRow(id);
  res.json({ id });
});

briefingsRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM briefings WHERE id=?`).get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { name, industry_id, segment_id, scenario, headcount } = req.body as {
    name?: string; industry_id?: number | null; segment_id?: number | null;
    scenario?: string; headcount?: number | null;
  };
  const cur = existing as Record<string, unknown>;
  db.prepare(`
    UPDATE briefings SET
      name=?, industry_id=?, segment_id=?, scenario=?, headcount=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    name ?? cur.name,
    industry_id !== undefined ? industry_id : cur.industry_id,
    segment_id !== undefined ? segment_id : cur.segment_id,
    scenario !== undefined ? scenario : cur.scenario,
    headcount !== undefined ? headcount : cur.headcount,
    id,
  );
  res.json({ ok: true });
});

briefingsRouter.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM briefings WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

briefingsRouter.put('/:id/problems', (req, res) => {
  const id = Number(req.params.id);
  const { selections } = req.body as { selections: { problem_id?: number; custom_text?: string }[] };
  const del = db.prepare(`DELETE FROM briefing_problem_sel WHERE briefing_id=?`);
  const ins = db.prepare(`INSERT INTO briefing_problem_sel(briefing_id, problem_id, custom_text) VALUES (?,?,?)`);
  const tx = db.transaction(() => {
    del.run(id);
    for (const s of selections ?? []) {
      ins.run(id, s.problem_id ?? null, s.custom_text ?? null);
    }
  });
  tx();
  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json({ ok: true });
});

briefingsRouter.put('/:id/solutions', (req, res) => {
  const id = Number(req.params.id);
  const { solution_ids } = req.body as { solution_ids: number[] };
  const del = db.prepare(`DELETE FROM briefing_solution_sel WHERE briefing_id=?`);
  const ins = db.prepare(`INSERT INTO briefing_solution_sel(briefing_id, solution_id) VALUES (?,?)`);
  const tx = db.transaction(() => {
    del.run(id);
    for (const sid of solution_ids ?? []) ins.run(id, sid);
  });
  tx();
  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json({ ok: true });
});

briefingsRouter.put('/:id/widgets', (req, res) => {
  const id = Number(req.params.id);
  const { selections } = req.body as { selections: { solution_id: number; widget_id: number }[] };
  const del = db.prepare(`DELETE FROM briefing_widget_sel WHERE briefing_id=?`);
  const ins = db.prepare(`INSERT INTO briefing_widget_sel(briefing_id, solution_id, widget_id) VALUES (?,?,?)`);
  const tx = db.transaction(() => {
    del.run(id);
    for (const s of selections ?? []) ins.run(id, s.solution_id, s.widget_id);
  });
  tx();
  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json({ ok: true });
});

briefingsRouter.put('/:id/fs', (req, res) => {
  const id = Number(req.params.id);
  const { items } = req.body as {
    items: {
      fs_item_id: number; enabled?: number; queue?: string;
      queues_json?: string | Record<string, number>;
      source?: string; story_points?: number;
    }[];
  };
  const upsert = db.prepare(`
    INSERT INTO briefing_fs_sel(briefing_id, fs_item_id, enabled, queue, queues_json, source, story_points)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(briefing_id, fs_item_id) DO UPDATE SET
      enabled=excluded.enabled, queue=excluded.queue, queues_json=excluded.queues_json,
      source=excluded.source, story_points=excluded.story_points
  `);
  const tx = db.transaction(() => {
    for (const item of items ?? []) {
      const queues = parseQueuesJson(
        typeof item.queues_json === 'string' ? item.queues_json : JSON.stringify(item.queues_json ?? null),
      );
      const queue = item.queue ?? primaryQueue(queues);
      const enabled = enabledFromQueues(queues);
      upsert.run(
        id, item.fs_item_id, enabled, queue,
        JSON.stringify(queues),
        item.source ?? 'manual', item.story_points ?? null,
      );
    }
  });
  tx();
  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json({ ok: true });
});

briefingsRouter.put('/:id/params', (req, res) => {
  const id = Number(req.params.id);
  const { hourly_rate, accuracy, sp_cost_rub, phases_json, team_json } = req.body;
  db.prepare(`
    INSERT INTO briefing_params(briefing_id, hourly_rate, accuracy, sp_cost_rub, phases_json, team_json)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(briefing_id) DO UPDATE SET
      hourly_rate=excluded.hourly_rate, accuracy=excluded.accuracy,
      sp_cost_rub=excluded.sp_cost_rub, phases_json=excluded.phases_json, team_json=excluded.team_json
  `).run(
    id, hourly_rate, accuracy, sp_cost_rub,
    typeof phases_json === 'string' ? phases_json : JSON.stringify(phases_json),
    typeof team_json === 'string' ? team_json : JSON.stringify(team_json),
  );
  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json({ ok: true });
});

briefingsRouter.post('/:id/derive-fs', (req, res) => {
  const id = Number(req.params.id);
  const items = deriveFsFromSelections(id);
  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json({ items });
});

briefingsRouter.get('/:id/assessment', (req, res) => {
  const id = Number(req.params.id);
  const briefing = db.prepare(`SELECT id FROM briefings WHERE id=?`).get(id);
  if (!briefing) return res.status(404).json({ error: 'not found' });
  res.json(loadAssessment(id));
});

briefingsRouter.patch('/:id/assessment', (req, res) => {
  const id = Number(req.params.id);
  const briefing = db.prepare(`SELECT id FROM briefings WHERE id=?`).get(id);
  if (!briefing) return res.status(404).json({ error: 'not found' });

  ensureAssessmentRow(id);
  const body = req.body as {
    criteria?: SellerCriteria;
    project_type_id?: number | null;
    project_type_manual?: boolean;
    reset_project_type?: boolean;
    risks?: Partial<RisksC51C57>;
    risks_manual?: boolean;
    reset_risks?: boolean;
    org_volume?: Partial<OrgVolumeData>;
    org_volume_manual?: boolean;
    reset_org_volume?: boolean;
    headcount_category?: string;
    headcount_coeffs?: Record<string, number | string>;
    headcount_manual?: boolean;
    reset_headcount?: boolean;
    queue_calcs?: { queue: string; technology?: string; rate?: number; rate_manual?: boolean; reset_rate?: boolean }[];
  };

  const cur = db.prepare(`SELECT * FROM briefing_assessment WHERE briefing_id=?`).get(id) as Record<string, unknown>;

  let project_type_manual = cur.project_type_manual as number;
  let project_type_id = cur.project_type_id as number | null;
  if (body.reset_project_type) {
    project_type_manual = 0;
    project_type_id = null;
  } else {
    if (body.project_type_manual !== undefined) project_type_manual = body.project_type_manual ? 1 : 0;
    if (body.project_type_id !== undefined) project_type_id = body.project_type_id;
  }

  let risks_manual = cur.risks_manual as number;
  let risks_json = cur.risks_json as string;
  if (body.reset_risks) {
    risks_manual = 0;
    risks_json = '{}';
  } else {
    if (body.risks_manual !== undefined) risks_manual = body.risks_manual ? 1 : 0;
    if (body.risks) risks_json = JSON.stringify(body.risks);
  }

  let org_volume_manual = cur.org_volume_manual as number;
  let org_volume_json = cur.org_volume_json as string;
  if (body.reset_org_volume) {
    org_volume_manual = 0;
    org_volume_json = '{}';
  } else {
    if (body.org_volume_manual !== undefined) org_volume_manual = body.org_volume_manual ? 1 : 0;
    if (body.org_volume) org_volume_json = JSON.stringify(body.org_volume);
  }

  let headcount_manual = cur.headcount_manual as number;
  let headcount_category = cur.headcount_category as string | null;
  let headcount_coeffs_json = cur.headcount_coeffs_json as string;
  if (body.reset_headcount) {
    headcount_manual = 0;
    headcount_category = null;
    headcount_coeffs_json = '{}';
  } else {
    if (body.headcount_manual !== undefined) headcount_manual = body.headcount_manual ? 1 : 0;
    if (body.headcount_category !== undefined) headcount_category = body.headcount_category;
    if (body.headcount_coeffs) headcount_coeffs_json = JSON.stringify(body.headcount_coeffs);
  }

  const criteria_json = body.criteria !== undefined
    ? JSON.stringify(serializeSellerCriteria(body.criteria))
    : cur.criteria_json as string;

  db.prepare(`
    UPDATE briefing_assessment SET
      criteria_json=?, project_type_id=?, project_type_manual=?,
      risks_json=?, risks_manual=?,
      org_volume_json=?, org_volume_manual=?,
      headcount_category=?, headcount_coeffs_json=?, headcount_manual=?
    WHERE briefing_id=?
  `).run(
    criteria_json, project_type_id, project_type_manual,
    risks_json, risks_manual,
    org_volume_json, org_volume_manual,
    headcount_category, headcount_coeffs_json, headcount_manual,
    id,
  );

  if (body.queue_calcs) {
    const upsert = db.prepare(`
      INSERT INTO briefing_queue_calc(briefing_id, queue, technology, rate, rate_manual)
      VALUES (?,?,?,?,?)
      ON CONFLICT(briefing_id, queue) DO UPDATE SET
        technology=excluded.technology, rate=excluded.rate, rate_manual=excluded.rate_manual
    `);
    for (const qc of body.queue_calcs) {
      const existing = db.prepare(`SELECT * FROM briefing_queue_calc WHERE briefing_id=? AND queue=?`).get(id, qc.queue) as {
        technology: string | null; rate: number | null; rate_manual: number;
      } | undefined;

      let rate_manual = existing?.rate_manual ?? 0;
      let rate = existing?.rate ?? null;
      let technology = existing?.technology ?? null;

      if (qc.reset_rate) {
        rate_manual = 0;
        rate = null;
      } else {
        if (qc.rate_manual !== undefined) rate_manual = qc.rate_manual ? 1 : 0;
        if (qc.rate !== undefined) rate = qc.rate;
        if (qc.technology !== undefined) technology = qc.technology;
      }

      upsert.run(id, qc.queue, technology, rate, rate_manual);
    }
  }

  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json(loadAssessment(id));
});

briefingsRouter.get('/:id/calculate', (req, res) => {
  const result = calculateBriefing(Number(req.params.id));
  res.json(result);
});

briefingsRouter.post('/:id/generate-project', (req, res) => {
  const briefingId = Number(req.params.id);
  const { name, created_by } = req.body as { name?: string; created_by?: number };

  const briefing = db.prepare(`SELECT * FROM briefings WHERE id=?`).get(briefingId) as {
    name: string; project_id: number | null;
  } | undefined;
  if (!briefing) return res.status(404).json({ error: 'briefing not found' });
  if (briefing.project_id) return res.status(400).json({ error: 'project already generated', project_id: briefing.project_id });

  const template = db.prepare(`SELECT id FROM projects WHERE is_template=1 ORDER BY id LIMIT 1`).get() as { id: number } | undefined;
  if (!template) return res.status(400).json({ error: 'no template project found' });

  const projectName = name?.trim() || `Проект — ${briefing.name}`;
  const newProj = db.prepare(`INSERT INTO projects(name, type, is_template, created_by) VALUES (?, 'Стандартный проект', 0, ?)`)
    .run(projectName, created_by ?? null);
  const projectId = Number(newProj.lastInsertRowid);

  const fsItems = db.prepare(`
    SELECT bfs.*, fc.name, fc.phase, fc.base_work_id
    FROM briefing_fs_sel bfs
    JOIN fs_catalog fc ON fc.id = bfs.fs_item_id
    WHERE bfs.briefing_id=? AND bfs.enabled=1
    ORDER BY fc.phase, fc.queue
  `).all(briefingId) as { fs_item_id: number; queue: string; name: string; phase: string; base_work_id: string | null; story_points: number | null }[];

  const params = db.prepare(`SELECT team_json FROM briefing_params WHERE briefing_id=?`).get(briefingId) as { team_json: string } | undefined;
  const team = params?.team_json ? JSON.parse(params.team_json) : {};

  const insertRow = db.prepare(`
    INSERT INTO project_rows
    (project_id, sort_order, этап, работа, исполнитель, рамки, результаты, отчет_doc,
     длит_трудоемк, риск_этапа, компенсация_продаж,
     загрузка_рп, загрузка_аналит_конс, загрузка_аналит_эксп, загрузка_архит,
     загрузка_програм1, загрузка_програм2, загрузка_куратор)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const tx = db.transaction(() => {
    fsItems.forEach((item, idx) => {
      let baseWork: Record<string, unknown> | undefined;
      if (item.base_work_id) {
        baseWork = db.prepare(`SELECT * FROM base_works WHERE id=?`).get(item.base_work_id) as Record<string, unknown> | undefined;
      }
      const sp = item.story_points ?? 0;
      const длит = sp > 0 ? Math.max(1, Math.round(sp / 2)) : (baseWork?.длит_трудоемк as number ?? 1);
      insertRow.run(
        projectId, idx,
        item.phase || (baseWork?.этап as string) || '',
        item.name || (baseWork?.работа as string) || '',
        'ITLand/Заказчик',
        (baseWork?.рамки as string) || '',
        (baseWork?.результат as string) || '',
        (baseWork?.отчет_doc as string) || '',
        длит, baseWork?.риск_этапа ?? 0, 0,
        (team.рп ?? baseWork?.загрузка_рп ?? 0) * 100,
        (team.аналит_конс ?? baseWork?.загрузка_аналит_конс ?? 0) * 100,
        (team.аналит_эксп ?? baseWork?.загрузка_аналит_эксп ?? 0) * 100,
        (team.архит ?? baseWork?.загрузка_архит ?? 0) * 100,
        (team.програм1 ?? baseWork?.загрузка_програм1 ?? 0) * 100,
        (team.програм2 ?? baseWork?.загрузка_програм2 ?? 0) * 100,
        (team.куратор ?? baseWork?.загрузка_куратор ?? 0) * 100,
      );
    });
    db.prepare(`UPDATE briefings SET project_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(projectId, briefingId);
  });
  tx();

  res.json({ project_id: projectId });
});
