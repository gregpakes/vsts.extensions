// parse command line options
var minimist = require('minimist');
var editJsonFile = require("edit-json-file");
var mopts = {
    string: [
        'extension',
        'token',
        'artifactsPath',
        'suite'
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
const semverRegex = import('semver-regex');

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
var buildPath = path.join(__dirname, '_build', 'Tasks');
var buildTestsPath = path.join(__dirname, '_build', 'Tests');
var outDir = path.join(__dirname, '_build', "Outdir");

// node min version
var minNodeVer = '6.10.3';
if (semver.lt(process.versions.node, minNodeVer)) {
    fail('requires node >= ' + minNodeVer + '.  installed: ' + process.versions.node);
}

// Resolve list of versions
var extensionList;
if (options.extension) {
    // find using --extension parameter
    extensionList = matchFind(options.extension, extensionsPath, { noRecurse: true, matchBase: true, nocase: true })
        .map(function (item) {
            return item;
        });
    if (!extensionList.length) {
        fail('Unable to find any extensions matching pattern ' + options.extension);
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
            // Create the standard one
            console.log('Packaging release version');
            var extensionPath = path.join(currentExtensionPath, 'vss-extension.json');
            var originalManifest = editJsonFile(extensionPath);
            try {                
                var manifest = editJsonFile(extensionPath);
                manifest.set("galleryFlags", ["public"])
                manifest.save();
                util.run(`tfx extension create --manifest-globs ${extensionPath} --root ${currentExtensionPath} --output-path ${path.join(outDir, "public")}`,  { env: process.env, cwd: __dirname, stdio: 'inherit' })
            
                // Create the preview version
                console.log('Packaging preview version');
                manifest = editJsonFile(extensionPath);
                manifest.set("id", manifest.get('id') + '-preview');
                manifest.set("name", 'Preview: ' + manifest.get('name'));
                manifest.set("galleryFlags", ["preview"])
                manifest.save();
                util.run(`tfx extension create --manifest-globs ${extensionPath} --root ${currentExtensionPath} --output-path ${path.join(outDir, "preview")}`,  { env: process.env, cwd: __dirname, stdio: 'inherit' })
            } finally {
                // ensure the manifest is reset
                originalManifest.save();
            }
        } catch(error) {
            fail(error);
        }
    });
}

target.publishPreview = function(){
    publish("preview");
}

target.publishLive = function(){
    publish("public");
}

function publish(publishType) {
    if (!options.artifactsPath){
        console.log('ArtifactsPath was not supplied - using the standard OutDir');
        options.artifactsPath = outDir;
    }

    console.log(`Token: ${options.token}`)

    ensureExists(options.artifactsPath);

    var publishCount = 0;

    var vsixFiles = matchFind("*.vsix", path.join(options.artifactsPath, publishType), { noRecurse: true, matchBase: true })
        .map(function (item) {
            return item;
        });

    vsixFiles.forEach(function (vsix){
        banner(`Publishing [${vsix}]`);

        // extract the version of the vsix
        var versionFromVsix = semverRegex().exec(vsix)[0];

        console.log(`Checking to see if this version is already published...`);
        var version = "0.0.0";
        var output;
        
        output = util.run(`tfx extension show --vsix ${vsix} --token ${options.token} --json`,  { env: process.env, cwd: __dirname }, true, true);
        try { 
            const json = JSON.parse(output);
            version = json.versions[0].version;
        } catch (err) {
            // Failed to parse the JSON - no JSON was returned.  This means the extension probably doesn't exist.
            if (output.indexOf('404') == -1 && output.indexOf('doesn\'t exist') == -1){
                throw `Unknown error thrown from TFX: ${err}`;
            }
        }

        console.log(`Latest version   : ${version}`);
        console.log(`Requested action : ${versionFromVsix}`);

        // We used to use the override object to override the galleryFlags, but we now do that in the build.
        // i am keeping this code here as it may be useful for other overrides.
        var overrideObject = {
        };

        var overrideString = JSON.stringify(overrideObject).replace(/\"/g, '\\"');

        if (version !== versionFromVsix){
            publishCount++;
            util.run(`tfx extension publish --vsix "${vsix}" --token ${options.token} --override "${overrideString}"`,  { env: process.env, cwd: __dirname, stdio: 'inherit' }, true);
        }else{
            console.log('Skipping as it already exists in the marketplace.')
        }
    });

    if (publishCount === 0) {
        throw "No extensions were published.  Are you sure you bumped the version numbers?"
    }
}

//
// will run tests for the scope of tasks being built
// npm test
// node make.js test
// node make.js test --extension CampaignMonitor --suite L0
//
target.test = function() {
    
    rm('-Rf', buildPath);
    mkdir('-p', path.join(buildPath));
    rm('-Rf', buildTestsPath);
    mkdir('-p', path.join(buildTestsPath));

    // find the tests
    var suiteType = options.suite || 'L0';
    var extenionName = options.extension || '*';
    var pattern1 = buildPath + '/' + extenionName + '/Tests/' + suiteType + '.js';
    var pattern3 = buildTestsPath + '/' + suiteType + '.js';
    var testsSpec = matchFind(pattern1, buildPath)
        .concat(matchFind(pattern3, buildTestsPath, { noRecurse: true }));


    run('jest ' + testsSpec.join(' '), /*inheritStreams:*/true);

}
