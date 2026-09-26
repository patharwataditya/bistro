package ai.synkrasis.bistro.core.session

import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.network.toAppError
import ai.synkrasis.bistro.data.api.LoginIn
import ai.synkrasis.bistro.data.api.Me
import ai.synkrasis.bistro.data.api.TokenPair
import ai.synkrasis.bistro.domain.Grants
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json

sealed interface SessionState {
    /** Reading the stored session at launch. */
    data object Restoring : SessionState

    /** Stored session exists but the server couldn't be reached to resume it. */
    data class RestoreFailed(val error: AppError) : SessionState

    data class SignedOut(val notice: String? = null) : SessionState

    data class SignedIn(val me: Me) : SessionState {
        val grants: Grants = Grants(me.permissions.toSet())
    }
}

/** What the session needs from the network, kept narrow so it can be faked in tests. */
interface AuthGateway {
    suspend fun login(body: LoginIn): TokenPair
    suspend fun refresh(refreshToken: String): TokenPair
    suspend fun me(): Me
    suspend fun logout()
}

/**
 * Owns the signed-in state. The access token lives only in memory; the refresh token is
 * persisted by [TokenStore]. Refreshes are single-flight: concurrent 401s share one refresh.
 */
class SessionManager(
    private val tokens: TokenStore,
    private val gateway: () -> AuthGateway,
    private val json: Json,
    private val scope: CoroutineScope,
) {
    private val _state = MutableStateFlow<SessionState>(SessionState.Restoring)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    @Volatile
    var accessToken: String? = null
        private set

    private val refreshLock = Mutex()

    fun restore() {
        scope.launch {
            _state.value = SessionState.Restoring
            val stored = tokens.read()
            if (stored == null) {
                _state.value = SessionState.SignedOut()
                return@launch
            }
            try {
                adopt(gateway().refresh(stored))
                _state.value = SessionState.SignedIn(gateway().me())
            } catch (t: Throwable) {
                when (val error = t.toAppError(json)) {
                    is AppError.SessionEnded -> endLocally("Your session has ended. Sign in again.")
                    else -> _state.value = SessionState.RestoreFailed(error)
                }
            }
        }
    }

    suspend fun signIn(username: String, password: String, deviceLabel: String) {
        adopt(gateway().login(LoginIn(username.trim(), password, deviceLabel)))
        _state.value = SessionState.SignedIn(gateway().me())
    }

    /** Re-read the profile (permissions may have been changed by a manager). */
    suspend fun reloadProfile() {
        val me = gateway().me()
        if (_state.value is SessionState.SignedIn) _state.value = SessionState.SignedIn(me)
    }

    suspend fun adopt(pair: TokenPair) {
        accessToken = pair.accessToken
        tokens.write(pair.refreshToken)
    }

    /**
     * Called by the HTTP layer after a 401. Returns a fresh access token, or null when the
     * session is truly over. [failedToken] lets callers that lost the race reuse the winner's
     * refresh instead of rotating again (which the server would treat as token reuse).
     */
    suspend fun refreshAccessToken(failedToken: String?): String? = refreshLock.withLock {
        val current = accessToken
        if (current != null && current != failedToken) return current
        val stored = tokens.read() ?: return null
        return try {
            val pair = gateway().refresh(stored)
            adopt(pair)
            pair.accessToken
        } catch (t: Throwable) {
            when (t.toAppError(json)) {
                is AppError.SessionEnded -> {
                    endLocally("Your session has ended. Sign in again.")
                    null
                }
                // Network trouble is not the end of the session: let the request fail normally.
                else -> throw t
            }
        }
    }

    suspend fun signOut() {
        runCatching { gateway().logout() }
        endLocally(null)
    }

    fun onSessionEnded(notice: String) {
        scope.launch { endLocally(notice) }
    }

    private suspend fun endLocally(notice: String?) {
        accessToken = null
        tokens.clear()
        if (_state.value !is SessionState.SignedOut) _state.value = SessionState.SignedOut(notice)
    }
}
