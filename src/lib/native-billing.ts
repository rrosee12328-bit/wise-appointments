import type {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
import type { BillingInterval, PaidBillingPlan } from "@/lib/billing";

export type NativePlatform = "web" | "ios" | "android";

export type NativePurchaseSelection = {
  plan: PaidBillingPlan;
  interval: BillingInterval;
  platform: Exclude<NativePlatform, "web">;
};

export type NativeBillingBridge = {
  purchaseSubscription: (selection: NativePurchaseSelection) => Promise<void>;
  restorePurchases: () => Promise<void>;
};

declare global {
  interface Window {
    JeyLinkMobileBilling?: NativeBillingBridge;
    Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean };
  }
}

let configuredUserId: string | null = null;
let isConfigured = false;

const REVENUECAT_IOS_PUBLIC_SDK_KEY = "appl_SpXcOJmDoNGXMXSnWvOPAAOkkOX";
const REVENUECAT_ANDROID_PUBLIC_SDK_KEY = "goog_xzpOgkdCotxKPRMCPwuuSfgUowk";

function envValue(name: string) {
  return (import.meta.env as Record<string, string | undefined>)[name]?.trim();
}

export function detectNativePlatform(): NativePlatform {
  if (typeof window === "undefined") return "web";
  const platform = window.Capacitor?.getPlatform?.();
  return platform === "ios" || platform === "android" ? platform : "web";
}

export function isNativeMobile() {
  return detectNativePlatform() !== "web";
}

function revenueCatApiKey(platform: Exclude<NativePlatform, "web">) {
  const key =
    platform === "ios"
      ? (envValue("VITE_REVENUECAT_IOS_API_KEY") ??
        envValue("VITE_REVENUECAT_API_KEY") ??
        REVENUECAT_IOS_PUBLIC_SDK_KEY)
      : (envValue("VITE_REVENUECAT_ANDROID_API_KEY") ??
        envValue("VITE_REVENUECAT_API_KEY") ??
        REVENUECAT_ANDROID_PUBLIC_SDK_KEY);
  if (!key) {
    throw new Error(
      `RevenueCat ${platform === "ios" ? "iOS" : "Android"} API key is not configured.`,
    );
  }
  return key;
}

function packageIds(plan: PaidBillingPlan, interval: BillingInterval) {
  const prefix = `VITE_REVENUECAT_PACKAGE_${plan.toUpperCase()}_${interval.toUpperCase()}`;
  const configured = envValue(prefix);
  return [
    configured,
    `${plan}_${interval}ly`,
    `${plan}_${interval}`,
    `jeylink_${plan}_${interval}ly`,
    `jeylink_${plan}_${interval}`,
  ].filter(Boolean) as string[];
}

async function purchasesModule() {
  return import("@revenuecat/purchases-capacitor");
}

export async function openExternalBillingUrl(url: string) {
  if (typeof window === "undefined") return;
  if (isNativeMobile()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.location.href = url;
}

async function ensureRevenueCatConfigured(userId: string) {
  const platform = detectNativePlatform();
  if (platform !== "ios" && platform !== "android") {
    throw new Error("RevenueCat purchases are only available in the iOS and Android apps.");
  }

  const { Purchases, LOG_LEVEL } = await purchasesModule();
  if (!isConfigured) {
    if (import.meta.env.DEV) {
      await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG }).catch(() => undefined);
    }
    await Purchases.configure({ apiKey: revenueCatApiKey(platform), appUserID: userId });
    configuredUserId = userId;
    isConfigured = true;
    return;
  }

  if (configuredUserId !== userId) {
    await Purchases.logIn({ appUserID: userId });
    configuredUserId = userId;
  }
}

function availablePackages(offerings: PurchasesOfferings) {
  const seen = new Set<string>();
  const packages = [
    ...(offerings.current?.availablePackages ?? []),
    ...Object.values(offerings.all).flatMap((offering) => offering.availablePackages),
  ];
  return packages.filter((pkg) => {
    const key = `${pkg.offeringIdentifier}:${pkg.identifier}:${pkg.product.identifier}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findPackage(
  offerings: PurchasesOfferings,
  selection: Pick<NativePurchaseSelection, "plan" | "interval">,
) {
  const ids = packageIds(selection.plan, selection.interval).map((id) => id.toLowerCase());
  const packages = availablePackages(offerings);
  const exact = packages.find((pkg) =>
    [pkg.identifier, pkg.product.identifier].some((value) => ids.includes(value.toLowerCase())),
  );
  if (exact) return exact;

  return packages.find((pkg) => {
    const haystack = `${pkg.identifier} ${pkg.product.identifier}`.toLowerCase();
    return haystack.includes(selection.plan) && haystack.includes(selection.interval);
  });
}

export async function purchaseNativeSubscription(
  userId: string,
  selection: NativePurchaseSelection,
) {
  await ensureRevenueCatConfigured(userId);
  const { Purchases } = await purchasesModule();
  const offerings = await Purchases.getOfferings();
  const selectedPackage = findPackage(offerings, selection);
  if (!selectedPackage) {
    throw new Error(
      `RevenueCat package is missing for ${selection.plan} ${selection.interval}. Add it to the current offering first.`,
    );
  }
  const result = await Purchases.purchasePackage({ aPackage: selectedPackage });
  return result.customerInfo;
}

export async function restoreNativePurchases(userId: string) {
  await ensureRevenueCatConfigured(userId);
  const { Purchases } = await purchasesModule();
  const result = await Purchases.restorePurchases();
  return result.customerInfo;
}

export function installNativeBillingBridge(
  userId: string,
  onCustomerInfoUpdated?: (customerInfo?: CustomerInfo) => void,
) {
  if (typeof window === "undefined" || !isNativeMobile()) return () => undefined;

  let active = true;
  let listenerId: string | null = null;

  window.JeyLinkMobileBilling = {
    purchaseSubscription: async (selection) => {
      const customerInfo = await purchaseNativeSubscription(userId, selection);
      onCustomerInfoUpdated?.(customerInfo);
    },
    restorePurchases: async () => {
      const customerInfo = await restoreNativePurchases(userId);
      onCustomerInfoUpdated?.(customerInfo);
    },
  };

  void ensureRevenueCatConfigured(userId)
    .then(async () => {
      if (!active) return;
      const { Purchases } = await purchasesModule();
      listenerId = await Purchases.addCustomerInfoUpdateListener((customerInfo) => {
        onCustomerInfoUpdated?.(customerInfo);
      });
    })
    .catch((error) => {
      console.warn("RevenueCat setup failed", error);
    });

  return () => {
    active = false;
    if (window.JeyLinkMobileBilling) delete window.JeyLinkMobileBilling;
    if (listenerId) {
      void purchasesModule().then(({ Purchases }) =>
        Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: listenerId! }).catch(
          () => undefined,
        ),
      );
    }
  };
}
