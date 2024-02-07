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

  const CHUNK_SZ = 100; // Define CHUNK_SZ as const
  
  class ProMsg {
    data!: string;
    static schema: Map<any, any> = new Map([
      [ProMsg, { kind: 'struct', fields: [['data', 'string']] }],
    ]);

    constructor(fields: { data: string }) {
      if (fields) {
        this.data = fields.data;
      }
    }
  }

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
  
      serialize(): Buffer {
        const DataChunkSchema = new Map([
          [DataChunk, { kind: 'struct', fields: [['index', 'u32'], ['totalChunks', 'u32'], ['size', 'u32'], ['data', ['u8']]] }],
        ]);
        // console.log("[DataChunk.serialize] this: ", this);
        return Buffer.from(borsh.serialize(DataChunkSchema, this));
      }
  }
  

  async function sendChunk(connection: Connection, chunk: DataChunk, programId: PublicKey, payer: Keypair, pda: PublicKey) {
    // console.log("[sendChunk] chunk: ", chunk);

    const serializedData = chunk.serialize();

    // console.log("[sendChunk] serializedData: ", serializedData);
    const insnData = createProInstructionData(serializedData);
    // console.log("[sendChunk] insnData: ", insnData);

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

    // console.log("[sendChunk] transaction: ", transaction);
    console.log("[sendChunk] sending transaction");
    await sendAndConfirmTransaction(connection, transaction, [payer]);
    console.log("[sendChunk] transaction sent");
  }


  function splitIntoChunks(data: Uint8Array, maxSize: number): DataChunk[] {
    // console.log("[splitIntoChunks] data: ", data);
    const chunks: DataChunk[] = [];
    for (let offset = 0; offset < data.length; offset += maxSize) {
      // console.log("[splitIntoChunks] offset: ", offset);
      const chunkData = data.slice(offset, offset + maxSize);
      // console.log("[splitIntoChunks] chunkData: ", chunkData);
      chunks.push(new DataChunk(chunks.length, Math.ceil(data.length / maxSize), chunkData));
      // console.log("[splitIntoChunks] chunks: ", chunks);
    }
    return chunks;
  }


  function createProInstructionData(data: Buffer): Buffer {
    // print instructionData content
    console.log("[createProInstructionData]");
    // console.log("[createProInstructionData] data: ", data);

    // 3 - chunked response
    const variant = 3;
    const variantBuffer = Buffer.alloc(1);
    variantBuffer.writeInt8(variant);

    const buffer = Buffer.concat([variantBuffer, data]);

    return buffer;
  }


  function serializeData(data: string): Buffer {
    const instructionData = new ProMsg({
      data: data
    });

    // print instructionData content
    // console.log("[serializeData] data: ", data);

    // commented for testing purposes
    const serializedData = Buffer.from(borsh.serialize(ProMsg.schema, instructionData));
    // const serializedData = Buffer.from(data);
    // console.log("[serializeData] serialized data: ", serializedData);

    // TODO: change to Int32
    const size = serializedData.length;
    const sizeBuffer = Buffer.alloc(4);
    sizeBuffer.writeUInt32LE(size);
    // console.log("[serializeData] serialized size: ", size);

    const buffer = Buffer.concat([sizeBuffer, serializedData]);

    return buffer;
  }
  

  async function sendMsg(connection: Connection, payer: Keypair, programId: PublicKey, pda: PublicKey, msg: string, ): Promise<void> {  
    console.log("[sendMsg]");

    const serializedData = serializeData(msg);
    const chunks = splitIntoChunks(serializedData, CHUNK_SZ);

    for (const chunk of chunks) {
        await sendChunk(connection, chunk, programId, payer, pda);
    }
  }


  async function readDataFromPDA(connection: Connection, payer: Keypair, programId: PublicKey): Promise<void> {
    const [pda, bumpSeed] = await PublicKey.findProgramAddressSync(
        [payer.publicKey.toBuffer()],
        programId
    );

    console.log("[readDataFromPDA] pda: ", pda.toBase58());
    const pdaAccountInfo = await connection.getAccountInfo(pda);

    if (pdaAccountInfo) {
        const pdaData = pdaAccountInfo.data;
        console.log("[readDataFromPDA] PdaAccountInfo: ", pdaData);

        const msgLen = pdaData.readUInt32LE(0);
        console.log("[readDataFromPDA] msg len: ", msgLen);
        // const is_request = pdaData[1];
        const msgContent = pdaData.slice(4, 4 + msgLen);
        console.log("[readDataFromPDA] msg content: ", msgContent);

        // console.log("[readDataFromPDA] msg len: ", msgLen);
        // console.log("[readDataFromPDA] is_request: ", is_request);
        // console.log("[readDataFromPDA] msg content: ", msgContent);

        const proMsg = borsh.deserialize(ProMsg.schema, ProMsg, msgContent);
        console.log("[readDataFromPDA] msg data: ", proMsg.data);
    } else {
        console.log("[readDataFromPDA] PDA account not found");
    }
  }

  function loadKeypairFromFile(filePath: string): Keypair {
    const secretKeyString = fs.readFileSync(filePath, { encoding: 'utf8' });
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    return Keypair.fromSecretKey(secretKey);
  }



  function getFileContent(filePath: string): string[] {
    const fileContent = fs.readFileSync(filePath, 'utf8').split('\n');
    const firstLine = fileContent.shift() || '';
    return [firstLine, fileContent.join('\n')];
  }
  

  (async () => {
    // Connect to the cluster
    const connection = new Connection("http://localhost:8899", "confirmed");
    const keypairPath = '/home/gk/.config/solana/ofcs_id.json';
    const payer = loadKeypairFromFile(keypairPath);

    // Program ID as per your Solana program
    const programId = new PublicKey("HXbL7syDgGn989Sffe7JNS92VSweeAJYgAoW3B8VdNej");

    if (process.argv.length >= 3) {
      // Read the file path from command line argument
      const filePath = process.argv[2];
      const fileContent = getFileContent(filePath);
      const pda = new PublicKey(fileContent[0]);
      const data = fileContent[1];

      console.log("pda: ", pda.toBase58());
      console.log("data: ", data);
      await sendMsg(connection, payer, programId, pda, data);
    } else {
      console.log("Usage: node ofcs_client.js <path to file>");
      process.exit(1);
    }
    // await readDataFromPDA(connection, payer, programId, pda);
    // await readAllEvents(connection, programId);
  })();


