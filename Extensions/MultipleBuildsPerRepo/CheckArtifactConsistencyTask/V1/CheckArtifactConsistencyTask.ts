import tl = require("vsts-task-lib/task");
import * as vstsInterfaces from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces";
import * as util from "./UtilFunctions";
import * as webApi from "azure-devops-node-api/WebApi";
import { IReleaseApi } from "azure-devops-node-api/ReleaseApi";
import { IBuildApi } from "azure-devops-node-api/BuildApi";
import { Change, BuildResult, BuildStatus } from "azure-devops-node-api/interfaces/BuildInterfaces";
import { GitStatus } from "azure-devops-node-api/interfaces/GitInterfaces";
import { IGitApi } from "azure-devops-node-api/GitApi";
import { GitPullRequestQuery, GitPullRequestQueryInput, GitPullRequestQueryType, GitPullRequest } from "azure-devops-node-api/interfaces/GitInterfaces";
import { ReleaseStatus, ReleaseUpdateMetadata } from "azure-devops-node-api/interfaces/ReleaseInterfaces";
import { reject, resolve } from "q";

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
            var gitApi: IGitApi = await vsts.getGitApi();

            console.log("Getting the current release details");
            var currentRelease = await releaseApi.getRelease(teamProject, releaseId);

            if (!currentRelease) {
                reject(`Unable to locate the current release with id ${releaseId}`);
                return;
            }

            var artifactsInThisRelease = util.getBuildArtifacts(currentRelease.artifacts);

            var allPrs: GitPullRequest[] = [];
            for (var artifact of artifactsInThisRelease) {
                console.log(`Artifact: [${artifact.alias}] - ${artifact.definitionReference.version.name}`);

                var buildId = artifact.definitionReference.version.id;

                var build = await buildApi.getBuild(parseInt(buildId), teamProject);

                if (build) {
                    console.log(`\tBuild ${build.buildNumber} was built from commit: ${build.sourceVersion}`);

                    // Get the commit for this build
                    tl.debug("\tGetting statuses...");
                    tl.debug(`\t\tBuild Source Version: ${build.sourceVersion}`);
                    tl.debug(`\t\tBuild Repository Id: ${build.repository.id}`);
                    tl.debug(`\t\tBuild Project Name: ${build.project.name}`);
                    var statuses = await gitApi.getStatuses(build.sourceVersion, build.repository.id, build.project.name, 1000, 0, false);
                    tl.debug("\tDone.");

                    if (statuses) {
                        // Get the build statuses
                        var buildStatuses = statuses.filter(status => status.context.genre === "continuous-integration");
                    } else {
                        buildStatuses = [];
                    }

                    // remove duplicates
                    buildStatuses = buildStatuses.filter((thing, index, self) =>
                        index === self.findIndex((t) => (
                        t.targetUrl === thing.targetUrl
                        ))
                    );

                    console.log(`\tFound ${buildStatuses.length} other builds`);

                    for (var i = 0; i < buildStatuses.length; i++) {
                        var buildStatus = buildStatuses[i];
                        var buildFromStatus = await util.getBuildFromTargetUrl(buildApi, buildStatus.targetUrl, build.project.name);

                        if(buildFromStatus.message) {
                            console.log(`\t - Error fetching build ${buildStatus.targetUrl}: ${buildFromStatus.message}`);
                            continue;
                        }

                        // Check that this build definition is actually an artifact
                        if (!util.buildDefinitionExistsInArtifacts(buildFromStatus.definition.id, artifactsInThisRelease)) {
                            console.log(`\t - Skipping build definition ${buildFromStatus.definition.name} - ${buildFromStatus.buildNumber} as it is not an artifact in this release.`);
                            continue;
                        }

                        if (build.definition.id === buildFromStatus.definition.id) {
                            console.log(`\t - Skipping build definition ${buildFromStatus.definition.name} - ${buildFromStatus.buildNumber} as we already have the artifact for this build.`);
                            continue;
                        }

                        if (build.sourceBranch !== buildFromStatus.sourceBranch) {
                            console.log(`\t - Skipping build definition ${buildFromStatus.definition.name} - ${buildFromStatus.buildNumber}.  Expected branch ${build.sourceBranch}, found ${buildFromStatus.sourceBranch}.`);
                            continue;
                        }

                        if (util.buildExistsInArtifacts(buildFromStatus, artifactsInThisRelease)) {
                            console.log(`\t - Skipping build definition ${buildFromStatus.definition.name} - ${buildFromStatus.buildNumber}.  This build is already an artifact.`);
                            continue;
                        }

                        // We need to check that the actual artifact corresponding to this build is not newer than this build
                        if (await util.isBuildNewerThanArtifact(gitApi, buildApi, buildFromStatus, artifactsInThisRelease) === false) {
                            console.log(`\t - Skipping build definition ${buildFromStatus.definition.name} - ${buildFromStatus.buildNumber}. The build in the artifact is newer than this build.`);
                            continue;
                        }

                        console.log(`\t - Found: ${buildFromStatus.definition.name} - ${buildFromStatus.buildNumber}`);

                        // Check the build status
                        if (buildFromStatus.status !== 2) { // Completed
                            var statusOfBuild = BuildStatus[buildFromStatus.status];
                            console.log(`\t - Status: ${statusOfBuild}`);
                            reject(`Detected build with status ${statusOfBuild}`);
                            return;
                        }

                        var buildResult = BuildResult[buildFromStatus.result];
                        if (!buildResult) {
                            reject(`Failed to parse the build result [${buildFromStatus.result}]... failing`);
                            return;
                        }

                        console.log(`\t - Status: ${buildResult}`);

                        if (buildFromStatus.result === 8 || buildFromStatus.result === 0) {
                            reject(`Detected failed build ${buildFromStatus.definition.name} - ${buildFromStatus.buildNumber} - Status: ${buildResult}`);
                            return;
                        }
                    }
                } else {
                    console.log(`Failed to locate build id [${buildId}]`);
                }
            }
            resolve();
        } catch (err) {
            tl.error(err);
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
    .catch(async (err) => {
        publishEvent("reliability", { issueType: "error", errorMessage: JSON.stringify(err, Object.getOwnPropertyNames(err)) });
        tl.setResult(tl.TaskResult.Failed, err);

        try {
            // Attempt to abandon release
            let abandonOnFailure = tl.getBoolInput("abandonreleaseonfailure");

            if (abandonOnFailure) {
                let tpcUri = tl.getVariable("System.TeamFoundationCollectionUri");
                let releaseId: number = parseInt(tl.getVariable("Release.ReleaseId"));
                let teamProject = tl.getVariable("System.TeamProject");

                let credentialHandler: vstsInterfaces.IRequestHandler = util.getCredentialHandler();
                let vsts = new webApi.WebApi(tpcUri, credentialHandler);
                var releaseApi: IReleaseApi = await vsts.getReleaseApi();

                let metatdata: ReleaseUpdateMetadata = <ReleaseUpdateMetadata>
                {
                    comment: "Abandoned by [Check Artifact Consistency Task]",
                    status: ReleaseStatus.Abandoned
                };

                var release = await releaseApi.updateReleaseResource(metatdata, teamProject, releaseId);

                console.log(`Abandoned release.`);
                resolve("Abandoned Release");
            }
        } catch (abandonErr) {
            reject(err);
        }
    });