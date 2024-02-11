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

class Event:
    def __init__(self, pda: str, data: str):
        self.pda = pda
        self.data = data

pro_msg_schema = borsh.schema({
    'data': borsh.types.string
})

req_queue = asyncio.Queue()
res_queue = asyncio.Queue()

debug_mode = True
def debug_print(*args, **kwargs):
    if debug_mode:
        print(*args, **kwargs)
        
# TODO: get rid of default value for prompt and just fail if no prompt
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
        debug_print("[chat_with_gpt] gpt response: {}".format(chat_completion.choices[0].message.content))
        return chat_completion.choices[0].message.content
    except Exception as e:
        debug_print("[chat_with_gpt] failed with err: {}".format(str(e)))        
        return ""


# async def subscribe_to_program_logs(program_id,
#                                     rpc_url="wss://muddy-twilight-asphalt.solana-devnet.quiknode.pro/7a968c5d6d32fde5ae3cdc4af11606e129d0debb/"):
async def request_handler(rpc_url="ws://127.0.0.1:8900"):
    debug_print("[read_requests_loop]")
    async with websockets.connect(rpc_url) as websocket:

        await websocket.send(json.dumps(WS_SUBSCRIBE_MSG))
        
        while True:
            debug_print("[read_requests_loop] Waiting for logs...")
            data = await websocket.recv()
            debug_print(f"[read_requests_loop] Received logs")

            logs = json.loads(data)
            await handle_logs(logs)


# TODO: change name
async def handle_logs(logs):
    if "params" in logs and "result" in logs["params"]:
        debug_print("[handle_logs]")

        if debug_mode:
            with open("logs.log", "a") as f:
                json.dump(logs, f)

        reqs = await get_requests_from_logs(logs)
        for req in reqs:
            debug_print("[handle_logs] adding request to queue, pda = {}, data = {}".format(req.pda, req.data))
            await req_queue.put(req)


def get_requests_from_logs(logs):
    requests = []
    matches = re.findall(r'action:request pda:(\w+)', str(logs))
    for match in matches:
        pda = match.group(1)
        data = read_data_from_pda(pda)
        requests.append(Event(pda, data))
    return requests


def read_data_from_pda(pda):
    debug_print("[read_data_from_pda], pda = {}".format(pda))
    # TODO: commitment == "confirmed" ?
    # TODO: new client for each request vs one client for all requests ?
    client = solana.rpc.api.Client("http://localhost:8899", "confirmed")

    # string -> PublicKey
    pda_public_key = solana.rpc.api.Pubkey(
        base58.b58decode(pda)
    )

    account_info = client.get_account_info(pda_public_key)
    data = account_info.value.data
    debug_print("[read_data_from_pda] data = {}".format(data))
    deserialized_data = deserialize_data(data)

    return deserialized_data


def deserialize_data(data):
    '''Deserialize the data retrieved from pda'''
    # | size (u32le) | data (bytes) |
    size = int.from_bytes(data[:4], byteorder="little")
    data = data[4:4 + size]
    pro_msg = borsh.deserialize(pro_msg_schema, data)
    return pro_msg['data']


async def run_llm(req):
    debug_print("[run_llm]")
    # TODO: sync function in different thread - is it the right way?
    output = await asyncio.get_running_loop().run_in_executor(None, chat_with_gpt, req.data)
    res = Event(req.pda, output)
    await res_queue.put(res)


async def run_llm_loop():
    debug_print("[run_llm_loop]")
    while True:
        debug_print("[run_llm_loop] waiting for request from queue")
        req = await req_queue.get()
        debug_print("[run_llm_loop] got request: pda = {}, data = {}".format(req.pda, req.data))
        await run_llm(req)


async def write_responses_loop():
    debug_print("[write_responses_loop]debug_print")
    while True:
        debug_print("[write_response_loop] waiting for response")
        res = await res_queue.get()
        debug_print("[write_responses_loop] got response: pda = {}, data = {}".format(res.pda, res.data))

        # TODO: outsource to a function?
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=True) as temp_file:
            temp_file_path = temp_file.name
            debug_print("[write_responses_loop] writing to file {}".format(temp_file_path))
            temp_file.write(f"{res.pda}\n{res.data}".encode())
            temp_file.flush()

            with open(temp_file_path, "r") as f:
                debug_print("[write_response_loop] file content = {}".format(f.read()))
        
            # TODO: outsource to a function?
            command = ["node", OFCS_CLIENT_PATH, temp_file_path]
            debug_print("[write_responses_loop] running {}".format(command))
            process = await asyncio.create_subprocess_exec(*command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            # Wait for the process to complete
            stdout, stderr = await process.communicate()
            debug_print("[write_responses_loop] stdout = {}".format(stdout.decode().strip()))
            debug_print("[write_responses_loop] stderr = {}".format(stderr.decode().strip()))
            
            output = stdout.decode().strip()
            debug_print("[write_responses_loop] node program output = {}".format(output))


async def main():
    await asyncio.gather(
        request_handler(),
        run_llm_loop(),
        write_responses_loop()
    )

asyncio.run(main())
