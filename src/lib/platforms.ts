export type PlatformId =
  | "square"
  | "booksy"
  | "thecut"
  | "setmore"
  | "google"
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
