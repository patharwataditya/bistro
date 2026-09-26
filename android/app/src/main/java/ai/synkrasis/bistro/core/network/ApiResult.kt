package ai.synkrasis.bistro.core.network

/** Outcome of a repository call. Exceptions stop at the repository boundary. */
sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>
    data class Failure(val error: AppError) : ApiResult<Nothing>
}

inline fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> = when (this) {
    is ApiResult.Success -> ApiResult.Success(transform(value))
    is ApiResult.Failure -> this
}

inline fun <T> ApiResult<T>.onSuccess(block: (T) -> Unit): ApiResult<T> {
    if (this is ApiResult.Success) block(value)
    return this
}

inline fun <T> ApiResult<T>.onFailure(block: (AppError) -> Unit): ApiResult<T> {
    if (this is ApiResult.Failure) block(error)
    return this
}
