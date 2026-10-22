import type { Product, SearchCriteria, SearchPage } from "../../domain/catalog.js";
import type { Market } from "../../domain/market.js";
import type { CatalogGateway } from "../../domain/ports.js";

export class SearchProducts {
  constructor(
    private readonly catalog: CatalogGateway,
    private readonly market: Market,
  ) {}

  execute(criteria: SearchCriteria): Promise<SearchPage> {
    return this.catalog.search(criteria, this.market);
  }
}

export class GetProduct {
  constructor(
    private readonly catalog: CatalogGateway,
    private readonly market: Market,
  ) {}

  execute(productId: string, selected?: { name: string; label: string }[]): Promise<Product> {
    return this.catalog.getProduct(productId, selected, this.market);
  }
}
