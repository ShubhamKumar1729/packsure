import { RulesAdmin } from '@/components/rules-admin'
import { requireRole } from '@/lib/server-auth'

export default async function RulesPage() {
  await requireRole(['admin'])
  return <RulesAdmin />
}
