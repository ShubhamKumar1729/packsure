/**
 * Centralized mapping between the NLP service's legal-metrology entity labels
 * and PackSure analysis field keys (Phase 4: one configuration, never hardcoded
 * throughout the app).
 *
 * Sync duty: the canonical label list lives in `nlp-service/app/entities.py`
 * (mirrored at `ml/config/labels.json`). Unknown labels arriving from the
 * service are mapped to `other` so a future schema change cannot crash the
 * backend — document changes, never silently drift.
 */

export const LEGAL_METROLOGY_FIELD_KEYS = [
  'product_name',
  'manufacturer',
  'packer',
  'importer',
  'net_quantity',
  'mrp',
  'mfg_date',
  'pkd_date',
  'import_date',
  'expiry_date',
  'best_before',
  'batch_number',
  'customer_care',
  'address',
  'country_of_origin',
  'ingredients',
] as const

export type LegalMetrologyFieldKey = (typeof LEGAL_METROLOGY_FIELD_KEYS)[number]

/** Human-readable labels for UI rendering. */
export const FIELD_KEY_TITLES: Record<string, string> = {
  product_name: 'Product (generic) name',
  manufacturer: 'Manufacturer',
  packer: 'Packer',
  importer: 'Importer',
  net_quantity: 'Net quantity',
  mrp: 'MRP (retail sale price)',
  mfg_date: 'Month & year of manufacture',
  pkd_date: 'Month & year of pre-packing',
  import_date: 'Month & year of import',
  expiry_date: 'Expiry / use-by',
  best_before: 'Best before',
  batch_number: 'Batch / lot number',
  customer_care: 'Consumer care contact',
  address: 'Address',
  country_of_origin: 'Country of origin',
  ingredients: 'Ingredients',
  // Legacy keys kept from the original schema (still accepted by custom rules).
  manufacturer_packer_importer: 'Manufacturer / packer / importer',
  product_brand: 'Brand',
  unit_sale_price: 'Unit sale price',
  other: 'Other',
}

/** Declarations that legally exist only when the responsible party role applies. */
export const PARTY_FIELD_KEYS: LegalMetrologyFieldKey[] = ['manufacturer', 'packer', 'importer']
export const DATE_FIELD_KEYS: LegalMetrologyFieldKey[] = ['mfg_date', 'pkd_date', 'import_date']
export const CONTACT_FIELD_KEYS: LegalMetrologyFieldKey[] = ['customer_care']

export function fieldKeyTitle(key: string) {
  return FIELD_KEY_TITLES[key] ?? key.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
