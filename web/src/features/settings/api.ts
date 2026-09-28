import { useQuery } from '@tanstack/react-query'
import { request } from '@/api/client'
import type { ApiError } from '@/api/errors'
import { keys } from '@/api/queries'
import type { components } from '@/api/schema'
import type { PaymentMethod, RestaurantSettings } from '@/api/types'

type S = components['schemas']
export type SettingsUpdate = S['SettingsUpdate']
export type TaxRatesIn = S['TaxRatesIn']
export type TaxRateIn = S['TaxRateIn']
export type PaymentMethodIn = S['PaymentMethodIn']
export type PaymentMethodUpdate = S['PaymentMethodUpdate']

/** Settings change rarely; Android polls every 120 s while the screen is open. */
export function useSettingsLive() {
  return useQuery<RestaurantSettings, ApiError>({
    queryKey: keys.settings,
    queryFn: ({ signal }) => request<RestaurantSettings>('/settings', { signal }),
    refetchInterval: 120_000,
  })
}

export const patchSettings = (body: SettingsUpdate) =>
  request<RestaurantSettings>('/settings', { method: 'PATCH', body })

export const putTaxRates = (body: TaxRatesIn) =>
  request<RestaurantSettings>('/settings/tax-rates', { method: 'PUT', body })

export const createPaymentMethod = (body: PaymentMethodIn) =>
  request<PaymentMethod>('/payment-methods', { method: 'POST', body })

export const updatePaymentMethod = (id: number, body: PaymentMethodUpdate) =>
  request<PaymentMethod>(`/payment-methods/${id}`, { method: 'PATCH', body })
