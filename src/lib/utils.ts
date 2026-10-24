import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const formatDate = (dateString: string): string => {
  if (!dateString) return ""

  const date = new Date(dateString)
  if (isNaN(date.getTime())) return dateString

  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

