// Predefined color palettes a user can choose in Settings. The selected ID is stored on the user's profile.

export type AppColors = {
  /** Subtle background for inset forms and stat tiles. */
  surface: string
  /** Table headers and other muted bands. */
  surfaceMuted: string
  /** Accent-tinted notice backgrounds and their border. */
  tint: string
  tintBorder: string
  /** Progress tracks, empty timelines, and light row separators. */
  track: string
  /** Outlined card border. */
  border: string
  heading: string
  focus: string
  selection: string
  selectionText: string
  /** Soft glow painted behind the page content. */
  glow: string
  accentSoft: string
  accentSoftText: string
  warmSoft: string
  warmSoftText: string
  errorSoft: string
  sidebar: {
    bg: string
    text: string
    muted: string
    faint: string
    strong: string
    accent: string
    avatarBg: string
    avatarText: string
  }
  segment: { billable: string; nonBillable: string; running: string; gap: string }
  avatars: string[]
  avatarText: string
}

export type PaletteDefinition = {
  id: PaletteId
  name: string
  description: string
  mode: 'light' | 'dark'
  primary: { main: string; light: string; dark: string; contrastText: string }
  error: string
  success: string
  warning: string
  background: { default: string; paper: string }
  text: { primary: string; secondary: string }
  divider: string
  app: AppColors
}

export const PALETTE_IDS = ['forest', 'ocean', 'plum', 'terracotta', 'forest-night', 'midnight', 'graphite'] as const
export type PaletteId = (typeof PALETTE_IDS)[number]
/** A palette ID, or `system` to follow the operating system's light/dark preference. */
export type PaletteChoice = PaletteId | 'system'

export const DEFAULT_PALETTE_CHOICE: PaletteChoice = 'forest'
const SYSTEM_PALETTES = { light: 'forest', dark: 'forest-night' } as const satisfies Record<string, PaletteId>

export const PALETTES: Record<PaletteId, PaletteDefinition> = {
  forest: {
    id: 'forest',
    name: 'Forest',
    description: 'The classic Ticknest greens.',
    mode: 'light',
    primary: { main: '#254332', light: '#416b4c', dark: '#1d3728', contrastText: '#fff' },
    error: '#984b3e',
    success: '#386b43',
    warning: '#94651f',
    background: { default: '#f8f8f5', paper: '#fff' },
    text: { primary: '#24342a', secondary: '#59665b' },
    divider: '#e8e9e4',
    app: {
      surface: '#fbfcfa',
      surfaceMuted: '#f6f7f3',
      tint: '#f7faf4',
      tintBorder: '#dce9d8',
      track: '#eef0eb',
      border: '#e5e9e1',
      heading: '#526052',
      focus: '#2f6e42',
      selection: '#dbe8d7',
      selectionText: '#203329',
      glow: '#d9e7dd',
      accentSoft: '#eaf1e7',
      accentSoftText: '#47744d',
      warmSoft: '#f1f0e7',
      warmSoftText: '#8b7850',
      errorSoft: '#f6e3df',
      sidebar: {
        bg: '#17271f',
        text: '#c3d0c6',
        muted: '#7f9383',
        faint: '#5f7363',
        strong: '#f3f7ef',
        accent: '#a8d29a',
        avatarBg: '#dbe8d7',
        avatarText: '#213b2c',
      },
      segment: { billable: '#386b43', nonBillable: '#9fbfa8', running: '#c4892f', gap: '#d6e6ee' },
      avatars: ['#dbe8d7', '#efe3cf', '#dfe6ef', '#eedcd8', '#e5def0', '#d8ebe7'],
      avatarText: '#24342a',
    },
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Calm blues with a deep navy sidebar.',
    mode: 'light',
    primary: { main: '#1f4e79', light: '#3a6f9e', dark: '#163a5c', contrastText: '#fff' },
    error: '#a4443b',
    success: '#2f6f57',
    warning: '#946419',
    background: { default: '#f6f8fa', paper: '#fff' },
    text: { primary: '#1d2b3a', secondary: '#536273' },
    divider: '#e3e8ee',
    app: {
      surface: '#fafcfd',
      surfaceMuted: '#f3f6f9',
      tint: '#f4f8fc',
      tintBorder: '#d3e2f0',
      track: '#eaeef3',
      border: '#dfe5ec',
      heading: '#4d5d6e',
      focus: '#2b6cb0',
      selection: '#d3e4f5',
      selectionText: '#13263a',
      glow: '#d6e4f1',
      accentSoft: '#e3edf7',
      accentSoftText: '#2f5f8f',
      warmSoft: '#f3efe6',
      warmSoftText: '#8a6d3b',
      errorSoft: '#f7e2e0',
      sidebar: {
        bg: '#142536',
        text: '#c2cfdc',
        muted: '#7d90a4',
        faint: '#5c7086',
        strong: '#f1f6fb',
        accent: '#8fc1ee',
        avatarBg: '#d3e4f5',
        avatarText: '#163a5c',
      },
      segment: { billable: '#2f6f9e', nonBillable: '#9fbfd8', running: '#c4892f', gap: '#e8e4d8' },
      avatars: ['#d3e4f5', '#efe3cf', '#dbeee6', '#eedcd8', '#e5def0', '#d8ebe7'],
      avatarText: '#1d2b3a',
    },
  },
  plum: {
    id: 'plum',
    name: 'Plum',
    description: 'Muted purples with soft lilac accents.',
    mode: 'light',
    primary: { main: '#5b3a6e', light: '#7a5890', dark: '#462c56', contrastText: '#fff' },
    error: '#9d4141',
    success: '#3d6f4a',
    warning: '#946419',
    background: { default: '#f9f7f9', paper: '#fff' },
    text: { primary: '#2e2433', secondary: '#66596c' },
    divider: '#ebe6ec',
    app: {
      surface: '#fcfbfc',
      surfaceMuted: '#f6f3f7',
      tint: '#faf6fb',
      tintBorder: '#e4d7ea',
      track: '#efebf0',
      border: '#e7e1e9',
      heading: '#5e5163',
      focus: '#7a4f99',
      selection: '#e6d9ee',
      selectionText: '#2e2433',
      glow: '#e8dcee',
      accentSoft: '#efe6f3',
      accentSoftText: '#6d4d82',
      warmSoft: '#f3eee6',
      warmSoftText: '#8b7048',
      errorSoft: '#f6e1e1',
      sidebar: {
        bg: '#251a2c',
        text: '#d2c6d8',
        muted: '#95849e',
        faint: '#6f5f78',
        strong: '#f7f1fa',
        accent: '#d2a8ec',
        avatarBg: '#e6d9ee',
        avatarText: '#462c56',
      },
      segment: { billable: '#6b4a84', nonBillable: '#c0abd0', running: '#c4892f', gap: '#e3e7ec' },
      avatars: ['#e6d9ee', '#efe3cf', '#dfe6ef', '#eedcd8', '#dbeee6', '#f3e3ec'],
      avatarText: '#2e2433',
    },
  },
  terracotta: {
    id: 'terracotta',
    name: 'Terracotta',
    description: 'Warm clay tones on a cream background.',
    mode: 'light',
    primary: { main: '#8a3f24', light: '#a85c3f', dark: '#6e311c', contrastText: '#fff' },
    error: '#a23b2b',
    success: '#4b6b35',
    warning: '#8f6115',
    background: { default: '#faf7f3', paper: '#fff' },
    text: { primary: '#33261f', secondary: '#6b5a50' },
    divider: '#ece5dc',
    app: {
      surface: '#fdfbf8',
      surfaceMuted: '#f7f2ec',
      tint: '#fcf6f1',
      tintBorder: '#eed9cb',
      track: '#f0e9e1',
      border: '#e8e0d6',
      heading: '#66554a',
      focus: '#b0532f',
      selection: '#f3d9cb',
      selectionText: '#33261f',
      glow: '#f1dccd',
      accentSoft: '#f6e5dc',
      accentSoftText: '#91492d',
      warmSoft: '#eef0e4',
      warmSoftText: '#5f6e3c',
      errorSoft: '#f6e0dc',
      sidebar: {
        bg: '#2b1d17',
        text: '#dccbc1',
        muted: '#a08c80',
        faint: '#7a675c',
        strong: '#fbf3ee',
        accent: '#f0a986',
        avatarBg: '#f3d9cb',
        avatarText: '#6e311c',
      },
      segment: { billable: '#9a4a2c', nonBillable: '#ddb39f', running: '#4f7a8f', gap: '#e6eadc' },
      avatars: ['#f3d9cb', '#efe3cf', '#dfe6ef', '#e3ecd8', '#e5def0', '#d8ebe7'],
      avatarText: '#33261f',
    },
  },
  'forest-night': {
    id: 'forest-night',
    name: 'Forest Night',
    description: 'Dark mode with the familiar green accents.',
    mode: 'dark',
    primary: { main: '#8cc796', light: '#b0dcb6', dark: '#5e9c69', contrastText: '#10201a' },
    error: '#e58f80',
    success: '#8cc796',
    warning: '#e0b36a',
    background: { default: '#121a16', paper: '#18231d' },
    text: { primary: '#e3ebe4', secondary: '#a3b2a6' },
    divider: '#2a372f',
    app: {
      surface: '#1c2822',
      surfaceMuted: '#1f2c25',
      tint: '#1b2a21',
      tintBorder: '#2f4a37',
      track: '#26342c',
      border: '#2c3a31',
      heading: '#b4c3b7',
      focus: '#a8d29a',
      selection: '#2f5a3c',
      selectionText: '#f0f7ef',
      glow: '#2d4a37',
      accentSoft: '#22392b',
      accentSoftText: '#a8d29a',
      warmSoft: '#34301f',
      warmSoftText: '#d9c08a',
      errorSoft: '#4a2620',
      sidebar: {
        bg: '#0d1410',
        text: '#b9c7bc',
        muted: '#78897c',
        faint: '#5a6b5e',
        strong: '#f0f6ef',
        accent: '#a8d29a',
        avatarBg: '#2f4a37',
        avatarText: '#e3ebe4',
      },
      segment: { billable: '#6fb27c', nonBillable: '#3f6b4c', running: '#e0a548', gap: '#2d4250' },
      avatars: ['#2f4a37', '#4a3f2a', '#2e3b4d', '#4d3230', '#3d3350', '#28463f'],
      avatarText: '#e3ebe4',
    },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    description: 'Dark mode in cool blues.',
    mode: 'dark',
    primary: { main: '#8ab4f8', light: '#b3cefb', dark: '#5c8fd6', contrastText: '#0b1726' },
    error: '#f28b82',
    success: '#81c995',
    warning: '#fdd663',
    background: { default: '#0f1620', paper: '#16202c' },
    text: { primary: '#e3e9f0', secondary: '#9fb0c3' },
    divider: '#263343',
    app: {
      surface: '#1a2532',
      surfaceMuted: '#1c2836',
      tint: '#18263a',
      tintBorder: '#2c4566',
      track: '#243243',
      border: '#293748',
      heading: '#b1c0d1',
      focus: '#8ab4f8',
      selection: '#2c4a73',
      selectionText: '#f0f5fb',
      glow: '#1f3a5c',
      accentSoft: '#1f3550',
      accentSoftText: '#a8c7fa',
      warmSoft: '#3a3220',
      warmSoftText: '#e3c27d',
      errorSoft: '#4d2624',
      sidebar: {
        bg: '#0a1018',
        text: '#b5c3d3',
        muted: '#7488a0',
        faint: '#566a80',
        strong: '#eef4fb',
        accent: '#8ab4f8',
        avatarBg: '#1f3550',
        avatarText: '#e3e9f0',
      },
      segment: { billable: '#5c9ce6', nonBillable: '#34557a', running: '#e8a64a', gap: '#3a3a4f' },
      avatars: ['#1f3550', '#4a3f2a', '#28463f', '#4d3230', '#3d3350', '#2f4a37'],
      avatarText: '#e3e9f0',
    },
  },
  graphite: {
    id: 'graphite',
    name: 'Graphite',
    description: 'Neutral dark mode with amber highlights.',
    mode: 'dark',
    primary: { main: '#f2b05e', light: '#f6c98d', dark: '#c98a3a', contrastText: '#1b1408' },
    error: '#ef8a7c',
    success: '#8fcf9a',
    warning: '#f2b05e',
    background: { default: '#141414', paper: '#1c1c1c' },
    text: { primary: '#ececec', secondary: '#a8a8a8' },
    divider: '#2e2e2e',
    app: {
      surface: '#202020',
      surfaceMuted: '#232323',
      tint: '#221e18',
      tintBorder: '#4a3c26',
      track: '#2b2b2b',
      border: '#313131',
      heading: '#bdbdbd',
      focus: '#f2b05e',
      selection: '#5a4526',
      selectionText: '#fafafa',
      glow: '#2e2a22',
      accentSoft: '#3a2f1f',
      accentSoftText: '#f6c98d',
      warmSoft: '#253325',
      warmSoftText: '#a8d4a8',
      errorSoft: '#4a2622',
      sidebar: {
        bg: '#0e0e0e',
        text: '#c4c4c4',
        muted: '#858585',
        faint: '#626262',
        strong: '#f5f5f5',
        accent: '#f2b05e',
        avatarBg: '#3a2f1f',
        avatarText: '#ececec',
      },
      segment: { billable: '#e0a050', nonBillable: '#6b5a42', running: '#6fb0d8', gap: '#333a40' },
      avatars: ['#3a2f1f', '#2e3b4d', '#28463f', '#4d3230', '#3d3350', '#3a3a3a'],
      avatarText: '#ececec',
    },
  },
}

export function isPaletteChoice(value: unknown): value is PaletteChoice {
  return value === 'system' || (typeof value === 'string' && (PALETTE_IDS as readonly string[]).includes(value))
}

export function resolvePalette(choice: PaletteChoice, prefersDark: boolean): PaletteDefinition {
  if (choice === 'system') return PALETTES[prefersDark ? SYSTEM_PALETTES.dark : SYSTEM_PALETTES.light]
  return PALETTES[choice]
}

const CACHED_PALETTE_KEY = 'ticknest.palette'

// The last applied palette is cached on this device so the first paint matches before the profile loads.
export function getCachedPaletteChoice(): PaletteChoice | null {
  try {
    const value = window.localStorage.getItem(CACHED_PALETTE_KEY)
    return isPaletteChoice(value) ? value : null
  } catch {
    return null
  }
}

export function cachePaletteChoice(choice: PaletteChoice): void {
  try {
    window.localStorage.setItem(CACHED_PALETTE_KEY, choice)
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the profile remains the source of truth.
  }
}
