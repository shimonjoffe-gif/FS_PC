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
  overridden: boolean;
  onChange: (v: number) => void;
  onReset: () => void;
  title?: string;
  /** Показывать разделители разрядов (для сумм в ₽). */
  grouped?: boolean;
  overrideClass?: string;
};

export function OverridableNumberInput({
  value,
  autoValue,
  step = 0.5,
  overridden,
  onChange,
  onReset,
  title,
  grouped = false,
  overrideClass = 'bg-amber-50 border-amber-300',
}: Props) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const autoLabel = grouped ? formatGroupedInteger(autoValue) : String(autoValue);

  function commitDraft(raw: string) {
    const parsed = grouped ? parseGroupedInteger(raw) : Number(raw);
    if (parsed == null || !Number.isFinite(parsed) || parsed < 0) return;
    onChange(grouped ? Math.round(parsed) : parsed);
  }

  function handleFocus(e: FocusEvent<HTMLInputElement>) {
    if (grouped) {
      setFocused(true);
      setDraft(String(value));
      e.currentTarget.select();
      return;
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
    <div className="flex items-center justify-end gap-1 min-w-0">
      <input
        type={grouped ? 'text' : 'number'}
        inputMode={grouped ? 'numeric' : undefined}
        step={grouped ? undefined : step}
        min={grouped ? undefined : 0}
        className={`${VALUE_INPUT_CLASS} ${overridden ? overrideClass : ''}`}
        value={inputValue}
        title={title ?? (overridden ? `Авто: ${autoLabel}` : undefined)}
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
        {...(grouped ? {} : numericInputHandlers)}
      />
      {overridden && (
        <button
          type="button"
          className="shrink-0 text-[10px] text-blue-600 hover:underline px-0.5"
          title={`Вернуть авто (${autoLabel})`}
          onClick={onReset}
        >
          ↺
        </button>
      )}
    </div>
  );
}
