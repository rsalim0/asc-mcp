import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";

// App Privacy details (nutrition label) are not exposed via the public ASC API as of 2026 —
// they must be edited in the App Store Connect web UI. This file is intentionally a no-op.
export function privacyTools(_client: AscClient): ToolDef[] {
  return [];
}
