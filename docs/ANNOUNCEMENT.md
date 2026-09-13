# Launch thread (draft, X)

Tone: plain, no promises of price, no "revolutionary". Every claim below is
something the code or the devnet run shows.

**1/**
We built a small Solana program that fixes one thing about launchpad coins:
the creator's allocation is a promise. escrow-distribution turns it into a
lock the creator cannot open, distributed to holders by rules anyone can
check. Open source, devnet today. 🧵

**2/**
At launch, the coin is created on pump.fun and the creator's first buy
happens in the same transaction. A share of that buy goes into a
program-owned escrow — at least 1% of supply. No withdraw instruction exists.
Not for the creator, not for us.

**3/**
Distributions are triggered by the market, not by a person: when trading
volume reaches 1% of market cap, 1% of the pool is released; when market cap
doubles, 5%. The release lands at a random moment within the next hour.
Anyone can call the trigger.

**4/**
Every eligible holder gets a pro-rata share — balance × time held, positions
under ~$20 excluded, no wallet above 10% of a round once there are 11+
holders. The allocation is a pure function of chain history: an open-source
indexer recomputes it, and only the Merkle root goes on chain.

**5/**
pump.fun's creator fee doesn't go to a wallet. It is split on pump itself:
90% to the escrow, where it is bought back into the coin in small slot-by-slot
pieces, 10% to the platform. That 10% is the platform's only income; it never
touches the locked pool.

**6/**
What we ran on devnet against the real pump.fun program: launch with a 25%
pool + 5% fixed team list, fee split, twelve buyers, one seller, buyback,
volume trigger, a pro-rata round, eleven claims. Every signature is in the
repo: [link to DEMO-devnet.md]

**7/**
It is a beta. Not audited yet; each coin can lock at most 50 SOL of value;
the platform can pause new launches but cannot pause claims or distributions.
The security review, the known limitations and our questions for an auditor
are public: [link to SECURITY_REVIEW.md]

**8/**
Code, tests, a local one-command demo, and the mainnet checklist:
[repo link]. If you run a launchpad on pump.fun and want a lock your holders
can verify, the program is MIT and generic — talk to us.
