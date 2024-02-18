# Prometheus
consists of 3 units
1. solana program - `solana_program`
2. offchain server - `offchain_server`
3. client - `client`

# solana program
receives 2 types of instructions
1. request (chunked) - writes all chunks to user's pda
2. response (chunked) - writes all chunks to a given pda

emits "action:request" / "action:response"

# offchain server
Manages response logic
- Waits for new request (online logs through websocket)
- for each request -> put in request queue
- for each request in request queue -> makes an api call to chatgpt, then puts response in response queue
- for each response in response queue -> creates a transaction with response instruction and sends to the solana program
    by calling ofcs_client.js ("compiled" tsx)

main logic is async

Handles rsa decryption and borsh deserialization

typescript client used for sending transactions (and serialization and encryption) - typescript_ofc_client/ofcs_client.tsx

# client
For each user request - encrypts, serializes, splits into chunks and send transactions.
Then, waits for response by listening to all logs emitted by the solana program related to the user's pda until receives "action:response pda:<user-pda>".

# comminication protocol
request:
    | total size (uint32le) | key size (uint32le) | client public key | serialized data |
    total size = size of the buffer not including itself
    key size - client public key (currently const 2048, but keep generic)
    client public key - rsa 2048 key
    serialized data - (after encryption) serialized using borsh

    splits into chunks sized `CHUNK_SZ` and serializes each (borsh)
    each chunk:
        `index: 'u32',
        totalChunks: 'u32',
        size: 'u32',
        data: { array: { type: 'u8' }}`

response:
    | size (uint32le) | serializedData |
    data is encrypted with client's rsa public key


# encryption
client -> server: rsa using server's public key
server -> client: rsa using client's public key (sent as metadata in request)

`const ENC_BLOCK_SZ = 190;
const DEC_BLOCK_SZ = 256;`
because node-forge is a little shit (bugs otherwise)


# issues
- pda size
- chunk size
- when to allocate pda - register instruction?


# environment setup
- typescript (client, ofcs-client)
    - solana 1.89.1
    - borsh 2.0
    - node-forge 1.3.1
