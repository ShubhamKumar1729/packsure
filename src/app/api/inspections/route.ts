import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { IMAGE_LABELS, IMAGE_SOURCES, InspectionImage } from '@/models/InspectionImage'
import { Inspection } from '@/models/Inspection'
import { InspectionCompliance } from '@/models/InspectionCompliance'
import { Product } from '@/models/Product'

export const runtime = 'nodejs'

const MAX_IMAGES = 10
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

type ProductInput = {
  name?: string
  brand?: string
  manufacturer?: string
  category?: string
  packSize?: string
  unit?: string
  batchNumber?: string
  declaredRetailPrice?: number | string
  onlineListingUrl?: string
}

type ImageMeta = {
  label?: string
  source?: string
  sortOrder?: number
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : undefined
}

function parseProduct(value: FormDataEntryValue | null): ProductInput | null {
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value) as ProductInput
  } catch {
    return null
  }
}

function parseImageMetadata(value: FormDataEntryValue | null): ImageMeta[] | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}


export async function GET() {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)

  try {
    await connectToDatabase()
    const records = await Inspection.find(['admin', 'reviewer'].includes(session.role) ? {} : { createdBy: session.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('productId', 'name brand')
      .lean()
    const complianceRuns = await InspectionCompliance.find({ inspectionId: { $in: records.map((record) => record._id) } }).sort({ createdAt: -1 }).lean()
    const latestCompliance = new Map<string, (typeof complianceRuns)[number]>()
    complianceRuns.forEach((run) => { if (!latestCompliance.has(run.inspectionId.toString())) latestCompliance.set(run.inspectionId.toString(), run) })

    return NextResponse.json({
      inspections: records.map((record) => {
        const product = record.productId as unknown as { name?: string; brand?: string }
        const compliance = latestCompliance.get(record._id.toString())
        return {
          id: record._id.toString(),
          productName: product?.name || 'Unnamed product',
          brand: product?.brand || '',
          status: record.status,
          finalDecision: record.finalDecision || 'PENDING',
          complianceStatus: compliance?.status || null,
          complianceScore: compliance?.score ?? null,
          imageCount: record.imageCount,
          createdAt: record.createdAt,
        }
      }),
    })
  } catch (error) {
    console.error('Inspection list error', error)
    return NextResponse.json({ error: 'Inspections could not be loaded.' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)
  if (!['admin', 'inspector'].includes(session.role)) return errorResponse('Your role cannot create inspections.', 403)

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse('The inspection payload could not be read.')
  }

  const productInput = parseProduct(formData.get('product'))
  const metadata = parseImageMetadata(formData.get('imageMetadata'))
  const files = formData.getAll('images').filter((value): value is File => value instanceof File)

  const name = cleanString(productInput?.name, 200)
  if (!productInput || !name) return errorResponse('Product name is required.')
  if (!metadata || metadata.length !== files.length) return errorResponse('Each image must include a label and source.')
  if (files.length < 1) return errorResponse('At least one package image is required.')
  if (files.length > MAX_IMAGES) return errorResponse(`A maximum of ${MAX_IMAGES} images can be saved.`)

  const imageRecords: { file: File; label: (typeof IMAGE_LABELS)[number]; source: (typeof IMAGE_SOURCES)[number]; sortOrder: number }[] = []
  let totalBytes = 0

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    const item = metadata[index]
    const label = item?.label
    const source = item?.source
    const sortOrder = Number(item?.sortOrder)

    if (!IMAGE_LABELS.includes(label as (typeof IMAGE_LABELS)[number])) return errorResponse('Every image needs a valid package label.')
    if (!IMAGE_SOURCES.includes(source as (typeof IMAGE_SOURCES)[number])) return errorResponse('Every image needs a valid source.')
    if (!Number.isInteger(sortOrder) || sortOrder < 0) return errorResponse('Image order is invalid.')
    if (!ALLOWED_MIME_TYPES.has(file.type)) return errorResponse('Only image files can be uploaded.')
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return errorResponse('Each image must be 8 MB or smaller.')

    totalBytes += file.size
    imageRecords.push({ file, label: label as (typeof IMAGE_LABELS)[number], source: source as (typeof IMAGE_SOURCES)[number], sortOrder })
  }

  if (totalBytes > MAX_IMAGE_BYTES * 5) return errorResponse('The total image payload is too large.')

  const declaredRetailPrice = productInput.declaredRetailPrice === '' || productInput.declaredRetailPrice === undefined ? undefined : Number(productInput.declaredRetailPrice)
  if (declaredRetailPrice !== undefined && (!Number.isFinite(declaredRetailPrice) || declaredRetailPrice < 0)) return errorResponse('Declared retail price must be a valid non-negative number.')
  const onlineListingUrl = cleanString(productInput.onlineListingUrl, 2000)
  if (onlineListingUrl) {
    try {
      const parsedUrl = new URL(onlineListingUrl)
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) return errorResponse('Online listing URL must use HTTP or HTTPS.')
    } catch {
      return errorResponse('Online listing URL is invalid.')
    }
  }

  try {
    await connectToDatabase()

    const product = await Product.create({
      name,
      brand: cleanString(productInput.brand, 120),
      manufacturer: cleanString(productInput.manufacturer, 200),
      category: cleanString(productInput.category, 120),
      packSize: cleanString(productInput.packSize, 80),
      unit: cleanString(productInput.unit, 40),
      batchNumber: cleanString(productInput.batchNumber, 120),
      declaredRetailPrice,
      createdBy: session.userId,
    })

    let inspection
    try {
      inspection = await Inspection.create({
        productId: product._id,
        createdBy: session.userId,
        status: 'submitted',
        finalDecision: 'PENDING',
        imageCount: imageRecords.length,
        onlineListingUrl,
      })
    } catch (inspectionError) {
      await Product.deleteOne({ _id: product._id })
      throw inspectionError
    }

    try {
      const imageDocuments = []
      for (const item of imageRecords) {
        imageDocuments.push({
          inspectionId: inspection._id,
          productId: product._id,
          createdBy: session.userId,
          label: item.label,
          source: item.source,
          filename: item.file.name.slice(0, 255) || `package-image-${item.sortOrder + 1}`,
          mimeType: item.file.type,
          sizeBytes: item.file.size,
          sortOrder: item.sortOrder,
          data: Buffer.from(await item.file.arrayBuffer()),
        })
      }

      const savedImages = await InspectionImage.insertMany(imageDocuments)
      return NextResponse.json({
        inspection: {
          id: inspection._id.toString(),
          productId: product._id.toString(),
          status: inspection.status,
          imageCount: savedImages.length,
          createdAt: inspection.createdAt,
        },
        product: {
          id: product._id.toString(),
          name: product.name,
        },
        images: savedImages.map((image) => ({
          id: image._id.toString(),
          label: image.label,
          source: image.source,
          filename: image.filename,
          mimeType: image.mimeType,
          sizeBytes: image.sizeBytes,
          sortOrder: image.sortOrder,
          url: `/api/inspections/${inspection._id.toString()}/images/${image._id.toString()}`,
        })),
      }, { status: 201 })
    } catch (imageError) {
      await InspectionImage.deleteMany({ inspectionId: inspection._id })
      await Inspection.deleteOne({ _id: inspection._id })
      await Product.deleteOne({ _id: product._id })
      throw imageError
    }
  } catch (error) {
    console.error('Inspection save error', error)
    return NextResponse.json({ error: 'The inspection could not be saved. Check the database connection and try again.' }, { status: 503 })
  }
}
