import { createFileRoute } from '@tanstack/react-router'

/* `/` is the list with the detail slot empty. The list itself is rendered by
   the pathless layout above, so there is nothing for this route to draw --
   its job is to exist, so that the path matches. */
export const Route = createFileRoute('/_shell/_list/')({
  component: () => null,
})
