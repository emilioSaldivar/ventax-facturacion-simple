import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/backoffice/",
  plugins: [react()],
  server: {
    port: 5174
  }
});

