/** The market the shopper buys in. Search, carts and checkouts must all use the same one. */
export interface Market {
  country: string;
  currency: string;
  language: string;
}
