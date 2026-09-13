import { Schema, model, models, type Model, type HydratedDocument } from 'mongoose'
import type { UserRole } from '@/lib/auth-shared'

export interface UserDocument {
  email: string
  passwordHash: string
  role: UserRole
  displayName?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<UserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['admin', 'inspector', 'reviewer', 'viewer'],
      required: true,
      default: 'viewer',
    },
    displayName: { type: String, trim: true, maxlength: 120 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
)

export type UserModel = Model<UserDocument>
export type UserRecord = HydratedDocument<UserDocument>

export const User = (models.User as UserModel | undefined) ?? model<UserDocument>('User', UserSchema)
