package ai.synkrasis.bistro.core.network

import ai.synkrasis.bistro.data.api.ErrorEnvelope
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.SerializationException
import retrofit2.HttpException
import java.io.IOException
import java.io.InterruptedIOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import kotlin.coroutines.cancellation.CancellationException

/**
 * Every failure the UI can meet, already translated into something a person can act on.
 * Messages from the server are written for staff and are shown as-is; internal details never
 * reach this type.
 */
sealed interface AppError {
    val message: String

    /** No connection or DNS failure: the device is offline or the Wi-Fi dropped. */
    data object Offline : AppError {
        override val message = "You're offline. Check the restaurant Wi-Fi and try again."
    }

    data object Timeout : AppError {
        override val message = "The server is taking too long to respond. Try again."
    }

    /** Session ended (expired, revoked, deactivated). The app signs out. */
    data class SessionEnded(override val message: String) : AppError

    data class PermissionDenied(override val message: String) : AppError

    data class NotFound(override val message: String) : AppError

    /** Someone else changed this first. Refresh and retry. */
    data class Stale(override val message: String) : AppError

    /** The action doesn't fit the current state (e.g. billing an order with unsent items). */
    data class InvalidState(override val message: String) : AppError

    data class Conflict(override val message: String) : AppError

    data class Validation(override val message: String, val fields: Map<String, String>) : AppError

    data class RateLimited(override val message: String) : AppError

    data class Server(override val message: String) : AppError

    data class Unexpected(override val message: String = "Something unexpected happened. Try again.") : AppError

    /** Worth offering a "Try again" button for. */
    val retryable: Boolean
        get() = this is Offline || this is Timeout || this is Server || this is Unexpected
}

internal fun Throwable.toAppError(json: Json): AppError = when (this) {
    is CancellationException -> throw this
    is HttpException -> fromHttp(this, json)
    is SocketTimeoutException -> AppError.Timeout
    is UnknownHostException -> AppError.Offline
    is InterruptedIOException -> AppError.Timeout
    is SessionEndedException -> AppError.SessionEnded(message ?: "Your session has ended. Sign in again.")
    is IOException -> AppError.Offline
    is SerializationException, is IllegalArgumentException ->
        AppError.Unexpected("The server sent something this version of the app doesn't understand.")
    else -> AppError.Unexpected()
}

private fun fromHttp(e: HttpException, json: Json): AppError {
    val raw = runCatching { e.response()?.errorBody()?.string() }.getOrNull()
    val body = raw?.let { runCatching { json.decodeFromString<ErrorEnvelope>(it).error }.getOrNull() }
    val message = body?.message ?: "The server couldn't complete that (${e.code()})."
    return when (body?.code) {
        "UNAUTHENTICATED", "TOKEN_EXPIRED", "ACCOUNT_INACTIVE" -> AppError.SessionEnded(message)
        "INVALID_CREDENTIALS" -> AppError.Validation(message, emptyMap())
        "PERMISSION_DENIED" -> AppError.PermissionDenied(message)
        "NOT_FOUND" -> AppError.NotFound(message)
        "STALE_VERSION" -> AppError.Stale(message)
        "INVALID_TRANSITION" -> AppError.InvalidState(message)
        "CONFLICT", "IDEMPOTENCY_MISMATCH" -> AppError.Conflict(message)
        "VALIDATION_ERROR" -> AppError.Validation(message, fieldErrors(body.details))
        "RATE_LIMITED", "ACCOUNT_LOCKED" -> AppError.RateLimited(message)
        "INTERNAL_ERROR" -> AppError.Server(message)
        else -> when (e.code()) {
            401 -> AppError.SessionEnded("Your session has ended. Sign in again.")
            403 -> AppError.PermissionDenied("You don't have permission to do that.")
            404 -> AppError.NotFound("That no longer exists.")
            409 -> AppError.Conflict(message)
            413 -> AppError.Validation("That's too much data to send at once.", emptyMap())
            429 -> AppError.RateLimited("Too many attempts. Wait a moment and try again.")
            in 500..599 -> AppError.Server("The server is having trouble. Try again in a moment.")
            else -> AppError.Unexpected(message)
        }
    }
}

private fun fieldErrors(details: JsonObject): Map<String, String> {
    val fields = details["fields"] as? JsonArray ?: return emptyMap()
    return fields.mapNotNull { element ->
        val obj = runCatching { element.jsonObject }.getOrNull() ?: return@mapNotNull null
        val field = (obj["field"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
        val msg = obj["message"]?.jsonPrimitive?.contentOrNull ?: "Invalid"
        field to msg
    }.toMap()
}

class SessionEndedException(message: String) : IOException(message)
