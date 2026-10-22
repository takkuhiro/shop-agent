# CLAUDE.md

Shopify の Shop MCP と Claude API で買い物をするチャットエージェント。pnpm workspace で `packages/contract`（zod スキーマ）、`packages/server`（Hono）、`packages/web`（Vite + React）の3つ。

## コマンド

- `pnpm start` ビルドして起動（http://localhost:8787）、`pnpm dev` 開発起動
- `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm format`（Biome）
- 長い出力はログファイルへ送って `tail` で確認する

## 進め方

- TDD。バグ修正には必ず再発防止のテストを足す
- 公式ドキュメント（https://shop.dev/docs）に無い挙動は、実機で確かめてから実装する。ダミー入力への 200 は検証にならない
- 方針の承認を得る前に実装へ入らない。設計の確認や質問には、まず調べた事実で答える
- 実購入（`complete_checkout`）は本人の同意なしに実行しない。Shop アカウントの設定（予算、接続の削除）は本人が行う
- git: feature ブランチで作業し、`git add` と `git commit` は別コマンドで実行する。push と PR 作成はしない

## 設計

- server は `domain`（モデルと port）→ `application`（ユースケース、エージェントのループ）→ `infrastructure`（Shop MCP、認証、Anthropic）→ `presentation`（HTTP）。依存は内向きだけ
- 具象クラスを知るのは `composition.ts` の `SessionFactory` だけ。外部との境界は port にして、テストでは差し替える
- web は表示部品を `components/`、状態と通信を `hooks/` と `api.ts` に置く。ボタンやカードの見た目は `components/ui/` の部品を使い、クラス名の文字列を各所に散らさない
- 画面と server のやり取りは `packages/contract` の zod スキーマが正。両側で検証する
- コメントは why だけ。読めば分かることは書かない

## Shop MCP で気づいたこと

- 予算（Shop Pay の budget）は接続ごとに付く。サインインし直すと新しい接続になり、予算を設定し直す。サインインはトークンを `.data/shop-token.json` に保存して再起動後も使い回す
- `/oauth/revoke` は 200 を返しても接続は消えない。サインアウトはローカルのトークン削除だけにする
- 保存カード（`type: shop_pay`）は試した店舗で API 完了を拒否された。予算（`type: delegated_budget`）で完了できたので、予算があるときは予算だけを出す
- `update_cart` / `update_checkout` は文書全体の置き換え。取得して変更し、レスポンス専用の項目を除いて送る
- 検索とカートには同じ `context`（国・通貨・言語）を渡す

## 秘密情報と個人情報

- 公開する OAuth の client_id は `.env` の `SHOP_AUTH_CLIENT_ID` から読む。コードに書かない。Shopify CLI の client_id を借用しない
- `.env` と `.data/` はコミットしない。API キーやトークンを出力・ログ・画面に出さない
- ログやスクリーンショットには、メール、住所、注文 ID、チェックアウトの `continue_url`、カード末尾桁が含まれる。公開前にマスクする
