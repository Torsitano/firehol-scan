# Firehol Scanner

This repository contains IaC and TypeScript code to deploy a near-realtime VPC Flow Logs scanner. AWS recently released the ability to send [VPC Flow Logs directly to Kinesis](https://aws.amazon.com/blogs/networking-and-content-delivery/introducing-amazon-vpc-flow-logs-kinesis-data-firehose/), so this project was an exploration into that feature as well as an opportunity to get some more exposure to Kinesis Firehose.


## Architecture

The flow of the solution is: **Flow Logs -> Kinesis Firehose -> API GW -> Lambda -> SecurityHub**

Flow Logs are sent directly to the Kinesis Firehose Stream using the new feature added by AWS. The Kinesis Firehose is configured for an HTTP Endpoint, provided by the API Gateway, which passes the traffic back to the Lambda. 


## Scanner

The scanner works by comparing IP addresses from Flow Logs against IP Lists retrieved from the [Firehol blocklist-ipsets GitHub repo](https://github.com/firehol/blocklist-ipsets).

The scanner checks agsinst both individual IP addresses and CIDR ranges, and if a match is found, a SecurityHub Finding is generated. 

Currently the default configuration for the scanner is to check against all four levels of the Firehol lists, but others can be added by name in the Lambda.


## Lambda Execution Environment

The way that the [Lambda Execution Environment](https://docs.aws.amazon.com/lambda/latest/operatorguide/execution-environments.html) works was taken into consideration and leveraged for this solution. Variables/actions completed before the Handler is executed allows certain data to persist between invocations, provided the environment hasn't been cleaned up. Since some of the more inefficient parts of the Lambda include retriving IP Lists, this is only done when a new Execution Environment is setup. The data is then reused throughout invocations, along with other infomation such as the `dupCheck`.

In situations where there isn't a high load and the environment is cleaned up often, the latency from grabbing lists is irrelevant. In sitatuions with high load, the envrionment is much more likely to persist, which eliminates a lot of that traffic.

Additionally, since the environments will be recycled fairly regularly, this ensures that the IP Lists the Lambda is using are always up to date from what is in GitHub.


## Integration with SecurityHub

SecurityHub was chosen as the destination for these alerts since it's commonly setup in Accounts already. Other alerting options could be chosen, like email, but those require additional config and are not always as straightforward to integrate into a standard alert flow.

If SecurityHub is in use and configured appropriately, alerts from SecurityHub likely already bubble up into whatever chosen system a company chooses. Approaching the integration from this perspective should allow these alerts to automatically be ingested alongside other findings.

A SHA1 hash of the Source IP, Destination IP, and Destination Port is used as the Finding ID for the SecurityHub Finding. This prevents duplicate alerts from being generated from the same traffic since issues will take time to investigate and resolve, but allows sufficient granularity to identify if a source is reaching out to multiple unwanted destinations, or across multiple ports.


## Testing

The Lambda looks for an environment variable called `TESTING` that adds `8.8.8.8` and `1.1.1.0/24` to the Map/Range List. You can test the solution end-to-end by pinging/telneting `8.8.8.8` and `1.1.1.1` from an EC2 Instance and verify that SecurityHub Findings are created.


# Efficiency/Optimization/Benchmarks

While planning this out I had serious concerns around the efficiency of the code, since processing all VPC Flow Logs has the potential to be pretty demanding. I did the following tests and made the following decisions with that consideration in mind.


### Basic Benchmarking

Since there was the potential to hold millions of IP addresses that would constantly be scanned against, I wanted to avoid the approach of repeately iterating through an array of IP address for each log event.

I did some basic benchmarking with Maps, Sets, and Arrays. I found that in very small sets, using `array.includes()` actually outperformed Maps and Sets, but this was with sets small enough to not really matter(~few hundred IPs). When expanding to much larger sets, Maps and Sets *drastically* outperformed Arrays, which was expected. During testing Maps usually outperformed Sets.

To test this, I made an array of 20 random IPs to simulate the Flow Log IPs. I then created a Map, a Set, and an array containing all the IP addresses from a /9 network, approximately 8.4 million IPs. I then timed(using `console.time()`) how long it took to check all 20 test IPs against each. Here's an example from my most recent test:

```
starting...
# of IPs: 8388608
set: 0.028ms
map: 0.021ms
array: 356.868ms
```

Map and Set were pretty similar, but `map.has()` was roughly 16,850x faster than iterating through the array. This is substantial when attempting to do near-realtime scanning.


### Expanding vs Not Expanding IP Ranges

My initial intent was to take the CIDR ranges from the lists and expand them to individual IPs, since the performance of the Map is so good and doesn't increase much with size. Unfortunately this wasn't as straightforward as intended, the process of expanding many CIDR ranges caused RAM utilization issues. While giving the Lambda a lot of RAM and increasing what node was allowed to use likely would have allowed it to run, I didn't like this approach.

I may revisit in the future to see if there is a way to streamline this process and avoid memory issues, but was more than I wanted to do at the moment. Instead, IPs are checked against CIDR ranges using [ip-range-check](https://github.com/danielcompton/ip-range-check), which isn't nearly as performant as a Map.


### Only Checking Destination IP, Not Checking Private IPs, and Removing Duplicate IPs

Since the check against a CIDR range is much less performant than querying a Map, and every list must be checked for each IP, I wanted to minimize the number of IPs that I was checking as much as possible.

The easiest decision for that was to not check private IPs. Since the intent is to scan for malicious activity against public IP lists, there was no reason to scan traffic going to IPs in the RFC1918 space. This is done using `startsWith()` and looking at the first octets of each IP, skipping over anything in the `10.`, `192.168`, and `172.16`-`172.31` space.

I also figured that only looking at outbound traffic was sufficient for this. Since in most situations network traffic will be two ways(for established connections), there was no reason to check both source and destination IPs for each event. This also prevents scanning of traffic that could be rejected by your servers/Security Groups/etc, which is traffic that wouldn't be worth alerting on.

Lastly, the Lambda generates and keeps a Map of consisting of the Source IP, Destination IP, and Destination Port as a concatenated string as the Map key, and skips over processing duplicates. This is only persistent as long as the Lambda Execution Environment is active, but prevents a lot of duplicate processing.



# Future Plans

- Move list config out of Lambda and into a config file
- Modify retrieval method to get more up to date lists from the site, since there is a delay with GitHub
- Convert to Rust for better speed
- Add the ability to pass in additional lists as desired
- Convert the Flow Logs IaC to the L2 Construct when it supports Kinesis as a destination
- Better severity handling for Findings