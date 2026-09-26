# kotlinx.serialization: keep generated serializers for @Serializable DTOs.
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions
-keepclassmembers @kotlinx.serialization.Serializable class ai.synkrasis.bistro.** {
    *** Companion;
    *** INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}
-keepclasseswithmembers class ai.synkrasis.bistro.** {
    kotlinx.serialization.KSerializer serializer(...);
}
# Retrofit service interfaces are proxied reflectively.
-keep,allowobfuscation interface ai.synkrasis.bistro.data.api.BistroApi
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
