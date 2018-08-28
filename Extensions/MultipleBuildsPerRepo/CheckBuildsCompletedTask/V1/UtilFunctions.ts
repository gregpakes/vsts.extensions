import tl = require("vsts-task-lib/task");
import * as webApi from "vso-node-api/WebApi";
import { IRequestHandler } from "vso-node-api/interfaces/common/VsoBaseInterfaces";
import { Artifact } from "vso-node-api/interfaces/ReleaseInterfaces";
import { Build } from "vso-node-api/interfaces/BuildInterfaces";
import { IBuildApi } from "vso-node-api/BuildApi";

// Gets the credential handler.  Supports both PAT and OAuth tokens
export function getCredentialHandler(): IRequestHandler {
    var accessToken: string = tl.getVariable("System.AccessToken");
    let credHandler: IRequestHandler;
    if (!accessToken || accessToken.length === 0) {
        throw "Unable to locate access token.  Please make sure you have enabled the \"Allow scripts to access OAuth token\" setting.";
    } else {
        tl.debug("Creating the credential handler");
        // used for local debugging.  Allows switching between PAT token and Bearer Token for debugging
        credHandler = webApi.getHandlerFromToken(accessToken);
    }
    return credHandler;
}

export function getBuildArtifacts(artifacts: Artifact[]): Artifact[] {
    var result: Artifact[] = [];
    for (let artifact of artifacts) {
        if (artifact.type === "Build") {
            result.push(artifact);
        }
    }
    return result;
}

export async function getBuildFromTargetUrl(buildApi: IBuildApi, targetUrl: string, project: string): Promise<Build> {
    // Extract the build Id
    var buildId: number = parseInt(targetUrl.substring((targetUrl.lastIndexOf("/") + 1), targetUrl.length));
    return await buildApi.getBuild(buildId, project);
}