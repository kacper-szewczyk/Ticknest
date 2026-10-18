import { useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { alpha, type Theme } from '@mui/material/styles'

const SIDEBAR_WIDTH = 264

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
  children,
}: ShellProps<V>) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const activeLabel = items.find((item) => item.value === active)?.label
  const sidebar = (
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
  )

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="aside"
        aria-label="Sidebar"
        sx={{
          display: { xs: 'none', md: 'flex' },
          position: 'fixed',
          inset: '0 auto 0 0',
          width: SIDEBAR_WIDTH,
          zIndex: (theme) => theme.zIndex.appBar,
        }}
      >
        {sidebar}
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
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
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
        slotProps={{ paper: { sx: { width: SIDEBAR_WIDTH, maxWidth: '85vw', border: 0 } } }}
      >
        {sidebar}
      </Drawer>
      <Box
        sx={{
          ml: { md: `${SIDEBAR_WIDTH}px` },
          minWidth: 0,
          background: (theme) =>
            `radial-gradient(ellipse at 12% 0%, ${alpha(theme.palette.app.glow, 0.48)}, transparent 32rem), ${theme.palette.background.default}`,
          minHeight: { xs: 'calc(100vh - 60px)', md: '100vh' },
        }}
      >
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

function SidebarContent<V extends string>({
  brand,
  header,
  items,
  active,
  footer,
  onNavigate,
}: {
  brand: ReactNode
  header?: ReactNode
  items: NavItem<V>[]
  active: V | null
  footer: ReactNode
  onNavigate: (value: V) => void
}) {
  const sections = [...new Set(items.map((item) => item.section))]
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        bgcolor: sidebarColors.bg,
        color: sidebarColors.text,
      }}
    >
      <Box sx={{ px: 3, pt: 3, pb: 2 }}>{brand}</Box>
      {header && <Box sx={{ px: 1.5, pb: 1.5, borderBottom: 1, borderColor: sidebarColors.border }}>{header}</Box>}
      <Box component="nav" aria-label="Main navigation" sx={{ flex: 1, overflowY: 'auto', px: 1.5, pb: 2 }}>
        {sections.map((section) => (
          <Box key={section} sx={{ mt: 2 }}>
            <Typography
              component="h2"
              sx={{
                px: 1.5,
                mb: 0.75,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.12em',
                color: sidebarColors.muted,
              }}
            >
              {section.toUpperCase()}
            </Typography>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.25 }}>
              {items
                .filter((item) => item.section === section)
                .map((item) => {
                  const isActive = item.value === active
                  return (
                    <li key={item.value}>
                      <ButtonBase
                        onClick={() => onNavigate(item.value)}
                        aria-current={isActive ? 'page' : undefined}
                        sx={{
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
                            outline: (theme) => `3px solid ${theme.palette.app.sidebar.accent}`,
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
                        }}
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
