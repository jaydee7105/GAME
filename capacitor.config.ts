import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jaydee7105.planetdrop",
  appName: "Planet Drop",
  webDir: "dist",
  backgroundColor: "#0d0b22",
  android: {
    backgroundColor: "#0d0b22",
  },
  plugins: {
    StatusBar: { overlaysWebView: true, backgroundColor: "#00000000" },
  },
};

export default config;
