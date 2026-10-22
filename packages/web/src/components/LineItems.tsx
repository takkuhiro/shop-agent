import type { CartDto } from "@shop-agent/contract";

/** The lines of a cart or an approval: thumbnail, title × quantity and the line total. */
export function LineItems({ items }: { items: CartDto["items"] }) {
  return (
    <ul className="line-items">
      {items.map((l) => (
        <li key={l.variantId}>
          {l.image && <img className="thumb" src={l.image} alt="" loading="lazy" />}
          <span className="grow">
            {l.title} × {l.quantity}
          </span>
          <span>{l.lineTotal}</span>
        </li>
      ))}
    </ul>
  );
}
