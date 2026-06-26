import type { FocusEvent, KeyboardEvent } from 'react';

export function onNumericInputFocus(e: FocusEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

export function onNumericInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.currentTarget.blur();
  }
}

export const numericInputHandlers = {
  onFocus: onNumericInputFocus,
  onKeyDown: onNumericInputKeyDown,
};
