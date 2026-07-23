/**
 * Seed hypothesis «Капстрой минимальный объем» with mapped solutions + FS links.
 * Run: node scripts/seed-capstroy-min-volume.mjs
 */
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const API = process.env.API_BASE || 'http://localhost:3001/api/catalog';
const DB_PATH = path.join(root, 'data', 'projects.db');

const HYP_NAME = 'Капстрой минимальный объем';
const PROBLEM_NAME = 'Капстрой минимальный объем';
const ACTIVITY_TYPE_ID = 7; // Кап.строй

const NEW_SOLUTIONS = [
  'Реестр проектов, объектов, портфелей и программ',
  'Портфельные/программные KPI проектов, объектов',
  'Отчетность',
  'Дашборды',
  'Специализированный дашборд по объекту',
  'Монитор проекта (ключевые KPI проекта/объекта)',
  'Проектные Gates (Ворота качества проекта и чек-листы)',
];

/** Existing solution ids from mapping */
const EXISTING = {
  ksg: 495,
  roadmap: 498,
  lifecycle: 496,
  stagesKt: 497,
  endToEndBudget: 500,
  controlEconomy: 509,
};

/**
 * Best-effort FS links (item + detail). User will fine-tune in UI.
 * Keys filled after new solution ids are known.
 */
function buildFsPlan(newIds) {
  return [
    { solution_id: EXISTING.ksg, fs: [3650, 3657], note: 'КСГ / календарно-сетевое' },
    { solution_id: EXISTING.roadmap, fs: [3670, 3654], note: 'Дорожная карта → ЖЦ + вехи' },
    { solution_id: EXISTING.lifecycle, fs: [3670], note: 'Единый ЖЦ' },
    { solution_id: EXISTING.stagesKt, fs: [3650, 3654], note: 'Этапы и КТ → календарь + вехи' },
    { solution_id: newIds.registry, fs: [3632, 3638], note: 'Реестр → моделирование/формирование портфеля' },
    { solution_id: newIds.portfolioKpi, fs: [3645, 3646, 3672], note: 'Портфельные KPI' },
    { solution_id: newIds.reporting, fs: [3854], note: 'Отчетность' },
    { solution_id: newIds.dashboards, fs: [], note: 'Дашборды — ФС не найдено' },
    { solution_id: EXISTING.endToEndBudget, fs: [3716, 3950], note: 'Сквозное сроки/бюджеты' },
    { solution_id: EXISTING.controlEconomy, fs: [3716, 3729, 3730], note: 'Контроль экономики' },
    { solution_id: newIds.objectDash, fs: [], note: 'Дашборд по объекту — ФС не найдено' },
    { solution_id: newIds.monitor, fs: [3672, 3674, 3753, 3754], note: 'Монитор проекта / KPI' },
    { solution_id: newIds.gates, fs: [3643, 3644], note: 'Gates / ворота качества' },
  ];
}

async function api(method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${urlPath} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  // Idempotency: if hypothesis already exists, abort with clear message
  const list = await api('GET', '/hypotheses');
  const existingHyp = list.find((h) => h.name === HYP_NAME);
  if (existingHyp) {
    console.error(`Гипотеза уже есть: id=${existingHyp.id}. Удалите её вручную или переименуйте, затем перезапустите скрипт.`);
    process.exit(1);
  }

  console.log('1) Создаю гипотезу…');
  const hyp = await api('POST', '/hypotheses', {
    name: HYP_NAME,
    activity_type_ids: [ACTIVITY_TYPE_ID],
  });
  console.log('   hypothesis id =', hyp.id);

  console.log('2) Создаю новые решения…');
  const created = {};
  const keys = ['registry', 'portfolioKpi', 'reporting', 'dashboards', 'objectDash', 'monitor', 'gates'];
  for (let i = 0; i < NEW_SOLUTIONS.length; i++) {
    const name = NEW_SOLUTIONS[i];
    const sol = await api('POST', '/solutions', { name });
    created[keys[i]] = sol.id;
    console.log(`   ${keys[i]}: id=${sol.id} — ${name}`);
  }

  const solutionIds = [
    EXISTING.ksg,
    EXISTING.roadmap,
    EXISTING.lifecycle,
    EXISTING.stagesKt,
    created.registry,
    created.portfolioKpi,
    created.reporting,
    created.dashboards,
    EXISTING.endToEndBudget,
    EXISTING.controlEconomy,
    created.objectDash,
    created.monitor,
    created.gates,
  ];

  console.log('3) Сохраняю проблему + связи решений…');
  const saved = await api('PUT', `/hypotheses/${hyp.id}`, {
    name: HYP_NAME,
    activity_type_ids: [ACTIVITY_TYPE_ID],
    problems: [
      {
        name: PROBLEM_NAME,
        solution_ids: solutionIds,
      },
    ],
  });
  console.log('   problems:', (saved.problems || []).map((p) => `${p.id}:${p.name}`).join(', '));
  console.log('   solutions count:', (saved.solutions || saved.problems?.[0]?.solutions || []).length);

  console.log('4) Пишу FS-связи в БД (item + detail)…');
  const db = new Database(DB_PATH);
  const ins = db.prepare(`
    INSERT OR IGNORE INTO solution_fs_map(solution_id, fs_item_id, link_type) VALUES (?, ?, 'required')
  `);
  // Also mark fs_mapped if column exists
  const solCols = db.prepare(`PRAGMA table_info(solutions)`).all().map((c) => c.name);
  const hasFsMapped = solCols.includes('fs_mapped');
  const markMapped = hasFsMapped
    ? db.prepare(`UPDATE solutions SET fs_mapped=1 WHERE id=?`)
    : null;

  const plan = buildFsPlan(created);
  const tx = db.transaction(() => {
    for (const row of plan) {
      for (const fsId of row.fs) {
        // Verify FS exists
        const fs = db.prepare(`SELECT id FROM fs_catalog WHERE id=?`).get(fsId);
        if (!fs) {
          console.warn(`   skip missing fs ${fsId} for solution ${row.solution_id}`);
          continue;
        }
        ins.run(row.solution_id, fsId);
      }
      if (row.fs.length && markMapped) markMapped.run(row.solution_id);
      console.log(`   sol ${row.solution_id}: [${row.fs.join(', ') || '—'}] — ${row.note}`);
    }
  });
  tx();
  db.close();

  console.log('\nГотово.');
  console.log(`Гипотеза id=${hyp.id}: «${HYP_NAME}»`);
  console.log('Откройте НСИ → Гипотезы и скорректируйте ФС/формулировки при необходимости.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
