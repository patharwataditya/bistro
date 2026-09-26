package ai.synkrasis.bistro

import ai.synkrasis.bistro.core.session.AuthGateway
import ai.synkrasis.bistro.core.session.SessionManager
import ai.synkrasis.bistro.core.session.SessionState
import ai.synkrasis.bistro.core.session.TokenStorage
import ai.synkrasis.bistro.data.api.LocationBrief
import ai.synkrasis.bistro.data.api.LoginIn
import ai.synkrasis.bistro.data.api.Me
import ai.synkrasis.bistro.data.api.TokenPair
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class SessionManagerTest {
    private class MemoryTokens(var token: String? = null) : TokenStorage {
        override suspend fun read() = token
        override suspend fun write(token: String) { this.token = token }
        override suspend fun clear() { token = null }
    }

    private class FakeGateway : AuthGateway {
        var refreshCalls = 0
        var refreshFailure: Throwable? = null
        override suspend fun login(body: LoginIn) = TokenPair("access-0", "refresh-0", 900)
        override suspend fun refresh(refreshToken: String): TokenPair {
            refreshCalls++
            delay(50)
            refreshFailure?.let { throw it }
            return TokenPair("access-$refreshCalls", "refresh-$refreshCalls", 900)
        }
        override suspend fun me() = Me(1, "owner", "Olivia Owner", emptyList(), listOf("tables.view"),
            LocationBrief(1, "Main", "Asia/Kolkata", "INR"), "Bistro")
        override suspend fun revoke(refreshToken: String) = Unit
    }

    private fun unauthorized() = HttpException(Response.error<Any>(401,
        """{"error":{"code":"UNAUTHENTICATED","message":"Your session has ended.","details":{}}}""".toResponseBody()))

    private fun manager(scope: TestScope, tokens: MemoryTokens, gateway: FakeGateway) =
        SessionManager(tokens, { gateway }, BistroJson, scope)

    @Test fun concurrentRefreshesShareOneRotation() = runTest {
        val tokens = MemoryTokens("refresh-0")
        val gateway = FakeGateway()
        val session = manager(this, tokens, gateway)
        session.signIn("owner", "pw", "test")
        val results = (1..5).map { async { session.refreshAccessToken(failedToken = "access-0") } }.awaitAll()
        assertEquals(1, gateway.refreshCalls)
        assertTrue(results.all { it == "access-1" })
        assertEquals("refresh-1", tokens.token)
    }

    @Test fun rejectedRefreshSignsOutAndClearsTokens() = runTest {
        val tokens = MemoryTokens("refresh-0")
        val gateway = FakeGateway().apply { refreshFailure = unauthorized() }
        val session = manager(this, tokens, gateway)
        assertNull(session.refreshAccessToken(failedToken = null))
        advanceUntilIdle()
        assertTrue(session.state.value is SessionState.SignedOut)
        assertNull(tokens.token)
    }

    @Test fun networkFailureDuringRestoreKeepsTheSession() = runTest(StandardTestDispatcher()) {
        val tokens = MemoryTokens("refresh-0")
        val gateway = FakeGateway().apply { refreshFailure = IOException("wifi down") }
        val session = manager(this, tokens, gateway)
        session.restore()
        advanceUntilIdle()
        assertTrue(session.state.value is SessionState.RestoreFailed)
        assertEquals("refresh-0", tokens.token)
    }

    @Test fun restoreWithoutStoredTokenIsSignedOut() = runTest {
        val session = manager(this, MemoryTokens(null), FakeGateway())
        session.restore()
        advanceUntilIdle()
        assertTrue(session.state.value is SessionState.SignedOut)
    }
}
