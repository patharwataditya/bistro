# Bistro Web — conventions (read before writing a feature)

Source of truth: `docs/web/PRODUCT_MAP.md` (behaviour, API, permissions, state machines),
`docs/web/DESIGN_SYSTEM.md` (visual language, layouts per screen, exact copy),
`docs/web/SECURITY.md`. Reference Android code lives in `android/app/src/main/java/ai/synkrasis/bistro/feature/**`.

## Stack
React 19 + TypeScript (strict, no `any`), Vite 8, React Router 8 (data router), TanStack
Query 5 (server state), Tailwind 4 with Bistro tokens, Radix primitives, Motion, lucide icons.
Node: `export PATH=$HOME/.local/share/fnm/node-versions/v24.13.0/installation/bin:$PATH`.
Checks: `npx tsc -b && npx eslint . && npx vitest run`. Dev: API :8010 (demo data), web :5173.

## Rules
- **API**: only through `request()` (`src/api/client.ts`) and query hooks. Shared reads are in
  `src/api/queries.ts` (`useFloor`, `useOrder`, `useKitchen`, `useBill(s)`, `useMenu`, …) with
  polling intervals matching Android. Feature-specific calls go in `features/<x>/api.ts`.
  Types come from `src/api/types.ts` (generated from OpenAPI) — never hand-write DTOs.
- **Mutations**: `useAction(fn, { invalidate, success })` (`features/common/useAction.ts`).
  Always send the current `version` from the freshest data. Stale/invalid-state errors refetch.
  Money/state actions that support `Idempotency-Key` use `IntentKey` (`lib/idempotency.ts`)
  with a fingerprint that includes the entity version, so a retry replays safely but a new
  intent never collides (Android's BillViewModel/OrderViewModel logic).
- **Money**: server decimal strings only. Display with `money()`/`signedMoney()` (`lib/format.ts`).
  Never compute authoritative totals; `parseMoney()` only for typed input.
- **Time**: `elapsed()/clock()/relative()`; live timers use `useServerNow(serverTime, ms)`.
  Restaurant time zone/currency from `useMe().me.location`.
- **Permissions**: `const { can } = useMe(); can(P.BILLING_REFUND)`. Hide actions the user
  can't perform; use server flags (`manageable`, `password_resettable`, `editable`) to disable
  with an explanation. The server is the authority.
- **Statuses**: `tableVisual/orderVisual/itemVisual/ticketVisual/billVisual` + `StatusChip`
  (icon + word + tone). Never colour alone. Keep Android's exact labels.
- **UI kit** (`src/ui`): Button (variants/sizes/`loading`), IconButton, Card, StatusChip,
  CountBadge, MiniFlag, TextField/TextArea/SelectField, Segmented, ChipRow, Stepper, Switch,
  ToggleRow, Drawer (side panel; `busy` locks it), ConfirmDialog, Divider, PageHeader,
  Section, AmountLine, DataTable/Th/Td/Tr, EmptyState, ErrorState, StaleBanner, Skeleton(List),
  useToast. `features/common/Totals.tsx` renders money breakdowns. Don't edit shared files;
  add new ones (feature-local components preferred).
- **Every screen**: skeleton loading, specific empty state (with next action if permitted),
  ErrorState with retry, StaleBanner when a refresh failed but data is shown
  (`query.isError && query.data`), keyboard access, visible focus, labels, ≥40px targets,
  correct in Light/Dark/Black. Tailwind colour classes only from tokens (`bg-surface`,
  `text-fg2`, `border-line`, `bg-accent-soft`…); typography via `t-*` utilities.
- **Security**: no `dangerouslySetInnerHTML`, no `console.log`, nothing sensitive in storage.
- **Tests**: Vitest + Testing Library for logic and key components (`*.test.tsx` next to code).
- **Visual check**: `node e2e/shot.mjs <path> <out.png> <light|dark|black> <width> <username>`
  (demo users owner/admin/manager/cashier/chef/server, password `bistro-demo-1`). Look at
  the result with an image viewer.
