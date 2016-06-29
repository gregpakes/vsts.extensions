# Provides basic support for Artifact Variables in TFS (on-prem).

This is a task for TFS to provide basic support for [Artifact Variables](https://www.visualstudio.com/en-us/docs/release/author-release-definition/understanding-artifacts#artifact-variables).

**Artifact Variables** are not available in TFS 2015 and are currently due for release in TFS 2016.

This extension plugs this gap and creates some variables based on your artifacts. The following variables are made available.

- **Definition Id**: ReleaseArtifacts.{ArtifactName}.DefinitionId
- **Definition Name**: ReleaseArtifacts.{ArtifactName}.DefinitionName
- **Build Number**: ReleaseArtifacts.{ArtifactName}.BuildNumber
- **Build Id**: ReleaseArtifacts.{ArtifactName}.BuildId
