import tl = require("vsts-task-lib/task");
const pathExists = require("path-exists");
const path = require("path");
var fs = require("fs");
var archiver = require("archiver-promise");
var shell = require("shelljs");

var taskJson = require("./task.json");
const area: string = "CompressTask";

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

async function run(): Promise<void>  {
    var promise = new Promise<void>(async (resolve, reject) => {

        try {
            console.time("Timing");

            let sourceDirectory: string = tl.getInput("SourceDirectory", true);
            let destinationArchive: string = tl.getInput("DestinationArchive", true);

            // Check the source directory exists
            if (!pathExists.sync(sourceDirectory)) {
                reject(`Failed to locate the source directory on disk ${sourceDirectory}`);
                return;
            }

            // Check the destination folder
            var destinationFolder = path.dirname(destinationArchive);
            if (!pathExists.sync(destinationFolder)) {
                console.log(`Destination folder [${destinationFolder}] does not exist.  Creating....`);
                shell.mkdir("-p", destinationFolder);
            }

            // create a file to stream archive data to.
            var output = fs.createWriteStream(destinationArchive);
            var archive = archiver("zip", {
                store: true
            });

            // listen for all archive data to be written
            // 'close' event is fired only when a file descriptor is involved
            output.on("close", function() {
                console.log(archive.pointer() + " total bytes");
                console.log("archiver has been finalized and the output file descriptor has closed.");
            });

            // This event is fired when the data source is drained no matter what was the data source.
            // It is not part of this library but rather from the NodeJS Stream API.
            // @see: https://nodejs.org/api/stream.html#stream_event_end
            output.on("end", function() {
                console.log("Data has been drained");
            });

            // good practice to catch warnings (ie stat failures and other non-blocking errors)
            archive.on("warning", function(err) {
                if (err.code === "ENOENT") {
                    // log warning
                } else {
                    // throw error
                    reject(err);
                }
            });

            // good practice to catch this error explicitly
            archive.on("error", function(err) {
                reject(err);
            });

            // pipe archive data to the file
            archive.pipe(output);
            archive.directory(sourceDirectory, false);
            return archive.finalize().then(function() {
                console.log("here");
                resolve();
            });

        } catch (err) {
            reject(err);
        }
    });

    return promise;
}

run()
    .then((result) => {
            console.timeEnd("Timing");
            tl.setResult(tl.TaskResult.Succeeded, "");
        }
    )
    .catch((err) => {
        publishEvent("reliability", { issueType: "error", errorMessage: JSON.stringify(err, Object.getOwnPropertyNames(err)) });
        tl.setResult(tl.TaskResult.Failed, err);
    });