"""Verify all 3 PoI agents using the admin wallet."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from solana_client.client import AgentRegistryClient
from solders.pubkey import Pubkey
from anchorpy import Context

PROGRAM_ID = "EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38"
RPC_URL = "https://api.devnet.solana.com"
IDL_PATH = Path(__file__).parent.parent / "idl" / "agent_registry_legacy.json"
ADMIN_WALLET = Path(__file__).parent.parent.parent / "test-wallet.json"

AGENTS = [
    {"name": "PoI-Alpha", "id": 11, "owner": "3jC68KNMyfjTTMzS1dRnub6na2EA5mhtZdPJfBL8b7VY"},
    {"name": "PoI-Beta", "id": 9, "owner": "4YzDn99vjYmmuh4GHHeUB5iytkjBynVwkibup5FAWNzt"},
    {"name": "PoI-Gamma", "id": 10, "owner": "GJkX88UFeUa1uC5pnuxpYqPbjs6tDq9TbPn7BT9rg7P"},
]


async def main():
    client = AgentRegistryClient(
        rpc_url=RPC_URL,
        program_id=PROGRAM_ID,
        idl_path=IDL_PATH,
        wallet_path=ADMIN_WALLET,
    )
    await client.connect()

    registry = await client.get_registry_state()
    admin_pubkey = str(client.keypair.pubkey())
    print(f"Admin wallet: {admin_pubkey}")
    print(f"Registry admin: {registry['admin']}")
    assert admin_pubkey == registry["admin"], "Wallet is not the admin!"

    registry_pda, _ = client._get_registry_pda()

    for agent_info in AGENTS:
        name = agent_info["name"]
        agent_id = agent_info["id"]
        owner = Pubkey.from_string(agent_info["owner"])
        agent_pda, _ = client._get_agent_pda(owner, agent_id)

        try:
            agent = await client.get_agent(owner, agent_id)
            if agent["verified"]:
                print(f"  {name} (id={agent_id}) - Already verified")
                continue
        except Exception as e:
            print(f"  {name} (id={agent_id}) - Error fetching: {e}")
            continue

        try:
            tx = await client.program.rpc["verify_agent"](
                ctx=Context(
                    accounts={
                        "admin": client.keypair.pubkey(),
                        "registry": registry_pda,
                        "agent": agent_pda,
                    },
                    signers=[client.keypair],
                )
            )
            print(f"  {name} (id={agent_id}) - VERIFIED! tx={tx}")
        except Exception as e:
            print(f"  {name} (id={agent_id}) - Failed: {e}")

        await asyncio.sleep(2)

    await client.disconnect()
    print("\nDone!")


if __name__ == "__main__":
    asyncio.run(main())
