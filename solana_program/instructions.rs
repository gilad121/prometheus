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
    WriteRequestChunk {
        data: DataChunk
    },
    WriteResponseChunk {
        data: DataChunk
    }
}

#[derive(BorshDeserialize, Debug)]
struct ProInstructionPayload {
    data: DataChunk,
}

impl ProInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (variant, rest) = input.split_first().ok_or(ProgramError::InvalidInstructionData)?;
        let payload = ProInstructionPayload::try_from_slice(rest).unwrap();

        Ok(match variant {
            0 => Self::WriteRequestChunk {
                data: payload.data,

            },
            1 => Self::WriteResponseChunk {
                data: payload.data,

            },
            _ => return Err(ProgramError::InvalidInstructionData),
        })
    }
}
