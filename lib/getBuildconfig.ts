import { App } from 'aws-cdk-lib'

export interface BuildConfig {
    deploymentAccount: string,
    devAccount: string,
    prodAccount: string,
    region: string,
    codeStarConnectionId: string,
}


export function getBuildConfig( app: App ): BuildConfig {

    const buildEnv = app.node.tryGetContext( 'config' )

    const buildConfig: BuildConfig = {
        deploymentAccount: buildEnv[ 'DeploymentAccount' ],
        devAccount: buildEnv[ 'DevAccount' ],
        prodAccount: buildEnv[ 'ProdAccount' ],
        region: buildEnv[ 'Region' ],
        codeStarConnectionId: buildEnv[ 'CodeStarConnectionId' ]
    }

    return buildConfig
}

