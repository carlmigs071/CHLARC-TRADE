import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "C.H.L.A.R.C. Trade Guide",
        short_name: "CHLARC",
        description: "Personal crypto trading guide with buy/sell/hold signals and spike alerts.",
        theme_color: "#070b12",
        background_color: "#070b12",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.coingecko\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "coingecko-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              networkTimeoutSeconds: 8
            }
          }
        ]
      }
    })
  ],
  server: { host: true, port: 5173 }
});
