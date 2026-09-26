# Android conventions

Package root `ai.synkrasis.bistro` (android/app/src/main/java/ai/synkrasis/bistro).
Reference implementations to copy: `feature/floor/*` and `feature/order/*`.

## Structure per feature
`feature/<name>/<Name>ViewModel.kt` + `<Name>Screen.kt` (+ component/sheet files if large).
Keep composables small; split rows, cards and sheets into their own functions.

## State
* ViewModel holds Compose state (`var x by mutableStateOf(..); private set`).
* Screen data: `LoadState<T>` (`core/ui/LoadState.kt`) — `Loading | Failed(error) | Ready(data, refreshing, staleError)`.
  Fold results with `state.reduce(result)`; never keep separate isLoading/hasError flags.
* In-flight actions: a single `working: String?` tag (e.g. `"pay"`, `"item-12"`); buttons use
  `loading = vm.working == "pay"` and do nothing while any action runs → no double submits.
* One-off effects: `val effects = Effects()`; `effects.success/error/info/navigate/back`.
  Screen: `CollectEffects(vm.effects.flow, onNavigate = navigator::open, onBack = navigator::back)`.
* Create VMs with `bistroViewModel(key = "...") { MyViewModel(it, args) }` (it = AppContainer).
* Repositories (`data/repository/Repositories.kt`) return `ApiResult`; never throw.
* After `AppError.Stale` / `AppError.InvalidState`, refresh the data.
* Money/state mutations that must not duplicate carry an idempotency key per *intent*
  (`IdempotencyKeys.new()`), reused on retry, cleared on success (see `OrderViewModel.fire`).
* Live screens poll with `PollWhileVisible(ms) { vm.refresh() }`.

## Session & permissions
* `LocalSession.current` → `SessionInfo` (`can(Permission.X)`, `currency`, `zone`, `me`).
* Hide/disable actions the user can't perform (`session.can(...)`); the server enforces anyway.
  Server flags such as `manageable`, `password_resettable`, `editable` decide UI availability.
* `LocalNavigator.current` → `open(route)`, `back()`, `replace(route)`. Routes in `navigation/Routes.kt`.

## Design system (never hardcode colours, sizes or fonts)
* Colours: `BistroTheme.colors.*`; type: `BistroTheme.type.*`; `Spacing.*`; `Radii.*`; `Motion.*`.
* Components (`core/designsystem/component`): `BistroTopBar`, `BistroCard`, `BistroButton`
  (styles Primary/Accent/Secondary/Danger/Ghost, `loading`), `BistroIconButton`, `BistroTextField`,
  `StatusChip` (label + tone + icon, never colour alone), `Tone`, `SegmentedControl`, `ChipRow`,
  `QuantityStepper`, `ToggleRow`, `AnimatedCounter`, `BistroSheet`, `ConfirmDialog`, `ActionPair`,
  `EmptyState`, `ErrorState`, `StaleBanner`, `Skeleton`/`SkeletonList`, `SectionHeader`, `Gap`.
* Status → label/tone/icon: `domain/StatusVisuals.kt` (`status.visual`).
* Money: `Format.money(amount, currency)`; amounts are `BigDecimal` (never Double).
  Typed amounts: `MoneyInput.accept/parse`. Time: `Format.elapsed/relative/time/dateTime`.
* Shared money breakdown: `feature/common/Totals.kt` (`TotalsCard`, `AmountLine`).
* Lists: `LazyColumn` with stable `key`s and `Modifier.animateItem(...)` using `Motion` specs.
* Page padding: `Spacing.gutter`; bottom padding for sticky action bars (~120.dp).

## Haptics (`LocalHaptics.current.perform(Haptic.X)`)
Selection (chips, steppers, choosing), Toggle, Confirm (before commit), Success/Reject come
automatically with `effects.success/error`, Destructive (ConfirmDialog handles it), LongPress.
Not every tap vibrates.

## Every list/screen must have
Skeleton loading, a specific `EmptyState` (with a next action if the user may take one),
`ErrorState` with retry, `StaleBanner` for failed refreshes, accessible labels
(`contentDescription`/`semantics`), ≥48dp touch targets, and look right in Light/Dark/Black.
