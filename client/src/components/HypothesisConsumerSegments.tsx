import React, { useMemo, useState } from 'react';
import { createActivityType, createStakeholderRole } from '../api';
import type { ActivityType, HypothesisStakeholderRoleRow, Segment, StakeholderRole } from '../types';

function ChipToggle({
  items,
  selectedIds,
  onChange,
}: {
  items: { id: number; name: string }[];
  selectedIds: Set<number>;
  onChange: (ids: Set<number>) => void;
}) {
  if (items.length === 0) {
    return <p className="text-[10px] text-slate-400 italic">Справочник пуст</p>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(item => {
        const active = selectedIds.has(item.id);
        return (
          <button
            key={item.id}
            type="button"
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              active
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            onClick={() => {
              const next = new Set(selectedIds);
              if (next.has(item.id)) next.delete(item.id);
              else next.add(item.id);
              onChange(next);
            }}
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}

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
}) {
  const [newActivityName, setNewActivityName] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [pickRoleId, setPickRoleId] = useState('');
  const [extraActivityTypes, setExtraActivityTypes] = useState<ActivityType[]>([]);
  const [extraStakeholderRoles, setExtraStakeholderRoles] = useState<StakeholderRole[]>([]);

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

  const usedRoleIds = new Set(stakeholderRoles.map(r => r.id));

  async function addActivityType() {
    const trimmed = newActivityName.trim();
    if (!trimmed) return;
    try {
      const created = await createActivityType(trimmed);
      setExtraActivityTypes(prev => [...prev, created]);
      onActivityTypeCreated?.(created);
      onActivityTypeIdsChange([...new Set([...activityTypeIds, created.id])]);
      setNewActivityName('');
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

  return (
    <div className="space-y-3 text-[11px]">
      <section>
        <div className="font-semibold text-slate-600 mb-1">1. Сегменты</div>
        <ChipToggle
          items={segments}
          selectedIds={new Set(segmentIds)}
          onChange={next => onSegmentIdsChange([...next])}
        />
      </section>

      <section>
        <div className="font-semibold text-slate-600 mb-1">2. Вид деятельности</div>
        <ChipToggle
          items={activityTypesList}
          selectedIds={new Set(activityTypeIds)}
          onChange={next => onActivityTypeIdsChange([...next])}
        />
        <div className="flex gap-1 mt-1">
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
                <textarea
                  className="w-full text-[10px] border rounded px-1 py-0.5 min-h-[2.5rem]"
                  placeholder="Что будет делать в системе"
                  value={row.description ?? ''}
                  onChange={e => onStakeholderRolesChange(
                    stakeholderRoles.map((r, i) => i === idx ? { ...r, description: e.target.value } : r),
                  )}
                />
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
