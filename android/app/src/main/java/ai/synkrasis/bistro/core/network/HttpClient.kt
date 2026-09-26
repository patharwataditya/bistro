package ai.synkrasis.bistro.core.network

import ai.synkrasis.bistro.BuildConfig
import ai.synkrasis.bistro.core.session.SessionManager
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Adds the in-memory access token and a request id for correlating with server logs. */
class AuthInterceptor(private val session: () -> SessionManager) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val builder = chain.request().newBuilder()
            .header("X-Request-ID", UUID.randomUUID().toString().replace("-", ""))
            .header("Accept", "application/json")
        session().accessToken?.let { builder.header("Authorization", "Bearer $it") }
        return chain.proceed(builder.build())
    }
}

/**
 * On a 401, refresh once and replay the request with the new token. Replaying is safe even
 * for payments: the server rejects unauthenticated requests before running any handler.
 */
class TokenAuthenticator(private val session: () -> SessionManager) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.url.encodedPath.contains("/auth/")) return null
        if (responseCount(response) >= 2) return null
        val failed = response.request.header("Authorization")?.removePrefix("Bearer ")
        val fresh = try {
            runBlocking { session().refreshAccessToken(failed) }
        } catch (e: IOException) {
            throw e
        } catch (e: Exception) {
            // Refresh couldn't reach the server: surface a network failure, NOT the 401, so
            // a Wi-Fi blip after 15 minutes doesn't sign anyone out.
            throw IOException("Couldn't renew the session", e)
        } ?: return null // the server said the session is over
        return response.request.newBuilder().header("Authorization", "Bearer $fresh").build()
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}

object HttpClients {
    fun build(session: () -> SessionManager): OkHttpClient {
        require(BuildConfig.ALLOW_CLEARTEXT || BuildConfig.API_BASE_URL.startsWith("https://")) {
            "Release builds must use an HTTPS API URL"
        }
        return OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(30, TimeUnit.SECONDS)
            // Never silently resend a request that may have reached the server: money and
            // state changes are retried only by an explicit user action with the same key.
            .retryOnConnectionFailure(false)
            .addInterceptor(AuthInterceptor(session))
            .authenticator(TokenAuthenticator(session))
            .build()
    }

    /** Bare client for /auth/refresh: no authenticator, so a failing refresh can't recurse. */
    fun buildAuth(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .callTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)
        .build()
}
