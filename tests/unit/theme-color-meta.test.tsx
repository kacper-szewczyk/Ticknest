// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppThemeProvider } from '../../src/AppThemeProvider'
import { usePalette } from '../../src/paletteContext'
import { PALETTES } from '../../src/palettes'

function themeColor() {
  return document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content
}

function PaletteButtons() {
  const { applyPalette } = usePalette()
  return (
    <>
      <button onClick={() => applyPalette('graphite')}>graphite</button>
      <button onClick={() => applyPalette('ocean')}>ocean</button>
    </>
  )
}

beforeEach(() => {
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = '#f7f7f4'
  document.head.append(meta)
})

afterEach(() => {
  cleanup()
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove())
  window.localStorage.clear()
})

describe('theme-color meta tag', () => {
  it('starts on the default palette background', () => {
    render(<AppThemeProvider>{null}</AppThemeProvider>)
    expect(themeColor()).toBe(PALETTES.forest.background.default)
  })

  it('uses a cached dark palette background on first render', () => {
    window.localStorage.setItem('ticknest.palette', 'midnight')
    render(<AppThemeProvider>{null}</AppThemeProvider>)
    expect(themeColor()).toBe(PALETTES.midnight.background.default)
  })

  it('follows palette switches between light and dark', () => {
    render(
      <AppThemeProvider>
        <PaletteButtons />
      </AppThemeProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'graphite' }))
    expect(themeColor()).toBe(PALETTES.graphite.background.default)
    fireEvent.click(screen.getByRole('button', { name: 'ocean' }))
    expect(themeColor()).toBe(PALETTES.ocean.background.default)
    expect(document.head.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1)
  })
})
