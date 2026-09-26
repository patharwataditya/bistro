package ai.synkrasis.bistro

import ai.synkrasis.bistro.core.network.ApiCaller
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.data.api.BistroApi
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

class ErrorMappingTest {
    private lateinit var server: MockWebServer
    private lateinit var api: BistroApi
    private var sessionEnded: String? = null
    private lateinit var call: ApiCaller

    @Before fun setUp() {
        server = MockWebServer()
        server.start()
        api = Retrofit.Builder().baseUrl(server.url("/api/v1/"))
            .client(OkHttpClient.Builder().readTimeout(1, TimeUnit.SECONDS).build())
            .addConverterFactory(BistroJson.asConverterFactory("application/json".toMediaType()))
            .build().create(BistroApi::class.java)
        call = ApiCaller(BistroJson) { sessionEnded = it }
    }

    @After fun tearDown() = server.close()

    private fun enqueue(code: Int, errorCode: String, message: String, details: String = "{}") {
        server.enqueue(MockResponse.Builder().code(code)
            .body("""{"error":{"code":"$errorCode","message":"$message","details":$details}}""").build())
    }

    @Test fun staleVersionMapsToStaleWithServerMessage() = runTest {
        enqueue(409, "STALE_VERSION", "This bill was changed by someone else. Refresh and try again.")
        val r = call { api.bill(1) }
        assertEquals(AppError.Stale("This bill was changed by someone else. Refresh and try again."), (r as ApiResult.Failure).error)
    }

    @Test fun validationCarriesFieldErrors() = runTest {
        enqueue(422, "VALIDATION_ERROR", "Some fields need attention.", """{"fields":[{"field":"amount","message":"too big"}]}""")
        val r = call { api.bill(1) } as ApiResult.Failure
        assertEquals(mapOf("amount" to "too big"), (r.error as AppError.Validation).fields)
    }

    @Test fun expiredSessionIsReported() = runTest {
        enqueue(401, "UNAUTHENTICATED", "Sign in again.")
        val r = call { api.me() } as ApiResult.Failure
        assertTrue(r.error is AppError.SessionEnded)
        assertEquals("Sign in again.", sessionEnded)
    }

    @Test fun htmlErrorPageFromProxyStillMaps() = runTest {
        server.enqueue(MockResponse.Builder().code(502).body("<html>Bad gateway</html>").build())
        val r = call { api.me() } as ApiResult.Failure
        assertTrue(r.error is AppError.Server)
        assertTrue(r.error.retryable)
    }

    @Test fun malformedSuccessBodyIsUnexpectedNotACrash() = runTest {
        server.enqueue(MockResponse.Builder().code(200).body("""{"id":"not-a-number"}""").build())
        val r = call { api.me() } as ApiResult.Failure
        assertTrue(r.error is AppError.Unexpected)
    }

    @Test fun timeoutIsTimeout() = runTest {
        server.enqueue(MockResponse.Builder().bodyDelay(3, TimeUnit.SECONDS).body("{}").build())
        val r = call { api.me() } as ApiResult.Failure
        assertEquals(AppError.Timeout, r.error)
    }
}
