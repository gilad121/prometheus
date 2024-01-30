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

    // 0 = server message (response)
    const variant = 1;
    const variantBuffer = Buffer.alloc(1);
    variantBuffer.writeInt8(variant);

    const instructionDataBuffer = Buffer.from(borsh.serialize(ProMsgSchema, instructionData));
    console.log("1 instructionDataBuffer: ", instructionDataBuffer);

    const buffer = Buffer.concat([variantBuffer, instructionDataBuffer]);

    return buffer;
  }
  
  // Main function to log the mood
  async function writeMsg(connection: Connection, payer: Keypair, programId: PublicKey, pda: PublicKey, msg: string): Promise<void> {  
    // Create the instruction data
    const instructionData = createProInstructionData(msg);
    console.log("instructionData: ", instructionData);
    console.log("instructionData length: ", instructionData.length);

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
  async function readDataFromPDA(connection: Connection, payer: Keypair, programId: PublicKey, pda: PublicKey): Promise<void> {
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

// Read all events happening under a specific Solana program
async function readAllEvents(connection: Connection, programId: PublicKey): Promise<Event[]> {
  // Find the program's accounts
  const programAccounts = await connection.getProgramAccounts(programId);
  // print programAccounts
  console.log("programAccounts: ", programAccounts);

  // // // Filter the accounts to only include events
  // // const eventAccounts = programAccounts.filter((account) => {
  // //   // Check if the account data represents an event
  // //   // Replace this condition with your own logic to identify event accounts
  // //   return account.data.length > 0;
  // // });

  // // Retrieve the event data for each account
  // const events: Event[] = [];
  // for (const account of eventAccounts) {
  //   const eventData = account.data;
  //   // Parse the event data and create an Event object
  //   const event: Event = parseEventData(eventData);
  //   events.push(event);
  // }

  // return events;
  // return empty Promise
  return new Promise<Event[]>(resolve => resolve([]));
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
      const fileContent = fs.readFileSync(filePath, 'utf8').split('\n');
      const pda = new PublicKey(fileContent[0]);
      const data = fileContent[1];

      console.log("pda: ", pda.toBase58());
      console.log("data: ", data);
      await writeMsg(connection, payer, programId, pda, data);
    } else {
      console.log("Usage: node ofcs_client.js <path to file>");
      process.exit(1);
    }
    // await readDataFromPDA(connection, payer, programId, pda);
    // await readAllEvents(connection, programId);
  })();
