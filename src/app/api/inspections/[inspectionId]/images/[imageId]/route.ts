import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { InspectionImage } from '@/models/InspectionImage'
import { Inspection } from '@/models/Inspection'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ inspectionId: string; imageId: string }> }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  try {
    const { inspectionId, imageId } = await params
    await connectToDatabase()
    const inspection = await Inspection.findById(inspectionId).select('createdBy')
    if (!inspection || (inspection.createdBy.toString() !== session.userId && !['admin', 'reviewer'].includes(session.role))) return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
    const image = await InspectionImage.findOne({ _id: imageId, inspectionId }).select('+data')
    if (!image) return NextResponse.json({ error: 'Image not found.' }, { status: 404 })

    return new NextResponse(new Uint8Array(image.data), {
      headers: {
        'Content-Type': image.mimeType,
        'Content-Length': String(image.sizeBytes),
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': `inline; filename="${encodeURIComponent(image.filename)}"`,
      },
    })
  } catch (error) {
    console.error('Inspection image read error', error)
    return NextResponse.json({ error: 'The image could not be read.' }, { status: 503 })
  }
}
