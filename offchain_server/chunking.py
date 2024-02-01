'''
client
1. receive data from user, encrypt serialize etc
2. split into chunks of size x
3. send each chunk as transaction (chunk header - chunk number, total chunks, offset, length)

solana program - request
4. a chunk is received by write_request
5. write chunk to pda using offset and length
6. if chunk number == total chunks, msg!("action:process_request pda:<pda>")

offchain server
7. wait for "action:process_request pda:<pda>" log
8. read pda, derserialize, decrypt etc
9. send data to gpt
10. receive response from gpt
11. encrypt, serialize etc
12. split into chunks of size x
13. send each chunk as transaction (chunk header - chunk number, total chunks, offset, length)

solana program - response
14. a chunk is received by write_response
15. write chunk to pda using offset and length
16. if chunk number == total chunks, flip is_processed flag on pda (request/response bit)

thoughts
- use websocket in client? this way we could just log event when response is ready
    - we can do this if we can filter specific logs, this way we will only filter the log we want (with our pda)
        - logSubscribe with mention of pda should work
        - requires client to use websocket
        - can just poll for response bit (can make it wite 3 states - not processed, processing, processed)
'''