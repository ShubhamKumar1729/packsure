import { ReviewScreen } from '@/components/review-screen'
import { requireRole } from '@/lib/server-auth'

export default async function ReviewPage({ params }: { params: Promise<{ inspectionId: string }> }) {
  await requireRole(['admin', 'reviewer'])
  const { inspectionId } = await params
  return <ReviewScreen inspectionId={inspectionId} />
}
