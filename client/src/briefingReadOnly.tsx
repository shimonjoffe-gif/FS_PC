import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import { yesNoClass, yesNoLabel } from './utils/yesNoBadge';

export const BriefingReadOnlyContext = createContext(false);

export function useBriefingReadOnly(): boolean {
  return useContext(BriefingReadOnlyContext);
}

type YesNoButtonProps = {
  isYes: boolean;
  unmatched?: boolean;
  title?: string;
  onClick?: () => void;
  className?: string;
};

/** Да/Нет: кнопка в черновике, бейдж в замороженной версии. */
export function YesNoButton({
  isYes,
  unmatched,
  title,
  onClick,
  className = '',
}: YesNoButtonProps) {
  const readOnly = useBriefingReadOnly();
  const badgeClass = `${yesNoClass(isYes, !isYes && unmatched)} ${className}`.trim();

  if (readOnly) {
    return (
      <span className={`inline-block px-2 py-0.5 rounded min-w-[36px] ${badgeClass}`}>
        {yesNoLabel(isYes)}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`px-2 py-0.5 rounded min-w-[36px] cursor-pointer ${badgeClass}`}
      title={title}
      onClick={onClick}
    >
      {yesNoLabel(isYes)}
    </button>
  );
}

/** Элементы с data-readonly-allow остаются кликабельными в режиме просмотра. */
function isReadOnlyNav(el: Element): boolean {
  return el.hasAttribute('data-readonly-allow') || el.closest('[data-readonly-allow]') != null;
}

/**
 * data-readonly-skip — React сам управляет disabled (например, «Сохранить»).
 * Слой не трогает такие элементы ни при lock, ни при unlock.
 */
function isReactOwnedDisabled(el: Element): boolean {
  return el.hasAttribute('data-readonly-skip') || el.closest('[data-readonly-skip]') != null;
}

type BriefingReadOnlyLayerProps = {
  children: ReactNode;
  className?: string;
};

/** Блокирует редактирование внутри слоя; data-readonly-allow остаются кликабельными. */
export function BriefingReadOnlyLayer({ children, className = '' }: BriefingReadOnlyLayerProps) {
  const readOnly = useBriefingReadOnly();
  const rootRef = useRef<HTMLDivElement>(null);
  const prevDisabledRef = useRef(new WeakMap<Element, boolean>());

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const controls = root.querySelectorAll('input, select, textarea, button');

    if (!readOnly) {
      controls.forEach(el => {
        if (isReactOwnedDisabled(el)) {
          el.removeAttribute('aria-disabled');
          return;
        }
        if (!prevDisabledRef.current.has(el)) return;
        if ('disabled' in el) {
          (el as HTMLInputElement).disabled = prevDisabledRef.current.get(el) ?? false;
        }
        prevDisabledRef.current.delete(el);
        el.removeAttribute('aria-disabled');
      });
      return;
    }

    controls.forEach(el => {
      if (isReadOnlyNav(el) || isReactOwnedDisabled(el)) return;

      if (!prevDisabledRef.current.has(el) && 'disabled' in el) {
        prevDisabledRef.current.set(el, (el as HTMLInputElement).disabled);
      }
      if ('disabled' in el) {
        (el as HTMLInputElement).disabled = true;
      }
      el.setAttribute('aria-disabled', 'true');
    });
  });

  return (
    <div
      ref={rootRef}
      className={`${className}${readOnly ? ' briefing-read-only-mode' : ''}`.trim()}
    >
      {children}
    </div>
  );
}
