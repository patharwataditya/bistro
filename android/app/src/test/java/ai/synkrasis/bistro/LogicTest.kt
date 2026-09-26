package ai.synkrasis.bistro

import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.core.util.MoneyInput
import ai.synkrasis.bistro.core.designsystem.theme.Appearance
import ai.synkrasis.bistro.domain.Grants
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.domain.TableStatus
import ai.synkrasis.bistro.domain.Urgency
import ai.synkrasis.bistro.domain.urgencyFor
import ai.synkrasis.bistro.feature.billing.quickTenders
import ai.synkrasis.bistro.navigation.TopLevel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal
import java.time.Instant

class LogicTest {
    @Test fun refreshFailureKeepsDataAndFlagsStale() {
        val ready: LoadState<Int> = LoadState.Ready(1)
        val after = ready.markRefreshing().reduce(ApiResult.Failure(AppError.Offline))
        assertEquals(LoadState.Ready(1, refreshing = false, staleError = AppError.Offline), after)
        assertEquals(LoadState.Ready(2), after.reduce(ApiResult.Success(2)))
    }

    @Test fun firstLoadFailureIsFailed() {
        assertEquals(LoadState.Failed(AppError.Timeout), LoadState.Loading.reduce(ApiResult.Failure(AppError.Timeout)))
    }

    @Test fun moneyInputAcceptsAtMostTwoDecimals() {
        assertTrue(MoneyInput.accept("12.5"))
        assertTrue(MoneyInput.accept(""))
        assertFalse(MoneyInput.accept("12.555"))
        assertFalse(MoneyInput.accept("-1"))
        assertFalse(MoneyInput.accept("1e3"))
        assertEquals(BigDecimal("12.50"), MoneyInput.parse("12.5"))
        assertNull(MoneyInput.parse("."))
    }

    @Test fun elapsedIsCompactAndNeverNegative() {
        val t0 = Instant.parse("2026-01-01T10:00:00Z")
        assertEquals("now", Format.elapsed(t0, t0.plusSeconds(30)))
        assertEquals("12m", Format.elapsed(t0, t0.plusSeconds(12 * 60)))
        assertEquals("1h 5m", Format.elapsed(t0, t0.plusSeconds(65 * 60)))
        assertEquals("now", Format.elapsed(t0, t0.minusSeconds(90)))
        assertEquals("3:07", Format.clock(t0, t0.plusSeconds(187)))
    }

    @Test fun signedMoneyUsesTrueMinus() {
        assertTrue(Format.signedMoney(BigDecimal("-0.40"), "INR").startsWith("−"))
    }

    @Test fun urgencyThresholds() {
        assertEquals(Urgency.Calm, urgencyFor(9))
        assertEquals(Urgency.Warm, urgencyFor(10))
        assertEquals(Urgency.Hot, urgencyFor(20))
    }

    @Test fun tabsFollowPermissions() {
        val kitchen = TopLevel.visibleFor(Grants(setOf(Permission.KITCHEN_VIEW, Permission.MENU_VIEW)))
        assertEquals(listOf(TopLevel.Kitchen, TopLevel.More), kitchen)
        val cashier = TopLevel.visibleFor(Grants(setOf(Permission.DASHBOARD_VIEW, Permission.TABLES_VIEW, Permission.BILLING_VIEW)))
        assertEquals(listOf(TopLevel.Home, TopLevel.Floor, TopLevel.Bills, TopLevel.More), cashier)
        assertEquals(listOf(TopLevel.More), TopLevel.visibleFor(Grants(emptySet())))
    }

    @Test fun occupiedIsNeverManuallySettable() {
        assertFalse(TableStatus.Occupied.manuallySettable)
        assertFalse(TableStatus.Blocked.seatable)
        assertTrue(TableStatus.Cleaning.seatable)
    }

    @Test fun exactlyThreeAppearancesAndUnknownFallsBackToDefault() {
        assertEquals(listOf("light", "dark", "black"), Appearance.entries.map { it.storageKey })
        assertEquals(Appearance.Light, Appearance.fromStorage("system"))
        assertEquals(Appearance.Black, Appearance.fromStorage("black"))
    }

    @Test fun quickTendersStartWithExactAmountAndAscend() {
        val tenders = quickTenders(BigDecimal("393.02"))
        assertEquals(BigDecimal("393.02"), tenders.first())
        assertEquals(tenders.sorted(), tenders)
        assertTrue(tenders.all { it >= BigDecimal("393.02") })
        assertTrue(quickTenders(BigDecimal.ZERO).isEmpty())
    }
}
