import tl = require("vsts-task-lib/task");
import * as vstsInterfaces from "vso-node-api/interfaces/common/VsoBaseInterfaces";
import * as util from "./UtilFunctions";
import * as webApi from "vso-node-api/WebApi";
import { IReleaseApi } from "vso-node-api/ReleaseApi";
import { IBuildApi } from "vso-node-api/BuildApi";
import { Change } from "vso-node-api/interfaces/BuildInterfaces";
import { IGitApi } from "vso-node-api/GitApi"
import { GitPullRequestQuery, 
    GitPullRequestQueryInput, 
    GitPullRequestQueryType, 
    GitPullRequest } from "vso-node-api/interfaces/GitInterfaces"

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
                console.log(`Looking at artifact [${artifact.alias}]`);

                var pullRequestMergeCommitId = artifact.definitionReference.pullRequestMergeCommitId.id;
                var buildNumber = artifact.definitionReference.version.name;
                var buildId = artifact.definitionReference.version.id;

                // Get the pull request
                // https://isams.visualstudio.com/isams/_apis/git/repositories/isams/pullrequestquery?api-version=4.1
                // {
                //     "queries": [
                //             {
                //                 "items": ["de32bde1801c22192876cf322c619bef68c6a207"],
                //                 "type": "lastMergeCommit"
                //             }
                //         ]
                // }
                
                var build = await buildApi.getBuild(parseInt(buildId), teamProject);

                if (build) {                    

                    // Yuck - is there any better way to do this
                    var queries: GitPullRequestQueryInput = {
                        items: [pullRequestMergeCommitId],
                        type: GitPullRequestQueryType.LastMergeCommit
                    };

                    var query: GitPullRequestQuery = {
                        queries: [queries],
                        results: null
                    };

                    var prQuery = await gitApi.getPullRequestQuery(query, build.repository.id, teamProject);

                    if (prQuery) {
                        console.log(`Located PR [${prQuery.results[pullRequestMergeCommitId].pullRequestId}]`);

                        // Get the actual PR
                        console.log(`Fetching the PR details [${prQuery.results[pullRequestMergeCommitId].pullRequestId}]`)
                        var pr = await gitApi.getPullRequest(build.repository.id, prQuery.results[pullRequestMergeCommitId].pullRequestId, teamProject, null, null, null, true, null);

                        if (pr){
                            if (allPrs.findIndex(x => x.pullRequestId === pr.pullRequestId) === -1){
                                // ok to add
                                allPrs.push(pr);
                            } else {
                                console.log(`Duplicate PR, skipping`);
                            }
                        } else {
                            console.log(`Failed to get the PR details [${prQuery.results[pullRequestMergeCommitId].pullRequestId}]`)
                        }
                    } else {
                        console.log('Failed to locate PR for Artifact');
                    }
                } else {
                    console.log(`Failed to locate build id [${buildId}]`)
                }
            }

            console.log(`Found [${allPrs.length}] Pull Requests`);
            for (var pullrequest of allPrs) {
                console.log(`Getting all the builds triggered by PR [${pullrequest.pullRequestId}]`);
                
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