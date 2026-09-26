package ai.synkrasis.bistro

import ai.synkrasis.bistro.domain.BillStatus
import ai.synkrasis.bistro.domain.DiscountType
import ai.synkrasis.bistro.domain.OrderItemStatus
import ai.synkrasis.bistro.domain.OrderStatus
import ai.synkrasis.bistro.domain.PaymentKind
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.domain.TableStatus
import ai.synkrasis.bistro.domain.TicketStatus
import ai.synkrasis.bistro.domain.WireEnum
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/**
 * The app and the API share state names through contract/enums.json. If either side adds,
 * renames or drops a value without the other, this fails the build.
 */
class ContractTest {
    private val contract = run {
        var dir: File? = File(System.getProperty("user.dir")!!).absoluteFile
        while (dir != null && !File(dir, "contract/enums.json").exists()) dir = dir.parentFile
        requireNotNull(dir) { "contract/enums.json not found above ${System.getProperty("user.dir")}" }
        Json.parseToJsonElement(File(dir, "contract/enums.json").readText()).jsonObject
    }

    private fun values(name: String): Set<String> =
        (contract[name] as JsonArray).map { it.jsonPrimitive.content }.toSet()

    private fun <T> wire(entries: List<T>): Set<String> where T : Enum<T>, T : WireEnum =
        entries.map { it.wire }.filter { it.isNotEmpty() }.toSet()

    @Test fun tableStatus() = assertEquals(values("TableStatus"), wire(TableStatus.entries))
    @Test fun orderStatus() = assertEquals(values("OrderStatus"), wire(OrderStatus.entries))
    @Test fun orderItemStatus() = assertEquals(values("OrderItemStatus"), wire(OrderItemStatus.entries))
    @Test fun ticketStatus() = assertEquals(values("TicketStatus"), wire(TicketStatus.entries))
    @Test fun billStatus() = assertEquals(values("BillStatus"), wire(BillStatus.entries))
    @Test fun discountType() = assertEquals(values("DiscountType"), wire(DiscountType.entries))
    @Test fun paymentKind() = assertEquals(values("PaymentKind"), wire(PaymentKind.entries))
    @Test fun permissions() = assertEquals(values("Permission"), Permission.ALL)

    @Test fun everyServerErrorCodeIsKnownToTheErrorMapper() {
        val mapped = setOf(
            "VALIDATION_ERROR", "UNAUTHENTICATED", "TOKEN_EXPIRED", "INVALID_CREDENTIALS", "ACCOUNT_LOCKED",
            "ACCOUNT_INACTIVE", "PERMISSION_DENIED", "NOT_FOUND", "CONFLICT", "STALE_VERSION",
            "INVALID_TRANSITION", "IDEMPOTENCY_MISMATCH", "RATE_LIMITED", "INTERNAL_ERROR",
        )
        assertEquals(values("ErrorCode"), mapped)
        assertEquals(contract["ErrorCode"]!!.jsonArray.size, mapped.size)
    }
}
