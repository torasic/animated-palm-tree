import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { formatCurrency } from '@/lib/utils/currency';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string | number;
  onValueChange: (rawValue: string) => void;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, className, ...props }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current!);

    // Format the incoming value for display
    const rawString = value !== undefined && value !== null ? String(value) : '';
    const cleanDisplay = rawString.replace(/\D/g, '');
    const displayValue = cleanDisplay ? formatCurrency(cleanDisplay) : '';

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const start = input.selectionStart;
      const end = input.selectionEnd;

      if (start === end && start !== null) {
        if (e.key === 'Backspace' && start > 0) {
          if (input.value[start - 1] === '.') {
            // Move cursor to the left of the dot, let browser delete the digit before the dot
            input.setSelectionRange(start - 1, start - 1);
          }
        } else if (e.key === 'Delete' && start < input.value.length) {
          if (input.value[start] === '.') {
            // Move cursor to the right of the dot, let browser delete the digit after the dot
            input.setSelectionRange(start + 1, start + 1);
          }
        }
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const originalValue = input.value;
      const selectionStart = input.selectionStart || 0;

      // Clean to only digits
      let clean = originalValue.replace(/\D/g, '');
      
      // Prevent leading zeros if length > 1 (e.g., '05' -> '5')
      if (clean.length > 1 && clean.startsWith('0')) {
        clean = clean.replace(/^0+/, '');
      }

      // Max length limit to prevent overflow (12 digits, up to 999 billion)
      const maxDigits = 12;
      if (clean.length > maxDigits) {
        clean = clean.slice(0, maxDigits);
      }

      // Count digits before cursor in original string
      let digitsBeforeCursor = 0;
      for (let i = 0; i < selectionStart; i++) {
        if (/\d/.test(originalValue[i])) {
          digitsBeforeCursor++;
        }
      }

      // Calculate formatting for new clean string
      const formatted = clean ? formatCurrency(clean) : '';

      // Find new cursor position matching digitsBeforeCursor
      let newSelectionStart = 0;
      let digitsSeen = 0;
      while (newSelectionStart < formatted.length && digitsSeen < digitsBeforeCursor) {
        if (/\d/.test(formatted[newSelectionStart])) {
          digitsSeen++;
        }
        newSelectionStart++;
      }

      // Temporarily store the desired cursor position
      const cursorTarget = newSelectionStart;

      // Notify parent of the new raw string value
      onValueChange(clean);

      // Restore cursor position after render
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(cursorTarget, cursorTarget);
        }
      }, 0);
    };

    return (
      <input
        autoComplete="off"
        {...props}
        ref={inputRef}
        type="text"
        inputMode="numeric"
        className={className}
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';
