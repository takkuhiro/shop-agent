/** The Shop API wants a signed-in shopper (HTTP 401 with scope personal_agent). */
export class AuthRequiredError extends Error {
  constructor(message = "Shop sign-in is required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/** A business rule was broken; the message is safe to show to the shopper and the model. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
