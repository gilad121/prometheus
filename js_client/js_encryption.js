const forge = require('node-forge');
const fs = require("fs");

module.exports = {
    generateKeyPair,
    encryptWithPublicKey,
    decryptWithPrivateKey
};

// required because of max lengths
const ENC_BLOCK_SZ = 190;
const DEC_BLOCK_SZ = 256;

function generateKeyPair() {
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

function encryptWithPublicKey(publicKey, message) {
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

function decryptWithPrivateKey(privateKey, encryptedBase64) {
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

async function main() {
  try {
    const publicKeyPem = fs.readFileSync('./server_encryption_keys/public_key.pem', 'utf8');
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    const privateKeyPem = fs.readFileSync('./server_encryption_keys/private_key.pem', 'utf8');
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

    // Your message to encrypt
    const message = 'Hi bitches!!!';

    const encryptedMessage = encryptWithPublicKey(publicKey, message);
    fs.writeFileSync('./server_encryption_keys/encrypted_message_test.txt', encryptedMessage);
    console.log('Encrypted Message:', encryptedMessage);

    const decryptedMessage = decryptWithPrivateKey(privateKey, encryptedMessage.toString());
    console.log('Decrypted Message:', decryptedMessage);
  } catch (error) {
    console.error('Error:', error);
  }
}

// main();
