import tl = require("vsts-task-lib/task");
import * as vstsInterfaces from "vso-node-api/interfaces/common/VsoBaseInterfaces";
import * as util from "./UtilFunctions";
import * as webApi from "vso-node-api/WebApi";
import { IReleaseApi } from "vso-node-api/ReleaseApi";
import { IBuildApi } from "vso-node-api/BuildApi";
import { Change } from "vso-node-api/interfaces/BuildInterfaces";

var taskJson = require("./task.json");
const area: string = "CheckBuildsCompleted";

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

async function run(): Promise<number>  {
    var promise = new Promise<number>(async (resolve, reject) => {

        try {
            let tpcUri = tl.getVariable("System.TeamFoundationCollectionUri");
            let releaseId: number = parseInt(tl.getVariable("Release.ReleaseId"));
            let teamProject = tl.getVariable("System.TeamProject");

            let credentialHandler: vstsInterfaces.IRequestHandler = util.getCredentialHandler();
            let vsts = new webApi.WebApi(tpcUri, credentialHandler);
            var releaseApi: IReleaseApi = await vsts.getReleaseApi();
            var buildApi: IBuildApi = await vsts.getBuildApi();

            console.log("Getting the current release details");
            var currentRelease = await releaseApi.getRelease(teamProject, releaseId);

            if (!currentRelease) {
                reject(`Unable to locate the current release with id ${releaseId}`);
                return;
            }

            var artifactsInThisRelease = util.getBuildArtifacts(currentRelease.artifacts);

            var AllChanges: Change[] = [];
            for (var artifact of artifactsInThisRelease) {
                console.log(`Looking at artifact [${artifact.alias}]`);

                var changes = await buildApi.getBuildChanges(teamProject, parseInt(artifact.definitionReference.version.id));
                console.log(`Found commits: ${changes.length}`);

                for (var change of changes) {
                    if (!AllChanges.some(x => x.id === change.id)) {
                        AllChanges.push(change);
                    }
                }
            }

            console.log(`Found [${AllChanges.length}] changes`);
            for (var allChange of AllChanges) {

            }

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