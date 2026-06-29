import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { useId, useState, type ReactNode } from 'react'
import { Dialog } from '@shared/ui/Dialog/Dialog'
import { DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog/DialogHeader'

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

function TestDialog({
  open,
  title,
  onClose,
  closeDisabled = false,
  closeOnBackdrop = true,
  closeOnEscape = true,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  closeDisabled?: boolean
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  children?: ReactNode
}) {
  const titleId = useId()
  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} closeOnBackdrop={closeOnBackdrop} closeOnEscape={closeOnEscape}>
      <DialogHeader title={title} onClose={onClose} closeLabel={`Close ${title}`} closeDisabled={closeDisabled} id={titleId} />
      <DialogBody>
        <button type="button">{`${title} first`}</button>
        {children}
        <button type="button">{`${title} last`}</button>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>Cancel {title}</DialogAction>
      </DialogFooter>
    </Dialog>
  )
}

describe('Dialog', () => {
  it('only lets the top dialog handle Escape', () => {
    const parentClose = vi.fn()
    const childClose = vi.fn()
    const stopImmediatePropagation = vi.fn()

    render(
      <>
        <TestDialog open title="Parent" onClose={parentClose} />
        <TestDialog open title="Child" onClose={childClose} />
      </>,
    )

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    Object.defineProperty(event, 'stopImmediatePropagation', { value: stopImmediatePropagation })
    document.dispatchEvent(event)

    expect(childClose).toHaveBeenCalledTimes(1)
    expect(parentClose).not.toHaveBeenCalled()
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1)
  })

  it('keeps focus trapped in the top dialog', () => {
    render(
      <>
        <TestDialog open title="Parent" onClose={vi.fn()} />
        <TestDialog open title="Child" onClose={vi.fn()} />
      </>,
    )

    const childLast = screen.getByRole('button', { name: 'Cancel Child' })
    const childClose = screen.getByRole('button', { name: 'Close Child' })
    childLast.focus()

    fireEvent.keyDown(document, { key: 'Tab' })

    expect(document.activeElement).toBe(childClose)
  })

  it('keeps body scroll locked until the final dialog closes', () => {
    function Harness() {
      const [parentOpen, setParentOpen] = useState(true)
      const [childOpen, setChildOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setParentOpen(true)}>
            Open parent
          </button>
          <TestDialog open={parentOpen} title="Parent" onClose={() => setParentOpen(false)} />
          <TestDialog open={childOpen} title="Child" onClose={() => setChildOpen(false)} />
        </>
      )
    }

    document.body.style.overflow = 'auto'
    render(<Harness />)

    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Child' }))
    expect(screen.queryByRole('dialog', { name: 'Child' })).toBeNull()
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Parent' }))
    expect(document.body.style.overflow).toBe('auto')
  })

  it('restores focus inside the parent dialog when a child dialog closes', () => {
    function Harness() {
      const [childOpen, setChildOpen] = useState(false)
      return (
        <TestDialog open title="Parent" onClose={vi.fn()}>
          <button type="button" onClick={() => setChildOpen(true)}>
            Open child
          </button>
          <TestDialog open={childOpen} title="Child" onClose={() => setChildOpen(false)} />
        </TestDialog>
      )
    }

    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open child' })
    opener.focus()
    fireEvent.click(opener)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Child' }))

    expect(document.activeElement).toBe(opener)
  })

  it('disables only the header close button when closeDisabled is set', () => {
    const onClose = vi.fn()

    render(<TestDialog open title="Busy" onClose={onClose} closeDisabled closeOnBackdrop closeOnEscape />)

    expect(screen.getByRole('button', { name: 'Close Busy' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
