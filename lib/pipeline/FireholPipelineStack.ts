
import { Aws, Stack, StackProps } from 'aws-cdk-lib'
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines'
import { Construct } from 'constructs'
import { BuildConfig } from '../getBuildconfig'


export class fireholConnectorPipelineStack extends Stack {
    //@ts-ignore
    constructor ( scope: Construct, id: string, buildConfig: BuildConfig, props?: StackProps ) {
        super( scope, id, props )


        //@ts-ignore
        const fireholConnectorPipeline = new CodePipeline( this, 'fireholConnectorPipeline', {
            pipelineName: 'fireholConnectorPipeline',
            synth: new ShellStep( 'Synth', {
                input: CodePipelineSource.connection( 'Torsitano/firehol-scan', 'master', {
                    connectionArn: `arn:aws:codestar-connections:${Aws.REGION}:${Aws.ACCOUNT_ID}:connection/${buildConfig.codeStarConnectionId}`,

                } ),
                commands: [
                    'npm i -g npm@latest aws-cdk@latest',
                    'npm ci',
                    'npm run build',
                    'npx cdk synth',
                ],

            } ),
            crossAccountKeys: true
        } )





    }
}
