package ai.synkrasis.bistro

import ai.synkrasis.bistro.core.network.ApiCaller
import ai.synkrasis.bistro.core.network.HttpClients
import ai.synkrasis.bistro.core.session.AuthGateway
import ai.synkrasis.bistro.core.session.Preferences
import ai.synkrasis.bistro.core.session.SessionManager
import ai.synkrasis.bistro.core.session.TokenStore
import ai.synkrasis.bistro.data.api.AuthApi
import ai.synkrasis.bistro.data.api.BistroApi
import ai.synkrasis.bistro.data.api.LoginIn
import ai.synkrasis.bistro.data.api.RefreshIn
import ai.synkrasis.bistro.data.repository.BillingRepository
import ai.synkrasis.bistro.data.repository.FloorRepository
import ai.synkrasis.bistro.data.repository.InsightsRepository
import ai.synkrasis.bistro.data.repository.KitchenRepository
import ai.synkrasis.bistro.data.repository.MenuRepository
import ai.synkrasis.bistro.data.repository.OrderRepository
import ai.synkrasis.bistro.data.repository.SettingsRepository
import ai.synkrasis.bistro.data.repository.StaffRepository
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNamingStrategy
import okhttp3.MediaType.Companion.toMediaType
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

@OptIn(ExperimentalSerializationApi::class)
val BistroJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    namingStrategy = JsonNamingStrategy.SnakeCase
}

/**
 * Manual dependency graph. The app is one module with a handful of singletons; a DI
 * framework would add build time and indirection without buying anything here.
 */
class AppContainer(context: Context) {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val json = BistroJson
    val preferences = Preferences(context, appScope)

    private val baseUrl = BuildConfig.API_BASE_URL.trimEnd('/') + "/api/v1/"
    private val converter = json.asConverterFactory("application/json".toMediaType())

    private val authApi: AuthApi = Retrofit.Builder().baseUrl(baseUrl)
        .client(HttpClients.buildAuth()).addConverterFactory(converter).build()
        .create(AuthApi::class.java)

    private lateinit var sessionRef: SessionManager
    private val api: BistroApi = Retrofit.Builder().baseUrl(baseUrl)
        .client(HttpClients.build { sessionRef }).addConverterFactory(converter).build()
        .create(BistroApi::class.java)

    val session: SessionManager = SessionManager(
        tokens = TokenStore(context),
        gateway = {
            object : AuthGateway {
                override suspend fun login(body: LoginIn) = authApi.login(body)
                override suspend fun refresh(refreshToken: String) = authApi.refresh(RefreshIn(refreshToken))
                override suspend fun me() = api.me()
                override suspend fun logout() = api.logout()
            }
        },
        json = json,
        scope = appScope,
    ).also { sessionRef = it }

    private val caller = ApiCaller(json) { notice -> session.onSessionEnded(notice) }

    val floor = FloorRepository(api, caller)
    val menu = MenuRepository(api, caller)
    val orders = OrderRepository(api, caller)
    val kitchen = KitchenRepository(api, caller)
    val billing = BillingRepository(api, caller)
    val staff = StaffRepository(api, caller)
    val settings = SettingsRepository(api, caller)
    val insights = InsightsRepository(api, caller)
    val account = AccountRepository(api, caller, session)
}

class AccountRepository(private val api: BistroApi, private val call: ApiCaller, private val session: SessionManager) {
    suspend fun changePassword(current: String, new: String) = call {
        val pair = api.changePassword(ai.synkrasis.bistro.data.api.ChangePasswordIn(current, new))
        session.adopt(pair)
    }
}
