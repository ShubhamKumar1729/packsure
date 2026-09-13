import type { MarketplaceListingProvider, MarketplaceProviderResult } from '@/lib/marketplace/types'

/**
 * Test seam only. The integration test supplies a real fixture result; this
 * provider is intentionally not registered by the production provider factory
 * and never creates marketplace records by itself.
 */
export class MockMarketplaceProvider implements MarketplaceListingProvider {
  readonly id = 'mock-marketplace'
  readonly version = '0.1.0'

  constructor(private readonly fixture: MarketplaceProviderResult) {}

  supports() {
    return true
  }

  async retrieve(url: URL) {
    return { ...this.fixture, provider: this.id, providerVersion: this.version, listing: { ...this.fixture.listing, sourceUrl: url.toString() } }
  }
}
