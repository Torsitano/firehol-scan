export interface KinesisRecord {
    data: string
}
export interface KinesisPayload {
    requestId: string,
    timestamp: number,
    records: KinesisRecord[]
}

export interface HttpResponse {
    isBase64Encoded?: boolean,
    statusCode: number,
    body?: string,
    headers?: {
        [ key: string ]: string | number | boolean
    },
    multiValueHeaders?: {
        [ key: string ]: string[]
    }
}


export type IpRecordTuple = [
    sourceIp: string,
    destinationIp: string,
    accountId: string,
    interfaceId: string,
    destinationPort: number
]

export interface IpRecord {
    sourceIp: string,
    destinationIp: string,
    accountId: string,
    interfaceId: string,
    destinationPort: number
}

export interface SecurityHubFinding {

}