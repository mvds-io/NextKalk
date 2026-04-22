import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Parses Norwegian/European decimals ("15,5") as well as "15.5" and numbers.
// Returns 0 for null/undefined/NaN so callers can safely sum.
export function parseEuropeanDecimal(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  const parsed = parseFloat(String(value).replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
}
