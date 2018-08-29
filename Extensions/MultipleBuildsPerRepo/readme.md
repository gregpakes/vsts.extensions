## Multiple Builds per Repo

This task is useful when you have multiple of builds in a single git repo.  There are a few situations that can create problems when referencing these builds in a Release definition.  This task ensures that you cannot release code in an invalid state.

### The Problems

If you have a single git repo with multiple projects/builds in it, it can be easy to release code in a broken state.

### Scenario - Continious Deployment

- You have 2 builds running from a single git repo.
    - Build 1
    - Build 2
- You have a release definition that uses the artifacts generated from Build 1 and Build 2.  It is setup with Continous Deployment.
- You make some code changes and commit.  These code changes trigger both Build 1 and Build 2.  
- The release definition will be triggered when each of the builds completes.  This means that the first release that is triggered will be invalid as it will not have the outputs from Build 2 available.
- Another issue occurs if Build 1 fails and Build 2 succeeds.  The successful Build 2 will trigger a release, however it will not use the artifacts from Build 1 because it failed.  So again, this release would be invalid.

If you put this task into your Release Definition as the first task, it will detect the two issues above and will fail the release.  This ensures that you do not deploy invalid code.

### Learn More

The [source](https://github.com/gregpakes/vsts.extensions) to this extension is available. Feel free to take, fork, and extend.

### Feedback ###
- https://github.com/gregpakes/vsts.extensions
