import * as forge from 'node-forge';
import * as fs from 'fs';

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

// Function to encrypt a message using an RSA public key
// export function encryptWithPublicKey(publicKey: forge.pki.rsa.PublicKey, message: string): string {
//   const encrypted = publicKey.encrypt(forge.util.encodeUtf8(message), 'RSA-OAEP');
//   return forge.util.encode64(encrypted);
// }

export function encryptWithPublicKey(publicKey: forge.pki.rsa.PublicKey, message: string): string {
  const buffer = forge.util.createBuffer(message, 'utf8');
  const encrypted = publicKey.encrypt(buffer.getBytes(), 'RSA-OAEP', {
      md: forge.md.sha256.create()
  });
  return forge.util.encode64(encrypted);
}


// Function to decrypt a message using an RSA private key
// export function decryptWithPrivateKey(privateKey: forge.pki.rsa.PrivateKey, encryptedMessage: string): string {
//   const decrypted = privateKey.decrypt(forge.util.decode64(encryptedMessage), 'RSA-OAEP');
//   return forge.util.decodeUtf8(decrypted);
// }
export function decryptWithPrivateKey(privateKey: forge.pki.rsa.PrivateKey, encrypted: string): string {
  // const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const decrypted = privateKey.decrypt(forge.util.decode64(encrypted), 'RSA-OAEP', {
      md: forge.md.sha256.create()
  });
  return forge.util.decodeUtf8(decrypted);
}


// Main function to demonstrate RSA encryption and decryption
// Function to load the public key from a file
function loadPublicKeyFromFile(filePath: string): forge.pki.rsa.PublicKey {
  const publicKeyPem = fs.readFileSync(filePath, 'utf8');
  return forge.pki.publicKeyFromPem(publicKeyPem);
}

// Function to load the private key from a file
function loadPrivateKeyFromFile(filePath: string): forge.pki.rsa.PrivateKey {
  const privateKeyPem = fs.readFileSync(filePath, 'utf8');
  return forge.pki.privateKeyFromPem(privateKeyPem);
}


async function main() {
  try {
    // Generate RSA key pair
    // const { publicKey, privateKey } = await generateKeyPair();

    // Load the public key from file
    const publicKeyFilePath = '../offchain_server/encryption/public_key.pem';
    const publicKey = loadPublicKeyFromFile(publicKeyFilePath);

    const privateKeyFilePath = '../offchain_server/encryption/private_key.pem';
    const privateKey = loadPrivateKeyFromFile(privateKeyFilePath);

    // Your message to encrypt
    const message = 'they will fomo in';

    // Encrypt the message using the public key
    const encryptedMessage = encryptWithPublicKey(publicKey, message);
    console.log('Encrypted Message:', encryptedMessage);

    // Decrypt the message using the private key
    const decryptedMessage = decryptWithPrivateKey(privateKey, encryptedMessage);
    console.log('Decrypted Message:', decryptedMessage);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the main function
// main();
