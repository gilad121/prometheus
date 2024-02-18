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
import { promises as fsPromises } from 'fs';
import { generateKeyPair, encryptWithPublicKey, decryptWithPrivateKey } from "./encryption";


const CHUNK_SZ = 100;

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
          data: { array: { type: 'u8' }}
      }
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
  // 1 - chunked response
  const variant = 1;
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
 * @returns {Buffer} - | size (uint32le) | serializedData |
 */
function serializeData(data: string): Buffer {
  const instructionData = new ProMsg({
    data: data
  });

  const serializedData = Buffer.from(borsh.serialize(ProMsg.schema, instructionData));
  const size = serializedData.length;
  const sizeBuffer = Buffer.alloc(4);
  sizeBuffer.writeUInt32LE(size);
  const buffer = Buffer.concat([sizeBuffer, serializedData]);

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
async function sendMsg(connection: Connection, payer: Keypair, programId: PublicKey, pda: PublicKey, encryptionPubkey: forge.pki.rsa.PublicKey, msg: string): Promise<void> {    
  const encryptedData = encryptWithPublicKey(encryptionPubkey, msg);
  const serializedData = serializeData(encryptedData);
  const chunks = splitToChunks(serializedData, CHUNK_SZ);

  for (const chunk of chunks) {
      await sendChunk(connection, chunk, programId, payer, pda);
  }
}


function loadKeypairFromFile(filePath: string): Keypair {
  const secretKeyString = fs.readFileSync(filePath, { encoding: 'utf8' });
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString)); 
  return Keypair.fromSecretKey(secretKey);
}


/**
 * Input file content - <pda>\n<keyfile>\n<data>
 * @function parseInputFile
 * @param {string} filePath
 * @returns {string[]}
 */
function parseInputFile(filePath: string): string[] {
  const fileContent = fs.readFileSync(filePath, 'utf8').split('\n');
  
  // Extract the <pda> and <key> by removing the first two lines
  const pda = fileContent.shift() || '';
  const key = fileContent.shift() || '';
  
  // The rest of the fileContent array is the <data>, join it back into a single string
  const data = fileContent.join('\n');
  
  return [pda, key, data];
}


async function readPublicKeyFromPemFile(filePath: string): Promise<forge.pki.rsa.PublicKey> {
    const pemContent = await fsPromises.readFile(filePath, { encoding: 'utf8' });
    const publicKey = forge.pki.publicKeyFromPem(pemContent);
    return publicKey;
}


(async () => {
  const connection = new Connection("http://localhost:8899", "confirmed");
  const keypairPath = '/home/gk/.config/solana/ofcs_id.json';
  const payer = loadKeypairFromFile(keypairPath);

  const programId = new PublicKey("HXbL7syDgGn989Sffe7JNS92VSweeAJYgAoW3B8VdNej");

  // file content - <pda>\n<keyfile>\n<data>
  if (process.argv.length >= 3) {
    const filePath = process.argv[2];
    const fileContent = parseInputFile(filePath);
    const pda = new PublicKey(fileContent[0]);
    
    const encryptionPubkey = await readPublicKeyFromPemFile(fileContent[1]);

    const data = fileContent[2];

    console.log("pda: ", pda.toBase58());
    console.log("data: ", data);
    await sendMsg(connection, payer, programId, pda, encryptionPubkey, data);
  } else {
    console.log("Usage: node ofcs_client.js <path to file>");
    process.exit(1);
  }
})();


