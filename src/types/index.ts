export type Language = 'ru' | 'kk';

export type BusinessType = 'cafe' | 'beauty' | 'retail' | 'service' | 'chain';

export interface Business {
  id: string;
  name: string;
  type: BusinessType;
  city: string;
  currency: string;
  logoUrl?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  visitCount: number;
  totalSpent: number;
  lastVisitDaysAgo: number;
  segmentId: string;
  preferredChannel: 'whatsapp' | 'telegram' | 'sms';
  favoriteCategory: string;
  avgCheck: number;
}

export interface Segment {
  id: string;
  nameRu: string;
  nameKk: string;
  count: number;
  descriptionRu: string;
  descriptionKk: string;
  riskLevel: 'low' | 'medium' | 'high';
  avgLifetimeValue: number;
}

export interface Signal {
  id: string;
  titleRu: string;
  titleKk: string;
  metricChange: string;
  severity: 'opportunity' | 'warning' | 'critical';
  growthScore: number;
  affectedCustomersCount: number;
  detectedAt: string;
  timeWindow: string;
  category: string;
}

export interface GrowthContract {
  id: string;
  signalId: string;
  titleRu: string;
  titleKk: string;
  signalDescriptionRu: string;
  signalDescriptionKk: string;
  reasonRu: string;
  reasonKk: string;
  confidenceScore: number; // 0-100
  targetGoal: string;
  targetAudience: string;
  offerDescriptionRu: string;
  offerDescriptionKk: string;
  economics: {
    minCheck: number;
    giftCost: number;
    marginBeforePercent: number;
    marginAfterPercent: number;
    projectedIncrementalRevenue: number;
    projectedContributionProfit: number;
  };
  channel: 'WhatsApp' | 'Telegram' | 'Push';
  validityDays: number;
  stopRule: string;
  measurementMethod: string;
}

export interface Recommendation {
  id: string;
  titleRu: string;
  titleKk: string;
  summaryRu: string;
  summaryKk: string;
  contract: GrowthContract;
  status: 'draft' | 'approved' | 'launched' | 'completed';
}

export interface Campaign {
  id: string;
  titleRu: string;
  titleKk: string;
  type: 'gift_min_check' | 'happy_hours' | 'winback_coupon';
  status: 'active' | 'scheduled' | 'draft' | 'completed';
  targetCount: number;
  sentCount: number;
  openedCount: number;
  redeemedCount: number;
  influencedRevenue: number;
  incrementalRevenue: number;
  roi: number;
  startDate: string;
  endDate: string;
}

export interface ContentItem {
  id: string;
  channel: 'instagram_post' | 'instagram_story' | 'whatsapp' | 'telegram' | 'video_script';
  textRu: string;
  textKk: string;
  ctaTextRu: string;
  ctaTextKk: string;
  promoCode?: string;
}

export interface ImpactMetric {
  id: string;
  labelRu: string;
  labelKk: string;
  value: string | number;
  type: 'forecast' | 'demo_result' | 'verified_fact';
  change?: string;
  unit?: string;
}

export interface Tool {
  id: string;
  nameRu: string;
  nameKk: string;
  category: string;
  descriptionRu: string;
  descriptionKk: string;
  iconName: string;
  route: string;
  isBackendReady: boolean;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  type: 'signal' | 'campaign' | 'system';
}
