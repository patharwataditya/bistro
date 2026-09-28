import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { useState } from 'react'
import { RouterProvider } from 'react-router'
import { createQueryClient } from '@/api/queries'
import { SessionProvider, useSession } from '@/auth/session'
import { Button } from '@/ui/Button'
import { ErrorState } from '@/ui/States'
import { ToastProvider } from '@/ui/Toast'
import { BrandMark } from './Brand'
import { router } from './router'

function Gate() {
  const { state, retryRestore, signOut } = useSession()
  if (state.status === 'restoring') {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading Bistro">
        <div className="animate-pulse"><BrandMark size={56} /></div>
      </div>
    )
  }
  if (state.status === 'restore-failed') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2">
        <ErrorState error={state.error} onRetry={retryRestore} />
        <Button variant="ghost" onClick={() => void signOut()}>Sign in again</Button>
      </div>
    )
  }
  return <RouterProvider router={router} />
}

export function App() {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <SessionProvider>
            <Gate />
          </SessionProvider>
        </ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}
