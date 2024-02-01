use solana_program::{
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    msg,
    account_info::{next_account_info, AccountInfo},
    system_instruction,
    sysvar::{rent::Rent, Sysvar},
    program::{invoke_signed},
    declare_id,
    program_error::ProgramError,
    borsh::try_from_slice_unchecked,
};
use borsh::{BorshDeserialize, BorshSerialize};
pub mod instructions;
use instructions::ProInstruction;

// Declare program_id as a Pubkey and assign the correct value
declare_id!("HXbL7syDgGn989Sffe7JNS92VSweeAJYgAoW3B8VdNej");

const MAX_MSG_DATA_SZ: usize = 400;
const MAX_CHUNK_SZ: usize = 400;
// fails for 10kb, should probably created using standalone instruction (also would be more expensive)
// const PDA_ACCOUNT_SZ: usize = 10 * 1024;
const PDA_ACCOUNT_SZ: usize = 5 * 1024;

// pda - | size | is_request | msg               |
//       | 1    | 1          | MAX_MSG_DATA_SZ   |

#[derive(BorshSerialize, BorshDeserialize, Debug)]
struct ProMsg {
    data: String
}

// #[derive(BorshSerialize, BorshDeserialize, Debug)]
// pub struct DataChunk {
//     pub index: u32,
//     pub total_chunks: u32,
//     pub size: u32,
//     pub data: Vec<u8>,
// }
use crate::instructions::DataChunk;

entrypoint!(process_instruction);

fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("[process_instruction]");
    let instruction = ProInstruction::unpack(instruction_data)?;
    match instruction {
        // ProInstruction::WriteRequest { data }  => {
        //     write_request(program_id, accounts, data)?;
        // }
        // ProInstruction::WriteResponse { data }  => {
        //     write_response(program_id, accounts, data)?;
        // }
        ProInstruction::WriteRequestChunk { data }  => {
            write_request_chunk(program_id, accounts, data)?;
        }
    }
    Ok(())
}

pub fn write_request(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    msg_data: String,
) -> ProgramResult {
    msg!("write_request");
    msg!("msg_data");
    msg!(&msg_data.to_string());
    // print msg_data as byte array
    msg!("msg_data_bytes: {:?}", msg_data.as_bytes());

    let account_info_iter = &mut accounts.iter();
    let client_account = next_account_info(account_info_iter)?;
    let pda_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    if !client_account.is_signer {
        msg!("Error: client_account is not signer");
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (pda, bump_seed) = Pubkey::find_program_address(&[client_account.key.as_ref(),], program_id);
    if pda != *pda_account.key {
        msg!("Error: pda does not match client (key)");
        return Err(ProgramError::InvalidArgument);
    }

    if msg_data.len() > MAX_MSG_DATA_SZ {
        msg!("Error: msg len must not exceed {}", MAX_MSG_DATA_SZ);
        return Err(ProgramError::InvalidAccountData);
    }

    // elegant way to check of pda exists
    if pda_account.owner != program_id {
        msg!("Creating PDA");
        // let account_len: usize = 1 + 1 + (4 + MAX_MSG_DATA_SZ);
        let account_len: usize = PDA_ACCOUNT_SZ;
        let rent = Rent::get()?;
        msg!("rent: {:?}", rent);
        let rent_lamports = rent.minimum_balance(account_len);
        msg!("rent_lamports: {:?}", rent_lamports);

        invoke_signed(
            // instruction
            &system_instruction::create_account(
                client_account.key,
                pda_account.key,
                rent_lamports,
                account_len.try_into().unwrap(),
                program_id,
            ),
            // account_infos
            &[client_account.clone(), pda_account.clone(), system_program.clone()],
            // signers_seeds
            &[&[client_account.key.as_ref(), &[bump_seed]]],
        )?;
    
        msg!("PDA created: {}", pda);
    
    } else {
        msg!("PDA already exists: {}", pda);
    }
 
    // this section can be optimized, minimize operations
    let mut pda_data_ref = pda_account.data.borrow_mut();
    let pda_data_content = ProMsg { data: msg_data };

    let serialized_data_length = pda_data_content.try_to_vec().unwrap().len();
    msg!("msg_data: {}, length = {}", pda_data_content.data, serialized_data_length);

    pda_data_ref[0] = serialized_data_length as u8;

    // is_request (Actually can part of the ProMsg struct)
    pda_data_ref[1] = 1;
        
    pda_data_content.serialize(&mut &mut pda_data_ref[2..])?;
    msg!("pda_data_ref: {:?}", pda_data_ref);

    msg!("action:request pda:{} data:{}", pda_account.key, pda_data_content.data);

    Ok(())

}

pub fn write_response(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    msg_data: String,
) -> ProgramResult {
    msg!("write_response");
    msg!("msg_data: {}", msg_data);
    // print msg_data as byte array
    msg!("msg_data_bytes: {:?}", msg_data.as_bytes());

    let account_info_iter = &mut accounts.iter();
    let client_account = next_account_info(account_info_iter)?;
    let pda_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    if !client_account.is_signer {
        msg!("Error: client_account is not signer");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // validate client_account is write allowed (in the list of allowed server accounts)

    if msg_data.len() > MAX_MSG_DATA_SZ {
        msg!("Error: msg len must not exceed {}", MAX_MSG_DATA_SZ);
        return Err(ProgramError::InvalidAccountData);
    }

    if pda_account.owner != program_id {
        msg!("pda does not exist");
        // print pda
        msg!("pda: {:?}", pda_account.key);
    } else {
        msg!("pda exists: {}", pda_account.key);
    }
 
    msg!("2");

    let mut pda_data_ref = pda_account.data.borrow_mut();
    let pda_data_content = ProMsg { data: msg_data };

    let serialized_data_length = pda_data_content.try_to_vec().unwrap().len();
    msg!("msg_data: {}, length = {}", pda_data_content.data, serialized_data_length);

    pda_data_ref[0] = serialized_data_length as u8;

    // is_request (Actually can part of the ProMsg struct)
    pda_data_ref[1] = 1;
        
    pda_data_content.serialize(&mut &mut pda_data_ref[2..])?;
    msg!("pda_data_ref: {:?}", pda_data_ref);

    Ok(())

}


// TODO: split into functions
pub fn write_request_chunk(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    chunk: DataChunk,
) -> ProgramResult {
    msg!("[write_request_chunk]");
    msg!("[write_request_chunk] chunk: {:?}", chunk);

    let account_info_iter = &mut accounts.iter();
    let client_account = next_account_info(account_info_iter)?;
    let pda_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    if !client_account.is_signer {
        msg!("[write_request_chunk] Error: client_account is not signer");
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (pda, bump_seed) = Pubkey::find_program_address(&[client_account.key.as_ref(),], program_id);
    if pda != *pda_account.key {
        msg!("[write_request_chunk] Error: pda does not match client (key)");
        return Err(ProgramError::InvalidArgument);
    }

    if chunk.size > MAX_CHUNK_SZ as u32 {
        msg!("[write_request_chunk] Error: chunk size must not exceed {}", MAX_CHUNK_SZ);
        return Err(ProgramError::InvalidAccountData);
    }

    // elegant way to check if pda exists
    if pda_account.owner != program_id {
        msg!("[write_request_chunk] Creating PDA");
        // let account_len: usize = 1 + 1 + (4 + MAX_MSG_DATA_SZ);
        let account_len: usize = PDA_ACCOUNT_SZ;
        let rent = Rent::get()?;
        msg!("[write_request_chunk] rent: {:?}", rent);
        let rent_lamports = rent.minimum_balance(account_len);
        msg!("[write_request_chunk] rent_lamports: {:?}", rent_lamports);

        invoke_signed(
            // instruction
            &system_instruction::create_account(
                client_account.key,
                pda_account.key,
                rent_lamports,
                account_len.try_into().unwrap(),
                program_id,
            ),
            // account_infos
            &[client_account.clone(), pda_account.clone(), system_program.clone()],
            // signers_seeds
            &[&[client_account.key.as_ref(), &[bump_seed]]],
        )?;
    
        msg!("[write_request_chunk] PDA created: {}", pda);
    
    } else {
        msg!("[write_request_chunk] PDA already exists: {}", pda);
    }


    // let chunk = DataChunk::try_from_slice(insn_data)
    // .map_err(|_| ProgramError::InvalidInstructionData)?;

    let offset = chunk.index * MAX_CHUNK_SZ as u32;
    if (pda_account.data_len() as u32) < offset + chunk.size {
        msg!("[write_request_chunk] Error: account data too small ({})", pda_account.data_len());
        return Err(ProgramError::AccountDataTooSmall);
    }
    // Write chunk data to the account's data buffer at the calculated offset
    // chunk is part of the serialized data (serialization doesnt seem to be required)
    pda_account.try_borrow_mut_data()?[offset as usize..(offset + chunk.size) as usize]
    .copy_from_slice(&chunk.data);

    // last chunk
    // can we assume it will be ordered? (last chunk will be the last one?)
    if chunk.index == (chunk.total_chunks - 1) {
        msg!("action:request pda:{}", pda_account.key);

    }

    Ok(())
}

/*
TODO:
1. fix problem
    'Program HXbL7syDgGn989Sffe7JNS92VSweeAJYgAoW3B8VdNej consumed 200000 of 200000 compute units',
    'Program HXbL7syDgGn989Sffe7JNS92VSweeAJYgAoW3B8VdNej failed: exceeded CUs meter at BPF instruction'
2. How to handle large requests and responses? seems like currently we fail to create pda with size larger than 400 bytes

so we have (1) problem with too much compute units and (2) problem with too much data
- check for inefficiencies
- batching?

or just change the limits of size and compute and pay more? check


while account max size is 10mb,
maximum permitted size of a reallocation in an inner instruction is 10kb
and in our case we create the pda through calling invoke_signed (cpi)
hence if we want to allocate more than 10kb - we should call it directly (only from client?)

create separate request and handler (in program) type for new user register? that only creates the pda

solana maximum transaction size is 1232 bytes
    - can batch this shit in 1Ks (message data will be splitted)


TODO: reallocate PDA for each request/response? (total chunks size)
*/