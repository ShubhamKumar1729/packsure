import { Schema, model, models, type Model, type HydratedDocument } from 'mongoose'

export interface ProductDocument {
  name: string
  brand?: string
  manufacturer?: string
  category?: string
  packSize?: string
  unit?: string
  batchNumber?: string
  declaredRetailPrice?: number
  createdBy: Schema.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const ProductSchema = new Schema<ProductDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    brand: { type: String, trim: true, maxlength: 120 },
    manufacturer: { type: String, trim: true, maxlength: 200 },
    category: { type: String, trim: true, maxlength: 120 },
    packSize: { type: String, trim: true, maxlength: 80 },
    unit: { type: String, trim: true, maxlength: 40 },
    batchNumber: { type: String, trim: true, maxlength: 120 },
    declaredRetailPrice: { type: Number, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: true },
)

export type ProductModel = Model<ProductDocument>
export type ProductRecord = HydratedDocument<ProductDocument>

export const Product = (models.Product as ProductModel | undefined) ?? model<ProductDocument>('Product', ProductSchema)
