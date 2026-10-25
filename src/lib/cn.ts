import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge classNames with conflict resolution — `cn('p-4 bg-surface', props.className)`
 *  deduplicates conflicting utilities (the later one wins). Use it whenever a component
 *  accepts a className prop it combines with its own. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
