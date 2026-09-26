package ai.synkrasis.bistro

import ai.synkrasis.bistro.data.api.Bill
import ai.synkrasis.bistro.data.api.Floor
import ai.synkrasis.bistro.data.api.KitchenBoard
import ai.synkrasis.bistro.data.api.Order
import ai.synkrasis.bistro.data.api.PaymentIn
import ai.synkrasis.bistro.domain.BillStatus
import ai.synkrasis.bistro.domain.OrderItemStatus
import ai.synkrasis.bistro.domain.TableStatus
import ai.synkrasis.bistro.domain.TicketStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal
import java.time.Instant

/** Payloads shaped exactly like the FastAPI responses (snake_case, decimal strings, offsets). */
class DecodingTest {
    private val json = BistroJson

    @Test fun decodesOrderWithDecimalMoneyAndOffsets() {
        val order = json.decodeFromString<Order>(ORDER)
        assertEquals(BigDecimal("893.02"), order.totals.total)
        assertEquals(OrderItemStatus.Sent, order.items[0].status)
        assertEquals(Instant.parse("2026-09-26T13:30:00Z"), order.openedAt)
        assertEquals("CGST", order.totals.taxes[0].name)
        assertNull(order.billId)
    }

    @Test fun unknownEnumValuesDoNotCrash() {
        val floor = json.decodeFromString<Floor>(FLOOR.replace("\"RESERVED\"", "\"WAITLISTED\""))
        assertEquals(TableStatus.Unknown, floor.tables[0].status)
        assertFalse(floor.tables[0].status.seatable)
    }

    @Test fun unknownFieldsAreIgnored() {
        val floor = json.decodeFromString<Floor>(FLOOR.replace("\"sort_order\": 1,", "\"sort_order\": 1, \"new_field\": [1,2],"))
        assertEquals(1, floor.tables.size)
    }

    @Test fun decodesKitchenBoard() {
        val board = json.decodeFromString<KitchenBoard>(KITCHEN)
        assertEquals(TicketStatus.Preparing, board.tickets[0].status)
        assertEquals("no onions", board.tickets[0].items[0].notes)
    }

    @Test fun decodesBillWithPaymentsAndCorrections() {
        val bill = json.decodeFromString<Bill>(BILL)
        assertEquals(BillStatus.Open, bill.status)
        assertTrue(bill.payments[1].isCorrection)
        assertEquals(BigDecimal("106.98"), bill.payments[0].changeDue)
    }

    @Test fun encodesMoneyAsPlainDecimalStringsAndOmitsNulls() {
        val body = json.encodeToString(PaymentIn.serializer(), PaymentIn(3, 2, BigDecimal("1E+2"), null, null))
        assertEquals("""{"version":3,"payment_method_id":2,"amount":"100"}""", body)
    }

    private companion object {
        const val ORDER = """{"id": 7, "order_number": 12, "status": "OPEN", "table_id": 1, "table_name": "T1",
          "server_id": 6, "server_name": "Sofia Server", "guest_count": 2, "notes": null,
          "opened_at": "2026-09-26T19:00:00+05:30", "billed_at": null, "closed_at": null, "cancelled_at": null,
          "cancel_reason": null, "merged_into_id": null,
          "items": [{"id": 1, "menu_item_id": 5, "name": "Margherita Pizza", "unit_price": "450.00", "quantity": 1,
            "line_total": "450.00", "notes": null, "status": "SENT", "ticket_id": 3, "void_reason": null,
            "created_at": "2026-09-26T13:31:00.123456Z"}],
          "totals": {"subtotal": "810.00", "discount_amount": "0.00", "service_charge_percent": "5.00",
            "service_charge_amount": "40.50", "taxes": [{"name": "CGST", "rate_percent": "2.500", "taxable_amount": "850.50", "amount": "21.26"}],
            "tax_total": "42.52", "round_off": "0.00", "total": "893.02"},
          "bill_id": null, "currency_code": "INR", "version": 4}"""

        const val FLOOR = """{"areas": [{"id": 1, "name": "Main Hall", "sort_order": 0}],
          "tables": [{"id": 1, "name": "T1", "capacity": 4, "area_id": 1, "area_name": "Main Hall",
            "status": "RESERVED", "status_note": "Smith 8pm", "sort_order": 1, "version": 3, "active_order": null}],
          "server_time": "2026-09-26T13:30:00Z"}"""

        const val KITCHEN = """{"tickets": [{"id": 3, "ticket_number": 9, "status": "PREPARING", "order_id": 7,
          "order_number": 12, "order_status": "OPEN", "order_notes": null, "table_name": "T1", "server_name": "Sofia",
          "fired_at": "2026-09-26T13:31:00Z", "accepted_at": null, "started_at": "2026-09-26T13:32:00Z",
          "ready_at": null, "completed_at": null,
          "items": [{"id": 1, "name": "Pizza", "quantity": 2, "notes": "no onions", "status": "PREPARING"}],
          "version": 3}], "server_time": "2026-09-26T13:40:00Z"}"""

        const val BILL = """{"id": 1, "bill_number": "B-000001", "status": "OPEN", "order_id": 7, "order_number": 12,
          "table_name": "T1", "server_name": "Sofia", "guest_count": 2, "currency_code": "INR", "subtotal": "810.00",
          "discount_type": null, "discount_value": null, "discount_amount": "0.00", "discount_reason": null,
          "service_charge_percent": "5.00", "service_charge_amount": "40.50", "taxes": [], "tax_total": "42.52",
          "round_off": "0.00", "total": "893.02", "paid_total": "393.02", "refunded_total": "0.01", "balance_due": "500.01",
          "payments": [
            {"id": 1, "kind": "PAYMENT", "payment_method_id": 1, "method_name": "Cash", "amount": "393.02",
             "tendered": "500.00", "change_due": "106.98", "reference": null, "reason": null, "is_correction": false,
             "created_by_name": "Carlos", "created_at": "2026-09-26T14:00:00Z"},
            {"id": 2, "kind": "REFUND", "payment_method_id": 1, "method_name": "Cash", "amount": "0.01",
             "tendered": null, "change_due": "0.00", "reference": null, "reason": "Mistake", "is_correction": true,
             "created_by_name": "Maya", "created_at": "2026-09-26T14:01:00Z"}],
          "created_by_name": "Sofia", "created_at": "2026-09-26T13:59:00Z", "paid_at": null, "voided_at": null,
          "void_reason": null, "version": 3}"""
    }
}
