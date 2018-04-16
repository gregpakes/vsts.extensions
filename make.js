

// parse command line options
var minimist = require('minimist');
var mopts = {
    string: [
        'extension',
        'token',
        'artifactsPath'
    ]
};
var options = minimist(process.argv, mopts);

// remove well-known parameters from argv before loading make,
// otherwise each arg will be interpreted as a make target
process.argv = options._;

var make = require('shelljs/make');
var path = require('path');
var util = require('./make-util');
var semver = require('semver');
var ToolRunner = require('vsts-task-lib/toolrunner');
const semverRegex = require('semver-regex');

var banner = util.banner;
var miniBanner = util.miniBanner;
var getDirectories = util.getDirectories;
var matchFind = util.matchFind;
var buildExtension = util.buildExtension;
var ensureTool = util.ensureTool;
var fail = util.fail;
var getTaskVersions = util.getTaskVersions;
var getTasks = util.getTasks;
var run = util.run;
var rm = util.rm;
var ensureExists = util.ensureExists

// global variables
var extensionsPath = path.join(__dirname, 'Extensions');
var outDir = path.join(__dirname, "_outdir");

// node min version
var minNodeVer = '6.10.3';
if (semver.lt(process.versions.node, minNodeVer)) {
    fail('requires node >= ' + minNodeVer + '.  installed: ' + process.versions.node);
}

// Resolve list of versions
var extensionList;
if (options.extension) {
    // find using --extension parameter
    extensionList = matchFind(options.extension, tasksPath, { noRecurse: true, matchBase: true })
        .map(function (item) {
            return item;
        });
    if (!extensionList.length) {
        fail('Unable to find any tasks matching pattern ' + options.task);
    }
}
else {
    // load the default list
    extensionList = getDirectories(extensionsPath);
}

target.clean = function(){

    banner('Cleaning the global extension output')
    rm('-Rf', outDir);
    mkdir('-p', outDir);

    extensionList.forEach(function (currentExtensionPath){
        var currentExtensionName = currentExtensionPath.split(path.sep).pop();
        banner(`Cleaning Extension [${currentExtensionName}]...`)

        var taskList = getTasks(currentExtensionPath);

        taskList.forEach(function (taskPath){
            console.log('Deleting js files')
            rm('-f', path.join(taskPath, "*.js"));
            rm('-f', path.join(taskPath, "*.js.map"));
        });
    });
}

target.install = function(){
    extensionList.forEach(function (currentExtensionPath){
        var currentExtensionName = currentExtensionPath.split(path.sep).pop();
        banner(`${currentExtensionName}`);

        var taskList = getTasks(currentExtensionPath);

        taskList.forEach(function (taskPath){
            
            // look for tsconfig.json
            var shouldBuildNode = test('-f', path.join(taskPath, 'tsconfig.json'));

            if (shouldBuildNode){
                console.log(`npm install [${taskPath}]`)
                try{
                    run(`npm i`,  { env: process.env, cwd: taskPath, stdio: 'inherit' })
                }catch(error){
                    fail(error);
                }
            } else {
                console.log(`Skipping npm install as this does not look like a node task [${taskPath}]`);
            }

        });
    });
};

target.build = function() {

    // Required for npx
    ensureTool('npm', '--version', function (output) {
        if (semver.lt(output, '5.2.0')) {
            fail('Expected 5.2.0 or higher. To fix, run: npm install -g npm');
        }
    });

    extensionList.forEach(function (currentExtensionPath){
        buildExtension(currentExtensionPath);
    });
};

target.package = function(){
    target.clean();
    target.install();
    target.build();

    extensionList.forEach(function (currentExtensionPath){
        var currentExtensionName = currentExtensionPath.split(path.sep).pop();
        banner(`${currentExtensionName}`);

        var taskList = getTasks(currentExtensionPath);

        taskList.forEach(function (taskPath){
        
            // look for tsconfig.json
            var shouldBuildNode = test('-f', path.join(taskPath, 'tsconfig.json'));

            if (shouldBuildNode){
                // npm prune
                console.log('Running npm prune')
                try{
                    util.run(`npm prune --production`,  { env: process.env, cwd: taskPath, stdio: 'inherit' })
                }catch(error){
                    fail(error);
                }
            }
                    
        });

        // create extension
        console.log('Creating extension')
        try{
            var extensionPath = path.join(currentExtensionPath, 'vss-extension.json');
            util.run(`tfx extension create --manifest-globs ${extensionPath} --root ${currentExtensionPath} --output-path ${outDir}`,  { env: process.env, cwd: __dirname, stdio: 'inherit' })
        }catch(error){
            fail(error);
        }
    });
}

target.publish = function(){

    if (!options.artifactsPath){
        throw "You have not supplied the ArtifactsPath argument"
    }

    ensureExists(options.artifactsPath);

    var vsixFiles = matchFind("*.vsix", options.artifactsPath, { noRecurse: true, matchBase: true })
        .map(function (item) {
            return item;
        });

    vsixFiles.forEach(function (vsix){
        console.log(`Publishing [${vsix}]`);

        // extract the version of the vsix
        var versionFromVsix = semverRegex().exec(vsix)[0];

        console.log(`Checking to see if this version is already published...`);
        var output = util.run(`tfx extension show --vsix ${vsix} --token ${options.token} --json`,  { env: process.env, cwd: __dirname });
        const json = JSON.parse(output);
        var version = json.versions[0].version;

        console.log(`Latest version   : ${version}`);
        console.log(`Requested action : ${versionFromVsix}`);

        if (version !== versionFromVsix){
            util.run(`tfx extension publish --vsix ${vsix} --token ${options.token}`,  { env: process.env, cwd: __dirname, stdio: 'inherit' });
        }else{
            console.log('Skipping as it already exists in the marketplace.')
        }
    });
}
