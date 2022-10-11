import { Stack, StackProps, Aws, Duration } from 'aws-cdk-lib'
import { EndpointType, LambdaIntegration, MethodLoggingLevel, RestApi } from 'aws-cdk-lib/aws-apigateway'
import { CfnFlowLog, Vpc } from 'aws-cdk-lib/aws-ec2'
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'
import { BuildConfig } from '../getBuildconfig'


export class FireholScannerStack extends Stack {
    constructor ( scope: Construct, id: string, buildConfig: BuildConfig, props?: StackProps ) {
        super( scope, id, props )

        // Used to store failure messages if Kinesis is unable to deliver to the API Gateway
        const fireholStreamFailureBucket = new Bucket( this, 'FireholFailureBucket', {
            bucketName: `${Aws.ACCOUNT_ID}-${Aws.REGION}-firehol-delivery-failure`,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            encryption: BucketEncryption.S3_MANAGED,
            enforceSSL: true,
        } )

        const fireholStreamRole = new Role( this, 'FireholStreamRole', {
            assumedBy: new ServicePrincipal( 'firehose.amazonaws.com' ),
            description: 'Allows the Firehol Kinesis Firehose Stream to access the destination S3 Bucket',
            roleName: `FireholKinesisRole`
        } )

        /**
         * Grants the Firehol Service Role permissions to the S3 Bucket for failed delivery, and
         * allows the Role permissions to CloudWatch Logs for failure logs
         */
        fireholStreamFailureBucket.grantPut( fireholStreamRole )
        fireholStreamRole.addToPolicy( new PolicyStatement( {
            effect: Effect.ALLOW,
            actions: [
                'logs:PutLogEvent'
            ],
            resources: [
                `arn:aws:logs:${Aws.REGION}:${Aws.ACCOUNT_ID}:/aws/kinesisfirehose/${buildConfig.firehoseName}:*`
            ]
        } ) )

        /**
         * The Lambda that does all the processing of logs. AWS_ACCOUNT_ID is *REQUIRED* for the Lambda
         * to function, it needs the Account ID for SecurityHub
         * 
         * TODO: Redo this Lambda to get the Account ID from the Flow Logs instead to allow aggregation
         * from multiple accounts
         */
        const fireholLambda = new NodejsFunction( this, 'FireholLambda', {
            functionName: 'FireholScanningLambda',
            entry: './src/lambda/firehoseHandler.ts',
            runtime: Runtime.NODEJS_16_X,
            environment: {
                NODE_OPTIONS: '--enable-source-maps',
                REGION: Aws.REGION,
                DEBUG_LOGS: 'true',
                AWS_ACCOUNT_ID: Aws.ACCOUNT_ID,
                TESTING: 'true'
            },
            timeout: Duration.seconds( 300 ),
            bundling: {
                sourceMap: true
            },
            memorySize: 512
        } )

        // Grants permission to the Lambda to create/update SecurityHub Findings
        fireholLambda.addToRolePolicy( new PolicyStatement( {
            effect: Effect.ALLOW,
            actions: [
                'securityhub:BatchImportFindings',
                'securityhub:BatchUpdateFindings'
            ],
            resources: [ '*' ]
        } ) )


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

        const vpc = Vpc.fromLookup( this, 'Vpc', {
            vpcName: buildConfig.vpcName
        } )

        const fireholFirehose = new CfnDeliveryStream( this, 'FireholStream', {
            deliveryStreamName: buildConfig.firehoseName,
            deliveryStreamType: 'DirectPut',
            httpEndpointDestinationConfiguration: {
                endpointConfiguration: {
                    url: `${fireholApiGateway.url}firehol`,
                    name: 'FireholScanner'
                },
                roleArn: fireholStreamRole.roleArn,
                s3Configuration: {
                    bucketArn: fireholStreamFailureBucket.bucketArn,
                    roleArn: fireholStreamRole.roleArn
                },
                bufferingHints: {
                    sizeInMBs: 3,
                    intervalInSeconds: 120
                },
                cloudWatchLoggingOptions: {
                    enabled: true
                }
            }
        } )


        /**
         * At the time of writing this IaC, the L2 Construct for Flow Logs didn't support Kinesis as a destination
         * The format for the Flow Log uses a reduced amount of information to keep payloads to the Lambda smaller
         * 
         */
        new CfnFlowLog( this, 'FireholFlowLog', {
            resourceId: vpc.vpcId,
            resourceType: 'VPC',
            trafficType: 'ALL',
            logDestination: fireholFirehose.attrArn,
            logDestinationType: 'kinesis-data-firehose',
            maxAggregationInterval: 60,
            logFormat: '${srcaddr} ${dstaddr} ${account-id} ${interface-id} ${dstport}'
        } )

    }
}
