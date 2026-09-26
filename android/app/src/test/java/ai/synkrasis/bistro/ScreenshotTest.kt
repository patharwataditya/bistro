package ai.synkrasis.bistro

import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.EmptyState
import ai.synkrasis.bistro.core.designsystem.component.QuantityStepper
import ai.synkrasis.bistro.core.designsystem.component.SegmentedControl
import ai.synkrasis.bistro.core.designsystem.component.StaleBanner
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.theme.Appearance
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.data.api.ActiveOrderBrief
import ai.synkrasis.bistro.data.api.DiningTable
import ai.synkrasis.bistro.data.api.LocationBrief
import ai.synkrasis.bistro.data.api.Me
import ai.synkrasis.bistro.data.api.TaxLine
import ai.synkrasis.bistro.data.api.Ticket
import ai.synkrasis.bistro.data.api.TicketItem
import ai.synkrasis.bistro.data.api.Totals
import ai.synkrasis.bistro.domain.Grants
import ai.synkrasis.bistro.domain.OrderItemStatus
import ai.synkrasis.bistro.domain.OrderStatus
import ai.synkrasis.bistro.domain.TableStatus
import ai.synkrasis.bistro.domain.TicketStatus
import ai.synkrasis.bistro.domain.visual
import ai.synkrasis.bistro.feature.common.TotalsCard
import ai.synkrasis.bistro.feature.floor.TableCard
import ai.synkrasis.bistro.feature.kitchen.TicketCard
import ai.synkrasis.bistro.navigation.LocalSession
import ai.synkrasis.bistro.navigation.SessionInfo
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.TableRestaurant
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneId

/**
 * Renders real composables on the JVM (Robolectric native graphics) in every appearance.
 * Output: app/build/outputs/roborazzi/<name>_<appearance>.png — reviewed for hierarchy,
 * contrast and theme parity without an emulator.
 */
@RunWith(ParameterizedRobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w411dp-h891dp-xxhdpi", application = android.app.Application::class)
class ScreenshotTest(private val appearance: Appearance) {

    companion object {
        @JvmStatic
        @ParameterizedRobolectricTestRunner.Parameters(name = "{0}")
        fun modes() = Appearance.entries.map { arrayOf<Any>(it) }

        private val NOW = Instant.parse("2026-09-26T14:00:00Z")
        private val SESSION = SessionInfo(
            Me(1, "owner", "Olivia Owner", emptyList(), emptyList(), LocationBrief(1, "Main Street", "Asia/Kolkata", "INR"), "Bistro"),
            Grants(emptySet()),
        )
    }

    private fun shot(name: String, content: @Composable () -> Unit) {
        captureRoboImage("build/outputs/roborazzi/${name}_${appearance.storageKey}.png") {
            BistroTheme(appearance) {
                CompositionLocalProvider(LocalSession provides SESSION) {
                    Column(Modifier.background(BistroTheme.colors.background).padding(Spacing.gutter)) { content() }
                }
            }
        }
    }

    private fun table(id: Int, name: String, status: TableStatus, order: ActiveOrderBrief? = null, note: String? = null) =
        DiningTable(id, name, 4, 1, "Main Hall", status, note, id, 1, order)

    private fun order(n: Int, status: OrderStatus = OrderStatus.Open, pending: Int = 0, ready: Int = 0) = ActiveOrderBrief(
        id = n, orderNumber = n, status = status, guestCount = 3, openedAt = NOW.minusSeconds(47 * 60),
        serverName = "Sofia", itemCount = 5, pendingCount = pending, readyCount = ready,
        subtotal = BigDecimal("1840.00"), billId = null, version = 1,
    )

    @Test fun floorCards() = shot("floor_cards") {
        val tables = listOf(
            table(1, "T1", TableStatus.Available),
            table(2, "T2", TableStatus.Occupied, order(12, pending = 2, ready = 1)),
            table(3, "T3", TableStatus.Reserved, note = "Smith · 8:30pm"),
            table(4, "T4", TableStatus.Occupied, order(14, OrderStatus.Billed)),
            table(5, "P1", TableStatus.Cleaning),
            table(6, "B2", TableStatus.Blocked, note = "Wobbly leg"),
        )
        tables.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md), modifier = Modifier.padding(bottom = Spacing.md)) {
                pair.forEach { TableCard(it, NOW, {}, {}, Modifier.weight(1f)) }
            }
        }
    }

    /** 360dp phone at 1.5× font size: the floor grid must stay two columns and not clip. */
    @Test
    @Config(qualifiers = "w360dp-h780dp-xxhdpi")
    fun floorCardsSmallPhoneLargeFont() {
        org.robolectric.RuntimeEnvironment.setFontScale(1.5f)
        shot("floor_cards_360dp_font150") {
            val tables = listOf(
                table(1, "T1", TableStatus.Available),
                table(2, "T12", TableStatus.Occupied, order(12, pending = 2, ready = 1)),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
                tables.forEach { TableCard(it, NOW, {}, {}, Modifier.weight(1f)) }
            }
        }
        org.robolectric.RuntimeEnvironment.setFontScale(1f)
    }

    @Test fun kitchenTicket() = shot("kitchen_ticket") {
        val ticket = Ticket(
            id = 3, ticketNumber = 9, status = TicketStatus.Preparing, orderId = 7, orderNumber = 12,
            orderStatus = OrderStatus.Open, orderNotes = "Birthday — bring dessert with a candle", tableName = "T2",
            serverName = "Sofia", firedAt = NOW.minusSeconds(14 * 60), acceptedAt = null,
            startedAt = NOW.minusSeconds(12 * 60), readyAt = null, completedAt = null,
            items = listOf(
                TicketItem(1, "Margherita Pizza", 2, null, OrderItemStatus.Preparing),
                TicketItem(2, "Truffle Mushroom Risotto", 1, "no parmesan", OrderItemStatus.Preparing),
                TicketItem(3, "Burrata", 1, null, OrderItemStatus.Voided),
            ),
            version = 3,
        )
        TicketCard(ticket, { NOW }, ZoneId.of("Asia/Kolkata"), canUpdate = true, busy = false, onAction = {}, modifier = Modifier.width(380.dp))
    }

    @Test fun billTotals() = shot("bill_totals") {
        TotalsCard(
            Totals(
                subtotal = BigDecimal("810.00"), discountAmount = BigDecimal("81.00"),
                serviceChargePercent = BigDecimal("5.00"), serviceChargeAmount = BigDecimal("36.45"),
                taxes = listOf(
                    TaxLine("CGST", BigDecimal("2.500"), BigDecimal("765.45"), BigDecimal("19.14")),
                    TaxLine("SGST", BigDecimal("2.500"), BigDecimal("765.45"), BigDecimal("19.14")),
                ),
                taxTotal = BigDecimal("38.28"), roundOff = BigDecimal("0.27"), total = BigDecimal("804.00"),
            ),
            currency = "INR", estimate = false,
        )
    }

    @Test fun componentsGallery() = shot("components") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            TableStatus.entries.filter { it != TableStatus.Unknown }.forEach { s -> s.visual.let { StatusChip(it.label, it.tone, icon = it.icon) } }
            TicketStatus.entries.filter { it != TicketStatus.Unknown }.forEach { s -> s.visual.let { StatusChip(it.label, it.tone, icon = it.icon) } }
        }
        Text("Buttons", style = BistroTheme.type.sectionTitle, color = BistroTheme.colors.textPrimary, modifier = Modifier.padding(top = Spacing.lg))
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm), modifier = Modifier.fillMaxWidth()) {
            BistroButton("Send to kitchen", {}, style = ButtonStyle.Accent, icon = Icons.Rounded.Send, trailing = "· 3", modifier = Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                BistroButton("Issue bill", {}, modifier = Modifier.weight(1f))
                BistroButton("Add", {}, style = ButtonStyle.Secondary, modifier = Modifier.weight(1f))
                BistroButton("Void", {}, style = ButtonStyle.Danger, modifier = Modifier.weight(1f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                BistroButton("Loading", {}, loading = true, modifier = Modifier.weight(1f))
                BistroButton("Disabled", {}, enabled = false, modifier = Modifier.weight(1f))
            }
            SegmentedControl(listOf("New", "Preparing", "Ready"), "Preparing", {}, { it }, badge = { if (it == "New") 3 else null })
            QuantityStepper(2, {})
            StaleBanner(AppError.Offline)
        }
        EmptyState(Icons.Rounded.TableRestaurant, "No tables yet", "Add your tables and areas to start seating guests.")
    }
}
