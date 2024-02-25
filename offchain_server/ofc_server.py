import asyncio
import websockets
import json
import re
import solana.rpc.api
import borsh
import base58
from consts import *
from utils import *
from encryption import aes_decrypt, aes_encrypt, decrypt_with_server_private_key

class Pda:
    def __init__(self, addr, client=None, data=None, serialized=True, key=None, iv=None):
        self.addr = addr
        self.client = client
        self._data = data
        self.serialized = serialized
        self.key = key
        self.iv = iv

    @property
    def data(self):
        if self._data is None and self.client is not None:
            debug_print("[Pda.data], addr = {}".format(self.addr))

            pda_public_key = solana.rpc.api.Pubkey(base58.b58decode(self.addr))
            account_info = self.client.get_account_info(pda_public_key)
            self._data = account_info.value.data

            self.deserialize()
            self.decrypt()
        
        return self._data

    def deserialize(self):
        if self.serialized:
            encrypted_key_iv_size = int.from_bytes(self._data[0:4], byteorder="little")
            encrypted_key_iv = self._data[4:4 + encrypted_key_iv_size]

            decrypted_key_iv = decrypt_with_server_private_key(encrypted_key_iv)

            key = decrypted_key_iv[:AES_KEY_SIZE]
            iv = decrypted_key_iv[AES_KEY_SIZE:AES_KEY_SIZE + AES_IV_SIZE]

            self.key = key
            self.iv = iv

            data_size_start = 4 + encrypted_key_iv_size
            data_size = int.from_bytes(self._data[data_size_start:data_size_start + 4], byteorder="little")
            
            data_start = data_size_start + 4
            data = self._data[data_start:data_start + data_size]
            pro_msg = borsh.deserialize(PRO_MSG_SCHEMA, data)
            self._data = pro_msg['data']

            self.serialized = False

    def decrypt(self):
        if self.key and self.iv:
            self._data = aes_decrypt(self._data, self.key, self.iv)

    def encrypt(self):
        if self.key and self.iv:
            self._data = aes_encrypt(self._data, self.key, self.iv)
            self.encrypted = True


class Log:
    """
    Represents a log of Solana program events

    Args:
        data (dict): the log data
        client (solana.rpc.api.Client): the Solana client

    Attributes:
        requests (list): the requests found in the log
    """
    def __init__(self, data, client):
        self.data = data
        self.client = client
        self._requests = []

    @property
    def requests(self):
        self.find_requests()
        return self._requests

    def find_requests(self):
        addrs = re.findall(r'action:request pda:(\w+)', str(self.data))
        for addr in addrs:
            pda = Pda(addr, client=self.client)
            self._requests.append(pda)


class RequestHandler:
    """
    Handles requests from the Solana program

    Args:
        req_queue (asyncio.Queue): the queue to put the requests in
        rpc_url (str): the Solana RPC URL
        subscribe_msg (dict): the message to send to the Solana RPC to subscribe to logs
    
    """
    def __init__(self, req_queue, rpc_url=RPC_URL, subscribe_msg=WS_SUBSCRIBE_MSG):
        self.req_queue = req_queue
        self.rpc_url = rpc_url
        self.subscribe_msg = subscribe_msg
        self.websocket = None
        self.solana_client = solana.rpc.api.Client(SOLANA_ENDPOINT, "confirmed")

    async def run(self):
        try:
            async with websockets.connect(self.rpc_url) as websocket:
                await websocket.send(json.dumps(self.subscribe_msg))
                while True:
                    try:
                        data = await websocket.recv()
                        log = Log(json.loads(data), self.solana_client)
                        for req in log.requests:
                            await self.req_queue.put(req)
                    except Exception as e:
                        print(f"[RequestHandler.run] Error: {e}")
        except Exception as e:
            print(f"[RequestHandler.run] Error: {e}")


class ResponseHandler:
    """
    Handles responses to the Solana program

    Args:
        res_queue (asyncio.Queue): the queue to get the responses from
    """
    def __init__(self, res_queue):
        self.res_queue = res_queue

    async def run(self):
        while True:
            try:
                res = await self.res_queue.get()
                await send_response(res)
            except Exception as e:
                print(f"[ResponseHandler.run] Error: {e}")

class LLMRunner:
    """
    Runs the LLM (Language Learning Model) to respond to requests

    Args:
        req_queue (asyncio.Queue): the queue to get the requests from
        res_queue (asyncio.Queue): the queue to put the responses in
    """
    def __init__(self, req_queue, res_queue):
        self.req_queue = req_queue
        self.res_queue = res_queue

    async def run(self):
        while True:
            try:
                req = await self.req_queue.get()
                # output = await asyncio.get_running_loop().run_in_executor(None, chat_with_gpt, req.data)
                output = chat_with_gpt(req.data)
                res = Pda(req.addr, data=output, serialized=False, key=req.key, iv=req.iv)
                await self.res_queue.put(res)
            except Exception as e:
                print(f"[LLMRunner.run] Error: {e}")


async def main():
    req_queue = asyncio.Queue()
    res_queue = asyncio.Queue()

    request_handler = RequestHandler(req_queue)
    response_handler = ResponseHandler(res_queue)
    llm_runner = LLMRunner(req_queue, res_queue)

    print("Prometheus is listening bitches")
    await asyncio.gather(
        request_handler.run(),
        response_handler.run(),
        llm_runner.run()
    )

asyncio.run(main())
