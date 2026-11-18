// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_COLOR } from '../../src/lib/projectColors'
import { PALETTES } from '../../src/palettes'
import { ProjectColorField } from '../../src/ProjectColorField'
import { createAppTheme } from '../../src/theme'
import { StepButton } from '../../src/TimeOffParts'

const theme = createAppTheme(PALETTES.forest)

afterEach(cleanup)

function ColorField({ initial }: { initial: string }) {
  const [color, setColor] = useState(initial)
  return <ProjectColorField value={color} onChange={setColor} />
}

describe('ProjectColorField', () => {
  it('shows the selected colour name as text, not only in a tooltip', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider theme={theme}>
        <ColorField initial={DEFAULT_PROJECT_COLOR} />
      </ThemeProvider>,
    )
    expect(screen.getByText('Selected: Sage')).toBeTruthy()

    await user.click(screen.getByRole('radio', { name: 'Teal' }))
    expect(screen.getByText('Selected: Teal')).toBeTruthy()

    await user.click(screen.getByRole('radio', { name: 'Custom color' }))
    expect(screen.getByText('Selected: Custom')).toBeTruthy()
  })
})

describe('StepButton', () => {
  it('is a labelled button with an SVG chevron instead of a text glyph', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <ThemeProvider theme={theme}>
        <StepButton direction="next" label="Next year" onClick={onClick} />
      </ThemeProvider>,
    )
    const button = screen.getByRole('button', { name: 'Next year' })
    expect(button.textContent).toBe('')
    expect(button.querySelector('svg')).toBeTruthy()
    expect(button.className).not.toContain('MuiIconButton-sizeSmall')
    await user.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
