/** The color new projects start with. */
export const DEFAULT_PROJECT_COLOR = '#668a6b'

/** Preset project colors, mid-tone so the dots read on light and dark surfaces. Names are for screen readers. */
export const PROJECT_COLORS: ReadonlyArray<{ name: string; value: string }> = [
  { name: 'Sage', value: DEFAULT_PROJECT_COLOR },
  { name: 'Green', value: '#2e7d32' },
  { name: 'Teal', value: '#00838f' },
  { name: 'Blue', value: '#1565c0' },
  { name: 'Indigo', value: '#3949ab' },
  { name: 'Purple', value: '#6a1b9a' },
  { name: 'Pink', value: '#ad1457' },
  { name: 'Red', value: '#c62828' },
  { name: 'Terracotta', value: '#c75b39' },
  { name: 'Amber', value: '#b7791f' },
  { name: 'Brown', value: '#6d4c41' },
  { name: 'Slate', value: '#607d8b' },
]

/** The preset matching `color` (ignoring case), or undefined when it is a custom color. */
export function presetProjectColor(color: string) {
  const value = color.toLowerCase()
  return PROJECT_COLORS.find((preset) => preset.value === value)
}
