import type { Campaign, Customer, Signal } from '@/types';
export interface QadamDataAdapter { getTodaySignal(): Promise<Signal>; getCustomers(): Promise<Customer[]>; getCampaigns(): Promise<Campaign[]>; }
export type QadamAdapterFactory = () => QadamDataAdapter;
