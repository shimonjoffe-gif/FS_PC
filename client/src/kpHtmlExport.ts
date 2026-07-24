import type {
  AssessmentScenario,
  BriefingAssessment,
  BriefingFsSel,
  BriefingProblemSel,
  BriefingSolutionSel,
  FsQueueKey,
  SellerCriteriaDef,
  Solution,
  TeamProportions,
} from './types';
import { FS_QUEUE_KEYS, FS_QUEUE_LABELS, anyQueueEnabled, itemQueues } from './types';
import type { AssessmentNsiCache } from './assessmentNsi';
import {
  CONTRACT_CRITERIA_DEFS,
  CONTRACT_FORMULA_ROW,
  ensureContractParams,
  computeAdvanceDeferralOk,
  contractCriteriaValue,
  ensureExtraCustomDocuments,
} from './sellerCriteria';
import {
  activeStandardDocuments,
  isAdditionalCatalogDoc,
  isDocumentEnabledRp,
  resolveDocumentRow,
  techLabel,
  type ExtraCustomDocument,
} from './standardDocuments';
import { buildKpVariantsExportPayload, type KpVariantsExportPayload } from './exportKpVariants';
import { getEvaluatedQueueKeys } from './assessmentCalc';
import { effectiveSolutionCommentForQueue } from './solutionCommentRelocation';
import {
  buildSolutionDisplayUnits,
  collectSolutionWithAncestors,
} from './utils/solutionDisplayGroups';

export type KpHtmlSolutionRow = {
  id: number;
  name: string;
  catalog_code?: string | null;
  variant: 'parent' | 'child' | 'standalone';
  /** queue key → Да */
  queues: Record<FsQueueKey, boolean>;
  comments: Partial<Record<FsQueueKey, string>>;
};

export type KpHtmlProblemBlock = {
  key: string;
  title: string;
  solutionRows: KpHtmlSolutionRow[];
};

export type KpHtmlSolutionFs = {
  solution_id: number;
  solution_name: string;
  fs_item_ids: number[];
  /** fs_item_id → required | optional (из НСИ solution→ФС) */
  nsi_links: Record<number, 'required' | 'optional'>;
};

export type BuildKpHtmlInput = {
  briefingName: string;
  snapshotName: string;
  frozenAt: string;
  problems: KpHtmlProblemBlock[];
  solutionFs: KpHtmlSolutionFs[];
  assessment: BriefingAssessment;
  fsItems: BriefingFsSel[];
  scenarios: AssessmentScenario[];
  selectedScenarioIds: string[];
  accuracyPct: number;
  defaultTeam: TeamProportions;
  queueLabels: Record<string, string>;
  nsi?: AssessmentNsiCache;
};

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return '—';
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

function yesNo(v: boolean): string {
  return v
    ? '<span class="yn yn-yes">Да</span>'
    : '<span class="yn yn-no">Нет</span>';
}

function nsiLinkBadge(type: 'required' | 'optional' | null | undefined): string {
  if (type === 'required') return '<span class="yn yn-yes">Да</span>';
  if (type === 'optional') return '<span class="yn yn-opt">Опц.</span>';
  return '<span class="yn yn-no">Нет</span>';
}

function queueCell(
  queues: Partial<Record<FsQueueKey, boolean>> | undefined,
  qKeys: FsQueueKey[],
  qLabels: Record<string, string>,
): string {
  const parts: string[] = [];
  for (const q of qKeys) {
    if (queues?.[q]) parts.push(qLabels[q] || FS_QUEUE_LABELS[q] || q);
  }
  return parts.length ? esc(parts.join(', ')) : '—';
}

function renderFsTable(
  kp: KpVariantsExportPayload,
  title: string,
  filterIds?: Set<number>,
  opts?: { bare?: boolean; nsiByFsId?: Record<number, 'required' | 'optional'> },
): string {
  const cols = kp.columns;
  const qKeys = kp.queue_keys;
  const qLabels = kp.queue_labels;
  const items = filterIds
    ? kp.fs_items.filter(it => filterIds.has(it.fs_item_id))
    : kp.fs_items;
  const showNsi = !!opts?.nsiByFsId;
  const colCount = 3 + cols.length + (showNsi ? 1 : 0);

  let head = '<tr><th>№</th><th>Пункт ФС</th>';
  if (showNsi) head += '<th class="c" title="Связь решение→ФС в НСИ">НСИ</th>';
  head += '<th>SP</th>';
  for (const c of cols) head += `<th>${esc(c.name)}</th>`;
  head += '</tr>';

  let body = '';
  let lastGroup: string | null = null;
  for (const it of items) {
    const g = `${it.group_prefix ? `${it.group_prefix}. ` : ''}${it.group_name || ''}`;
    if (g !== lastGroup) {
      lastGroup = g;
      body += `<tr class="group"><td colspan="${colCount}">${esc(g || 'Прочее')}</td></tr>`;
    }
    body += `<tr><td>${esc(it.prefix || '')}</td><td>${esc(it.name)}</td>`;
    if (showNsi) {
      body += `<td class="c">${nsiLinkBadge(opts!.nsiByFsId![it.fs_item_id])}</td>`;
    }
    body += `<td class="num">${esc(it.story_points)}</td>`;
    for (const c of cols) {
      body += `<td class="num">${queueCell(it.queues[c.id], qKeys, qLabels)}</td>`;
    }
    body += '</tr>';
  }
  if (!body) {
    body = `<tr><td colspan="${colCount}" class="empty">Нет пунктов</td></tr>`;
  }

  const note = showNsi
    ? 'Только просмотр. Колонка НСИ — Да / Опц. / Нет из связи решение→ФС. В ячейках варианта — очереди с «Да».'
    : 'Только просмотр. В ячейках варианта — очереди с «Да».';
  const table = `<p class="note">${note}</p>
    <div class="tbl-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  if (opts?.bare) return table;
  return `<section class="sec"><h2>${esc(title)}</h2>${table}</section>`;
}

function renderPhases(kp: KpVariantsExportPayload): string {
  const cols = kp.columns;
  let head = '<tr><th>Фаза</th>';
  for (const c of cols) head += `<th class="num">${esc(c.name)}</th>`;
  head += '</tr>';

  let body = '';
  for (const row of kp.phase_rows) {
    body += `<tr><td>${esc(row.label)}</td>`;
    for (const c of cols) body += `<td class="num">${money(row.totals[c.id])}</td>`;
    body += '</tr>';
  }
  body += '<tr class="total"><td>Итого ДО</td>';
  for (const c of cols) body += `<td class="num">${money(kp.grand_totals[c.id])}</td>`;
  body += '</tr>';

  return `<section class="sec"><h2>Таблица фаз (ДО)</h2>
    <p class="note">Итоги ДО по фазам для базы и выбранных вариантов.</p>
    <div class="tbl-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>
  </section>`;
}

function solutionSelectionQueue(sel: BriefingSolutionSel): FsQueueKey {
  const q = String(sel.queue ?? '1') as FsQueueKey;
  return FS_QUEUE_KEYS.includes(q) ? q : '1';
}

function emptyQueueFlags(): Record<FsQueueKey, boolean> {
  return Object.fromEntries(FS_QUEUE_KEYS.map(q => [q, false])) as Record<FsQueueKey, boolean>;
}

function aggregateGroupQueues(
  members: Solution[],
  selectedById: Map<number, BriefingSolutionSel>,
): Record<FsQueueKey, boolean> {
  const byQueue = emptyQueueFlags();
  for (const member of members) {
    const sel = selectedById.get(member.id);
    if (!sel) continue;
    byQueue[solutionSelectionQueue(sel)] = true;
  }
  return byQueue;
}

function rowFromSelection(
  sol: Solution,
  variant: 'parent' | 'child' | 'standalone',
  selectedById: Map<number, BriefingSolutionSel>,
  groupMembers?: Solution[],
): KpHtmlSolutionRow {
  const sel = selectedById.get(sol.id);
  const queues = variant === 'parent' && groupMembers
    ? aggregateGroupQueues(groupMembers, selectedById)
    : (() => {
        const q = emptyQueueFlags();
        if (sel) q[solutionSelectionQueue(sel)] = true;
        return q;
      })();
  const comments: Partial<Record<FsQueueKey, string>> = {};
  if (variant !== 'parent' && sel) {
    for (const q of FS_QUEUE_KEYS) {
      if (!queues[q]) continue;
      const text = effectiveSolutionCommentForQueue(sel, q).trim();
      if (text) comments[q] = text;
    }
  }
  return {
    id: sol.id,
    name: sol.name,
    catalog_code: sol.catalog_code ?? null,
    variant,
    queues,
    comments,
  };
}

function renderCustomer(problems: KpHtmlProblemBlock[], queueLabels: Record<string, string>): string {
  if (!problems.length) {
    return `<section class="sec"><h2>Заказчик</h2><p class="empty">Нет выбранных проблематик</p></section>`;
  }

  let html = '<section class="sec"><h2>Заказчик</h2><p class="note">Проблематики и решения по очередям (как на вкладке «Решения»). Группы — расчётные Да/Нет. Пустые очереди скрыты. Клик по решению — ФС по вариантам.</p>';
  for (const p of problems) {
    html += `<div class="problem"><div class="problem-title">${esc(p.title)}</div>`;
    if (!p.solutionRows.length) {
      html += '<p class="muted">Нет выбранных решений</p>';
    } else {
      const activeQueues = FS_QUEUE_KEYS.filter(q =>
        p.solutionRows.some(row => row.queues[q]),
      );
      if (!activeQueues.length) {
        html += '<p class="muted">Нет решений с «Да» по очередям</p>';
      } else {
        let qHead = '';
        for (const q of activeQueues) {
          const label = queueLabels[q] || FS_QUEUE_LABELS[q] || q;
          qHead += `<th class="c">${esc(label)}</th><th>Комментарий</th>`;
        }
        html += `<div class="tbl-wrap"><table class="sol-tbl"><thead><tr><th>Решение</th>${qHead}</tr></thead><tbody>`;
        for (const row of p.solutionRows) {
          const trClass = row.variant === 'parent' ? 'sol-parent' : row.variant === 'child' ? 'sol-child' : '';
          const pad = row.variant === 'child' ? ' style="padding-left:20px"' : '';
          const code = row.catalog_code ? `<span class="code">${esc(row.catalog_code)}</span> ` : '';
          const nameHtml = row.variant === 'parent'
            ? `<span class="sol-group">${code}${esc(row.name)}</span>`
            : `<button type="button" class="sol-link" data-sol="${row.id}">${code}${esc(row.name)}</button>`;
          html += `<tr class="${trClass}"><td${pad}>${nameHtml}</td>`;
          for (const q of activeQueues) {
            html += `<td class="c">${yesNo(!!row.queues[q])}</td>`;
            const comment = row.comments[q];
            html += `<td class="comment">${comment ? esc(comment) : '<span class="muted">—</span>'}</td>`;
          }
          html += '</tr>';
        }
        html += '</tbody></table></div>';
      }
    }
    html += '</div>';
  }
  html += '</section>';
  return html;
}

function renderAssumptions(assessment: BriefingAssessment): string {
  const c = assessment.criteria ?? {};

  const typeName = assessment.project_types?.find(t => t.id === assessment.project_type_id)?.name
    ?? assessment.auto_project_type?.name
    ?? '—';

  const docsCatalog = assessment.standard_documents_catalog ?? [];
  const typeCode = assessment.project_types?.find(t => t.id === assessment.project_type_id)?.code
    ?? assessment.auto_project_type?.code
    ?? '';
  const activeDocs = activeStandardDocuments(docsCatalog);
  const stdState = c.standard_documents ?? {};
  const extra = ensureExtraCustomDocuments(c);

  const stdDocs = activeDocs.filter(d => !isAdditionalCatalogDoc(d));
  const extraDocs = activeDocs.filter(d => isAdditionalCatalogDoc(d));

  let docRows = '';
  if (stdDocs.length) {
    docRows += '<tr class="sec-hdr"><td colspan="4">Стандартный набор документов</td></tr>';
    for (const doc of stdDocs) {
      const row = resolveDocumentRow(doc, stdState, typeCode);
      const enabled = isDocumentEnabledRp(doc, stdState, typeCode);
      docRows += `<tr><td>${esc(doc.label)}</td><td class="c">${yesNo(enabled)}</td><td class="c">${yesNo(!!row.op_value)}</td><td class="c">${esc(techLabel(doc.tech))}</td></tr>`;
    }
  }
  if (extraDocs.length || (extra as ExtraCustomDocument[]).length) {
    docRows += '<tr class="sec-hdr"><td colspan="4">Дополнительные документы (запрос заказчика)</td></tr>';
    for (const doc of extraDocs) {
      const row = resolveDocumentRow(doc, stdState, typeCode);
      const enabled = isDocumentEnabledRp(doc, stdState, typeCode);
      docRows += `<tr><td>${esc(doc.label)}</td><td class="c">${yesNo(enabled)}</td><td class="c">${yesNo(!!row.op_value)}</td><td class="c">${esc(techLabel(doc.tech))}</td></tr>`;
    }
    for (const doc of extra as ExtraCustomDocument[]) {
      docRows += `<tr><td>${esc(doc.label || 'Документ')}</td><td class="c">${yesNo(!!doc.rp_value)}</td><td class="c">${yesNo(!!doc.op_value)}</td><td class="c">${esc(techLabel(doc.tech))}</td></tr>`;
    }
  }

  const contractParams = ensureContractParams(c.contract_params);
  const advanceOk = computeAdvanceDeferralOk(contractParams);
  let contractRows = '';
  for (const d of CONTRACT_CRITERIA_DEFS as SellerCriteriaDef[]) {
    contractRows += `<tr><td>${esc(d.label)}</td><td class="c">${yesNo(contractCriteriaValue(c, d.key))}</td></tr>`;
  }
  contractRows += `<tr><td>${esc(CONTRACT_FORMULA_ROW.label)} <span class="muted">(формула)</span></td><td class="c">${yesNo(advanceOk)}</td></tr>`;

  const ov = assessment.org_volume ?? assessment.auto_org_volume;
  const evalQueues = getEvaluatedQueueKeys(ov);
  let orgRows = '';
  if (ov?.queues) {
    for (const q of evalQueues) {
      const qq = ov.queues[q];
      if (!qq) continue;
      orgRows += `<tr><td>${esc(FS_QUEUE_LABELS[q])}</td>
        <td class="num">${esc(qq.users ?? '—')}</td>
        <td class="num">${esc(qq.rp_rpo ?? '—')}</td>
        <td class="num">${esc(qq.executors ?? '—')}</td>
        <td class="num">${esc(qq.rg ?? '—')} / ${esc(qq.rg_regions ?? '—')}</td></tr>`;
    }
  }

  return `<section class="sec"><h2>Допущения (параметры оценки)</h2>

    <h3>Требования к работам и результатам</h3>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Критерий</th><th class="c">РП</th><th class="c">ОП</th><th class="c">Влияние на тип</th></tr></thead>
      <tbody>${docRows || '<tr><td colspan="4" class="empty">—</td></tr>'}</tbody>
    </table></div>

    <h3>Тип проекта</h3>
    <p>${esc(typeName)}</p>

    <h3>Орг. объём по очередям</h3>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Очередь</th><th class="num">Польз.</th><th class="num">РП/РПО</th><th class="num">Исполн.</th><th class="num">РГ (СПб/рег.)</th></tr></thead>
      <tbody>${orgRows || '<tr><td colspan="5" class="empty">Нет оцениваемых очередей</td></tr>'}</tbody>
    </table></div>

    <h3>Параметры договора / рисков договора</h3>
    <div class="fields">
      <div><span class="lbl">Версия PM</span> ${esc(contractParams.pm_version)}</div>
      <div><span class="lbl">Аванс</span> ${esc(Math.round(contractParams.advance_pct * 100))}%</div>
      <div><span class="lbl">Отсрочка</span> ${esc(contractParams.payment_deferral_days)} дн.</div>
      <div><span class="lbl">Макс. этап</span> ${contractParams.max_stage_duration_days != null ? esc(contractParams.max_stage_duration_days) + ' дн.' : '—'}</div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Условие</th><th class="c">Да/Нет</th></tr></thead>
      <tbody>${contractRows}</tbody>
    </table></div>
  </section>`;
}

function buildSolutionModals(
  solutionFs: KpHtmlSolutionFs[],
  kp: KpVariantsExportPayload,
): string {
  let modals = '';
  for (const sol of solutionFs) {
    const idSet = new Set(sol.fs_item_ids);
    const table = renderFsTable(kp, `ФС решения: ${sol.solution_name}`, idSet, {
      bare: true,
      nsiByFsId: sol.nsi_links,
    });
    modals += `<div class="modal" id="sol-${sol.solution_id}" hidden>
      <div class="modal-bg" data-close></div>
      <div class="modal-card">
        <div class="modal-hd">
          <strong>${esc(sol.solution_name)}</strong>
          <button type="button" class="close" data-close>✕</button>
        </div>
        <div class="modal-bd">${table}</div>
      </div>
    </div>`;
  }
  return modals;
}

const KP_CSS = `
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#f1f5f9;color:#1e293b;font-size:13px;line-height:1.45}
.wrap{max-width:1100px;margin:0 auto;padding:20px 16px 48px}
.hdr{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin-bottom:16px}
.hdr h1{margin:0 0 6px;font-size:18px}
.meta{color:#64748b;font-size:12px}
.sec{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-bottom:14px}
.sec h2{margin:0 0 8px;font-size:15px}
.sec h3{margin:16px 0 8px;font-size:13px;color:#334155}
.note,.muted{color:#64748b;font-size:11px;margin:0 0 8px}
.tbl-wrap{overflow:auto}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #e2e8f0;padding:6px 8px;vertical-align:top}
th{background:#f8fafc;text-align:left;font-weight:600;color:#475569}
td.num,th.num,td.c,th.c{text-align:center}
td.num{text-align:right;white-space:nowrap}
tr.group td{background:#fffbeb;font-weight:600;color:#78350f}
tr.total td{background:#eff6ff;font-weight:600}
tr.sec-hdr td{background:#f1f5f9;font-weight:600}
td.child{padding-left:20px;color:#475569}
.empty{text-align:center;color:#94a3b8}
.problem{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#f8fafc}
.problem-title{font-weight:600;margin-bottom:8px;font-size:13px}
.sol-tbl{margin-top:4px}
.sol-tbl th.c{white-space:nowrap}
.sol-parent td{background:#fffbeb}
.sol-group{font-weight:600;color:#78350f}
.sol-child td:first-child{color:#334155}
.sol-tbl td.comment{font-size:11px;color:#475569;max-width:180px;white-space:pre-wrap}
.sol-link{background:none;border:none;color:#2563eb;cursor:pointer;padding:0;font:inherit;text-align:left}
.sol-link:hover{text-decoration:underline}
.code{font-family:ui-monospace,monospace;color:#94a3b8;font-size:11px}
.yn{display:inline-block;min-width:36px;padding:2px 8px;border-radius:4px;font-size:11px}
.yn-yes{background:#dcfce7;color:#166534}
.yn-opt{background:#dbeafe;color:#1e40af}
.yn-no{background:#f1f5f9;color:#64748b}
.fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:10px}
.lbl{display:block;font-size:10px;color:#64748b}
.modal{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
.modal[hidden]{display:none!important}
.modal-bg{position:absolute;inset:0;background:rgba(0,0,0,.45)}
.modal-card{position:relative;background:#fff;border-radius:12px;max-width:960px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 40px rgba(0,0,0,.2)}
.modal-hd{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #e2e8f0}
.modal-bd{padding:12px 16px;overflow:auto}
.close{border:none;background:none;font-size:18px;cursor:pointer;color:#64748b}
`;

const KP_JS = `
document.addEventListener('click',function(e){
  var t=e.target;
  if(!t) return;
  var btn=t.closest&&t.closest('.sol-link');
  if(btn){
    var id=btn.getAttribute('data-sol');
    var m=document.getElementById('sol-'+id);
    if(m) m.hidden=false;
    return;
  }
  if(t.hasAttribute&&t.hasAttribute('data-close')||t.classList&&t.classList.contains('modal-bg')){
    var modal=t.closest('.modal');
    if(modal) modal.hidden=true;
  }
});
`;

/** Собрать self-contained HTML коммерческого предложения по вариантам. */
export function buildKpCommercialProposalHtml(input: BuildKpHtmlInput): string {
  const kp = buildKpVariantsExportPayload(
    input.assessment,
    input.fsItems,
    input.scenarios,
    input.selectedScenarioIds,
    input.accuracyPct,
    input.defaultTeam,
    input.queueLabels,
    input.nsi,
  );

  const body =
    renderCustomer(input.problems, input.queueLabels) +
    renderPhases(kp) +
    renderFsTable(kp, 'ФС: сравнение по вариантам') +
    renderAssumptions(input.assessment) +
    buildSolutionModals(input.solutionFs, kp);

  const frozen = (() => {
    try { return new Date(input.frozenAt).toLocaleString('ru-RU'); } catch { return input.frozenAt; }
  })();

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(input.snapshotName)}</title>
<style>${KP_CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="hdr">
    <h1>${esc(input.snapshotName)}</h1>
    <div class="meta">${esc(input.briefingName)} · зафиксировано ${esc(frozen)}</div>
    <div class="meta">Документ только для просмотра. Редактирование недоступно.</div>
  </header>
  ${body}
</div>
<script>${KP_JS}</script>
</body>
</html>`;
}

/** Построить блоки проблематик → таблица решений по очередям (с группами-родителями). */
export function buildKpProblemBlocks(
  problems: BriefingProblemSel[],
  selectedSolutions: BriefingSolutionSel[],
  solutionsByProblemId: Map<number, { id: number; name: string; catalog_code?: string | null }[]>,
  catalog: Solution[],
): KpHtmlProblemBlock[] {
  const selectedById = new Map(selectedSolutions.map(s => [s.id, s]));
  const selectedIds = new Set(selectedSolutions.map(s => s.id));
  const catalogById = new Map<number, Solution>();
  for (const s of catalog) catalogById.set(s.id, s);
  for (const s of selectedSolutions) {
    if (!catalogById.has(s.id)) {
      catalogById.set(s.id, {
        id: s.id,
        name: s.name,
        parent_id: s.parent_id ?? null,
        catalog_code: s.catalog_code ?? null,
        lcm_code: s.lcm_code ?? null,
        sort_order: s.sort_order ?? 0,
      });
    }
  }
  const allCatalog = [...catalogById.values()];

  function leafIdsForProblem(p: BriefingProblemSel): Set<number> {
    const leaf = new Set<number>();
    const catalogId = p.problem_id ?? p.linked_problem_id ?? null;
    if (catalogId != null) {
      for (const s of solutionsByProblemId.get(catalogId) ?? []) {
        if (selectedIds.has(s.id)) leaf.add(s.id);
      }
    }
    if (p.id != null) {
      for (const s of selectedSolutions) {
        if (s.source_problem_sel_id === p.id) leaf.add(s.id);
      }
    }
    return leaf;
  }

  function rowsFromLeafIds(leafIds: Set<number>): KpHtmlSolutionRow[] {
    if (leafIds.size === 0) return [];
    const withAncestors = collectSolutionWithAncestors(allCatalog, leafIds);
    const items = allCatalog.filter(s => withAncestors.has(s.id));
    const units = buildSolutionDisplayUnits(items);
    const rows: KpHtmlSolutionRow[] = [];
    for (const unit of units) {
      if (unit.kind === 'group') {
        const members = [unit.parent, ...unit.children];
        rows.push(rowFromSelection(unit.parent, 'parent', selectedById, members));
        for (const child of unit.children) {
          rows.push(rowFromSelection(child, 'child', selectedById));
        }
      } else {
        rows.push(rowFromSelection(unit.item, 'standalone', selectedById));
      }
    }
    return rows;
  }

  const blocks: KpHtmlProblemBlock[] = [];
  const coveredIds = new Set<number>();

  for (const p of problems) {
    const title = (p.problem_name || p.custom_text || p.linked_problem_name || 'Проблематика').trim();
    const leafIds = leafIdsForProblem(p);
    const solutionRows = rowsFromLeafIds(leafIds);
    for (const row of solutionRows) coveredIds.add(row.id);
    blocks.push({
      key: String(p.id ?? p.problem_id ?? title),
      title,
      solutionRows,
    });
  }

  // Решения без привязки к проблематике (родители выбранных детей уже в coveredIds)
  const orphanLeaf = new Set<number>();
  for (const id of selectedIds) {
    if (!coveredIds.has(id)) orphanLeaf.add(id);
  }
  if (orphanLeaf.size > 0) {
    const orphanRows = rowsFromLeafIds(orphanLeaf);
    if (orphanRows.length) {
      blocks.push({
        key: 'orphans',
        title: 'Решения без привязки к проблематике',
        solutionRows: orphanRows,
      });
    }
  }

  return blocks;
}

export function buildKpSolutionFsList(
  solutions: BriefingSolutionSel[],
  fsLinks: { solution_id: number; fs_item_id: number; link_type?: 'required' | 'optional' }[],
  fsItems: BriefingFsSel[],
  /** Id групп-родителей — без кликабельной карточки ФС */
  groupParentIds?: Set<number>,
): KpHtmlSolutionFs[] {
  const enabledIds = new Set(
    fsItems.filter(it => anyQueueEnabled(itemQueues(it))).map(it => it.fs_item_id),
  );
  return solutions
    .filter(s => !groupParentIds?.has(s.id))
    .map(s => {
      const links = fsLinks.filter(l => l.solution_id === s.id);
      const nsi_links: Record<number, 'required' | 'optional'> = {};
      const fs_item_ids: number[] = [];
      for (const l of links) {
        const lt = l.link_type === 'optional' ? 'optional' : 'required';
        nsi_links[l.fs_item_id] = lt;
        if (enabledIds.has(l.fs_item_id)) fs_item_ids.push(l.fs_item_id);
      }
      return {
        solution_id: s.id,
        solution_name: s.name,
        fs_item_ids,
        nsi_links,
      };
    });
}
