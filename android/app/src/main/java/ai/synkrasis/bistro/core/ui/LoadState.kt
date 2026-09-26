package ai.synkrasis.bistro.core.ui

import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.network.ApiResult
import androidx.compose.runtime.Immutable

/**
 * Screen data state. One value, so "loading and error and empty" can never be true at once.
 * [Ready.staleError] means the data shown is the last good copy and the latest refresh failed.
 */
@Immutable
sealed interface LoadState<out T> {
    data object Loading : LoadState<Nothing>
    data class Failed(val error: AppError) : LoadState<Nothing>
    data class Ready<T>(val data: T, val refreshing: Boolean = false, val staleError: AppError? = null) : LoadState<T>
}

val <T> LoadState<T>.dataOrNull: T? get() = (this as? LoadState.Ready)?.data

/** Fold a fetch result into the current state, keeping good data when a refresh fails. */
fun <T> LoadState<T>.reduce(result: ApiResult<T>): LoadState<T> = when (result) {
    is ApiResult.Success -> LoadState.Ready(result.value)
    is ApiResult.Failure -> when (this) {
        is LoadState.Ready -> copy(refreshing = false, staleError = result.error)
        else -> LoadState.Failed(result.error)
    }
}

fun <T> LoadState<T>.markRefreshing(): LoadState<T> = when (this) {
    is LoadState.Ready -> copy(refreshing = true)
    is LoadState.Failed -> LoadState.Loading
    LoadState.Loading -> this
}
