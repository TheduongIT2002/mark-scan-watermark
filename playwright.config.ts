import {defineConfig} from "@playwright/test";
export default defineConfig({testDir:"tests/e2e",webServer:{command:"npm run dev -- --port 3000",url:"http://localhost:3000",reuseExistingServer:false,env:{MARKSCAN_E2E_SCANNER:"1"}},use:{baseURL:"http://localhost:3000"}});
