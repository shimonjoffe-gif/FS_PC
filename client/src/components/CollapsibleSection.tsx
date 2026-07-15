import { useState, type ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  headerExtra?: ReactNode;
  children: ReactNode;
};

export default function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = true,
  headerExtra,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
        <button
          type="button"
          data-readonly-allow
          onClick={() => setOpen(v => !v)}
          className="text-slate-400 hover:text-slate-600 w-4 shrink-0 text-xs leading-none"
          aria-expanded={open}
        >
          {open ? '▼' : '▶'}
        </button>
        <button
          type="button"
          data-readonly-allow
          onClick={() => setOpen(v => !v)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="text-sm font-semibold text-slate-700">{title}</div>
          {subtitle && <div className="text-[10px] text-slate-400 mt-0.5">{subtitle}</div>}
        </button>
        {headerExtra && (
          <div className="shrink-0" onClick={e => e.stopPropagation()}>
            {headerExtra}
          </div>
        )}
      </div>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}
