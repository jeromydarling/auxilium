import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A native select, deliberately.
 *
 * The Radix combobox is better for search-heavy pickers, but every select in
 * V1 is a short, fixed list (status, category, urgency, column mapping). A
 * native control is keyboard-perfect, works on mobile without a portal, and
 * costs nothing. Swap in the Radix version where a list grows long.
 */
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-card',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export { Select };
