/**
 * A key identifies one *intent* (this payment, this send-to-kitchen), not one HTTP attempt.
 * It is reused for retries of the same intent against the same version, and replaced as soon
 * as the thing it was for has changed — so a retry after a lost response can never charge
 * twice, and a genuinely new payment of the same amount is never swallowed as a replay.
 */
export class IntentKey {
  private current: { key: string; fingerprint: string } | null = null

  keyFor(fingerprint: string): string {
    if (this.current?.fingerprint !== fingerprint) {
      this.current = { key: crypto.randomUUID(), fingerprint }
    }
    return this.current.key
  }

  reset(): void {
    this.current = null
  }
}
