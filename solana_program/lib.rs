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
use crate::instructions::DataChunk;

declare_id!("HXbL7syDgGn989Sffe7JNS92VSweeAJYgAoW3B8VdNej");

const MAX_CHUNK_SZ: usize = 900;
const PDA_ACCOUNT_SZ: usize = 5 * 1024;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
struct ProMsg {
    data: String
}

entrypoint!(process_instruction);

fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("[process_instruction]");
    let instruction = ProInstruction::unpack(instruction_data)?;
    match instruction {
        ProInstruction::WriteRequestChunk { data }  => {
            write_request_chunk(program_id, accounts, data)?;
        }
        ProInstruction::WriteResponseChunk { data }  => {
            write_response_chunk(program_id, accounts, data)?;
        }
    }
    Ok(())
}

fn write_request_chunk(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    chunk: DataChunk,
) -> ProgramResult {
    process_chunk(program_id, accounts, &chunk, true)?;
    if chunk.index == (chunk.total_chunks - 1) {
        msg!("action:request pda:{}", accounts[1].key);
    }
    Ok(())
}

fn write_response_chunk(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    chunk: DataChunk,
) -> ProgramResult {
    process_chunk(program_id, accounts, &chunk, false)?;
    if chunk.index == (chunk.total_chunks - 1) {
        msg!("action:response pda:{}", accounts[1].key);
    }
    Ok(())
}

fn process_chunk(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    chunk: &DataChunk,
    is_request: bool,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let client_account = next_account_info(account_info_iter)?;
    let pda_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    if !client_account.is_signer {
        msg!("Error: client account is not signer");
        return Err(ProgramError::MissingRequiredSignature);
    }

    if chunk.size > MAX_CHUNK_SZ as u32 {
        msg!("Error: chunk size must not exceed {}", MAX_CHUNK_SZ);
        return Err(ProgramError::InvalidAccountData);
    }

    // pda doesn't exist
    if pda_account.owner != program_id {
        if is_request {
            create_pda_account(accounts, program_id)?;
        } else {
            msg!("Error: can't write response to a non-existant pda <{:?}>", pda_account.key);
            return Err(ProgramError::InvalidAccountData);
        }
    }

    let offset = chunk.index * MAX_CHUNK_SZ as u32;
    if (pda_account.data_len() as u32) < offset + chunk.size {
        msg!("Error: account data too small");
        return Err(ProgramError::AccountDataTooSmall);
    }

    pda_account.try_borrow_mut_data()?[offset as usize..(offset + chunk.size) as usize]
        .copy_from_slice(&chunk.data);

    Ok(())
}

fn create_pda_account(
    accounts: &[AccountInfo],
    program_id: &Pubkey,
) -> ProgramResult {
    // TODO: operation duplication (done in `process_chunk` also, passing each separately creates lifetime problems)
    let account_info_iter = &mut accounts.iter();
    let client_account = next_account_info(account_info_iter)?;
    let pda_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    let (pda, bump_seed) = Pubkey::find_program_address(&[client_account.key.as_ref()], program_id);
    if pda != *pda_account.key {
        msg!("[create_pda_account] Error: pda does not match client (key)");
        return Err(ProgramError::InvalidArgument);
    }

    let account_len: usize = PDA_ACCOUNT_SZ;
    let rent = Rent::get()?;
    let rent_lamports = rent.minimum_balance(account_len);

    invoke_signed(
        &system_instruction::create_account(
            client_account.key,
            pda_account.key,
            rent_lamports,
            account_len.try_into().unwrap(),
            program_id,
        ),
        &[client_account.clone(), pda_account.clone(), system_program.clone()],
        &[&[client_account.key.as_ref(), &[bump_seed]]],
    )?;

    msg!("[create_pda_account] PDA created: {}", pda);

    Ok(())
}
