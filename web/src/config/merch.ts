export type MerchItem = {
  id: 'tee' | 'hoodie' | 'cap' | 'tote';
  name: string;
  short: string;
  sized: boolean;
  color: string;
};

export const merchItems: MerchItem[] = [
  { id: 'tee', name: 'The Tee', short: 'Cream · oversized · numbered', sized: true, color: 'var(--pink)' },
  { id: 'hoodie', name: 'The Hoodie', short: 'Deep green · BUG ID sleeve patch', sized: true, color: 'var(--lime)' },
  { id: 'cap', name: 'The Cap', short: 'Rebel brown · embroidered bug', sized: false, color: 'var(--purple)' },
  { id: 'tote', name: 'The Tote', short: 'Natural canvas · big bug energy', sized: false, color: 'var(--mint)' },
];

export const merchSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
