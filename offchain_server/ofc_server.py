import asyncio
import websockets
import json
import re
import solana.rpc.api
import borsh
import base58
from consts import *
from utils import *

# TODO: new client for each request vs one client for all requests ?
class PdaData:
    """
    Represents the data stored in a Solana Program Derived Address (PDA)

    Args:
        data (bytes): the data stored in the PDA
        serialized (bool): whether the data is serialized

    Attributes:
        data (str): the deserialized data
        serialized (bool): whether the data is serialized
    """
    def __init__(self, data, serialized=True):
        self._data = data
        self.serialized = serialized

    @property
    def data(self):
        self.deserialize()
        return self._data

    def deserialize(self):
        # | size (u32le) | data (bytes) |
        if self.serialized:
            size = int.from_bytes(self._data[:4], byteorder="little")
            self._data = self._data[4:4 + size]
            pro_msg = borsh.deserialize(PRO_MSG_SCHEMA, self._data)
            self._data = pro_msg['data']
            self.serialized = False


class Pda:
    """
    Represents a Program Derived Address (PDA) in Solana
    Used both for requests and responses

    Args:
        addr (str): the PDA address
        data (str): the data stored in the PDA
        client (solana.rpc.api.Client): the Solana client

    """
    def __init__(self, addr, data=None, client=None):
        self.addr = addr
        self.client = client
        # for response
        self._data = PdaData(data, serialized=False) if data else None

    # TODO: how can we make it async? get_account_info is sync
    @property
    def data(self):
        if self._data is None:
            debug_print("[Pda.data], addr = {}".format(self.addr))
            pda_public_key = solana.rpc.api.Pubkey(base58.b58decode(self.addr))
            account_info = self.client.get_account_info(pda_public_key)
            self._data = PdaData(account_info.value.data)
        return self._data.data


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
                res = Pda(req.addr, data=output)
                await self.res_queue.put(res)
            except Exception as e:
                print(f"[LLMRunner.run] Error: {e}")


async def main():
    req_queue = asyncio.Queue()
    res_queue = asyncio.Queue()

    request_handler = RequestHandler(req_queue)
    response_handler = ResponseHandler(res_queue)
    llm_runner = LLMRunner(req_queue, res_queue)

    await asyncio.gather(
        request_handler.run(),
        response_handler.run(),
        llm_runner.run()
    )

asyncio.run(main())
