//! Errors for MIDI enumeration and input connections.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum MidiError {
    #[error("MIDI initialization failed")]
    Init(#[from] midir::InitError),

    #[error("MIDI port not found")]
    PortNotFound,

    #[error("connect to MIDI port failed: {0}")]
    Connect(String),

    #[error("MIDI listener mutex poisoned")]
    LockPoisoned,
}
