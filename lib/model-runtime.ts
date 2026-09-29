import {
  createAgentSessionServices,
  getAgentDir,
  type ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { projectTrustReloadOptions } from "./project-trust";
import { syncCopilotModels } from "./copilot-discovery";

/**
 * The picker, enabled-model catalog and default validation must use the same
 * project-aware inventory, including directly discovered Copilot models.
 * This deliberately does not apply enabledModels: only the picker/default
 * validator scopes the inventory; the catalog needs disabled rows too.
 */
export async function createModelSelectionServices(cwd: string, { forceCopilot = false } = {}) {
  const agentDir = getAgentDir();
  const trustReloadOptions = projectTrustReloadOptions(cwd, agentDir);
  const services = await createAgentSessionServices({
    cwd,
    agentDir,
    ...(trustReloadOptions ? { resourceLoaderReloadOptions: trustReloadOptions } : {}),
  });
  const copilotCatalog = await syncCopilotModels(services.modelRuntime, {
    force: forceCopilot,
    background: !forceCopilot,
  });
  return { ...services, copilotCatalog };
}

/**
 * Global extension providers for auth routes. The agent dir acts as cwd so
 * project-local extensions stay out. Fresh credentials, no direct discovery.
 */
export async function createModelRuntimeWithExtensions(): Promise<ModelRuntime> {
  const agentDir = getAgentDir();
  const services = await createAgentSessionServices({ cwd: agentDir, agentDir });
  return services.modelRuntime;
}
