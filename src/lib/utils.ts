import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "₸"): string {
  return new Intl.NumberFormat("ru-RU").format(amount) + " " + currency;
}

export function formatPercent(value: number): string {
  return (value > 0 ? "+" : "") + value.toFixed(1) + "%";
}
