package ai.synkrasis.bistro.core.designsystem.theme

/** The only three appearance modes the app offers. There is deliberately no "system" option. */
enum class Appearance(val storageKey: String, val label: String) {
    Light("light", "Light"),
    Dark("dark", "Dark"),
    Black("black", "Black");

    val isDark: Boolean get() = this != Light

    companion object {
        val Default = Light
        fun fromStorage(value: String?): Appearance = entries.firstOrNull { it.storageKey == value } ?: Default
    }
}
