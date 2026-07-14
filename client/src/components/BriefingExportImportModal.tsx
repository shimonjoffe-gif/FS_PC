import React, { useEffect, useMemo, useState } from 'react';
import type { ExportBlockKey, ExportBlocks } from '../types';
import {
  DEFAULT_EXPORT_BLOCKS,
  EXPORT_BLOCK_LABELS,
  EXPORT_FILL_ORDER,
  normalizeExportBlocksForFill,
} from '../types';
import {
  exportBriefingHtml,
  previewBriefingHtmlImport,
  importBriefingHtml,
} from '../api';

type Mode = 'export' | 'import';

const BLOCK_KEYS = EXPORT_FILL_ORDER.filter(
  k => k !== 'assessment_headcount' && k !== 'assessment_org_volume',
);

const IMPORT_BLOCK_LABELS: Partial<Record<ExportBlockKey, string>> = {
  problems: 'Проблематики (в составе заказчика)',
};

interface Props {
  mode: Mode;
  briefingId: number;
  briefingName: string;
  onClose: () => void;
  onImported?: () => void;
}

export default function BriefingExportImportModal({
  mode,
  briefingId,
  briefingName,
  onClose,
  onImported,
}: Props) {
  const [blocks, setBlocks] = useState<ExportBlocks>({ ...DEFAULT_EXPORT_BLOCKS });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [importBlocks, setImportBlocks] = useState<Partial<ExportBlocks>>({});
  const [preview, setPreview] = useState<{
    blocks: ExportBlockKey[];
    briefing_name: string;
    exported_at: string;
    file_briefing_id: number;
    warnings: string[];
  } | null>(null);
  const [result, setResult] = useState<{ applied: string[]; warnings: string[] } | null>(null);
  const [step, setStep] = useState<'pick' | 'confirm' | 'done'>('pick');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const importBlockOptions = useMemo(() => {
    if (!preview) return BLOCK_KEYS;
    return preview.blocks;
  }, [preview]);

  function blockLabel(key: ExportBlockKey) {
    return IMPORT_BLOCK_LABELS[key] ?? EXPORT_BLOCK_LABELS[key];
  }

  function toggleBlock(key: ExportBlockKey) {
    setBlocks(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (key === 'customer') next.problems = next.customer;
      if (key === 'customer' || key === 'assessment_criteria') {
        next.assessment_org_volume = next.customer || next.assessment_criteria;
      }
      return next;
    });
  }

  function toggleImportBlock(key: ExportBlockKey) {
    setImportBlocks(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      await exportBriefingHtml(briefingId, normalizeExportBlocksForFill(blocks));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleFilePick(f: File | null) {
    setFile(f);
    setPreview(null);
    setResult(null);
    setStep('pick');
    setError(null);
    if (!f) return;
    setBusy(true);
    try {
      const html = await f.text();
      const p = await previewBriefingHtmlImport(briefingId, html, {
        mode: importMode,
        blocks: importMode === 'merge' ? importBlocks : undefined,
      });
      setPreview(p);
      if (importMode === 'merge') {
        const next: Partial<ExportBlocks> = {};
        for (const k of p.blocks) next[k] = importBlocks[k] ?? true;
        setImportBlocks(next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function refreshPreview() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const html = await file.text();
      const p = await previewBriefingHtmlImport(briefingId, html, {
        mode: importMode,
        blocks: importMode === 'merge' ? importBlocks : undefined,
      });
      setPreview(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleImportConfirm() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const html = await file.text();
      const res = await importBriefingHtml(briefingId, html, {
        mode: importMode,
        blocks: importMode === 'merge' ? importBlocks : undefined,
      });
      setResult(res);
      setStep('done');
      onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-100 shrink-0">
          <div>
            <div className="text-sm font-semibold text-slate-800">
              {mode === 'export' ? 'Выгрузить для заказчика' : 'Загрузить от заказчика'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate" title={briefingName}>
              {briefingName}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {mode === 'export' && (
            <>
              <p className="text-xs text-slate-500">
                Будет сформирован HTML-файл для заполнения заказчиком в браузере. Внутренние данные (риски, ставки, РП) не включаются.
              </p>
              <div className="space-y-1">
                {BLOCK_KEYS.map(key => (
                  <label key={key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={blocks[key]}
                      onChange={() => toggleBlock(key)}
                    />
                    {blockLabel(key)}
                  </label>
                ))}
              </div>
            </>
          )}

          {mode === 'import' && step !== 'done' && (
            <>
              <label className="block text-xs text-slate-500">
                HTML-файл от заказчика
                <input
                  type="file"
                  accept=".html,text/html"
                  className="mt-1 block w-full text-sm"
                  onChange={e => handleFilePick(e.target.files?.[0] ?? null)}
                />
              </label>

              {file && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-600">Режим обновления</div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => { setImportMode('replace'); setStep('pick'); }}
                    />
                    Заменить все разделы из файла
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'merge'}
                      onChange={() => { setImportMode('merge'); setStep('pick'); }}
                    />
                    Обновить только выбранные разделы
                  </label>
                </div>
              )}

              {importMode === 'merge' && preview && (
                <div className="space-y-1 border border-slate-100 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-2">Разделы в файле — отметьте для импорта:</div>
                  {importBlockOptions.map(key => (
                    <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importBlocks[key] ?? false}
                        onChange={() => toggleImportBlock(key)}
                      />
                      {blockLabel(key)}
                    </label>
                  ))}
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline mt-2"
                    onClick={refreshPreview}
                  >
                    Обновить предпросмотр
                  </button>
                </div>
              )}

              {preview && (
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-xs space-y-1">
                  <div><span className="text-slate-500">Файл:</span> {preview.briefing_name}</div>
                  <div><span className="text-slate-500">Экспорт:</span> {new Date(preview.exported_at).toLocaleString('ru-RU')}</div>
                  <div>
                    <span className="text-slate-500">Разделы:</span>{' '}
                    {preview.blocks.map(b => blockLabel(b)).join(', ')}
                  </div>
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="text-amber-700">⚠ {w}</div>
                  ))}
                </div>
              )}
            </>
          )}

          {mode === 'import' && step === 'done' && result && (
            <div className="space-y-2 text-sm">
              <div className="text-green-700 font-medium">Импорт выполнен</div>
              <div className="text-xs text-slate-600">
                Обновлено: {result.applied.map(a => blockLabel(a as ExportBlockKey) ?? a).join(', ') || '—'}
              </div>
              {result.warnings.map((w, i) => (
                <div key={i} className="text-xs text-amber-700">⚠ {w}</div>
              ))}
            </div>
          )}

          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100 shrink-0">
          {mode === 'export' && (
            <button
              type="button"
              disabled={busy || !BLOCK_KEYS.some(k => blocks[k])}
              onClick={handleExport}
              className="text-sm px-4 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {busy ? 'Формирование…' : 'Скачать HTML'}
            </button>
          )}
          {mode === 'import' && step !== 'done' && (
            <button
              type="button"
              disabled={busy || !preview}
              onClick={() => { setStep('confirm'); handleImportConfirm(); }}
              className="text-sm px-4 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {busy ? 'Импорт…' : 'Применить'}
            </button>
          )}
          {mode === 'import' && step === 'done' && (
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-4 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              Закрыть
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
