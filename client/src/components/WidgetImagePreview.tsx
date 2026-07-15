import React, { useEffect, useState } from 'react';

export function widgetImageUrl(imagePath?: string | null): string | null {
  return imagePath ? `/api/uploads/${imagePath}` : null;
}

export function WidgetImagePreviewModal({
  src,
  title,
  onClose,
  zIndexClass = 'z-[70]',
}: {
  src: string;
  title: string;
  onClose: () => void;
  zIndexClass?: string;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/50 p-4`}
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl max-w-[90vw] max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
          <span className="text-sm font-medium text-slate-700 truncate pr-4">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none shrink-0"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-auto">
          <img src={src} alt={title} className="max-w-full max-h-[calc(90vh-4rem)] object-contain mx-auto" />
        </div>
      </div>
    </div>
  );
}

export function WidgetImageThumbnail({
  imagePath,
  name,
  widgetId,
  onOpenWidgetCard,
  className = 'w-16 h-12 object-contain border border-slate-200 rounded bg-white shrink-0 cursor-pointer hover:border-slate-400',
  placeholderClassName = 'text-slate-300',
  showPlaceholder = true,
}: {
  imagePath?: string | null;
  name: string;
  widgetId?: number;
  onOpenWidgetCard?: (widgetId: number) => void;
  className?: string;
  placeholderClassName?: string;
  showPlaceholder?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const url = widgetImageUrl(imagePath);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (widgetId != null && onOpenWidgetCard) {
      onOpenWidgetCard(widgetId);
      return;
    }
    if (url) setOpen(true);
  }

  if (!url) {
    if (widgetId != null && onOpenWidgetCard) {
      return (
        <button
          type="button"
          data-readonly-allow
          className={`${className} flex items-center justify-center text-[10px] text-slate-400 bg-slate-50`}
          title={`${name} — открыть карточку`}
          onClick={handleClick}
        >
          ?
        </button>
      );
    }
    if (!showPlaceholder) return null;
    return <span className={placeholderClassName}>—</span>;
  }

  return (
    <>
      <img
        src={url}
        alt={name}
        title={widgetId != null && onOpenWidgetCard ? `${name} — открыть карточку` : `${name} — клик для увеличения`}
        className={className}
        onClick={handleClick}
      />
      {open && !onOpenWidgetCard ? (
        <WidgetImagePreviewModal src={url} title={name} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
