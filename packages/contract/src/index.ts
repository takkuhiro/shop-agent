/**
 * The HTTP/SSE contract between the web UI and the server.
 * Both sides import these schemas: the server to build responses, the UI to validate them.
 */
import { z } from "zod";

export const MessageDto = z.object({
  type: z.string(),
  code: z.string().optional(),
  content: z.string(),
  severity: z.string().optional(),
});
export type MessageDto = z.infer<typeof MessageDto>;

export const VariantDto = z.object({
  variantId: z.string(),
  options: z.string(),
  price: z.string().optional(),
  listPrice: z.string().optional(),
  available: z.boolean().optional(),
  url: z.string().optional(),
  seller: z.string().optional(),
  shop: z.string().optional(),
});
export type VariantDto = z.infer<typeof VariantDto>;

export const ProductDto = z.object({
  productId: z.string(),
  title: z.string(),
  rating: z.string().optional(),
  image: z.string().optional(),
  variants: z.array(VariantDto),
});
export type ProductDto = z.infer<typeof ProductDto>;

export const CartLineDto = z.object({
  variantId: z.string(),
  title: z.string(),
  image: z.string().optional(),
  quantity: z.number(),
  unitPrice: z.string().optional(),
  lineTotal: z.string().optional(),
});

export const CartDto = z.object({
  shop: z.string(),
  items: z.array(CartLineDto),
  subtotal: z.string().optional(),
  total: z.string().optional(),
  messages: z.array(MessageDto),
  continueUrl: z.string().optional(),
});
export type CartDto = z.infer<typeof CartDto>;

export const CheckoutDto = CartDto.extend({
  status: z.string(),
  /** True when the shopper can pay inside this app (signed in and the checkout is ready). */
  payableInApp: z.boolean(),
});
export type CheckoutDto = z.infer<typeof CheckoutDto>;

export const ApprovalDto = z.object({
  id: z.string(),
  shop: z.string(),
  items: z.array(CartLineDto),
  total: z.string(),
  instruments: z.array(z.object({ id: z.string(), label: z.string() })),
  state: z.enum(["pending", "completed", "rejected", "failed", "unknown"]),
  orderId: z.string().optional(),
  note: z.string().optional(),
});
export type ApprovalDto = z.infer<typeof ApprovalDto>;

export const AuthStatusDto = z.object({
  signedIn: z.boolean(),
  /** False when no OAuth client is configured on the server. */
  loginAvailable: z.boolean(),
});
export type AuthStatusDto = z.infer<typeof AuthStatusDto>;

export const AccountConnectionDto = z.object({
  payment: z.unknown().optional(),
  links: z.unknown().optional(),
  messages: z.unknown().optional(),
});
export type AccountConnectionDto = z.infer<typeof AccountConnectionDto>;

export const LoginChallengeDto = z.object({
  userCode: z.string(),
  verificationUri: z.string(),
  verificationUriComplete: z.string().optional(),
  expiresIn: z.number(),
  interval: z.number(),
});
export type LoginChallengeDto = z.infer<typeof LoginChallengeDto>;

export const LoginPollDto = z.object({ status: z.enum(["pending", "signed_in", "expired", "denied"]) });
export type LoginPollDto = z.infer<typeof LoginPollDto>;

export const SessionDto = z.object({
  sessionId: z.string(),
  market: z.object({ country: z.string(), currency: z.string(), language: z.string() }),
  auth: AuthStatusDto,
  carts: z.array(CartDto),
});
export type SessionDto = z.infer<typeof SessionDto>;

/** One HTTP request to the Shop MCP server and its answer, with secrets removed. For the developer view. */
export const ExchangeDto = z.object({
  request: z.object({ method: z.string(), url: z.string(), headers: z.record(z.string(), z.string()), body: z.unknown() }),
  response: z.object({ status: z.number(), body: z.unknown() }).optional(),
  error: z.string().optional(),
  durationMs: z.number(),
});
export type ExchangeDto = z.infer<typeof ExchangeDto>;

/** Events streamed while the agent handles one user message. */
export const ChatEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), delta: z.string() }),
  z.object({ type: z.literal("tool"), id: z.string(), name: z.string(), input: z.unknown() }),
  z.object({
    type: z.literal("tool_result"),
    id: z.string(),
    isError: z.boolean(),
    /** What the model was given back. */
    content: z.string(),
    exchanges: z.array(ExchangeDto),
    durationMs: z.number(),
  }),
  z.object({ type: z.literal("products"), products: z.array(ProductDto) }),
  z.object({ type: z.literal("carts"), carts: z.array(CartDto) }),
  z.object({ type: z.literal("checkout"), checkout: CheckoutDto }),
  z.object({ type: z.literal("approval"), approval: ApprovalDto }),
  z.object({ type: z.literal("auth_required"), reason: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("done") }),
]);
export type ChatEvent = z.infer<typeof ChatEvent>;

/** What the screen shows for a session: the shopper's messages and every event, in order. Used to redraw it after a reload. */
export const TranscriptEntry = z.union([z.object({ type: z.literal("user"), text: z.string() }), ChatEvent]);
export type TranscriptEntry = z.infer<typeof TranscriptEntry>;

export const SendMessageRequest = z.object({
  text: z.string().min(1).max(4000),
  /** Extra context the UI attaches (e.g. the variant behind an "add to cart" button). Not shown in the chat. */
  hint: z.string().max(1000).optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;

export const ApproveRequest = z.object({ instrumentId: z.string() });
export type ApproveRequest = z.infer<typeof ApproveRequest>;
