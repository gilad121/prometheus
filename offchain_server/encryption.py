from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes
import base64

# rsa todo - make sure corresponds to tsx code

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
    # Load the private key from a PEM file
    with open(file_path, 'rb') as file:
        key_pem = file.read()
    return key_pem

# Function to load the private key from a file
# def load_private_key(file_path):
#     with open(file_path, "rb") as key_file:
#         private_key = serialization.load_pem_private_key(
#             key_file.read(),
#             password=None,
#             backend=default_backend()
#         )
#     return private_key

def decrypt_with_server_private_key(ciphertext):
    print("[decrypt_with_server_private_key] ciphertext len = {}".format(len(ciphertext)))
    print("[decrypt_with_server_private_key] ciphertext = {}".format(ciphertext))
    private_key_pem = load_key_from_file("server_encryption_keys/private_key.pem")
    ciphertext = base64.b64decode(ciphertext)
    private_key = serialization.load_pem_private_key(
        private_key_pem,
        password=None,
        backend=default_backend()
    )
    # message_bytes = ciphertext.encode('utf-8')  # Convert string to bytes
    # print("[decrypt_with_server_private_key] message_bytes = {}".format(message_bytes))
    # print("[decrypt_with_server_private_key] len(message_bytes) = {}".format(type(message_bytes)))
    
    plaintext = private_key.decrypt(
        ciphertext,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    print("[decrypt_with_server_private_key] plaintext = {}".format(plaintext))
    return plaintext.decode()

# Function to load the public key from a file
# def load_public_key(file_path):
#     with open(file_path, "rb") as key_file:
#         public_key = serialization.load_pem_public_key(
#             key_file.read(),
#             backend=default_backend()
#         )
#     return public_key

# Function to encrypt a message with the public key
def encrypt_with_public_key(public_key_pem, message):
    public_key = serialization.load_pem_public_key(
        public_key_pem,
        backend=default_backend()
    )
    ciphertext = public_key.encrypt(
        message,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    ciphertext = base64.b64encode(ciphertext)
    return ciphertext


# with open("server_encryption_keys/encrypted_message_test.txt", "r") as f:
#     enc = f.read()
#     print("enc = {}".format(enc))
#     print("enc len = {}".format(len(enc)))
#     dec = decrypt_with_server_private_key(enc)
#     print("dec = {}".format(dec))


# if __name__ == "__main__":
#     with open("encrypted_message_test.txt", "r") as f:
#         enc = f.read()
#         print("enc text = {}".format(enc))
#     dec = decrypt_with_server_private_key(enc)
#     print("dec = {}".format(dec))
    

# Example usage
# def main():
#     # Load your keys (adjust the file paths to your keys)
#     private_key = load_private_key("path/to/your_private_key.pem")
#     public_key = load_public_key("path/to/your_public_key.pem")

#     # Example encrypted message from the client
#     encrypted_message_from_client = "BASE64_ENCODED_ENCRYPTED_MESSAGE_HERE"
    
#     # Decrypt the message received from the client
#     decrypted_message = decrypt_with_private_key(private_key, encrypted_message_from_client)
#     print(f"Decrypted message: {decrypted_message}")

#     # Encrypt a response or message to send to the client
#     message_to_client = "Hello from Python server!"
#     encrypted_message_to_client = encrypt_with_public_key(public_key, message_to_client)
#     print(f"Encrypted message to client: {encrypted_message_to_client}")
