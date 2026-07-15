import React, { useState } from 'react';
import { createStakeholderRole, deleteStakeholderRole } from '../api';
import type { StakeholderRole } from '../types';

export default function StakeholderRolesNsi({
  items,
  onReload,
}: {
  items: StakeholderRole[];
  onReload: () => Promise<void>;
}) {
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await createStakeholderRole(trimmed);
      setNewName('');
      await onReload();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`Удалить роль «${name}»?`)) return;
    setBusy(true);
    try {
      await deleteStakeholderRole(id);
      await onReload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Справочник ролей заказчика (заинтересованные лица). Используется в блоке 1.1 гипотезы и в отборах брифа.
      </p>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-[10px] text-slate-400">Новая роль</label>
          <input
            className="w-full text-sm border rounded px-2 py-1"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); }}
          />
        </div>
        <button
          type="button"
          className="text-sm bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50"
          disabled={busy || !newName.trim()}
          onClick={() => void handleCreate()}
        >
          + Создать
        </button>
      </div>
      <div className="overflow-auto border border-slate-200 rounded">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="text-left p-2 border">Роль</th>
              <th className="p-2 border w-16" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={2} className="p-4 text-center text-slate-400">Нет ролей</td></tr>
            ) : (
              items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="p-2 border">{item.name}</td>
                  <td className="p-2 border text-center">
                    <button type="button" className="text-red-400 hover:text-red-600" onClick={() => void handleDelete(item.id, item.name)}>✕</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
