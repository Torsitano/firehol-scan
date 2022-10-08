import { APIGatewayEvent, APIGatewayEventRequestContext } from 'aws-lambda'
import { LambdaLog } from 'lambda-log'
import { decode } from 'js-base64'
import ipRangeCheck from 'ip-range-check'
import axios, { AxiosResponse } from 'axios'
import { SecurityHubClient, BatchImportFindingsCommand } from '@aws-sdk/client-securityhub'
import { HttpResponse, IpRecord, IpRecordTuple, KinesisPayload, KinesisRecord } from './interfaces'
import { BatchImportFindingsCommandInput } from '@aws-sdk/client-securityhub/dist-types/commands/BatchImportFindingsCommand'

const DEBUG: boolean = ( process.env.DEBUG_LOGS === 'true' ) ?? false
const TESTING: boolean = ( process.env.TESTING === 'true' ) ?? false
const AWS_ACCOUNT_ID: string = process.env.AWS_ACCOUNT_ID!
const AWS_REGION: string = process.env.AWS_REGION!

// Allows us to pass on private IPs to minimize processing time
const rfc1918 = [
    '10.',
    '192.168',
    '172.16',
    '172.17',
    '172.18',
    '172.19',
    '172.20',
    '172.21',
    '172.22',
    '172.23',
    '172.24',
    '172.25',
    '172.26',
    '172.27',
    '172.28',
    '172.29',
    '172.30',
    '172.31'
]


// Any key included in this array will have the value redacted for logging
const redactLogProperties: string[] = [ 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'X-Amz-Firehose-Access-Key' ]

// An array of list names to pull from the Firehol repo
const sourceLists = [ 'firehol_level1.netset', 'firehol_level2.netset', 'firehol_level3.netset', 'firehol_level4.netset' ]


export const log = new LambdaLog( {
    tags: [
        'firehol-scanner'
    ],
    debug: DEBUG,
    replacer( key: string, value: any ): any {
        if ( redactLogProperties.includes( key ) ) {
            return 'redacted'
        }
        return value
    }
} )


/**
 * The IP Map and the IP Range List are instantiated as global variables so they can be reused between Lambda
 * invocations as long as the execution environment is still around.
 * 
 * See Lambda Execution Environments for more info:
 * https://docs.aws.amazon.com/lambda/latest/operatorguide/execution-environments.html
 */
const ipMap = new Map<string, null>()
const ipRangesList: string[] = []

// Setup the client for SecurityHub in the initalization phase
const securityHubClient = new SecurityHubClient( {
    region: AWS_REGION
} )


/**
 * 
 * @param {APIGatewayEvent} event - The event coming from the API GW
 * @param {APIGatewayEventRequestContext} _context - Unused
 * @returns {HttpResponse} An HTTP response compliant with the Kinesis requirements
 */
export async function handler( event: APIGatewayEvent, _context: APIGatewayEventRequestContext ): Promise<HttpResponse> {

    if ( !event.body ) {
        return {
            statusCode: 400
        }
    }

    /**
     * This will check to see if either the Map or the Array are empty, and if so, the buildList() function
     * will be executed to retrieve the lists from the Firehol repo
     */
    if ( ipMap.size === 0 || ipRangesList.length === 0 ) {
        log.debug( 'Building list since at least one is empty' )
        await buildList()
    }

    const payload: KinesisPayload = JSON.parse( event.body )

    await checkRecords( payload )

    return buildResponse( payload )
}

/**
 * 
 * @param payload 
 * @returns 
 */
async function checkRecords( payload: KinesisPayload ): Promise<void> {
    const badIps: IpRecord[] = []

    await Promise.all( payload.records.map( async ( record: KinesisRecord ): Promise<void> => {
        let ipRecordTuple = ( JSON.parse( decode( record.data ) ) as { message: string } ).message.split( ' ' ) as IpRecordTuple

        // Objects are easier to work with down the line than a tuple, and doing this prevents duplicate .split() operations
        let ipRecord: IpRecord = {
            sourceIp: ipRecordTuple[ 0 ],
            destinationIp: ipRecordTuple[ 1 ],
            accountId: ipRecordTuple[ 2 ],
            interfaceId: ipRecordTuple[ 3 ],
            destinationPort: ipRecordTuple[ 4 ]
        }

        // any record where the destination is a local address is skipped for efficiency
        for ( let privateRange of rfc1918 ) {
            if ( ipRecord.destinationIp.startsWith( privateRange ) ) {
                return
            }
        }

        /**
         * Here we check against the IP Map, but only check against ranges if the IP is NOT found in the 
         * map. This is because the retrival from the map takes a fraction of the time of scanning all the
         * ranges, and there is no reason to check the ranges if a match is already found in the map.
         * 
         * It doesn't look as clean as the following if statement, but should be more performant when finding results:
         * 
         * `if ( ipMap.has( ipRecord.destinationIp ) || ipRangeCheck( ipRecord.destinationIp, ipRangesList ) )`
         */
        if ( ipMap.has( ipRecord.destinationIp ) ) {
            badIps.push( ipRecord )
            log.debug( `Source ${ipRecord.destinationIp} matched Map` )
            await createSecurityHubFinding( ipRecord )

        } else if ( ipRangeCheck( ipRecord.destinationIp, ipRangesList ) ) {
            badIps.push( ipRecord )
            log.debug( `Source ${ipRecord.destinationIp} matched List` )
            await createSecurityHubFinding( ipRecord )
        }

    } ) )

    if ( badIps.length !== 0 ) {
        log.debug( badIps as any )
    }

}

/**
 * 
 * @param {IpRecord} ipRecord 
 */
async function createSecurityHubFinding( ipRecord: IpRecord ): Promise<void> {

    const currentTime = ( new Date ).toISOString()

    const createFindingCommandInput: BatchImportFindingsCommandInput = {
        Findings: [
            {
                SchemaVersion: '2018-10-08',
                AwsAccountId: AWS_ACCOUNT_ID,
                Id: 'firehol-scanner',
                CreatedAt: currentTime,
                UpdatedAt: currentTime,
                FirstObservedAt: currentTime,
                LastObservedAt: currentTime,
                ProductArn: `arn:aws:securityhub:${AWS_REGION}:${AWS_ACCOUNT_ID}:product/${AWS_ACCOUNT_ID}/default"`,
                Description: `An IP within the environment has communicating with an authorized IP address.`
                    + ` - Source IP: ${ipRecord.sourceIp} - Destination IP: ${ipRecord.destinationIp} - Destination Port: `
                    + `${ipRecord.destinationPort} - Interface ID: ${ipRecord.interfaceId}`,
                Title: `Source IP ${ipRecord} Communicating With Unauthorized IP`,
                GeneratorId: 'firehol-scanner',
                Resources: [
                    {
                        Id: ipRecord.interfaceId,
                        Type: 'Interface ID',
                        Partition: 'aws',
                        Region: AWS_REGION,
                        Details: {
                            AwsEc2NetworkInterface: {
                                NetworkInterfaceId: ipRecord.interfaceId
                            }
                        }
                    }
                ],
                Network: {
                    DestinationIpV4: ipRecord.destinationIp,
                    DestinationPort: ipRecord.destinationPort,
                    SourceIpV4: ipRecord.sourceIp
                }
            }
        ]
    }

    log.debug( createFindingCommandInput as any )

    try {
        await securityHubClient.send( new BatchImportFindingsCommand( createFindingCommandInput ) )
    } catch ( err ) {
        log.error( err as any )
    }

}


/**
 * This function returns an HTTP Response object compliant with API GW and Kinesis requirements
 * 
 * Kinesis Firehose requires a response, and it must include the requestId that matches what was sent and the 
 * timestamp that the 'server'(Lambda) processed the message
 * 
 * It also requires 'content-length' since a body is being sent, and the only payload type allowed is
 * 'application/json'
 * 
 * See the following references for more information on the exepected Kinesis response structure
 * https://docs.aws.amazon.com/firehose/latest/dev/httpdeliveryrequestresponse.html#responseformat
 * https://docs.aws.amazon.com/firehose/latest/dev/http_troubleshooting.html
 * 
 * @param {KinesisPayload} payload - The payload from the Kinesis Firehose
 * @returns {HttpResponse} - An HTTP Response object
 */
function buildResponse( payload: KinesisPayload ): HttpResponse {

    const body = JSON.stringify( {
        requestId: payload.requestId,
        timestamp: Date.now()
    } )

    return {
        isBase64Encoded: false,
        statusCode: 200,
        body: body,
        headers: {
            'content-length': body.length,
            'content-type': 'application/json'
        }
    }
}


/**
 * Takes the list of IP Lists from the global variable at the beginning of the file and generates
 * a Map object of IP addresses and an array of CIDR ranges to check IPs against
 */
async function buildList(): Promise<void> {

    // Lists are gathered asynchronously for speed efficiency
    const lists: AxiosResponse<any, any>[] = await Promise.all( sourceLists.map( async ( list: string ) => {
        return axios.get( `https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/${list}` )
    } ) )

    /**
     * Allows testing the function by adding some known good IPs to the lists
     * The IP Map can be tested by hitting Google's DNS servers(8.8.8.8), and the ranges
     * can be tested by hitting OpenDNS's DNS servers
     */
    if ( TESTING ) {
        ipMap.set( '8.8.8.8', null )
        ipRangesList.push( '1.1.1.0/24' )
    }


    for ( let list of lists ) {

        // The lists include a preamble of comments that need to be ignored
        const ips: string[] = list.data.split( '\n' ).filter( ( line: string ): boolean => {
            return line.indexOf( "#" ) !== 0
        } )

        /**
         * Duplicates in the map are automatically prevented because the structure doesn't allow for duplicate
         * keys. For the Array, the CIDR range is only added if the value doesn't already exist.
         * This prevents duplicates from getting in from different lists including the same values
         */
        for ( let ip of ips ) {
            // If the IP contains a '/', it's a CIDR range
            if ( ip.indexOf( '/' ) === -1 ) {
                ipMap.set( ip, null )
            } else {
                if ( !ipRangesList.includes( ip ) ) {
                    ipRangesList.push( ip )
                }
            }
        }
    }

}