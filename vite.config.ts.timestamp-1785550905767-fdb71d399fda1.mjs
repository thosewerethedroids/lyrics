// vite.config.ts
import { defineConfig } from "file:///sessions/cool-quirky-dijkstra/mnt/lyrics/V2/node_modules/vitest/dist/config.js";
import react from "file:///sessions/cool-quirky-dijkstra/mnt/lyrics/V2/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///sessions/cool-quirky-dijkstra/mnt/lyrics/V2/node_modules/vite-plugin-pwa/dist/index.js";
var base = process.env.VITE_BASE ?? "/";
var vite_config_default = defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // Ship new versions silently: a musician mid-set should never see an "update available"
      // prompt, and the app shell is small enough that a background swap is safe.
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Lyrics Binder",
        short_name: "Binder",
        description: "Your setlists and lyrics \u2014 offline, full screen, on stage.",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "any",
        start_url: base,
        scope: base,
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        // Precache the whole app shell so a cold launch in airplane mode still boots.
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"],
        navigateFallback: "index.html",
        // GitHub API calls must always hit the network — never serve a stale library from the SW
        // cache. IndexedDB is the offline source of truth, not the HTTP cache.
        navigateFallbackDenylist: [/github\.com/, /api\.github\.com/],
        cleanupOutdatedCaches: true
      },
      devOptions: {
        // Keep the service worker out of `vite dev`; it only complicates local iteration.
        enabled: false
      }
    })
  ],
  build: {
    target: "es2020",
    sourcemap: true
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvY29vbC1xdWlya3ktZGlqa3N0cmEvbW50L2x5cmljcy9WMlwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL3Nlc3Npb25zL2Nvb2wtcXVpcmt5LWRpamtzdHJhL21udC9seXJpY3MvVjIvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3Nlc3Npb25zL2Nvb2wtcXVpcmt5LWRpamtzdHJhL21udC9seXJpY3MvVjIvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlc3QvY29uZmlnJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJztcblxuLy8gYGJhc2VgIG1hdHRlcnMgZm9yIEdpdEh1YiBQYWdlcywgd2hpY2ggc2VydmVzIGEgcHJvamVjdCBzaXRlIGZyb20gLzxyZXBvPi8uXG4vLyBDbG91ZGZsYXJlIFBhZ2VzIHNlcnZlcyBmcm9tIHRoZSByb290LCBzbyB0aGUgZGVmYXVsdCBzdGF5cyAnLycuXG4vLyBTZXQgVklURV9CQVNFPS9seXJpY3MtYmluZGVyLyBpbiB0aGUgR2l0SHViIFBhZ2VzIGJ1aWxkIGlmIHlvdSBnbyB0aGF0IHJvdXRlLlxuY29uc3QgYmFzZSA9IHByb2Nlc3MuZW52LlZJVEVfQkFTRSA/PyAnLyc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIGJhc2UsXG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIFZpdGVQV0Eoe1xuICAgICAgLy8gU2hpcCBuZXcgdmVyc2lvbnMgc2lsZW50bHk6IGEgbXVzaWNpYW4gbWlkLXNldCBzaG91bGQgbmV2ZXIgc2VlIGFuIFwidXBkYXRlIGF2YWlsYWJsZVwiXG4gICAgICAvLyBwcm9tcHQsIGFuZCB0aGUgYXBwIHNoZWxsIGlzIHNtYWxsIGVub3VnaCB0aGF0IGEgYmFja2dyb3VuZCBzd2FwIGlzIHNhZmUuXG4gICAgICByZWdpc3RlclR5cGU6ICdhdXRvVXBkYXRlJyxcbiAgICAgIGluamVjdFJlZ2lzdGVyOiAnYXV0bycsXG4gICAgICBpbmNsdWRlQXNzZXRzOiBbJ2Zhdmljb24uc3ZnJywgJ2FwcGxlLXRvdWNoLWljb24ucG5nJ10sXG4gICAgICBtYW5pZmVzdDoge1xuICAgICAgICBuYW1lOiAnTHlyaWNzIEJpbmRlcicsXG4gICAgICAgIHNob3J0X25hbWU6ICdCaW5kZXInLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1lvdXIgc2V0bGlzdHMgYW5kIGx5cmljcyBcdTIwMTQgb2ZmbGluZSwgZnVsbCBzY3JlZW4sIG9uIHN0YWdlLicsXG4gICAgICAgIHRoZW1lX2NvbG9yOiAnIzAwMDAwMCcsXG4gICAgICAgIGJhY2tncm91bmRfY29sb3I6ICcjMDAwMDAwJyxcbiAgICAgICAgZGlzcGxheTogJ3N0YW5kYWxvbmUnLFxuICAgICAgICBvcmllbnRhdGlvbjogJ2FueScsXG4gICAgICAgIHN0YXJ0X3VybDogYmFzZSxcbiAgICAgICAgc2NvcGU6IGJhc2UsXG4gICAgICAgIGljb25zOiBbXG4gICAgICAgICAgeyBzcmM6ICdwd2EtMTkyeDE5Mi5wbmcnLCBzaXplczogJzE5MngxOTInLCB0eXBlOiAnaW1hZ2UvcG5nJyB9LFxuICAgICAgICAgIHsgc3JjOiAncHdhLTUxMng1MTIucG5nJywgc2l6ZXM6ICc1MTJ4NTEyJywgdHlwZTogJ2ltYWdlL3BuZycgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBzcmM6ICdtYXNrYWJsZS01MTJ4NTEyLnBuZycsXG4gICAgICAgICAgICBzaXplczogJzUxMng1MTInLFxuICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXG4gICAgICAgICAgICBwdXJwb3NlOiAnbWFza2FibGUnLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAgd29ya2JveDoge1xuICAgICAgICAvLyBQcmVjYWNoZSB0aGUgd2hvbGUgYXBwIHNoZWxsIHNvIGEgY29sZCBsYXVuY2ggaW4gYWlycGxhbmUgbW9kZSBzdGlsbCBib290cy5cbiAgICAgICAgZ2xvYlBhdHRlcm5zOiBbJyoqLyoue2pzLGNzcyxodG1sLHN2Zyxwbmcsd29mZix3b2ZmMn0nXSxcbiAgICAgICAgbmF2aWdhdGVGYWxsYmFjazogJ2luZGV4Lmh0bWwnLFxuICAgICAgICAvLyBHaXRIdWIgQVBJIGNhbGxzIG11c3QgYWx3YXlzIGhpdCB0aGUgbmV0d29yayBcdTIwMTQgbmV2ZXIgc2VydmUgYSBzdGFsZSBsaWJyYXJ5IGZyb20gdGhlIFNXXG4gICAgICAgIC8vIGNhY2hlLiBJbmRleGVkREIgaXMgdGhlIG9mZmxpbmUgc291cmNlIG9mIHRydXRoLCBub3QgdGhlIEhUVFAgY2FjaGUuXG4gICAgICAgIG5hdmlnYXRlRmFsbGJhY2tEZW55bGlzdDogWy9naXRodWJcXC5jb20vLCAvYXBpXFwuZ2l0aHViXFwuY29tL10sXG4gICAgICAgIGNsZWFudXBPdXRkYXRlZENhY2hlczogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBkZXZPcHRpb25zOiB7XG4gICAgICAgIC8vIEtlZXAgdGhlIHNlcnZpY2Ugd29ya2VyIG91dCBvZiBgdml0ZSBkZXZgOyBpdCBvbmx5IGNvbXBsaWNhdGVzIGxvY2FsIGl0ZXJhdGlvbi5cbiAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICB9LFxuICAgIH0pLFxuICBdLFxuICBidWlsZDoge1xuICAgIHRhcmdldDogJ2VzMjAyMCcsXG4gICAgc291cmNlbWFwOiB0cnVlLFxuICB9LFxuICB0ZXN0OiB7XG4gICAgZW52aXJvbm1lbnQ6ICdub2RlJyxcbiAgICBnbG9iYWxzOiB0cnVlLFxuICAgIGluY2x1ZGU6IFsnc3JjLyoqLyoudGVzdC50cyddLFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXNULFNBQVMsb0JBQW9CO0FBQ25WLE9BQU8sV0FBVztBQUNsQixTQUFTLGVBQWU7QUFLeEIsSUFBTSxPQUFPLFFBQVEsSUFBSSxhQUFhO0FBRXRDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixRQUFRO0FBQUE7QUFBQTtBQUFBLE1BR04sY0FBYztBQUFBLE1BQ2QsZ0JBQWdCO0FBQUEsTUFDaEIsZUFBZSxDQUFDLGVBQWUsc0JBQXNCO0FBQUEsTUFDckQsVUFBVTtBQUFBLFFBQ1IsTUFBTTtBQUFBLFFBQ04sWUFBWTtBQUFBLFFBQ1osYUFBYTtBQUFBLFFBQ2IsYUFBYTtBQUFBLFFBQ2Isa0JBQWtCO0FBQUEsUUFDbEIsU0FBUztBQUFBLFFBQ1QsYUFBYTtBQUFBLFFBQ2IsV0FBVztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFVBQ0wsRUFBRSxLQUFLLG1CQUFtQixPQUFPLFdBQVcsTUFBTSxZQUFZO0FBQUEsVUFDOUQsRUFBRSxLQUFLLG1CQUFtQixPQUFPLFdBQVcsTUFBTSxZQUFZO0FBQUEsVUFDOUQ7QUFBQSxZQUNFLEtBQUs7QUFBQSxZQUNMLE9BQU87QUFBQSxZQUNQLE1BQU07QUFBQSxZQUNOLFNBQVM7QUFBQSxVQUNYO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFNBQVM7QUFBQTtBQUFBLFFBRVAsY0FBYyxDQUFDLHVDQUF1QztBQUFBLFFBQ3RELGtCQUFrQjtBQUFBO0FBQUE7QUFBQSxRQUdsQiwwQkFBMEIsQ0FBQyxlQUFlLGtCQUFrQjtBQUFBLFFBQzVELHVCQUF1QjtBQUFBLE1BQ3pCO0FBQUEsTUFDQSxZQUFZO0FBQUE7QUFBQSxRQUVWLFNBQVM7QUFBQSxNQUNYO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsV0FBVztBQUFBLEVBQ2I7QUFBQSxFQUNBLE1BQU07QUFBQSxJQUNKLGFBQWE7QUFBQSxJQUNiLFNBQVM7QUFBQSxJQUNULFNBQVMsQ0FBQyxrQkFBa0I7QUFBQSxFQUM5QjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
