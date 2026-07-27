'use server'

import { revalidatePath } from 'next/cache'
import { requireUserOrThrow } from '@/lib/auth/guard'
import {
  addToPipeline,
  isStage,
  removeFromPipeline,
  setStage,
  updateItem,
  type ChecklistEntry,
} from '@/lib/queries/pipeline'

export async function trackTender(tenderId: string): Promise<void> {
  const user = await requireUserOrThrow()
  addToPipeline(user.org_id, user.id, tenderId)
  revalidatePath(`/app/tenders/${tenderId}`)
  revalidatePath('/app/pipeline')
  revalidatePath('/app/tenders')
}

export async function untrackTender(tenderId: string): Promise<void> {
  const user = await requireUserOrThrow()
  removeFromPipeline(user.org_id, tenderId)
  revalidatePath(`/app/tenders/${tenderId}`)
  revalidatePath('/app/pipeline')
  revalidatePath('/app/tenders')
}

export async function moveStage(itemId: string, stage: string): Promise<void> {
  const user = await requireUserOrThrow()
  if (!isStage(stage)) return
  setStage(user.org_id, user.id, itemId, stage)
  revalidatePath('/app/pipeline')
}

export async function saveItemDetails(
  itemId: string,
  formData: FormData,
): Promise<void> {
  const user = await requireUserOrThrow()

  const notes = String(formData.get('notes') ?? '')
  const rawValue = String(formData.get('expected_value') ?? '').replace(/\s/g, '')
  const parsedValue = rawValue === '' ? null : Number(rawValue.replace(',', '.'))
  const expected_value = parsedValue !== null && Number.isFinite(parsedValue) ? parsedValue : null

  // Checklist arrives as parallel `cl_label[]` / `cl_done_<i>` fields.
  const labels = formData.getAll('cl_label').map((v) => String(v))
  const checklist: ChecklistEntry[] = labels
    .map((rawLabel, i) => ({
      label: rawLabel.trim(),
      done: formData.get(`cl_done_${i}`) === 'on',
    }))
    .filter((c) => c.label.length > 0)

  const newLabel = String(formData.get('cl_new') ?? '').trim()
  if (newLabel) checklist.push({ label: newLabel, done: false })

  updateItem(user.org_id, user.id, itemId, { notes, expected_value, checklist })
  revalidatePath('/app/pipeline')
}
