export type LaundryType = 'wash' | 'dry';
export type WeightCategory = 's' | 'm' | 'l';
export type LegacyWeightCategory = '0-4' | '6-10' | '10-20';
export type PickupType = 'now' | 'schedule';

export const DELIVERY_FEE = 50;
export const PICKUP_NOW_EXTRA_FEE = 20;

export function normalizeServiceTimeMinutes(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return 50;
  }
  return value;
}

export function normalizeWeightCategory(
  weightCategory?: WeightCategory | LegacyWeightCategory,
): WeightCategory {
  if (weightCategory === 'm' || weightCategory === '6-10') return 'm';
  if (weightCategory === 'l' || weightCategory === '10-20') return 'l';
  return 's';
}

export function getWeightCategoryLabel(
  weightCategory?: WeightCategory | LegacyWeightCategory,
): string {
  const normalized = normalizeWeightCategory(weightCategory);
  if (normalized === 'm') return 'M (6-10 kg)';
  if (normalized === 'l') return 'L (10-20 kg)';
  return 'S (0-4 kg)';
}

export function getWashUnitPrice(
  weightCategory?: WeightCategory | LegacyWeightCategory,
): number {
  const normalized = normalizeWeightCategory(weightCategory);
  if (normalized === 'm') return 80;
  if (normalized === 'l') return 120;
  return 60;
}

export function calculateLaundryPrice(params: {
  laundryType?: LaundryType;
  weightCategory?: WeightCategory | LegacyWeightCategory;
  serviceTimeMinutes?: number;
}): number {
  const serviceTimeMinutes = normalizeServiceTimeMinutes(params.serviceTimeMinutes);
  const washUnitPrice = getWashUnitPrice(params.weightCategory);
  const washPrice = params.laundryType === 'dry' ? 0 : (serviceTimeMinutes / 50) * washUnitPrice;
  const dryPrice = (serviceTimeMinutes / 50) * 20;
  const calculated = washPrice + dryPrice;
  return Math.round(calculated * 100) / 100;
}

export function calculateOrderPriceSummary(params: {
  laundryType?: LaundryType;
  weightCategory?: WeightCategory | LegacyWeightCategory;
  serviceTimeMinutes?: number;
  pickupType?: PickupType;
}) {
  const serviceTimeMinutes = normalizeServiceTimeMinutes(params.serviceTimeMinutes);
  const washUnitPrice = getWashUnitPrice(params.weightCategory);
  const washPrice = params.laundryType === 'dry' ? 0 : Math.round(((serviceTimeMinutes / 50) * washUnitPrice) * 100) / 100;
  const dryPrice = Math.round(((serviceTimeMinutes / 50) * 20) * 100) / 100;
  const baseLaundryPrice = Math.round((washPrice + dryPrice) * 100) / 100;
  const deliveryFee = DELIVERY_FEE;
  const pickupServiceFee = params.pickupType === 'now' ? PICKUP_NOW_EXTRA_FEE : 0;
  const totalPrice = Math.round((baseLaundryPrice + deliveryFee + pickupServiceFee) * 100) / 100;

  return {
    washPrice,
    dryPrice,
    baseLaundryPrice,
    deliveryFee,
    pickupServiceFee,
    totalPrice,
  };
}
