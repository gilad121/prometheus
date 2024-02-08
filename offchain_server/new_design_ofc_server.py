import tempfile
import asyncio
import websockets
import json
import re
import tempfile
import subprocess
import solana.rpc.api
import borsh
import base58
import openai.OpenAI

PROGRAM_ID = "HXbL7syDgGn989Sffe7JNS92VSweeAJYgAoW3B8VdNej"
OFCS_CLIENT_PATH = "typescript_ofc_client/ofcs_client.js"
API_KEY = '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'
MAX_TOKENS = 1000
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

pro_msg_schema = borsh.schema({
    'data': borsh.types.string
})

req_queue = asyncio.Queue()
res_queue = asyncio.Queue()

debug_mode = True
def debug_print(*args, **kwargs):
    if debug_mode:
        print(*args, **kwargs)


class PdaData:
    def __init__(self, data, deserialize=True):
        self.data = data
        self.deserialize = deserialize

    def get_data(self):
        if self.deserialize:
            self.deserialize()
        return self.data

    def deserialize(self):
        # | size (u32le) | data (bytes) |
        size = int.from_bytes(self.data[:4], byteorder="little")
        self.data = self.data[4:4 + size]
        pro_msg = borsh.deserialize(pro_msg_schema, self.data)
        self.data = pro_msg['data']

class PDA:
    def __init__(self, addr, client):
        self.addr = addr
        self.client = client
        self.data = None

    def get_data(self):
        debug_print("[read_data_from_pda], pda = {}".format(pda))
        # TODO: commitment == "confirmed" ?
        # TODO: new client for each request vs one client for all requests ?
        # client = solana.rpc.api.Client("http://localhost:8899", "confirmed")

        # string -> PublicKey
        pda_public_key = solana.rpc.api.Pubkey(base58.b58decode(pda))
        account_info = self.client.get_account_info(pda_public_key)
        self.data = PdaData(account_info.value.data)
        # debug_print("[read_data_from_pda] data = {}".format(data))
        # or maybe just self.data?
        return self.data

class Log:
    def __init__(self, data, client):
        self.data = data
        self.requests = []

    def get_requests(self):
        self.find_requests()
        return self.requests

    def find_requests(self):
        matches = re.findall(r'action:request pda:(\w+)', str(self.data))
        for match in matches:
            pda = Pda(match.group(1), self.client)
            self.requests.append(pda)


class RequestHandler:
    # TODO: ws operations - where async / non async
    def __init__(self, req_queue, rpc_url="ws://127.0.0.1:8900", subscribe_msg=WS_SUBSCRIBE_MSG):
        self.req_queue = req_queue
        self.rpc_url = rpc_url
        self.subscribe_msg = subscribe_msg
        self.solana_client = solana.rpc.api.Client("http://localhost:8899", "confirmed")

    def init_websocket(self):
        # async or something?
        self.websocket = websockets.connect(self.rpc_url)

    def subscribe_to_logs(self):
        # async or something?
        self.websocket.send(json.dumps(self.subscribe_msg))

    async def run(self):
        self.init_websocket()
        self.subscribe_to_logs()
        while True:
            data = await self.websocket.recv()
            log = Log(json.loads(data), self.solana_client)
            await log.get_requests()
            for req in reqs:
                await req_queue.put(req)


class Response:
    def __init__(self, pda, data):
        self.pda = pda
        self.data = data

    def get_data(self):
        return self.data


class ResponseHandler:
    def __init__(self, res_queue):
        self.res_queue = res_queue

    async def run(self):
        while True:
            res = await self.res_queue.get()
            self.send_response(res)

    async def send_response(res):
        file_path = create_temp_file(res)
        run_node_client(file_path)


class LLMRunner:
    def __init__(self, res_queue):
        self.res_queue = res_queue

    async def run(self):
        while True:
            req = await self.req_queue.get()
            # TODO: sync function in different thread - is it the right way?
            # output = await asyncio.get_running_loop().run_in_executor(None, chat_with_gpt, req.data)
            output = chat_with_gpt(req.data)
            # TODO: combinde PDA and Response?
            res = Response(req.pda, output)
            await self.res_queue.put(res)


## utils
def create_temp_file(res):
    temp_file = tempfile.NamedTemporaryFile(suffix=".txt", delete=False)
    temp_file_path = temp_file.name
    temp_file.write(f"{res.pda}\n{res.get_data()}".encode())
    temp_file.close()
    return temp_file_path


async def run_node_client(file_path):
    command = ["node", OFCS_CLIENT_PATH, file_path]
    debug_print("[write_responses_loop] running {}".format(command))
    process = await asyncio.create_subprocess_exec(*command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    
    # Wait for the process to complete
    stdout, stderr = await process.communicate()
    debug_print("[write_responses_loop] stdout = {}".format(stdout.decode().strip()))
    debug_print("[write_responses_loop] stderr = {}".format(stderr.decode().strip()))
    
    output = stdout.decode().strip()
    debug_print("[write_responses_loop] node program output = {}".format(output))

# TODO Make this also a class?
def chat_with_gpt(prompt="", model="gpt-3.5-turbo", temperature=0.75, max_tokens=MAX_TOKENS):
    debug_print("[chat_with_gpt]")
    if prompt == "":
        raise ValueError("Prompt cannot be empty")
    try:
        client = openai.OpenAI(api_key=API_KEY)
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        content = chat_completion.choices[0].message.content
        debug_print("[chat_with_gpt] gpt response: {}".format(content))
        return content
    except Exception as e:
        debug_print("[chat_with_gpt] failed with err: {}".format(str(e)))        
        return ""

async def main():
    request_handler = RequestHandler(req_queue)
    response_handler = ResponseHandler(res_queue)
    LLMRunner = LLMRunner(res_queue)

    await asyncio.gather(
        request_handler.run(),
        response_handler.run(),
        LLMRunner.run()
    )

asyncio.run(main())

# 8.2 summary
# The new design of the offchain server is a modular rewrite of the old design. The main tasks are:
# - RequestHandler: listens to the solana logs and puts the requests in the req_queue.
# - LLMRunner: takes the requests from the req_queue, calls chatgpt api and puts the responses in the res_queue.
# - ResponseHandler: listens to the res_queue and sends the responses to the TypeScript client.
#
# Didn't test it yet at all
# Need to understand better asyncio stuff - where yes where no
