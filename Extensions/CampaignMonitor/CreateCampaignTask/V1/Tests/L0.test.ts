import * as ttm from "vsts-task-lib/mock-test";
import tl = require("vsts-task-lib");
import * as path from "path";

test("Test test", () => {
    let tp = path.join(__dirname, "TestSetup.js");
    let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);
    delete process.env["CampaignMonitor.ApiKey"];
    tr.run();

    expect(tr.succeeded).toBe(false);
});