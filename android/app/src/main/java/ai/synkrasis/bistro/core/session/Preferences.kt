package ai.synkrasis.bistro.core.session

import ai.synkrasis.bistro.core.designsystem.theme.Appearance
import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

private val Context.prefsStore by preferencesDataStore(name = "preferences")

/** Device-local preferences: appearance and haptics. Nothing sensitive lives here. */
class Preferences(private val context: Context, scope: CoroutineScope) {
    private val appearanceKey = stringPreferencesKey("appearance")
    private val hapticsKey = booleanPreferencesKey("haptics")

    val appearance: StateFlow<Appearance?> = context.prefsStore.data
        .map { Appearance.fromStorage(it[appearanceKey]) }
        .stateIn(scope, SharingStarted.Eagerly, null)

    val hapticsEnabled: StateFlow<Boolean> = context.prefsStore.data
        .map { it[hapticsKey] ?: true }
        .stateIn(scope, SharingStarted.Eagerly, true)

    suspend fun setAppearance(value: Appearance) {
        context.prefsStore.edit { it[appearanceKey] = value.storageKey }
    }

    suspend fun setHaptics(enabled: Boolean) {
        context.prefsStore.edit { it[hapticsKey] = enabled }
    }
}
