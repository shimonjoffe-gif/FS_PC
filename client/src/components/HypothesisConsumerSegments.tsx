import React, { useMemo, useState } from 'react';
import { createActivityType, createSegment, createStakeholderRole } from '../api';
import type { ActivityType, HypothesisStakeholderRoleRow, Segment, StakeholderRole } from '../types';

const STAKEHOLDER_KIND_OPTIONS = ['ЛПР', 'ФЗ', 'Исполнитель'] as const;

export default function HypothesisConsumerSegments({
  segmentIds,
  onSegmentIdsChange,
  activityTypeIds,
  onActivityTypeIdsChange,
  activityTypes,
  onActivityTypeCreated,
  stakeholderRoles,
  onStakeholderRolesChange,
  allStakeholderRoles,
  onStakeholderRoleCreated,
  triggers,
  onTriggersChange,
  segments,
  onSegmentCreated,
  segmentsDescription,
  onSegmentsDescriptionChange,
}: {
  segmentIds: number[];
  onSegmentIdsChange: (ids: number[]) => void;
  activityTypeIds: number[];
  onActivityTypeIdsChange: (ids: number[]) => void;
  activityTypes: ActivityType[];
  onActivityTypeCreated?: (type: ActivityType) => void;
  stakeholderRoles: HypothesisStakeholderRoleRow[];
  onStakeholderRolesChange: (rows: HypothesisStakeholderRoleRow[]) => void;
  allStakeholderRoles: StakeholderRole[];
  onStakeholderRoleCreated?: (role: StakeholderRole) => void;
  triggers: string;
  onTriggersChange: (value: string) => void;
  segments: Segment[];
  onSegmentCreated?: (segment: Segment) => void;
  segmentsDescription: string;
  onSegmentsDescriptionChange: (value: string) => void;
}) {
  const [newActivityName, setNewActivityName] = useState('');
  const [pickActivityId, setPickActivityId] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [pickRoleId, setPickRoleId] = useState('');
  const [pickSegmentId, setPickSegmentId] = useState('');
  const [newSegmentName, setNewSegmentName] = useState('');
  const [extraActivityTypes, setExtraActivityTypes] = useState<ActivityType[]>([]);
  const [extraStakeholderRoles, setExtraStakeholderRoles] = useState<StakeholderRole[]>([]);
  const [extraSegments, setExtraSegments] = useState<Segment[]>([]);

  const activityTypesList = useMemo(() => {
    const map = new Map(activityTypes.map(a => [a.id, a]));
    for (const a of extraActivityTypes) map.set(a.id, a);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [activityTypes, extraActivityTypes]);

  const stakeholderRolesList = useMemo(() => {
    const map = new Map(allStakeholderRoles.map(r => [r.id, r]));
    for (const r of extraStakeholderRoles) map.set(r.id, r);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [allStakeholderRoles, extraStakeholderRoles]);

  const segmentsList = useMemo(() => {
    const map = new Map(segments.map(s => [s.id, s]));
    for (const s of extraSegments) map.set(s.id, s);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [segments, extraSegments]);

  const usedRoleIds = new Set(stakeholderRoles.map(r => r.id));
  const usedSegmentIds = new Set(segmentIds);
  const usedActivityIds = new Set(activityTypeIds);
  const selectedSegments = segmentsList.filter(s => usedSegmentIds.has(s.id));
  const selectedActivityTypes = activityTypesList.filter(a => usedActivityIds.has(a.id));

  function addActivityFromCatalog() {
    const id = Number(pickActivityId);
    if (!id || usedActivityIds.has(id)) return;
    onActivityTypeIdsChange([...activityTypeIds, id]);
    setPickActivityId('');
  }

  async function addActivityType() {
    const trimmed = newActivityName.trim();
    if (!trimmed) return;
    try {
      const created = await createActivityType(trimmed);
      setExtraActivityTypes(prev => [...prev, created]);
      onActivityTypeCreated?.(created);
      if (!activityTypeIds.includes(created.id)) {
        onActivityTypeIdsChange([...activityTypeIds, created.id]);
      }
      setNewActivityName('');
    } catch {
      // ignore
    }
  }

  function addSegmentFromCatalog() {
    const id = Number(pickSegmentId);
    if (!id || usedSegmentIds.has(id)) return;
    onSegmentIdsChange([...segmentIds, id]);
    setPickSegmentId('');
  }

  async function addNewSegment() {
    const trimmed = newSegmentName.trim();
    if (!trimmed) return;
    try {
      const created = await createSegment(trimmed);
      setExtraSegments(prev => [...prev, created]);
      onSegmentCreated?.(created);
      if (!segmentIds.includes(created.id)) {
        onSegmentIdsChange([...segmentIds, created.id]);
      }
      setNewSegmentName('');
    } catch {
      // ignore
    }
  }

  async function addStakeholderRoleFromCatalog() {
    const id = Number(pickRoleId);
    if (!id || usedRoleIds.has(id)) return;
    const role = stakeholderRolesList.find(r => r.id === id);
    if (!role) return;
    onStakeholderRolesChange([...stakeholderRoles, { id: role.id, name: role.name, description: '' }]);
    setPickRoleId('');
  }

  async function addNewStakeholderRole() {
    const trimmed = newRoleName.trim();
    if (!trimmed) return;
    try {
      const created = await createStakeholderRole(trimmed);
      setExtraStakeholderRoles(prev => [...prev, created]);
      onStakeholderRoleCreated?.(created);
      onStakeholderRolesChange([...stakeholderRoles, { id: created.id, name: created.name, description: '' }]);
      setNewRoleName('');
    } catch {
      // ignore
    }
  }

  function parseStakeholderKinds(value: string | null | undefined): string[] {
    if (!value) return [];
    return value
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .filter((part, idx, arr) => arr.indexOf(part) === idx);
  }

  function toggleStakeholderKind(rowIndex: number, kind: string) {
    const current = parseStakeholderKinds(stakeholderRoles[rowIndex]?.description);
    const next = current.includes(kind)
      ? current.filter(item => item !== kind)
      : [...current, kind];
    onStakeholderRolesChange(
      stakeholderRoles.map((row, idx) => idx === rowIndex ? { ...row, description: next.join(', ') || null } : row),
    );
  }

  return (
    <div className="space-y-3 text-[11px]">
      <section>
        <div className="font-semibold text-slate-600 mb-1">Описание</div>
        <textarea
          className="lean-canvas-textarea min-h-[56px] text-[11px]"
          value={segmentsDescription}
          placeholder="Описание сегментов потребителей"
          onChange={e => onSegmentsDescriptionChange(e.target.value)}
        />
      </section>

      <section>
        <div className="font-semibold text-slate-600 mb-1">1. Сегменты</div>
        {selectedSegments.length === 0 ? (
          <p className="text-[10px] text-slate-400 italic mb-1">Сегменты не выбраны</p>
        ) : (
          <ul className="space-y-1 mb-2">
            {selectedSegments.map(seg => (
              <li key={seg.id} className="flex items-center justify-between gap-1 border border-slate-100 rounded px-1.5 py-1 bg-slate-50/50">
                <span className="font-medium text-slate-700">{seg.name}</span>
                <button
                  type="button"
                  className="text-red-400 text-[10px]"
                  onClick={() => onSegmentIdsChange(segmentIds.filter(id => id !== seg.id))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-1 mb-1">
          <select
            className="flex-1 text-[10px] border rounded px-1 py-0.5 min-w-0"
            value={pickSegmentId}
            onChange={e => setPickSegmentId(e.target.value)}
          >
            <option value="">Из справочника…</option>
            {segmentsList.filter(s => !usedSegmentIds.has(s.id)).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button type="button" className="text-[10px] px-2 border rounded" onClick={addSegmentFromCatalog}>+</button>
        </div>
        <div className="flex gap-1">
          <input
            className="flex-1 text-[10px] border rounded px-1 py-0.5"
            placeholder="Новый сегмент"
            value={newSegmentName}
            onChange={e => setNewSegmentName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addNewSegment(); } }}
          />
          <button type="button" className="text-[10px] px-2 border rounded" onClick={() => void addNewSegment()}>+</button>
        </div>
      </section>

      <section>
        <div className="font-semibold text-slate-600 mb-1">2. Вид деятельности</div>
        {selectedActivityTypes.length === 0 ? (
          <p className="text-[10px] text-slate-400 italic mb-1">Виды деятельности не выбраны</p>
        ) : (
          <ul className="space-y-1 mb-2">
            {selectedActivityTypes.map(at => (
              <li key={at.id} className="flex items-center justify-between gap-1 border border-slate-100 rounded px-1.5 py-1 bg-slate-50/50">
                <span className="font-medium text-slate-700">{at.name}</span>
                <button
                  type="button"
                  className="text-red-400 text-[10px]"
                  onClick={() => onActivityTypeIdsChange(activityTypeIds.filter(id => id !== at.id))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-1 mb-1">
          <select
            className="flex-1 text-[10px] border rounded px-1 py-0.5 min-w-0"
            value={pickActivityId}
            onChange={e => setPickActivityId(e.target.value)}
          >
            <option value="">Из справочника…</option>
            {activityTypesList.filter(a => !usedActivityIds.has(a.id)).map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button type="button" className="text-[10px] px-2 border rounded" onClick={addActivityFromCatalog}>+</button>
        </div>
        <div className="flex gap-1">
          <input
            className="flex-1 text-[10px] border rounded px-1 py-0.5"
            placeholder="Новый вид деятельности"
            value={newActivityName}
            onChange={e => setNewActivityName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addActivityType(); } }}
          />
          <button type="button" className="text-[10px] px-2 border rounded" onClick={() => void addActivityType()}>+</button>
        </div>
      </section>

      <section>
        <div className="font-semibold text-slate-600 mb-1">3. Заказчик (заинтересованные лица)</div>
        {stakeholderRoles.length === 0 ? (
          <p className="text-[10px] text-slate-400 italic mb-1">Роли не выбраны</p>
        ) : (
          <ul className="space-y-2 mb-2">
            {stakeholderRoles.map((row, idx) => (
              <li key={row.id} className="border border-slate-100 rounded p-1.5 bg-slate-50/50">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-medium text-slate-700">{row.name}</span>
                  <button
                    type="button"
                    className="text-red-400 text-[10px]"
                    onClick={() => onStakeholderRolesChange(stakeholderRoles.filter((_, i) => i !== idx))}
                  >
                    ✕
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 mb-1">Кто он</div>
                <div className="flex flex-wrap gap-1">
                  {STAKEHOLDER_KIND_OPTIONS.map(kind => {
                    const active = parseStakeholderKinds(row.description).includes(kind);
                    return (
                      <button
                        key={kind}
                        type="button"
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                        onClick={() => toggleStakeholderKind(idx, kind)}
                      >
                        {kind}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-1 mb-1">
          <select
            className="flex-1 text-[10px] border rounded px-1 py-0.5 min-w-0"
            value={pickRoleId}
            onChange={e => setPickRoleId(e.target.value)}
          >
            <option value="">Из справочника…</option>
            {stakeholderRolesList.filter(r => !usedRoleIds.has(r.id)).map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button type="button" className="text-[10px] px-2 border rounded" onClick={() => void addStakeholderRoleFromCatalog()}>+</button>
        </div>
        <div className="flex gap-1">
          <input
            className="flex-1 text-[10px] border rounded px-1 py-0.5"
            placeholder="Новая роль"
            value={newRoleName}
            onChange={e => setNewRoleName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addNewStakeholderRole(); } }}
          />
          <button type="button" className="text-[10px] px-2 border rounded" onClick={() => void addNewStakeholderRole()}>+</button>
        </div>
      </section>

      <section>
        <div className="font-semibold text-slate-600 mb-1">4. Триггеры</div>
        <textarea
          className="lean-canvas-textarea min-h-[72px] text-[11px]"
          value={triggers}
          placeholder="Триггеры покупки / внедрения"
          onChange={e => onTriggersChange(e.target.value)}
        />
      </section>
    </div>
  );
}
