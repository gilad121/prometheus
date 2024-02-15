from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes
import base64

DEC_BLOCK_SZ = 256
SERVER_PRIVKEY_FILE_PATH = "server_encryption_keys/private_key.pem"

def generate_keys():
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )
    public_key = private_key.public_key()

    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )

    pem_public = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )

    return pem_private, pem_public


def load_key_from_file(file_path):
    with open(file_path, 'rb') as file:
        key_pem = file.read()
    return key_pem


def decrypt_with_server_private_key(ciphertext):
    private_key_pem = load_key_from_file(SERVER_PRIVKEY_FILE_PATH)
    ciphertext = base64.b64decode(ciphertext)
    private_key = serialization.load_pem_private_key(
        private_key_pem,
        password=None,
        backend=default_backend()
    )

    plaintext = b""

    for i in range(0, len(ciphertext), DEC_BLOCK_SZ):
        block = ciphertext[i:i + DEC_BLOCK_SZ]
        
        decrypted_block = private_key.decrypt(
            block,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        
        plaintext += decrypted_block

    return plaintext.decode()

# TODO: if used, make blocks implementation consistent with decrypt_with_server_private_key
# def encrypt_with_public_key(public_key_pem, message):
#     public_key = serialization.load_pem_public_key(
#         public_key_pem,
#         backend=default_backend()
#     )
#     ciphertext = public_key.encrypt(
#         message,
#         padding.OAEP(
#             mgf=padding.MGF1(algorithm=hashes.SHA256()),
#             algorithm=hashes.SHA256(),
#             label=None
#         )
#     )
#     ciphertext = base64.b64encode(ciphertext)
#     return ciphertext
