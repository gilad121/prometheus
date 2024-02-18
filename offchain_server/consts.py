import borsh
import os

PROGRAM_ID = "HXbL7syDgGn989Sffe7JNS92VSweeAJYgAoW3B8VdNej"

SOLANA_ENDPOINT = "https://api.devnet.solana.com"
RPC_URL = "wss://muddy-twilight-asphalt.solana-devnet.quiknode.pro/7a968c5d6d32fde5ae3cdc4af11606e129d0debb/"

WS_SUBSCRIBE_MSG = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "logsSubscribe",
    "params": [
        {
            "mentions": [PROGRAM_ID]
        },
        {
            "commitment": "confirmed"
        }
    ]
}

PRO_MSG_SCHEMA = borsh.schema({
    'data': borsh.types.string
})

GPT_API_KEY = os.getenv('CHATGPT_API_KEY')
GPT_MAX_TOKENS = 1000

OFCS_CLIENT_PATH = "typescript_ofc_client/ofcs_client.js"

debug_mode = True