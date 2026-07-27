'use server'

import { revalidatePath } from 'next/cache'
import { requireUserOrThrow } from '@/lib/auth/guard'
import { markAllRead } from '@/lib/notify/channels'

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUserOrThrow()
  markAllRead(user.id)
  revalidatePath('/app/notifications')
  revalidatePath('/app')
}
