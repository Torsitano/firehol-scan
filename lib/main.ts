#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { FireholScannerStack } from './stacks/FireholScannerStack'
import { getBuildConfig } from './getBuildconfig'

const app = new cdk.App()

const buildConfig = getBuildConfig( app )

new FireholScannerStack( app, 'FireholScannerStack', {
    env: {
        account: buildConfig.devAccount,
        region: buildConfig.region
    }

} )