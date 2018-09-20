import tl = require("vsts-task-lib/task");

var taskJson = require("./task.json");
const area: string = "CreateCampaign";
var createsend = require("createsend-node");
var sleep = require("thread-sleep");
import * as fs from "fs";

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

async function run(): Promise<number>  {
    var promise = new Promise<number>(async (resolve, reject) => {

        try {
            const authenticationType: string = tl.getInput("CampaignMonitorAuthenticationType", true);
            const apiKey: string = tl.getInput("CampaignMonitorApiKey");
            const authToken: string = tl.getInput("CampaignMonitorAuthToken");
            const clientId: string = tl.getInput("CampaignMonitorClientId");
            const listId: string = tl.getInput("CampaignMonitorListId");
            const templateId: string = tl.getInput("CampaignMonitorTemplateId");
            const fromEmailAddress: string = tl.getInput("CampaignMonitorFromEmailAddress");
            const replyToEmailAddress: string = tl.getInput("CampaignMonitorReplyToEmailAddress");
            const campaignName: string = tl.getInput("CampaignMonitorCampaignName");
            const campaignSubject: string = tl.getInput("CampaignMonitorCampaignSubject");
            const previewRecipients: string = tl.getInput("CampaignMonitorPreviewRecipients");
            const fromName: string = tl.getInput("CampaignMonitorFromName");
            const singleLines: string = tl.getInput("CampaignMonitorSingleLines");
            const multipleLinesSourceType: string = tl.getInput("CampaignMonitorMultipleLinesSourceType");
            const multipleLinesInline: string = tl.getInput("CampaignMonitorMultipleLinesInline");
            const multipleLinesFilePath: string = tl.getInput("CampaignMonitorMultipleLinesFilePath");

            // Get the multiple lines text
            let multipleLines: string;

            switch (multipleLinesSourceType.toLowerCase()) {
                case "inline":
                    multipleLines = JSON.parse(multipleLinesInline);
                    break;
                case "file":
                    if (!fs.existsSync(multipleLinesFilePath)) {
                        reject(`Failed to locate the multiple lines file on disk ${multipleLinesFilePath}`);
                        return;
                    }

                    multipleLines = JSON.parse(fs.readFileSync(multipleLinesFilePath, "utf8"));
                    break;
                default:
                    throw "Failed to parse the argument [CampaignMonitorMultipleLinesSourceType], expected 'Inline' or 'File'.";
            }

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

            var details = {
                "Name": campaignName,    // name of the campaign
                "Subject": campaignSubject,       // subject of the campaign
                "FromName": fromName,       // "from" name
                "FromEmail": fromEmailAddress,      // "from" email address
                "ReplyTo": replyToEmailAddress,        // "reply to" email address
                "ListIDs": [listId], // array of lists to send the campaign to
                "TemplateID": templateId,     // id of the template
                "TemplateContent": {        // only an example, follow the instructions at https://www.campaignmonitor.com/api/campaigns/#creating-campaign-template to match your template
                    "Multilines": multipleLines,
                    "Singlelines": JSON.parse(singleLines)
                }
            };

            console.log(`Creating campaign...`);
            await api.campaigns.createFromTemplate(clientId, details, async (err, res) => {
                if (err) {
                    var errorMessage = getErrorMessage(err);
                    console.log(err);
                    reject(errorMessage);
                } else {
                    var campaignId = res.campaignId;
                    console.log(`Campaign created successfully with Id [${campaignId}]`);

                    if (previewRecipients) {
                        console.log(`Sending Preview...`);
                        var parsedRecipients = previewRecipients.split(",");

                        var previewDetails = {
                            "PreviewRecipients": parsedRecipients,
                            "Personalize": "Random"
                        };

                        var retries = 3;
                        var success = false;
                        var attempts = 0;
                        var errors = new Array<string>();

                        while (retries-- > 0 && success === false) {
                            attempts++;
                            console.log(`Sending preview: Attempt ${attempts} of ${attempts + retries}`);
                            await api.campaigns.sendPreview(campaignId, previewDetails, (err, res) => {
                                if (err) {
                                    var errorMessage = getErrorMessage(err);
                                    console.log(err);
                                    tl.warning(`Failed to send preview, retrying in 5 seconds...`);
                                    errors.push(errorMessage);
                                    sleep(5000);
                                } else {
                                    console.log(`Preview sent`);
                                    success = true;
                                    resolve(campaignId);
                                }
                            });
                        }

                        // Failed
                        tl.warning(`The campaign was created successfully, but sending the preview failed.`);

                        // manually set the output variable
                        tl.setVariable("CampaignMonitorCampaignId", campaignId);
                        reject(errors.join(", "));
                    } else {
                        resolve(campaignId);
                    }
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
            tl.setVariable("CampaignMonitorCampaignId", result.toString());
            tl.setResult(tl.TaskResult.Succeeded, "");
        }
    )
    .catch((err) => {
        publishEvent("reliability", { issueType: "error", errorMessage: JSON.stringify(err, Object.getOwnPropertyNames(err)) });
        tl.setResult(tl.TaskResult.Failed, err);
    });