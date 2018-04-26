import path = require("path");
import tmrm = require("vsts-task-lib/mock-run");

let taskPath = path.join(__dirname, "..", "createcampaigntask.js");
let tr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

tr.setInput("CampaignMonitor.ApiKey", process.env["CampaignMonitor.ApiKey"]);

tr.run();