package ai.synkrasis.bistro.feature.order

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.network.IdempotencyKeys
import ai.synkrasis.bistro.core.ui.Effects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.data.api.Menu
import ai.synkrasis.bistro.data.api.MenuItem
import ai.synkrasis.bistro.data.api.Order
import ai.synkrasis.bistro.data.api.OrderItemIn
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import java.math.BigDecimal

/** A line in the local cart. The same item with a different note is a different line. */
@Immutable
data class CartLine(val item: MenuItem, val quantity: Int, val note: String) {
    val key: String get() = "${item.id}|$note"
    val total: BigDecimal get() = item.price.multiply(quantity.toBigDecimal())
}

/**
 * The cart is local until "Add": nothing reaches the kitchen or the check until the server
 * accepts it. Prices shown are the menu's; the server re-reads them when adding.
 */
class AddItemsViewModel(private val container: AppContainer, val orderId: Int) : ViewModel() {
    var menu by mutableStateOf<LoadState<Menu>>(LoadState.Loading)
        private set
    var order by mutableStateOf<Order?>(null)
        private set
    var category by mutableStateOf<Int?>(null)
    var query by mutableStateOf("")
    var cart by mutableStateOf<List<CartLine>>(emptyList())
        private set
    var reviewing by mutableStateOf(false)
    var noteFor by mutableStateOf<MenuItem?>(null)
    var submitting by mutableStateOf<String?>(null)
        private set

    val effects = Effects()
    private var addKey: String? = null
    private var fireKey: String? = null

    val count: Int get() = cart.sumOf { it.quantity }
    val total: BigDecimal get() = cart.fold(BigDecimal.ZERO) { acc, l -> acc + l.total }

    init {
        load()
    }

    fun load() {
        menu = LoadState.Loading
        viewModelScope.launch {
            val m = container.menu.menu()
            val o = container.orders.get(orderId)
            if (o is ApiResult.Success) order = o.value
            menu = when (m) {
                is ApiResult.Success -> LoadState.Ready(m.value)
                is ApiResult.Failure -> LoadState.Failed(m.error)
            }
        }
    }

    fun quantityOf(item: MenuItem): Int = cart.filter { it.item.id == item.id }.sumOf { it.quantity }

    fun add(item: MenuItem, quantity: Int = 1, note: String = "") {
        if (!item.isAvailable) return
        cartChanged()
        val key = "${item.id}|${note.trim()}"
        val existing = cart.firstOrNull { it.key == key }
        cart = if (existing != null) {
            cart.map { if (it.key == key) it.copy(quantity = (it.quantity + quantity).coerceAtMost(999)) else it }
        } else {
            cart + CartLine(item, quantity, note.trim())
        }
    }

    /** Decrease from the plain (no-note) line first, as the menu's minus button implies. */
    fun decrement(item: MenuItem) {
        cartChanged()
        val line = cart.firstOrNull { it.item.id == item.id && it.note.isEmpty() } ?: cart.lastOrNull { it.item.id == item.id } ?: return
        setLine(line, line.quantity - 1)
    }

    fun setLine(line: CartLine, quantity: Int) {
        cartChanged()
        cart = if (quantity <= 0) cart.filterNot { it.key == line.key } else cart.map { if (it.key == line.key) it.copy(quantity = quantity) else it }
        if (cart.isEmpty()) reviewing = false
    }

    private fun cartChanged() {
        addKey = null
        fireKey = null
    }

    fun submit(sendToKitchen: Boolean) {
        if (cart.isEmpty() || submitting != null) return
        submitting = if (sendToKitchen) "send" else "add"
        val key = addKey ?: IdempotencyKeys.new().also { addKey = it }
        val lines = cart.map { OrderItemIn(it.item.id, it.quantity, it.note.ifBlank { null }) }
        viewModelScope.launch {
            when (val added = container.orders.addItems(orderId, key, lines)) {
                is ApiResult.Success -> {
                    order = added.value
                    if (sendToKitchen) {
                        val fk = fireKey ?: IdempotencyKeys.new().also { fireKey = it }
                        when (val fired = container.orders.fire(orderId, added.value.version, fk)) {
                            is ApiResult.Success -> {
                                done("Sent $count item${if (count == 1) "" else "s"} to the kitchen")
                            }
                            is ApiResult.Failure -> {
                                // Items are safely on the check; only the send failed.
                                cart = emptyList()
                                effects.error("Added, but not sent: ${fired.error.message}")
                                effects.back()
                            }
                        }
                    } else {
                        done("Added to the check")
                    }
                }
                is ApiResult.Failure -> effects.error(added.error.message)
            }
            submitting = null
        }
    }

    private fun done(message: String) {
        cart = emptyList()
        reviewing = false
        cartChanged()
        effects.success(message)
        effects.back()
    }
}
