const {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
    TransactionInstruction,
    Keypair,
    sendAndConfirmTransaction,
  } = require("@solana/web3.js");
  const borsh = require("borsh");
  const fs = require("fs");
  // const path = require("path");
  // const { promisify } = require('util');
  // const process = require('process');
  const forge = require('node-forge');
  const { generateKeyPair, encryptWithPublicKey, decryptWithPrivateKey } = require("./js_encryption");
  const readline = require('readline'); 
  
// import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction, Keypair, sendAndConfirmTransaction } from "@solana/web3.js";
// import * as borsh from "borsh";
// import * as forge from 'node-forge';
// import { generateKeyPair, encryptWithPublicKey, decryptWithPrivateKey } from './encryption.js';

  module.exports = {
    sendMsg
  };

  const CHUNK_SZ = 100;
  
  // const severPemPublicKey = fs.readFileSync('server_encryption_keys/public_key.pem', 'utf8');
  const severPemPublicKey = `-----BEGIN PUBLIC KEY-----
  MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqzwM9vas52qI4JpGK38f
  yvLzboHJ/WXNdVGOfugUiYhS/ZsGXw5YhExgS3H/2OwsPDe4Zk7oLrZJJFQI2D+7
  inQaP43NUodU5o1UjdDsqKQVpwyYFdFf9XnNRJ+ZCRu6+qOxLn9Nm5+j6aajT18f
  mJIUEYIDZzYfMX1g0rnxhXYv+qS1VCHYwyiRzbWm+LvN0/Ot1+2dh/Gtc/A++FUT
  hGoyAQmt61U3OqUj/dDFWZcl7ksN9ZGoYB/P7jW6G+vce+bOEvHJKzoK2nutEH1l
  m4EtW5JGCcaQ+/TrhwSotESNVAn41k0e0Vrf/Gjz+A/UL1554QY5Y5Mwr7SggdPj
  CQIDAQAB
  -----END PUBLIC KEY-----`;
  const serverEncryptPubkey = forge.pki.publicKeyFromPem(severPemPublicKey);
  
  // const publicKeyPem = fs.readFileSync('client_encryption_keys/public_key.pem', 'utf8');
  const publicKeyPem = `-----BEGIN PUBLIC KEY-----
  MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2scHCjFOnYM0R6o8wEPq
  cg+0hiThgSOjTY8SbAKVEuuliV+NAmgI9JcGjlYTrhJcKef6UfYE0RHboYGinVWF
  hJPTdH0JyaQ0HlCNUYt1ieunDGE8VkqsT89p8fb5c/Ulxy9J1eUAW3JKxD3vdjHR
  iHq7temzMJkUef8L9Wyp5C3DVp6nfrPgkN2Kxg763bKFKLnLlOUwmoXqHMqKHHGs
  TR0TRuO/DynDr78qJ6wk9hc3IWiFneKVdaOkMlgh6XOMLXKtr/YQb45MIEXDKp/Y
  Z4N511mDoz2zYpIi/nUC5kIKxkxA09EghGgj7dSbMGuiXQCMzy5vyfjATs7YVhsZ
  kwIDAQAB
  -----END PUBLIC KEY-----`;
  const clientEncryptPubkey = forge.pki.publicKeyFromPem(publicKeyPem);
  
  // const privateKeyPem = fs.readFileSync('client_encryption_keys/private_key.pem', 'utf8');
  const privateKeyPem = `-----BEGIN PRIVATE KEY-----
  MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDaxwcKMU6dgzRH
  qjzAQ+pyD7SGJOGBI6NNjxJsApUS66WJX40CaAj0lwaOVhOuElwp5/pR9gTREduh
  gaKdVYWEk9N0fQnJpDQeUI1Ri3WJ66cMYTxWSqxPz2nx9vlz9SXHL0nV5QBbckrE
  Pe92MdGIeru16bMwmRR5/wv1bKnkLcNWnqd+s+CQ3YrGDvrdsoUoucuU5TCaheoc
  yooccaxNHRNG478PKcOvvyonrCT2FzchaIWd4pV1o6QyWCHpc4wtcq2v9hBvjkwg
  RcMqn9hng3nXWYOjPbNikiL+dQLmQgrGTEDT0SCEaCPt1Jswa6JdAIzPLm/J+MBO
  zthWGxmTAgMBAAECggEAC1ambcCxjgZJ/QRnUr1kIYSLhZxGKXNXfzemQRoifjEY
  iqeK+6ycaxjAPFgHtNuCEqJfwWDMMY2zfjSQGflf7jlpxHZVL6OYbMo6Zvq9OYTJ
  oFqD+M1fgChLNiSSVHPWq7n1zDrjjtm8G87sKPvpG8xzRH/7Z84pAaEruPBodFdv
  KbFH56EVUB2FpyS3BAMfK5o8/JpKV8Qkd9lyrRl1m3jo2i85fpbpiHQNNl39us5Y
  B68zpcd3rot7YD6foVF/JegO215FKeVSqfKNWb4GZB2w7zF8gSbnnQrvp1iwzU8I
  ps892KKTNz2keIA9PIpaN7la+mw8NAzOYxyU3gHmaQKBgQDhiSQnLJFxFkgl6yJZ
  3+OPRRmlJZkjSfWX7VuxR2UbGhAmru8/VdBkqta6ilNX3lIunjvMryL2xpsddoXB
  ymSkJk79V2qKe+nnsO6LlXiusRJrGoRQW59eZgt2fB//H/QgpWJiNi7fOkaF2Oil
  Vl1FIvPOKFbezIZbfuKrEaEPHwKBgQD4VDDT4UW2lIG28Sw6xIzOEoz0CELx1W4x
  rRT3PZpT4MyRHKKC/MIeVysfR6+A3eEs8Hgzq7GQ8tiUdHiaGA5TrUHUaoyJ0Q1k
  NqvCpOKu2SGHkLFQMM8bIYiOTl4U3fU7TDFQMQ1EaQ+GdHAfEAKu5+UHukE6/vZA
  NICszNkLDQKBgQCtowAKiO2Quy7gwp63wv9XlkOgOcokuRQz27H0Upssumwk3Bmm
  EVNXrY+UHlr8E1YCPiCb/VpV06IolM9123SQTE4UDfEgnTYAAuAk5vb6x6j+fHPR
  yjhwXPAGUJnxuZAicjHEmyKLCjqxYcX7RPqZ98bsuXHoJl5qos2wFuqA0QKBgC5U
  bsOo/Luim0zJVAomz2pG9bs1q1+5BRUJiKbT/G33u9K69+reQ00r0CTG2Ax/2Nns
  h1CEkN1NIXEZBcMiB9I+udBqjIvNz+TJemQXJR+f7OyA50Phx1H1gKekIVNdUbpd
  bbnbXPFNdJMOODjjYMzHAOjfK/pYxRKXeQZENZ4lAoGBAIkVSznXmze8GVVWZYaO
  Zv6axW8dYXNfKb8fdjahqjW/N2XSq4Hj9MftcFSNJdTErlxnugPbdEi5waHTmAGD
  S2OI8kBU6SEBpuZMoLOihOOwBFXTwaTKB+2uEF4paR8uw36dCjVS6KZFuuM3jkQG
  F7csTRoxfuCN1gPrG+q1qxqX
  -----END PRIVATE KEY-----`
  const clientEncryptPrivkey = forge.pki.privateKeyFromPem(privateKeyPem);
  
  const solanaConnection = new Connection("https://api.devnet.solana.com", "confirmed");
  const programId = new PublicKey("HXbL7syDgGn989Sffe7JNS92VSweeAJYgAoW3B8VdNej");
  
  const keypairPath = '/home/gk/.config/solana/client.json';
  const payer = loadKeypairFromFile(keypairPath);

  class ProMsg {
    constructor(fields) {
      if (fields) {
        this.data = fields.data;
      }
    }
  }
  
  ProMsg.schema = {
    struct: {
        data: 'string',
    }
  };
  
  class DataChunk {
    constructor(index, totalChunks, data) {
      this.index = index;
      this.totalChunks = totalChunks;
      this.size = data.length;
      this.data = data;
    }
  
    serialize() {
      const DataChunkSchema = {
        struct: {
            index: 'u32',
            totalChunks: 'u32',
            size: 'u32',
            data: { array: { type: 'u8' }}
        }
      };
      return Buffer.from(borsh.serialize(DataChunkSchema, this));
    }
  }

  function createProInstructionData(data) {
    // 0 - chunked request
    const variant = 0;
    const variantBuffer = Buffer.alloc(1);
    variantBuffer.writeInt8(variant);
    const buffer = Buffer.concat([variantBuffer, data]);
    return buffer;
  }  
  
  async function sendChunk(connection, chunk, programId, payer, pda) {    
    const serializedData = chunk.serialize();
    const insnData = createProInstructionData(serializedData);
  
    const writeMsgChunkInstruction = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: pda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: insnData,
    });
  
    const transaction = new Transaction().add(writeMsgChunkInstruction);
    await sendAndConfirmTransaction(connection, transaction, [payer]);
  }
  
  function splitToChunks(data, maxSize) {
    const chunks = [];
    for (let offset = 0; offset < data.length; offset += maxSize) {
      const chunkData = data.slice(offset, offset + maxSize);
      chunks.push(new DataChunk(chunks.length, Math.ceil(data.length / maxSize), chunkData));
    }
    return chunks;
  }
  
  function serializeData(data, clientEncryptPubkey) {
    data = "hi mate"
    const instructionData = new ProMsg({
      data: data
    });
  
    const serializedData = Buffer.from(borsh.serialize(ProMsg.schema, instructionData));
    console.log("serializedData: ", serializedData);
    const pemPublicKey = forge.pki.publicKeyToPem(clientEncryptPubkey);
    const publicKeyBuffer = Buffer.from(pemPublicKey);
  
    const publicKeySizeBuffer = Buffer.alloc(4);
    publicKeySizeBuffer.writeUInt32LE(publicKeyBuffer.length);
  
    const totalSize = 4 + publicKeyBuffer.length + serializedData.length;
    const totalSizeBuffer = Buffer.alloc(4);
    totalSizeBuffer.writeUInt32LE(totalSize);
  
    const buffer = Buffer.concat([totalSizeBuffer, publicKeySizeBuffer, publicKeyBuffer, serializedData]);
  
    return buffer;
  }

  async function sendMsg(msg) {    
    const [pda, bumpSeed] = await PublicKey.findProgramAddressSync(
      [payer.publicKey.toBuffer()],
      programId
    );
    
    const encryptedData = encryptWithPublicKey(serverEncryptPubkey, msg);
    const serializedData = serializeData(encryptedData, clientEncryptPubkey);
    const chunks = splitToChunks(serializedData, CHUNK_SZ);
  
    for (const chunk of chunks) {
        await sendChunk(solanaConnection, chunk, programId, payer, pda);
    }
  }
  
  
  async function readDataFromPDA(connection, payer, programId) {
    const [pda, bumpSeed] = await PublicKey.findProgramAddressSync(
        [payer.publicKey.toBuffer()],
        programId
    );
  
    const pdaAccountInfo = await connection.getAccountInfo(pda);
  
    if (pdaAccountInfo) {
      const pdaData = pdaAccountInfo.data;
      const msgLen = pdaData.readUInt32LE(0);
      const msgContent = pdaData.slice(4, 4 + msgLen);
      console.log("msgContent length: ", msgLen);
      const proMsg = borsh.deserialize(ProMsg.schema, msgContent);
      const decryptedData = decryptWithPrivateKey(clientEncryptPrivkey, proMsg.data);
      if (proMsg) {
        console.log("prometheus: ", decryptedData);
      } else {
        console.log("[readDataFromPDA] Failed to deserialize ProMsg");
      }
    } else {
      console.log("[readDataFromPDA] PDA account not found");
    }
  }
  
  
  function loadKeypairFromFile(filePath) {
    const secretKeyString = fs.readFileSync(filePath, { encoding: 'utf8' });
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString)); 
    return Keypair.fromSecretKey(secretKey);
  }
  
  async function subscribeToLogAndReadPDA(connection, payer, programId) {
    const [pda, bumpSeed] = await PublicKey.findProgramAddressSync(
      [payer.publicKey.toBuffer()],
      programId
    );
  
    const subscriptionId = connection.onLogs(pda, async (logs, context) => {
      const logMessage = `action:response pda:${pda.toBase58()}`;
      if (logs.logs.some(log => log.includes(logMessage))) {
        await readDataFromPDA(connection, payer, programId);
        await getMessageFromUser(connection, payer, programId);
      }
    }, 'confirmed');
  }
  
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  async function askForMessage() {
    return new Promise((resolve) => {
      rl.question('you: ', (message) => {
        resolve(message);
      });
    });
  }
  
  async function getMessageFromUser(connection, payer, programId) {
    const message = await askForMessage();
    if (message === 'exit') {
      process.exit(0);
    }
    await sendMsg(message);
  }

  
  // (async () => {
  //   console.log("severPemPublicKey: ", severPemPublicKey);
  //   const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  //   const programId = new PublicKey("HXbL7syDgGn989Sffe7JNS92VSweeAJYgAoW3B8VdNej");
  
  //   const keypairPath = '/home/gk/.config/solana/client.json';
  //   const payer = loadKeypairFromFile(keypairPath);
  //   console.log("payer: ", payer.publicKey.toBase58());
  
  //   await getMessageFromUser(connection, payer, programId);
  //   await subscribeToLogAndReadPDA(connection, payer, programId);
  
  // })();
  
serializeData("hi mate", clientEncryptPubkey);