/** An amount in the currency's minor units (USD cents, JPY yen), as the Shop API returns it. */
export class Money {
  constructor(
    readonly amount: number,
    readonly currency: string,
  ) {}

  /** 5000 yen, 42.5 dollars. */
  static fromMajor(major: number, currency: string): Money {
    return new Money(Math.round(major * 10 ** Money.digits(currency)), currency);
  }

  static digits(currency: string): number {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  }

  format(): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: this.currency }).format(
      this.amount / 10 ** Money.digits(this.currency),
    );
  }

  equals(other: Money | undefined): boolean {
    return !!other && other.amount === this.amount && other.currency === this.currency;
  }
}
