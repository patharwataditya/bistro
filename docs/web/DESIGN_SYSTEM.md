# Bistro Web — Design System

The web app has to look and behave like the same product as the Android app. The source of truth is `android/app/src/main/java/ai/synkrasis/bistro/core/designsystem/**` and `domain/StatusVisuals.kt`. When this document and the Android code disagree, the Android code wins. Fix this document to match it.

Principles carried over from Android:
- Screens use semantic tokens and never write raw hex.
- There is one type scale, and screens pick a role from it.
- Depth comes from a shadow only in Light. Dark and Black use borders and tone instead.
- A status is always shown as icon + word + tone. Colour is never the only signal.
- Motion is short and decelerating. Nothing blocks input, and nothing bounces.
- The app offers exactly three appearances: **Light, Dark and Black**. There is no "System" option. The default is Light.

---

## 1. Colour tokens

Expose the tokens as CSS custom properties on `:root[data-appearance="light|dark|black"]`. Tailwind or other utilities must reference the variables, never the hex values. Persist the chosen appearance in `localStorage` under the key `bistro.appearance`, using the values `light`, `dark` and `black`. Set the attribute in an inline `<head>` script so the page doesn't flash the wrong theme on load.

| Token | Light | Dark | Black |
|---|---|---|---|
| `--background` | `#F6F3EE` | `#141311` | `#000000` |
| `--surface` | `#FFFFFF` | `#1D1C19` | `#0A0A0A` |
| `--surface-raised` | `#FFFFFF` | `#262421` | `#131313` |
| `--surface-sunken` | `#EFEAE3` | `#100F0D` | `#000000` |
| `--border` | `#E7E1D8` | `#302D29` | `#242424` |
| `--border-strong` | `#D4CCC0` | `#45413B` | `#383838` |
| `--text-primary` | `#1A1814` | `#F3F0EA` | `#F5F3EF` |
| `--text-secondary` | `#5C574F` | `#B7B1A7` | `#B3AEA6` |
| `--text-tertiary` | `#716B62` | `#8A847A` | `#8A847A` |
| `--text-disabled` | `#B8B2A8` | `#5A564F` | `#5A564F` |
| `--ink` | `#1C1A16` | `#F3F0EA` | `#F3F0EA` |
| `--on-ink` | `#FBF9F6` | `#171512` | `#171512` |
| `--accent` | `#A8471B` | `#F07A45` | `#F07A45` |
| `--accent-soft` | `#FBE7DD` | `#3A2419` | `#2B170D` |
| `--on-accent` | `#FFFFFF` | `#1A0E08` | `#1A0E08` |
| `--success` / `-soft` | `#17744A` / `#DFF3E8` | `#46C98A` / `#16301F` | `#46C98A` / `#0C2215` |
| `--warning` / `-soft` | `#8F5C0E` / `#FBEFD6` | `#F0B44C` / `#342812` | `#F0B44C` / `#261B08` |
| `--danger` / `-soft` | `#B02E25` / `#FBE2DF` | `#F26B5E` / `#3A1B18` | `#F26B5E` / `#2A100D` |
| `--info` / `-soft` | `#3F4DB8` / `#E5E8FB` | `#8C98FF` / `#1F2340` | `#8C98FF` / `#141733` |
| `--neutral` / `-soft` | `#5E5A54` / `#EDEAE5` | `#A29C92` / `#2A2825` | `#A29C92` / `#1A1A1A` |
| `--cleaning` / `-soft` | `#0A737C` / `#DDF2F3` | `#45C7D0` / `#12292B` | `#45C7D0` / `#081C1E` |
| `--scrim` | `rgba(18,15,10,.40)` (`#66120F0A`) | `rgba(0,0,0,.60)` | `rgba(0,0,0,.60)` |
| `--shadow` | `rgba(43,33,21,.12)` (`#1F2B2115`) | `rgba(0,0,0,.40)` (unused) | `transparent` |

How the tokens are used:
- **Ink** is the high-contrast neutral: near-black in Light and "chalk" in Dark/Black. It is the colour of Primary buttons, selected chips, the active nav indicator and toasts.
- **Accent** is the ember colour. Use it only for key actions (Sign in, Send to kitchen), quantity multipliers and notes on kitchen tickets, the text cursor, and the selected appearance card.
- **Tones.** Each tone is a pair of tokens: `content` (for example `--success`) and `container` (`--success-soft`). The seven tones are Accent, Success, Warning, Danger, Info, Neutral and Cleaning.

### Web-only tokens (derived)

| Token | Value | Why |
|---|---|---|
| `--focus-ring` | `0 0 0 2px var(--background), 0 0 0 4px var(--accent)` | Android has no keyboard focus, so this is new. An ember ring with a 2 px gap reads clearly on every surface in all three modes. `--text-primary` was rejected because it looks like a border. Apply it with `:focus-visible` only. |
| `--hover-overlay` | `color-mix(in srgb, var(--text-primary) 5%, transparent)` (7% in Dark/Black) | Plays the role of Android's `ripple(color = textPrimary)` for pointer hover. It is laid over any surface, which keeps it tone-neutral. |
| `--press-overlay` | `text-primary` at 10% (12% in Dark/Black) | The pressed state. Pair it with the press scale in §3. |
| `--hover-overlay-on-ink` | `on-ink` at 10% | Hover on Primary, Accent and selected-chip fills, so the fill colour itself never shifts. |
| `--selection-bg` / `--selection-fg` | `var(--accent-soft)` / `var(--text-primary)` | Used for `::selection` and for DataTable rows that are selected (the row also gets a 2 px `--accent` inset on its left edge). |
| `--row-hover` | `var(--surface-sunken)` at 60% | Hover on DataTable and list rows. |
| `--scrollbar` | `var(--border-strong)` thumb on transparent track, 8 px wide | Keeps scrollbars thin in dense desktop views. |

Set `color-scheme: light` for Light and `color-scheme: dark` for Dark/Black, so native form controls and scrollbars match.

## 2. Typography

The fonts are **Manrope** (the display face: titles, table names, amounts) and **Inter** (the text face). Both are variable fonts. Self-host them as `woff2` with `font-display: swap`. Fall back to `system-ui`.

Wherever the Android role uses tabular figures, add `font-feature-settings: "tnum","lnum"` (the `.tnum` utility). This applies to every amount, timer, count and identifier.

Android sp values map 1:1 to px, with a root size of 16 px.

| Role | Font / weight | Size / line | Tracking | tnum | Desktop ≥1280 |
|---|---|---|---|---|---|
| `display` | Manrope 700 | 34/40 | -0.02em | | 40/46 |
| `pageTitle` | Manrope 700 | 26/32 | -0.015em | | 28/34 |
| `sectionTitle` | Manrope 600 | 18/24 | -0.01em | | same |
| `cardTitle` | Manrope 600 | 16/22 | 0 | | same |
| `tableLabel` | Manrope 800 | 22/26 | -0.02em | | same (Kitchen: 28/32) |
| `identifier` | Inter 600 | 13/18 | 0 | yes | same |
| `body` | Inter 400 | 15/22 | 0 | | same |
| `bodyStrong` | Inter 600 | 15/22 | 0 | | same |
| `supporting` | Inter 400 | 13/18 | 0 | | same |
| `metadata` | Inter 500 | 12/16 | 0 | yes | same |
| `statusLabel` | Inter 600 | 11/14 | +0.06em, uppercase | | same |
| `button` | Inter 600 | 15/20 | +0.005em | | same |
| `amountHero` | Manrope 800 | 40/46 | -0.025em | yes | 48/54 |
| `amountLarge` | Manrope 700 | 22/28 | 0 | yes | 24/30 |
| `amount` | Inter 600 | 15/22 | 0 | yes | same |
| `amountSmall` | Inter 500 | 13/18 | 0 | yes | same |
| `metric` | Manrope 800 | 28/32 | -0.02em | yes | 32/36 (Kitchen timer: 36/40) |

Web-only role: `tableCell`, Inter 400 at 14/20 (tnum for numeric columns), used only in DataTable.

Scale up only the roles in the right-hand column. Body text stays at 15 px so densities match across platforms. The Kitchen screen is the exception because it is read at arm's length. At ≥1024 px its ticket item names use `sectionTitle` at 22/28, and its lane headers use `sectionTitle`.

Use `rem` everywhere so the browser's text zoom works. Layouts must survive 200% zoom (WCAG 1.4.4). The Android rule "grows with font scale, never clips" becomes: set `min-height`, not a fixed `height`.

## 3. Spacing, radii, elevation, motion

**Spacing** (4 px base): `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · section 28 · xxxl 32`.
- Page gutter: 20 px on narrow screens, 24 px at ≥768, 32 px at ≥1280.
- Minimum hit target: 44 px for pointer (Small button height), 48 px for touch layouts (<1024). Use `@media (pointer: coarse)` to enforce 48 px.

**Radii**: `xs 6 · sm 10 · md 14 · lg 20 · xl 28 · pill 9999`.
- Buttons, inputs and the segmented control track: `md`.
- Cards and the appearance picker: `lg`.
- Dialogs, the login card and the empty-state icon tile: `xl`.
- Segmented indicator and mini flags: `sm` / `xs`.
- Drawers: 28 px only on the edge facing the content. This matches `Radii.sheet`, which rounds the top corners of bottom sheets.

**Elevation**:
- Every card has a 1 px `--border`.
- **Light only**: cards also get `box-shadow: 0 2px 6px var(--shadow)`. Toasts, menus and popovers get `0 8px 24px var(--shadow)`. The login card gets `0 12px 40px var(--shadow)`.
- **Dark/Black**: no shadow. Floating layers use `--surface-raised`, and toasts and popovers add a `--border-strong` border.
- The Black appearance depends on hairline borders to separate surfaces, so never remove a border there.

**Motion** (from `Motion.kt`):

| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 140ms | colour, hover, press, chip/segment text |
| `--dur-standard` | 240ms | segmented indicator slide, status stripe colour, counters |
| `--dur-emphasized` | 360ms | drawer/dialog/toast enter |
| `--dur-exit` | 180ms | exits (FAST + 40) |
| `--ease-standard` / `--ease-emphasized` | `cubic-bezier(0.2, 0, 0, 1)` | default |
| `--ease-decelerate` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | enter |
| `--ease-accelerate` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | exit |

- **Press scale.** Buttons scale to 0.97, cards to 0.98, icon buttons to 0.90 and stepper buttons to 0.88. The Android springs are critically damped, so use `transform 140ms var(--ease-standard)` with no overshoot.
- **Counters.** Amounts and quantities roll vertically in the direction of the change (240ms).
- **Skeleton shimmer.** A linear sweep lasting 1300 ms from `--surface-sunken` to `--surface` (Light) or `--surface-raised` (Dark/Black).
- **Login glow.** A 9 s drift that plays forward and then reverses.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`:
  - Every duration drops to 0–1ms, except opacity fades, which stay at ≤140ms.
  - Turn off press scale, counter rolls, the skeleton shimmer (show static `--surface-sunken`), the login glow drift and the staggered entrance.
  - Colour changes of state stay instant.

## 4. Status semantics

**Rule: never colour alone.** A status always shows icon + uppercase word + tone. The StatusChip carries `aria-label` set to the label. The table card's stripe is extra decoration and always sits beside a chip. Use the icons from `lucide-react` listed below; don't substitute others.

| Domain | Status | Label | Tone | Material → lucide |
|---|---|---|---|---|
| Table | Available | Available | Success | CheckCircle → `CircleCheck` |
| | Occupied | Occupied | Accent | People → `Users` |
| | Reserved | Reserved | Info | EventAvailable → `CalendarCheck` |
| | Cleaning | Cleaning | Cleaning | CleaningServices → `BrushCleaning` (fallback `SprayCan`) |
| | Blocked | Blocked | Neutral | Block → `Ban` |
| | *(order Billed)* | Bill issued | Info | HourglassTop → `Hourglass` |
| Order | Open | Open | Accent | RoomService → `ConciergeBell` |
| | Billed | Bill issued | Info | `Hourglass` |
| | Closed | Closed | Success | `CircleCheck` |
| | Cancelled | Cancelled | Danger | DoNotDisturbOn → `CircleMinus` |
| | Merged | Merged | Neutral | Moving → `TrendingUp` |
| Item | Pending | Not sent | Warning | `TrendingUp` |
| | Sent | In kitchen | Info | `ConciergeBell` |
| | Preparing | Preparing | Warning | LocalFireDepartment → `Flame` |
| | Ready | Ready | Success | TaskAlt → `CircleCheckBig` |
| | Served | Served | Neutral | `CircleCheck` |
| | Voided | Voided | Danger | Undo → `Undo2` |
| Ticket | New | New | Info | `ConciergeBell` |
| | Accepted | Accepted | Info | `Hourglass` |
| | Preparing | Preparing | Warning | `Flame` |
| | Ready | Ready | Success | `CircleCheckBig` |
| | Completed | Served | Neutral | `CircleCheck` |
| | Cancelled | Cancelled | Danger | `CircleMinus` |
| Bill | Open | Awaiting payment | Warning | `Hourglass` |
| | Paid | Paid | Success | `CircleCheck` |
| | PartiallyRefunded | Part refunded | Info | `Undo2` |
| | Refunded | Refunded | Neutral | `Undo2` |
| | Void | Void | Danger | `CircleMinus` |
| Any | Unknown | Unknown | Neutral | HelpOutline → `CircleHelp` |

**Ticket urgency** is measured from when the ticket was fired. In the Ready lane it is measured from `readyAt` instead.

| Urgency | Time | Tone | Label |
|---|---|---|---|
| Calm | under 10 min | Neutral (timer shown in `--text-primary`) | "On time" |
| Warm | 10–19 min | Warning | "Running late" |
| Hot | 20 min or more | Danger | "Overdue" |

The urgency shows in three places at once: the 6 px bar across the top of the ticket, the timer colour, and the caption "COOKING · RUNNING LATE". Because of the caption, it never relies on colour alone.

**Kitchen order flag.** If a ticket's order is Closed, the ticket shows the chip "Paid".

Other icons used across the app:

| Material | lucide |
|---|---|
| Chair | `Armchair` |
| TouchApp | `Pointer` |
| StickyNote2 | `StickyNote` |
| WifiOff | `WifiOff` |
| CloudOff | `CloudOff` |
| Lock | `Lock` |
| SearchOff | `SearchX` |
| ErrorOutline | `CircleAlert` |
| Info | `Info` |
| ThumbUp | `ThumbsUp` |
| LocalOffer | `Tag` |
| History | `History` |
| MoreVert | `EllipsisVertical` |
| Add / Remove | `Plus` / `Minus` |
| VerifiedUser | `ShieldCheck` |

Navigation icons:

| Destination | Material | lucide |
|---|---|---|
| Home | Dashboard | `LayoutDashboard` |
| Floor | TableRestaurant | `LayoutGrid` |
| Kitchen | Restaurant | `ChefHat` |
| Bills | ReceiptLong | `ReceiptText` |
| Orders | ReceiptLong | `ReceiptText` |
| Menu | MenuBook | `BookOpen` |
| Tables & areas | — | `Grid2x2` |
| Reports | Insights | `ChartLine` |
| Staff | Groups | `Users` |
| Roles & permissions | AdminPanelSettings | `ShieldCheck` |
| Restaurant settings | Settings | `Settings` |
| Audit log | History | `History` |

Default icon sizes: 20 px in buttons, 22 px in icon buttons, 13 px in chips and 16 px in banners. Use a stroke width of 2 (1.75 at 13 px or smaller).

## 5. Components

Every component has a hover state, a `:focus-visible` state that shows `--focus-ring`, a pressed state, and a disabled state. The per-component states below add to these.

**Button**
- Anatomy: optional leading icon (20 px), label (`button` role), optional trailing detail at 72% opacity (for example "Send to kitchen · 3").
- Height: Small 44 / Medium 48 / Large 56 px. Horizontal padding: 14 / 18 / 22 px. Radius `md`. Gap 8 px.
- Variants:
  - **Primary:** `ink` background, `on-ink` text.
  - **Accent:** `accent` background, `on-accent` text. Only for the one key action on a screen.
  - **Secondary:** `surface` background, `text-primary` text, 1 px `border-strong` border.
  - **Danger:** `danger-soft` background, `danger` text.
  - **Ghost:** transparent background, `text-primary` text.
- Disabled: `surface-sunken` background (Ghost stays transparent), `text-disabled` text, no border.
- **Loading:** swap the content for a 20 px spinner with a 2 px stroke in the content colour, cross-fading over 140ms. The button **keeps its measured width**: lock `min-width` to the current width before swapping. Set `aria-busy="true"`, keep the accessible name, and ignore clicks. This is the protection against double-submits.
- When space runs out, drop the icon first, then the trailing detail, and only then truncate the label.

**IconButton**
- A 44 × 44 hit area (48 on touch), round, with a 22 px icon.
- `aria-label` is required.
- Container is transparent by default, with an optional tinted container. Show a tooltip on hover after 500ms.

**Card**
- `surface` background, 1 px `border`, radius `lg`, 16 px padding. Light mode adds the shadow.
- A clickable card is a `<button>` or has `role="button"`. On hover the border goes to `border-strong` and the hover overlay appears. On press it scales to 0.98.
- Android's long-press becomes a right-click context menu plus a visible "⋯" icon button on hover or focus.

**StatusChip**
- Pill shape, padding 5 × 10 px, gap 5 px.
- Icon is 13 px. If there is no icon, show a 6 px dot.
- Label uses `statusLabel`, uppercase.
- Default colours: tone container background, tone content text.
- `emphasized` variant: tone content background with `surface` text.

**MiniFlag**
- Examples: "1 ready" (Success), "2 unsent" (Warning).
- Radius `xs`, padding 2 × 6 px, `statusLabel` role, not uppercase.

**CountBadge**
- Pill, padding 2 × 7 px, `statusLabel` role in tnum.
- Tone content background with `surface` text.

**TextField / Textarea / Select**
- Outlined, radius `md`, `surface` background, 1 px `border-strong` border. Minimum height 48 px (56 px with a floating label).
- Focus: `text-primary` border plus the focus ring. Caret colour is `accent`.
- Error: `danger` border, `danger` message text below. Link the message with `aria-describedby`.
- Disabled: `surface-sunken` background.
- Optional leading icon in `text-tertiary`. A password field gets a show/hide toggle.
- Use a persistent label above the field (`supporting` role, `text-secondary`) rather than Material's floating label. It is simpler and still matches visually.
- Placeholder text is `text-tertiary`.
- Select is a styled native `<select>` or a Radix Select with the same frame.

**SegmentedControl**
- Track: 48 px tall (40 px in dense desktop toolbars), `surface-sunken`, radius `md`, 3 px padding.
- Indicator: `surface` in Light or `surface-raised` in Dark/Black, 1 px `border`, radius `sm`. It slides over 240ms.
- Label: `button` weight at 13 px. `text-primary` when selected, `text-secondary` otherwise.
- Optional CountBadge: Accent when the segment is selected, Neutral otherwise.
- Implement as `role="tablist"` or a radiogroup with arrow-key navigation.

**ChipRow (filters)**
- Pills 40 px tall (48 on touch) with 16 px horizontal padding and 8 px gaps.
- Selected: `ink` background, `on-ink` text. Unselected: `surface` background, 1 px `border`.
- On narrow screens the row scrolls horizontally. At ≥1024 it wraps.

**QuantityStepper**
- Pill track in `surface-sunken` with 3 px padding.
- Round buttons 40 px (compact) or 48 px, `surface` fill, 18 px icon. At a limit the button turns transparent with a `text-disabled` icon.
- The value uses the `amount` role in a 28 or 36 px slot, rolling on change.
- Accessible labels: "Decrease {label}" / "Increase {label}". The group announces "{label} {value}".
- Web addition: the arrow keys adjust the value when the group has focus.

**Switch / ToggleRow**
- The row has a `bodyStrong` title, an optional `supporting` subtitle, and the switch on the trailing edge. The whole row toggles (`role="switch"`).
- Track: checked = `success`; unchecked = `surface-sunken` with a `border-strong` outline.
- Thumb: `surface`.

**Dialog (Confirm / Destructive)**
- Centred, max-width 440 px, `surface` background, radius `xl`, 24 px padding, `scrim` backdrop.
- Title `sectionTitle`, message `body` in `text-secondary`, optional body slot (for example a Reason field).
- Actions sit at the bottom right: a Ghost "Cancel", then the confirm button, which is Primary or Danger for destructive actions.
- While loading, Escape and backdrop clicks are ignored and Cancel is disabled.
- Focus lands on the least destructive control.

**Drawer / side panel** (the web version of `BistroSheet`)
- Enters from the right, 420 px wide (480 px for payment). Below 768 px it becomes a bottom sheet at full width with a 28 px top radius and a 40 × 4 px handle in `border-strong`.
- Header: `sectionTitle` title plus `supporting` subtitle, with 24 px padding.
- The body scrolls. The action footer is pinned and uses the ActionPair layout (secondary : primary = 1 : 1.4).
- **While busy, the drawer can't be dismissed.** Escape, backdrop clicks and the close button are all blocked.
- Enters over 360ms with the decelerate curve and exits over 180ms with the accelerate curve.

**Toast**
- Fixed at the bottom centre (bottom right at ≥1024), with a 16 px inset.
- `ink` background, `on-ink` text, `bodyStrong`, radius `lg`, padding 12 × 16 px.
- Leading icon: `CircleCheck` in `success`, `CircleAlert` in `danger`, or `Info` in `info`.
- Error toasts use `role="alert"`. Other toasts use `role="status"`.
- Auto-dismiss after 4 s, or 6 s for errors. Pause the timer on hover.

**EmptyState**
- A 72 px tile in `surface-sunken` with radius `xl`, holding a 32 px icon in `text-tertiary`.
- Title `cardTitle`, message `supporting` in `text-secondary` at max 320 px, optional action.
- Centred, with 32 px padding.

**ErrorState**
- Built on EmptyState, with the icon and title chosen by error type:

| Error | Icon | Title |
|---|---|---|
| Offline | `WifiOff` | "No connection" |
| Timeout | `CloudOff` | "Server not responding" |
| 403 | `Lock` | "Not available to you" |
| 404 | `SearchX` | "Not found" |
| Anything else | `CircleAlert` | "Couldn't load this" |

- Retryable errors get a Secondary "Try again" button.
- Use `aria-live="polite"`.

**StaleBanner**
- Shown when the screen still has data but the latest refresh failed.
- `warning-soft` background, `warning` text, `metadata` role, 16 px `WifiOff` icon, radius `md`, padding 8 × 12 px.
- Expands and collapses in height.
- Text is either "Offline — showing the last update. Reconnecting…" or "Couldn't refresh — showing the last update. Retrying…".

**Skeleton**
- Blocks shaped like the content they replace, radius `sm`, with the shimmer from §3.
- Floor: cards 136 px tall. Lists: rows 72 px tall.

**Tabs**
- Use SegmentedControl for 2–4 peer filters (bill filters, order filters, kitchen lanes on narrow screens).
- Use an underline tab bar (a 2 px `ink` underline, 44 px tall) only for sub-pages inside Management screens.

**DataTable** (web only; used for Management, Reports, Audit, Orders and the Bills list at ≥1280)
- Header row: 40 px, `statusLabel` role in uppercase, `text-tertiary`, `surface-sunken` background, sticky.
- Sortable columns show a `ChevronUp` or `ChevronDown` 14 px icon and set `aria-sort`.
- Body rows: 44 px tall (52 px for comfortable density), `tableCell` role, 1 px `border` between rows. Hover uses `--row-hover`. A selected row gets `--selection-bg` plus a 2 px accent inset on the left.
- Numbers are right-aligned in tnum. Status columns use StatusChip.
- The container is a Card with no padding, and it scrolls horizontally inside itself, never the whole page.

**Sidebar nav + top bar**: see §6.

**Command / search**
- Build the ⌘K palette later, and only for managers: jumping to a table, check number or bill number is a real desktop need.
- The Order screen's menu search stays inline. That covers v1.

**Appearance picker**
- Three radio cards, each showing a mini preview built from that mode's own palette: a background tile, two surface blocks, a text bar and an accent bar.
- Selected card: 2 px `accent` border. Others: 1 px `border`.
- Label below the preview in `bodyStrong`.
- Group caption: "Applies to this device".

## 6. Layout

**Breakpoints**

| Name | Width | What changes |
|---|---|---|
| desktop | ≥1280 | Expanded sidebar (240 px), split views, DataTables |
| laptop | 1024–1279 | Sidebar collapses to a 72 px rail with icons and tooltips. Split views stay. |
| tablet | 768–1023 | Rail. Detail panels become right drawers over the content. |
| narrow | <768 | Bottom tab bar (the Android top-level tabs). Detail panels become full-screen routes. Drawers become bottom sheets. |

Content max-width is 1600 px, except the Kitchen screen, which is always full-bleed.

**App shell**
- **Sidebar.** Surface is `surface` with a 1 px `border` on its right edge.
  - Wordmark at the top.
  - Primary sections, filtered by permission exactly as Android's `TopLevel.visibleFor` does: Home (`dashboard.view`), Floor (`tables.view`), Kitchen (`kitchen.view`), Bills (`billing.view`).
  - A "Manage" group, filtered the same way as the More links: Orders, Menu, Tables & areas, Reports, Staff, Roles & permissions, Restaurant settings, Audit log.
  - Sections the user isn't allowed to see are hidden, never disabled.
  - Active item: an `ink` pill indicator with an `on-ink` icon, and `text-primary` label weight 600. Inactive items are `text-tertiary`, matching the Android NavigationBar colours.
  - A collapse toggle at the bottom. Persist its state in `localStorage`.
- **Top bar** (56 px, `background`, bottom border only once the page scrolls):
  - Page eyebrow (location name, `statusLabel`, `text-tertiary`) and page title (`pageTitle`).
  - Page actions.
  - On the right: the location name, an appearance menu (Light / Dark / Black), and a user menu (initials avatar on `accent-soft` with `accent` text; Change password; Sign out).

**Floor**
- The area ChipRow ("All areas", area names, "Unassigned") sits above a card grid: `grid-template-columns: repeat(auto-fill, minmax(176px, 1fr))` with 12 px gaps. Cards are `min-height: 136px`.
- Card anatomy:
  - 4 px stripe on the left in the tone colour.
  - Name in `tableLabel`, plus an `Armchair` icon with the seat count.
  - StatusChip.
  - If there's an order: "#12 · 3 guests · 47m" in `metadata`, the subtotal in `amountSmall`, and one MiniFlag. Ready beats unsent.
  - If there's no order: the status note, then "Tap to seat" (on web: "Click to seat").
- At ≥1024, a 400 px right detail panel with the table's actions: Open order / Seat guests / status editor. It replaces the Android sheet. The grid reflows to make room.

**Order**
- Three columns at ≥1280:
  1. Category rail, 200 px, a vertical list in the ChipRow style.
  2. Item grid, `minmax(180px,1fr)`, with search on top. Clicking a card adds one item. Right-click or "⋯" means "Add with a note". Unavailable items show a "Sold out" Neutral chip.
  3. A sticky order panel, 380 px, `surface`.
- The order panel contains:
  - Header "Table T2", eyebrow "Check #12".
  - Items grouped as "Not sent yet / Ready to serve / In the kitchen / Served / Voided".
  - A totals block using `amount` / `amountLarge`.
  - A pinned footer with an Accent "Send to kitchen · N" button, then Primary "Issue bill" or "Take payment" / "View bill".
- At 1024–1279 the category rail becomes a ChipRow above the grid. Below 1024 the order panel becomes a bottom bar with a "Review" button that opens a drawer.

**Kitchen**
- Full-bleed, always large type.
- Three working lanes, **New / Preparing / Ready**, each `surface-sunken` with radius `lg` and a minimum width of 300 px.
- Lane header: `sectionTitle`, plus a CountBadge (Accent when the count is above 0).
- Tickets are ordered oldest first.
- "Recently served" is a top-bar toggle (`History` icon, label "Show recently served" / "Back to the board"). It swaps the board for the Done lane, newest first. At ≥1600 you may instead show Done as a narrower (280 px) fourth column that starts collapsed.
- Ticket anatomy (see the screenshot `kitchen_ticket_*.png`):
  - 6 px urgency bar across the top.
  - Table name in `tableLabel` at 28 px on desktop.
  - "Check #12" in `identifier`, then "Ticket 9 · Sofia" in `metadata`.
  - The timer, top right, in `metric` (for example "14m 00s").
  - Item rows: "2×" in `accent`, item name in `sectionTitle`. Notes are italic `accent`. Voided items are struck through in `text-tertiary` with a "VOID" danger mini flag.
  - Order note in an `accent-soft` block.
  - Large (56 px) actions: secondary (Accept / Recall) and primary (Start / Ready / Served) in a 1 : 1.6 ratio.
- Below 900 px use a SegmentedControl to switch lanes, which is what Android does below 600 dp.

**Bills**
- A split view at ≥1024:
  - Left list (400 px) with the SegmentedControl "Open / Paid today / Void" and bill cards (table name, check number and time, status chip, amount).
  - Right detail: Bill number in the title, eyebrow "Table T2 · Check #12", the totals card with `amountHero` for Balance due, the Payments list, and actions (Take payment, Close bill, Refund, Discount, Void bill).
- "Take payment" opens the payment drawer (480 px). It contains a method picker, the Amount field, the "Split payment · … will remain due" hint, "Cash tendered (optional)" with quick-amount chips, "Change due", and "Charge ₹X" in Accent/Large. On success it shows "Paid in full". The drawer is locked while busy.
- At ≥1280 the list can switch to a DataTable.

**Management** (Menu, Tables & areas, Staff, Roles, Audit, Settings)
- A DataTable page with a toolbar: search, filters (ChipRow), and a Primary "Add …" button on the right.
- Clicking a row opens the edit drawer. Destructive actions go through the ConfirmDialog.
- Settings is a single column with a max width of 720 px, split into Card sections.

## 7. Login page

- **≥1024:** a 50/50 split. Below 1024: the hero on top at 42% of the viewport height (clamped to 300–400 px) with the card overlapping it by 36 px. On desktop the hero always spans the full height.
- **Hero (the same in every appearance: the brand's one bold surface):**
  - Background is a vertical gradient from `#1C1712` to `#2A1D14`. In Dark/Black it runs from `#1B140F` to `var(--background)`.
  - Floor-plan pattern: an inline SVG tile (`background-image`, 184 × 184 px, which is two 92 px cells). Alternate cells hold a round table (r 18) with four chairs (r 5, placed at 27 px) and a 30 px rounded square (radius 5). Stroke is 1.2 px `rgba(255,255,255,.055)`, and every other row is offset by half a cell.
  - Ember glow: two radial gradients as absolutely positioned layers.
    - One is `rgba(224,112,60,.55)`, radius 75% of the width, centred at (78%, 18%).
    - The other is `rgba(244,184,96,.18)`, radius 55%, centred at (12%, 82%).
    - They drift slowly (`transform: translate`, about 6% of the width over 9 s, alternating direction), or stay still under reduced motion.
  - Content is vertically centred with 24 px padding:
    - A 64 px mark tile (radius `lg`, `rgba(255,255,255,.08)` fill, `.14` border).
    - The "Bistro" wordmark in Manrope 800 at 40 px, -0.03em, `#FBF6EF`.
    - The tagline "Run the floor,\nthe kitchen and the till." in Manrope 700 at 34/40, -0.02em, `#FBF6EF`.
    - Three pills, "TABLES · KITCHEN · BILLING" (`statusLabel`, `#F4D9C4`, `.08` fill, `.12` border).
  - The content fades in and rises 24 px over 540ms.
- **Form side:** `background`, with a card centred at max-width 440 px.
  - The card is `surface`, radius `xl`, 24 px padding, with a border. Light mode adds the shadow.
  - Contents, in order:
    - Title "Sign in" (`pageTitle`) and the line "Use your staff account to continue."
    - A banner: danger-soft for errors, info-soft for notices, with `aria-live="assertive"`.
    - Username field (`User` icon, `autocomplete="username"`).
    - Password field (`Lock` icon, show/hide toggle, `autocomplete="current-password"`).
    - An Accent Large "Sign in" button at full width.
    - "Forgot your password? Ask a manager."
  - Below the card: "Encrypted connection · Bistro {version}" with a `ShieldCheck` icon.
  - The card rises 40 px, 90 ms after the hero. After a failed sign-in, clear the password but keep the username.

## 8. Copy to keep identical

Use these strings verbatim. The ellipsis and em dash are real characters, not `...` or `--`.

- **Navigation:**
  - Tabs: Home, Floor, Kitchen, Bills, More.
  - Management links:

| Link | Subtitle |
|---|---|
| Orders | "Active, closed and cancelled checks" |
| Menu | "Items, prices, availability" |
| Tables & areas | "Floor layout" |
| Reports | "Sales and operations" |
| Staff | "Accounts and access" |
| Roles & permissions | "What each role can do" |
| Restaurant settings | "Taxes, billing, payment methods" |
| Audit log | "Who did what, when" |

- **Greeting:** "Good morning / Good afternoon / Good evening, {first name}".
- **Home:** metric labels "Kitchen", "Orders", "Bills awaiting payment". The "Recent activity" section has a "See all" link and shows "Nothing yet today." when empty.
- **Floor:**
  - Chips: "All areas", "Unassigned".
  - Empty states: "No tables yet" / "Add your tables and areas to start seating guests.", and "No tables match" / "Nothing here right now. Clear the filter to see every table."
  - Seat drawer: "Seat {T}", then "Guests", then "Open table". Warning: "More than the {n} seats".
  - Table drawer: "Open order", "Seat guests", "Save status", "Close". Messages: "You can't change table status. Ask a manager." and "This table has an open order. Its status follows the order: it frees up when the bill is paid or the order is moved."
- **Order:**
  - Header: "Table {T}", eyebrow "Check #{n}".
  - Groups: "Not sent yet", "Ready to serve", "In the kitchen", "Served", "Voided".
  - Buttons: "Add items", "Send to kitchen", "Issue bill", "Take payment", "View bill", "Serve", "Add note" / "Edit note", "Save note", "Remove item".
  - Empty state: "Nothing ordered yet" / "Add items from the menu, then send them to the kitchen."
  - Actions menu: "Change guests", "Move to another table", "Merge a table into this one", "Split items to a new table", "Cancel order" ("Frees the table").
  - Quick notes: "No onions", "Extra spicy", "Mild", "No nuts", "Gluten free", "On the side".
- **Add items:** "Search the menu", "Sold out", "Review". Empty states: "The menu is empty" / "Nothing matches" ("Try another word or category."). Discard confirmation: "Discard {n} items?" / "They haven't been added to the check yet."
- **Confirmations:** "Void {q}× {item}?" → "Void item". "Cancel check #{n}?" → "Cancel order". "Void bill {n}?" → "Void bill". "Refund {amount}?" → "Refund". "Sign out?" / "You'll need your password to sign back in on this device." → "Sign out". The dismiss button is always "Cancel". Reason fields are labelled "Reason".
- **Kitchen:**
  - Lanes: "New", "Preparing", "Ready". The toggled view is titled "Recently served".
  - Actions: "Start", "Ready", "Served", "Accept", "Recall".
  - Timer captions: "Waiting", "Accepted", "Cooking", "At the pass", "Took". Urgency: "On time", "Running late", "Overdue".
  - Lane empty states:

| Lane | Title | Message |
|---|---|---|
| New | "No new tickets — the pass is quiet" | "New orders appear here the moment a server sends them." |
| Preparing | "Nothing on the stove" | "Start a new ticket and it moves here while it cooks." |
| Ready | "Nothing waiting at the pass" | "Tickets marked ready wait here until they're served." |
| Done | "Nothing served recently" | "Tickets served in the last 30 minutes are listed here." |

- **Bills:**
  - Filters: "Open", "Paid today", "Void".
  - Empty states: "No bills waiting", "Nothing settled yet today", "No voided bills" (use the Android messages verbatim).
  - Detail labels: "Balance due", "Payments", "Discount" / "Edit discount", "Close bill", "Refund", "Correction".
  - Payment drawer: "Take payment", "Amount", "Reference (optional)", "Cash tendered (optional)", "Exact", "Change due", "Charge {amount}", "Bill settled", "Paid in full".
  - Payment errors: "Enter an amount above zero", "That's more than the {x} due", "Less than the amount being paid".
- **Orders:** filters "Active", "Closed", "Cancelled". Subtitle "Active and recent checks".
- **Account:**
  - "Appearance" ("Applies to this device"), "Change password" ("Other devices will be signed out.", button "Update password", toast "Password updated").
  - Password fields: "Current password", "New password" (hint "At least 8 characters, mixing letters with numbers or symbols"), "Confirm new password".
  - Password errors: "Too weak", "Doesn't match".
- **Errors:** "No connection", "Server not responding", "Not available to you", "Not found", "Couldn't load this", "Try again". Sign-in failure: "Incorrect username or password."

Web-only wording: Android says "Tap to seat". On pointer devices use "Click to seat", and keep "Tap to seat" under `(pointer: coarse)`.
