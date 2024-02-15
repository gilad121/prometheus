import asyncio
import subprocess
import tempfile
from openai import OpenAI
from consts import *

def debug_print(*args, **kwargs):
    if debug_mode:
        print(*args, **kwargs)

async def send_response(res):
    """
    Sends the response to the Solana program
    Creates a file, writes the pda address and data, runs the node client (file used for inputs)
    """
    with tempfile.NamedTemporaryFile(delete=True) as input_file:
        with tempfile.NamedTemporaryFile(delete=True) as key_file:
            # rsa TODO: encode? decode?
            key_file.write(res.key)
            key_file.flush()

            input_file.write(f"{res.addr}\n{key_file.name}\n{res.data}".encode())
            input_file.flush()

            await run_node_client(input_file.name)


async def run_node_client(file_path):
    """
    Runs the node client with the given file
    """
    command = ["node", OFCS_CLIENT_PATH, file_path]
    debug_print("[run_node_client] running {}".format(command))
    process = await asyncio.create_subprocess_exec(*command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    
    stdout, stderr = await process.communicate()
    debug_print("[run_node_client] stdout = {}".format(stdout.decode().strip()))
    debug_print("[run_node_client] stderr = {}".format(stderr.decode().strip()))


# TODO convert into a class?
def chat_with_gpt(prompt="", model="gpt-3.5-turbo", temperature=0.75, max_tokens=GPT_MAX_TOKENS):
    """
    Sends query to chatgpt through it's api
    """
    debug_print("[chat_with_gpt]")
    debug_print("prompt = {}".format(prompt))
    if prompt == "":
        raise ValueError("Empty prompt")
    client = OpenAI(api_key=GPT_API_KEY)
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


