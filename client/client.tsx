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

  
  // Define the structure of the ProMsg as per the Rust program
  class ProMsg {
    data! : string;
    constructor(fields: { data: string }) {
      if (fields) {
        this.data = fields.data;
      }
    }
  }
  
  // Define the schema for serialization
  const ProMsgSchema = new Map([
    [ProMsg, { kind: 'struct', fields: [['data', 'string']] }],
  ]);
  
  // Define the instruction data according to the Rust program's expected format
  function createProInstructionData(data: string): Buffer {
    const instructionData = new ProMsg({
      data
    });

    // print instructionData content
    console.log("1 data: ", data);

    // 0 = client message (request)
    const variant = 0;
    const variantBuffer = Buffer.alloc(1);
    variantBuffer.writeInt8(variant);

    const instructionDataBuffer = Buffer.from(borsh.serialize(ProMsgSchema, instructionData));
    console.log("1 instructionDataBuffer: ", instructionDataBuffer);

    const buffer = Buffer.concat([variantBuffer, instructionDataBuffer]);

    return buffer;
  }
  
  // Main function to log the mood
  async function writeMsg(connection: Connection, payer: Keypair, programId: PublicKey, msg: string): Promise<void> {  
    // Create the instruction data
    const instructionData = createProInstructionData(msg);
    console.log("msg: ", msg);
    console.log("instructionData: ", instructionData);
    console.log("instructionData length: ", instructionData.length);
  
    // Find the PDA associated with the mood account
    const [pda, bumpSeed] = await PublicKey.findProgramAddressSync(
    [payer.publicKey.toBuffer()],
    programId
    );
  
    // Create the transaction instruction
    const writeMsgInstruction = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: pda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: instructionData, // Data serialized in Borsh
    });
  
    // Create the transaction
    const transaction = new Transaction().add(writeMsgInstruction);
  
    // Sign and send the transaction
    await sendAndConfirmTransaction(connection, transaction, [payer]);
  }

  // Read the data from the PDA and print to the screen
  async function readDataFromPDA(connection: Connection, payer: Keypair, programId: PublicKey): Promise<void> {
    // Find the PDA associated with the mood account
    const [pda, bumpSeed] = await PublicKey.findProgramAddressSync(
        [payer.publicKey.toBuffer()],
        programId
    );

    console.log("pda: ", pda.toBase58());
    // Get the account info of the mood PDA
    const pdaAccountInfo = await connection.getAccountInfo(pda);

    if (pdaAccountInfo) {
        const pdaData = pdaAccountInfo.data;
        console.log("PdaAccountInfo: ", pdaData);

        const msgLen = pdaData[0];
        const is_request = pdaData[1];
        const msgContent = pdaData.slice(2, 2 + msgLen);

        console.log("msg len: ", msgLen);
        console.log("is_request: ", is_request);
        console.log("msg content: ", msgContent);

        const proMsg = borsh.deserialize(ProMsgSchema, ProMsg, msgContent);
        console.log("nino 2");
        console.log("msg data: ", proMsg.data);
    } else {
        console.log("PDA account not found");
    }
}

  function loadKeypairFromFile(filePath: string): Keypair {
    const secretKeyString = fs.readFileSync(filePath, { encoding: 'utf8' });
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    // log keypair
    console.log('secretKey');
    // print secret key as string of bytes in ascii
    console.log(secretKey.toString());
    console.log();
    // print hexadecimal letters representation of secretKey
    return Keypair.fromSecretKey(secretKey);
  }
  
  // Example usage
  (async () => {
    // Connect to the cluster
    const connection = new Connection("http://localhost:8899", "confirmed");
    // const keypairPath = '/home/gk/.config/solana/id.json';
    const keypairPath = '/home/gk/.config/solana/client_id.json';
    const payer = loadKeypairFromFile(keypairPath);

    // Program ID as per your Solana program
    const programId = new PublicKey("HXbL7syDgGn989Sffe7JNS92VSweeAJYgAoW3B8VdNej");
  
    await writeMsg(connection, payer, programId, "how are you mate?");

    console.log("before sleep");
    const sleep = promisify(setTimeout);
    await sleep(10000);
    console.log("after sleep");

    await readDataFromPDA(connection, payer, programId);
  })();
