import {
  Signal,
  GrowthContract,
  Customer,
  Segment,
  Campaign,
  ContentItem,
  ImpactMetric,
  Tool,
} from '@/types';
import { mockTodaySignal, mockGrowthContract } from '@/mock-data/signals';
import { mockCustomers, mockSegments } from '@/mock-data/customers';
import {
  mockCampaigns,
  mockContentStudioItems,
  mockImpactMetrics,
  mockTools,
} from '@/mock-data/campaigns';

/**
 * Service Layer Abstraction for QADAM Growth OS
 * Current implementation: Returns typed mock data asynchronously.
 * Backend Integration Target: Supabase Client, RLS queries, AI Content Generation APIs.
 */

export async function getTodaySignal(): Promise<Signal> {
  // Simulate minor async network delay
  await new Promise((resolve) => setTimeout(resolve, 60));
  return mockTodaySignal;
}

export async function getGrowthContract(): Promise<GrowthContract> {
  await new Promise((resolve) => setTimeout(resolve, 60));
  return mockGrowthContract;
}

export async function getCustomers(): Promise<Customer[]> {
  await new Promise((resolve) => setTimeout(resolve, 80));
  return mockCustomers;
}

export async function getCustomerById(id: string): Promise<Customer | undefined> {
  await new Promise((resolve) => setTimeout(resolve, 60));
  return mockCustomers.find((c) => c.id === id);
}

export async function getSegments(): Promise<Segment[]> {
  await new Promise((resolve) => setTimeout(resolve, 60));
  return mockSegments;
}

export async function getCampaigns(): Promise<Campaign[]> {
  await new Promise((resolve) => setTimeout(resolve, 80));
  return mockCampaigns;
}

export async function getContentStudioItems(): Promise<ContentItem[]> {
  await new Promise((resolve) => setTimeout(resolve, 60));
  return mockContentStudioItems;
}

export async function getImpactMetrics(): Promise<ImpactMetric[]> {
  await new Promise((resolve) => setTimeout(resolve, 60));
  return mockImpactMetrics;
}

export async function getTools(): Promise<Tool[]> {
  await new Promise((resolve) => setTimeout(resolve, 60));
  return mockTools;
}
