// Small shared helpers for rendering numbers/dates the way the rest of the
// ورّيني UI already does (Arabic-Indic digits, Cairo-friendly wording).

export function arNumber(value: number | null | undefined, maxFractionDigits = 1): string {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return safeValue.toLocaleString('ar-EG', {
    maximumFractionDigits: maxFractionDigits,
  })
}

export function arDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function arDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// First letters of the first two words of a name, for avatar initials.
export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`
}

const TONES = ['mint', 'peach', 'lavender'] as const
export function toneOf(seed: string): (typeof TONES)[number] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i)) % TONES.length
  return TONES[hash]
}

export const CATEGORY_LABELS: Record<string, string> = {
  design: 'تصميم',
  programming: 'برمجة',
  cooking: 'طبخ',
  teaching: 'تدريس',
  repairs: 'إصلاحات',
  languages: 'لغات',
  other: 'أخرى',
}