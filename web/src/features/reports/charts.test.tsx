import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { hourlySeries } from './chartData'
import { HourlyChart } from './charts'

function renderHourly() {
  const { bars, peak } = hourlySeries([{ hour: 13, sales: '500.00', orders: 3 }])
  render(<HourlyChart bars={bars} peak={peak} currency="INR" />)
}

describe('BarChart', () => {
  it('announces the bar chosen with the keyboard from outside the image, and marks it', async () => {
    renderHourly()
    const chart = screen.getByRole('img')
    const announcer = screen.getByTestId('chart-announcer')
    expect(chart).not.toContainElement(announcer)
    expect(announcer).toHaveAttribute('aria-live', 'polite')
    expect(announcer).toBeEmptyDOMElement()

    chart.focus()
    await userEvent.keyboard('{Home}')
    expect(announcer.textContent).toMatch(/0 bills/)
    await userEvent.keyboard('{End}')
    expect(announcer.textContent).toMatch(/0 bills/)
    for (let i = 0; i < 10; i++) await userEvent.keyboard('{ArrowLeft}')
    expect(announcer.textContent).toMatch(/₹500.00.*3 bills/)
    expect(screen.getByTestId('chart-cursor')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(announcer).toBeEmptyDOMElement()
    expect(screen.queryByTestId('chart-cursor')).toBeNull()
  })

  it('keeps one label on the table toggle and reports its state with aria-pressed', async () => {
    renderHourly()
    const toggle = screen.getByRole('button', { name: 'Show as table' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Show as table' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('img')).toBeNull()
  })
})
