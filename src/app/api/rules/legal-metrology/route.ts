import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { serializeRule } from '@/lib/compliance/serialize'
import { LEGAL_METROLOGY_RULES, LEGAL_METROLOGY_RULESET_VERSION } from '@/lib/compliance/legal-metrology'
import { Rule } from '@/models/Rule'

export const runtime = 'nodejs'

/**
 * Installs the built-in Legal Metrology (Packaged Commodities) Rules, 2011
 * baseline ruleset as real Rule documents (idempotent per key).
 *
 * Rules are created DISABLED unless the admin explicitly passes
 * `enable: true` TOGETHER with `acknowledgeVerified: true` — acknowledging they
 * verified the references against the current consolidated legal text. This
 * keeps the repository's rule-safety philosophy (no silent legal thresholds)
 * while making the prototype one click to set up.
 */
export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Only administrators can install the legal ruleset.' }, { status: 403 })

  let body: { acknowledgeVerified?: boolean; enable?: boolean } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }
  const enable = body.enable === true
  if (enable && body.acknowledgeVerified !== true) {
    return NextResponse.json({ error: 'To enable the rules now, acknowledge that you verified the legal references (acknowledgeVerified: true).' }, { status: 400 })
  }

  try {
    await connectToDatabase()
    const created: ReturnType<typeof serializeRule>[] = []
    const skipped: string[] = []

    for (const rule of LEGAL_METROLOGY_RULES) {
      const existing = await Rule.findOne({ key: rule.key, version: rule.version })
      if (existing) {
        skipped.push(rule.key)
        continue
      }
      const document = await Rule.create({
        key: rule.key,
        name: rule.name,
        description: rule.description,
        checkArea: rule.checkArea,
        jurisdiction: rule.jurisdiction,
        reference: rule.reference,
        expectedRequirement: rule.expectedRequirement,
        remediation: rule.remediation,
        severity: rule.severity,
        version: rule.version,
        enabled: enable && body.acknowledgeVerified === true ? rule.defaultEnabled : false,
        definition: rule.definition,
        createdBy: session.userId,
        updatedBy: session.userId,
      })
      created.push(serializeRule(document))
    }

    return NextResponse.json({
      rulesetVersion: LEGAL_METROLOGY_RULESET_VERSION,
      enabled: enable && body.acknowledgeVerified === true,
      created,
      skipped,
      note: enable
        ? 'Rules were enabled with your verification acknowledgement. Re-check references when the legal text changes.'
        : 'Rules were installed DISABLED. Enable them in the Rules workspace after verifying the legal references.',
    }, { status: 201 })
  } catch (error) {
    console.error('Legal ruleset install error', error)
    return NextResponse.json({ error: 'The legal ruleset could not be installed.' }, { status: 500 })
  }
}
