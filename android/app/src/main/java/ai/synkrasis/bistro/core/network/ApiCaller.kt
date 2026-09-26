package ai.synkrasis.bistro.core.network

import kotlinx.serialization.json.Json

/**
 * Runs an API call and converts every failure into an [AppError]. A session-ending error is
 * also reported to [onSessionEnded] so the app returns to sign-in from anywhere.
 */
class ApiCaller(
    private val json: Json,
    private val onSessionEnded: (String) -> Unit,
) {
    suspend operator fun <T> invoke(block: suspend () -> T): ApiResult<T> = try {
        ApiResult.Success(block())
    } catch (t: Throwable) {
        val error = t.toAppError(json)
        if (error is AppError.SessionEnded) onSessionEnded(error.message)
        ApiResult.Failure(error)
    }
}
