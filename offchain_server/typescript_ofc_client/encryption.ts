import * as forge from 'node-forge';
import * as fs from 'fs';

// different because node-forge is fucker
const ENC_BLOCK_SZ = 190;
const DEC_BLOCK_SZ = 256;

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

// Blocks because size limitation
export function encryptWithPublicKey(publicKey: forge.pki.rsa.PublicKey, message: string): string {
  const buffer = forge.util.createBuffer(message, 'utf8').getBytes();
  let offset = 0;
  let encryptedBlocks = [];

  while (offset < buffer.length) {
    let chunkSize = Math.min(ENC_BLOCK_SZ, buffer.length - offset);
    let chunk = buffer.slice(offset, offset + chunkSize);

    let encryptedChunk = publicKey.encrypt(chunk, 'RSA-OAEP', {
      md: forge.md.sha256.create()
    });

    encryptedBlocks.push(encryptedChunk);
    offset += chunkSize;
  }

  let encryptedData = encryptedBlocks.join("");
  return forge.util.encode64(encryptedData);
}


export function decryptWithPrivateKey(privateKey: forge.pki.rsa.PrivateKey, encryptedBase64: string): string {
  const encryptedBytes = forge.util.decode64(encryptedBase64);

  let decryptedMessage = "";
  for (let start = 0; start < encryptedBytes.length; start += DEC_BLOCK_SZ) {
    const encryptedBlock = encryptedBytes.slice(start, start + DEC_BLOCK_SZ);
    
    const decryptedBlock = privateKey.decrypt(encryptedBlock, 'RSA-OAEP', {
      md: forge.md.sha256.create()
    });
    
    decryptedMessage += forge.util.decodeUtf8(decryptedBlock);
  }

  return decryptedMessage;
}


function loadPublicKeyFromFile(filePath: string): forge.pki.rsa.PublicKey {
  const publicKeyPem = fs.readFileSync(filePath, 'utf8');
  return forge.pki.publicKeyFromPem(publicKeyPem);
}


function loadPrivateKeyFromFile(filePath: string): forge.pki.rsa.PrivateKey {
  const privateKeyPem = fs.readFileSync(filePath, 'utf8');
  return forge.pki.privateKeyFromPem(privateKeyPem);
}


async function main() {
  try {
    // const { publicKey, privateKey } = await generateKeyPair();

    const publicKeyFilePath = '../offchain_server/encryption/public_key.pem';
    const publicKey = loadPublicKeyFromFile(publicKeyFilePath);

    const privateKeyFilePath = '../offchain_server/encryption/private_key.pem';
    const privateKey = loadPrivateKeyFromFile(privateKeyFilePath);

    const message = 'they will fomo in';

    const encryptedMessage = encryptWithPublicKey(publicKey, message);
    console.log('Encrypted Message:', encryptedMessage);

    const decryptedMessage = decryptWithPrivateKey(privateKey, encryptedMessage);
    console.log('Decrypted Message:', decryptedMessage);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// main();
