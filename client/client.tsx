import {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
    TransactionInstruction,
    Keypair,
    sendAndConfirmTransaction,
  } from "@solana/web3.js";
import * as borsh from "borsh";
import * as fs from "fs";
import * as path from "path";
import { promisify } from 'util';
import process from 'process';
import * as forge from 'node-forge';
import { generateKeyPair, encryptWithPublicKey, decryptWithPrivateKey } from "./encryption";

const CHUNK_SZ = 100;

// const severPemPublicKey =
// `-----BEGIN PUBLIC KEY-----
// MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnxJ5ef8lo1RKfZfZL4D5
// FwxQzpHpgGvvH0vICj+CSjZRpr9OhzQfz983AXaDtW3h9dJQpFG4fDKTlkOppEYS
// C1rV9ctCMXfjCTPtB0aLZqQFJ0uUT/j+AsZEx5lx7dyvIYrXzaM3lC26wL+JK/y4
// 9KNUJOppeqKds6cwIF/wl/8u7IncyIUcNrvlGq+u5J549B75YCHZG8OIfMeErlIw
// q9mh68z6m69AgRG49esIW2SW61fvblGeXdGac108b/cef/poz2R/pa2OuXLbNKrW
// il2d+UgKkS9L9TOnRh2MMOj2fO/HDvjik20JP2deydu6kQeZIriv8oK8nd5lVq+8
// 0wIDAQAB
// -----END PUBLIC KEY-----`;
// const serverEncryptPubkey = forge.pki.publicKeyFromPem(severPemPublicKey)
const severPemPublicKey = fs.readFileSync('../offchain_server/server_encryption_keys/public_key.pem', 'utf8');
const serverEncryptPubkey = forge.pki.publicKeyFromPem(severPemPublicKey);

// should be imported from borsh but fails for some fucked reason
// type StructType = {
//   struct: {
//       [key: string]: borsh.Schema;
//   };
// };

/**
 * ProMsg (prometheus message) is a class that represents the message that is sent to the program
 * 
 * @class
 * @name ProMsg
 * @param {string} data
 * @returns {ProMsg}
 */
class ProMsg {
  data!: string;
  // static schema: Map<any, any> = new Map([
  //   [ProMsg, { kind: 'struct', fields: [['data', 'string']] }],
  // ]);
  static schema = {
    struct: {
        data: 'string',
    }
  };

  constructor(fields: { data: string }) {
    if (fields) {
      this.data = fields.data;
    }
  }
}


/**
 * DataChunk is a class that represents a chunk of data that is sent to the program
 * in multiple transactions.
 * 
 * @class
 * @name DataChunk
 * @param {number} index
 * @param {number} totalChunks
 * @param {Uint8Array} data
 * @returns {DataChunk}
 * @example
 * const chunk = new DataChunk(0, 2, new Uint8Array([1, 2, 3, 4]));
 * const serializedChunk = chunk.serialize();
 * console.log(serializedChunk);
 */
class DataChunk {
  index: number;
  totalChunks: number;
  size: number;
  data: Uint8Array;

  constructor(index: number, totalChunks: number, data: Uint8Array) {
    this.index = index;
    this.totalChunks = totalChunks;
    this.size = data.length;
    this.data = data;
  }

  /**
   * Serialize the DataChunk object into a Buffer
   * 
   * @function serialize
   * @returns {Buffer}
   */
  serialize(): Buffer {
    const DataChunkSchema = {
      struct: {
          index: 'u32',
          totalChunks: 'u32',
          size: 'u32',
          // data: 'u8[]',
          data: { array: { type: 'u8' }}
      }
      // [DataChunk, { kind: 'struct', fields: [['index', 'u32'], ['totalChunks', 'u32'], ['size', 'u32'], ['data', ['u8']]] }],
    };
    return Buffer.from(borsh.serialize(DataChunkSchema, this));
  }
}


/**
 * @function createProInstructionData
 * @param {Buffer} data
 * @returns {Buffer}
 * @example
 * const data = Buffer.from('hello world');
 * const proInstructionData = createProInstructionData(data);
 * console.log(proInstructionData);
 */
function createProInstructionData(data: Buffer): Buffer {
  // 0 - chunked request
  const variant = 0;
  const variantBuffer = Buffer.alloc(1);
  variantBuffer.writeInt8(variant);

  const buffer = Buffer.concat([variantBuffer, data]);

  return buffer;
}


/**
 * @function sendChunk
 * @param {Connection} connection - the connection to the solana cluster
 * @param {DataChunk} chunk
 * @param {PublicKey} programId - solana program id
 * @param {Keypair} payer
 * @param {PublicKey} pda
 * @returns {Promise<void>}
 * @example
 * const result = await sendChunk(connection, chunk, programId, payer, pda);
 */
async function sendChunk(connection: Connection, chunk: DataChunk, programId: PublicKey, payer: Keypair, pda: PublicKey) {    
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


/**
 * @function splitToChunks
 * @param {Uint8Array} data
 * @param {number} maxSize
 * @returns {DataChunk[]}
 */
function splitToChunks(data: Uint8Array, maxSize: number): DataChunk[] {
  const chunks: DataChunk[] = [];
  for (let offset = 0; offset < data.length; offset += maxSize) {
    const chunkData = data.slice(offset, offset + maxSize);
    chunks.push(new DataChunk(chunks.length, Math.ceil(data.length / maxSize), chunkData));
  }
  return chunks;
}


/**
 * @function serializeData
 * @param {string} data
 * @param {forge.pki.rsa.PublicKey} clientEncryptPubkey
 * @returns {Buffer} - | total size | key size | client public key | serialized data |
 */
function serializeData(data: string, clientEncryptPubkey: forge.pki.rsa.PublicKey): Buffer {
  // todo: move into more logical place to make this conversion
  console.log("data = ", data);
  // const binaryData = Uint8Array.from(Buffer.from(data, 'base64'));
  // const dataString = binaryData.toString();
  const instructionData = new ProMsg({
    data: data
  });

  console.log("4");
  console.log(instructionData);
  const serializedData = Buffer.from(borsh.serialize(ProMsg.schema, instructionData));
  console.log("5");

  const pemPublicKey = forge.pki.publicKeyToPem(clientEncryptPubkey);
  const publicKeyBuffer = Buffer.from(pemPublicKey);
  console.log("6");

  const publicKeySizeBuffer = Buffer.alloc(4);
  publicKeySizeBuffer.writeUInt32LE(publicKeyBuffer.length);
  console.log("7");

  const totalSize = 4 + publicKeyBuffer.length + serializedData.length;
  const totalSizeBuffer = Buffer.alloc(4);
  console.log("totalSize = ", totalSize);
  totalSizeBuffer.writeUInt32LE(totalSize);
  console.log("8");

  const buffer = Buffer.concat([totalSizeBuffer, publicKeySizeBuffer, publicKeyBuffer, serializedData]);

  return buffer;
}


/**
 * @function sendMsg
 * @param {Connection} connection
 * @param {Keypair} payer
 * @param {PublicKey} programId
 * @param {string} msg
 * @returns {Promise<void>}
 */
async function sendMsg(connection: Connection, payer: Keypair, programId: PublicKey,
  clientEncryptPubkey: forge.pki.rsa.PublicKey, msg: string): Promise<void> {    
  const [pda, bumpSeed] = await PublicKey.findProgramAddressSync(
    [payer.publicKey.toBuffer()],
    programId
  );
  console.log("2");
  const encryptedData = encryptWithPublicKey(serverEncryptPubkey, msg);
  console.log("encryptedData = ", encryptedData);
  const serializedData = serializeData(encryptedData, clientEncryptPubkey);
  console.log("serializedData = ", serializedData);
  console.log("nino 1");
  const chunks = splitToChunks(serializedData, CHUNK_SZ);

  for (const chunk of chunks) {
      await sendChunk(connection, chunk, programId, payer, pda);
  }
}


/**
 * @function readDataFromPDA
 * @returns {Promise<void>}
 */
async function readDataFromPDA(connection: Connection, payer: Keypair, programId: PublicKey,
  clientEncryptPrivkey: forge.pki.rsa.PrivateKey): Promise<void> {
  const [pda, bumpSeed] = await PublicKey.findProgramAddressSync(
      [payer.publicKey.toBuffer()],
      programId
  );

  const pdaAccountInfo = await connection.getAccountInfo(pda);

  if (pdaAccountInfo) {
    const pdaData = pdaAccountInfo.data;
    const msgLen = pdaData.readUInt32LE(0);
    const msgContentEnc = pdaData.slice(4, 4 + msgLen);
    const msgContent = decryptWithPrivateKey(clientEncryptPrivkey, msgContentEnc.toString());
    const msgContentBuffer = Buffer.from(msgContent, 'utf-8');
    const proMsg = borsh.deserialize(ProMsg.schema, msgContentBuffer) as ProMsg;
    if (proMsg) {
      console.log("[readDataFromPDA] msg data: ", proMsg.data);
    } else {
      console.log("[readDataFromPDA] Failed to deserialize ProMsg");
    }
  } else {
    console.log("[readDataFromPDA] PDA account not found");
  }
}


function loadKeypairFromFile(filePath: string): Keypair {
  const secretKeyString = fs.readFileSync(filePath, { encoding: 'utf8' });
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString)); 
  return Keypair.fromSecretKey(secretKey);
}


(async () => {
  const connection = new Connection("http://localhost:8899", "confirmed");
  const keypairPath = '/home/gk/.config/solana/test1.json';
  const payer = loadKeypairFromFile(keypairPath);

  const programId = new PublicKey("HXbL7syDgGn989Sffe7JNS92VSweeAJYgAoW3B8VdNej");

  // const { clientEncryptPubkey, clientEncryptPrivkey } = await generateKeyPair();
  // const clientEncryptKeypair = await generateKeyPair();
  const publicKeyPem = fs.readFileSync('client_encryption_keys/public_key.pem', 'utf8');
  const clientEncryptPubkey = forge.pki.publicKeyFromPem(publicKeyPem);

  const privateKeyPem = fs.readFileSync('client_encryption_keys/private_key.pem', 'utf8');
  const clientEncryptPrivkey = forge.pki.privateKeyFromPem(privateKeyPem);

  const args = process.argv.slice(2);
  const action = args[0];

  if (action === 'write') {
    console.log("1");
    const msg = "tell me shortly about greece"
    await sendMsg(connection, payer, programId, clientEncryptPubkey, msg);
  } else if (action === 'read') {
    await readDataFromPDA(connection, payer, programId, clientEncryptPrivkey);
  } else {
    console.log('Invalid action');
  }

})();
