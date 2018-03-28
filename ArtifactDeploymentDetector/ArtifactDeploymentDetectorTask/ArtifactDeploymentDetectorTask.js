"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
var path = require('path');
const tl = require("vsts-task-lib/task");
require('vso-node-api');
const ReleaseInterfaces_1 = require("vso-node-api/interfaces/ReleaseInterfaces");
const webApi = require("vso-node-api/WebApi");
//npm install vsts-task-lib
var taskJson = require('./task.json');
const area = 'ArtifactDeploymentDetector';
function getDefaultProps() {
    var hostType = (tl.getVariable('SYSTEM.HOSTTYPE') || "").toLowerCase();
    return {
        hostType: hostType,
        definitionName: hostType === 'release' ? tl.getVariable('RELEASE.DEFINITIONNAME') : tl.getVariable('BUILD.DEFINITIONNAME'),
        processId: hostType === 'release' ? tl.getVariable('RELEASE.RELEASEID') : tl.getVariable('BUILD.BUILDID'),
        processUrl: hostType === 'release' ? tl.getVariable('RELEASE.RELEASEWEBURL') : (tl.getVariable('SYSTEM.TEAMFOUNDATIONSERVERURI') + tl.getVariable('SYSTEM.TEAMPROJECT') + '/_build?buildId=' + tl.getVariable('BUILD.BUILDID')),
        taskDisplayName: tl.getVariable('TASK.DISPLAYNAME'),
        jobid: tl.getVariable('SYSTEM.JOBID'),
        agentVersion: tl.getVariable('AGENT.VERSION'),
        version: taskJson.version
    };
}
function publishEvent(feature, properties) {
    try {
        var splitVersion = (process.env.AGENT_VERSION || '').split('.');
        var major = parseInt(splitVersion[0] || '0');
        var minor = parseInt(splitVersion[1] || '0');
        let telemetry = '';
        if (major > 2 || (major == 2 && minor >= 120)) {
            telemetry = `##vso[telemetry.publish area=${area};feature=${feature}]${JSON.stringify(Object.assign(getDefaultProps(), properties))}`;
        }
        else {
            if (feature === 'reliability') {
                let reliabilityData = properties;
                telemetry = "##vso[task.logissue type=error;code=" + reliabilityData.issueType + ";agentVersion=" + tl.getVariable('Agent.Version') + ";taskId=" + area + "-" + JSON.stringify(taskJson.version) + ";]" + reliabilityData.errorMessage;
            }
        }
        console.log(telemetry);
        ;
    }
    catch (err) {
        tl.warning("Failed to log telemetry, error: " + err);
    }
}
function getArtifactArray(artifacts) {
    var result = [];
    for (let artifact of artifacts) {
        result.push({
            "artifactAlias": artifact.alias,
            "buildDefinitionId": artifact.definitionReference.definition.id,
            "buildNumber": artifact.definitionReference.version.name,
            "shouldDeploy": true
        });
    }
    return result;
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        var promise = new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            tl.setResourcePath(path.join(__dirname, 'task.json'));
            tl.debug("Starting Tag ChangedBuildArtifacts task");
            let tpcUri = tl.getVariable("System.TeamFoundationCollectionUri");
            let teamProject = tl.getVariable("System.TeamProject");
            let hostType = tl.getVariable('system.hostType');
            let releaseId = parseInt(tl.getVariable("Release.ReleaseId"));
            let releaseDefinitionId = parseInt(tl.getVariable("Release.DefinitionId"));
            let releaseDefinitionEnvironmentId = parseInt(tl.getVariable("Release.DefinitionEnvironmentId"));
            let releaseEnvironmentName = tl.getVariable("Release.EnvironmentName");
            // Get the credential handler
            var accessToken = tl.getVariable("System.AccessToken");
            let credHandler;
            if (!accessToken || accessToken.length === 0) {
                reject('Unable to locate access token.  Please make sure you have enabled the "Allow scripts to access OAuth token" setting.');
                return;
            }
            else {
                tl.debug('Creating the credential handler');
                // used for local debugging.  Allows switching between PAT token and Bearer Token for debugging
                credHandler = accessToken.length == 52 ? webApi.getPersonalAccessTokenHandler(accessToken) :
                    webApi.getBearerHandler(accessToken);
            }
            let vsts = new webApi.WebApi(tpcUri, credHandler);
            var releaseApi = yield vsts.getReleaseApi();
            console.log('Getting the current release details');
            var currentRelease = yield releaseApi.getRelease(teamProject, releaseId).catch((reason) => {
                reject(reason);
                return;
            });
            console.log(`Getting the all the successful deployments to release definition id ${releaseDefinitionEnvironmentId}`);
            // Gets the latest successful deployments in order
            var successfulDeployments = yield releaseApi.getDeployments(teamProject, releaseDefinitionId, releaseDefinitionEnvironmentId, null, null, null, ReleaseInterfaces_1.DeploymentStatus.Succeeded, null, true, null, null, null, null).catch((reason) => {
                reject(reason);
                return;
            });
            // We want to compare the artifacts between the two definitions to see which ones are different.
            if (currentRelease) {
                console.log(`Getting all artifacts in the current release...`);
                var arifactsInThisRelease = getArtifactArray(currentRelease.artifacts);
                console.log(`Found ${arifactsInThisRelease.length}`);
                if (successfulDeployments && successfulDeployments.length > 0) {
                    // loop through every artifact in this release
                    for (var artifactInCurrentRelease of arifactsInThisRelease) {
                        console.log(`Looking for artifact ${artifactInCurrentRelease.buildNumber} in previous successful deployments...`);
                        for (var deployment of successfulDeployments) {
                            if (artifactInCurrentRelease.shouldDeploy) {
                                console.log(`Searching for artifact ${artifactInCurrentRelease.buildNumber} in release ${deployment.release.name}`);
                                var artifactsInDeployment = getArtifactArray(deployment.release.artifacts);
                                for (var artifactInDeployment of artifactsInDeployment) {
                                    if (artifactInCurrentRelease.buildDefinitionId === artifactInDeployment.buildDefinitionId &&
                                        artifactInCurrentRelease.buildNumber === artifactInDeployment.buildNumber) {
                                        console.log(`Found artifact ${artifactInCurrentRelease.buildNumber} deployed in ${deployment.release.name}`);
                                        artifactInCurrentRelease.shouldDeploy = false;
                                        break;
                                    }
                                }
                            }
                            else {
                                console.log(`Skipping remaining releases because the property shouldDeploy for artifact ${artifactInCurrentRelease.buildNumber} was false.`);
                                break;
                            }
                        }
                    }
                }
                else {
                    // There are no successful releases - we need to add all the artifacts
                    tl.debug(`Past successful releases for id ${releaseDefinitionId} and environment id ${releaseDefinitionEnvironmentId} not found.`);
                }
                for (var artifactInCurrentRelease of arifactsInThisRelease) {
                    var safeAlias = artifactInCurrentRelease.artifactAlias.replace(/\./gi, '_');
                    var variableName = ('RELEASE_ARTIFACTS_' + safeAlias + '_ShouldDeploy').toUpperCase();
                    tl.debug(`Setting variable ${variableName} with value ${artifactInCurrentRelease.shouldDeploy}`);
                    tl.setVariable(variableName, artifactInCurrentRelease.shouldDeploy.toString());
                }
            }
            else {
                reject(`Release with id ${releaseId} was not found.`);
                return;
            }
            resolve();
        }));
        return promise;
    });
}
run()
    .then((result) => tl.setResult(tl.TaskResult.Succeeded, ""))
    .catch((err) => {
    publishEvent('reliability', { issueType: 'error', errorMessage: JSON.stringify(err, Object.getOwnPropertyNames(err)) });
    tl.setResult(tl.TaskResult.Failed, err);
});
//# sourceMappingURL=ArtifactDeploymentDetectorTask.js.map