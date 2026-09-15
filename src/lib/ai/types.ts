export type AIAnalysisStatus = 'running' | 'completed' | 'failed' | 'unavailable'
export type OCRStatus = 'completed' | 'not_configured' | 'failed' | 'empty'

export type ImageLabel = 'front' | 'back' | 'side' | 'top' | 'bottom'
export type ImageSource = 'camera' | 'upload'

/**
 * Field keys accepted in analysis records. The first group is the original
 * schema (kept for backward compatibility with stored records and custom
 * rules); the second group mirrors the legal-metrology NER entity schema
 * (see field-keys.ts for the centralized config).
 */
export type ExtractedFieldKey =
  | 'mrp'
  | 'net_quantity'
  | 'manufacturer_packer_importer'
  | 'customer_care_contact'
  | 'product_brand'
  | 'unit_sale_price'
  | 'product_name'
  | 'manufacturer'
  | 'packer'
  | 'importer'
  | 'mfg_date'
  | 'pkd_date'
  | 'import_date'
  | 'expiry_date'
  | 'best_before'
  | 'batch_number'
  | 'customer_care'
  | 'address'
  | 'country_of_origin'
  | 'ingredients'
  | 'other'

export type BoundingBox = {
  // Coordinates are normalized to the source image: 0 to 1.
  x: number
  y: number
  width: number
  height: number
}

export type SourceImageReference = {
  inspectionImageId: string
  filename: string
  label: ImageLabel
  source: ImageSource
}

export type OCRTextBlock = {
  text: string
  confidence: number
  boundingBox?: BoundingBox
}

export type OCRResult = {
  status: OCRStatus
  text: string
  confidence: number
  blocks: OCRTextBlock[]
}

export type MeasuredValue = {
  type: string
  value: number
  unit?: string
  confidence: number
  sourceImage: SourceImageReference
  boundingBox?: BoundingBox
  evidence?: string
}

export type ExtractedField = {
  key: ExtractedFieldKey
  value: string
  normalizedValue?: string | number
  unit?: string
  confidence: number
  sourceImage: SourceImageReference
  boundingBox?: BoundingBox
  evidence?: string
}

export type DetectedDeclaration = {
  type: string
  text: string
  confidence: number
  sourceImage: SourceImageReference
  boundingBox?: BoundingBox
}

export type ProviderImageInput = {
  imageId: string
  filename: string
  label: ImageLabel
  source: ImageSource
  mimeType: string
  data: Uint8Array
}

export type ProviderImageResult = {
  ocr: OCRResult
  fields: Omit<ExtractedField, 'sourceImage'>[]
  declarations: Omit<DetectedDeclaration, 'sourceImage'>[]
  measurements: Omit<MeasuredValue, 'sourceImage'>[]
  confidence: number
  providerMetadata?: Record<string, string | number | boolean>
}

export interface AIProvider {
  readonly id: string
  readonly version: string
  /**
   * Analyze one real inspection image. The provider returns normalized data;
   * the orchestration layer adds the source-image reference to every result.
   */
  analyzeImage(input: ProviderImageInput): Promise<ProviderImageResult>
}

export type ImageAnalysis = {
  sourceImage: SourceImageReference
  ocr: OCRResult
  fields: ExtractedField[]
  declarations: DetectedDeclaration[]
  measurements: MeasuredValue[]
  confidence: number
  providerMetadata?: Record<string, string | number | boolean>
}

export type InspectionAnalysisResult = {
  id?: string
  inspectionId: string
  status: AIAnalysisStatus
  provider: string
  providerVersion: string
  analyzedAt?: string
  overallConfidence: number
  images: ImageAnalysis[]
  fields: ExtractedField[]
  declarations: DetectedDeclaration[]
  error?: string
}
