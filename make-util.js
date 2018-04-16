var fs = require('fs');
var path = require('path');
var minimatch = require('minimatch');
var ncp = require('child_process');
var shell = require('shelljs');
var check = require('validator');

var shellAssert = function () {
    var errMsg = shell.error();
    if (errMsg) {
        throw new Error(errMsg);
    }
}

var banner = function (message, noBracket) {
    console.log();
    if (!noBracket) {
        console.log('------------------------------------------------------------');
    }
    console.log(message);
    if (!noBracket) {
        console.log('------------------------------------------------------------');
    }
}
exports.banner = banner;

const isDirectory = source => fs.lstatSync(source).isDirectory()
exports.isDirectory = isDirectory;

const getDirectories = source => fs.readdirSync(source).map(name => path.join(source, name)).filter(isDirectory)
exports.getDirectories = getDirectories; 

var matchFind = function (pattern, root, options) {
    assert(pattern, 'pattern');
    assert(root, 'root');

    // create a copy of the options
    var clone = {};
    Object.keys(options || {}).forEach(function (key) {
        clone[key] = options[key];
    });
    options = clone;

    // determine whether to recurse
    var noRecurse = options.hasOwnProperty('noRecurse') && options.noRecurse;
    delete options.noRecurse;

    // normalize first, so we can substring later
    root = path.resolve(root);

    // determine the list of items
    var items;
    if (noRecurse) {
        items = fs.readdirSync(root)
            .map(function (name) {
                return path.join(root, name);
            });
    }
    else {
        items = find(root)
            .filter(function (item) { // filter out the root folder
                return path.normalize(item) != root;
            });
    }

    return minimatch.match(items, pattern, options);
}
exports.matchFind = matchFind;

var rm = function (options, target) {
    if (target) {
        shell.rm(options, target);
    }
    else {
        shell.rm(options);
    }

    shellAssert();
}
exports.rm = rm;

var assert = function (value, name) {
    if (!value) {
        throw new Error('"' + name + '" cannot be null or empty.');
    }
}
exports.assert = assert;

var fail = function (message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}
exports.fail = fail;

var ensureTool = function (name, versionArgs, validate) {
    console.log(name + ' tool:');
    var toolPath = which(name);
    if (!toolPath) {
        fail(name + ' not found.  might need to run npm install');
    }

    if (versionArgs) {
        var result = shell.exec(name + ' ' + versionArgs);
        console.log(result);
        if (typeof validate == 'string') {
            if (result.output.trim() != validate) {
                fail('expected version: ' + validate);
            }
        }
        else {
            validate(result.output.trim());
        }
    }

    console.log(toolPath + '');
}
exports.ensureTool = ensureTool;

var run = function (cl, options, noHeader) {
    if (!noHeader) {
        console.log();
        console.log('> ' + cl);
    }

    var rc = 0;
    var output;
    try {
        output = ncp.execSync(cl, options);
    }
    catch (err) {
        if (!options.inheritStreams) {
            console.error(err.output ? err.output.toString() : err.message);
        }

        process.exit(1);
    }

    return (output || '').toString().trim();
}
exports.run = run;

var buildExtension = function(extensionPath){
    var currentExtensionName = extensionPath.split(path.sep).pop();

    banner(`Building Extension [${currentExtensionName}]`);

    var taskList = getTasks(extensionPath);

    if (taskList.length){
        taskList.forEach(function(currentTaskPath){
            buildTask(currentTaskPath);  
        });
    }else{
        console.log(`No tasks found within extension [${currentExtensionName}]`)
    }
}
exports.buildExtension = buildExtension;

var buildTask = function(currentTaskPath) {

    var currentTaskName = currentTaskPath.split(path.sep).pop();

    var versionList = getTaskVersions(currentTaskPath);

    if (versionList.length){
        console.log(`Detected [${versionList.length}] versions within task [${currentTaskName}]`);

        versionList.forEach(function (versionFolder) {
            buildSingleTask(currentTaskName, currentTaskPath, "");
        });

    } else {
        // Process single
        buildSingleTask(currentTaskName, currentTaskPath, "");
    }  
};
exports.buildTask = buildTask;

var buildSingleTask = function(taskName, taskPath, outDir){

    console.log(`Building task [${taskName}]`);

    var taskJsonPath = path.join(taskPath, 'task.json');
    if (test('-f', taskJsonPath)) {
        var taskDef = require(taskJsonPath);
        validateTask(taskDef);

        // lint
        if (test('-f', path.join(taskPath, "tslint.json"))){
            try{
                console.log(`Starting lint`);
                run(`npx tslint -c tslint.json *.ts test/*.ts`,  { env: process.env, cwd: taskPath, stdio: 'inherit' })
            }catch(error){
                fail(error);
            }
        }else{
            console.log(`Skipping lint because tslint.json does not exist.`)
        }

        // Compile
        if (test('-f', path.join(taskPath, "tsconfig.json"))){
            try{
                console.log(`Starting Compile`);
                run(`npx tsc -p ./`,  { env: process.env, cwd: taskPath, stdio: 'inherit' })
            }catch(error){
                fail(error);
            }
        }else{
            console.log(`Skipping lint because tsconfig.json does not exist.`)
        }  

    } else {
        fail(`Failed to locate task.json in [${taskJsonPath}]`);
    }
}

var getTasks = function(extensionPath){
    var taskList = matchFind("*Task", extensionPath, { noRecurse: true, matchBase: true })
        .map(function (item) {
            return item;
        });

    var finalList = [];

    taskList.forEach(function(taskPath){
        var versionList = getTaskVersions(taskPath);

        if (versionList.length){
            finalList = finalList.concat(versionList);
        }else{
            finalList.push(taskPath);
        }
    });

    return finalList;
};
exports.getTasks = getTasks;

var getTaskVersions = function(currentTaskPath){
    return matchFind("V*", currentTaskPath, { noRecurse: true, matchBase: true })
        .map(function (item) {
            return path.basename(item);
        });
};
exports.getTaskVersions = getTaskVersions;

// Validates the structure of a task.json file.
var validateTask = function (task) {
    if (!task.id || !check.isUUID(task.id)) {
        fail('id is a required guid');
    };

    if (!task.name || !check.isAlphanumeric(task.name)) {
        fail('name is a required alphanumeric string');
    }

    if (!task.friendlyName || !check.isLength(task.friendlyName, 1, 40)) {
        fail('friendlyName is a required string <= 40 chars');
    }

    if (!task.instanceNameFormat) {
        fail('instanceNameFormat is required');
    }
};
exports.validateTask = validateTask;