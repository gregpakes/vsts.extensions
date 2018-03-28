## Artifact Deployment Detector ##

Detects whether artifacts have been deployed before

### Quick steps to get started ###

- Add the **Artifact Deployment Detector** task to your pipeline.
- You can then access variables to find out if the artifact has been deployed before to this stage.

EG.

An example variable for an artifact called "MyArtifact" would be:

RELEASE_ARTIFACTS_MYARTIFACT_PREVIOUSLYDEPLOYED and it will have a boolean value.

You can then use the variable in further tasks to know whether the artifact has been deployed before.

### Known issue(s)

- None

### Learn More

The [source](https://github.com/gregpakes/vsts.extensions) to this extension is available. Feel free to take, fork, and extend.

### Feedback ###
- https://github.com/gregpakes/vsts.extensions