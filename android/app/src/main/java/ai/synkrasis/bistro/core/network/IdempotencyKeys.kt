package ai.synkrasis.bistro.core.network

import java.util.UUID

/**
 * A key identifies one *intent* (this payment, this send-to-kitchen), not one HTTP attempt.
 * Screens create a key when the user starts an action and reuse it for retries of that same
 * action, so a retry after a dropped response can never charge twice.
 */
object IdempotencyKeys {
    fun new(): String = UUID.randomUUID().toString()
}
