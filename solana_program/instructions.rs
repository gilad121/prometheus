use solana_program::{program_error::ProgramError, msg};
use borsh::{BorshSerialize, BorshDeserialize};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct DataChunk {
    pub index: u32,
    pub total_chunks: u32,
    pub size: u32,
    pub data: Vec<u8>,
}

pub enum ProInstruction {
    // WriteRequest {
    //     data: String
    // },
    // WriteResponse {
    //     data: String
    // },
    WriteRequestChunk {
        data: DataChunk
    }
}

#[derive(BorshDeserialize, Debug)]
struct ProInstructionPayload {
    data: DataChunk,
}

impl ProInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        msg!("[ProInstruction::unpack], input: {:?}", input);
        let (variant, rest) = input.split_first().ok_or(ProgramError::InvalidInstructionData)?;
        msg!("[ProInstruction::unpack] variant: {:?}", variant);
        msg!("[ProInstruction::unpack] rest: {:?}", rest);
        let payload = ProInstructionPayload::try_from_slice(rest).unwrap();
        msg!("payload: {:?}", payload);

        Ok(match variant {
            // 0 => Self::WriteRequest {
            //     data: payload.data,
            // },
            // 1 => Self::WriteResponse {
            //     data: payload.data,
            // },
            2 => Self::WriteRequestChunk {
                data: payload.data,

            },
            _ => return Err(ProgramError::InvalidInstructionData),
        })
    }
}