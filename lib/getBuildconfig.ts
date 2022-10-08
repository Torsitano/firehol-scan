import { App } from 'aws-cdk-lib'

export interface BuildConfig {
    region: string,
    firehoseName: string
}


export function getBuildConfig( app: App ): BuildConfig {

    const buildEnv = app.node.tryGetContext( 'config' )

    const buildConfig: BuildConfig = {
        region: buildEnv[ 'Region' ],
        firehoseName: buildEnv[ 'FirehoseName' ]
    }

    return buildConfig
}

