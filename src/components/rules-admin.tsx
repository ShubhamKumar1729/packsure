'use client'

import { useEffect, useState } from 'react'
import { Check, CircleAlert, Gavel, LoaderCircle, Plus, RefreshCw, RotateCcw, Save, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { RULE_CHECK_AREAS, RULE_KINDS, RULE_SEVERITIES, type RuleCheckArea, type RuleDefinition, type RuleKind, type RuleSeverity } from '@/lib/compliance/types'

type RuleRecord = {
  id: string
  key: string
  name: string
  description: string
  checkArea: RuleCheckArea
  jurisdiction: string
  reference: string
  expectedRequirement: string
  severity: RuleSeverity
  referenceUrl: string
  version: string
  enabled: boolean
  definition: RuleDefinition
  supersedesRuleId?: string
  createdAt: string
  updatedAt: string
}

type RuleForm = {
  key: string
  name: string
  description: string
  checkArea: RuleCheckArea
  jurisdiction: string
  reference: string
  expectedRequirement: string
  severity: RuleSeverity
  referenceUrl: string
  version: string
  kind: RuleKind
  fieldKey: string
  declarationType: string
  measurementType: string
  unit: string
  min: string
  max: string
  pattern: string
  missingOutcome: 'VIOLATION' | 'REVIEW_REQUIRED'
  invalidOutcome: 'VIOLATION' | 'REVIEW_REQUIRED'
  minConfidence: string
  notApplicableWhenMissing: boolean
}

const initialForm: RuleForm = {
  key: '',
  name: '',
  description: '',
  checkArea: 'mrp',
  jurisdiction: '',
  reference: '',
  expectedRequirement: '',
  severity: 'MEDIUM',
  referenceUrl: '',
  version: '1.0.0',
  kind: 'field_presence',
  fieldKey: '',
  declarationType: '',
  measurementType: '',
  unit: '',
  min: '',
  max: '',
  pattern: '',
  missingOutcome: 'REVIEW_REQUIRED',
  invalidOutcome: 'REVIEW_REQUIRED',
  minConfidence: '',
  notApplicableWhenMissing: true,
}

const areaLabels: Record<RuleCheckArea, string> = {
  mrp: 'MRP',
  net_quantity: 'Net quantity',
  manufacturer_packer_importer: 'Manufacturer / packer / importer',
  customer_care: 'Customer care',
  required_declaration: 'Required declaration',
  readability_font_size: 'Readability / font size',
  unit_sale_price: 'Unit sale price',
  declaration_validation: 'Declaration validation',
}

const kindLabels: Record<RuleKind, string> = {
  field_presence: 'Field presence',
  declaration_presence: 'Declaration presence',
  field_numeric: 'Numeric field bounds',
  measurement_threshold: 'Measured threshold',
  field_pattern: 'Field pattern',
  manual_review: 'Manual review',
}

function emptyToUndefined(value: string) {
  return value.trim() || undefined
}

function buildDefinition(form: RuleForm) {
  return {
    kind: form.kind,
    checkArea: form.checkArea,
    fieldKey: emptyToUndefined(form.fieldKey),
    declarationType: emptyToUndefined(form.declarationType),
    measurementType: emptyToUndefined(form.measurementType),
    unit: emptyToUndefined(form.unit),
    min: form.min === '' ? undefined : Number(form.min),
    max: form.max === '' ? undefined : Number(form.max),
    pattern: emptyToUndefined(form.pattern),
    missingOutcome: form.missingOutcome,
    invalidOutcome: form.invalidOutcome,
    minConfidence: form.minConfidence === '' ? undefined : Number(form.minConfidence),
    notApplicableWhenMissing: form.notApplicableWhenMissing,
  }
}

function RuleFormView({ form, setForm, onSubmit, onCancel, saving, title }: { form: RuleForm; setForm: (form: RuleForm) => void; onSubmit: () => void; onCancel?: () => void; saving: boolean; title: string }) {
  const update = (key: keyof RuleForm, value: string | boolean) => setForm({ ...form, [key]: value as never })
  return <div className="rounded-2xl border border-line bg-[#efede7] p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-ink">{title}</p><p className="mt-1 text-xs leading-5 text-muted">Only add a rule after confirming its official legal or policy reference. New rules start disabled.</p></div>{onCancel ? <button type="button" onClick={onCancel} className="focus-ring rounded-lg p-1.5 text-muted hover:bg-white hover:text-ink" aria-label="Close rule form"><X size={17} /></button> : null}</div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">Stable rule key *</span><input value={form.key} onChange={(event) => update('key', event.target.value)} placeholder="e.g. mrp_presence" className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /></label><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">Rule name *</span><input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Human-readable check name" className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /></label><label className="block sm:col-span-2"><span className="mb-2 block text-xs font-semibold text-ink">Description *</span><textarea value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="What this verified rule evaluates" rows={2} className="focus-ring w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-moss" /></label><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">Check area *</span><select value={form.checkArea} onChange={(event) => update('checkArea', event.target.value)} className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss">{RULE_CHECK_AREAS.map((area) => <option key={area} value={area}>{areaLabels[area]}</option>)}</select></label><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">Rule kind *</span><select value={form.kind} onChange={(event) => update('kind', event.target.value)} className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss">{RULE_KINDS.map((kind) => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}</select></label><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">Jurisdiction *</span><input value={form.jurisdiction} onChange={(event) => update('jurisdiction', event.target.value)} placeholder="Enter verified jurisdiction" className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /></label><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">Version *</span><input value={form.version} onChange={(event) => update('version', event.target.value)} placeholder="e.g. 1.0.0" className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /></label><label className="block sm:col-span-2"><span className="mb-2 block text-xs font-semibold text-ink">Verified legal / policy reference *</span><input value={form.reference} onChange={(event) => update('reference', event.target.value)} placeholder="Official act, rule, notification, circular, or approved internal reference" className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /></label><label className="block sm:col-span-2"><span className="mb-2 block text-xs font-semibold text-ink">Expected requirement *</span><textarea value={form.expectedRequirement} onChange={(event) => update('expectedRequirement', event.target.value)} placeholder="Verified requirement text the reviewer should compare against" rows={2} className="focus-ring w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-moss" /></label><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">Severity *</span><select value={form.severity} onChange={(event) => update('severity', event.target.value)} className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss">{RULE_SEVERITIES.map((severity) => <option key={severity} value={severity}>{severity}</option>)}</select></label><label className="block sm:col-span-2"><span className="mb-2 block text-xs font-semibold text-ink">Reference URL</span><input type="url" value={form.referenceUrl} onChange={(event) => update('referenceUrl', event.target.value)} placeholder="Optional official source URL" className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /></label></div><div className="mt-5 border-t border-line pt-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Evaluation parameters</p><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">Field key</span><input value={form.fieldKey} onChange={(event) => update('fieldKey', event.target.value)} placeholder="e.g. mrp" className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /></label><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">Declaration type</span><input value={form.declarationType} onChange={(event) => update('declarationType', event.target.value)} placeholder="Provider declaration key" className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /></label><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">Measurement type</span><input value={form.measurementType} onChange={(event) => update('measurementType', event.target.value)} placeholder="e.g. font_size" className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /></label><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">Unit</span><input value={form.unit} onChange={(event) => update('unit', event.target.value)} placeholder="Optional configured unit" className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /></label><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">Minimum</span><input type="number" value={form.min} onChange={(event) => update('min', event.target.value)} placeholder="Optional" className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /></label><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">Maximum</span><input type="number" value={form.max} onChange={(event) => update('max', event.target.value)} placeholder="Optional" className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /></label><label className="block sm:col-span-2"><span className="mb-2 block text-xs font-semibold text-ink">Validation pattern</span><input value={form.pattern} onChange={(event) => update('pattern', event.target.value)} placeholder="Optional regular expression configured by the administrator" className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /></label><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">Minimum confidence</span><input type="number" min="0" max="1" step="0.01" value={form.minConfidence} onChange={(event) => update('minConfidence', event.target.value)} placeholder="0 to 1" className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /></label><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">When missing</span><select value={form.missingOutcome} onChange={(event) => update('missingOutcome', event.target.value)} className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss"><option value="REVIEW_REQUIRED">Review required</option><option value="VIOLATION">Violation</option></select></label><label className="block"><span className="mb-2 block text-xs font-semibold text-ink">When invalid</span><select value={form.invalidOutcome} onChange={(event) => update('invalidOutcome', event.target.value)} className="focus-ring h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss"><option value="REVIEW_REQUIRED">Review required</option><option value="VIOLATION">Violation</option></select></label></div><label className="mt-4 flex items-start gap-2 text-xs text-muted"><input type="checkbox" checked={form.notApplicableWhenMissing} onChange={(event) => update('notApplicableWhenMissing', event.target.checked)} className="mt-0.5 accent-moss" />Treat an unavailable measurement as not applicable by default. Use a different configuration when review is required.</label></div><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={onSubmit} disabled={saving} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-moss px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#174a37] disabled:opacity-60">{saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />} {saving ? 'Saving…' : 'Save disabled rule'}</button>{onCancel ? <button type="button" onClick={onCancel} className="focus-ring rounded-xl border border-line bg-paper px-4 py-2.5 text-xs font-semibold text-ink hover:bg-white">Cancel</button> : null}</div></div>
}

export function RulesAdmin() {
  const [rules, setRules] = useState<RuleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<RuleForm>(initialForm)
  const [versionFor, setVersionFor] = useState<RuleRecord | null>(null)
  const [version, setVersion] = useState('')
  const [versionReference, setVersionReference] = useState('')

  const loadRules = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/rules', { cache: 'no-store' })
      const data = (await response.json()) as { rules?: RuleRecord[]; error?: string }
      if (!response.ok) throw new Error(data.error || 'Rules could not be loaded.')
      setRules(data.rules || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Rules could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRules() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const createRule = async () => {
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, enabled: false, definition: buildDefinition(form) }) })
      const data = (await response.json()) as { rule?: RuleRecord; error?: string }
      if (!response.ok || !data.rule) throw new Error(data.error || 'The rule could not be created.')
      setRules((current) => [data.rule as RuleRecord, ...current])
      setForm(initialForm)
      setShowForm(false)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'The rule could not be created.')
    } finally {
      setSaving(false)
    }
  }

  const toggleRule = async (rule: RuleRecord) => {
    setError('')
    try {
      const response = await fetch(`/api/rules/${rule.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !rule.enabled }) })
      const data = (await response.json()) as { rule?: RuleRecord; error?: string }
      if (!response.ok || !data.rule) throw new Error(data.error || 'The rule could not be updated.')
      setRules((current) => current.map((item) => item.id === rule.id ? data.rule as RuleRecord : item))
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'The rule could not be updated.')
    }
  }

  const createVersion = async () => {
    if (!versionFor) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/rules/${versionFor.id}/versions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, reference: versionReference, definition: versionFor.definition }) })
      const data = (await response.json()) as { rule?: RuleRecord; error?: string }
      if (!response.ok || !data.rule) throw new Error(data.error || 'The rule version could not be created.')
      setRules((current) => [data.rule as RuleRecord, ...current])
      setVersionFor(null)
      setVersion('')
      setVersionReference('')
    } catch (versionError) {
      setError(versionError instanceof Error ? versionError.message : 'The rule version could not be created.')
    } finally {
      setSaving(false)
    }
  }

  return <div><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-danger" />Policy layer</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-ink">Rules</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Configure verified checks outside the frontend. Rules are versioned, disabled by default, and copied into every compliance result for traceability.</p></div><button type="button" onClick={() => { setShowForm((current) => !current); setVersionFor(null) }} className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-moss px-4 text-xs font-semibold text-white hover:bg-[#174a37]"><Plus size={16} /> {showForm ? 'Close form' : 'Add rule'}</button></div>{error ? <div role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-xs leading-5 text-danger"><CircleAlert size={16} className="mt-0.5 shrink-0" />{error}</div> : null}{showForm ? <div className="mt-6"><RuleFormView form={form} setForm={setForm} onSubmit={() => void createRule()} onCancel={() => setShowForm(false)} saving={saving} title="Add a verified configurable rule" /></div> : null}<div className="mt-8 rounded-2xl border border-line bg-[#efede7] p-5"><div className="flex items-start gap-3"><Gavel size={18} className="mt-0.5 text-danger" /><div><p className="text-xs font-semibold text-ink">Supported rule areas</p><p className="mt-1 text-xs leading-5 text-muted">These are configuration slots, not legal advice. Add the official reference and parameters before enabling any rule.</p><div className="mt-3 flex flex-wrap gap-2">{RULE_CHECK_AREAS.map((area) => <span key={area} className="rounded-full border border-line bg-paper px-2.5 py-1 text-[10px] font-medium text-muted">{areaLabels[area]}</span>)}</div></div></div></div><div className="mt-8 flex items-center justify-between"><div><p className="text-sm font-semibold text-ink">Configured rules</p><p className="mt-1 text-xs text-muted">{rules.length} {rules.length === 1 ? 'version' : 'versions'} in the database</p></div><button type="button" onClick={() => void loadRules()} className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs font-semibold text-muted hover:bg-white"><RefreshCw size={14} /> Refresh</button></div>{loading ? <div className="mt-4 flex min-h-[240px] items-center justify-center rounded-2xl border border-line bg-paper"><LoaderCircle size={22} className="animate-spin text-moss" /></div> : rules.length === 0 ? <div className="mt-4"><EmptyState icon={Gavel} eyebrow="No verified rules" title="The rule library is empty." description="No rule definitions have been added or enabled. Use Add rule to create the first verified rule with an official reference." /></div> : <div className="mt-4 space-y-3">{rules.map((rule) => <div key={rule.id} className="rounded-2xl border border-line bg-paper p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${rule.enabled ? 'bg-leaf text-moss' : 'bg-[#efede7] text-muted'}`}>{rule.enabled ? <Check size={12} /> : <ToggleLeft size={12} />}{rule.enabled ? 'Enabled' : 'Disabled'}</span><span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold text-muted">v{rule.version}</span><span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold capitalize text-muted">{rule.definition.kind.replaceAll('_', ' ')}</span></div><h3 className="mt-3 text-sm font-semibold text-ink">{rule.name}</h3><p className="mt-1 text-xs text-muted">{rule.key} · {areaLabels[rule.checkArea]} · {rule.jurisdiction}</p><p className="mt-3 max-w-3xl text-xs leading-5 text-muted">{rule.description}</p><p className="mt-3 text-xs leading-5 text-ink"><span className="font-semibold">Expected:</span> {rule.expectedRequirement} · <span className="font-semibold">Severity:</span> {rule.severity}</p><p className="mt-3 border-l-2 border-amber pl-2 text-[11px] leading-5 text-muted">Reference: {rule.reference}{rule.referenceUrl ? <a href={rule.referenceUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 font-semibold text-moss hover:text-ink">Open source ↗</a> : null}</p></div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => void toggleRule(rule)} className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink hover:bg-[#efede7]">{rule.enabled ? <ToggleRight size={15} className="text-moss" /> : <ToggleLeft size={15} />} {rule.enabled ? 'Disable' : 'Enable'}</button><button type="button" onClick={() => { setVersionFor(rule); setVersion(`${rule.version}-next`); setVersionReference(rule.reference); setShowForm(false) }} className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink hover:bg-[#efede7]"><RotateCcw size={14} /> New version</button></div></div>{versionFor?.id === rule.id ? <div className="mt-5 border-t border-line pt-5"><p className="text-xs font-semibold text-ink">Create a disabled version from {rule.version}</p><div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr_auto]"><input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="Version" className="focus-ring h-10 rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /><input value={versionReference} onChange={(event) => setVersionReference(event.target.value)} placeholder="Verified reference" className="focus-ring h-10 rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-moss" /><div className="flex gap-2"><button type="button" onClick={() => void createVersion()} disabled={saving} className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-moss px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"><Save size={14} /> Save</button><button type="button" onClick={() => setVersionFor(null)} className="focus-ring rounded-xl border border-line bg-paper px-3 py-2 text-xs font-semibold text-muted hover:bg-white">Cancel</button></div></div></div> : null}</div>)}</div>}</div>
}
