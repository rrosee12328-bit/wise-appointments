export type PlatformId =
  | "square"
  | "booksy"
  | "thecut"
  | "setmore"
  | "google"
  | "outlook"
  | "squire"
  | "vagaro"
  | "barberly"
  | "ringmybarber"
  | "goldie"
  | "glossgenius"
  | "styleseat"
  | "fresha"
  | "mangomint"
  | "boulevard"
  | "zenoti"
  | "acuity"
  | "calendly"
  | "simplybook"
  | "zoho"
  | "cliniko";

export const PLATFORMS: Record<
  PlatformId,
  {
    id: PlatformId;
    label: string;
    colorVar: string;
    colorClass: string;
    borderClass: string;
    domain: string;
  }
> = {
  square: {
    id: "square",
    label: "Square",
    colorVar: "var(--platform-square)",
    colorClass: "bg-platform-square/15 text-platform-square",
    borderClass: "border-l-platform-square",
    domain: "squareup.com",
  },
  booksy: {
    id: "booksy",
    label: "Booksy",
    colorVar: "var(--platform-booksy)",
    colorClass: "bg-platform-booksy/15 text-platform-booksy",
    borderClass: "border-l-platform-booksy",
    domain: "booksy.com",
  },
  thecut: {
    id: "thecut",
    label: "TheCut",
    colorVar: "var(--platform-thecut)",
    colorClass: "bg-platform-thecut/15 text-platform-thecut",
    borderClass: "border-l-platform-thecut",
    domain: "thecut.co",
  },
  setmore: {
    id: "setmore",
    label: "Setmore",
    colorVar: "var(--platform-setmore)",
    colorClass: "bg-platform-setmore/15 text-platform-setmore",
    borderClass: "border-l-platform-setmore",
    domain: "setmore.com",
  },
  google: {
    id: "google",
    label: "Google Calendar",
    colorVar: "var(--platform-google)",
    colorClass: "bg-platform-google/15 text-platform-google",
    borderClass: "border-l-platform-google",
    domain: "calendar.google.com",
  },
  outlook: {
    id: "outlook",
    label: "Outlook Calendar",
    colorVar: "var(--platform-outlook, #0078D4)",
    colorClass: "bg-platform-outlook/15 text-platform-outlook",
    borderClass: "border-l-platform-outlook",
    domain: "outlook.live.com",
  },
  squire: {
    id: "squire",
    label: "SQUIRE",
    colorVar: "var(--platform-squire)",
    colorClass: "bg-platform-squire/15 text-platform-squire",
    borderClass: "border-l-platform-squire",
    domain: "getsquire.com",
  },
  vagaro: {
    id: "vagaro",
    label: "Vagaro",
    colorVar: "var(--platform-vagaro)",
    colorClass: "bg-platform-vagaro/15 text-platform-vagaro",
    borderClass: "border-l-platform-vagaro",
    domain: "vagaro.com",
  },
  barberly: {
    id: "barberly",
    label: "Barberly",
    colorVar: "var(--platform-barberly)",
    colorClass: "bg-platform-barberly/15 text-platform-barberly",
    borderClass: "border-l-platform-barberly",
    domain: "barberly.com",
  },
  ringmybarber: {
    id: "ringmybarber",
    label: "Ring My Barber",
    colorVar: "var(--platform-ringmybarber)",
    colorClass: "bg-platform-ringmybarber/15 text-platform-ringmybarber",
    borderClass: "border-l-platform-ringmybarber",
    domain: "ringmybarber.com",
  },
  goldie: {
    id: "goldie",
    label: "Goldie",
    colorVar: "var(--platform-goldie)",
    colorClass: "bg-platform-goldie/15 text-platform-goldie",
    borderClass: "border-l-platform-goldie",
    domain: "heygoldie.com",
  },
  glossgenius: {
    id: "glossgenius",
    label: "GlossGenius",
    colorVar: "var(--platform-glossgenius)",
    colorClass: "bg-platform-glossgenius/15 text-platform-glossgenius",
    borderClass: "border-l-platform-glossgenius",
    domain: "glossgenius.com",
  },
  styleseat: {
    id: "styleseat",
    label: "StyleSeat",
    colorVar: "var(--platform-styleseat)",
    colorClass: "bg-platform-styleseat/15 text-platform-styleseat",
    borderClass: "border-l-platform-styleseat",
    domain: "styleseat.com",
  },
  fresha: {
    id: "fresha",
    label: "Fresha",
    colorVar: "var(--platform-fresha)",
    colorClass: "bg-platform-fresha/15 text-platform-fresha",
    borderClass: "border-l-platform-fresha",
    domain: "fresha.com",
  },
  mangomint: {
    id: "mangomint",
    label: "Mangomint",
    colorVar: "var(--platform-mangomint)",
    colorClass: "bg-platform-mangomint/15 text-platform-mangomint",
    borderClass: "border-l-platform-mangomint",
    domain: "mangomint.com",
  },
  boulevard: {
    id: "boulevard",
    label: "Boulevard",
    colorVar: "var(--platform-boulevard)",
    colorClass: "bg-platform-boulevard/15 text-platform-boulevard",
    borderClass: "border-l-platform-boulevard",
    domain: "joinblvd.com",
  },
  zenoti: {
    id: "zenoti",
    label: "Zenoti",
    colorVar: "var(--platform-zenoti)",
    colorClass: "bg-platform-zenoti/15 text-platform-zenoti",
    borderClass: "border-l-platform-zenoti",
    domain: "zenoti.com",
  },
  acuity: {
    id: "acuity",
    label: "Acuity",
    colorVar: "var(--platform-acuity)",
    colorClass: "bg-platform-acuity/15 text-platform-acuity",
    borderClass: "border-l-platform-acuity",
    domain: "acuityscheduling.com",
  },
  calendly: {
    id: "calendly",
    label: "Calendly",
    colorVar: "var(--platform-calendly)",
    colorClass: "bg-platform-calendly/15 text-platform-calendly",
    borderClass: "border-l-platform-calendly",
    domain: "calendly.com",
  },
  simplybook: {
    id: "simplybook",
    label: "SimplyBook.me",
    colorVar: "var(--platform-simplybook)",
    colorClass: "bg-platform-simplybook/15 text-platform-simplybook",
    borderClass: "border-l-platform-simplybook",
    domain: "simplybook.me",
  },
  zoho: {
    id: "zoho",
    label: "Zoho Bookings",
    colorVar: "var(--platform-zoho)",
    colorClass: "bg-platform-zoho/15 text-platform-zoho",
    borderClass: "border-l-platform-zoho",
    domain: "zoho.com",
  },
  cliniko: {
    id: "cliniko",
    label: "Cliniko",
    colorVar: "var(--platform-cliniko)",
    colorClass: "bg-platform-cliniko/15 text-platform-cliniko",
    borderClass: "border-l-platform-cliniko",
    domain: "cliniko.com",
  },
};

export function platformLogoUrl(id: PlatformId): string {
  return `https://www.google.com/s2/favicons?sz=128&domain=${PLATFORMS[id].domain}`;
}

/**
 * Integration tier for each booking platform.
 *
 * - `direct_full`: Jey Link reads and writes via the platform's API (true 2-way sync).
 * - `direct_read`: Jey Link reads from the platform's API. Reschedules done in
 *   Jey Link block the new slot on Google/Outlook but do NOT move the original
 *   booking inside that platform.
 * - `relay_only`: No direct API integration. Bookings only appear in Jey Link
 *   if the user connects the platform to Google or Outlook Calendar AND
 *   connects that calendar here, so the events flow through as calendar events.
 */
export type PlatformTier = "direct_full" | "direct_read" | "relay_only";

export const PLATFORM_TIER: Record<PlatformId, PlatformTier> = {
  google: "direct_full",
  outlook: "direct_full",
  square: "direct_read",
  calendly: "direct_read",
  acuity: "direct_read",
  zoho: "direct_read",
  cliniko: "direct_read",
  zenoti: "direct_read",
  booksy: "relay_only",
  thecut: "relay_only",
  setmore: "relay_only",
  squire: "relay_only",
  vagaro: "relay_only",
  barberly: "relay_only",
  ringmybarber: "relay_only",
  goldie: "relay_only",
  glossgenius: "relay_only",
  styleseat: "relay_only",
  fresha: "relay_only",
  mangomint: "relay_only",
  boulevard: "relay_only",
  simplybook: "relay_only",
};

export function tierNote(id: PlatformId): string {
  const label = PLATFORMS[id].label;
  switch (PLATFORM_TIER[id]) {
    case "direct_full":
      return "Two-way sync — reads bookings and pushes reschedules directly.";
    case "direct_read":
      return `Read-only sync. Reschedules from Jey Link block the new slot on Google/Outlook but won't move the original booking in ${label}.`;
    case "relay_only":
      return `No direct connection to ${label}. Connect ${label} to your Google or Outlook Calendar so its bookings flow through — Jey Link reads them from there.`;
  }
}

export function tierShortLabel(id: PlatformId): string {
  switch (PLATFORM_TIER[id]) {
    case "direct_full":
      return "Two-way sync";
    case "direct_read":
      return "Read-only sync";
    case "relay_only":
      return "Via Google / Outlook";
  }
}

/** Relay-only platforms that also expose a public iCal feed (`.ics` URL) we
 *  can poll directly, bypassing the Google/Outlook relay. */
export const ICAL_SUPPORTED_PLATFORMS: ReadonlySet<PlatformId> = new Set([
  "booksy",
  "fresha",
  "vagaro",
]);

export function supportsIcal(id: PlatformId): boolean {
  return ICAL_SUPPORTED_PLATFORMS.has(id);
}

/** Per-platform copy for finding the iCal export URL. */
export const ICAL_INSTRUCTIONS: Record<string, { steps: string[]; helpUrl?: string }> = {
  booksy: {
    steps: [
      "Open Booksy Biz on web → Settings → Calendar",
      "Find the “Calendar sync” or “Export calendar” section",
      "Copy the iCal/ICS URL it shows you",
    ],
    helpUrl: "https://booksy.com/biz/help",
  },
  fresha: {
    steps: [
      "Open Fresha dashboard → Settings → Calendar sync",
      "Choose “Add to external calendar” → iCal feed",
      "Copy the link that ends in .ics",
    ],
    helpUrl: "https://partners.fresha.com/help",
  },
  vagaro: {
    steps: [
      "Open Vagaro → Settings → Calendar Sync",
      "Enable “Subscribe to your calendar” and copy the URL",
      "Make sure the URL starts with webcal:// or https://",
    ],
    helpUrl: "https://sup.vagaro.com",
  },
};
