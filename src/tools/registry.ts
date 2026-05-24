import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";
import { pingTools } from "./ping.js";
import { appsTools } from "./apps.js";
import { versionsTools } from "./versions.js";
import { buildsTools } from "./builds.js";
import { testflightTools } from "./testflight.js";
import { reviewsTools } from "./reviews.js";
import { iapTools } from "./iap.js";
import { pricingTools } from "./pricing.js";
import { reportsTools } from "./reports.js";
import { usersTools } from "./users.js";
import { provisioningTools } from "./provisioning.js";
import { privacyTools } from "./privacy.js";
import { screenshotsTools } from "./screenshots.js";
import { workflowsTools } from "./workflows.js";
import { runnerTools } from "./runner.js";

export function allTools(client: AscClient): ToolDef[] {
  return [
    ...pingTools(client),
    ...appsTools(client),
    ...versionsTools(client),
    ...buildsTools(client),
    ...testflightTools(client),
    ...reviewsTools(client),
    ...iapTools(client),
    ...pricingTools(client),
    ...reportsTools(client),
    ...usersTools(client),
    ...provisioningTools(client),
    ...privacyTools(client),
    ...screenshotsTools(client),
    ...workflowsTools(client),
    ...runnerTools(client),
  ];
}
