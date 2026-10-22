import type { Money } from "./money.js";

export interface Notice {
  type: string;
  code?: string;
  content: string;
  severity?: string;
}

export interface Variant {
  id: string;
  options: string;
  price?: Money;
  listPrice?: Money;
  available?: boolean;
  url?: string;
  seller?: string;
  /** The seller's shop domain; carts and checkouts are addressed by it. */
  shop?: string;
}

export interface Product {
  id: string;
  title: string;
  rating?: string;
  image?: string;
  options: Record<string, string[]>;
  variants: Variant[];
}

export type AttributeName = "Color" | "Size" | "Target gender";

/** What the shopper asked for. Prices are whole-currency amounts (5000 yen), not minor units. */
export interface SearchCriteria {
  query?: string;
  similarTo?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  minReviewCount?: number;
  condition?: ("new" | "secondhand")[];
  shipsFrom?: string[];
  sellers?: string[];
  attributes?: { name: AttributeName; values: string[] }[];
  includeUnavailable?: boolean;
  limit: number;
  cursor?: string;
}

export interface SearchPage {
  products: Product[];
  nextCursor?: string;
  notices: Notice[];
}
