
## All 4 firehol lists

objTest: 1.782ms
arrayTest: 1.365ms
range length 10864
map length: 217062
build: 322.952ms


```typescript
    console.time( 'objTest' )
    let testIp1 = IPv4CidrRange.fromCidr( '1.10.16.1/32' )
    for ( let range of ipRangesObj ) {
        if ( range.contains( testIp1 ) ) {
            console.log( 'found' )
            break
        }
    }

    console.timeEnd( 'objTest' )


    console.time( 'arrayTest' )
    let testIp2 = '1.10.16.1'
    if ( ipRangeCheck( testIp2, ipRangesList ) ) {
        console.log( 'found' )
    }
    console.timeEnd( 'arrayTest' )





    console.log( `range length ${ipRangesObj.length}` )
    console.log( `map length: ${ipMap.size}` )
```



startsWith: 0.006ms
rangeCheck: 1.066ms

```typescript
console.time( 'startsWith' )
'10.1.1.1'.startsWith( '10.' || '192.168.' )
console.timeEnd( 'startsWith' )

console.time( 'rangeCheck' )
ipRangeCheck( '1.1.1.1', '10.0.0.0/8' )
console.timeEnd( 'rangeCheck' )

```


misc test
```typescript
// const msg: { message: string } = JSON.parse( decode( 'eyJtZXNzYWdlIjoiMjA2LjgxLjEuODAgMTAuMC4yLjIzNCJ9Cg==' ) )

// console.log( `Src: ${msg.message.split( " " )[ 0 ]}, Dst: ${msg.message.split( " " )[ 1 ]}` )

// export interface RecordData {
//     src: string,
//     dst: string
// }
```