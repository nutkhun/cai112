import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface MobileNavItem<T extends string = string> {
  id: T;
  label: string;
  icon: LucideIcon;
  /** Optional count rendered as a small badge on the icon. */
  badge?: number;
}

interface StudentMobileNavProps<T extends string> {
  items: MobileNavItem<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Fixed bottom tab bar for the student experience on phones.
 *
 * The student dashboard used to be a single ~8-card scroll on mobile; this
 * splits it into thumb-reachable destinations. Hidden from `md` up, where the
 * two-column desktop layout takes over.
 */
export function StudentMobileNav<T extends string>({ items, value, onChange }: StudentMobileNavProps<T>) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 md:hidden',
        'border-t border-border bg-card/95 backdrop-blur-md',
        'pb-safe shadow-[0_-4px_20px_-8px_hsl(0_0%_0%/0.15)]',
      )}
    >
      <ul className="flex items-stretch justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === value;

          return (
            <li key={item.id} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  // 64px tall: comfortably above the 44px minimum target.
                  'flex h-16 w-full flex-col items-center justify-center gap-1 px-1',
                  'transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  isActive ? 'text-primary' : 'text-muted-foreground active:bg-muted/60',
                )}
              >
                <span className="relative">
                  <Icon className={cn('h-5 w-5 shrink-0', isActive && 'stroke-[2.5]')} />
                  {!!item.badge && item.badge > 0 && (
                    <span
                      className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
                      aria-hidden
                    >
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate text-[11px] font-medium leading-none">
                  {item.label}
                  {!!item.badge && item.badge > 0 && (
                    <span className="sr-only"> ({item.badge} unread)</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
