from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
import base64
from consts import SERVER_PRIVKEY_FILE_PATH

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
    
    plaintext = private_key.decrypt(
            ciphertext,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
    # return plaintext.decode()
    return plaintext


def pkcs7_padding(data):
    """Apply PKCS#7 padding to data."""
    pad_len = 16 - len(data) % 16
    return data + bytes([pad_len] * pad_len)


def pkcs7_unpadding(data):
    """Remove PKCS#7 padding from data."""
    pad_len = data[-1]
    return data[:-pad_len]


def aes_encrypt(plaintext, key, iv):
    if isinstance(plaintext, str):
        plaintext = plaintext.encode('utf-8')
        
    plaintext_padded = pkcs7_padding(plaintext)
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(plaintext_padded) + encryptor.finalize()
    return base64.b64encode(ciphertext).decode('utf-8')


def aes_decrypt(ciphertext_base64, key, iv):
    ciphertext = base64.b64decode(ciphertext_base64)
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    padded_plaintext = decryptor.update(ciphertext) + decryptor.finalize()
    plaintext = pkcs7_unpadding(padded_plaintext)
    return plaintext.decode('utf-8')
