import { useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';
import { formatGroupedInteger, parseGroupedInteger } from '../utils/formatNumber';
import { numericInputHandlers } from '../utils/numericInputHandlers';

const VALUE_INPUT_CLASS =
  'min-w-[6.75rem] w-full max-w-[9.5rem] text-right border rounded px-2 py-1 tabular-nums';

type Props = {
  value: number;
  autoValue: number;
  step?: number;
  /** Значение отличается от системного авто. */
  overridden?: boolean;
  /** Собственное значение для текущей очереди (не наследуется от оч. 1). */
  queueSpecific?: boolean;
  onChange: (v: number) => void;
  onReset?: () => void;
  onResetToAuto?: () => void;
  onResetToQueue1?: () => void;
  title?: string;
  grouped?: boolean;
  /** Расчётное поле: небо по умолчанию, янтарь только при ручной правке. */
  calculated?: boolean;
  overrideClass?: string;
  calculatedClass?: string;
  queueSpecificClass?: string;
};

export function OverridableNumberInput({
  value,
  autoValue,
  step = 0.5,
  overridden = false,
  queueSpecific = false,
  onChange,
  onReset,
  onResetToAuto,
  onResetToQueue1,
  title,
  grouped = false,
  calculated = false,
  overrideClass = 'bg-amber-50 border-amber-300',
  calculatedClass = 'bg-sky-50 border-sky-300',
  queueSpecificClass = 'bg-sky-50 border-sky-300',
}: Props) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const autoLabel = grouped ? formatGroupedInteger(autoValue) : String(autoValue);
  const resetAuto = onResetToAuto ?? onReset;
  const showResetAuto = calculated
    ? Boolean(resetAuto) && overridden
    : Boolean(resetAuto) && (overridden || (queueSpecific && value !== autoValue));
  const showResetQueue1 = Boolean(onResetToQueue1) && queueSpecific;

  const inputClass = calculated
    ? (overridden ? overrideClass : calculatedClass)
    : queueSpecific
      ? queueSpecificClass
      : (overridden ? overrideClass : '');

  function commitDraft(raw: string) {
    const parsed = grouped ? parseGroupedInteger(raw) : Number(raw);
    if (parsed == null || !Number.isFinite(parsed) || parsed < 0) return;
    onChange(grouped ? Math.round(parsed) : parsed);
  }

  function handleFocus(e: FocusEvent<HTMLInputElement>) {
    if (grouped) {
      setFocused(true);
      setDraft(String(value));
    }
    numericInputHandlers.onFocus(e);
  }

  function handleBlur() {
    if (grouped) {
      commitDraft(draft);
      setFocused(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (grouped && e.key === 'Enter') {
      e.preventDefault();
      commitDraft(draft);
      e.currentTarget.blur();
      return;
    }
    numericInputHandlers.onKeyDown(e);
  }

  const inputValue = grouped
    ? (focused ? draft : formatGroupedInteger(value))
    : value;

  return (
    <div className="flex items-center justify-end gap-0.5 min-w-0">
      <input
        type={grouped ? 'text' : 'number'}
        inputMode={grouped ? 'numeric' : undefined}
        step={grouped ? undefined : step}
        min={grouped ? undefined : 0}
        className={`${VALUE_INPUT_CLASS} ${inputClass}`}
        value={inputValue}
        title={
          title ?? (
            [
              overridden ? `Авто: ${autoLabel}` : null,
              queueSpecific ? 'Индивидуально для очереди' : null,
            ].filter(Boolean).join(' · ') || undefined
          )
        }
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onChange={e => {
          if (grouped) {
            setDraft(e.target.value);
            const parsed = parseGroupedInteger(e.target.value);
            if (parsed != null && parsed >= 0) onChange(Math.round(parsed));
          } else {
            onChange(Number(e.target.value));
          }
        }}
      />
      {showResetQueue1 && (
        <button
          type="button"
          className="shrink-0 text-[10px] text-blue-600 hover:underline px-0.5"
          title="Как очередь 1"
          onClick={onResetToQueue1}
        >
          ↺1
        </button>
      )}
      {showResetAuto && (
        <button
          type="button"
          className="shrink-0 text-[10px] text-blue-600 hover:underline px-0.5"
          title={`Авто (${autoLabel})`}
          onClick={resetAuto}
        >
          ↺
        </button>
      )}
    </div>
  );
}
