#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { FireholScannerStack } from './stacks/FireholScannerStack'
import { getBuildConfig } from './getBuildconfig'
//import { BaselineResourcesStack } from './stacks/BaselineResourcesStack'

const app = new cdk.App()

const buildConfig = getBuildConfig( app )

// new BaselineResourcesStack( app, 'BaselineResourcesStack', buildConfig, {
//     env: {
//         account: buildConfig.devAccount,
//         region: buildConfig.region
//     }
// } )



new FireholScannerStack( app, 'FireholScannerStack', buildConfig, {
    env: {
        account: buildConfig.devAccount,
        region: buildConfig.region
    }

} )