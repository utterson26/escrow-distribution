//! Typed pump accounts that survive layout drift.
//!
//! pump appends fields to `BondingCurve` / `Global` over time and never
//! resizes existing accounts, so an account written before a field existed is
//! shorter than the current IDL says. `declare_program!`'s raw types fail on
//! those. This is the pattern pump's own `pump_rust_client::AccountWrapper`
//! uses: zero-pad a short buffer to the current serialized size before
//! deserializing, so missing trailing fields read as `0` / `false` /
//! `Pubkey::default()` — exactly what the docs say they mean. Longer buffers
//! (an IDL older than the deployed program) already worked: borsh ignores
//! trailing bytes.
//!
//! We keep our own copy instead of depending on the crate because its bundled
//! IDL lags the public docs (0.1.13 has no `is_holder_reward` yet).

use std::io::Write;
use std::ops::{Deref, DerefMut};

use anchor_lang::prelude::*;
use anchor_lang::{AccountDeserialize, AccountSerialize, Discriminator, Owner};

use crate::pump;

#[derive(Clone, Debug, Default)]
#[repr(transparent)]
pub struct Padded<T>(pub T);

impl<T> Deref for Padded<T> {
    type Target = T;
    fn deref(&self) -> &T {
        &self.0
    }
}

impl<T> DerefMut for Padded<T> {
    fn deref_mut(&mut self) -> &mut T {
        &mut self.0
    }
}

impl<T: Discriminator> Discriminator for Padded<T> {
    const DISCRIMINATOR: &'static [u8] = T::DISCRIMINATOR;
}

impl<T: Owner> Owner for Padded<T> {
    fn owner() -> Pubkey {
        T::owner()
    }
}

impl<T: AccountSerialize> AccountSerialize for Padded<T> {
    fn try_serialize<W: Write>(&self, writer: &mut W) -> Result<()> {
        self.0.try_serialize(writer)
    }
}

impl<T> AccountDeserialize for Padded<T>
where
    T: AccountDeserialize + AccountSerialize + Default,
{
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
        Self::padded(buf, T::try_deserialize)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
        Self::padded(buf, T::try_deserialize_unchecked)
    }
}

impl<T: AccountSerialize + Default> Padded<T> {
    fn padded(buf: &mut &[u8], inner: fn(&mut &[u8]) -> Result<T>) -> Result<Self> {
        let mut canonical = Vec::new();
        T::default().try_serialize(&mut canonical)?;
        let expected = canonical.len();
        if buf.len() >= expected {
            return inner(buf).map(Self);
        }
        let mut padded = vec![0u8; expected];
        padded[..buf.len()].copy_from_slice(buf);
        let mut slice: &[u8] = &padded;
        let value = inner(&mut slice)?;
        *buf = &buf[buf.len()..];
        Ok(Self(value))
    }
}

#[cfg(feature = "idl-build")]
impl<T> anchor_lang::IdlBuild for Padded<T> {}

pub type BondingCurve = Padded<pump::accounts::BondingCurve>;
pub type Global = Padded<pump::accounts::Global>;

#[cfg(test)]
mod tests {
    use super::*;

    fn curve() -> pump::accounts::BondingCurve {
        pump::accounts::BondingCurve {
            virtual_token_reserves: 1_073_000_000_000_000,
            virtual_quote_reserves: 30_000_000_000,
            real_token_reserves: 793_100_000_000_000,
            real_quote_reserves: 0,
            token_total_supply: 1_000_000_000_000_000,
            complete: false,
            creator: Pubkey::new_unique(),
            is_mayhem_mode: false,
            is_cashback_coin: false,
            quote_mint: Pubkey::default(),
            creator_fee_bps: 0,
            can_edit_creator_fee: false,
            is_holder_reward: true,
        }
    }

    fn bytes(c: &pump::accounts::BondingCurve) -> Vec<u8> {
        let mut v = Vec::new();
        c.try_serialize(&mut v).unwrap();
        v
    }

    #[test]
    fn full_layout_round_trips() {
        let c = curve();
        let v = bytes(&c);
        assert_eq!(v.len(), 8 + 117, "current BondingCurve is 117 bytes + discriminator");
        let got = BondingCurve::try_deserialize(&mut v.as_slice()).unwrap();
        assert_eq!(got.virtual_quote_reserves, c.virtual_quote_reserves);
        assert_eq!(got.creator, c.creator);
        assert!(got.is_holder_reward);
    }

    #[test]
    fn pre_holder_reward_account_pads_to_false() {
        // A 124-byte curve: written before `is_holder_reward` existed (what devnet
        // and the localnet clone produce today).
        let c = curve();
        let mut v = bytes(&c);
        v.truncate(124);
        let got = BondingCurve::try_deserialize(&mut v.as_slice()).unwrap();
        assert_eq!(got.virtual_token_reserves, c.virtual_token_reserves);
        assert_eq!(got.quote_mint, Pubkey::default());
        assert!(!got.is_holder_reward, "missing trailing field reads as false");
    }

    #[test]
    fn pre_creator_fee_account_pads_to_zero() {
        // 115 bytes: creator / mayhem / cashback / quote_mint, nothing after.
        let c = curve();
        let mut v = bytes(&c);
        v.truncate(115);
        let got = BondingCurve::try_deserialize(&mut v.as_slice()).unwrap();
        assert_eq!(got.creator, c.creator);
        assert_eq!(got.creator_fee_bps, 0);
        assert!(!got.can_edit_creator_fee);
        assert!(!got.is_holder_reward);
    }

    #[test]
    fn longer_than_idl_still_reads() {
        // The deployed program may be ahead of our IDL: trailing bytes are ignored.
        let c = curve();
        let mut v = bytes(&c);
        v.extend_from_slice(&[7u8; 40]);
        let got = BondingCurve::try_deserialize(&mut v.as_slice()).unwrap();
        assert_eq!(got.real_token_reserves, c.real_token_reserves);
    }

    #[test]
    fn wrong_discriminator_is_rejected() {
        let mut v = bytes(&curve());
        v[0] ^= 0xff;
        assert!(BondingCurve::try_deserialize(&mut v.as_slice()).is_err());
    }

    #[test]
    fn global_pads_too() {
        let g = pump::accounts::Global::default();
        let mut v = Vec::new();
        g.try_serialize(&mut v).unwrap();
        let full = v.len();
        v.truncate(full - 33); // before holder_reward_claim_authority + is_holder_reward_enabled
        let got = Global::try_deserialize(&mut v.as_slice()).unwrap();
        assert_eq!(got.holder_reward_claim_authority, Pubkey::default());
        assert!(!got.is_holder_reward_enabled);
    }
}
