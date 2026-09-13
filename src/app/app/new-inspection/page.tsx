import { InspectionWorkflow } from '@/components/inspection-workflow'
import { requireRole } from '@/lib/server-auth'

export default async function NewInspectionPage() {
  await requireRole(['admin', 'inspector'])
  return <InspectionWorkflow />
}
