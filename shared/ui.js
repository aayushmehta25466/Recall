// Shared Tailwind utility class strings (claymorphism theme).
// Kept in one place so HTML + JS renderers stay consistent.

const BTN_BASE = 'font-primary text-sm font-bold tracking-wide border-2 border-border-strong rounded-sm bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none disabled:translate-y-0 disabled:shadow-clay-btn';

export const BTN = BTN_BASE;
export const BTN_SECONDARY = BTN_BASE.replace('bg-surface-raised', 'bg-surface-card').replace('border-border-strong', 'border-border-default');
export const BTN_DANGER = BTN_BASE.replace('bg-surface-raised', 'bg-accent-red').replace('text-text-base', 'text-white').replace('border-border-strong', 'border-accent-red').replace('outline-accent-green', 'outline-accent-red');
export const BTN_BLUE = BTN_BASE.replace('bg-surface-raised', 'bg-surface-blue').replace('border-border-strong', 'border-accent-blue').replace('outline-accent-green', 'outline-accent-blue');

export const CARD = 'bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base';
export const CARD_HOVER = CARD + ' transition-all duration-normal hover:shadow-clay-lg hover:-translate-y-[2px]';
export const CARD_TITLE = 'text-md font-extrabold tracking-tight text-text-base';
export const CARD_BODY = 'text-sm text-text-muted';

export const INPUT = 'w-full bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-4 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[44px]';
export const SELECT = INPUT + ' cursor-pointer';

export const CHECKBOX = 'w-5 h-5 rounded-xs bg-surface-card border-2 border-border-default text-accent-green focus:ring-accent-green cursor-pointer';

export const BADGE = 'inline-block text-xs font-bold px-space-3 py-space-1 rounded-xs border-2 border-border-default bg-surface-raised text-accent-green select-none shadow-clay-btn';
export const BADGE_DARK = 'inline-block text-xs font-bold px-space-3 py-space-1 rounded-xs border-2 border-border-strong bg-text-base text-text-on-dark select-none shadow-clay-btn';
export const BADGE_BLUE = 'inline-block text-xs font-bold px-space-3 py-space-1 rounded-xs border-2 border-accent-blue bg-surface-blue text-accent-blue select-none shadow-clay-btn';
export const BADGE_ORANGE = 'inline-block text-xs font-bold px-space-3 py-space-1 rounded-xs border-2 border-accent-orange bg-surface-orange text-accent-orange select-none shadow-clay-btn';

export const SIDEBAR = 'w-[220px] min-w-[220px] bg-surface-muted border-r-2 border-border-default flex flex-col gap-space-3 p-space-3 overflow-y-auto text-text-base';
export const SIDEBAR_LABEL = 'px-space-4 py-space-1 text-xs font-bold uppercase tracking-widest text-text-secondary';
export const SIDEBAR_ITEM = 'flex items-center gap-space-3 px-space-4 py-space-3 rounded-sm cursor-pointer select-none border-2 border-transparent text-sm font-semibold text-text-base transition-all duration-fast min-h-[44px] hover:bg-surface-raised hover:border-border-default hover:shadow-clay-sidebar';
export const SIDEBAR_ITEM_ACTIVE = 'bg-surface-raised border-accent-green shadow-clay-sidebar';
export const SIDEBAR_BADGE = 'ml-auto bg-text-base text-text-on-dark text-xs px-space-2 py-space-1 rounded-xs border-2 border-border-strong font-bold';
