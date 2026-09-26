package ai.synkrasis.bistro.data.api

import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

/** Endpoints called without (or before) an access token, on a client with no authenticator. */
interface AuthApi {
    @POST("auth/login") suspend fun login(@Body body: LoginIn): TokenPair
    @POST("auth/refresh") suspend fun refresh(@Body body: RefreshIn): TokenPair
    @POST("auth/logout") suspend fun logout(@Header("Authorization") authorization: String)
}
