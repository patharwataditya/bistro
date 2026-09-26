package ai.synkrasis.bistro.feature.management

import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.Skeleton
import ai.synkrasis.bistro.core.designsystem.component.StaleBanner
import ai.synkrasis.bistro.core.designsystem.component.Tone
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.ui.CollectEffects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.PollWhileVisible
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.data.api.RestaurantSettings
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun SettingsScreen() {
    val vm = bistroViewModel(key = "settings") { SettingsViewModel(it) }
    val navigator = LocalNavigator.current
    val session = LocalSession.current
    CollectEffects(vm.effects.flow, onNavigate = navigator::open, onBack = navigator::back)
    val guardedBack = rememberGuardedBack(vm.dirty, navigator::back)
    PollWhileVisible(120_000) { vm.refresh() }
    val canEdit = session.can(Permission.SETTINGS_UPDATE)

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            BistroTopBar(
                title = "Settings",
                eyebrow = session.me.restaurantName,
                subtitle = session.me.location.name,
                onBack = guardedBack,
            )
            val s = vm.state
            val form = vm.general
            when {
                s is LoadState.Failed -> ErrorState(s.error, vm::refreshNow, Modifier.fillMaxSize())
                s is LoadState.Ready && form != null -> SettingsBody(s.data, form, s.staleError, canEdit, vm)
                else -> SettingsSkeleton()
            }
        }
        StickySaveBar(
            visible = canEdit && vm.dirty,
            loading = vm.working == "save",
            onSave = vm::save,
            onDiscard = vm::discard,
            enabled = vm.canSave,
            message = if (vm.canSave) "Unsaved changes" else "Fix the highlighted fields",
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }

    if (vm.addingMethod) {
        AddPaymentMethodSheet(busy = vm.working == "pm-new", onAdd = vm::addMethod, onDismiss = { vm.addingMethod = false })
    }
}

@Composable
private fun SettingsBody(
    settings: RestaurantSettings,
    form: GeneralForm,
    staleError: ai.synkrasis.bistro.core.network.AppError?,
    canEdit: Boolean,
    vm: SettingsViewModel,
) {
    // Local checks show immediately; the server's messages (e.g. unknown time zone) win.
    val errors = form.problems() + vm.serverErrors
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(start = Spacing.gutter, end = Spacing.gutter, bottom = 120.dp),
        verticalArrangement = Arrangement.spacedBy(Spacing.lg),
    ) {
        StaleBanner(staleError)
        if (!canEdit) {
            NoticeCard("You can view settings but not change them. Ask a manager with settings access.", icon = Icons.Rounded.Lock, tone = Tone.Info)
        }
        RestaurantSection(form, errors, canEdit, vm::editGeneral)
        BillingSection(form, errors, canEdit, vm::editGeneral)
        TaxesSection(vm.taxes, canEdit, vm)
        PaymentMethodsSection(settings.paymentMethods, canEdit, vm)
    }
}

@Composable
private fun SettingsSkeleton() {
    Column(Modifier.fillMaxSize().padding(Spacing.gutter), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        repeat(3) {
            Skeleton(Modifier.fillMaxWidth(0.35f), 22.dp)
            Skeleton(Modifier.fillMaxWidth(), 56.dp)
            Skeleton(Modifier.fillMaxWidth(), 56.dp)
        }
    }
}
