import type { ProductDto } from "@shop-agent/contract";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Muted } from "./ui/Muted";

/** Variants shown per product. The rest are reachable by asking the agent. */
const VISIBLE_VARIANTS = 4;

function ProductCard({ product, onAdd }: { product: ProductDto; onAdd: (variantIndex: number) => void }) {
  return (
    <Card kind="product" title={product.title}>
      {product.image && <img className="product-image" src={product.image} alt="" loading="lazy" />}
      {product.rating && <Muted>{product.rating}</Muted>}
      <ul className="variants">
        {product.variants.slice(0, VISIBLE_VARIANTS).map((v, i) => (
          <li key={v.variantId}>
            <span>
              {v.options || "標準"} <strong>{v.price}</strong>
              {v.available === false && <em className="muted"> 在庫なし</em>}
            </span>
            <span className="muted">{v.seller}</span>
            <Button disabled={v.available === false} onClick={() => onAdd(i)}>
              カートに入れる
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ProductCards({ products, onAdd }: { products: ProductDto[]; onAdd: (product: ProductDto, variantIndex: number) => void }) {
  return (
    <div className="cards">
      {products.map((p) => (
        <ProductCard key={p.productId} product={p} onAdd={(i) => onAdd(p, i)} />
      ))}
    </div>
  );
}
