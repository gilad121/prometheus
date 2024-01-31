import asyncio
import websockets
import json
import re
import tempfile
import subprocess
from openai import AsyncOpenAI, OpenAI

PROGRAM_ID = "HXbL7syDgGn989Sffe7JNS92VSweeAJYgAoW3B8VdNej"
OFCS_CLIENT_PATH = "typescript_ofc_client/ofcs_client.js"

class Event:
    def __init__(self, pda: str, data: str):
        self.pda = pda
        self.data = data

# define async queue
req_queue = asyncio.Queue()
res_queue = asyncio.Queue()


API_KEY = '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'
# gpt_client = AsyncOpenAI(api_key=API_KEY)


# async def chat_with_gpt(prompt="Tell me a short funny story", model="gpt-3.5-turbo", temperature=0.75, max_tokens=100):
#     print("chat_with_gpt")
#     try:
#         chat_completion = await gpt_client.chat.completions.create(
#             messages=[
#                 {
#                     "role": "user",
#                     "content": prompt,
#                 }
#             ],
#             model=model,
#             temperature=temperature,
#             max_tokens=max_tokens,
#         )
#         print("[chat_with_gpt] chat_completion.choices[0].message.content = {}".format(chat_completion.choices[0].message.content))
#         return chat_completion.choices[0].message.content
#     except Exception as e:
#         # return str(e)
#         return "fucked"


def chat_with_gpt(prompt="Tell me a joke", model="gpt-3.5-turbo", temperature=0.75, max_tokens=100):
    print("chat_with_gpt")
    try:
        client = OpenAI(api_key=API_KEY)
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
        print("[chat_with_gpt] chat_completion.choices[0].message.content = {}".format(chat_completion.choices[0].message.content))
        return chat_completion.choices[0].message.content
    except Exception as e:
        # return str(e)
        return "fucked"


# async def subscribe_to_program_logs(program_id,
#                                     rpc_url="wss://muddy-twilight-asphalt.solana-devnet.quiknode.pro/7a968c5d6d32fde5ae3cdc4af11606e129d0debb/"):
async def read_requests_loop(rpc_url="ws://127.0.0.1:8900"):
    print("read_requests_loop")
    async with websockets.connect(rpc_url) as websocket:
        # Subscribe to the program
        subscribe_message = {
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
        await websocket.send(json.dumps(subscribe_message))

        while True:
            print("[read_requests_loop] Waiting for logs...")
            response = await websocket.recv()
            print(f"[read_requests_loop] Received event")
            response_data = json.loads(response)
            if "params" in response_data and "result" in response_data["params"]:
                await process_log(response_data)


async def process_log(data):
    print("process_log")
    with open("log.txt", "a") as f:
        f.write(f"{data['params']['result']}\n")

    with open("nino.json", "a") as f:
        json.dump(data, f)
        f.write("\n")

    req = await get_request_from_json(data)
    if req is not None:
        print("[process_log] pda = {}, data = {}", req.pda, req.data)
        # add req to async queue of requests to be processed
        await req_queue.put(req)


# TODO: make this more efficient, first filtering out the logs of the whole json (so we wouldn't need to search over the whole json)
async def get_request_from_json_str_search(data):
    # find a way to do it and obtain data no matter what it contains (e.g. spaces)
    print("get_request_from_json")
    match = re.search(r'action:request pda:(\w+) data:(\w+)', str(data))
    if match:
        pda = match.group(1)
        data = match.group(2)
        print("[get_request_from_json] pda = {}, data = {}".format(pda, data))
        return Event(pda, data)
    else:
        print("no match :()")
        return None
    
async def get_request_from_json(data):
    print("get_request_from_json")
    logs = data['params']['result']['value']['logs']
    for log in logs:
        if "action:request" in log:
            print("[get_request_from_json] log = {}".format(log))
            # Program log: action:request pda:<pda> data:<data>
            pda = log[log.index("pda:") + len("pda:"):].split()[0]
            data = log[log.index("data:") + len("data:"):]
            print("[get_request_from_json] pda = {}, data = {}".format(pda, data))
            return Event(pda, data)
    return None


async def run_llm(req):
    print("run_llm")
    print("[run_llm] req.data = {}".format(req.data))
    # TODO: run llm with data

    # Run the sync function in a separate thread - required? (TODO)
    output = await asyncio.get_running_loop().run_in_executor(None, chat_with_gpt, req.data)
    # output = chat_with_gpt(req.data)
    print("[run_llm] output = {}".format(output))
    # output = req.data + " (mfucker)"
    res = Event(req.pda, output)
    # add response to async queue of responses to be sent
    print("[run_llm] adding response to queue, pda = {}, data = {}".format(res.pda, res.data))
    await res_queue.put(res)


async def run_llm_loop():
    print("run_llm_loop")
    while True:
        # wait for a new request to be added to the queue
        print("[run_llm_loop] waiting for request from queue")
        req = await req_queue.get()
        print("[run_llm_loop] got request: pda = {}, data = {}", req.pda, req.data)
        await run_llm(req)


async def write_responses_loop():
    print("write_responses_loop")
    while True:
        print("[write_response_loop] waiting for response from queue")
        res = await res_queue.get()
        print("[write_responses_loop] got response from res_queue")
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=True) as temp_file:
            temp_file_path = temp_file.name
            print("[write_responses_loop] writing to file {}".format(temp_file_path))
            temp_file.write(f"{res.pda}\n{res.data}".encode())
            temp_file.flush()

            # print to the screen the content of temp_file
            with open(temp_file_path, "r") as f:
                print("[write_response_loop] file content = {}".format(f.read()))
        
            command = ["node", OFCS_CLIENT_PATH, temp_file_path]
            print("[write_responses_loop] running {}".format(command))
            process = await asyncio.create_subprocess_exec(*command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            # Wait for the process to complete
            stdout, stderr = await process.communicate()
            print("[write_responses_loop] stdout = {}", stdout.decode().strip())
            
            # Get the output from the Node.js program
            output = stdout.decode().strip()
            print("[write_responses_loop] node program output = {}".format(output))


async def main():
    await asyncio.gather(
        read_requests_loop(),
        run_llm_loop(),
        write_responses_loop()
    )

# where to put await and where not?

# Start the process
asyncio.run(main())


# TODO:
# make sure async really is async
# make efficient
# exceptions
# organize code
# delete prints
# subfunctions
# classes
# beautify

# mongodb for conversation history? save context?