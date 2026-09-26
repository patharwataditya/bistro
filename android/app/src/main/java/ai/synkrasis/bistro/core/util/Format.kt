package ai.synkrasis.bistro.core.util

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.NumberFormat
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Currency
import java.util.Locale

/** Money, time and duration formatting in one place, so every screen reads the same. */
object Format {
    private val cache = HashMap<String, NumberFormat>()

    fun money(amount: BigDecimal, currencyCode: String, locale: Locale = Locale.getDefault()): String {
        val format = synchronized(cache) {
            cache.getOrPut("$currencyCode|$locale") {
                NumberFormat.getCurrencyInstance(locale).apply {
                    runCatching { currency = Currency.getInstance(currencyCode) }
                    minimumFractionDigits = 2
                    maximumFractionDigits = 2
                    roundingMode = RoundingMode.HALF_UP
                }
            }
        }
        return synchronized(format) { format.format(amount) }
    }

    /** Signed, for adjustments such as a discount or a negative round-off. */
    fun signedMoney(amount: BigDecimal, currencyCode: String): String = when (amount.signum()) {
        -1 -> "−" + money(amount.negate(), currencyCode)
        1 -> "+" + money(amount, currencyCode)
        else -> money(amount, currencyCode)
    }

    fun percent(value: BigDecimal): String = value.stripTrailingZeros().toPlainString() + "%"

    /** "4m", "1h 12m": compact elapsed time for tickets and tables. */
    fun elapsed(from: Instant, now: Instant): String {
        val d = Duration.between(from, now).coerceAtLeast(Duration.ZERO)
        val minutes = d.toMinutes()
        return when {
            minutes < 1 -> "now"
            minutes < 60 -> "${minutes}m"
            else -> "${minutes / 60}h ${minutes % 60}m"
        }
    }

    /** "mm:ss" under an hour: the kitchen timer. */
    fun clock(from: Instant, now: Instant): String {
        val s = Duration.between(from, now).coerceAtLeast(Duration.ZERO).seconds
        return if (s < 3600) "%d:%02d".format(s / 60, s % 60) else "%dh %02dm".format(s / 3600, (s % 3600) / 60)
    }

    private val timeFormat = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)
    private val dateTimeFormat = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)
    private val dateFormat = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)

    fun time(instant: Instant, zone: ZoneId): String = timeFormat.format(instant.atZone(zone))
    fun dateTime(instant: Instant, zone: ZoneId): String = dateTimeFormat.format(instant.atZone(zone))
    fun date(date: java.time.LocalDate): String = dateFormat.format(date)

    fun relative(instant: Instant, now: Instant, zone: ZoneId): String {
        val minutes = Duration.between(instant, now).toMinutes()
        return when {
            minutes < 1 -> "Just now"
            minutes < 60 -> "${minutes}m ago"
            minutes < 12 * 60 -> "${minutes / 60}h ago"
            else -> dateTime(instant, zone)
        }
    }
}

/** Parses what a person typed into an amount: digits and at most two decimals. */
object MoneyInput {
    private val pattern = Regex("^\\d{0,10}(\\.\\d{0,2})?$")

    fun accept(text: String): Boolean = text.isEmpty() || pattern.matches(text)

    fun parse(text: String): BigDecimal? =
        text.takeIf { it.isNotBlank() && it != "." }?.toBigDecimalOrNull()?.setScale(2, RoundingMode.HALF_UP)

    fun display(value: BigDecimal): String = value.setScale(2, RoundingMode.HALF_UP).toPlainString()
}

/**
 * Keeps elapsed-time displays on server time: the offset between the device clock and the
 * server's `server_time` is measured on each fetch and applied to "now".
 */
class ServerClock {
    @Volatile private var offsetMillis: Long = 0

    fun sync(serverTime: Instant, receivedAt: Instant = Instant.now()) {
        offsetMillis = serverTime.toEpochMilli() - receivedAt.toEpochMilli()
    }

    fun now(): Instant = Instant.now().plusMillis(offsetMillis)
}
