// OpenNext adapter config for Cloudflare Workers.
// The app has no ISR or fetch-cache needs (everything is rendered client-side
// and the one API route streams live), so no incremental cache is configured.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
