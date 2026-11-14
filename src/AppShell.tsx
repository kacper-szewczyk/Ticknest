import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { alpha, type Theme } from '@mui/material/styles'
import { DemoResetBanner } from './DemoMode'
import { useTranslation } from './i18n'
import { loadSidebarCollapsed, saveSidebarCollapsed } from './lib/sidebarPreference'
import { SidebarControlsContext } from './sidebarControls'

const SIDEBAR_WIDTH = 264
const RAIL_WIDTH = 72
// Disabled for prefers-reduced-motion by the global rule in theme.ts.
const SIDEBAR_TRANSITION = '.2s ease'

export type NavItem<V extends string> = { value: V; label: string; icon: ReactNode; section: string; badge?: ReactNode }

const sidebarColors = {
  bg: 'app.sidebar.bg',
  text: 'app.sidebar.text',
  muted: 'app.sidebar.muted',
  strong: 'app.sidebar.strong',
  accent: 'app.sidebar.accent',
  activeBg: (theme: Theme) => alpha(theme.palette.app.sidebar.strong, 0.09),
  border: (theme: Theme) => alpha(theme.palette.app.sidebar.strong, 0.08),
}

type ShellProps<V extends string> = {
  brand: ReactNode
  /** Rendered under the brand, above the navigation (e.g. a workspace switcher). */
  header?: ReactNode
  /** Sticky bar shown above the page content on every view (e.g. the timer). */
  topBar?: ReactNode
  items: NavItem<V>[]
  active: V | null
  onNavigate: (value: V) => void
  footer: ReactNode
  /** Logo-only brand for the collapsed sidebar rail. */
  compactBrand?: ReactNode
  /** Compact `header` for the collapsed rail; it can reopen the full sidebar via `useSidebarControls`. */
  compactHeader?: ReactNode
  /** Compact `footer` for the collapsed rail. */
  compactFooter?: ReactNode
  /** Id of the page's `<main>` (with `tabIndex={-1}`); adds a "Skip to main content" link that focuses it. */
  mainId?: string
  children: ReactNode
}

export function AppShell<V extends string>({
  brand,
  header,
  topBar,
  items,
  active,
  onNavigate,
  footer,
  compactBrand,
  compactHeader,
  compactFooter,
  mainId,
  children,
}: ShellProps<V>) {
  const { t } = useTranslation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Only applies from md up; the small-screen drawer ignores it.
  const [collapsed, setCollapsed] = useState(loadSidebarCollapsed)
  const sidebarId = useId()
  const drawerId = useId()
  const collapseButtonRef = useRef<HTMLButtonElement>(null)
  const expandButtonRef = useRef<HTMLButtonElement>(null)
  const shouldMoveFocus = useRef(false)
  const activeLabel = items.find((item) => item.value === active)?.label
  const sidebarWidth = collapsed ? RAIL_WIDTH : SIDEBAR_WIDTH

  const setSidebarCollapsed = (next: boolean) => {
    shouldMoveFocus.current = true
    setCollapsed(next)
    saveSidebarCollapsed(next)
  }

  // The toggle that was pressed unmounts, so hand keyboard focus to its counterpart.
  useEffect(() => {
    if (!shouldMoveFocus.current) return
    shouldMoveFocus.current = false
    const target = collapsed ? expandButtonRef : collapseButtonRef
    target.current?.focus()
  }, [collapsed])

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {mainId && (
        <Box
          component="a"
          href={`#${mainId}`}
          // The URL hash holds the current view, so focus <main> directly instead of following the link.
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault()
            document.getElementById(mainId)?.focus()
          }}
          sx={skipLinkSx}
        >
          {t('shell.skipToContent')}
        </Box>
      )}
      <Box
        component="aside"
        id={sidebarId}
        aria-label={t('shell.sidebar')}
        sx={{
          display: { xs: 'none', md: 'flex' },
          position: 'fixed',
          inset: '0 auto 0 0',
          width: sidebarWidth,
          overflow: 'hidden',
          transition: `width ${SIDEBAR_TRANSITION}`,
          zIndex: (theme) => theme.zIndex.appBar,
        }}
      >
        {collapsed ? (
          <SidebarRail
            brand={compactBrand}
            header={
              compactHeader && (
                <SidebarControlsContext.Provider value={{ expand: () => setSidebarCollapsed(false) }}>
                  {compactHeader}
                </SidebarControlsContext.Provider>
              )
            }
            items={items}
            active={active}
            footer={compactFooter}
            onNavigate={onNavigate}
            toggle={
              <IconButton
                ref={expandButtonRef}
                aria-label={t('shell.expandSidebar')}
                aria-expanded={false}
                aria-controls={sidebarId}
                onClick={() => setSidebarCollapsed(false)}
                sx={sidebarToggleSx}
              >
                <NavIcon>
                  <path d="m10 8 4 4-4 4M4 5v14" />
                </NavIcon>
              </IconButton>
            }
          />
        ) : (
          <SidebarContent
            brand={brand}
            header={header}
            items={items}
            active={active}
            footer={footer}
            onNavigate={onNavigate}
            toggle={
              <IconButton
                ref={collapseButtonRef}
                aria-label={t('shell.collapseSidebar')}
                aria-expanded
                aria-controls={sidebarId}
                onClick={() => setSidebarCollapsed(true)}
                sx={sidebarToggleSx}
              >
                <NavIcon>
                  <path d="m14 8-4 4 4 4M20 5v14" />
                </NavIcon>
              </IconButton>
            }
          />
        )}
      </Box>
      <Box
        component="header"
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'sticky',
          top: 0,
          zIndex: (theme) => theme.zIndex.appBar,
          alignItems: 'center',
          gap: 1.5,
          height: 60,
          px: 1.5,
          bgcolor: sidebarColors.bg,
          color: sidebarColors.strong,
        }}
      >
        <IconButton
          aria-label={t('shell.openNavigation')}
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          onClick={() => setDrawerOpen(true)}
          sx={{ color: 'inherit' }}
        >
          <NavIcon>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </NavIcon>
        </IconButton>
        {brand}
        {activeLabel && (
          <Typography variant="body2" sx={{ ml: 'auto', pr: 1, color: sidebarColors.text }} noWrap>
            {activeLabel}
          </Typography>
        )}
      </Box>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{ display: { md: 'none' } }}
        slotProps={{
          paper: {
            id: drawerId,
            role: 'dialog',
            'aria-modal': true,
            'aria-label': t('shell.mainNavigation'),
            sx: { width: SIDEBAR_WIDTH, maxWidth: '85vw', border: 0 },
          },
        }}
      >
        <SidebarContent
          brand={brand}
          header={header}
          items={items}
          active={active}
          footer={footer}
          onNavigate={(value) => {
            setDrawerOpen(false)
            onNavigate(value)
          }}
        />
      </Drawer>
      <Box
        sx={{
          ml: { md: `${sidebarWidth}px` },
          transition: `margin-left ${SIDEBAR_TRANSITION}`,
          minWidth: 0,
          background: (theme) =>
            `radial-gradient(ellipse at 12% 0%, ${alpha(theme.palette.app.glow, 0.48)}, transparent 32rem), ${theme.palette.background.default}`,
          minHeight: { xs: 'calc(100vh - 60px)', md: '100vh' },
        }}
      >
        <DemoResetBanner />
        {topBar && (
          <Box
            sx={{
              position: 'sticky',
              top: { xs: 60, md: 0 },
              zIndex: (theme) => theme.zIndex.appBar - 1,
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: (theme) => alpha(theme.palette.background.paper, 0.94),
              backdropFilter: 'blur(8px)',
            }}
          >
            {topBar}
          </Box>
        )}
        {children}
      </Box>
    </Box>
  )
}

// Visually hidden until it gets keyboard focus, then shown over the top-left corner.
const skipLinkSx = {
  position: 'fixed',
  top: 8,
  left: 8,
  zIndex: (theme: Theme) => theme.zIndex.tooltip + 1,
  px: 2,
  py: 1.25,
  borderRadius: '10px',
  bgcolor: 'background.paper',
  color: 'text.primary',
  fontWeight: 650,
  boxShadow: 3,
  transform: 'translateY(-200%)',
  '&:focus': { transform: 'none' },
} as const

const sidebarToggleSx = {
  color: sidebarColors.text,
  '&:hover': { bgcolor: sidebarColors.activeBg, color: sidebarColors.strong },
} as const

function navButtonSx(isActive: boolean) {
  return {
    position: 'relative',
    width: '100%',
    justifyContent: 'flex-start',
    gap: 1.5,
    px: 1.5,
    py: 1.15,
    borderRadius: '10px',
    fontSize: 14,
    fontWeight: isActive ? 650 : 500,
    color: isActive ? sidebarColors.strong : sidebarColors.text,
    bgcolor: isActive ? sidebarColors.activeBg : 'transparent',
    transition: 'background-color .15s, color .15s',
    '&:hover': { bgcolor: sidebarColors.activeBg, color: sidebarColors.strong },
    '&.Mui-focusVisible': {
      outline: (theme: Theme) => `3px solid ${theme.palette.app.sidebar.accent}`,
      outlineOffset: 1,
    },
    '&::before': isActive
      ? {
          content: '""',
          position: 'absolute',
          left: -12,
          top: 8,
          bottom: 8,
          width: 4,
          borderRadius: '0 4px 4px 0',
          bgcolor: sidebarColors.accent,
        }
      : undefined,
  } as const
}

function sectionsOf<V extends string>(items: NavItem<V>[]): string[] {
  return [...new Set(items.map((item) => item.section))]
}

function SidebarContent<V extends string>({
  brand,
  header,
  items,
  active,
  footer,
  onNavigate,
  toggle,
}: {
  brand: ReactNode
  header?: ReactNode
  items: NavItem<V>[]
  active: V | null
  footer: ReactNode
  onNavigate: (value: V) => void
  /** Collapse control next to the brand (desktop sidebar only). */
  toggle?: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const sectionIdPrefix = useId()
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        width: SIDEBAR_WIDTH,
        maxWidth: '100%',
        height: '100%',
        flexShrink: 0,
        bgcolor: sidebarColors.bg,
        color: sidebarColors.text,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 3, pr: 1.5, pt: 3, pb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>{brand}</Box>
        {toggle}
      </Box>
      {header && <Box sx={{ px: 1.5, pb: 1.5, borderBottom: 1, borderColor: sidebarColors.border }}>{header}</Box>}
      <Box component="nav" aria-label={t('shell.mainNavigation')} sx={{ flex: 1, overflowY: 'auto', px: 1.5, pb: 2 }}>
        {/* Group labels name their lists rather than being headings, so the page's h1 leads the outline. */}
        {sectionsOf(items).map((section, index) => (
          <Box key={section} sx={{ mt: 2 }}>
            <Typography
              component="p"
              id={`${sectionIdPrefix}-${index}`}
              sx={{
                px: 1.5,
                mb: 0.75,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.12em',
                color: sidebarColors.muted,
              }}
            >
              {section.toLocaleUpperCase(i18n.language)}
            </Typography>
            <Box
              component="ul"
              aria-labelledby={`${sectionIdPrefix}-${index}`}
              sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.25 }}
            >
              {items
                .filter((item) => item.section === section)
                .map((item) => {
                  const isActive = item.value === active
                  return (
                    <li key={item.value}>
                      <ButtonBase
                        onClick={() => onNavigate(item.value)}
                        aria-current={isActive ? 'page' : undefined}
                        sx={navButtonSx(isActive)}
                      >
                        <Box
                          component="span"
                          sx={{ display: 'inline-flex', color: isActive ? sidebarColors.accent : 'inherit' }}
                        >
                          {item.icon}
                        </Box>
                        <span>{item.label}</span>
                        {item.badge && (
                          <Box component="span" sx={{ ml: 'auto' }}>
                            {item.badge}
                          </Box>
                        )}
                      </ButtonBase>
                    </li>
                  )
                })}
            </Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ borderTop: 1, borderColor: sidebarColors.border, p: 1.5 }}>{footer}</Box>
    </Box>
  )
}

/** Collapsed desktop sidebar: icon-only navigation with tooltips. */
function SidebarRail<V extends string>({
  brand,
  header,
  items,
  active,
  footer,
  onNavigate,
  toggle,
}: {
  brand?: ReactNode
  header?: ReactNode
  items: NavItem<V>[]
  active: V | null
  footer?: ReactNode
  onNavigate: (value: V) => void
  toggle: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: RAIL_WIDTH,
        height: '100%',
        flexShrink: 0,
        bgcolor: sidebarColors.bg,
        color: sidebarColors.text,
      }}
    >
      <Box sx={{ display: 'grid', justifyItems: 'center', gap: 1, pt: 3, pb: 1.5 }}>
        {brand}
        {toggle}
      </Box>
      {header && (
        <Box
          sx={{
            display: 'grid',
            justifyItems: 'center',
            width: '100%',
            pb: 1.5,
            borderBottom: 1,
            borderColor: sidebarColors.border,
          }}
        >
          {header}
        </Box>
      )}
      <Box
        component="nav"
        aria-label={t('shell.mainNavigation')}
        sx={{ flex: 1, width: '100%', overflowY: 'auto', overflowX: 'hidden', px: 1.5, pb: 2 }}
      >
        {sectionsOf(items).map((section, index) => (
          <Box
            key={section}
            component="ul"
            aria-label={section}
            sx={{
              listStyle: 'none',
              m: 0,
              mt: 1.5,
              pt: index === 0 ? 0 : 1.5,
              px: 0,
              pb: 0,
              display: 'grid',
              gap: 0.25,
              borderTop: index === 0 ? 0 : 1,
              borderColor: sidebarColors.border,
            }}
          >
            {items
              .filter((item) => item.section === section)
              .map((item) => {
                const isActive = item.value === active
                return (
                  <li key={item.value}>
                    <Tooltip title={item.label} placement="right">
                      <ButtonBase
                        onClick={() => onNavigate(item.value)}
                        aria-label={item.label}
                        aria-current={isActive ? 'page' : undefined}
                        sx={{ ...navButtonSx(isActive), justifyContent: 'center', px: 0 }}
                      >
                        <Box
                          component="span"
                          sx={{ display: 'inline-flex', color: isActive ? sidebarColors.accent : 'inherit' }}
                        >
                          {item.icon}
                        </Box>
                        {item.badge && (
                          <Box
                            component="span"
                            aria-hidden="true"
                            sx={{
                              position: 'absolute',
                              top: 6,
                              right: 8,
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              bgcolor: sidebarColors.accent,
                            }}
                          />
                        )}
                      </ButtonBase>
                    </Tooltip>
                  </li>
                )
              })}
          </Box>
        ))}
      </Box>
      {footer && (
        <Box
          sx={{
            display: 'grid',
            justifyItems: 'center',
            gap: 1,
            width: '100%',
            py: 1.5,
            borderTop: 1,
            borderColor: sidebarColors.border,
          }}
        >
          {footer}
        </Box>
      )}
    </Box>
  )
}

export function NavIcon({ children }: { children: ReactNode }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      sx={{
        width: 20,
        height: 20,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        flexShrink: 0,
      }}
    >
      {children}
    </Box>
  )
}
