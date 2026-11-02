import { resumeDelayedRun } from "./flows/engine";
import { setHandlers } from "./queue";
import { runBroadcast } from "./services/broadcasts";
import { deliverIntegration } from "./services/integrations";
import { processLeadgenJob } from "./services/leads";

export function registerJobHandlers() {
  setHandlers({
    "broadcast.send": runBroadcast,
    "flow.resume": resumeDelayedRun,
    "integration.deliver": deliverIntegration,
    "lead.process": processLeadgenJob,
  });
}
