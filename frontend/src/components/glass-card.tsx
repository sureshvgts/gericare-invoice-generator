import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

export function GlassCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-md',
        className,
      )}
    >
      {children}
    </div>
  )
}
