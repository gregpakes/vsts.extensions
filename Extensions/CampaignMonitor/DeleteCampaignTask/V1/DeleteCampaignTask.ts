import tl = require("vsts-task-lib/task");
const createsend = require("createsend-node");
var taskJson = require("./task.json");

const area: string = "DeleteCampaign";

function getDefaultProps() {
    var hostType = (tl.getVariable("SYSTEM.HOSTTYPE") || "").toLowerCase();
    return {
        hostType: hostType,
        definitionName: hostType === "release" ? tl.getVariable("RELEASE.DEFINITIONNAME") : tl.getVariable("BUILD.DEFINITIONNAME"),
        processId: hostType === "release" ? tl.getVariable("RELEASE.RELEASEID") : tl.getVariable("BUILD.BUILDID"),
        processUrl: hostType === "release" ? tl.getVariable("RELEASE.RELEASEWEBURL") : (tl.getVariable("SYSTEM.TEAMFOUNDATIONSERVERURI") + tl.getVariable("SYSTEM.TEAMPROJECT") + "/_build?buildId=" + tl.getVariable("BUILD.BUILDID")),
        taskDisplayName: tl.getVariable("TASK.DISPLAYNAME"),
        jobid: tl.getVariable("SYSTEM.JOBID"),
        agentVersion: tl.getVariable("AGENT.VERSION"),
        version: taskJson.version
    };
}

function publishEvent(feature, properties: any): void {
    try {
        var splitVersion = (process.env.AGENT_VERSION || "").split(".");
        var major = parseInt(splitVersion[0] || "0");
        var minor = parseInt(splitVersion[1] || "0");
        let telemetry = "";
        if (major > 2 || (major === 2 && minor >= 120)) {
            telemetry = `##vso[telemetry.publish area=${area};feature=${feature}]${JSON.stringify(Object.assign(getDefaultProps(), properties))}`;
        }
        else {
            if (feature === "reliability") {
                let reliabilityData = properties;
                telemetry = "##vso[task.logissue type=error;code=" + reliabilityData.issueType + ";agentVersion=" + tl.getVariable("Agent.Version") + ";taskId=" + area + "-" + JSON.stringify(taskJson.version) + ";]" + reliabilityData.errorMessage;
            }
        }
        console.log(telemetry);
    }
    catch (err) {
        tl.warning("Failed to log telemetry, error: " + err);
    }
}

function getErrorMessage(err): string {
    if (err) {
        if (err.Message) {
            return err.Message;
        }
    }

    return err;
}

async function run(): Promise<void>  {
    var promise = new Promise<void>(async (resolve, reject) => {
        try {
            const authenticationType: string = tl.getInput("CampaignMonitorAuthenticationType", true);
            const apiKey: string = tl.getInput("CampaignMonitorApiKey");
            const authToken: string = tl.getInput("CampaignMonitorAuthToken");
            const clientId: string = tl.getInput("CampaignMonitorClientId");
            const campaignId: string = tl.getInput("CampaignMonitorCampaignId", true);

            var opts = {};

            if (authenticationType.toLowerCase() === "apikey") {
                if (!apiKey) {
                    reject("Api Key was not supplied");
                    return;
                } else {
                    opts = {
                        apiKey: apiKey
                    };
                }
            } else if (authenticationType.toLowerCase() === "authtoken") {
                if (!authToken) {
                    reject("Auth Token was not supplied");
                    return;
                } else {
                    opts = {
                        accessToken: authToken
                    };
                }
            } else {
                reject(`AuthenticationType ${authenticationType} is invalid`);
                return;
            }

            var api = new createsend(opts);
            await api.campaigns.delete(campaignId, (err, res) => {
                if (err) {
                    var errorMessage = getErrorMessage(err);
                    console.log(err);
                    reject(errorMessage);
                } else {
                    console.log("Campaign deleted successfully.");
                    resolve();
                }
            });

        } catch (err) {
            reject(err);
        }
    });

    return promise;
}

run()
    .then((result) => {
            tl.setResult(tl.TaskResult.Succeeded, "");
        }
    )
    .catch((err) => {
        publishEvent("reliability", { issueType: "error", errorMessage: JSON.stringify(err, Object.getOwnPropertyNames(err)) });
        tl.setResult(tl.TaskResult.Failed, err);
    });