import { useEffect, useEffectEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { bootRedirectsToBoard } from '~/features/tasks/task.lastView'

/* `/` is the list with the detail slot empty. The list itself is rendered by
   the pathless layout above, so the one thing left for this route is D5: a
   bare visit lands on whichever view was open last. That is a device
   preference, so it is decided on the client, after the list has already
   painted from the server -- a brief flash of the list, in exchange for HTML
   that is the same for everyone and cacheable. */
export const Route = createFileRoute('/_shell/_list/')({
  component: ListIndex,
})

function ListIndex() {
  const search = Route.useSearch()
  const navigate = useNavigate()

  // Read once, on mount; an effect event so the values are current without
  // becoming dependencies that would re-run the check on every filter change.
  const decide = useEffectEvent(() => {
    if (bootRedirectsToBoard(Object.keys(search).length > 0)) {
      void navigate({ to: '/board', replace: true })
    }
  })
  useEffect(() => {
    decide()
  }, [])

  return null
}
