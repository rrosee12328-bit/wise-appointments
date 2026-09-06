import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "co.jeylink.app",
  appName: "Jey Link",
  webDir: "dist/client",
  server: {
    url: process.env.CAPACITOR_SERVER_URL ?? "https://jeylink.co",
    cleartext: false,
  },
};

export default config;
