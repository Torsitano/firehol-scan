import { Stack, StackProps, Aws, Duration } from 'aws-cdk-lib'
import { EndpointType, LambdaIntegration, MethodLoggingLevel, RestApi } from 'aws-cdk-lib/aws-apigateway'
//@ts-ignore
import { CfnFlowLog, Vpc } from 'aws-cdk-lib/aws-ec2'
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
//@ts-ignore
import { CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'
import { BuildConfig } from '../getBuildconfig'


export class FireholScannerStack extends Stack {
    //@ts-ignore

    constructor ( scope: Construct, id: string, buildConfig: BuildConfig, props?: StackProps ) {
        super( scope, id, props )

        const fireholStreamDeliveryBucket = new Bucket( this, 'FireholDeliveryBucket', {
            bucketName: `${Aws.ACCOUNT_ID}-${Aws.REGION}-firehol-delivery`,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            encryption: BucketEncryption.S3_MANAGED,
            enforceSSL: true,
        } )

        const fireholStreamRole = new Role( this, 'FireholStreamRole', {
            assumedBy: new ServicePrincipal( 'firehose.amazonaws.com' ),
            description: 'Allows the Firehol Kinesis Firehose Stream to access the destination S3 Bucket',
            roleName: `FireholKinesisRole`
        } )

        fireholStreamDeliveryBucket.grantPut( fireholStreamRole )


        const fireholLambda = new NodejsFunction( this, 'FireholLambda', {
            functionName: 'FireholScanningLambda',
            entry: './src/lambda/firehoseHandler.ts',
            runtime: Runtime.NODEJS_16_X,
            environment: {
                NODE_OPTIONS: '--enable-source-maps',
                REGION: Aws.REGION,
                DEBUG_LOGS: 'true'
            },
            // Kinesis data transformation Lambdas cannot run for more than 5 minutes
            timeout: Duration.seconds( 300 ),
            bundling: {
                sourceMap: true
            },
            memorySize: 512
        } )

        //@ts-ignore
        const fireholApiGateway = new RestApi( this, 'FireholApiGw', {
            restApiName: 'FireholApiGateway',
            deployOptions: {
                stageName: 'default',
                loggingLevel: MethodLoggingLevel.INFO
            },
            endpointConfiguration: {
                types: [ EndpointType.REGIONAL ]
            },
            deploy: true
        } )

        const apiGwResource = fireholApiGateway.root.addResource( 'firehol' )
        apiGwResource.addMethod( 'POST', new LambdaIntegration( fireholLambda ) )

        const keyValue = StringParameter.valueForStringParameter( this, '/firehol/apikey' )

        const apiKey = fireholApiGateway.addApiKey( 'FireholApiKey', {
            apiKeyName: 'FireholApiKey',
            value: keyValue
        } )

        //@ts-ignore
        const apiPlan = fireholApiGateway.addUsagePlan( 'FireholUsagePlan', {
            name: 'FireholUsagePlan',
            apiStages: [ {
                api: fireholApiGateway,
                stage: fireholApiGateway.deploymentStage
            } ]
        } )

        apiPlan.addApiKey( apiKey )

        new NodejsFunction( this, 'BenchmarkLambda', {
            functionName: 'FireholBenchmark',
            entry: './src/lambda/benchmark.ts',
            runtime: Runtime.NODEJS_16_X,
            environment: {
                NODE_OPTIONS: '--enable-source-maps'
            },
            timeout: Duration.seconds( 120 ),
            bundling: {
                sourceMap: true
            },
            memorySize: 4096,
            handler: 'handler'
        } )

        //@ts-ignore
        const vpc = Vpc.fromLookup( this, 'DevVpc', {
            vpcName: 'dev-vpc'
        } )

        const fireholFirehose = new CfnDeliveryStream( this, 'FireholStream', {
            deliveryStreamName: buildConfig.firehoseName,
            deliveryStreamType: 'DirectPut',
            httpEndpointDestinationConfiguration: {
                endpointConfiguration: {
                    url: `${fireholApiGateway.url}firehol`,
                    accessKey: keyValue,
                    name: 'FireholConfig'
                },
                roleArn: fireholStreamRole.roleArn,
                s3Configuration: {
                    bucketArn: fireholStreamDeliveryBucket.bucketArn,
                    roleArn: fireholStreamRole.roleArn
                },
                bufferingHints: {
                    sizeInMBs: 3,
                    intervalInSeconds: 120
                }
            }
        } )
        // extendedS3DestinationConfiguration: {
        //     bucketArn: fireholStreamDeliveryBucket.bucketArn,
        //     roleArn: fireholStreamRole.roleArn,
        //     processingConfiguration: {
        //         enabled: true,
        //         processors: [
        //             {
        //                 type: 'Lambda',
        //                 parameters: [
        //                     {
        //                         parameterName: 'LambdaArn',
        //                         parameterValue: fireholLambda.functionArn
        //                     }
        //                 ]
        //             }
        //         ]
        //     },
        //     bufferingHints: {
        //         sizeInMBs: 3,
        //         intervalInSeconds: 300
        //     }
        // }
        //} )


        /**
         * At the time of writing this IaC, the L2 Construct for Flow Logs didn't support Kinesis as a destination
         */
        new CfnFlowLog( this, 'FireholFlowLog', {
            resourceId: vpc.vpcId,
            resourceType: 'VPC',
            trafficType: 'ALL',
            logDestination: fireholFirehose.attrArn,
            logDestinationType: 'kinesis-data-firehose',
            maxAggregationInterval: 60,
            logFormat: '${srcaddr} ${dstaddr}'
        } )

    }
}
