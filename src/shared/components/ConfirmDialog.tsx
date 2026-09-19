import { useEffect, useRef } from 'react'
import { Button } from './Button'
import styles from './ConfirmDialog.module.css'

/* Built on the native <dialog> with showModal(), rather than a div with
   role="dialog" and a hand-rolled focus trap. The browser then owns focus
   trapping, Escape, inertness of the page behind it and the backdrop -- four
   things a custom implementation gets subtly wrong.
   
   The component is mounted only while open, so focus is restored on UNMOUNT
   rather than on the dialog's `close` event: confirming or cancelling removes
   the component, and a `close` listener on a gone element never runs. */
export function ConfirmDialog({
  title,
  body,
  note,
  confirmLabel,
  onConfirm,
  onCancel,
  pending,
}: {
  title: string
  body: string
  note?: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  pending?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    // Captured before showModal moves focus into the dialog.
    const returnFocusTo = document.activeElement as HTMLElement | null
    dialog.showModal()

    return () => {
      if (dialog.open) dialog.close()
      // The design is explicit: focus returns to the row on close.
      returnFocusTo?.focus()
    }
  }, [])

  // Escape closes a native dialog without telling React, so `cancel` is what
  // keeps component state and DOM state in step.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    const handleCancel = (event: Event) => {
      event.preventDefault()
      onCancel()
    }
    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [onCancel])

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby="confirm-title">
      <div className={styles.panel}>
        <h2 className={styles.title} id="confirm-title">
          {title}
        </h2>
        <p className={styles.body}>{body}</p>
        {note && <p className={styles.note}>{note}</p>}
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={pending}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
