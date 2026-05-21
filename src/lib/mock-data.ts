export type Platform =
  | "google"
  | "square"
  | "booksy"
  | "fresha"
  | "acuity"
  | "calendly"
  | "steady";

export const PLATFORM_LABEL: Record<Platform, string> = {
  google: "Google",
  square: "Square",
  booksy: "Booksy",
  fresha: "Fresha",
  acuity: "Acuity",
  calendly: "Calendly",
  steady: "Steady",
};

export type Appointment = {
  id: string;
  /** minutes from midnight */
  start: number;
  /** minutes from midnight */
  end: number;
  client: string;
  service: string;
  price?: number;
  source: Platform;
  /** platforms the busy-block was pushed to */
  syncedTo: Platform[];
  isBlock?: boolean;
  note?: string;
};

export type PlatformConnection = {
  platform: Exclude<Platform, "steady">;
  connected: boolean;
  lastSyncMinutesAgo?: number;
  eventsPulled?: number;
  syncDirection: "two-way" | "pull" | "push" | "off";
};

export type Client = {
  id: string;
  name: string;
  phone: string;
  lastVisitDaysAgo: number;
  totalVisits: number;
  preferredService: string;
};

export type Service = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  color: string;
};

export const todayAppointments: Appointment[] = [
  {
    id: "a1",
    start: 9 * 60,
    end: 10 * 60 + 30,
    client: "Elena Rodriguez",
    service: "Full Color & Highlight",
    price: 180,
    source: "square",
    syncedTo: ["google", "booksy", "fresha"],
  },
  {
    id: "a2",
    start: 10 * 60 + 45,
    end: 11 * 60 + 30,
    client: "Marcus Chen",
    service: "Taper Fade",
    price: 45,
    source: "booksy",
    syncedTo: ["google", "square", "fresha"],
  },
  {
    id: "a3",
    start: 12 * 60,
    end: 12 * 60 + 45,
    client: "Lunch",
    service: "Personal break",
    source: "steady",
    syncedTo: ["google", "square", "booksy"],
    isBlock: true,
  },
  {
    id: "a4",
    start: 13 * 60,
    end: 14 * 60,
    client: "Sofia Patel",
    service: "Womens Cut & Style",
    price: 75,
    source: "fresha",
    syncedTo: ["google", "square"],
  },
  {
    id: "a5",
    start: 14 * 60 + 30,
    end: 15 * 60 + 15,
    client: "Jordan P.",
    service: "Fade & Beard Trim",
    price: 55,
    source: "booksy",
    syncedTo: ["google"],
  },
  {
    id: "a6",
    start: 14 * 60 + 30,
    end: 15 * 60 + 30,
    client: "David S.",
    service: "Men's Cut",
    price: 40,
    source: "square",
    syncedTo: ["google"],
  },
  {
    id: "a7",
    start: 15 * 60 + 30,
    end: 16 * 60 + 15,
    client: "Aisha Williams",
    service: "Box Braids Touch-up",
    price: 120,
    source: "acuity",
    syncedTo: ["google", "square"],
  },
  {
    id: "a8",
    start: 16 * 60 + 15,
    end: 17 * 60,
    client: "School Pickup",
    service: "Blocked: Personal",
    source: "google",
    syncedTo: ["square", "booksy", "fresha"],
    isBlock: true,
  },
];

export const platformConnections: PlatformConnection[] = [
  { platform: "google", connected: true, lastSyncMinutesAgo: 2, eventsPulled: 14, syncDirection: "two-way" },
  { platform: "square", connected: true, lastSyncMinutesAgo: 5, eventsPulled: 23, syncDirection: "two-way" },
  { platform: "booksy", connected: true, lastSyncMinutesAgo: 8, eventsPulled: 17, syncDirection: "two-way" },
  { platform: "fresha", connected: true, lastSyncMinutesAgo: 11, eventsPulled: 9, syncDirection: "two-way" },
  { platform: "acuity", connected: true, lastSyncMinutesAgo: 4, eventsPulled: 6, syncDirection: "two-way" },
  { platform: "calendly", connected: false, syncDirection: "off" },
];

export const clients: Client[] = [
  { id: "c1", name: "Elena Rodriguez", phone: "(415) 555-0142", lastVisitDaysAgo: 28, totalVisits: 14, preferredService: "Full Color & Highlight" },
  { id: "c2", name: "Marcus Chen", phone: "(415) 555-0119", lastVisitDaysAgo: 14, totalVisits: 22, preferredService: "Taper Fade" },
  { id: "c3", name: "Sofia Patel", phone: "(415) 555-0166", lastVisitDaysAgo: 35, totalVisits: 9, preferredService: "Womens Cut & Style" },
  { id: "c4", name: "Jordan P.", phone: "(415) 555-0188", lastVisitDaysAgo: 21, totalVisits: 6, preferredService: "Fade & Beard Trim" },
  { id: "c5", name: "Aisha Williams", phone: "(415) 555-0173", lastVisitDaysAgo: 42, totalVisits: 11, preferredService: "Box Braids" },
  { id: "c6", name: "David S.", phone: "(415) 555-0124", lastVisitDaysAgo: 7, totalVisits: 19, preferredService: "Men's Cut" },
];

export const services: Service[] = [
  { id: "s1", name: "Men's Cut", durationMin: 30, price: 40, color: "#3b82f6" },
  { id: "s2", name: "Taper Fade", durationMin: 45, price: 45, color: "#06b6d4" },
  { id: "s3", name: "Fade & Beard Trim", durationMin: 45, price: 55, color: "#0891b2" },
  { id: "s4", name: "Women's Cut & Style", durationMin: 60, price: 75, color: "#ec4899" },
  { id: "s5", name: "Full Color & Highlight", durationMin: 90, price: 180, color: "#a855f7" },
  { id: "s6", name: "Box Braids Touch-up", durationMin: 45, price: 120, color: "#f97316" },
];

export const workingHours = {
  monday: { open: "09:00", close: "18:00", enabled: true },
  tuesday: { open: "09:00", close: "18:00", enabled: true },
  wednesday: { open: "09:00", close: "19:00", enabled: true },
  thursday: { open: "09:00", close: "19:00", enabled: true },
  friday: { open: "09:00", close: "20:00", enabled: true },
  saturday: { open: "10:00", close: "17:00", enabled: true },
  sunday: { open: "10:00", close: "15:00", enabled: false },
};
