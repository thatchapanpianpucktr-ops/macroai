export interface FoodHit {
  name: string;
  brand?: string;
  per100: { calories: number; protein: number; carbs: number; fat: number };
  servingG?: number;
  barcode?: string;
}
