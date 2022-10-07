import { Context, ScheduledEvent } from 'aws-lambda'
import { LambdaLog } from 'lambda-log'
import { } from 'ip-num'

const DEBUG: boolean = ( process.env.DEBUG_LOGS === 'true' ) ?? false

const redactLogProperties: string[] = [ 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN' ]

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


export async function handler( event: ScheduledEvent, context: Context ): Promise<void> {
    log.debug( event as any )
    log.debug( context as any )



}