import type { ExchangeDto } from "@shop-agent/contract";
import { useState } from "react";
import type { ToolCall } from "../entries";
import { Muted } from "./ui/Muted";

/** The model-facing content is a JSON string in most cases; show it formatted. */
function pretty(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2) ?? "";
}

function Block({ title, children }: { title: string; children: string }) {
  return (
    <div className="block">
      <div className="block-title">{title}</div>
      <pre>{children}</pre>
    </div>
  );
}

function Exchange({ exchange, index }: { exchange: ExchangeDto; index: number }) {
  const { request, response, error } = exchange;
  const status = response ? `HTTP ${response.status}` : "応答なし";
  return (
    <div className="exchange">
      <div className="exchange-title">
        リクエスト {index + 1}: {request.method} {request.url} → {status}（{exchange.durationMs}ms）
      </div>
      <Block title="リクエスト ヘッダー">{pretty(request.headers)}</Block>
      <Block title="リクエスト ボディ（JSON-RPC）">{pretty(request.body)}</Block>
      {response && <Block title="レスポンス ボディ">{pretty(response.body)}</Block>}
      {error && <Block title="エラー">{error}</Block>}
    </div>
  );
}

/** One tool call. Collapsed by default; the details are only rendered once opened, because responses can be large. */
export function ToolCallCard({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const { result } = call;
  const state = !result ? "実行中…" : result.isError ? "エラー" : "完了";
  const requests = result?.exchanges.length ?? 0;

  return (
    <details className={`toolcall ${result?.isError ? "failed" : ""}`} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <code>{call.name}</code>
        <span className="muted">
          {state}
          {result && `・${result.durationMs}ms・MCPへのリクエスト ${requests}件`}
        </span>
      </summary>
      {open && (
        <div className="toolcall-body">
          <Muted>Shop MCPサーバー（https://mcp.shop.com）へ直接HTTPで送信しています。CLIは使っていません。</Muted>
          <Block title="モデルからの入力">{pretty(call.input)}</Block>
          {result?.exchanges.map((x, i) => (
            <Exchange
              // biome-ignore lint/suspicious/noArrayIndexKey: exchanges are shown in the order they were made and never change
              key={i}
              exchange={x}
              index={i}
            />
          ))}
          {result && requests === 0 && <Muted>このツールはMCPサーバーに送信していません。</Muted>}
          {result && <Block title="モデルに返した内容">{pretty(result.content)}</Block>}
        </div>
      )}
    </details>
  );
}
