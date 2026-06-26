import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * يدمج أصناف Tailwind بأمان (يستخدمها shadcn/ui).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
