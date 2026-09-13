import type { ListingFieldValue, ListingEvidence, MarketplaceListing, MarketplaceListingProvider, MarketplaceProviderResult } from '@/lib/marketplace/types'

const MAX_DOCUMENT_BYTES = 2_000_000
const REQUEST_TIMEOUT_MS = 12_000

type JsonObject = Record<string, unknown>

type FieldCandidate = {
  value?: string
  values?: string[]
  evidence: ListingEvidence[]
}

function clean(value: unknown) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x2F;|&#47;/gi, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return match ? clean(match[1]) : ''
}

function metaValues(html: string) {
  const values = new Map<string, string>()
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0]
    const key = attribute(tag, 'property') || attribute(tag, 'name') || attribute(tag, 'itemprop')
    const value = attribute(tag, 'content')
    if (key && value && !values.has(key.toLowerCase())) values.set(key.toLowerCase(), value)
  }
  return values
}

function readJsonLd(html: string): JsonObject[] {
  const objects: JsonObject[] = []
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].trim()) as unknown
      const items = Array.isArray(parsed) ? parsed : [parsed]
      items.forEach((item) => {
        if (item && typeof item === 'object') {
          const graph = (item as JsonObject)['@graph']
          if (Array.isArray(graph)) graph.forEach((entry) => { if (entry && typeof entry === 'object') objects.push(entry as JsonObject) })
          else objects.push(item as JsonObject)
        }
      })
    } catch {
      // Some marketplace pages contain malformed JSON-LD. Other metadata may still be usable.
    }
  }
  return objects
}

function typeIncludes(value: unknown, expected: string) {
  if (Array.isArray(value)) return value.some((item) => String(item).toLowerCase().includes(expected))
  return String(value || '').toLowerCase().includes(expected)
}

function asText(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') return clean(String(value))
  if (value && typeof value === 'object') {
    const object = value as JsonObject
    return clean(object.name || object.value || object.text || object.description)
  }
  return ''
}

function productObject(objects: JsonObject[]) {
  return objects.find((item) => typeIncludes(item['@type'], 'product')) || objects.find((item) => item.name && (item.brand || item.manufacturer || item.offers)) || {}
}

function additionalProperties(product: JsonObject) {
  const values: { name: string; value: string }[] = []
  const candidates = [product.additionalProperty, product.additionalProperties]
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue
    for (const item of candidate) {
      if (!item || typeof item !== 'object') continue
      const object = item as JsonObject
      const name = asText(object.name)
      const value = asText(object.value || object.description)
      if (name && value) values.push({ name, value })
    }
  }
  return values
}

function candidate(value: string, locator: string, excerpt = value): FieldCandidate {
  return value ? { value, evidence: [{ source: 'listing', locator, excerpt: excerpt.slice(0, 320) }] } : { evidence: [] }
}

function candidates(values: string[], locator: string) {
  const unique = Array.from(new Set(values.map(clean).filter(Boolean)))
  return unique.length > 0 ? { values: unique, evidence: unique.map((value) => ({ source: 'listing' as const, locator, excerpt: value.slice(0, 320) })) } : { evidence: [] }
}

function toField(value: FieldCandidate): ListingFieldValue {
  return { value: value.value || value.values?.[0] || null, values: value.values || (value.value ? [value.value] : []), evidence: value.evidence }
}

function firstMeta(meta: Map<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = meta.get(key)
    if (value) return { value, locator: `meta:${key}` }
  }
  return null
}

function jsonLdProperty(product: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = asText(product[key])
    if (value) return { value, locator: `json-ld:Product.${key}` }
  }
  return null
}

function explicitTextValue(text: string, expression: RegExp) {
  const match = text.match(expression)
  return match?.[1] ? clean(match[1]) : ''
}

function buildListing(url: URL, html: string): MarketplaceListing {
  const meta = metaValues(html)
  const jsonLd = readJsonLd(html)
  const product = productObject(jsonLd)
  const properties = additionalProperties(product)
  const visibleText = clean(html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, ' '))

  const title = firstMeta(meta, ['og:title', 'twitter:title']) || (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ? { value: clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]), locator: 'html:title' } : null)
  const name = jsonLdProperty(product, ['name']) || title || firstMeta(meta, ['product:name'])
  const brand = jsonLdProperty(product, ['brand']) || firstMeta(meta, ['product:brand', 'brand'])
  const manufacturer = jsonLdProperty(product, ['manufacturer']) || firstMeta(meta, ['product:manufacturer', 'manufacturer'])

  const mrpProperty = properties.find((item) => /mrp|maximum retail|list price|msrp/i.test(item.name))
  const mrpMeta = firstMeta(meta, ['product:mrp', 'mrp', 'maximum-retail-price', 'maximum_retail_price', 'msrp'])
  const mrpText = explicitTextValue(visibleText, /(?:mrp|maximum\s+retail\s+price|maximum\s+retail\s+price\s*:)\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i)
  const mrp = mrpProperty ? candidate(mrpProperty.value, 'json-ld:Product.additionalProperty', `${mrpProperty.name}: ${mrpProperty.value}`) : mrpMeta ? candidate(mrpMeta.value, mrpMeta.locator) : candidate(mrpText, 'html:visible-text')

  const quantityProperty = properties.find((item) => /net\s*(quantity|content|weight)|pack\s*size|size/i.test(item.name))
  const quantity = jsonLdProperty(product, ['netContent', 'netWeight', 'weight', 'size']) || (quantityProperty ? { value: quantityProperty.value, locator: 'json-ld:Product.additionalProperty' } : null)
  const quantityMeta = firstMeta(meta, ['product:quantity', 'net-quantity', 'net_quantity', 'netcontent', 'product:size'])
  const quantityText = explicitTextValue(visibleText, /(?:net\s*(?:quantity|content|weight)|pack\s*size)\s*[:\-]?\s*([0-9]+(?:\.\d+)?\s*(?:kg|g|mg|l|ml|cl|pcs?|pieces?))\b/i)

  const declarationValues = properties
    .filter((item) => /declaration|country|origin|ingredient|allergen|vegetarian|license|licence|expiry|shelf|legal|warning/i.test(item.name))
    .map((item) => `${item.name}: ${item.value}`)
  for (const [key, value] of meta.entries()) {
    if (/declaration|country.of.origin|ingredient|allergen|vegetarian|license|licence|expiry|shelf.life|legal/i.test(key)) declarationValues.push(value)
  }

  const importantDeclarations = candidates(declarationValues, declarationValues.length > 0 ? 'json-ld/meta:declaration' : '')

  return {
    sourceUrl: url.toString(),
    marketplace: url.hostname.replace(/^www\./i, ''),
    title: title?.value || null,
    productName: toField(candidate(name?.value || '', name?.locator || 'unavailable')),
    brand: toField(candidate(brand?.value || '', brand?.locator || 'unavailable')),
    mrp: toField(mrp),
    netQuantity: toField(candidate(quantity?.value || quantityMeta?.value || quantityText, quantity?.locator || quantityMeta?.locator || (quantityText ? 'html:visible-text' : 'unavailable'))),
    manufacturer: toField(candidate(manufacturer?.value || '', manufacturer?.locator || 'unavailable')),
    importantDeclarations: toField(importantDeclarations),
  }
}

function assertSafeUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS listing URLs are supported.')
  if (url.username || url.password) throw new Error('Listing URLs with embedded credentials are not allowed.')
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname === '0.0.0.0' || hostname === '::1' || hostname.startsWith('127.')) throw new Error('Local listing URLs are not allowed.')
  const ipv4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) throw new Error('Private network listing URLs are not allowed.')
  }
}

export class GenericMarketplaceProvider implements MarketplaceListingProvider {
  readonly id = 'generic-html'
  readonly version = '0.1.0'

  supports(url: URL) {
    return ['http:', 'https:'].includes(url.protocol)
  }

  async retrieve(url: URL): Promise<MarketplaceProviderResult> {
    assertSafeUrl(url)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml,application/ld+json;q=0.9,text/plain;q=0.5',
          'user-agent': 'PackSure listing verification/0.1',
        },
      })
      if (response.status >= 300 && response.status < 400) throw new Error('The listing redirected. Submit the final listing URL directly.')
      if (!response.ok) throw new Error(`The listing returned HTTP ${response.status}.`)
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('html') && !contentType.includes('json') && !contentType.includes('text')) throw new Error('The listing did not return readable HTML or text.')
      const html = (await response.text()).slice(0, MAX_DOCUMENT_BYTES)
      if (!html.trim()) throw new Error('The listing returned an empty response.')
      const resolvedUrl = new URL(response.url || url.toString())
      return {
        provider: this.id,
        providerVersion: this.version,
        retrievedAt: new Date().toISOString(),
        listing: buildListing(resolvedUrl, html),
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('The listing request timed out.')
      throw error instanceof Error ? error : new Error('The listing could not be retrieved.')
    } finally {
      clearTimeout(timeout)
    }
  }
}

const MARKETPLACE_PROVIDERS: MarketplaceListingProvider[] = [new GenericMarketplaceProvider()]

export function getMarketplaceProvider(url: URL): MarketplaceListingProvider {
  const provider = MARKETPLACE_PROVIDERS.find((candidate) => candidate.supports(url))
  if (!provider) throw new Error('No listing provider supports this URL.')
  return provider
}
