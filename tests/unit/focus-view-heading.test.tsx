// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { useRef, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useFocusViewHeading } from '../../src/useFocusViewHeading'

function Page({ navigationCount, children }: { navigationCount: number; children: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null)
  useFocusViewHeading(mainRef, navigationCount)
  return (
    <>
      <button type="button">Sidebar item</button>
      <main ref={mainRef} tabIndex={-1}>
        {children}
      </main>
    </>
  )
}

afterEach(cleanup)

describe('useFocusViewHeading', () => {
  it('leaves focus alone on first load', () => {
    render(
      <Page navigationCount={0}>
        <h1>Reports</h1>
      </Page>,
    )
    expect(document.activeElement).toBe(document.body)
  })

  it('focuses the new view heading after navigating', () => {
    const { rerender } = render(
      <Page navigationCount={0}>
        <h1>Timesheet</h1>
      </Page>,
    )
    screen.getByRole('button', { name: 'Sidebar item' }).focus()
    rerender(
      <Page navigationCount={1}>
        <h1>Reports</h1>
      </Page>,
    )
    const heading = screen.getByRole('heading', { level: 1, name: 'Reports' })
    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute('tabindex')).toBe('-1')
  })

  it('focuses main until a lazy view renders its heading, then the heading', async () => {
    const { rerender } = render(<Page navigationCount={0}>{null}</Page>)
    rerender(<Page navigationCount={1}>{<p>Loading…</p>}</Page>)
    expect(document.activeElement).toBe(screen.getByRole('main'))
    rerender(
      <Page navigationCount={1}>
        <h1>Reports</h1>
      </Page>,
    )
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Reports' })))
  })

  it('does not pull focus back if the user moved on before the heading rendered', async () => {
    const { rerender } = render(<Page navigationCount={0}>{null}</Page>)
    rerender(<Page navigationCount={1}>{<p>Loading…</p>}</Page>)
    const sidebarItem = screen.getByRole('button', { name: 'Sidebar item' })
    act(() => sidebarItem.focus())
    rerender(
      <Page navigationCount={1}>
        <h1>Reports</h1>
      </Page>,
    )
    // Let the MutationObserver callback run.
    await act(async () => {})
    expect(document.activeElement).toBe(sidebarItem)
  })
})
