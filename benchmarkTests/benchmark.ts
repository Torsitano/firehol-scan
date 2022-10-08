
import { IPv4CidrRange } from 'ip-num/IPRange'
import ipRangeCheck from 'ip-range-check'
import * as crypto from 'crypto'

console.log( 'starting...' )

const testArray = [ '10.0.0.1', '192.168.5.6', '5.3.4.6', '192.168.1.10', '192.168.1.20', '10.0.0.2', '192.168.5.7', '5.3.4.8', '192.168.1.101', '192.168.1.210', '10.0.0.13', '192.168.5.36', '5.3.4.64', '192.168.1.110', '192.168.1.220', '10.0.0.19', '192.168.5.69', '5.3.4.68', '192.168.1.107', '192.168.1.206' ]

let ipRange = IPv4CidrRange.fromCidr( '10.0.0.0/10' )

console.time( 'makeList' )
const list = ipRange.take( ipRange.getSize() )
console.timeEnd( 'makeList' )

console.log( `# of IPs: ${list.length}` )

//const ipSet = new Set<string>()
const ipMap = new Map<string, null>()
//const ipArray: string[] = []

console.time( 'toString' )
for ( let ip of list ) {
    //ipSet.add( ip.toString() )
    ipMap.set( ip.toString(), null )
    //ipArray.push( ip.toString() )
}
console.timeEnd( 'toString' )

// console.time( 'set' )
// for ( let test of testArray ) {
//     ipSet.has( test )
// }
// console.timeEnd( 'set' )

console.time( 'map' )

for ( let test of testArray ) {
    ipMap.has( test )
}
console.timeEnd( 'map' )

console.time( 'startsWith' )
'10.1.1.1'.startsWith( '10.' || '192.168.' )
console.timeEnd( 'startsWith' )

console.time( 'rangeCheck' )
ipRangeCheck( '1.1.1.1', '10.0.0.0/8' )
console.timeEnd( 'rangeCheck' )

// console.time( 'array' )
// for ( let test of testArray ) {
//     ipArray.includes( test )
// }
// console.timeEnd( 'array' )

//@ts-ignore

const str = '192.168.1.1' + '1.1.1.1' + '443'

const hash = crypto.createHash( 'md5' ).update( str )
console.log( hash )
console.log( hash.digest() )

//@ts-ignore
export async function handler( event: any, context: any ): Promise<void> {
}