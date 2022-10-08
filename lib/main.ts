#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { FireholScannerStack } from './stacks/FireholScannerStack'
import { getBuildConfig } from './getBuildconfig'

const app = new cdk.App()

const buildConfig = getBuildConfig( app )

new FireholScannerStack( app, 'FireholScannerStack', buildConfig, {
    env: {
        account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION
    }
} )