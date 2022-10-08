import { APIGatewayEvent, APIGatewayEventRequestContext } from 'aws-lambda'
import { LambdaLog } from 'lambda-log'
import { decode } from 'js-base64'
import ipRangeCheck from 'ip-range-check'
import axios, { AxiosResponse } from 'axios'
import { exit } from 'process'

const DEBUG: boolean = ( process.env.DEBUG_LOGS === 'true' ) ?? false
const redactLogProperties: string[] = [ 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'X-Amz-Firehose-Access-Key' ]
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

const ipMap = new Map<string, null>()
const ipRangesList: string[] = []

export interface KinesisRecord {
    data: string
}
export interface KinesisPayload {
    requestId: string,
    timestamp: number,
    records: KinesisRecord[]
}

export interface HttpResponse {
    isBase64Encoded: boolean,
    statusCode: 200,
    body: string,
    headers?: {
        [ key: string ]: string | number | boolean
    },
    multiValueHeaders?: {
        [ key: string ]: string[]
    }
}




//@ts-ignore
export async function handler( event: APIGatewayEvent, context: APIGatewayEventRequestContext ): Promise<HttpResponse> {

    if ( !event.body ) {
        exit()
    }

    if ( ipMap.size === 0 || ipRangesList.length === 0 ) {
        log.debug( 'Building list since at least one is empty' )
        await buildList()
    }

    const payload: KinesisPayload = JSON.parse( event.body )

    const badIps: [ string, string ][] = []

    payload.records.map( record => {
        let [ src, dst ] = ( JSON.parse( decode( record.data ) ) as { message: string } ).message.split( " " )

        if ( dst.startsWith( '10.' || '192.168.' ) ) {
            return
        }

        if ( ipMap.has( dst ) ) {
            badIps.push( [ src, dst ] )
        } else if ( ipRangeCheck( dst, ipRangesList ) ) {
            badIps.push( [ src, dst ] )
        }
    } )

    if ( badIps.length !== 0 ) {
        log.debug( badIps as any )
    }


    const body = JSON.stringify( {
        requestId: payload.requestId,
        timestamp: Date.now()
    } )

    const response: HttpResponse = {
        isBase64Encoded: false,
        statusCode: 200,
        body: body,
        headers: {
            'content-length': body.length,
            'content-type': 'application/json'
        }
    }

    return response
}


export async function buildList(): Promise<void> {
    console.time( 'build' )


    const lists: AxiosResponse<any, any>[] = await Promise.all( sourceLists.map( async ( list: string ) => {
        return axios.get( `https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/${list}` )
    } ) )


    for ( let list of lists ) {

        const ips: string[] = list.data.split( '\n' ).filter( ( line: string ): boolean => {
            return line.indexOf( "#" ) !== 0
        } )

        for ( let ip of ips ) {
            // If the IP contains a '/', it's a CIDR range and needs to be expanded
            if ( ip.indexOf( '/' ) === -1 ) {
                ipMap.set( ip, null )
            } else {
                ipRangesList.push( ip )
            }
        }
    }
    console.timeEnd( 'build' )
}