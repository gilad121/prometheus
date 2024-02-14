import * as forge from 'node-forge';

// Function to generate an RSA key pair
export function generateKeyPair(): Promise<forge.pki.rsa.KeyPair> {
  return new Promise((resolve, reject) => {
    forge.pki.rsa.generateKeyPair({ bits: 2048, workers: -1 }, (err, keypair) => {
      if (err) {
        reject(err);
      } else {
        resolve(keypair);
      }
    });
  });
}

// // Function to encrypt a message using an RSA public key
// export function encryptWithPublicKey(publicKey: forge.pki.rsa.PublicKey, message: string): string {
//   const encrypted = publicKey.encrypt(forge.util.encodeUtf8(message), 'RSA-OAEP');
//   return forge.util.encode64(encrypted);
// }

// export function encryptWithPublicKey(publicKey: forge.pki.rsa.PublicKey, message: Buffer): Uint8Array {
export function encryptWithPublicKey(publicKey: forge.pki.rsa.PublicKey, message: string): string {
  const buffer = forge.util.createBuffer(message, 'utf8');
  const encrypted = publicKey.encrypt(buffer.getBytes(), 'RSA-OAEP', {
      md: forge.md.sha256.create()
  });
  return forge.util.encode64(encrypted);
  // return new Uint8Array(Buffer.from(encrypted));
  // return encrypted;
}

// Function to decrypt a message using an RSA private key
// export function decryptWithPrivateKey(privateKey: forge.pki.rsa.PrivateKey, encryptedMessage: string): string {
//   const decrypted = privateKey.decrypt(forge.util.decode64(encryptedMessage), 'RSA-OAEP');
//   return forge.util.decodeUtf8(decrypted);
// }

export function decryptWithPrivateKey(privateKey: forge.pki.rsa.PrivateKey, encrypted: string): string {
  const decrypted = privateKey.decrypt(forge.util.decode64(encrypted), 'RSA-OAEP', {
  // const decrypted = privateKey.decrypt(encrypted, 'RSA-OAEP', {
      md: forge.md.sha256.create()
  });
  return forge.util.decodeUtf8(decrypted);
}

import * as fs from "fs";

// Main function to demonstrate RSA encryption and decryption
async function main() {
  try {
    // Generate RSA key pair
    // const { publicKey, privateKey } = await generateKeyPair();
    // load public key from file pubkey.pem
    const publicKeyPem = fs.readFileSync('../offchain_server/server_encryption_keys/public_key.pem', 'utf8');
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    const privateKeyPem = fs.readFileSync('../offchain_server/server_encryption_keys/private_key.pem', 'utf8');
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

    // write code to save keypair to file
    // const publicKeyPem = forge.pki.publicKeyToPem(publicKey);
    // const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
    // console.log('Public Key:', publicKeyPem);
    // console.log('Private Key:', privateKeyPem);

    // save publicKeyPem to file named client_pubkey_test.pem
    // fs.writeFileSync('client_pubkey_test.pem', publicKeyPem);
    // fs.writeFileSync('client_privkey_test.pem', privateKeyPem);

    // Your message to encrypt
    const message = 'Hi bitches!!!';
    // const messageBuffer = Buffer.from(message, 'utf-8');

    // Encrypt the message using the public key
    const encryptedMessage = encryptWithPublicKey(publicKey, message);
    fs.writeFileSync('../offchain_server/server_encryption_keys/encrypted_message_test.txt', encryptedMessage);
    console.log('Encrypted Message:', encryptedMessage);

    // Decrypt the message using the private key
    const decryptedMessage = decryptWithPrivateKey(privateKey, encryptedMessage.toString());
    console.log('Decrypted Message:', decryptedMessage);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the main function
// main();
