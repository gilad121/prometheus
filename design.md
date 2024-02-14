# DESIGN 1
user pubkey <-> PDA
PDA is generated in the program but can be reproduced in the client

node pubkey <-> PDA

program itself also has PDA - bank-PDA

PDA (address)
    amount
    data
        | req/res | text |

CLIENT
0. register
    call program's register user [P]
1. deposit
    transact amount from wallet to PDA [C]
2. withdraw
    call to program (transact from PDA to wallet) [P]
3. send message / write to PDA [P]
    send request - call program's write request
    receive response - poll read from PDA's data
    
SOLANA PROGRAM
1. register user
    create PDA for the user
2. withdraw
    transact from user's PDA to user's wallet (pubkey)
        - PDA is 1:1 with user pubkey because one of the seeds (for generating the PDA) is the user's pubkey, so we can verify
        - or we can hold hash-map between PDA and user's pubkey, and then this function only recieves PDA and send the money to the corresponding pubkey
3. write request(user_pda, data)
    write data to given user-PDA, send money from user-PDA to bank-PDA
    validates user_pda corresponds to user_pubkey
4. write response(node, data)
    write data to given user-PDA, send money from bank-PDA to node-PDA
    (node should be validated)
    
OFFCHAIN SERVER
1. read (request) loop
    fetch program's events (using websocket, json api rpc)
    for each "request" in events
        requests_queue.append(request) (pda, data)
2. write (response) loop
    for each response in responses-queue
        call program's write to PDA with the response
3. business logic
    for each request in requests-queue
        run_llm(request.data)
4. run_llm (async ideally)
    output = run_on_gpu(input)
    responses-queue.add(output)
5. register node
    create pda for the node
6. withdraw
    call program's withdraw


ISSUES
    anyone can impersonate to any user by using its PDA - Only way to avoid this is by the user signing with his private key
    and then this is equal to just sending a transaction for every message
    
    
# DESIGN 2
data written to user's pda (request / response)
    | text | REQUEST / RESPONSE |
user_pda per user for data
treasury_pda
request_price - also covers the transaction fee of the node (when sending the response)

CLIENT
1. register (required)
    call program's register_user [P]
2. send_message(msg)
    data = (pubkey, msg)
    send_request - call program's write_request (also sending request_price amount) [P]
    receive_response - poll read from PDA's data [P]
    
SOLANA PROGRAM
0. initialize
1. register_user
    create PDA for the user (seeds - program_id, user_pubkey)
2. write_request(user_pubkey, text)
    validate signed by user
    validate sent amount >= request_price
    data = (text, REQUEST)
    write data to user_pda (derived from pukey and prog_id)
3. write_response(node_pubkey, target_pda, text)
    validate signed by node
    validate node_pubkey is in validated_nodes
    data = (text, RESPONSE)
    write data to target_pda
    send response_reward amount to node_pubkey
    
OFFCHAIN SERVER
1. read (request) loop
    fetch program's events (using websocket (quicknode?), json api rpc)
    for each request in events
        request_queue.append(request)
2. write (response) loop
    for each response in response_queue
        call program's write_response(pubkey, response.pda, response.text)
3. business logic
    for each request in request_queue
        run_llm(request)
4. run_llm(request)
    output = run_on_gpu(request.text)
    response = (request.pda, output)
    response_queue.add(response)
    
# TOUGHTS
    do we need treasury_pda?
    how do we make the conversation stateful (i.e. user can refer to previous messages he has sent)
    why do we need user pda? can just
        user sends transaction to program with money and data (and saves txid (or with nonce))
        ofcs(offchain server) will read this transaction, run llm and calc output
        ofcs send transaction with response and request_tx_id (or nonce)
        user polls on a tranaction with the request_tx_id?
        [sounds expensive for the user, because needs to go over all transactions and find the relevant one]
   
    solana how to read data from specific pda
    you have the address, if so -> instead of storing the data in the pda,
    we can just send it to the pda and it will be in account's transaction history
    if so
        user sends transaction to its pda with data (and money - to its pda or treasury pda)
            or just call ix from sp (solana program) that write the data to the pda (how - transaction?)
        ofcs(offchain server) will read this transaction, run llm and calc output
        ofcs send transaction to target pda
        user polls on a tranaction with the request_tx_id?
        [sounds expensive for the user, because needs to go over all transactions and find the relevant one]
        
        how to write data to pda? can user send trasaction direct to the pda?
        if we only use transaction to pda and no writing to pda - How do we integrate payments?

    do we really need a register api call? can just check if PDA exists in write_request (like now)

# Docs
~ lib.rs ~
while account max size is 10mb, maximum permitted size of a reallocation in an inner instruction is 10kb,
and in our case we create the pda through calling invoke_signed (cpi)
hence if we want to allocate more than 10kb - we should call it directly (only from client?)

create a register instruction?

solana maximum transaction size is 1232 bytes

possible to define somehow the "real size" of a pda (e.g. setting it somehow s.t. when reading the data you only
get X out of Y bytes. This way we can only read the message and not the entire pda)?

pda - | size (4) | msg (len) |

# encryption
client -> server: client ecrypts with server pubkey
    - how gets sever pubkey?
        - pulls from offchain server (db)
        - pulls from "server pubkey pda"
        - constant in client code
server -> client: server encrypts with client pubkey
    - how gets client key? pulls from server?
        - pulls from offchain server (db)
        - pulls from client's pda

client reads server pubkey from const in code
server reads client's pubkey from pda (| size | key | data |)

python and typescript rsa doesn't work well together
so we either do all enc stuff in python or ts
python sounds hard because we need to run python in client
ts means in python for each enc/dec we run enc.js
