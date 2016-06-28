param(
    [string]$variableprefix,
    [string]$tfsUsername,
    [string]$tfsPassword
)

Write-Host "Entering Set-ArtifactVariables.ps1" -Verbose

Write-Host "variablePrefix = $variableprefix" -Verbose

$tfsTeamProject = $Env:System_TeamProject
$tfsReleaseId = $Env:Release_ReleaseId
$tfsUri = $Env:SYSTEM_TEAMFOUNDATIONSERVERURI + $tfsTeamProject

Write-Host "System_TeamFoundationServerUri = $tfsUri" -Verbose

$uri = $tfsUri + "/_apis/release/releases/" + $tfsReleaseId + "?api-version=2.2-preview.1"
Write-Host "Uri = $uri"

$securePassword = $tfsPassword | ConvertTo-SecureString -AsPlainText -Force   
$credential = New-Object System.Management.Automation.PSCredential($tfsUsername, $securePassword)       

$response = Invoke-RestMethod -Method Get -ContentType application/json -Uri $uri -Credential $credential

$response.artifacts | ForEach-Object {
    $alias = $_.alias    
    $prefix = "$($variableprefix)_$alias"

    # DefinitionId
    Write-Host ("##vso[task.setvariable variable=$prefix.DefinitionId;]$($_.definitionReference.definition.id)")
    Write-Host "Setting variable: [$prefix.DefinitionId] = $($_.definitionReference.definition.id)" -Verbose

    # Definition Name
    Write-Host ("##vso[task.setvariable variable=$prefix.DefinitionName;]$($_.definitionReference.definition.name)")
    Write-Host "Setting variable: [$prefix.DefinitionName] = $($_.definitionReference.definition.name)" -Verbose

    #Build Number
    $buildNumber = $($_.definitionReference.version.name)
    Write-Host ("##vso[task.setvariable variable=$prefix.BuildNumber;]$buildNumber")
    Write-Host "Setting variable: [$prefix.BuildNumber] = $buildNumber" -Verbose

    # Build Id
    Write-Host ("##vso[task.setvariable variable=$prefix.DefinitionName;]$($_.definitionReference.version.id)")
    Write-Host "Setting variable: [$prefix.DefinitionName] = $($_.definitionReference.version.id)" -Verbose
}     
