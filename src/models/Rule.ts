import { Schema, model, models, type Model, type HydratedDocument } from 'mongoose'
import { RULE_CHECK_AREAS, RULE_KINDS, RULE_SEVERITIES, type RuleCheckArea, type RuleDefinition, type RuleSeverity } from '@/lib/compliance/types'

export interface RuleDocument {
  key: string
  name: string
  description: string
  checkArea: RuleCheckArea
  jurisdiction: string
  reference: string
  expectedRequirement: string
  remediation?: string
  severity: RuleSeverity
  referenceUrl?: string
  version: string
  enabled: boolean
  definition: RuleDefinition
  supersedesRuleId?: Schema.Types.ObjectId
  createdBy: Schema.Types.ObjectId
  updatedBy: Schema.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const RuleSchema = new Schema<RuleDocument>(
  {
    key: { type: String, required: true, trim: true, lowercase: true, maxlength: 120, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    checkArea: { type: String, enum: RULE_CHECK_AREAS, required: true, index: true },
    jurisdiction: { type: String, required: true, trim: true, maxlength: 80 },
    reference: { type: String, required: true, trim: true, maxlength: 500 },
    expectedRequirement: { type: String, required: true, trim: true, maxlength: 1000 },
    severity: { type: String, enum: RULE_SEVERITIES, required: true, default: 'MEDIUM' },
    referenceUrl: { type: String, trim: true, maxlength: 500 },
    version: { type: String, required: true, trim: true, maxlength: 40 },
    enabled: { type: Boolean, default: false, index: true },
    definition: {
      kind: { type: String, enum: RULE_KINDS, required: true },
      checkArea: { type: String, enum: RULE_CHECK_AREAS, required: true },
      fieldKey: { type: String, trim: true },
      fieldKeys: { type: [String], default: undefined },
      declarationType: { type: String, trim: true },
      measurementType: { type: String, trim: true },
      unit: { type: String, trim: true },
      min: { type: Number },
      max: { type: Number },
      pattern: { type: String, trim: true, maxlength: 500 },
      missingOutcome: { type: String, enum: ['VIOLATION', 'REVIEW_REQUIRED'] },
      invalidOutcome: { type: String, enum: ['VIOLATION', 'REVIEW_REQUIRED'] },
      minConfidence: { type: Number, min: 0, max: 1 },
      notApplicableWhenMissing: { type: Boolean },
      applicability: {
        fieldKey: { type: String, trim: true },
        equals: { type: String, trim: true },
      },
    },
    supersedesRuleId: { type: Schema.Types.ObjectId, ref: 'Rule' },
    createdBy: { type: Schema.Types.ObjectId, required: true, index: true },
    updatedBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
)

RuleSchema.index({ key: 1, version: 1 }, { unique: true })

export type RuleModel = Model<RuleDocument>
export type RuleRecord = HydratedDocument<RuleDocument>

export const Rule = (models.Rule as RuleModel | undefined) ?? model<RuleDocument>('Rule', RuleSchema)
